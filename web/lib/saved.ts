// Saved cars, browser-side: one versioned localStorage key, an array of
// entries, newest first. This is the shelf everything reads, signed in or
// not; for a signed-in shopper components/ShelfSync.tsx mirrors it to the
// account (migration 0063) and back, so the same list is on every device.
//
// The identifier is the listing id, which is the lowercase VIN
// (scraper/ingest.mjs): the VIN is the listings table's primary key, it
// survives every nightly re-crawl, re-listing, and dealer-feed churn, and it
// is exactly what /listing/[id] resolves. Each entry also snapshots the title
// and (real) price at save time, so a car that has since been delisted can
// still be named honestly on /saved instead of showing as a bare VIN.
//
// Client-only: every reader guards on `typeof window`, and the components
// that use this read it in an effect so the server render (always "unsaved")
// matches the first client paint.

export interface SavedEntry {
  /** Listing id = lowercase VIN. */
  id: string;
  savedAt: string;
  /** Display title at save time ("2023 Kia EV6 Wind") — what a delisted
   *  entry gets called, since the live row is gone. */
  title?: string;
  /** Asking price at save time, only when it passed the junk-price floor. */
  priceUsd?: number;
}

const KEY = "voltcheck.saved.v1";
const CHANGE = "voltcheck:saved-change";
// Enough for any real shopper; keeps the key from growing without bound.
const CAP = 200;

export function readSaved(): SavedEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is SavedEntry =>
        !!e && typeof e === "object" && typeof (e as SavedEntry).id === "string" && typeof (e as SavedEntry).savedAt === "string"
    );
  } catch {
    return [];
  }
}

function write(entries: SavedEntry[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(entries.slice(0, CAP)));
  } catch {
    // Storage full or blocked — the toggle just doesn't stick.
  }
  window.dispatchEvent(new Event(CHANGE));
}

export function isSaved(id: string): boolean {
  return readSaved().some((e) => e.id === id);
}

/** Replace the whole shelf — the account sync's write (components/ShelfSync.tsx).
 *  Fires the same change event a toggle does, so every star updates. */
export function replaceSaved(entries: SavedEntry[]): void {
  write(entries);
}

/** Save if absent, remove if present. Returns the new state: true = saved. */
export function toggleSaved(entry: Omit<SavedEntry, "savedAt">): boolean {
  const cur = readSaved();
  const without = cur.filter((e) => e.id !== entry.id);
  if (without.length < cur.length) {
    write(without);
    return false;
  }
  write([{ ...entry, savedAt: new Date().toISOString() }, ...cur]);
  return true;
}

/** Re-run `cb` whenever the saved set changes — this tab (custom event) or
 *  another (storage event). Returns the unsubscribe. */
export function subscribeSaved(cb: () => void): () => void {
  window.addEventListener(CHANGE, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(CHANGE, cb);
    window.removeEventListener("storage", cb);
  };
}
