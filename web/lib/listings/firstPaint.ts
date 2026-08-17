import { QUICK_TOGGLES } from "@/lib/filters";
import { featuredScore, type CardRow } from "./card";
import { buildTests } from "./match";
import { packIndex, unpackIndex, type PackedIndex } from "./pack";
import { modelTally, type ModelCount } from "./tally";

// The first-paint payload for the pristine landing page — /api/index/first.
//
// Why it exists: the full index is ~3.3 MB on the wire and six files, and
// nothing rendered until all of it landed and was parsed, unpacked, tallied,
// and sorted — the whole country shipped to paint 60 cards. This payload is
// everything the pristine landing state actually shows (the top page of
// featured cards, the popular band, the search suggestions, the make/model
// dropdowns, the total, the quick-toggle counts), a couple of dozen KB that
// lands in a fraction of the time. The full index still streams in behind it,
// so filtering, sorting, and paging stay the instant local computations they
// were; this only moves the first paint off that download's critical path.
//
// It answers ONLY the pristine state (no filters, featured sort, page 1).
// A filtered arrival keeps today's honest pending state until the index
// lands: filtering 60 cards and presenting the survivors as "the results"
// would be matching the wrong thing.

/** One page of the grid — Browse's page size and the server's slice, one number. */
export const FIRST_PAGE_SIZE = 60;

export interface FirstPaint {
  /** Bumped with the shape, so a stale cached body is recognizable. Went to 2
   *  when `quick` grew from a bare count to count-of-total: the rail needs the
   *  denominator to tell a toggle that divides the results from one that keeps
   *  all of them (components/Filters.tsx). A cached v1 body is rejected rather
   *  than misread — its bare numbers would silently answer `undefined` for
   *  every ratio and strip the rail. */
  v: 2;
  /**
   * The day term the featured order was scored with. The client reuses it for
   * its own full-index sort, so a payload rendered before UTC midnight and a
   * recompute after it can't disagree and reorder the grid under the shopper.
   */
  day: number;
  total: number;
  /** What each quick toggle would leave against no other filters, and out of
   *  how many, keyed "key=value". `of` is the whole feed: this payload only
   *  ever describes the unfiltered landing page. */
  quick: Record<string, { n: number; of: number }>;
  popular: ModelCount[];
  suggestions: { label: string; count: number }[];
  makesModels: Record<string, string[]>;
  /** The top FIRST_PAGE_SIZE cards in featured order, packed like a shard. */
  top: PackedIndex;
}

export function buildFirstPaint(rows: CardRow[]): FirstPaint {
  const { counts, suggestions, popular, makesModels } = modelTally(rows);
  const day = Math.floor(Date.now() / 86400000);
  // Identical scoring to Browse's featured branch (no search, so no identity
  // boost), same stable sort — on the same hour's index the client's own
  // recompute reproduces this exact page.
  const scored = rows.map((r) => ({
    r,
    k: featuredScore(r, counts.get(`${r.make} ${r.model}`.toLowerCase()) ?? 0, day),
  }));
  scored.sort((a, b) => b.k - a.k);
  const quick: Record<string, { n: number; of: number }> = {};
  for (const t of QUICK_TOGGLES) {
    const test = buildTests((k) => (k === t.key ? t.value : ""))[t.key]!;
    let n = 0;
    for (const r of rows) if (test(r)) n++;
    quick[`${t.key}=${t.value}`] = { n, of: rows.length };
  }
  return {
    v: 2,
    day,
    total: rows.length,
    quick,
    popular,
    suggestions,
    makesModels,
    top: packIndex(scored.slice(0, FIRST_PAGE_SIZE).map((s) => s.r)),
  };
}

export interface FirstPaintData {
  day: number;
  total: number;
  quick: Record<string, { n: number; of: number }>;
  popular: ModelCount[];
  suggestions: { label: string; count: number }[];
  makesModels: Record<string, string[]>;
  rows: CardRow[];
}

/** Client-side unpack. Null for anything but the shape we packed — a stale or
 *  failed body downgrades to today's behavior (wait for the index), never to
 *  a misread page. */
export function unpackFirstPaint(x: unknown): FirstPaintData | null {
  if (!x || typeof x !== "object" || (x as FirstPaint).v !== 2) return null;
  const f = x as FirstPaint;
  return {
    day: f.day,
    total: f.total,
    quick: f.quick,
    popular: f.popular,
    suggestions: f.suggestions,
    makesModels: f.makesModels,
    rows: unpackIndex(f.top),
  };
}
