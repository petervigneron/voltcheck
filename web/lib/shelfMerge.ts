import type { SavedEntry } from "./saved";
import type { SavedSearch } from "./savedSearches";

// The shelf as one document — what /api/account/shelf carries and what
// components/ShelfSync.tsx reconciles against localStorage. Pure, so the
// merge rules are pinned by tests/shelf-merge.test.ts.
//
// ── The one hard question: whose deletion wins ─────────────────────────────
//
// A union re-adds what was removed elsewhere: un-star a car on the phone,
// and the laptop that still holds it would put it back. So there are two
// merges, and which runs depends on whether THIS browser has synced with
// THIS account before (ShelfSync keeps that flag):
//
//   first sign-in on a browser  →  union. The local shelf was the shopper's
//                                  anonymous list and belongs on the account.
//   every later load            →  the account wins outright. The local copy
//                                  is a cache; whatever changed since was
//                                  changed on purpose somewhere.
//
// Within a session, local changes push the whole local shelf, so the account
// always holds what the shopper most recently did on the device in front of
// them.

export interface Shelf {
  cars: SavedEntry[];
  searches: SavedSearch[];
}

export const CARS_CAP = 200;
export const SEARCHES_CAP = 100;

const VIN_RE = /^[a-z0-9]{17}$/;
const isIso = (s: unknown): s is string => typeof s === "string" && !Number.isNaN(Date.parse(s)) && s.length <= 40;

/** Keep only well-formed entries, newest first, within the caps. Runs on
 *  both what the browser sends up and what the database hands back, so a
 *  malformed entry from either side cannot reach the other. */
export function validShelf(raw: { cars?: unknown; searches?: unknown }): Shelf {
  const cars: SavedEntry[] = [];
  if (Array.isArray(raw.cars)) {
    for (const e of raw.cars) {
      if (!e || typeof e !== "object") continue;
      const { id, savedAt, title, priceUsd } = e as Record<string, unknown>;
      if (typeof id !== "string" || !VIN_RE.test(id.toLowerCase()) || !isIso(savedAt)) continue;
      const entry: SavedEntry = { id: id.toLowerCase(), savedAt };
      if (typeof title === "string" && title.length <= 200) entry.title = title;
      if (typeof priceUsd === "number" && Number.isFinite(priceUsd) && priceUsd > 0) entry.priceUsd = Math.round(priceUsd);
      cars.push(entry);
    }
  }
  const searches: SavedSearch[] = [];
  if (Array.isArray(raw.searches)) {
    for (const e of raw.searches) {
      if (!e || typeof e !== "object") continue;
      const { qs, label, savedAt } = e as Record<string, unknown>;
      if (typeof qs !== "string" || qs.length > 1024 || !isIso(savedAt)) continue;
      searches.push({ qs, label: typeof label === "string" ? label.slice(0, 200) : "", savedAt });
    }
  }
  return {
    cars: dedupe(cars, (c) => c.id).slice(0, CARS_CAP),
    searches: dedupe(searches, (s) => s.qs).slice(0, SEARCHES_CAP),
  };
}

/** Newest first; on a duplicate key the later savedAt survives. */
function dedupe<T extends { savedAt: string }>(items: T[], key: (t: T) => string): T[] {
  const best = new Map<string, T>();
  for (const it of items) {
    const k = key(it);
    const cur = best.get(k);
    if (!cur || it.savedAt > cur.savedAt) best.set(k, it);
  }
  return [...best.values()].sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

/** First sign-in on this browser: everything from both, newest first. */
export function unionShelf(local: Shelf, account: Shelf): Shelf {
  return validShelf({ cars: [...local.cars, ...account.cars], searches: [...local.searches, ...account.searches] });
}

export function sameShelf(a: Shelf, b: Shelf): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
