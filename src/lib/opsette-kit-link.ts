// AUTO-VENDORED from _shared/opsette-kit-link/opsette-kit-link.ts — DO NOT EDIT HERE.
// Edit the master and run `node _shared/opsette-kit-link/sync.mjs` to re-sync.

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  OPSETTE TOOLS — KIT LINK  (canonical master)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ONE source of truth for the three "connect the kit tools" transport
 *  mechanisms from docs/KIT-SUITE-CONNECT-PLAN.md. This is pure TRANSPORT on
 *  top of each tool's existing export/reopen (`toKitJson`/`fromKitJson`) — it
 *  changes none of the frozen JSON shapes in BRAND-KIT-INTEROP-CONTRACT.md.
 *
 *  Mechanism 1 — Brand core in a URL  (?seed=<base64(brandCore)>)
 *      A tiny { name, tagline, logo, colors, fonts } seed that rides in a URL
 *      so every tool opens pre-filled with the client's brand instead of blank
 *      defaults. Kills the "re-type the same 4 facts into 6 tabs" friction.
 *
 *  Mechanism 2 — Clipboard deep-link  (?reopen=clipboard&from=brand-board)
 *      A URL that carries NO data — it's a note that says "look at the
 *      clipboard." The tool reads the clipboard on a one-tap banner and feeds
 *      the text to its existing `fromKitJson`. Reopens an existing asset at any
 *      blob size (baked images can't ride a URL).
 *
 *  Mechanism 3 — Iframe modal  (?embed=1 + postMessage load/save)
 *      Brand Board hosts a tool in a same-origin <iframe>; full blobs pass via
 *      postMessage with no size limit and no clipboard prompt. The "one app"
 *      feeling. Origin MUST be verified on both sides.
 *
 *  ─────────────────────────────────────────────────────────────────────────
 *  WHY THIS FILE IS VENDORED, NOT IMPORTED
 *  ─────────────────────────────────────────────────────────────────────────
 *  Each Opsette tool is its OWN GitHub-Pages repo, deployed independently
 *  (separate git remotes, separate Vite `base` paths). A repo cannot `import`
 *  a file that lives in another repo at build time. So — exactly like
 *  `opsette-share`, `opsette-header`, `opsette-bridge`, and `shared-fonts` —
 *  this library is VENDORED: this master lives at
 *  `_shared/opsette-kit-link/opsette-kit-link.ts`, and a byte-identical copy
 *  is synced into each tool at `src/lib/opsette-kit-link.ts` via
 *  `node _shared/opsette-kit-link/sync.mjs`. NEVER hand-edit a vendored copy.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** The apex origin every deployed tool shares — the postMessage trust anchor. */
export const OPSETTE_TOOLS_ORIGIN = "https://tools.deebuilt.co";

/** Route slug per embeddable/seedable tool. Kept here so link builders and the
 *  origin check agree on one spelling. Matches each repo's Vite `base`. */
export const SLUGS = {
  palette: "palette-studio",
  qr: "qr-creator",
  card: "digital-card",
  signature: "signature-studio",
  icon: "icon-kit",
  board: "brand-board",
} as const;
export type SlugKey = keyof typeof SLUGS;

// ─── Mechanism 1: the brand core seed ───────────────────────────────────────

/** One named brand color. `role` is a soft hint (e.g. "primary", "accent",
 *  "background", "text") so a tool can pick the color it needs; tools that just
 *  want "the main color" read `colors[0]`. Kept open-ended on purpose — every
 *  tool maps these to its own inputs (Palette → base hex, QR → fg/bg, Card →
 *  accent, etc.). */
export interface BrandCoreColor {
  hex: string;
  role?: string;
  name?: string;
}

/** The four facts you'd otherwise re-type into every tool. Small BY DESIGN so
 *  it fits a URL — carries NO baked images except (optionally) a tiny logo. */
export interface BrandCore {
  /** Brand / client name — titles the kit, seeds wordmark inputs. */
  name?: string;
  /** One-line tagline / descriptor. */
  tagline?: string;
  /** Logo as a data URL — inlined ONLY when small (see LOGO_SEED_MAX_BYTES).
   *  Large logos are dropped from the seed and the tool prompts for one once. */
  logo?: string;
  /** Ordered brand colors. First is treated as the primary/seed color. */
  colors?: BrandCoreColor[];
  /** Font pairing — ids + families so a tool can reselect or load the pair. */
  fonts?: {
    /** The pairing id (e.g. "inter") when it comes from the shared library. */
    id?: string;
    heading?: string;
    body?: string;
    googleHref?: string;
  };
}

/**
 * Max size (bytes) of a logo data URL we'll inline into the seed. A base64 URL
 * of ~4 KB is still comfortably inside every browser's URL length cap once the
 * rest of the core is added. A logo above this is DROPPED from the seed (the
 * core still carries name/tagline/colors/fonts) and the target tool prompts for
 * the logo once. This is the fork noted in KIT-SUITE-CONNECT-PLAN.md §1.
 */
export const LOGO_SEED_MAX_BYTES = 4096;

/** URL-safe base64 (RFC 4648 §5): +/ → -_ , padding stripped. Keeps the seed
 *  clean in a query string and dodges `+`-as-space decoding surprises. */
function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

const utf8 = {
  encode: (s: string) => new TextEncoder().encode(s),
  decode: (b: Uint8Array) => new TextDecoder().decode(b),
};

/**
 * Encode a brand core to a URL-safe base64 seed string. A logo larger than
 * LOGO_SEED_MAX_BYTES is stripped so the seed stays URL-sized; the returned
 * `logoDropped` flag lets a caller tell the user "logo's too big to carry — add
 * it once in the tool." Everything else always rides along.
 */
export function encodeSeed(core: BrandCore): { seed: string; logoDropped: boolean } {
  const safe: BrandCore = { ...core };
  let logoDropped = false;
  if (safe.logo) {
    // Byte length of the data URL string; base64 is ASCII so length === bytes.
    if (safe.logo.length > LOGO_SEED_MAX_BYTES) {
      delete safe.logo;
      logoDropped = true;
    }
  }
  // Drop empty keys so the seed is as short as possible.
  (Object.keys(safe) as (keyof BrandCore)[]).forEach((k) => {
    const v = safe[k];
    if (v == null || (typeof v === "string" && v === "") || (Array.isArray(v) && v.length === 0)) {
      delete safe[k];
    }
  });
  const seed = toBase64Url(utf8.encode(JSON.stringify(safe)));
  return { seed, logoDropped };
}

/**
 * Decode a seed string back to a brand core. Returns null (never throws) for
 * anything that isn't a valid seed, so a tarnished/edited URL just falls back
 * to the tool's default state. Light validation: it must parse to an object and
 * carry at least one recognized field.
 */
export function decodeSeed(seed: string): BrandCore | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(utf8.decode(fromBase64Url(seed.trim())));
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const c = parsed as Record<string, unknown>;
  const hasKnown =
    typeof c.name === "string" ||
    typeof c.tagline === "string" ||
    typeof c.logo === "string" ||
    Array.isArray(c.colors) ||
    (typeof c.fonts === "object" && c.fonts !== null);
  if (!hasKnown) return null;
  // Normalize colors defensively — a hand-edited seed shouldn't crash a tool.
  const core: BrandCore = {};
  if (typeof c.name === "string") core.name = c.name;
  if (typeof c.tagline === "string") core.tagline = c.tagline;
  if (typeof c.logo === "string" && c.logo.startsWith("data:")) core.logo = c.logo;
  if (Array.isArray(c.colors)) {
    core.colors = c.colors
      .filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null)
      .map((x) => {
        const col: BrandCoreColor = { hex: typeof x.hex === "string" ? x.hex : "" };
        if (typeof x.role === "string") col.role = x.role;
        if (typeof x.name === "string") col.name = x.name;
        return col;
      })
      .filter((col) => /^#?[0-9a-fA-F]{3,8}$/.test(col.hex));
  }
  if (typeof c.fonts === "object" && c.fonts !== null) {
    const f = c.fonts as Record<string, unknown>;
    core.fonts = {};
    if (typeof f.id === "string") core.fonts.id = f.id;
    if (typeof f.heading === "string") core.fonts.heading = f.heading;
    if (typeof f.body === "string") core.fonts.body = f.body;
    if (typeof f.googleHref === "string") core.fonts.googleHref = f.googleHref;
  }
  return core;
}

/**
 * Read + decode the `?seed=` param from the current URL (or a supplied search
 * string). Returns null when absent or invalid. Call once on mount; a tool with
 * no seed behaves exactly as it does today.
 */
export function readSeedFromUrl(search: string = getSearch()): BrandCore | null {
  const value = new URLSearchParams(search).get("seed");
  if (!value) return null;
  return decodeSeed(value);
}

/** Build a pre-seeded link to a tool. `origin` defaults to the shared apex, so
 *  the "New client kit" starter can hand out real production links; pass a
 *  localhost origin (with the port) to build a link for local testing. */
export function buildSeedLink(slug: string, seed: string, origin: string = OPSETTE_TOOLS_ORIGIN): string {
  const base = origin.replace(/\/$/, "");
  return `${base}/${slug}/?seed=${seed}`;
}

// ─── Mechanism 2: the clipboard reopen intent ───────────────────────────────

export type ReopenSource = "clipboard" | "url";

export interface ReopenIntent {
  /** Where the reopen blob lives: the clipboard (any size) or inline in `kit`. */
  source: ReopenSource;
  /** Who sent us here (e.g. "brand-board") — for a friendly banner label. */
  from?: string;
  /** For source === "url": the slim blob decoded from `?kit=` (small apps only). */
  kit?: string;
}

/** Read the `?reopen=` intent (Mechanism 2). Returns null when absent. The tool
 *  shows a one-tap "Load from Brand Board" banner and does the clipboard read on
 *  the tap (browsers forbid a silent read on load). */
export function readReopenIntent(search: string = getSearch()): ReopenIntent | null {
  const params = new URLSearchParams(search);
  const reopen = params.get("reopen");
  if (reopen !== "clipboard" && reopen !== "url") return null;
  const intent: ReopenIntent = { source: reopen };
  const from = params.get("from");
  if (from) intent.from = from;
  if (reopen === "url") {
    const kit = params.get("kit");
    if (kit) intent.kit = kit;
  }
  return intent;
}

/** True when the tool is running inside a Brand Board iframe (Mechanism 3). */
export function isEmbedded(search: string = getSearch()): boolean {
  return new URLSearchParams(search).get("embed") === "1";
}

/**
 * Strip the kit-link params (`seed`, `reopen`, `from`, `kit`, `embed`) from the
 * address bar after they've been consumed, without a reload, so a refresh or a
 * shared URL doesn't re-trigger the seed/reopen. No-op outside the browser.
 */
export function clearLinkParams(): void {
  if (typeof window === "undefined" || !window.history?.replaceState) return;
  const url = new URL(window.location.href);
  let changed = false;
  for (const key of ["seed", "reopen", "from", "kit", "embed"]) {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      changed = true;
    }
  }
  if (changed) window.history.replaceState({}, "", url.pathname + url.search + url.hash);
}

// ─── Mechanism 3: the iframe postMessage contract ───────────────────────────

/** Parent (Brand Board) → embedded tool: hand it the current blob (or nothing
 *  = a fresh canvas). The tool runs its existing `fromKitJson`/reopen on it. */
export interface EmbedLoadMessage {
  source: "opsette-embed";
  kind: "load";
  /** The full kit blob (a `toKitJson` string) or null for a fresh start. */
  payload: string | null;
}

/** Embedded tool → parent (Brand Board): the user saved inside the modal; hand
 *  the revised blob back. Brand Board re-ingests via its existing `type` route. */
export interface EmbedSaveMessage {
  source: "opsette-embed";
  kind: "save";
  /** The revised kit blob (a `toKitJson` string). */
  payload: string;
}

export type EmbedMessage = EmbedLoadMessage | EmbedSaveMessage;

const EMBED_SOURCE = "opsette-embed";

/** Type guard + trust check for an inbound embed message. ALWAYS verify origin
 *  before trusting a postMessage — the one security must-do here. In dev the
 *  parent may be on localhost, so extra trusted origins can be supplied. */
export function isTrustedEmbedMessage(
  event: MessageEvent,
  extraOrigins: readonly string[] = [],
): event is MessageEvent<EmbedMessage> {
  const trusted = [OPSETTE_TOOLS_ORIGIN, ...extraOrigins];
  if (!trusted.includes(event.origin)) return false;
  const m = event.data as Partial<EmbedMessage> | null;
  if (!m || typeof m !== "object") return false;
  if (m.source !== EMBED_SOURCE) return false;
  return m.kind === "load" || m.kind === "save";
}

/** Build a well-formed `load` message (parent → child). */
export function embedLoad(payload: string | null): EmbedLoadMessage {
  return { source: EMBED_SOURCE, kind: "load", payload };
}

/** Build a well-formed `save` message (child → parent). */
export function embedSave(payload: string): EmbedSaveMessage {
  return { source: EMBED_SOURCE, kind: "save", payload };
}

// ─── internal ───────────────────────────────────────────────────────────────

function getSearch(): string {
  return typeof window === "undefined" ? "" : window.location.search;
}
