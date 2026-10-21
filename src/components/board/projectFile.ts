// The Brand Board Project File — the durable, per-client archive.
//
// Brand Board is the one place that holds a client's WHOLE kit (palette,
// signature, QR, card, logo, layout, name/tagline). "Save Project" downloads
// all of it as a single .json a user keeps in their own file system
// (Clients/Acme/acme.brand-kit.json). "Open Project" rehydrates the board
// from that file — so a revision three weeks later is: open the file, edit,
// re-export. No backend, one portable file per client, survives browser wipes.
//
// This is the file-system alternative to relying on per-app localStorage, and
// the same JSON shape becomes DB rows if a backend is ever added.

import type { BrandBoardData } from "./board.types";
import { emptyBoard } from "./board.types";
import type { LayoutId } from "./layouts";

const PROJECT_TYPE = "opsette-brand-board-project";

export interface BrandBoardProjectFile {
  type: typeof PROJECT_TYPE;
  v: 1;
  savedAt: string; // ISO timestamp, stamped at save time
  board: BrandBoardData; // per-page layouts now live inside board.pageLayouts
}

export function serializeProject(board: BrandBoardData, savedAtIso: string): string {
  const file: BrandBoardProjectFile = {
    type: PROJECT_TYPE,
    v: 1,
    savedAt: savedAtIso,
    board,
  };
  return JSON.stringify(file, null, 2);
}

export interface LoadedProject {
  board: BrandBoardData;
}

/** Parse a project file's text. Null if it isn't a Brand Board project. */
export function parseProject(text: string): LoadedProject | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (r.type !== PROJECT_TYPE) return null;
  if (typeof r.board !== "object" || r.board === null) return null;

  // Merge onto a fresh empty board so a file saved by an older version (missing
  // newer fields) still loads with sensible defaults — including pageLayouts.
  const fresh = emptyBoard();
  const savedBoard = r.board as Partial<BrandBoardData>;
  const board: BrandBoardData = { ...fresh, ...savedBoard };
  // pageLayouts is nested, so a shallow spread would replace the whole object and
  // drop defaults for pages added after the file was saved (e.g. the guide page).
  // Deep-merge it so every page keeps a valid layout id.
  board.pageLayouts = { ...fresh.pageLayouts, ...(savedBoard.pageLayouts ?? {}) };

  // Legacy migration: pre-multi-page files stored one top-level `layout`. Fold it
  // into the Foundation page so an old client project reopens looking the same.
  if (typeof r.layout === "string" && !(r.board as Record<string, unknown>).pageLayouts) {
    board.pageLayouts = { ...board.pageLayouts, foundation: r.layout as LayoutId };
  }

  return { board };
}

export function projectFileName(kitName: string): string {
  const safe = (kitName || "brand-kit").replace(/[^a-z0-9-_]+/gi, "-").toLowerCase();
  // Older saves used `.opsette-kit.json`; Open Project accepts any .json, so
  // those still reopen.
  return `${safe}.brand-kit.json`;
}
