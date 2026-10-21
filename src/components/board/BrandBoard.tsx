import { forwardRef, type CSSProperties, type ReactNode } from "react";
import type { BrandBoardData, PageId, SocialAsset } from "./board.types";
import { blockPresence, pageBlocks, PAGE_META } from "./board.types";
import { layoutClass, type LayoutId } from "./layouts";
import {
  GUIDE_INTRO,
  ROLE_KEY,
  TYPE_NOTE,
  APP_REF,
  SIZE_GROUPS,
  GUIDE_FOOTER,
} from "./guide-content";
import "./board-template.css";

// The small trimmed maker logo (120px tall, ~8.5KB), never the full-size file:
// it is baked into every exported PNG and PDF page.
const MAKER_LOGO = `${import.meta.env.BASE_URL}deebuilt-logo-pdf.png`;

/** Rec. 601 luma → readable ink for text sitting on a color field. */
function readableInk(hex: string): string {
  let h = hex.replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  if (Number.isNaN(n) || h.length !== 6) return "#1a1714";
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "#1a1714" : "#ffffff";
}

/**
 * The shared page-level CSS custom properties (paper, ink, muted, hairline,
 * fonts, hero colors). Both the composed BrandPage and the prose GuidePage read
 * from the same tokens so every page in the set matches. Kept as one helper so
 * the token math lives in exactly one place.
 */
function pageStyleVars(data: BrandBoardData): CSSProperties {
  const primary = data.colors[0]?.hex || "#2f4f46";
  const secondary = data.colors[1]?.hex || primary;
  const heroInk = readableInk(primary);
  const pageInk = readableInk(data.pageColor);
  const onLightPage = pageInk === "#1a1714";

  const inkColor = data.roles?.heading ?? pageInk;
  const mutedColor =
    data.roles?.mutedText ?? (onLightPage ? "#8a8178" : "rgba(255,255,255,0.6)");
  const hairlineColor =
    data.roles?.border ?? (onLightPage ? "#e2dccf" : "rgba(255,255,255,0.18)");

  return {
    ["--bb-primary" as string]: primary,
    ["--bb-secondary" as string]: secondary,
    ["--bb-hero-ink" as string]: heroInk,
    ["--bb-paper" as string]: data.pageColor,
    ["--bb-ink" as string]: inkColor,
    ["--bb-muted" as string]: mutedColor,
    ["--bb-hairline" as string]: hairlineColor,
    ["--bb-accent" as string]: primary,
    ["--bb-heading-font" as string]: `"${data.headingFont}"`,
    ["--bb-body-font" as string]: `"${data.bodyFont}"`,
  };
}

interface BrandPageProps {
  data: BrandBoardData;
  /** Which page this node renders. Its blocks are the page's slice of content. */
  page: PageId;
  /** Where this page sits in the SET (for the "01 / 03" counter). */
  pageNumber: number;
  totalPages: number;
}

/**
 * BrandPage — ONE fixed-size poster page (1600×2000) of the deliverable. It
 * renders the shared header + footer (so every page reads as one set) and only
 * the blocks that belong to `page`. Its layout comes from
 * data.pageLayouts[page], so each page composes independently. The forwarded
 * ref is what the exporter snapshots — one PNG per page.
 */
export const BrandPage = forwardRef<HTMLDivElement, BrandPageProps>(
  function BrandPage({ data, page, pageNumber, totalPages }, ref) {
    const present = blockPresence(data);
    const blocks = new Set(pageBlocks(page));
    const shows = (b: keyof typeof present) => blocks.has(b) && present[b];

    const layout: LayoutId = data.pageLayouts[page];
    const primary = data.colors[0]?.hex || "#2f4f46";

    // The CTA/button color for the in-use mock: prefer a brand color the user
    // labeled Button/CTA/Primary/Accent; otherwise the most colorful (least
    // neutral) brand color; otherwise the palette primary.
    const ctaColor = (() => {
      const labeled = data.colors.find((c) =>
        /button|cta|primary|accent/i.test(c.label),
      );
      if (labeled) return labeled.hex;
      const spread = (hex: string) => {
        const n = parseInt(hex.replace("#", ""), 16);
        if (Number.isNaN(n)) return 0;
        const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
        return Math.max(r, g, b) - Math.min(r, g, b);
      };
      const colorful = [...data.colors].sort((a, b) => spread(b.hex) - spread(a.hex))[0];
      return colorful?.hex || primary;
    })();

    const pageStyle = pageStyleVars(data);

    const meta = PAGE_META[page];

    return (
      <div
        className={`bb-board bb-page bb-page-${page} ${layoutClass(layout)}`}
        ref={ref}
        style={pageStyle}
      >
        {/* ================= HERO / PAGE HEADER ================= */}
        <div className="bb-hero">
          <div className="bb-hero-top">
            <span className="bb-eyebrow">
              {meta.index} — {meta.title}
            </span>
            {data.logoDataUrl && (
              <div className={`bb-logo-slot bb-logo-chip-${data.logoChip}`}>
                <img src={data.logoDataUrl} alt="" />
              </div>
            )}
          </div>
          <div className="bb-hero-title">
            <h1 className="bb-hero-name">{data.kitName || "Your Brand"}</h1>
            {data.tagline.trim() && <p className="bb-hero-tagline">{data.tagline}</p>}
          </div>
        </div>

        {/* ================= BODY ================= */}
        <div className="bb-body">
          {shows("palette") && <PaletteBlock data={data} />}
          {shows("type") && <TypographyBlock data={data} />}
          {shows("context") && data.roles && (
            <ContextBlock data={data} ctaColor={ctaColor} readableInk={readableInk} />
          )}
          {shows("signature") && data.signatureHtml && (
            <SignatureBlock html={data.signatureHtml} />
          )}
          {shows("card") && (data.cardDataUrl || data.cardQrDataUrl) && (
            <CardBlock src={data.cardDataUrl} qr={data.cardQrDataUrl} />
          )}
          {shows("qr") && data.qrDataUrl && <QrBlock src={data.qrDataUrl} />}
          {shows("social") && (
            <AssetGroupBlock
              label="Social & Brand Assets"
              assets={data.socialAssets}
              className="bb-block-social"
            />
          )}
          {shows("banner") && (
            <AssetGroupBlock
              label="Social Banners"
              assets={data.bannerAssets}
              className="bb-block-social bb-block-banner"
            />
          )}
        </div>

        {/* ================= FOOTER ================= */}
        <div className="bb-foot">
          <span className="bb-foot-text">
            {data.kitName ? `${data.kitName} — Brand Guide` : "Brand Guide"}
            {totalPages > 1 && (
              <span className="bb-foot-page">
                {" · "}
                {String(pageNumber).padStart(2, "0")} / {String(totalPages).padStart(2, "0")}
              </span>
            )}
          </span>
          <span className="bb-foot-mark">
            <img src={MAKER_LOGO} alt="" crossOrigin="anonymous" />
            Made with DeeBuilt
          </span>
        </div>
      </div>
    );
  },
);

// ------------------------------------------------------------------ blocks ----

function Block({ label, className, children }: { label: string; className: string; children: ReactNode }) {
  return (
    <section className={`bb-block ${className}`}>
      <h2 className="bb-block-label">{label}</h2>
      {children}
    </section>
  );
}

function PaletteBlock({ data }: { data: BrandBoardData }) {
  return (
    <Block label="Palette" className="bb-block-palette">
      <div className="bb-swatches">
        {data.colors.map((c) => {
          const ink = readableInk(c.hex);
          return (
            <div key={c.id} className="bb-swatch" style={{ background: c.hex, color: ink }}>
              {c.label.trim() && <span className="bb-swatch-role">{c.label}</span>}
              <span className="bb-swatch-hex">{c.hex.toUpperCase()}</span>
            </div>
          );
        })}
      </div>
      {/* Tint/shade ramps are intentionally NOT shown on the board. They're a
          real deliverable, but the client gets them in their separate Palette
          Studio export; on this high-level one-page summary they cost the
          vertical room the In-Use mock needs. Data still rides along in the
          project file. */}
      {/* The semantic role strip used to render here too, but it duplicated the
          role colors the big labeled swatch cards above already show (a palette's
          brand colors ARE labeled with their roles). Showing both buried the
          In-Use mock off the fixed page. The big cards are the keeper; the role
          data still lives in the left panel + project file. */}
    </Block>
  );
}

function TypographyBlock({ data }: { data: BrandBoardData }) {
  return (
    <Block label="Typography" className="bb-block-type">
      <div className="bb-type-heading-block">
        <p className="bb-type-heading-sample">Aa</p>
        <div className="bb-type-heading-meta">
          <span className="bb-type-role">Heading</span>
          <span className="bb-type-name">{data.headingFont}</span>
        </div>
      </div>
      <div className="bb-type-body-block">
        <p className="bb-type-body-sample">
          The quick brown fox jumps over the lazy dog. Clean body copy sets the
          tone for every page and message the brand touches.
        </p>
        <div className="bb-type-body-meta">
          <span className="bb-type-role">Body</span>
          <span className="bb-type-name">{data.bodyFont}</span>
        </div>
      </div>
    </Block>
  );
}

function ContextBlock({
  data,
  ctaColor,
  readableInk,
}: {
  data: BrandBoardData;
  ctaColor: string;
  readableInk: (hex: string) => string;
}) {
  if (!data.roles) return null;
  return (
    <Block label="In Use" className="bb-block-context">
      <div
        className="bb-mock"
        style={{ background: data.roles.background, borderColor: data.roles.border }}
      >
        <div
          className="bb-mock-card"
          style={{ background: data.roles.surface, borderColor: data.roles.border }}
        >
          <span className="bb-mock-eyebrow" style={{ color: ctaColor }}>
            {data.kitName || "Your Brand"}
          </span>
          <h3 className="bb-mock-heading" style={{ color: data.roles.heading }}>
            A headline in your brand
          </h3>
          <p className="bb-mock-body" style={{ color: data.roles.text }}>
            Body copy sits on the surface color, easy to read. Muted text handles
            the quieter details below.
          </p>
          <p className="bb-mock-muted" style={{ color: data.roles.mutedText }}>
            Supporting caption · updated today
          </p>
          <span
            className="bb-mock-button"
            style={{ background: ctaColor, color: readableInk(ctaColor) }}
          >
            Primary action
          </span>
        </div>
      </div>
    </Block>
  );
}

/* Signature is injected INLINE (not an iframe): html-to-image cannot rasterize
   cross-frame iframe content. The signature HTML is fully self-contained, so
   inline injection renders faithfully and exports correctly. */
function SignatureBlock({ html }: { html: string }) {
  return (
    <Block label="Email Signature" className="bb-block-signature">
      <div className="bb-signature-frame">
        <div className="bb-signature-card">
          <div className="bb-signature-scaler">
            <div className="bb-signature-inner" dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        </div>
      </div>
    </Block>
  );
}

function CardBlock({ src, qr }: { src: string | null; qr?: string | null }) {
  return (
    <Block label="Digital Card" className="bb-block-card">
      <div className="bb-card-row">
        {src && (
          <div className="bb-card-tile">
            <img src={src} alt="digital card" />
          </div>
        )}
        {qr && (
          <div className="bb-card-qr">
            <div className="bb-card-qr-tile">
              <img src={qr} alt="contact QR code" />
            </div>
            <span className="bb-card-qr-caption">Scan to save contact</span>
          </div>
        )}
      </div>
    </Block>
  );
}

function QrBlock({ src }: { src: string }) {
  return (
    <section className="bb-block bb-block-qr">
      <div className="bb-qr-tile">
        <img src={src} alt="qr code" />
      </div>
      <span className="bb-qr-caption">Scan</span>
    </section>
  );
}

// A titled grid of labeled images. Renders both groups on the Social page: Icon
// Kit's brand assets (socialAssets) and Banner Designer's banners (bannerAssets),
// each with its own heading. Same grid + wide-ratio handling for both.
function AssetGroupBlock({
  label,
  assets,
  className,
}: {
  label: string;
  assets: SocialAsset[];
  className: string;
}) {
  return (
    <Block label={label} className={className}>
      <div className="bb-social-grid">
        {assets.map((a) => {
          const ratio = a.width && a.height ? a.width / a.height : 1;
          const wide = ratio >= 1.8;
          return (
            <div
              key={a.id}
              className={wide ? "bb-social-item bb-social-wide" : "bb-social-item"}
            >
              <div className="bb-social-frame">
                <img src={a.image} alt={a.label} />
              </div>
              {a.label && <span className="bb-social-label">{a.label}</span>}
            </div>
          );
        })}
      </div>
    </Block>
  );
}

// ---------------------------------------------------------------- guide page --

interface GuidePageProps {
  data: BrandBoardData;
  pageNumber: number;
  totalPages: number;
}

/**
 * GuidePage — the "how to use this kit" poster. Unlike the other three pages it
 * doesn't compose imported assets; it renders reusable prose (from
 * guide-content.ts) with a few interpolated bits: the client's role colors keyed
 * to their jobs, their font names, and one-liners for whichever applications the
 * kit carries. Shares the hero + footer chrome and the page tokens so it reads
 * as the same set, and rasterizes at the same fixed 1600×2000 size.
 *
 * This is the at-a-glance page. The long step-by-step instructions live in the
 * separate How_To_Use.pdf, not here.
 */
export const GuidePage = forwardRef<HTMLDivElement, GuidePageProps>(
  function GuidePage({ data, pageNumber, totalPages }, ref) {
    const pageStyle = pageStyleVars(data);
    const meta = PAGE_META.guide;

    // The role key needs a palette that carried semantic roles. If a client's
    // palette had no roles, fall back to their brand colors so the key still
    // shows real colors (labeled by their brand role) rather than an empty block.
    const roleRows = data.roles
      ? ROLE_KEY.map((r) => ({ name: r.name, job: r.job, hex: data.roles![r.key] }))
      : data.colors.slice(0, 6).map((c) => ({
          name: c.label.trim() || "Brand color",
          job: "Part of your core palette.",
          hex: c.hex,
        }));

    const appRows = APP_REF.filter((r) => r.present(data));
    const hasSocial = data.socialAssets.length > 0 || data.bannerAssets.length > 0;

    return (
      <div
        className="bb-board bb-page bb-page-guide bb-layout-stack"
        ref={ref}
        style={pageStyle}
      >
        {/* Slim brand band — same compact header the Applications/Social pages use. */}
        <div className="bb-hero">
          <div className="bb-hero-top">
            <span className="bb-eyebrow">
              {meta.index} — {meta.title}
            </span>
            {data.logoDataUrl && (
              <div className={`bb-logo-slot bb-logo-chip-${data.logoChip}`}>
                <img src={data.logoDataUrl} alt="" />
              </div>
            )}
          </div>
          <div className="bb-hero-title">
            <h1 className="bb-hero-name">{data.kitName || "Your Brand"}</h1>
          </div>
        </div>

        <div className="bb-body bb-guide-body">
          <p className="bb-guide-intro">{GUIDE_INTRO}</p>

          {/* ---- Colors: the role key (the star block) ---- */}
          <section className="bb-block bb-guide-colors">
            <h2 className="bb-block-label">Your colors, and where each goes</h2>
            <div className="bb-guide-role-grid">
              {roleRows.map((r, i) => (
                <div key={i} className="bb-guide-role">
                  <span
                    className="bb-guide-role-chip"
                    style={{ background: r.hex, borderColor: "var(--bb-hairline)" }}
                  />
                  <div className="bb-guide-role-meta">
                    <span className="bb-guide-role-name">{r.name}</span>
                    <span className="bb-guide-role-job">{r.job}</span>
                    <span className="bb-guide-role-hex">{r.hex.toUpperCase()}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ---- Type + Applications sit side by side ---- */}
          <div className="bb-guide-split">
            <section className="bb-block bb-guide-type">
              <h2 className="bb-block-label">{TYPE_NOTE.label}</h2>
              <p className="bb-guide-type-line">
                <strong>{data.headingFont}</strong> — {TYPE_NOTE.headingLead}
              </p>
              <p className="bb-guide-type-line">
                <strong>{data.bodyFont}</strong> — {TYPE_NOTE.bodyLead}
              </p>
              <p className="bb-guide-type-note">{TYPE_NOTE.note}</p>
            </section>

            {appRows.length > 0 && (
              <section className="bb-block bb-guide-apps">
                <h2 className="bb-block-label">Your files</h2>
                <div className="bb-guide-app-list">
                  {appRows.map((r) => (
                    <div key={r.file} className="bb-guide-app">
                      <span className="bb-guide-app-file">{r.file}</span>
                      <span className="bb-guide-app-what">{r.what}</span>
                      <span className="bb-guide-app-todo">{r.todo}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* ---- Social sizing table (only when the kit carries assets) ---- */}
          {hasSocial && (
            <section className="bb-block bb-guide-sizes">
              <h2 className="bb-block-label">Where each social size goes</h2>
              <div className="bb-guide-size-grid">
                {SIZE_GROUPS.map((g) => (
                  <div key={g.heading} className="bb-guide-size-group">
                    <span className="bb-guide-size-heading">{g.heading}</span>
                    <span className="bb-guide-size-note">{g.note}</span>
                    <div className="bb-guide-size-rows">
                      {g.items.map((it) => (
                        <div key={it.name} className="bb-guide-size-row">
                          <span className="bb-guide-size-name">{it.name}</span>
                          <span className="bb-guide-size-dim">{it.size}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <div className="bb-foot">
          <span className="bb-foot-text">
            {data.kitName ? `${data.kitName} — Brand Guide` : "Brand Guide"}
            {totalPages > 1 && (
              <span className="bb-foot-page">
                {" · "}
                {String(pageNumber).padStart(2, "0")} / {String(totalPages).padStart(2, "0")}
              </span>
            )}
          </span>
          <span className="bb-foot-mark">
            <img src={MAKER_LOGO} alt="" crossOrigin="anonymous" />
            {GUIDE_FOOTER}
          </span>
        </div>
      </div>
    );
  },
);
