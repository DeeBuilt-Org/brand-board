import { useEffect, useMemo, useRef, useState } from "react";
import { App as AntApp, Button, Card, Dropdown, Grid, Input, Modal, Segmented, Space, Steps, Typography, message } from "antd";
import {
  FilePdfOutlined,
  FileImageOutlined,
  SaveOutlined,
  FolderOpenOutlined,
  LoadingOutlined,
  CheckCircleFilled,
  RocketOutlined,
  DownloadOutlined,
  ClearOutlined,
  DownOutlined,
  AppstoreOutlined,
} from "@ant-design/icons";
import { ThemeProvider } from "@/lib/theme";
import Shell from "@/components/Shell";
import NewClientKitModal from "@/components/NewClientKitModal";
import ToolEmbedDrawer from "@/components/ToolEmbedDrawer";
import { BrandPage, GuidePage } from "@/components/board/BrandBoard";
import { BoardForm } from "@/components/board/BoardForm";
import { EMBED_TOOLS, type EmbedToolKey } from "@/components/board/embedTools";
import {
  emptyBoard,
  boardHasContent,
  presentPages,
  PAGE_META,
  type BrandBoardData,
  type PageId,
} from "@/components/board/board.types";
import { ensureBoardFontsLoaded, loadFontFamilies } from "@/lib/fonts";
import {
  serializeProject,
  parseProject,
  projectFileName,
} from "@/components/board/projectFile";
import {
  saveDraft,
  loadDraft as loadDraftFromStore,
  readLegacyLocalStorageDraft,
  clearLegacyLocalStorageDraft,
} from "@/lib/draftStore";
import {
  BOARD_W,
  BOARD_H,
  pagesToPngBlobs,
  pagesToPdfBlob,
  freezePageRenders,
  pngsToPdfDataUrl,
  countBlockedImages,
} from "@/components/board/exportBoard";

const { Text } = Typography;

// The autosave draft now lives in IndexedDB (see lib/draftStore), not
// localStorage — a client's card/QR/palette blobs carry megabyte-scale images
// that blow localStorage's ~5MB quota, whose silent failure was dropping the
// source blobs on refresh. This key is only the OLD localStorage draft we
// migrate from once.
const LEGACY_STORAGE_KEY = "brand-board-draft";

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function BrandBoardInner() {
  const [data, setData] = useState<BrandBoardData>(emptyBoard);
  const [exporting, setExporting] = useState<null | "png" | "pdf">(null);
  const [newKitOpen, setNewKitOpen] = useState(false);
  // Mechanism 3: the maskless drawer that edits a tool in-place inside an iframe.
  // One drawer, one open-tool at a time; opened from each asset section, ingests
  // the revised blob on save via that tool's existing ingest path.
  const [drawerTool, setDrawerTool] = useState<EmbedToolKey | null>(null);
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.lg;

  // Hydrate the autosave draft from IndexedDB on mount (async — the store can't
  // be read synchronously). Gate the persist effect on this so the empty initial
  // state doesn't overwrite a saved draft before it loads. A one-time migration
  // pulls any older localStorage draft into IndexedDB, then clears it.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let draft = await loadDraftFromStore<Partial<BrandBoardData>>();
      if (!draft) {
        const legacy = readLegacyLocalStorageDraft(LEGACY_STORAGE_KEY);
        if (legacy && typeof legacy === "object") {
          draft = legacy as Partial<BrandBoardData>;
          // Fold the migrated draft into IndexedDB, then retire the old key.
          void saveDraft({ ...emptyBoard(), ...draft });
        }
      }
      clearLegacyLocalStorageDraft(LEGACY_STORAGE_KEY);
      if (!cancelled) {
        if (draft) setData({ ...emptyBoard(), ...draft });
        setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // The two-step Save flow's visible state. Save is deliberately NOT a silent
  // background operation: step 1 freezes the board's own pages into pictures
  // (takes a beat — fonts must paint, each page rasterizes), step 2 writes the
  // now-complete kit file. The modal shows both steps so the user knows real work
  // is happening and Save never races itself into writing blank pages.
  //   phase 0 = idle (modal closed)
  //   phase 1 = rendering pages (step 1 active)
  //   phase 2 = writing file (step 1 done, step 2 active)
  //   phase 3 = done
  const [savePhase, setSavePhase] = useState<0 | 1 | 2 | 3>(0);
  const [saveProgress, setSaveProgress] = useState<{ done: number; total: number }>({
    done: 0,
    total: 0,
  });

  // Which pages have content, in canonical order. The preview and the page
  // switcher only show these; export only rasterizes these.
  const pages = useMemo(() => presentPages(data), [data]);

  // The page currently on screen. Kept valid as pages appear/disappear.
  // (Dev-only: ?page=<id> sets the initial page for verification screenshots.)
  const [activePage, setActivePage] = useState<PageId>(() => {
    if (import.meta.env.DEV) {
      const p = new URLSearchParams(window.location.search).get("page");
      if (p === "applications" || p === "social" || p === "guide") return p;
    }
    return "foundation";
  });
  useEffect(() => {
    if (!pages.includes(activePage)) setActivePage(pages[0]);
  }, [pages, activePage]);

  // One export node per present page, keyed by PageId. All present pages are
  // rendered (off-screen staging) so every ref is live for export regardless of
  // which page the preview is showing.
  const pageRefs = useRef<Record<PageId, HTMLDivElement | null>>({
    foundation: null,
    applications: null,
    social: null,
    guide: null,
  });

  useEffect(() => {
    ensureBoardFontsLoaded();
  }, []);

  const fontFamilies = useMemo(
    () => [data.headingFont, data.bodyFont],
    [data.headingFont, data.bodyFont],
  );

  useEffect(() => {
    loadFontFamilies(fontFamilies);
  }, [fontFamilies]);

  useEffect(() => {
    // Don't autosave until the draft has hydrated, or the empty initial state
    // would clobber a saved draft before it loads.
    if (!hydrated) return;
    // Keep the frozen page pictures AND the combined PDF OUT of the draft — they
    // re-freeze fresh on every Save, only need to live in the saved kit FILE, and
    // are the heaviest part of the board. Everything else (including the source
    // blobs and their embedded images) persists as-is; IndexedDB has no ~5MB cap,
    // so a megabyte-scale card/QR/palette blob rides in the draft without the
    // silent quota drop that used to lose the blobs on refresh.
    const { pageRenders: _pr, pagesPdf: _pdf, ...draft } = data;
    void _pr;
    void _pdf;
    void saveDraft(draft);
  }, [data, hydrated]);

  const hasContent = boardHasContent(data);
  const projectInputRef = useRef<HTMLInputElement>(null);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [saveName, setSaveName] = useState("");

  type SavePicker = (opts: unknown) => Promise<{
    createWritable: () => Promise<{
      write: (d: string) => Promise<void>;
      close: () => Promise<void>;
    }>;
  }>;

  const saveProject = async () => {
    const suggested = projectFileName(data.kitName);
    const picker = (window as unknown as { showSaveFilePicker?: SavePicker }).showSaveFilePicker;

    // The file-picker must open inside the click gesture, so ask for the file
    // handle FIRST (before the async freeze), then do the two visible steps and
    // write into the handle we already hold. Browsers without the picker fall
    // through to the named-download modal, which runs the same two steps.
    if (picker) {
      let handle: Awaited<ReturnType<SavePicker>>;
      try {
        handle = await picker({
          suggestedName: suggested,
          types: [
            { description: "Brand Board project", accept: { "application/json": [".json"] } },
          ],
        });
      } catch (err) {
        if ((err as Error)?.name !== "AbortError") message.error("Save failed — try again.");
        return;
      }

      try {
        // STEP 1 — freeze the board's own pages into the blob (visible).
        setSavePhase(1);
        const frozen = await freezeIntoBoard();

        // STEP 2 — write the now-complete kit file.
        setSavePhase(2);
        const json = serializeProject(frozen, new Date().toISOString());
        const writable = await handle.createWritable();
        await writable.write(json);
        await writable.close();

        setSavePhase(3);
        // Let the finished tick sit briefly, then close.
        window.setTimeout(() => setSavePhase(0), 900);
        message.success("Kit saved — your pages are baked in");
        void warnBlockedImages();
      } catch {
        setSavePhase(0);
        message.error("Save failed — try again.");
      }
      return;
    }

    // No file-picker (Firefox/Safari): collect a name, then run the two steps and
    // download. Freeze happens in doFallbackSave once the name is confirmed.
    setSaveName(suggested.replace(/\.json$/, ""));
    setSaveModalOpen(true);
  };

  const doFallbackSave = async () => {
    setSaveModalOpen(false);
    try {
      // STEP 1 — freeze (visible).
      setSavePhase(1);
      const frozen = await freezeIntoBoard();

      // STEP 2 — write the download.
      setSavePhase(2);
      const json = serializeProject(frozen, new Date().toISOString());
      const blob = new Blob([json], { type: "application/json" });
      const name = (saveName.trim() || "brand-kit").replace(/\.json$/, "");
      triggerDownload(blob, `${name}.json`);

      setSavePhase(3);
      window.setTimeout(() => setSavePhase(0), 900);
      message.success("Kit saved to your Downloads — your pages are baked in");
      void warnBlockedImages();
    } catch {
      setSavePhase(0);
      message.error("Save failed — try again.");
    }
  };

  const openProjectFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const loaded = parseProject(reader.result as string);
      if (loaded) {
        setData(loaded.board);
        message.success("Project loaded");
      } else {
        message.error("That isn't a Brand Board project file.");
      }
    };
    reader.readAsText(file);
  };

  // A revised asset came back from an in-place editor (Mechanism 3). Confirm
  // apply it directly via that tool's existing ingest path (same fields replaced,
  // everything else untouched, raw blob archived so it re-copies/re-opens like
  // any imported asset), then close the drawer.
  //
  // No confirm dialog here on purpose: the user OPENED the editor and clicked a
  // button literally named "Save to Brand Board" — that IS the confirmation. A
  // second "are you sure?" is asking them to confirm what they just confirmed
  // (and it fought the tool's own "Sent back" toast). The fork-#3 confirm was for
  // the clipboard path, where a blob can arrive unexpectedly; the drawer is
  // deliberate, so we trust the click and let the toast be the one acknowledgment.
  const applyRevised = (toolKey: EmbedToolKey, revisedBlob: string) => {
    const tool = EMBED_TOOLS[toolKey];
    const next = tool.apply(revisedBlob, data);
    if (next) {
      setData(next);
      message.success(`Updated from ${tool.title}`);
    } else {
      message.error("That didn't come through — try saving it again.");
    }
    setDrawerTool(null);
  };

  // Reset the whole board to a blank canvas. Destructive — the autosave draft is
  // the only copy of unsaved work — so it confirms first. Clearing to
  // emptyBoard() lets the persist effect overwrite the IndexedDB draft, so a
  // refresh stays empty (this is the "I'm stuck with the last kit and can't
  // start clean" fix). Reset does NOT touch any saved .brand-kit.json file.
  const resetBoard = () => {
    Modal.confirm({
      title: "Start over with a blank board?",
      content:
        "This clears everything on the board — colors, type, logo, and every pasted asset. Any saved project file is untouched, but unsaved work here is gone.",
      okText: "Clear board",
      okButtonProps: { danger: true },
      cancelText: "Keep it",
      onOk: () => {
        setData(emptyBoard());
        message.success("Board cleared — you're starting fresh.");
      },
    });
  };

  // Collect the live page nodes in canonical order, dropping any not yet mounted.
  const collectNodes = (): HTMLDivElement[] =>
    pages.map((p) => pageRefs.current[p]).filter((n): n is HTMLDivElement => n !== null);

  // Same, but keeps each node paired with its PageId — needed to key the frozen
  // page pictures back to the page they came from at Save time.
  const collectPageNodes = (): { page: PageId; node: HTMLDivElement }[] =>
    pages
      .map((p) => ({ page: p, node: pageRefs.current[p] }))
      .filter((e): e is { page: PageId; node: HTMLDivElement } => e.node !== null);

  // After a save: if any linked image's host refused cross-site copying, it came
  // out blank in the baked page pictures (see BLANK_IMAGE in exportBoard.ts). Say
  // so, so a blank spot never surprises anyone. The kit itself is unaffected.
  const warnBlockedImages = async () => {
    const blocked = await countBlockedImages(collectPageNodes().map((e) => e.node));
    if (blocked > 0) {
      message.warning(
        `${blocked} linked image${blocked === 1 ? "" : "s"} couldn't be included in the page pictures — the site hosting ${blocked === 1 ? "it" : "them"} doesn't allow it.`,
        8,
      );
    }
  };

  // STEP 1 of Save — the freeze. Photograph every present page into a base64 PNG
  // and fold the result into the board as `pageRenders`, so the blob we're about
  // to write already carries Brand Board's own pages (self-inclusion). Returns
  // the board WITH the renders baked in. Awaits every capture, so when it
  // resolves the pictures are fully developed — no blank-page race.
  const freezeIntoBoard = async (): Promise<BrandBoardData> => {
    const entries = collectPageNodes();
    setSaveProgress({ done: 0, total: entries.length });
    const pageRenders = await freezePageRenders(entries, fontFamilies, (done, total) =>
      setSaveProgress({ done, total }),
    );
    // Assemble the combined flippable PDF from the SAME frozen renders (in page
    // order) — no second rasterization, so it always matches the baked PNGs.
    const pagesPdf = await pngsToPdfDataUrl(
      entries.map((e) => pageRenders[e.page]).filter((v): v is string => typeof v === "string"),
    );
    const frozen = { ...data, pageRenders, pagesPdf };
    // Keep in-memory state consistent with what we're about to write. (These
    // renders are intentionally stripped from the localStorage draft — see the
    // persist effect — so this doesn't bloat autosave; step 2 writes from the
    // `frozen` value directly, not from async state, so there's no timing race.)
    setData(frozen);
    return frozen;
  };

  const safeName = () =>
    (data.kitName || "brand-board").replace(/[^a-z0-9-_]+/gi, "-").toLowerCase();

  const doExport = async (kind: "png" | "pdf") => {
    const nodes = collectNodes();
    if (nodes.length === 0) return;
    setExporting(kind);
    try {
      const base = safeName();
      if (kind === "png") {
        // One PNG per page — exactly the gallery images. Named by page so the
        // set drops straight into a Fiverr gallery in order.
        const blobs = await pagesToPngBlobs(nodes, fontFamilies);
        blobs.forEach((blob, i) => {
          const page = pages[i];
          const meta = PAGE_META[page];
          const label = meta.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
          triggerDownload(blob, `${base}-${meta.index}-${label}.png`);
        });
        message.success(
          blobs.length === 1 ? "Page downloaded" : `${blobs.length} pages downloaded`,
        );
      } else {
        const blob = await pagesToPdfBlob(nodes, fontFamilies);
        triggerDownload(blob, `${base}-brand-board.pdf`);
        message.success("PDF downloaded");
      }
    } catch {
      message.error("Export failed — please try again.");
    } finally {
      setExporting(null);
    }
  };

  // Scale the full-size page down to fit the preview column width.
  const [previewWidth, setPreviewWidth] = useState(560);
  const previewWrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = previewWrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 560;
      setPreviewWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const scale = previewWidth / BOARD_W;

  // Header actions, consolidated into two dropdowns so the row stays calm:
  //   • Kit    → New kit · Open · Save · (Reset)
  //   • Download → PNG(s) · PDF
  // Everything that was a loose button now lives under an intent-named menu.
  const kitMenu = (
    <Dropdown
      trigger={["click"]}
      menu={{
        items: [
          {
            key: "open",
            icon: <FolderOpenOutlined />,
            label: "Open project…",
            onClick: () => projectInputRef.current?.click(),
          },
          {
            key: "save",
            icon: <SaveOutlined />,
            label: "Save project",
            disabled: !hasContent,
            onClick: saveProject,
          },
          { type: "divider" },
          {
            key: "reset",
            icon: <ClearOutlined />,
            label: "Clear board",
            danger: true,
            disabled: !hasContent,
            onClick: resetBoard,
          },
          { type: "divider" },
          {
            key: "new",
            icon: <RocketOutlined />,
            label: "New kit",
            onClick: () => setNewKitOpen(true),
          },
        ],
      }}
    >
      <Button icon={<AppstoreOutlined />}>
        Kit <DownOutlined className="bb-caret" />
      </Button>
    </Dropdown>
  );

  const downloadMenu = (
    <Dropdown
      trigger={["click"]}
      disabled={!hasContent || exporting !== null}
      menu={{
        items: [
          {
            key: "png",
            icon: <FileImageOutlined />,
            label: pages.length > 1 ? `PNGs — one per page (${pages.length})` : "PNG",
            onClick: () => doExport("png"),
          },
          {
            key: "pdf",
            icon: <FilePdfOutlined />,
            label: pages.length > 1 ? "PDF — whole kit" : "PDF",
            onClick: () => doExport("pdf"),
          },
        ],
      }}
    >
      <Button
        type="primary"
        icon={<DownloadOutlined />}
        loading={exporting !== null}
        disabled={!hasContent || exporting !== null}
      >
        Download <DownOutlined className="bb-caret" />
      </Button>
    </Dropdown>
  );

  const exportButtons = (
    <Space>
      {kitMenu}
      {downloadMenu}
    </Space>
  );

  // A page node rendered at full intrinsic size, wrapped so it can be scaled or
  // parked off-screen. `visible` pages sit in the preview; the rest stage off
  // the canvas so their refs stay live for export without showing.
  const renderPage = (page: PageId, pageNumber: number, visible: boolean) => (
    <div
      key={page}
      style={
        visible
          ? { width: BOARD_W, transform: `scale(${scale})`, transformOrigin: "top left" }
          : { position: "absolute", left: -99999, top: 0, width: BOARD_W }
      }
      aria-hidden={!visible}
    >
      {page === "guide" ? (
        <GuidePage
          ref={(el) => {
            pageRefs.current[page] = el;
          }}
          data={data}
          pageNumber={pageNumber}
          totalPages={pages.length}
        />
      ) : (
        <BrandPage
          ref={(el) => {
            pageRefs.current[page] = el;
          }}
          data={data}
          page={page}
          pageNumber={pageNumber}
          totalPages={pages.length}
        />
      )}
    </div>
  );

  return (
    <Shell headerActions={!isMobile ? exportButtons : undefined}>
      <NewClientKitModal
        open={newKitOpen}
        onClose={() => setNewKitOpen(false)}
        board={data}
      />
      {drawerTool && (
        <ToolEmbedDrawer
          // Key on the tool so switching from one tool's drawer to another fully
          // remounts (fresh iframe, fresh listeners) instead of reconciling the
          // same instance and leaving the previous tool loaded.
          key={drawerTool}
          open
          onClose={() => setDrawerTool(null)}
          slug={EMBED_TOOLS[drawerTool].slug}
          localPort={EMBED_TOOLS[drawerTool].localPort}
          title={EMBED_TOOLS[drawerTool].title}
          defaultWidth={EMBED_TOOLS[drawerTool].defaultWidth}
          initialBlob={EMBED_TOOLS[drawerTool].currentBlob(data)}
          onSaved={(revised) => applyRevised(drawerTool, revised)}
        />
      )}
      <input
        ref={projectInputRef}
        type="file"
        accept=".json,application/json"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) openProjectFile(f);
          e.target.value = "";
        }}
      />
      <Modal
        title="Save project as"
        open={saveModalOpen}
        onOk={doFallbackSave}
        onCancel={() => setSaveModalOpen(false)}
        okText="Save"
      >
        <Text type="secondary" className="bb-text-caption">
          Name this client's project file. It saves to your Downloads folder.
        </Text>
        <Input
          style={{ marginTop: 10 }}
          value={saveName}
          onChange={(e) => setSaveName(e.target.value)}
          addonAfter=".json"
          onPressEnter={doFallbackSave}
          autoFocus
        />
      </Modal>

      {/* The two-step Save tracker. Deliberately visible: the freeze takes a
          real beat, and this shows the user the two things happening (rendering
          the pages into the kit, then writing the file) so Save reads as careful
          work, not a hang. Not dismissible mid-run — the steps are quick and
          interrupting only means re-saving (the frozen pages are already in the
          draft by then, so nothing is lost). */}
      <Modal
        title="Saving your kit"
        open={savePhase !== 0}
        footer={null}
        closable={false}
        maskClosable={false}
        width={440}
      >
        <div style={{ padding: "8px 4px 4px" }}>
          <Steps
            direction="vertical"
            size="small"
            current={savePhase === 1 ? 0 : 1}
            items={[
              {
                title: "Rendering your pages",
                description:
                  savePhase === 1
                    ? saveProgress.total > 0
                      ? `Baking page ${saveProgress.done} of ${saveProgress.total} into the kit…`
                      : "Preparing…"
                    : "Your designed pages are baked into the kit file.",
                icon:
                  savePhase === 1 ? (
                    <LoadingOutlined />
                  ) : (
                    <CheckCircleFilled style={{ color: "#52c41a" }} />
                  ),
              },
              {
                title: "Writing your kit file",
                description:
                  savePhase >= 3
                    ? "Saved. One file, everything inside."
                    : savePhase === 2
                      ? "Writing the file…"
                      : "Waiting for the pages to finish.",
                icon:
                  savePhase === 2 ? (
                    <LoadingOutlined />
                  ) : savePhase >= 3 ? (
                    <CheckCircleFilled style={{ color: "#52c41a" }} />
                  ) : undefined,
              },
            ]}
          />
        </div>
      </Modal>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: isMobile ? "16px" : "24px 24px 48px", overflowX: "hidden" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "minmax(340px, 420px) 1fr",
            gap: 28,
            alignItems: "start",
          }}
        >
          <Card styles={{ body: { padding: 20 } }}>
            <BoardForm
              data={data}
              onChange={setData}
              activePage={activePage}
              onSelectPage={setActivePage}
              onEditTool={(key) => setDrawerTool(key)}
            />
          </Card>

          {/* minWidth:0 lets this 1fr grid track shrink below the page's
              intrinsic 1600px width instead of forcing the page wide. */}
          <div style={{ minWidth: 0 }}>
            {/* Page switcher — flip between the pages that have content. */}
            {pages.length > 1 && (
              <div style={{ marginBottom: 14 }}>
                <Segmented
                  block
                  value={activePage}
                  onChange={(v) => setActivePage(v as PageId)}
                  options={pages.map((p) => ({
                    label: `${PAGE_META[p].index} · ${PAGE_META[p].title}`,
                    value: p,
                  }))}
                />
              </div>
            )}

            <div
              ref={previewWrapRef}
              style={{
                width: "100%",
                borderRadius: 16,
                overflow: "hidden",
                boxShadow: "0 18px 60px rgba(0,0,0,0.18)",
                background: "#e9e6de",
                // Fixed poster proportion — the visible page is always 4:5.
                height: BOARD_H * scale,
                position: "relative",
              }}
            >
              {/* The visible (active) page, scaled into the preview. */}
              {renderPage(activePage, pages.indexOf(activePage) + 1, true)}

              {/* Off-screen staging: every OTHER present page, rendered at full
                  size so its ref is live and export can rasterize it without the
                  user having to switch to it first. */}
              <div style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}>
                {pages
                  .filter((p) => p !== activePage)
                  .map((p) => renderPage(p, pages.indexOf(p) + 1, false))}
              </div>
            </div>

            {isMobile && (
              <div style={{ marginTop: 16, display: "flex", justifyContent: "center" }}>
                {exportButtons}
              </div>
            )}

            {!hasContent && (
              <Text
                type="secondary"
                className="bb-text-caption"
                style={{ display: "block", textAlign: "center", marginTop: 14 }}
              >
                Add a business name, a color, or a logo to enable export.
              </Text>
            )}
          </div>
        </div>
      </div>
    </Shell>
  );
}

export function BrandBoardApp() {
  return (
    <ThemeProvider>
      <AntApp>
        <BrandBoardInner />
      </AntApp>
    </ThemeProvider>
  );
}
