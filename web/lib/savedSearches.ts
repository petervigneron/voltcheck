// Saved searches, browser-side — the sibling of lib/saved.ts. Saved cars keep
// a VIN; a saved search keeps the query string that produced a grid, so a
// shopper can leave and come back to "Kia EV6 · under $30k · within 50 mi"
// without rebuilding it. Same shelf mechanics: one versioned localStorage key,
// newest first, a change event both tabs and this tab listen on.
//
// No accounts exist, so this is a bookmark, not a subscription. The optional
// "also email me" on each saved search hands its params to the existing alerts
// lane (components/AlertSignup.tsx, /api/alerts) — that half only appears when
// alerts are switched on; the local shelf works regardless.

import { REMOVABLE, describeFilter } from "@/lib/filters";

export interface SavedSearch {
  /** Canonical query string, also the identity — see canonicalSearchQs. */
  qs: string;
  /** Human description at save time ("Kia EV6 · Under $30,000"). */
  label: string;
  savedAt: string;
}

const KEY = "voltcheck.searches.v1";
const CHANGE = "voltcheck:searches-change";
const CAP = 100;

// Params that change what you're *looking at*, not *which cars* the search
// selects: they don't belong in a saved search's identity, or two saves that
// differ only by which page you were on would count as two searches.
const VIEW_ONLY = ["page", "grounds"];

/** The identity of a search: its selecting params, empties dropped and keys
 *  sorted so the same search saved two different ways collapses to one entry.
 *  Sort order is kept — "EV6 cheapest first" is a different saved view from
 *  "EV6 newest first", and restoring the search should restore the order too. */
export function canonicalSearchQs(sp: URLSearchParams): string {
  const p = new URLSearchParams(sp.toString());
  for (const k of VIEW_ONLY) p.delete(k);
  const entries = [...p.entries()]
    .filter(([, v]) => v !== "")
    .sort(([a], [b]) => a.localeCompare(b));
  return new URLSearchParams(entries).toString();
}

/** The label the shelf shows — the same filter phrasing the alert band uses
 *  (lib/filters.ts describeFilter), so a search reads identically wherever it
 *  appears. No filters is the whole feed: "Every EV". */
export function describeSearch(qs: string): string {
  const p = new URLSearchParams(qs);
  const parts = REMOVABLE.map((k) => {
    const v = p.get(k);
    return v ? describeFilter(k, v) : null;
  }).filter(Boolean);
  return parts.join(" · ") || "Every EV";
}

/** The subscription params for a saved search's email alert: the selecting
 *  params minus sort, matching what AlertSignup posts (an alert doesn't care
 *  what order the grid was in). */
export function alertParamsOf(qs: string): string {
  const p = new URLSearchParams(qs);
  p.delete("sort");
  return p.toString();
}

export function readSavedSearches(): SavedSearch[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is SavedSearch =>
        !!e &&
        typeof e === "object" &&
        typeof (e as SavedSearch).qs === "string" &&
        typeof (e as SavedSearch).savedAt === "string"
    );
  } catch {
    return [];
  }
}

function write(entries: SavedSearch[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(entries.slice(0, CAP)));
  } catch {
    // Storage full or blocked — the toggle just doesn't stick.
  }
  window.dispatchEvent(new Event(CHANGE));
}

export function isSearchSaved(qs: string): boolean {
  return readSavedSearches().some((e) => e.qs === qs);
}

/** Save if absent, remove if present. Returns the new state: true = saved. */
export function toggleSavedSearch(entry: Omit<SavedSearch, "savedAt">): boolean {
  const cur = readSavedSearches();
  const without = cur.filter((e) => e.qs !== entry.qs);
  if (without.length < cur.length) {
    write(without);
    return false;
  }
  write([{ ...entry, savedAt: new Date().toISOString() }, ...cur]);
  return true;
}

export function removeSavedSearch(qs: string): void {
  write(readSavedSearches().filter((e) => e.qs !== qs));
}

/** Re-run `cb` on any change — this tab (custom event) or another (storage). */
export function subscribeSavedSearches(cb: () => void): () => void {
  window.addEventListener(CHANGE, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(CHANGE, cb);
    window.removeEventListener("storage", cb);
  };
}
