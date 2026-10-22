import { useMemo, useState } from "react";
import {
  Modal,
  Input,
  Button,
  Space,
  Typography,
  Upload,
  ColorPicker,
  Alert,
  Tooltip,
  message,
} from "antd";
import {
  RocketOutlined,
  CopyOutlined,
  LinkOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import type { UploadProps } from "antd";
import {
  encodeSeed,
  buildSeedLink,
  SLUGS,
  LOGO_SEED_MAX_BYTES,
  type BrandCore,
} from "@/lib/opsette-kit-link";
import type { BrandBoardData } from "@/components/board/board.types";

const { Text, Paragraph, Link } = Typography;

/**
 * The "New client kit" starter — the front door to the whole tool suite
 * (Mechanism 1 of docs/KIT-SUITE-CONNECT-PLAN.md). Turns "set up 6 tabs and
 * re-type the same 4 brand facts into each" into "fill one form."
 *
 * Fill name / tagline / logo / seed color once → it builds a tiny brand-core
 * seed and hands you a pre-seeded link to each tool. Click a link and the tool
 * opens already looking like the client (brand color, font, name, logo) instead
 * of a blank default.
 *
 * Pre-fills from the CURRENT board, so if you've already pasted a palette, the
 * color + font are filled in for you.
 */

// The tools that read a ?seed= (everything except Brand Board itself, which is
// the hub building these links). Order = the order you'd build a kit.
const SEED_TARGETS: { slug: string; label: string; blurb: string }[] = [
  { slug: SLUGS.palette, label: "Palette Studio", blurb: "colors + fonts" },
  { slug: SLUGS.signature, label: "Signature Studio", blurb: "email signature" },
  { slug: SLUGS.card, label: "Digital Card", blurb: "business card" },
  { slug: SLUGS.qr, label: "QR Creator", blurb: "branded QR" },
  { slug: SLUGS.icon, label: "Icon Kit", blurb: "banners + favicon" },
];

// Local dev port per tool (from DEV_SERVERS.md) so links built on localhost hit
// the running dev servers instead of production. On a deployed board these are
// unused — the origin is the shared apex.
const LOCAL_PORTS: Record<string, number> = {
  [SLUGS.palette]: 8117,
  [SLUGS.signature]: 8114,
  [SLUGS.card]: 8104,
  [SLUGS.qr]: 8108,
  [SLUGS.icon]: 8118,
};

// A logo file over this is too big to inline in every seed URL — we keep the
// user's file but warn that it won't ride along (tools prompt for it once).
function isLocalhost(): boolean {
  if (typeof window === "undefined") return false;
  return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname);
}

function readFileAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function NewClientKitModal({
  open,
  onClose,
  board,
}: {
  open: boolean;
  onClose: () => void;
  board: BrandBoardData;
}) {
  // Seed the form from the current board — a palette already pasted means the
  // color + font come pre-filled.
  const boardPrimary =
    board.colors.find((c) => /primary|base/i.test(c.label))?.hex ??
    board.colors[0]?.hex ??
    "#2F4F46";

  const [name, setName] = useState(board.kitName ?? "");
  const [tagline, setTagline] = useState(board.tagline ?? "");
  const [logo, setLogo] = useState<string | null>(board.logoDataUrl ?? null);
  const [color, setColor] = useState<string>(boardPrimary);

  // Build the brand core + seed live from the form.
  const core = useMemo<BrandCore>(() => {
    const c: BrandCore = {};
    if (name.trim()) c.name = name.trim();
    if (tagline.trim()) c.tagline = tagline.trim();
    if (logo) c.logo = logo;
    if (color) c.colors = [{ hex: color, role: "primary" }];
    if (board.fontPairingId) {
      c.fonts = {
        id: board.fontPairingId,
        heading: board.headingFont || undefined,
        body: board.bodyFont || undefined,
      };
    }
    return c;
  }, [name, tagline, logo, color, board.fontPairingId, board.headingFont, board.bodyFont]);

  const { seed, logoDropped } = useMemo(() => encodeSeed(core), [core]);

  // Where the links point: the running dev servers when you're on localhost,
  // the production apex when deployed.
  const links = useMemo(() => {
    const local = isLocalhost();
    return SEED_TARGETS.map((t) => {
      const origin = local ? `http://localhost:${LOCAL_PORTS[t.slug]}` : undefined;
      return { ...t, url: buildSeedLink(t.slug, seed, origin) };
    });
  }, [seed]);

  const logoUpload: UploadProps = {
    accept: "image/*",
    maxCount: 1,
    showUploadList: false,
    beforeUpload: async (file) => {
      try {
        const dataUrl = await readFileAsDataUrl(file);
        setLogo(dataUrl);
      } catch {
        void message.error("Couldn't read that image.");
      }
      return false; // never actually upload
    },
  };

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      void message.success(`Copied ${label}`);
    } catch {
      void message.error("Copy failed — select and copy manually.");
    }
  };

  const hasSomething = Boolean(name.trim() || tagline.trim() || logo || color);

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={620}
      title={
        <Space>
          <RocketOutlined />
          Start a new client kit
        </Space>
      }
    >
      <Paragraph type="secondary" className="bb-text-caption" style={{ marginTop: 4 }}>
        Fill the client's brand once. Each tool opens pre-filled with their color,
        font, name, and logo — no re-typing across tabs.
      </Paragraph>

      <Space direction="vertical" size={14} style={{ width: "100%" }}>
        <div>
          <Text strong className="bb-text-caption">
            Brand / client name
          </Text>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Marigold Coffee"
            style={{ marginTop: 4 }}
          />
        </div>

        <div>
          <Text strong className="bb-text-caption">
            Tagline
          </Text>
          <Input
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
            placeholder="e.g. Small-batch roasters"
            style={{ marginTop: 4 }}
          />
        </div>

        <Space size={20} align="start" wrap>
          <div>
            <Text strong className="bb-text-caption" style={{ display: "block", marginBottom: 4 }}>
              Seed color
            </Text>
            <ColorPicker
              value={color}
              onChange={(c) => setColor(c.toHexString())}
              showText
              format="hex"
            />
          </div>

          <div>
            <Text strong className="bb-text-caption" style={{ display: "block", marginBottom: 4 }}>
              Logo
            </Text>
            <Space>
              {logo ? (
                <img
                  src={logo}
                  alt="logo"
                  style={{
                    width: 40,
                    height: 40,
                    objectFit: "contain",
                    borderRadius: 6,
                    border: "1px solid rgba(0,0,0,0.1)",
                    background: "#fff",
                  }}
                />
              ) : null}
              <Upload {...logoUpload}>
                <Button size="small">{logo ? "Replace" : "Add logo"}</Button>
              </Upload>
              {logo ? (
                <Button
                  size="small"
                  type="text"
                  icon={<DeleteOutlined />}
                  onClick={() => setLogo(null)}
                  title="Remove logo"
                />
              ) : null}
            </Space>
          </div>
        </Space>

        {logoDropped ? (
          <Alert
            type="warning"
            showIcon
            message="Logo is too big to ride in the links"
            description={`It's over ${Math.round(
              LOGO_SEED_MAX_BYTES / 1024,
            )} KB, so the links carry name, tagline, and color — each tool will prompt to add the logo once. (Everything else still pre-fills.)`}
            className="bb-text-fine"
          />
        ) : null}

        <div>
          <Space
            style={{ width: "100%", justifyContent: "space-between", marginBottom: 6 }}
          >
            <Text strong className="bb-text-caption">
              Pre-seeded tool links
            </Text>
            <Button
              size="small"
              icon={<CopyOutlined />}
              disabled={!hasSomething}
              onClick={() =>
                copy(
                  links.map((l) => `${l.label}: ${l.url}`).join("\n"),
                  "all links",
                )
              }
            >
              Copy all
            </Button>
          </Space>

          <Space direction="vertical" size={6} style={{ width: "100%" }}>
            {links.map((l) => (
              <div
                key={l.slug}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: "1px solid rgba(0,0,0,0.08)",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Text strong className="bb-text-caption">
                    {l.label}
                  </Text>{" "}
                  <Text type="secondary" className="bb-text-fine">
                    · {l.blurb}
                  </Text>
                </div>
                <Tooltip title="Open in a new tab">
                  <Button
                    size="small"
                    type="text"
                    icon={<LinkOutlined />}
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    disabled={!hasSomething}
                  />
                </Tooltip>
                <Tooltip title="Copy link">
                  <Button
                    size="small"
                    type="text"
                    icon={<CopyOutlined />}
                    disabled={!hasSomething}
                    onClick={() => copy(l.url, `${l.label} link`)}
                  />
                </Tooltip>
              </div>
            ))}
          </Space>
        </div>
      </Space>
    </Modal>
  );
}
