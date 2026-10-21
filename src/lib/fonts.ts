// Brand Board fonts — now derived from the shared font library (single
// source of truth). See `src/lib/shared-fonts.ts` (vendored from `_shared/fonts/`)
// and the family-wide spec `FONTS_AND_PAIRING.md`.
//
// The board still holds two font FAMILY STRINGS (`headingFont` / `bodyFont`) so
// its renderer, its serialized project files, and the frozen interop payload keep
// working unchanged. On top of that it now stores the library `fontPairingId`
// (see board.types.ts) so a font chosen in Palette Studio resolves to the exact
// same pairing here and in File Builder. This module keeps the flat
// `{ id, vibe, headingFont, bodyFont }` picker shape the board expects, but every
// pairing comes from the library — no more local list to drift out of sync.

import {
  FONT_PAIRINGS as LIB_PAIRINGS,
  googleHrefForPairings,
  findPairing,
  resolvePairingFromBlob,
  type FontPairing as LibFontPairing,
} from "./shared-fonts";

export interface FontPairing {
  id: string;
  headingFont: string;
  bodyFont: string;
}

/**
 * Adapt a shared-library pairing to Brand Board's flat family shape. The picker
 * UI now comes from the shared font picker (grouped by vibe itself), so
 * this shape only needs the id + the two family strings the renderer, project
 * files, and interop payload carry.
 */
function toBoardPairing(p: LibFontPairing): FontPairing {
  return {
    id: p.id,
    headingFont: p.heading.family,
    bodyFont: p.body.family,
  };
}

export const FONT_PAIRINGS: FontPairing[] = LIB_PAIRINGS.map(toBoardPairing);

/**
 * Resolve a board's font selection to a library pairing id. Prefers an explicit
 * stored `fontPairingId`; otherwise matches the family strings (covers older
 * boards + Palette blobs that predate the id). Falls back to the first pairing.
 */
export function resolvePairingId(opts: {
  fontPairingId?: string;
  headingFont?: string;
  bodyFont?: string;
}): string {
  if (opts.fontPairingId && findPairing(opts.fontPairingId)) return opts.fontPairingId;
  return resolvePairingFromBlob({
    id: opts.fontPairingId,
    heading: opts.headingFont,
    body: opts.bodyFont,
  }).id;
}

function familyId(family: string): string {
  return "bb-font-" + family.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
}

// Track which families we've already injected so we never double-load.
const loaded = new Set<string>();

/**
 * Load one or more font families on demand via a per-family <link>, using the
 * exact weights the library declares for that family (falling back to a broad
 * range for a family the library doesn't know). Lazy loading keeps startup fast.
 * Idempotent per family.
 */
export function loadFontFamilies(families: string[]): void {
  for (const family of families) {
    const id = familyId(family);
    if (loaded.has(family) || document.getElementById(id)) {
      loaded.add(family);
      continue;
    }
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = hrefForFamily(family);
    document.head.appendChild(link);
    loaded.add(family);
  }
}

/**
 * Build the Google Fonts href for a single family. Reuses the library's own
 * `googleParam` (correct weights, variable-font axes, etc.) when the family is a
 * known heading or body; otherwise loads a useful weight range.
 */
function hrefForFamily(family: string): string {
  const owner = LIB_PAIRINGS.find(
    (p) => p.heading.family === family || p.body.family === family,
  );
  const spec = owner
    ? owner.heading.family === family
      ? owner.heading
      : owner.body
    : null;
  if (spec) {
    return `https://fonts.googleapis.com/css2?family=${spec.googleParam}&display=swap`;
  }
  const q = `${family.replace(/ /g, "+")}:wght@400;500;600;700;800;900`;
  return `https://fonts.googleapis.com/css2?family=${q}&display=swap`;
}

/** Load the default pairing's fonts so the empty-state board paints correctly. */
export function ensureBoardFontsLoaded(): void {
  const first = FONT_PAIRINGS[0];
  loadFontFamilies([first.headingFont, first.bodyFont]);
}

/**
 * Resolve when the specific families are actually ready to paint, so the PNG
 * rasterizer never captures a fallback face. Uses the FontFace Loading API with
 * a bounded wait so a slow/absent font never hangs the export.
 */
export async function waitForFonts(families: string[]): Promise<void> {
  if (!("fonts" in document)) return;
  const loads = families.flatMap((f) =>
    ["700 40px", "400 20px"].map((spec) =>
      document.fonts.load(`${spec} "${f}"`).catch(() => undefined),
    ),
  );
  await Promise.race([
    Promise.all(loads).then(() => undefined),
    new Promise<void>((r) => setTimeout(r, 2500)),
  ]);
}

// Re-export a couple of library helpers boards may want without a second import.
export { googleHrefForPairings, findPairing };
