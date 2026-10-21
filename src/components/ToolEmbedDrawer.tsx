import { useCallback, useEffect, useRef, useState } from "react";
import { Drawer, Spin, Tooltip, Typography } from "antd";
import { CloseOutlined } from "@ant-design/icons";
import {
  OPSETTE_TOOLS_ORIGIN,
  isTrustedEmbedMessage,
  embedLoad,
} from "@/lib/opsette-kit-link";

const { Text } = Typography;

/**
 * ToolEmbedDrawer — the reusable Mechanism 3 host (docs/KIT-SUITE-CONNECT-PLAN.md).
 * Edit any embeddable kit tool WITHOUT leaving Brand Board: the tool loads in
 * a same-origin <iframe> inside a right-side drawer, and the full asset blob passes
 * both ways via postMessage (no size limit, no clipboard prompt).
 *
 * Deliberately generic so Palette → Card → Signature → QR → Icon Kit all reuse the
 * same shell — a fan-out is just a new <ToolEmbedDrawer slug=… port=…>.
 *
 * Design decisions:
 *   • MASKLESS — the board stays live beside the editor (the "one app" feeling).
 *   • A thin Brand-Board toolbar on top carries the tool title + a real CLOSE (X),
 *     because a maskless drawer has no backdrop to click away and the tool's own
 *     bar only offers Save. Closing here NEVER emits — only the tool's in-frame
 *     "Save to Brand Board" pushes a revision through.
 *   • DRAG-RESIZABLE from the left edge (Social/Brand assets need more room than a
 *     palette). Width persists per tool so it reopens the size you left it.
 *
 * Flow: open → iframe loads <tool>/?embed=1 → we post `load` with the current blob
 *   (or null = fresh) → user edits → they hit "Save to Brand Board" in the frame →
 *   we get a `save` message → confirm (caller decides) → onSaved(revisedBlob).
 */

function isLocalhost(): boolean {
  if (typeof window === "undefined") return false;
  return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname);
}

const MIN_WIDTH = 380;
const FALLBACK_WIDTH = 620;
// Cap at most of the viewport so the board never fully disappears behind it.
function maxWidth(): number {
  return typeof window === "undefined" ? 1200 : Math.round(window.innerWidth * 0.92);
}

export interface ToolEmbedDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Route slug under the apex (e.g. "palette-studio") — the production path. */
  slug: string;
  /** Local dev port for this tool (DEV_SERVERS.md) — used only on localhost. */
  localPort: number;
  /** Tool name shown in the drawer's toolbar. */
  title: string;
  /** Starting width when this tool has no remembered width yet. Wider tools
   *  (Icon Kit's Social assets) pass a bigger default. */
  defaultWidth?: number;
  /** The board's current stored blob for this tool, or null to start fresh. */
  initialBlob: string | null;
  /** The revised blob the user saved inside the frame. The caller confirms + ingests. */
  onSaved: (revisedBlob: string) => void;
}

export default function ToolEmbedDrawer({
  open,
  onClose,
  slug,
  localPort,
  title,
  defaultWidth = FALLBACK_WIDTH,
  initialBlob,
  onSaved,
}: ToolEmbedDrawerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);

  // The iframe src + the origin we trust for its messages. Same-origin (apex) in
  // production; the running dev server on localhost.
  const origin = isLocalhost() ? `http://localhost:${localPort}` : OPSETTE_TOOLS_ORIGIN;
  const src = isLocalhost()
    ? `${origin}/?embed=1`
    : `${OPSETTE_TOOLS_ORIGIN}/${slug}/?embed=1`;

  // ── Resizable width, remembered per tool ──────────────────────────────────
  const widthKey = `opsette-embed-w:${slug}`;
  const [width, setWidth] = useState<number>(() => {
    if (typeof window === "undefined") return defaultWidth;
    const saved = Number(window.localStorage.getItem(widthKey));
    return saved >= MIN_WIDTH ? Math.min(saved, maxWidth()) : Math.min(defaultWidth, maxWidth());
  });
  // `isResizing` drives a transparent full-screen SHIELD over the drawer+iframe
  // while dragging. This is the whole fix for the "drag never releases" bug: an
  // <iframe> is a separate document that swallows mouse events, so once the cursor
  // crosses into it the parent never sees mousemove/mouseUP and the drag sticks on
  // forever. The shield sits above the iframe with pointerEvents, so every mouse
  // event during a resize stays in THIS document and mouseup always lands.
  const [isResizing, setIsResizing] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const onDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsResizing(true);
      startXRef.current = e.clientX;
      startWidthRef.current = width;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [width],
  );

  // Global drag listeners live ONLY while resizing, and always tear down on end —
  // plus a hard stop on window blur / the pointer leaving the document, so a lost
  // mouseup (alt-tab, second monitor) can never leave the drag stuck on.
  useEffect(() => {
    if (!isResizing) return;
    const onMove = (e: MouseEvent) => {
      // Right-anchored: dragging LEFT (smaller clientX) widens the drawer.
      const delta = startXRef.current - e.clientX;
      const next = Math.min(Math.max(startWidthRef.current + delta, MIN_WIDTH), maxWidth());
      setWidth(next);
    };
    const stop = () => {
      setIsResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.localStorage.setItem(widthKey, String(Math.round(widthRef.current)));
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", stop);
    window.addEventListener("blur", stop);
    document.addEventListener("mouseleave", stop);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", stop);
      window.removeEventListener("blur", stop);
      document.removeEventListener("mouseleave", stop);
    };
  }, [isResizing, widthKey]);

  // Latest width for the mouseup persist, without re-binding the drag listeners.
  const widthRef = useRef(width);
  widthRef.current = width;

  // ── postMessage: send the blob down on ready/load, receive save up ─────────
  const blobRef = useRef(initialBlob);
  blobRef.current = initialBlob;

  const sendLoad = useCallback(() => {
    iframeRef.current?.contentWindow?.postMessage(embedLoad(blobRef.current), origin);
  }, [origin]);

  useEffect(() => {
    if (!open) return;
    const extra = isLocalhost() ? [origin] : [];
    const onMessage = (event: MessageEvent) => {
      // The child's "ready" ping isn't a typed embed message; handle it first
      // (still origin-checked) so we send the blob the moment the frame can take it.
      const d = event.data as { source?: string; kind?: string; payload?: unknown };
      if (
        (event.origin === OPSETTE_TOOLS_ORIGIN || extra.includes(event.origin)) &&
        d?.source === "opsette-embed" &&
        d?.kind === "ready"
      ) {
        sendLoad();
        return;
      }
      if (!isTrustedEmbedMessage(event, extra)) return;
      if (event.data.kind === "save") {
        onSaved(event.data.payload);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [open, origin, sendLoad, onSaved]);

  useEffect(() => {
    if (open) setLoaded(false);
  }, [open]);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      placement="right"
      mask={false}
      width={width}
      closable={false}
      styles={{ body: { padding: 0, position: "relative" }, header: { display: "none" } }}
      rootClassName="tool-embed-drawer"
    >
      {/* Left-edge resize handle — a slim hit area with a visible grip. */}
      <div
        onMouseDown={onDragStart}
        title="Drag to resize"
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 10,
          cursor: "col-resize",
          zIndex: 6,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: isResizing ? "rgba(47,79,70,0.12)" : "transparent",
        }}
      >
        <div
          style={{
            width: 3,
            height: 44,
            borderRadius: 2,
            background: isResizing ? "#2f4f46" : "rgba(0,0,0,0.22)",
          }}
        />
      </div>

      {/* Drag shield — the fix for the iframe swallowing mouse events. Only present
          while resizing; covers the whole drawer (iframe included) so every
          mousemove/mouseup during a drag reaches THIS document and the drag can't
          get stuck on. Also shows a live width readout. */}
      {isResizing && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 5,
            cursor: "col-resize",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              background: "rgba(0,0,0,0.82)",
              color: "#fff",
              padding: "6px 12px",
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              pointerEvents: "none",
            }}
          >
            {Math.round(width)}px
          </div>
        </div>
      )}

      {/* Brand-Board toolbar: the tool title + a real close. Closing here does NOT
          emit — only the tool's in-frame "Save to Brand Board" pushes a change. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: 44,
          paddingLeft: 16,
          paddingRight: 8,
          borderBottom: "1px solid rgba(0,0,0,0.08)",
          background: "#fff",
        }}
      >
        <Text style={{ fontSize: 13, fontWeight: 600, color: "#2f4f46" }}>{title}</Text>
        <Tooltip title="Close without saving">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              border: "none",
              background: "transparent",
              cursor: "pointer",
              width: 32,
              height: 32,
              borderRadius: 6,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#64748b",
            }}
          >
            <CloseOutlined />
          </button>
        </Tooltip>
      </div>

      <div style={{ position: "relative", height: "calc(100% - 44px)" }}>
        {!loaded && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              background: "#fafafa",
              zIndex: 2,
            }}
          >
            <Spin size="large" />
            <Text type="secondary" style={{ fontSize: 13 }}>
              Opening {title}…
            </Text>
          </div>
        )}
        {open && (
          <iframe
            // Key on the tool (slug) AND its blob so switching tools — or
            // reopening with a different asset — fully reloads the iframe. Two
            // different tools opened with no blob previously collided on the same
            // "fresh" key and the iframe never reloaded (showed the prior tool).
            key={`${slug}:${initialBlob ?? "fresh"}`}
            ref={iframeRef}
            src={src}
            title={title}
            onLoad={() => {
              setLoaded(true);
              sendLoad();
            }}
            style={{ width: "100%", height: "100%", border: "none", display: "block" }}
          />
        )}
      </div>
    </Drawer>
  );
}
