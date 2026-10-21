import type { LayoutId } from "./layouts";
import type { LogoChip } from "./logoChip";

// The data model for a brand board. Brand Board is a CONSUMER: it holds the
// assets a user pastes/uploads from the other kit tools (per
// BRAND-KIT-INTEROP-CONTRACT.md) and composes them into one designed page.
//
// The board is a set of BLOCKS (hero, palette, type, signature, qr, card, logo)
// arranged by a chosen LAYOUT. A block only renders when its content is present,
// so a kit with no signature simply omits that block — no empty holes.

export interface BrandColor {
  id: string;
  /** Hex including leading "#", uppercase, e.g. "#2F4F46". */
  hex: string;
  /** Role/label, e.g. "Primary". Comes pre-labeled from Palette Studio. */
  label: string;
}

/** A tint→shade ramp for a single brand color (shows colors "in context"). */
export interface ColorRamp {
  baseHex: string;
  stops: { stop: string; hex: string }[];
}

/**
 * A single labeled brand image from Icon Kit — a social banner, avatar, favicon,
 * app icon, anything. Fully generic: the board just renders the image at (or
 * scaled from) its natural dimensions and shows the label. `kind` is an optional
 * grouping/sizing hint, not required.
 */
export interface SocialAsset {
  id: string;
  label: string;
  kind?: string; // "banner" | "avatar" | "favicon" | "icon" | ... (hint only)
  image: string; // data URL
  width?: number;
  height?: number;
}

/**
 * The six semantic role colors (from Palette Studio's `roles`). These drive the
 * "in-context" mini mock composition on the board — a real page built from the
 * palette, not just swatches. Null when no palette with roles has been imported.
 */
export interface BrandRoles {
  background: string;
  surface: string;
  text: string;
  heading: string;
  mutedText: string;
  border: string;
}

/**
 * The board is a multi-PAGE deliverable. Each page is its own fixed-size poster
 * with its own layout setting:
 *   - foundation   → colors + fonts (palette, ramps, roles, type, in-use mock)
 *   - applications → email signature, QR, digital card
 *   - social       → social banners, avatar, favicon, brand assets
 *   - guide        → the "how to use this kit" poster (palette-role key, type
 *                    note, applications quick-reference, social sizing table).
 *                    Reusable prose written once; the last page in the set.
 * A page only appears when it has content, so a minimal kit is a single page.
 */
export type PageId = "foundation" | "applications" | "social" | "guide";

export const PAGE_ORDER: PageId[] = ["foundation", "applications", "social", "guide"];

export const PAGE_META: Record<PageId, { index: string; title: string }> = {
  foundation: { index: "01", title: "Foundation" },
  applications: { index: "02", title: "Applications" },
  social: { index: "03", title: "Social & Assets" },
  guide: { index: "04", title: "Using Your Kit" },
};

export interface BrandBoardData {
  kitName: string;
  tagline: string;
  /** The board's page/paper background. Defaults to a warm bone; white is common. */
  pageColor: string;

  // ---- Colors (from Palette Studio payload, or entered by hand) ----
  colors: BrandColor[];
  /** Optional per-color ramps, when a palette payload provides scales. */
  ramps: ColorRamp[];
  /** The six semantic roles, when a palette payload provides them. */
  roles: BrandRoles | null;

  // ---- Type (from Palette Studio payload, or picked here) ----
  headingFont: string;
  bodyFont: string;
  /**
   * The shared font-library pairing id (see src/lib/shared-fonts.ts). This is the
   * cross-tool interop key: a font chosen in Palette Studio travels here as its
   * pairing id and resolves to the exact same fonts in every tool. Nullable
   * because older boards + a hand-typed family combo may not map to a library
   * pairing — the `headingFont`/`bodyFont` strings above remain the render source.
   */
  fontPairingId: string | null;

  // ---- Palette renders (from Palette Studio payload) ----
  // The rendered palette assets baked into the palette blob: a PNG "swatch sheet"
  // and a PDF whose hex codes are selectable text. Held so the whole kit flows
  // Palette Studio → Brand Board → File Builder with no manual downloads (the same
  // reason QR/Card carry qrDataUrl/cardDataUrl). Null when the palette was pasted
  // from an older blob that didn't bake them, or entered by hand.
  paletteImageDataUrl: string | null;
  palettePdfDataUrl: string | null;

  // ---- Logo (uploaded — source logo or icon-512.png) ----
  logoDataUrl: string | null;
  logoWidth: number | null;
  logoHeight: number | null;
  /**
   * Safe-chip decision for the logo, derived from its pixels at ingest (see
   * logoChip.ts). "none" = self-backed logo, render bare; "light"/"dark" = a
   * transparent logo that needs a light/dark backing so its ink reads on the
   * hero wash. Persisted so a reopened kit keeps the decision without re-sampling.
   */
  logoChip: LogoChip;

  // ---- Signature (from Signature Studio payload) ----
  /** Self-contained email HTML, rendered in a sandboxed iframe tile. */
  signatureHtml: string | null;

  // ---- QR (uploaded PNG/SVG from QR Creator) ----
  qrDataUrl: string | null;

  // ---- Digital card (uploaded PNG from Digital Card) ----
  cardDataUrl: string | null;
  // The vCard (.vcf) baked into the card blob (data.vcard). The FUNCTIONAL half
  // of the card deliverable: the client saves it to their phone contacts and
  // shares it with customers. It's a downloadable file, not a visual, so it's
  // held here (→ serialized into the kit file → File Builder writes it as
  // Digital_Card/{brand}_contact.vcf) but never rendered on the board. Null when
  // the card blob predates the vcard bake, or was pasted without one.
  cardVcardDataUrl: string | null;
  // The vCard QR (data.qr) baked into the card blob — the tap-to-save half of
  // the card: scan → the phone offers to save the contact. Like the vcard it's a
  // downloadable asset, not a visual, so it's held here (→ File Builder writes
  // Digital_Card/contact_qr.png) but never rendered on the board. Null when the
  // card blob predates the QR bake (§2a), or was pasted without one.
  cardQrDataUrl: string | null;

  // ---- Social / brand assets (from Icon Kit) ----
  // A generic, open-ended list of labeled images: social banners (any platform),
  // profile avatar, favicon, app icons — whatever Icon Kit produces. The board
  // renders each by its natural size; no per-type logic needed.
  socialAssets: SocialAsset[];

  // ---- Banners (from Banner Designer) ----
  // Its OWN slot, kept separate from socialAssets so Icon Kit and Banner Designer
  // don't overwrite each other (they emit the same type:"social" blob shape).
  // Same SocialAsset shape — a banner IS a labeled image. Renders as its own
  // labeled group on the Social page, beneath Icon Kit's assets.
  bannerAssets: SocialAsset[];

  // ---- Source blobs ----
  // The exact JSON blobs the user imported, kept so they can be re-copied back
  // out anytime and are archived in the project file / localStorage draft. This
  // is what makes import non-destructive: the original data is never lost, even
  // after the paste field is cleared.
  sourceBlobs: {
    palette: string | null;
    signature: string | null;
    qr: string | null;
    card: string | null;
    social: string | null;
    banner: string | null;
  };

  // ---- Per-page layout ----
  // Each page owns its own layout so a killer Foundation layout (Overlap) can
  // differ from the plainer Applications/Social pages — and new per-page layouts
  // slot in here without touching the rest of the app.
  pageLayouts: Record<PageId, LayoutId>;

  // ---- The board's OWN rendered pages (self-inclusion) ----
  // Brand Board consumes every other tool's finished picture (qrDataUrl,
  // cardDataUrl, socialAssets…) but its own designed pages historically only
  // ever existed as a live download at export time — they were never SAVED, so
  // they couldn't ride inside the one kit file, and File Builder (which can't
  // draw) had nothing to put in the zip. This holds a frozen PNG of each present
  // page, captured at Save time (the natural "freeze moment" — nothing's moving),
  // keyed by PageId as a base64 data URL. Sits BESIDE the raw assets, not
  // wrapping them: the QR still lives alone in qrDataUrl AND baked into the
  // Applications page picture here. Empty until the first Save.
  pageRenders: Partial<Record<PageId, string>>; // data:image/png;base64,...

  // The whole board as ONE flippable multi-page PDF (one page-picture per PDF
  // page), baked in at the same Save freeze. This is the single hand-off doc a
  // client actually wants — page through the kit instead of opening four loose
  // PNGs. File Builder drops it in as Brand_Board/Brand_Board.pdf. Rebuilt from
  // the same frozen renders, so it always matches the PNGs. (The text in it is a
  // picture, not selectable — selectable palette hexes live in Palette Studio's
  // own PDF.) Null until the first Save. Kept out of the localStorage draft with
  // pageRenders, for the same quota reason.
  pagesPdf: string | null; // data:application/pdf;base64,...
}

// A brand board shows the brand's actual palette colors. In custom ("my own
// colors") mode a user may define many — show them all, not a curated few. The
// cap is a sanity bound, not a design limit; the swatch row wraps past ~6.
export const MAX_COLORS = 12;

export function emptyBoard(): BrandBoardData {
  return {
    kitName: "",
    tagline: "",
    pageColor: "#F6F3EC",
    colors: [],
    ramps: [],
    roles: null,
    headingFont: "Playfair Display",
    bodyFont: "Inter",
    fontPairingId: null,
    paletteImageDataUrl: null,
    palettePdfDataUrl: null,
    logoDataUrl: null,
    logoWidth: null,
    logoHeight: null,
    logoChip: "none",
    signatureHtml: null,
    qrDataUrl: null,
    cardDataUrl: null,
    cardVcardDataUrl: null,
    cardQrDataUrl: null,
    socialAssets: [],
    bannerAssets: [],
    sourceBlobs: { palette: null, signature: null, qr: null, card: null, social: null, banner: null },
    pageLayouts: {
      // Overlap is the one layout that genuinely composes (it layers the palette)
      // — make it the Foundation default. The other pages stack until they earn
      // their own real layouts.
      foundation: "overlap",
      applications: "stack",
      social: "stack",
      // The guide page has its own fixed body (not the composed-block layouts),
      // so its layout id is a placeholder — kept only to satisfy the per-page map.
      guide: "stack",
    },
    // No frozen page pictures / PDF until the first Save takes them.
    pageRenders: {},
    pagesPdf: null,
  };
}

/** Which optional blocks currently have content — drives layout composition. */
export interface BlockPresence {
  hero: boolean; // always true (kitName / logo / tagline)
  palette: boolean;
  type: boolean; // always true (fonts always set)
  context: boolean; // the in-context mini mock (needs roles)
  signature: boolean;
  qr: boolean;
  card: boolean;
  social: boolean;
  banner: boolean;
}

export function blockPresence(b: BrandBoardData): BlockPresence {
  return {
    hero: true,
    palette: b.colors.length > 0,
    type: true,
    context: b.roles !== null,
    signature: b.signatureHtml !== null,
    qr: b.qrDataUrl !== null,
    card: b.cardDataUrl !== null,
    social: b.socialAssets.length > 0,
    banner: b.bannerAssets.length > 0,
  };
}

/**
 * Which pages have content, in canonical order. Foundation is always present
 * (type + hero always exist); Applications appears with a signature/QR/card;
 * Social appears with any social/brand asset. A minimal kit is one page.
 */
export function presentPages(b: BrandBoardData): PageId[] {
  const p = blockPresence(b);
  const pages: PageId[] = ["foundation"]; // always — palette/type/hero live here
  if (p.signature || p.qr || p.card) pages.push("applications");
  // The Social page carries BOTH Icon Kit assets and Banner Designer banners —
  // show it when either group has content.
  if (p.social || p.banner) pages.push("social");
  // The guide is the "how to use this" poster. It's only meaningful once there's
  // a real palette to key and applications/assets to point at — a bare name+logo
  // has nothing to guide. Show it when the kit has a palette (its star block is
  // the labeled role key, which needs colors).
  if (p.palette) pages.push("guide");
  return pages;
}

/** The blocks that belong to each page (used by BrandPage to render its slice). */
export function pageBlocks(page: PageId): (keyof BlockPresence)[] {
  switch (page) {
    case "foundation":
      return ["palette", "type", "context"];
    case "applications":
      return ["signature", "qr", "card"];
    case "social":
      return ["social", "banner"];
    case "guide":
      // The guide renders its own fixed prose body, not composed blocks.
      return [];
  }
}

export function boardHasContent(b: BrandBoardData): boolean {
  return (
    b.kitName.trim().length > 0 ||
    b.colors.length > 0 ||
    b.logoDataUrl !== null ||
    b.signatureHtml !== null ||
    b.qrDataUrl !== null ||
    b.cardDataUrl !== null ||
    b.socialAssets.length > 0 ||
    b.bannerAssets.length > 0
  );
}
