// The Brand Board autosave DRAFT store.
//
// Why IndexedDB, not localStorage: a client's kit carries megabyte-scale data
// URLs — the Digital Card blob embeds a full-res card PNG plus a vCard photo,
// the QR blob an SVG, the palette blob a swatch PNG + PDF. A single card kit
// blows past localStorage's ~5MB per-origin quota, whose failure mode is a
// silently-swallowed throw: the draft just stops saving, so on refresh the
// source blobs (the thing that makes a reopened kit re-copyable) are gone even
// though everything rendered fine in memory. IndexedDB has no practical size
// cap for this (hundreds of MB) and stores structured values natively, so the
// whole draft — blobs and all — survives a reload.
//
// This is ONLY the crash-recovery autosave. The durable per-client archive is
// still the downloaded .brand-kit.json file (projectFile.ts); the draft is
// the "didn't lose my in-progress edits on refresh" safety net.
//
// A tiny promise-wrapped store — no dependency. One database, one object store,
// one fixed key (a single current draft). Every op resolves gracefully: a
// blocked/absent IndexedDB (private mode, old browser) rejects to a no-op so the
// app still runs, just without autosave persistence.

const DB_NAME = "brand-board";
const STORE = "draft";
const DRAFT_KEY = "current";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
  });
  // If the open fails, clear the cached rejected promise so a later call can
  // retry rather than being stuck with the failure forever.
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

/** Persist the whole draft (any JSON-serializable value). Resolves on success. */
export async function saveDraft(value: unknown): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, DRAFT_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("draft write failed"));
    tx.onabort = () => reject(tx.error ?? new Error("draft write aborted"));
  });
}

/** Read the current draft, or null if none / IndexedDB is unavailable. */
export async function loadDraft<T>(): Promise<T | null> {
  try {
    const db = await openDb();
    return await new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(DRAFT_KEY);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => reject(req.error ?? new Error("draft read failed"));
    });
  } catch {
    return null;
  }
}

/** One-time migration: an older draft saved under the localStorage key. */
export function readLegacyLocalStorageDraft(key: string): unknown | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearLegacyLocalStorageDraft(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
