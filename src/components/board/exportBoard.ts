import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";
import { waitForFonts } from "@/lib/fonts";
import type { PageId } from "./board.types";

// Each page renders at a FIXED intrinsic size (1600×2000, 4:5 portrait) so the
// exported set is a run of uniform, gallery-ready posters. The fixed height is
// the export height — pages are sized to fit their frame, not to grow.
export const BOARD_W = 1600;
export const BOARD_H = 2000;
const EXPORT_SCALE = 2;

// A transparent 1×1 PNG. html-to-image has to FETCH every image to copy its
// pixels, and a host that doesn't send Access-Control-Allow-Origin blocks that
// (the image still displays on screen — only copying is refused). Without a
// placeholder, one blocked image (e.g. a signature headshot linked from another
// site) rejects the whole capture and Save fails. With it, that image comes out
// blank in the snapshot and everything else still saves.
const BLANK_IMAGE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

/**
 * Count the linked images inside these pages whose host refuses cross-site
 * copying, so the caller can say "N images couldn't be included" instead of
 * letting a blank spot surprise anyone. Same-origin and data: images are skipped.
 */
export async function countBlockedImages(nodes: HTMLElement[]): Promise<number> {
  const urls = new Set<string>();
  for (const node of nodes) {
    node.querySelectorAll("img").forEach((img) => {
      const src = img.currentSrc || img.src;
      if (!/^https?:/i.test(src)) return;
      if (new URL(src).origin === window.location.origin) return;
      urls.add(src);
    });
  }
  const results = await Promise.all(
    [...urls].map((url) =>
      fetch(url, { mode: "cors" }).then(
        (r) => !r.ok,
        () => true,
      ),
    ),
  );
  return results.filter(Boolean).length;
}

/**
 * Rasterize one page node to a PNG data URL at export resolution. The page is a
 * fixed 1600×2000 poster, snapshotted at that exact size so every page in the
 * set matches.
 */
export async function pageToPngDataUrl(
  node: HTMLElement,
  fontFamilies: string[],
): Promise<string> {
  // Make sure the chosen faces are painted before we snapshot, or the raster
  // captures a fallback font.
  await waitForFonts(fontFamilies);

  return toPng(node, {
    width: BOARD_W,
    height: BOARD_H,
    pixelRatio: EXPORT_SCALE,
    cacheBust: true,
    imagePlaceholder: BLANK_IMAGE,
    // Neutralize any inherited transform so the snapshot is 1:1 at full size
    // regardless of how the preview wrapper scales it on screen.
    style: {
      transform: "none",
      transformOrigin: "top left",
      margin: "0",
    },
  });
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [head, body] = dataUrl.split(",");
  const mime = head.match(/:(.*?);/)?.[1] ?? "image/png";
  const bin = atob(body);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return new Blob([buf], { type: mime });
}

export async function pageToPngBlob(
  node: HTMLElement,
  fontFamilies: string[],
): Promise<Blob> {
  return dataUrlToBlob(await pageToPngDataUrl(node, fontFamilies));
}

/**
 * Rasterize a set of page nodes to PNG blobs — one per page. The caller names
 * and downloads each (e.g. kit-01-foundation.png). Rendered sequentially so a
 * heavy board doesn't fire N simultaneous rasterizations.
 */
export async function pagesToPngBlobs(
  nodes: HTMLElement[],
  fontFamilies: string[],
): Promise<Blob[]> {
  const out: Blob[] = [];
  for (const node of nodes) {
    out.push(await pageToPngBlob(node, fontFamilies));
  }
  return out;
}

/**
 * Freeze the board's OWN pages into base64 PNG strings, keyed by PageId — the
 * self-inclusion capture. This is the exact same rasterization the PNG download
 * uses (pageToPngDataUrl), just stored into the kit instead of downloaded, so
 * Brand Board's designed pages ride inside the one .brand-kit.json (and File
 * Builder, which can't draw, finds finished pictures to drop in the zip).
 *
 * Runs sequentially and AWAITS every page, so the caller can trust that when
 * this resolves, all captures are fully developed — the "wait for the photos"
 * step that keeps Save from writing blank pages. `onProgress` reports which page
 * (1-based) just finished, for a visible step tracker.
 */
export async function freezePageRenders(
  entries: { page: PageId; node: HTMLElement }[],
  fontFamilies: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<Partial<Record<PageId, string>>> {
  const out: Partial<Record<PageId, string>> = {};
  for (let i = 0; i < entries.length; i++) {
    const { page, node } = entries[i];
    out[page] = await pageToPngDataUrl(node, fontFamilies);
    onProgress?.(i + 1, entries.length);
  }
  return out;
}

/**
 * Assemble a multi-page PDF — one board page per PDF page — so a client gets the
 * whole kit as one hand-off document. Every page is the same fixed proportion,
 * full-bleed, no margins, matching the PNGs exactly.
 */
export async function pagesToPdfBlob(
  nodes: HTMLElement[],
  fontFamilies: string[],
): Promise<Blob> {
  const pngs: string[] = [];
  for (const node of nodes) pngs.push(await pageToPngDataUrl(node, fontFamilies));
  return assemblePdfFromPngs(pngs);
}

/**
 * Build the combined multi-page PDF from page PNG data URLs that were ALREADY
 * captured (e.g. the Save-time freeze) — so the PDF costs no second rasterization
 * and is guaranteed to match the baked PNGs pixel-for-pixel. Returns it as a
 * clean base64 data URL for baking into the kit file (self-inclusion). Empty in →
 * null, so a board with no pages doesn't carry an empty PDF.
 */
export async function pngsToPdfDataUrl(pngDataUrls: string[]): Promise<string | null> {
  if (pngDataUrls.length === 0) return null;
  return blobToDataUrl(assemblePdfFromPngs(pngDataUrls));
}

/** Shared PDF assembly: one page-picture per PDF page, full-bleed, no margins. */
function assemblePdfFromPngs(pngDataUrls: string[]): Blob {
  const pdfW = 612;
  const pdfH = (BOARD_H / BOARD_W) * pdfW;
  const doc = new jsPDF({ unit: "pt", format: [pdfW, pdfH], orientation: "portrait" });
  for (let i = 0; i < pngDataUrls.length; i++) {
    if (i > 0) doc.addPage([pdfW, pdfH], "portrait");
    doc.addImage(pngDataUrls[i], "PNG", 0, 0, pdfW, pdfH, undefined, "FAST");
  }
  return doc.output("blob");
}

/**
 * Blob → data URL via the browser's FileReader. This is the clean way to get a
 * PDF data URL (mirrors Palette Studio's exporter): jsPDF's own datauristring
 * injects a non-standard `;filename=generated.pdf` segment that strict parsers
 * reject, but FileReader always yields a standard `data:<mime>;base64,...`.
 */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
