// The Guide page's prose lives here, written ONCE and reused for every client.
// The page component (GuidePage in BrandBoard.tsx) stays thin — it reads this
// copy and interpolates the few client-specific bits (brand name, the actual
// role colors, which applications are present). Keeping the words in one place
// means the guide's voice is edited here, not scattered through JSX.
//
// Voice: CONTENT_STYLE_GUIDE.md — smart friend catching the client up, not a
// manual. No lists-of-three, no em-dash crutch, no "not X but Y".
//
// This page is SELF-CONTAINED and package-agnostic: it never points at any other
// file in the kit, because different Fiverr tiers ship different pieces (a client
// may have no QR, no signature). Every row is gated on the asset actually being
// present, so the guide only ever describes what's really in that client's kit.

import type { BrandBoardData } from "./board.types";

/** The intro line under the page title — the one-sentence "what is this". */
export const GUIDE_INTRO =
  "A quick map of what's in your brand kit and where each piece goes. Keep this " +
  "page handy while you set things up.";

/**
 * The six role colors, each paired with the plain-language job it does on a real
 * page. This is the star of the guide: a client building a site reads it as
 * "which color goes where". Order matters — background/text/buttons first
 * because those are the decisions you make constantly.
 */
export interface RoleKeyRow {
  /** Which role on BrandRoles this row reads its hex from. */
  key: keyof NonNullable<BrandBoardData["roles"]>;
  /** Short human name of the role. */
  name: string;
  /** What this color is actually for, in one line. */
  job: string;
}

export const ROLE_KEY: RoleKeyRow[] = [
  { key: "background", name: "Background", job: "The base of every page and screen." },
  { key: "surface", name: "Surface", job: "Cards and panels that sit on the background." },
  { key: "heading", name: "Headings", job: "Titles and anything you want to stand out." },
  { key: "text", name: "Body text", job: "Paragraphs and everyday reading copy." },
  { key: "mutedText", name: "Muted text", job: "Captions, dates, the quieter details." },
  { key: "border", name: "Borders", job: "Dividers and the edges of cards and inputs." },
];

/** Copy for the typography block. */
export const TYPE_NOTE = {
  label: "Type",
  headingLead: "Use your heading font for titles.",
  bodyLead: "Use your body font for everything else.",
  note: "Two faces are plenty. Sticking to them is what makes a brand feel put together.",
};

/**
 * The applications quick-reference. Each row is a one-liner: what the file is and
 * the one thing to do with it. Only rows whose asset is present get shown, so a
 * kit without a QR simply drops that row.
 */
export interface AppRefRow {
  /** Which board field must be present for this row to show. */
  present: (b: BrandBoardData) => boolean;
  file: string;
  what: string;
  todo: string;
}

export const APP_REF: AppRefRow[] = [
  {
    present: (b) => b.signatureHtml !== null,
    file: "Email signature",
    what: "A ready-made signature for your email.",
    todo: "Open signature.html, copy the signature, and paste it into your email settings.",
  },
  {
    present: (b) => b.cardDataUrl !== null,
    file: "Digital card",
    what: "Your contact card as an image, plus a .vcf file.",
    todo: "Open the .vcf on your phone to save yourself to contacts.",
  },
  {
    present: (b) => b.qrDataUrl !== null,
    file: "QR code",
    what: "A scannable code that points to your link.",
    todo: "Put it on a business card, flyer, or window sign.",
  },
];

/**
 * The social-asset sizing reference — the exact set Icon Kit produces, grouped
 * into categories so the shared word (banner, icon) becomes a single header
 * instead of repeating on every row. Each row then only needs the short name +
 * its real dimensions, which lets the block sit in tidy columns and clear the
 * footer. Labels and sizes mirror Icon Kit's own output (SocialPanel OUTPUTS +
 * canvas BANNER_SIZES + FaviconPanel). The block only renders when the kit
 * actually carries social/brand assets.
 */
export interface SizeItem {
  name: string;
  size: string;
}

export interface SizeGroup {
  /** The category eyebrow — the shared word lifted out of the row names. */
  heading: string;
  /** One line on where this whole group goes. */
  note: string;
  items: SizeItem[];
}

export const SIZE_GROUPS: SizeGroup[] = [
  {
    heading: "Profile banners",
    note: "The cover image across the top of each profile.",
    items: [
      { name: "LinkedIn", size: "1584 × 396" },
      { name: "Facebook", size: "820 × 312" },
      { name: "Twitter / X", size: "1500 × 500" },
    ],
  },
  {
    heading: "Icons",
    note: "Browser tabs, home screens, and app installs.",
    items: [
      { name: "App icon", size: "512 × 512" },
      { name: "Apple touch", size: "180 × 180" },
      { name: "Favicon", size: "32 × 32" },
    ],
  },
  {
    heading: "Social card",
    note: "The preview image when your page gets shared (OG image).",
    items: [{ name: "Open Graph", size: "1200 × 630" }],
  },
];

/** The footer sign-off line. */
export const GUIDE_FOOTER = "Made with DeeBuilt · tools.deebuilt.co";
