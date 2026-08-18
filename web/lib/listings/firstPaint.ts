import { QUICK_TOGGLES } from "@/lib/filters";
import { featuredScore, type CardRow } from "./card";
import { QUICK_KNOWS, buildTests } from "./match";
import { packIndex, unpackIndex, type PackedIndex } from "./pack";
import { offerVariantToggle, type QuickCount } from "./quickRail";
import { modelTally, type ModelCount } from "./tally";
import type { VariantDigest } from "./variantCatalog";

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
   *  every ratio and strip the rail. Went to 3 when `variants` arrived, on the
   *  same reasoning: a v2 body would answer "unknown" for every model and
   *  silently put the rail back on inventory inference. */
  v: 3;
  /**
   * The day term the featured order was scored with. The client reuses it for
   * its own full-index sort, so a payload rendered before UTC midnight and a
   * recompute after it can't disagree and reorder the grid under the shopper.
   */
  day: number;
  total: number;
  /** What each quick toggle would leave against no other filters, and out of
   *  how many it can judge, keyed "key=value". `of` counts only cars with an
   *  answer on that axis (match.ts QUICK_KNOWS), never the whole feed — see
   *  lib/listings/quickRail.ts for why an unknown must not read as a
   *  division. Variant-axis entries also carry the catalogue verdict `offer`
   *  when the digest below was readable — computed server-side because the
   *  verdict's inventory fallback needs the whole feed, which the pristine
   *  client doesn't have yet. `offer`/`all` joined the v3 shape without a
   *  bump: production still served v2 when they landed (checked 2026-08-17),
   *  so no v3 body without them was ever cached — and even one of those would
   *  only fall back to inventory inference, never misread. This payload only
   *  ever describes the unfiltered landing page. */
  quick: Record<string, QuickCount>;
  popular: ModelCount[];
  suggestions: { label: string; count: number }[];
  makesModels: Record<string, string[]>;
  /**
   * The variant catalogue digest (lib/listings/variantCatalog.ts): per feed
   * model, the drivetrains, body, and per-year rated ranges it was actually
   * SOLD in, from the EPA's certification data — what lets the rail offer a
   * version with zero cars in stock and never offer one that doesn't exist.
   * ABSENT (whole field, a model's key, or a model's year) always means
   * unknown — fall back to inventory inference, never to "single variant".
   * The field is missing entirely when the catalogue read failed at render
   * time; a few KB against the payload's couple dozen.
   */
  variants?: VariantDigest;
  /** The top FIRST_PAGE_SIZE cards in featured order, packed like a shard. */
  top: PackedIndex;
}

export function buildFirstPaint(rows: CardRow[], variants?: VariantDigest): FirstPaint {
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
  const quick: Record<string, QuickCount> = {};
  for (const t of QUICK_TOGGLES) {
    const test = buildTests((k) => (k === t.key ? t.value : ""))[t.key]!;
    const knows = QUICK_KNOWS[t.key];
    let n = 0;
    let of = 0;
    for (const r of rows) {
      if (knows && !knows(r)) continue;
      of++;
      if (test(r)) n++;
    }
    const entry: QuickCount = { n, of, all: rows.length };
    // The catalogue verdict for the pristine state (quickRail.ts). No digest →
    // no verdict, and the rail falls back to inventory inference.
    if (t.axis === "variant" && variants) entry.offer = offerVariantToggle(t.key, t.value, rows, variants);
    quick[`${t.key}=${t.value}`] = entry;
  }
  return {
    v: 3,
    day,
    total: rows.length,
    quick,
    popular,
    suggestions,
    makesModels,
    ...(variants ? { variants } : {}),
    top: packIndex(scored.slice(0, FIRST_PAGE_SIZE).map((s) => s.r)),
  };
}

export interface FirstPaintData {
  day: number;
  total: number;
  quick: Record<string, QuickCount>;
  popular: ModelCount[];
  suggestions: { label: string; count: number }[];
  makesModels: Record<string, string[]>;
  /** See FirstPaint.variants — absent means every model reads as unknown. */
  variants?: VariantDigest;
  rows: CardRow[];
}

/** Client-side unpack. Null for anything but the shape we packed — a stale or
 *  failed body downgrades to today's behavior (wait for the index), never to
 *  a misread page. */
export function unpackFirstPaint(x: unknown): FirstPaintData | null {
  if (!x || typeof x !== "object" || (x as FirstPaint).v !== 3) return null;
  const f = x as FirstPaint;
  return {
    day: f.day,
    total: f.total,
    quick: f.quick,
    popular: f.popular,
    suggestions: f.suggestions,
    makesModels: f.makesModels,
    variants: f.variants,
    rows: unpackIndex(f.top),
  };
}
