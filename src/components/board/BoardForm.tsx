import { useRef, useState } from "react";
import {
  Button,
  Collapse,
  Input,
  Segmented,
  Space,
  Typography,
  Upload,
  message,
} from "antd";
import {
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  MinusOutlined,
  PlusOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import type { CollapseProps } from "antd";
import type { BrandBoardData, SocialAsset, PageId } from "./board.types";
import { MAX_COLORS, PAGE_META, presentPages } from "./board.types";
import { layoutsForPage, type LayoutId } from "./layouts";
import FormSection from "./FormSection";
import { resolvePairingId } from "@/lib/fonts";
import { getPairing } from "@/lib/shared-fonts";
import { OpsetteFontPicker } from "@/components/opsette-font-picker";
import {
  ingestPalettePayload,
  ingestSignaturePayload,
  ingestQrPayload,
  ingestCardPayload,
  ingestSocialPayload,
} from "./ingest";
import { uuid } from "@/lib/uuid";
import { analyzeLogoChip } from "./logoChip";
import type { EmbedToolKey } from "./embedTools";

const { Text } = Typography;

// A small reusable "Edit in <Tool> — no tab" call-to-action shown atop each asset
// section when the in-place drawer is available (Mechanism 3). The manual paste
// box stays below it as the fallback.
function EditInToolButton({
  onClick,
  hasBlob,
  verbNew,
  verbEdit,
}: {
  onClick: () => void;
  hasBlob: boolean;
  verbNew: string;
  verbEdit: string;
}) {
  return (
    <>
      <Button type="primary" icon={<EditOutlined />} onClick={onClick} block>
        {hasBlob ? verbEdit : verbNew}
      </Button>
      <Text type="secondary" className="bb-text-fine">
        Opens right here — no new tab. Save inside and it flows back onto the board.
      </Text>
      <Text type="secondary" className="bb-text-fine" style={{ opacity: 0.8 }}>
        Or paste an export blob manually:
      </Text>
    </>
  );
}

interface BoardFormProps {
  data: BrandBoardData;
  onChange: (next: BrandBoardData) => void;
  /** The page currently on screen — its form section is marked active. */
  activePage: PageId;
  /** Bring a page into the preview (clicking a numbered section heading). */
  onSelectPage?: (page: PageId) => void;
  /** Open a tool's in-place editor (Mechanism 3 drawer). When set, each asset
   *  section offers "Edit in <Tool>" — no tab, no copy/paste. */
  onEditTool?: (key: EmbedToolKey) => void;
}

// Read an uploaded image file to a data URL + intrinsic size.
function readImage(
  file: File,
  cb: (dataUrl: string, w: number | null, h: number | null) => void,
) {
  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = reader.result as string;
    const img = new Image();
    img.onload = () => cb(dataUrl, img.naturalWidth, img.naturalHeight);
    img.onerror = () => cb(dataUrl, null, null);
    img.src = dataUrl;
  };
  reader.readAsDataURL(file);
}

// An import row's label: what it adds to the board, then its source tool.
function ImportLabel({ name, source }: { name: string; source: string }) {
  return (
    <>
      {name}
      <span className="bb-import-label__source">{source}</span>
    </>
  );
}

// The import rows of one form section. Every section's rows share the same
// collapse look (plus / minus), so it lives here once.
function ImportCollapse({
  items,
  defaultOpen,
}: {
  items: CollapseProps["items"];
  defaultOpen?: string[];
}) {
  return (
    <Collapse
      defaultActiveKey={defaultOpen}
      size="small"
      expandIcon={({ isActive }) => (isActive ? <MinusOutlined /> : <PlusOutlined />)}
      items={items}
    />
  );
}

export function BoardForm({ data, onChange, activePage, onSelectPage, onEditTool }: BoardFormProps) {
  const patch = (p: Partial<BrandBoardData>) => onChange({ ...data, ...p });

  // The logo-chip analysis is async and resolves AFTER other edits may have
  // landed. Merging its result onto the render-time `data` would revert those.
  // This ref always points at the latest data, so the async patch merges onto
  // current state and only touches logoChip.
  const dataRef = useRef(data);
  dataRef.current = data;
  const patchLatest = (p: Partial<BrandBoardData>) =>
    onChange({ ...dataRef.current, ...p });

  // Each page carries its own layout in data.pageLayouts and offers only the
  // layouts that suit it. The picker sits in that page's form section and only
  // renders where there's a real choice (Foundation, today).
  const renderLayoutPicker = (page: PageId) => {
    const options = layoutsForPage(page);
    if (options.length < 2) return null;
    const current = data.pageLayouts[page];
    return (
      <div>
        <Text strong>Layout</Text>
        <Segmented
          block
          style={{ marginTop: 8 }}
          value={current}
          onChange={(v) => patch({ pageLayouts: { ...data.pageLayouts, [page]: v as LayoutId } })}
          options={options.map((l) => ({ label: l.name, value: l.id }))}
        />
        <Text type="secondary" className="bb-text-fine" style={{ display: "block", marginTop: 6 }}>
          {options.find((l) => l.id === current)?.blurb}
        </Text>
      </div>
    );
  };

  // A numbered section's heading switches the preview to its page — once that
  // page exists. Until then the heading is plain and the hint says what makes it.
  const pages = presentPages(data);
  const sectionProps = (page: PageId) => ({
    index: PAGE_META[page].index,
    title: PAGE_META[page].title,
    active: page === activePage,
    onSelect: onSelectPage && pages.includes(page) ? () => onSelectPage(page) : undefined,
  });
  // Seed the paste fields from any already-imported blobs so a reloaded/opened
  // board shows exactly what was imported — the input is never a black hole.
  // Re-seed whenever Open swaps in a DIFFERENT stored blob: a plain once-only
  // useState initializer wouldn't update on reopen (this component reconciles
  // rather than remounts), which is what made a reopened kit look empty even
  // though the blob was loaded and the Copy button worked.
  const [paletteBlob, setPaletteBlob] = useState(data.sourceBlobs.palette ?? "");
  const lastPaletteSeed = useRef(data.sourceBlobs.palette);
  if (data.sourceBlobs.palette !== lastPaletteSeed.current) {
    lastPaletteSeed.current = data.sourceBlobs.palette;
    setPaletteBlob(data.sourceBlobs.palette ?? "");
  }
  const [signatureBlob, setSignatureBlob] = useState(data.sourceBlobs.signature ?? "");
  const lastSignatureSeed = useRef(data.sourceBlobs.signature);
  if (data.sourceBlobs.signature !== lastSignatureSeed.current) {
    lastSignatureSeed.current = data.sourceBlobs.signature;
    setSignatureBlob(data.sourceBlobs.signature ?? "");
  }

  const copyBlob = async (blob: string | null, label: string) => {
    if (!blob) return;
    try {
      await navigator.clipboard.writeText(blob);
      message.success(`${label} copied`);
    } catch {
      message.error("Couldn't copy — select the text and copy manually.");
    }
  };

  const handlePastePalette = () => {
    const next = ingestPalettePayload(paletteBlob, data);
    if (next) {
      // Keep the raw blob in state (re-copyable + archived), don't wipe input.
      onChange({
        ...next,
        sourceBlobs: { ...next.sourceBlobs, palette: paletteBlob.trim() },
      });
      message.success("Palette imported from Palette Studio");
    } else {
      message.error("That doesn't look like a Palette Studio export.");
    }
  };

  const handlePasteSignature = () => {
    const html = ingestSignaturePayload(signatureBlob);
    if (html) {
      onChange({
        ...data,
        signatureHtml: html,
        sourceBlobs: { ...data.sourceBlobs, signature: signatureBlob.trim() },
      });
      message.success("Signature imported");
    } else {
      message.error("That doesn't look like a Signature Studio export.");
    }
  };

  return (
    <div className="bb-form-stack">
      {/* The form follows the board: Brand fills every page, then one section
          per numbered page holding the inputs that fill it. */}
      <FormSection title="Brand">
      <div>
        <Text strong>Brand name</Text>
        <Input
          size="large"
          placeholder="e.g. Meridian Studio"
          value={data.kitName}
          onChange={(e) => patch({ kitName: e.target.value })}
          style={{ marginTop: 6 }}
        />
      </div>

      <div>
        <Text strong>Tagline</Text>
        <Input
          placeholder="A short line that sums up the brand"
          value={data.tagline}
          onChange={(e) => patch({ tagline: e.target.value })}
          style={{ marginTop: 6 }}
          maxLength={90}
        />
      </div>

      <div>
        <Text strong>Page color</Text>
        <div style={{ marginTop: 6, display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="color"
            value={data.pageColor}
            onChange={(e) => patch({ pageColor: e.target.value.toUpperCase() })}
            style={{ width: 34, height: 32, border: "none", background: "none", padding: 0 }}
          />
          <Input
            size="small"
            value={data.pageColor}
            onChange={(e) => patch({ pageColor: e.target.value.toUpperCase() })}
            className="bb-mono"
            style={{ width: 100 }}
          />
          <Segmented
            size="small"
            value={data.pageColor.toUpperCase()}
            onChange={(v) => patch({ pageColor: v as string })}
            options={[
              { label: "Bone", value: "#F6F3EC" },
              { label: "White", value: "#FFFFFF" },
              { label: "Ink", value: "#141210" },
            ]}
          />
        </div>
      </div>

      <div>
        <Text strong>Logo</Text>
        <div style={{ marginTop: 6, display: "flex", gap: 10, alignItems: "center" }}>
          <Upload
            accept="image/png,image/jpeg,image/svg+xml,image/webp"
            showUploadList={false}
            beforeUpload={(file) => {
              readImage(file, (logoDataUrl, logoWidth, logoHeight) => {
                // Show the logo immediately; reset chip so a prior logo's
                // decision doesn't linger while we re-sample.
                patch({ logoDataUrl, logoWidth, logoHeight, logoChip: "none" });
                // Sample the logo's pixels to decide its safe-chip backing, then
                // patch it in when ready (async — merges onto latest state).
                void analyzeLogoChip(logoDataUrl).then((logoChip) =>
                  patchLatest({ logoChip }),
                );
              });
              return false;
            }}
          >
            <Button icon={<UploadOutlined />}>
              {data.logoDataUrl ? "Replace" : "Upload logo"}
            </Button>
          </Upload>
          {data.logoDataUrl && (
            <>
              <img
                src={data.logoDataUrl}
                alt="logo"
                style={{ height: 34, width: "auto", borderRadius: 4 }}
              />
              <Button
                type="text"
                icon={<DeleteOutlined />}
                onClick={() =>
                  patch({ logoDataUrl: null, logoWidth: null, logoHeight: null, logoChip: "none" })
                }
              />
            </>
          )}
        </div>
      </div>

      </FormSection>

      <FormSection {...sectionProps("foundation")}>
      {renderLayoutPicker("foundation")}
      <ImportCollapse
        defaultOpen={["palette"]}
        items={[
          {
            key: "palette",
            label: <ImportLabel name="Colors & fonts" source="Palette Studio" />,
            children: (
              <Space direction="vertical" style={{ width: "100%" }} size={8}>
                {onEditTool && (
                  <EditInToolButton
                    onClick={() => onEditTool("palette")}
                    hasBlob={!!data.sourceBlobs.palette}
                    verbNew="Build a palette in Palette Studio"
                    verbEdit="Edit palette in Palette Studio"
                  />
                )}
                <Input.TextArea
                  rows={3}
                  placeholder='Paste the "Export to Brand Board" blob from Palette Studio'
                  value={paletteBlob}
                  onChange={(e) => setPaletteBlob(e.target.value)}
                  className="bb-mono bb-text-fine"
                />
                <Space>
                  <Button onClick={handlePastePalette} disabled={!paletteBlob.trim()}>
                    Import palette
                  </Button>
                  {data.sourceBlobs.palette && (
                    <Button
                      icon={<CopyOutlined />}
                      onClick={() => copyBlob(data.sourceBlobs.palette, "Palette blob")}
                    >
                      Copy blob
                    </Button>
                  )}
                </Space>
                {data.sourceBlobs.palette && (
                  <Text type="success" className="bb-text-fine">
                    ✓ Imported — this data is saved with the board.
                  </Text>
                )}
                {data.colors.length > 0 && (
                  <>
                    <Text type="secondary" className="bb-text-fine">Brand colors</Text>
                    <ColorList data={data} onChange={onChange} />
                  </>
                )}
                {data.roles && (
                  <>
                    <Text type="secondary" className="bb-text-fine" style={{ marginTop: 4 }}>
                      Role colors
                    </Text>
                    <RolesList data={data} onChange={onChange} />
                  </>
                )}
                <div>
                  <Text type="secondary" className="bb-text-fine">Font pairing</Text>
                  <div style={{ marginTop: 4 }}>
                    <OpsetteFontPicker
                      size="small"
                      value={resolvePairingId({
                        fontPairingId: data.fontPairingId ?? undefined,
                        headingFont: data.headingFont,
                        bodyFont: data.bodyFont,
                      })}
                      onChange={(id) => {
                        const p = getPairing(id);
                        patch({
                          headingFont: p.heading.family,
                          bodyFont: p.body.family,
                          fontPairingId: p.id,
                        });
                      }}
                    />
                  </div>
                </div>
              </Space>
            ),
          },
        ]}
      />
      </FormSection>

      <FormSection
        {...sectionProps("applications")}
        hint={pages.includes("applications") ? undefined : "Add any of these to create this page."}
      >
      {renderLayoutPicker("applications")}
      <ImportCollapse
        items={[
          {
            key: "signature",
            label: <ImportLabel name="Email signature" source="Signature Studio" />,
            children: (
              <Space direction="vertical" style={{ width: "100%" }} size={8}>
                {onEditTool && (
                  <EditInToolButton
                    onClick={() => onEditTool("signature")}
                    hasBlob={!!data.sourceBlobs.signature}
                    verbNew="Build a signature in Signature Studio"
                    verbEdit="Edit signature in Signature Studio"
                  />
                )}
                <Input.TextArea
                  rows={3}
                  placeholder='Paste the "Export to Brand Board" blob from Signature Studio'
                  value={signatureBlob}
                  onChange={(e) => setSignatureBlob(e.target.value)}
                  className="bb-mono bb-text-fine"
                />
                <Space wrap>
                  <Button onClick={handlePasteSignature} disabled={!signatureBlob.trim()}>
                    Import signature
                  </Button>
                  {data.sourceBlobs.signature && (
                    <Button
                      icon={<CopyOutlined />}
                      onClick={() => copyBlob(data.sourceBlobs.signature, "Signature blob")}
                    >
                      Copy blob
                    </Button>
                  )}
                  {data.signatureHtml && (
                    <Button
                      type="text"
                      icon={<DeleteOutlined />}
                      onClick={() =>
                        onChange({
                          ...data,
                          signatureHtml: null,
                          sourceBlobs: { ...data.sourceBlobs, signature: null },
                        })
                      }
                    >
                      Remove
                    </Button>
                  )}
                </Space>
                {data.sourceBlobs.signature && (
                  <Text type="success" className="bb-text-fine">
                    ✓ Imported — this data is saved with the board.
                  </Text>
                )}
              </Space>
            ),
          },
          {
            key: "qr",
            label: <ImportLabel name="QR code" source="QR Creator" />,
            children: (
              <Space direction="vertical" style={{ width: "100%" }} size={8}>
                {onEditTool && (
                  <EditInToolButton
                    onClick={() => onEditTool("qr")}
                    hasBlob={!!data.sourceBlobs.qr}
                    verbNew="Build a QR in QR Creator"
                    verbEdit="Edit QR in QR Creator"
                  />
                )}
                <BlobAsset
                  data={data}
                  onChange={onChange}
                  assetKey="qr"
                  imageKey="qrDataUrl"
                  ingest={ingestQrPayload}
                  assetLabel="QR"
                />
              </Space>
            ),
          },
          {
            key: "card",
            label: <ImportLabel name="Digital card" source="Digital Card" />,
            children: (
              <Space direction="vertical" style={{ width: "100%" }} size={8}>
                {onEditTool && (
                  <EditInToolButton
                    onClick={() => onEditTool("card")}
                    hasBlob={!!data.sourceBlobs.card}
                    verbNew="Build a card in Digital Card"
                    verbEdit="Edit card in Digital Card"
                  />
                )}
                <BlobAsset
                  data={data}
                  onChange={onChange}
                  assetKey="card"
                  imageKey="cardDataUrl"
                  vcardKey="cardVcardDataUrl"
                  qrKey="cardQrDataUrl"
                  ingest={ingestCardPayload}
                  assetLabel="card"
                />
              </Space>
            ),
          },
        ]}
      />
      </FormSection>

      <FormSection
        {...sectionProps("social")}
        hint={pages.includes("social") ? undefined : "Add either of these to create this page."}
      >
      {renderLayoutPicker("social")}
      <ImportCollapse
        items={[
          {
            key: "banner",
            label: <ImportLabel name="Banners" source="Banner Designer" />,
            children: (
              <Space direction="vertical" style={{ width: "100%" }} size={8}>
                {onEditTool && (
                  <EditInToolButton
                    onClick={() => onEditTool("banner")}
                    hasBlob={!!data.sourceBlobs.banner}
                    verbNew="Build banners in Banner Designer"
                    verbEdit="Edit banners in Banner Designer"
                  />
                )}
                <SocialAssets
                  data={data}
                  onChange={onChange}
                  assetsKey="bannerAssets"
                  blobKey="banner"
                  sourceLabel="Banner Designer"
                  uploadPlaceholder="LinkedIn banner"
                />
              </Space>
            ),
          },
          {
            key: "social",
            label: <ImportLabel name="Social & brand assets" source="Icon Kit" />,
            children: (
              <Space direction="vertical" style={{ width: "100%" }} size={8}>
                {onEditTool && (
                  <EditInToolButton
                    onClick={() => onEditTool("social")}
                    hasBlob={!!data.sourceBlobs.social}
                    verbNew="Build assets in Icon Kit"
                    verbEdit="Edit assets in Icon Kit"
                  />
                )}
                <SocialAssets
                  data={data}
                  onChange={onChange}
                  assetsKey="socialAssets"
                  blobKey="social"
                  sourceLabel="Icon Kit"
                  uploadPlaceholder="profile avatar"
                />
              </Space>
            ),
          },
        ]}
      />
      </FormSection>

      {/* The guide has no inputs: it's written from the palette and the pages
          above, so the section only says how it appears. */}
      <FormSection
        {...sectionProps("guide")}
        hint={
          pages.includes("guide")
            ? "Builds itself from your palette and the pages above."
            : "Builds itself once you add a palette."
        }
      />
    </div>
  );
}

// --- Editable color list (colors arrive labeled from Palette Studio) ---------
function ColorList({
  data,
  onChange,
}: {
  data: BrandBoardData;
  onChange: (next: BrandBoardData) => void;
}) {
  const update = (id: string, hex: string, label: string) =>
    onChange({
      ...data,
      colors: data.colors.map((c) => (c.id === id ? { ...c, hex, label } : c)),
    });
  const remove = (id: string) =>
    onChange({ ...data, colors: data.colors.filter((c) => c.id !== id) });
  const add = () => {
    if (data.colors.length >= MAX_COLORS) return;
    onChange({ ...data, colors: [...data.colors, { id: uuid(), hex: "#888888", label: "" }] });
  };
  return (
    <Space direction="vertical" size={6} style={{ width: "100%" }}>
      {data.colors.map((c) => (
        <div key={c.id} style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input
            type="color"
            value={c.hex}
            onChange={(e) => update(c.id, e.target.value.toUpperCase(), c.label)}
            style={{ width: 34, height: 32, border: "none", background: "none", padding: 0 }}
          />
          <Input
            size="small"
            value={c.hex}
            onChange={(e) => update(c.id, e.target.value.toUpperCase(), c.label)}
            className="bb-mono"
            style={{ width: 96 }}
          />
          <Input
            size="small"
            placeholder="Role"
            value={c.label}
            onChange={(e) => update(c.id, c.hex, e.target.value)}
            style={{ flex: 1 }}
          />
          <Button size="small" type="text" icon={<DeleteOutlined />} onClick={() => remove(c.id)} />
        </div>
      ))}
      {data.colors.length < MAX_COLORS && (
        <Button size="small" onClick={add}>+ Add color</Button>
      )}
    </Space>
  );
}

// --- Editable role colors (background/surface/text/heading/muted/border) -----
const ROLE_FIELDS: { key: keyof NonNullable<BrandBoardData["roles"]>; label: string }[] = [
  { key: "background", label: "Page background" },
  { key: "surface", label: "Card background" },
  { key: "heading", label: "Heading" },
  { key: "text", label: "Body text" },
  { key: "mutedText", label: "Muted text" },
  { key: "border", label: "Border" },
];

function RolesList({
  data,
  onChange,
}: {
  data: BrandBoardData;
  onChange: (next: BrandBoardData) => void;
}) {
  if (!data.roles) return null;
  const roles = data.roles;
  const setRole = (key: keyof typeof roles, hex: string) =>
    onChange({ ...data, roles: { ...roles, [key]: hex } });

  return (
    <Space direction="vertical" size={6} style={{ width: "100%" }}>
      {ROLE_FIELDS.map(({ key, label }) => (
        <div key={key} style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input
            type="color"
            value={roles[key]}
            onChange={(e) => setRole(key, e.target.value.toUpperCase())}
            style={{ width: 34, height: 32, border: "none", background: "none", padding: 0 }}
          />
          <Input
            size="small"
            value={roles[key]}
            onChange={(e) => setRole(key, e.target.value.toUpperCase())}
            className="bb-mono"
            style={{ width: 96 }}
          />
          <Text className="bb-text-caption" style={{ flex: 1 }}>{label}</Text>
        </div>
      ))}
    </Space>
  );
}

// --- Blob-first asset (QR / card) --------------------------------------------
// Paste the app's "Export to Brand Board" blob: we STORE the whole blob (held,
// re-copyable, archived in the project file, pasteable back into its app) AND,
// if the blob carries a rendered image, show it on the board.
//
// There is deliberately NO manual image-upload fallback. QR Creator and Digital
// Card both bake `data.image` INTO the blob now (per the interop contract), so a
// single paste always brings the picture with it. The old upload path was the
// one place an image could be set WITHOUT its blob (image present, blob null →
// nothing to re-copy on reopen) — exactly the persistence gap this asset is
// meant to close. One blob in, one blob out: image and blob never diverge.
function BlobAsset({
  data,
  onChange,
  assetKey,
  imageKey,
  vcardKey,
  qrKey,
  ingest,
  assetLabel,
}: {
  data: BrandBoardData;
  onChange: (next: BrandBoardData) => void;
  assetKey: "qr" | "card";
  imageKey: "qrDataUrl" | "cardDataUrl";
  // Card-only: the field a baked vCard is stored into. QR passes no vcardKey.
  vcardKey?: "cardVcardDataUrl";
  // Card-only: the field the baked vCard QR is stored into. QR passes no qrKey.
  qrKey?: "cardQrDataUrl";
  ingest: (input: string) => { image: string | null; vcard?: string | null; qr?: string | null; ok: boolean };
  assetLabel: string;
}) {
  // Seed the paste field from the stored blob, and re-seed it whenever a reopen
  // swaps in a different stored blob — so opening a saved kit shows the exact
  // blob that came back, not a stale/empty box. (A plain once-only useState
  // initializer wouldn't update on Open, since this component reconciles rather
  // than remounts.)
  const storedBlob = data.sourceBlobs[assetKey];
  const [blob, setBlob] = useState(storedBlob ?? "");
  const lastSeeded = useRef(storedBlob);
  if (storedBlob !== lastSeeded.current) {
    lastSeeded.current = storedBlob;
    setBlob(storedBlob ?? "");
  }
  const image = data[imageKey];

  const doImport = () => {
    const { image: img, vcard, qr, ok } = ingest(blob);
    if (!ok) {
      message.error(`That doesn't look like a ${assetLabel} export.`);
      return;
    }
    onChange({
      ...data,
      // Store the image if the blob carried one; keep any existing upload if not.
      [imageKey]: img ?? data[imageKey],
      // Card-only: the vcard fully resets on every paste — a blob without a vcard
      // clears any prior one to null (same full-reset semantics as the image).
      ...(vcardKey ? { [vcardKey]: vcard ?? null } : {}),
      // Card-only: the vCard QR resets on every paste, same semantics.
      ...(qrKey ? { [qrKey]: qr ?? null } : {}),
      sourceBlobs: { ...data.sourceBlobs, [assetKey]: blob.trim() },
    });
    message.success(
      img ? `${assetLabel} imported` : `${assetLabel} data saved — upload the image below to show it`,
    );
  };

  const copyBlob = async () => {
    if (!storedBlob) return;
    try {
      await navigator.clipboard.writeText(storedBlob);
      message.success(`${assetLabel} blob copied`);
    } catch {
      message.error("Couldn't copy — select and copy manually.");
    }
  };

  const clearAll = () =>
    onChange({
      ...data,
      [imageKey]: null,
      ...(vcardKey ? { [vcardKey]: null } : {}),
      ...(qrKey ? { [qrKey]: null } : {}),
      sourceBlobs: { ...data.sourceBlobs, [assetKey]: null },
    });

  return (
    <Space direction="vertical" style={{ width: "100%" }} size={8}>
      <Input.TextArea
        rows={3}
        placeholder={`Paste the "Export to Brand Board" blob from ${assetLabel === "QR" ? "QR Creator" : "Digital Card"}`}
        value={blob}
        onChange={(e) => setBlob(e.target.value)}
        className="bb-mono bb-text-fine"
      />
      <Space wrap>
        <Button onClick={doImport} disabled={!blob.trim()}>
          Import {assetLabel}
        </Button>
        {storedBlob && (
          <Button icon={<CopyOutlined />} onClick={copyBlob}>
            Copy blob
          </Button>
        )}
        {(storedBlob || image) && (
          <Button type="text" icon={<DeleteOutlined />} onClick={clearAll}>
            Remove
          </Button>
        )}
      </Space>
      {storedBlob && (
        <Text type="success" className="bb-text-fine">
          ✓ {assetLabel} saved with the board — reopen anytime and copy it back into{" "}
          {assetLabel === "QR" ? "QR Creator" : "Digital Card"}.
        </Text>
      )}
      {/* A current blob with no image is only an OLD blob (pre-baked-image era).
          The blob is still fully stored and re-copyable; there's just nothing to
          preview. Tell the user plainly rather than offer a dead upload path. */}
      {storedBlob && !image && (
        <Text type="secondary" className="bb-text-fine">
          This older {assetLabel} blob carries no picture — re-export it from{" "}
          {assetLabel === "QR" ? "QR Creator" : "Digital Card"} to show it on the board.
        </Text>
      )}
      {image && (
        <img
          src={image}
          alt={assetLabel}
          style={{ height: 72, width: "auto", borderRadius: 6, marginTop: 4 }}
        />
      )}
    </Space>
  );
}

// --- Social / brand assets (a LIST of images) --------------------------------
// Paste a "social" blob (a list of labeled images) OR upload images manually.
// The whole blob is stored for archive/reopen; each image renders on the board by
// its natural aspect ratio.
//
// Generalized to serve BOTH slots — Icon Kit's `socialAssets` AND Banner
// Designer's `bannerAssets` — since both emit the identical type:"social" blob
// and behave identically here. The caller supplies which board field this
// instance reads/writes (`assetsKey`) and which source blob it archives
// (`blobKey`), so the two sections never touch each other's storage.
function SocialAssets({
  data,
  onChange,
  assetsKey,
  blobKey,
  sourceLabel,
  uploadPlaceholder,
}: {
  data: BrandBoardData;
  onChange: (next: BrandBoardData) => void;
  /** Which board list this instance owns. */
  assetsKey: "socialAssets" | "bannerAssets";
  /** Which source blob this instance archives. */
  blobKey: "social" | "banner";
  /** Name of the source tool, for messages/placeholder (e.g. "Icon Kit"). */
  sourceLabel: string;
  /** Placeholder for the per-item label input (e.g. "LinkedIn banner"). */
  uploadPlaceholder: string;
}) {
  const assets = data[assetsKey];
  const storedBlob = data.sourceBlobs[blobKey];
  const [blob, setBlob] = useState(storedBlob ?? "");
  // Re-seed the textarea when Open swaps in a different stored blob, so a
  // reopened kit visibly shows the blob (not just a working Copy button).
  const lastSeeded = useRef(storedBlob);
  if (storedBlob !== lastSeeded.current) {
    lastSeeded.current = storedBlob;
    setBlob(storedBlob ?? "");
  }

  const doImport = () => {
    const { assets: parsed, ok } = ingestSocialPayload(blob);
    if (!ok) {
      message.error(`That doesn't look like a ${sourceLabel} export (no images found).`);
      return;
    }
    onChange({
      ...data,
      [assetsKey]: parsed,
      sourceBlobs: { ...data.sourceBlobs, [blobKey]: blob.trim() },
    });
    message.success(`Imported ${parsed.length} asset${parsed.length === 1 ? "" : "s"}`);
  };

  const copyBlob = async () => {
    if (!storedBlob) return;
    try {
      await navigator.clipboard.writeText(storedBlob);
      message.success("Blob copied");
    } catch {
      message.error("Couldn't copy — select and copy manually.");
    }
  };

  // Accumulate across a multi-file batch: each file resolves async, so we buffer
  // results in a ref and flush once, appending to the assets present at flush
  // time — avoids siblings clobbering each other via stale closure state.
  const pendingRef = useRef<SocialAsset[]>([]);
  const flushTimer = useRef<number | null>(null);
  const addImages = (files: File[]) => {
    files.forEach((file) => {
      const r = new FileReader();
      r.onload = () => {
        const dataUrl = r.result as string;
        const img = new Image();
        const push = (w?: number, h?: number) => {
          pendingRef.current.push({
            id: uuid(),
            label: file.name.replace(/\.[^.]+$/, ""),
            image: dataUrl,
            width: w,
            height: h,
          });
          if (flushTimer.current !== null) window.clearTimeout(flushTimer.current);
          flushTimer.current = window.setTimeout(() => {
            const added = pendingRef.current;
            pendingRef.current = [];
            flushTimer.current = null;
            onChange({ ...data, [assetsKey]: [...data[assetsKey], ...added] });
          }, 60);
        };
        img.onload = () => push(img.naturalWidth, img.naturalHeight);
        img.onerror = () => push();
        img.src = dataUrl;
      };
      r.readAsDataURL(file);
    });
  };

  const removeAsset = (id: string) =>
    onChange({ ...data, [assetsKey]: data[assetsKey].filter((a) => a.id !== id) });

  const relabel = (id: string, label: string) =>
    onChange({
      ...data,
      [assetsKey]: data[assetsKey].map((a) => (a.id === id ? { ...a, label } : a)),
    });

  return (
    <Space direction="vertical" style={{ width: "100%" }} size={8}>
      <Input.TextArea
        rows={3}
        placeholder={`Paste the "Export to Brand Board" blob from ${sourceLabel}`}
        value={blob}
        onChange={(e) => setBlob(e.target.value)}
        className="bb-mono bb-text-fine"
      />
      <Space wrap>
        <Button onClick={doImport} disabled={!blob.trim()}>
          Import assets
        </Button>
        {storedBlob && (
          <Button icon={<CopyOutlined />} onClick={copyBlob}>
            Copy blob
          </Button>
        )}
        <Upload
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          showUploadList={false}
          multiple
          beforeUpload={(file) => {
            addImages([file as File]);
            return false;
          }}
        >
          <Button icon={<UploadOutlined />}>Upload images</Button>
        </Upload>
      </Space>
      {assets.length > 0 && (
        <Space direction="vertical" size={6} style={{ width: "100%" }}>
          {assets.map((a) => (
            <div key={a.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <img
                src={a.image}
                alt=""
                style={{ height: 32, width: "auto", maxWidth: 56, borderRadius: 4 }}
              />
              <Input
                size="small"
                value={a.label}
                placeholder={`Label (e.g. ${uploadPlaceholder})`}
                onChange={(e) => relabel(a.id, e.target.value)}
                style={{ flex: 1 }}
              />
              <Button
                size="small"
                type="text"
                icon={<DeleteOutlined />}
                onClick={() => removeAsset(a.id)}
              />
            </div>
          ))}
        </Space>
      )}
    </Space>
  );
}
