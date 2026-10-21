// The CONSUMER side of the Brand Kit Interop Contract. Parses the JSON payloads
// the other kit tools emit (see docs/BRAND-KIT-INTEROP-CONTRACT.md) into
// Brand Board's state. Tolerant: accepts the exact contract shape, and falls
// back to lenient parsing so a partial/hand-built blob still lands.

import type { BrandBoardData, BrandColor, ColorRamp, BrandRoles, SocialAsset } from "./board.types";
import { MAX_COLORS } from "./board.types";
import { FONT_PAIRINGS, findPairing } from "@/lib/fonts";
import { resolvePairingFromBlob } from "@/lib/shared-fonts";
import { uuid } from "@/lib/uuid";

function safeParse(input: string): unknown {
  try {
    return JSON.parse(input.trim());
  } catch {
    return null;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function normHex(h: unknown): string | null {
  if (typeof h !== "string") return null;
  const m = h.trim().match(/^#?([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/);
  if (!m) return null;
  let hex = m[1];
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
  return "#" + hex.toUpperCase();
}

/**
 * Read the six semantic roles from a payload's `data.roles`. Every field must
 * resolve to a valid hex, or we return null (a partial roles object would make
 * the in-context mock render with broken/missing colors). Palette Studio
 * populates `roles` in BOTH generated and custom mode, so this covers both.
 */
function readRoles(rolesRaw: unknown): BrandRoles | null {
  if (!isRecord(rolesRaw)) return null;
  const bg = normHex(rolesRaw.background);
  const surface = normHex(rolesRaw.surface);
  const text = normHex(rolesRaw.text);
  const heading = normHex(rolesRaw.heading);
  const mutedText = normHex(rolesRaw.mutedText);
  const border = normHex(rolesRaw.border);
  if (!bg || !surface || !text || !heading || !mutedText || !border) return null;
  return { background: bg, surface, text, heading, mutedText, border };
}

// Palette Studio's plain-language custom roles → human labels for the swatches.
const ROLE_LABELS: Record<string, string> = {
  pageBg: "Page background",
  sectionBg: "Card background",
  bodyText: "Body text",
  heading: "Heading",
  button: "Buttons / CTA",
  accent: "Accent",
  secondaryText: "Muted text",
  border: "Border",
};
function prettyRole(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

/**
 * Derive the six semantic roles from a Palette Studio custom[] list. Each custom
 * color carries a plain-language role (pageBg/sectionBg/bodyText/heading/button/
 * accent/secondaryText/border); map those to our six. Any role the user didn't
 * assign falls back to a sensible pick from the colors present, so the in-use
 * mock always renders legibly. Returns null if no usable colors.
 */
function rolesFromCustom(custom: unknown[] | null): BrandRoles | null {
  if (!custom || custom.length === 0) return null;
  const byRole = (role: string): string | null => {
    const hit = custom.find((c) => isRecord(c) && c.role === role);
    return hit && isRecord(hit) ? normHex(hit.hex) : null;
  };
  const hexes = custom
    .map((c) => (isRecord(c) ? normHex(c.hex) : null))
    .filter((h): h is string => h !== null);
  if (hexes.length === 0) return null;

  // Lightest = fallback background, darkest = fallback text.
  const lum = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  };
  const sorted = [...hexes].sort((a, b) => lum(a) - lum(b));
  const lightest = sorted[sorted.length - 1];
  const darkest = sorted[0];

  const background = byRole("pageBg") ?? lightest;
  const surface = byRole("sectionBg") ?? background;
  const text = byRole("bodyText") ?? darkest;
  const heading = byRole("heading") ?? text;
  const mutedText = byRole("secondaryText") ?? text;
  const border = byRole("border") ?? "#e2e8f0";
  return { background, surface, text, heading, mutedText, border };
}

/**
 * Ingest a Palette Studio "palette" payload. Returns a NEW board with colors,
 * ramps, fonts, and (if empty) the kit name filled in. Null if unrecognizable.
 */
export function ingestPalettePayload(
  input: string,
  current: BrandBoardData,
): BrandBoardData | null {
  const raw = safeParse(input);
  if (!isRecord(raw)) return null;

  // Accept either the enveloped contract shape or a bare palette object.
  const data = isRecord(raw.data) ? raw.data : raw;
  if (raw.type && raw.type !== "palette") return null;

  // Ordered named colors → labeled swatches.
  const named: { hex: unknown; label: string }[] = [
    { hex: data.primary, label: "Primary" },
    { hex: data.secondary, label: "Secondary" },
    { hex: data.accent, label: "Accent" },
    { hex: data.accent2, label: "Accent 2" },
  ];
  // In custom mode, prefer the user's own colors — ALL of them — labeled by
  // their name, or a friendly version of their role.
  if (Array.isArray(data.custom) && data.custom.length > 0) {
    named.length = 0;
    for (const c of data.custom as unknown[]) {
      if (isRecord(c)) {
        const name = typeof c.name === "string" && c.name.trim() ? c.name.trim() : "";
        named.push({ hex: c.hex, label: name || prettyRole(String(c.role ?? "")) });
      }
    }
  }

  const colors: BrandColor[] = [];
  const seen = new Set<string>();
  for (const n of named) {
    const hex = normHex(n.hex);
    if (hex && !seen.has(hex) && colors.length < MAX_COLORS) {
      seen.add(hex);
      colors.push({ id: uuid(), hex, label: n.label });
    }
  }

  // Last-resort catch-all: ONLY when the structured parse found NOTHING (an
  // unrecognized shape — e.g. a plain hand-pasted hex list or CSS vars with no
  // primary/secondary/accent keys). Then pull distinct hexes from the raw text.
  // We do NOT scrape when named colors were found, or we'd dump every scale
  // tint (30+) as swatches — those belong in the ramps, not the swatch row.
  if (colors.length === 0) {
    const structuredKeys = data.primary || data.secondary || data.accent || data.custom;
    if (!structuredKeys) {
      const hexMatches = input.match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g) ?? [];
      for (const raw of hexMatches) {
        const hex = normHex(raw);
        if (hex && !seen.has(hex) && colors.length < MAX_COLORS) {
          seen.add(hex);
          colors.push({ id: uuid(), hex, label: "" });
        }
      }
    }
  }

  if (colors.length === 0) return null;

  // Ramps from the scales — the "Tint & shade scales" Palette Studio generates
  // (hover states, borders, tinted backgrounds). A real deliverable; show them
  // in both generated and custom mode. They're fully replaced on each import.
  const ramps: ColorRamp[] = [];
  const scales = isRecord(data.scales) ? data.scales : undefined;
  if (scales) {
    for (const key of ["primary", "accent", "neutral"] as const) {
      const scale = scales[key];
      if (isRecord(scale)) {
        const stops = ["100", "300", "500", "700", "900"]
          .map((stop) => ({ stop, hex: normHex(scale[stop]) }))
          .filter((s): s is { stop: string; hex: string } => s.hex !== null);
        if (stops.length > 0) ramps.push({ baseHex: stops[Math.floor(stops.length / 2)].hex, stops });
      }
    }
  }

  // Fonts: take the raw families for rendering AND capture the shared-library
  // pairing id (the cross-tool interop key) so this font resolves identically in
  // every tool. Prefer the explicit `font.id`; fall back to matching families.
  let headingFont = current.headingFont;
  let bodyFont = current.bodyFont;
  let fontPairingId = current.fontPairingId;
  const font = isRecord(data.font) ? data.font : undefined;
  if (font) {
    if (typeof font.heading === "string" && font.heading) headingFont = font.heading;
    if (typeof font.body === "string" && font.body) bodyFont = font.body;
    const resolved = resolvePairingFromBlob({
      id: typeof font.id === "string" ? font.id : undefined,
      heading: typeof font.heading === "string" ? font.heading : undefined,
      body: typeof font.body === "string" ? font.body : undefined,
    });
    // Only adopt the resolved id when it actually corresponds to the incoming
    // fonts (id given, or families matched) — never silently stamp the fallback
    // first-pairing id onto a font it doesn't describe.
    if (
      (typeof font.id === "string" && findPairing(font.id)) ||
      (resolved.heading.family === headingFont && resolved.body.family === bodyFont)
    ) {
      fontPairingId = resolved.id;
    }
  }

  // The six semantic roles → drive the in-context mini mock composition.
  // Importing a palette is a FULL RESET of the palette section: use the new
  // blob's roles (explicit, or derived from custom[]) or null — never keep the
  // PREVIOUS palette's roles, which would leave residual colors behind when the
  // new palette has fewer/different ones.
  const roles =
    readRoles(data.roles) ??
    rolesFromCustom(Array.isArray(data.custom) ? data.custom : null) ??
    null;

  const kitName =
    current.kitName || (typeof data.kitName === "string" ? data.kitName : current.kitName);

  // Baked renders (added 2026-07-12): the palette blob now carries a rendered PNG
  // swatch sheet (`data.image`) and a copyable-hex PDF (`data.pdf`), so the whole
  // kit flows into File Builder with no manual downloads. Same reset semantics as
  // the rest of the palette section — take the new blob's renders, or null if it's
  // an older blob without them. Only accept proper data URLs.
  const asDataUrl = (v: unknown, prefix: string): string | null =>
    typeof v === "string" && v.startsWith(prefix) ? v : null;
  const paletteImageDataUrl = asDataUrl(data.image, "data:image/");
  const palettePdfDataUrl = asDataUrl(data.pdf, "data:application/pdf");

  // Fully replace all palette-derived fields (colors, ramps, roles, fonts,
  // renders). The rest of the board (signature, QR, social, logo, name/tagline)
  // is untouched, so re-importing a palette doesn't disturb already-imported
  // assets.
  return {
    ...current,
    colors,
    ramps,
    roles,
    headingFont,
    bodyFont,
    fontPairingId,
    kitName,
    paletteImageDataUrl,
    palettePdfDataUrl,
  };
}

/**
 * Ingest a Signature Studio "signature" payload → the self-contained HTML string
 * for the iframe tile. Accepts the enveloped shape or a bare { html } object.
 */
export function ingestSignaturePayload(input: string): string | null {
  const raw = safeParse(input);
  if (!isRecord(raw)) return null;
  if (raw.type && raw.type !== "signature") return null;
  const data = isRecord(raw.data) ? raw.data : raw;
  if (typeof data.html === "string" && data.html.trim().length > 0) {
    return data.html;
  }
  return null;
}

/**
 * Ingest a QR Creator "qr" payload. Returns:
 *  - `image`: a rendered QR data URL IF the blob carries one (`data.image`),
 *    so a single paste shows the QR on the board — else null (then the user
 *    uploads the downloaded PNG separately for the visual).
 *  - `stored`: true if the blob is a valid QR export worth archiving.
 * The full blob is always stored on the board (held + re-copyable + archived in
 * the project file) so it can be pasted back into QR Creator to recreate the QR.
 */
export function ingestQrPayload(input: string): { image: string | null; ok: boolean } {
  const raw = safeParse(input);
  if (!isRecord(raw)) return { image: null, ok: false };
  if (raw.type && raw.type !== "qr") return { image: null, ok: false };
  const data = isRecord(raw.data) ? raw.data : raw;
  // Rendered image, if QR Creator included one.
  const image =
    typeof data.image === "string" && data.image.startsWith("data:")
      ? data.image
      : null;
  // Valid if it has a config or an image — either way it's a real QR export.
  const ok = image !== null || isRecord(data.config) || typeof data.url === "string";
  return { image, ok };
}

/**
 * Ingest a Digital Card "card" payload. Same pattern as QR: pull a rendered
 * image if present (`data.image`), always store the blob for archive/reopen.
 *
 * Also pulls the baked vCard (`data.vcard`, a text/vcard data URL) — the
 * functional "add to contacts" half of the card deliverable. It never renders
 * on the board (it's a downloadable file, not a visual), but is held so it rides
 * inside the saved kit → File Builder writes it as Digital_Card/{brand}_contact.vcf.
 * A blob without a valid `data.vcard` returns `vcard: null`, so the caller's
 * full-reset paste clears any prior vcard — same semantics as `image`.
 *
 * And the baked vCard QR (`data.qr`, a PNG data URL) — the tap-to-save half:
 * scan → the phone offers to save the contact. Held the same way (downloadable,
 * never rendered on the board) → File Builder writes Digital_Card/contact_qr.png.
 */
export function ingestCardPayload(
  input: string,
): { image: string | null; vcard: string | null; qr: string | null; ok: boolean } {
  const raw = safeParse(input);
  if (!isRecord(raw)) return { image: null, vcard: null, qr: null, ok: false };
  if (raw.type && raw.type !== "card") return { image: null, vcard: null, qr: null, ok: false };
  const data = isRecord(raw.data) ? raw.data : raw;
  const image =
    typeof data.image === "string" && data.image.startsWith("data:")
      ? data.image
      : null;
  const vcard =
    typeof data.vcard === "string" && data.vcard.startsWith("data:")
      ? data.vcard
      : null;
  const qr =
    typeof data.qr === "string" && data.qr.startsWith("data:")
      ? data.qr
      : null;
  const ok = image !== null || isRecord(data.card) || isRecord(data.config);
  return { image, vcard, qr, ok };
}

/**
 * Ingest an Icon Kit "social" payload → a list of labeled brand images (banners,
 * avatar, favicon, icons — anything). Fully generic: each item needs an `image`
 * data URL; label/kind/dimensions are optional. Returns the parsed assets (empty
 * if none valid) plus ok. The whole blob is still stored for archive/reopen.
 */
export function ingestSocialPayload(input: string): { assets: SocialAsset[]; ok: boolean } {
  const raw = safeParse(input);
  if (!isRecord(raw)) return { assets: [], ok: false };
  if (raw.type && raw.type !== "social") return { assets: [], ok: false };
  const data = isRecord(raw.data) ? raw.data : raw;

  // Accept `assets`, or a bare array, or a single {image} as conveniences.
  let list: unknown[] = [];
  if (Array.isArray(data.assets)) list = data.assets;
  else if (Array.isArray(raw)) list = raw as unknown[];
  else if (typeof data.image === "string") list = [data];

  const assets: SocialAsset[] = [];
  for (const item of list) {
    if (!isRecord(item)) continue;
    const image = typeof item.image === "string" && item.image.startsWith("data:")
      ? item.image
      : null;
    if (!image) continue;
    assets.push({
      id: uuid(),
      label: typeof item.label === "string" ? item.label : "",
      kind: typeof item.kind === "string" ? item.kind : undefined,
      image,
      width: typeof item.width === "number" ? item.width : undefined,
      height: typeof item.height === "number" ? item.height : undefined,
    });
  }
  return { assets, ok: assets.length > 0 };
}

// Re-export for convenience: the known font families a pairing might name, so
// the app can lazy-load whatever a payload brings even if it's not a preset.
export function fontFamiliesFrom(headingFont: string, bodyFont: string): string[] {
  const known = new Set(FONT_PAIRINGS.flatMap((p) => [p.headingFont, p.bodyFont]));
  const out = [headingFont, bodyFont];
  // (No-op today; hook for future validation against `known`.)
  void known;
  return out;
}
