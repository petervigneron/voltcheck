import type { TileKind } from "@/components/Tile";
import { dbConfigured, FEED_CACHE_TAG } from "./db";
import { PRICE_CUT_MIN_USD } from "./price";

// How long this car has sat, and what the seller did about it — the numbers
// behind the Pro block on the listing page (components/PricePace.tsx).
//
// Three facts, three sources, and each one prints only where it can be stood
// behind:
//
//   days listed   listing_freshness.listed_on, arriving as Listing.listedOn.
//                 Migration 0028 decides when an appearance is honestly a
//                 listing date; where it said no, the field is absent and
//                 nothing prints. Never first_seen_at on its own — tracking
//                 began 2026-08-11 and most inventory predates it.
//   this car's    the series the page already draws (listing_price_display
//   cuts          through lib/listings/db.ts, with the junk-price floor and
//                 seriesEndingAt applied). Never the raw price log: 0040's
//                 header says what that holds.
//   the seller's  dealer_price_behavior (0084), one row per dealer site,
//   habit         refreshed nightly. No row means the site has fewer than
//                 eight readable listings, and nothing prints.
//
// A cut is the same thing in both places: a step DOWN to a price this listing
// has never shown before, at least PRICE_CUT_MIN_USD below the one before it.
// Both halves of that are load-bearing and 0084's header has the measurement —
// a $85 nightly-vs-recheck disagreement on the same domain with the same
// provenance clears every guard listing_price_display has, and counted raw it
// read as three Toyota stores marking down 100% of their inventory. A price
// that returns to a level already seen is a return, not a markdown.
//
// The window differs on purpose. The seller's habit is a statement about the
// last 30 days, because that is a claim about behaviour and behaviour goes
// stale. This car's cuts are a fact about this car and run over its whole
// series, which is what the chart above them already shows.

export interface PricePoint {
  priceUsd: number;
  observedAt: string;
}

/** One row of dealer_price_behavior (0084). */
export interface DealerPace {
  listingsN: number;
  cutN: number;
  cutShare: number;
  datedN: number;
  medianDaysToCut: number | null;
}

/** The floor the view itself enforces, repeated here so a hand-built row (a
 *  test, a future caller reading the view some other way) cannot slip under
 *  it. 0084's header has the distribution behind the number. */
export const MIN_DEALER_LISTINGS = 8;

/** Whole days from a defensible listing date to now. Same arithmetic as the
 *  summary card's "Listed" row, which is where it came from. */
export function daysListed(listedOn: string, now: number = Date.now()): number {
  return Math.max(0, Math.floor((now - Date.parse(listedOn)) / 86_400_000));
}

/** The asking-price cuts this listing has had: how many, and how much came off
 *  across them. Undefined when there are none — the block simply loses the
 *  tile rather than printing that nothing happened. */
export function listingCuts(history?: PricePoint[]): { count: number; totalUsd: number } | undefined {
  if (!history || history.length < 2) return undefined;
  let low = history[0].priceUsd;
  let count = 0;
  let totalUsd = 0;
  for (let i = 1; i < history.length; i++) {
    const price = history[i].priceUsd;
    const prev = history[i - 1].priceUsd;
    if (price < prev && price < low && prev - price >= PRICE_CUT_MIN_USD) {
      count += 1;
      totalUsd += prev - price;
    }
    if (price < low) low = price;
  }
  return count > 0 ? { count, totalUsd } : undefined;
}

const usd = (n: number) => `$${Math.round(n).toLocaleString()}`;
// U+2212, not a hyphen — the same minus the sparkline's captions use.
const off = (n: number) => `−${usd(n)}`;

/** The tiles the block renders, in order. Empty means the block renders
 *  nothing at all, which is the answer for a car with no listing date, no
 *  cuts, and a seller too small to read. */
export function pricePaceTiles(input: {
  listedOn?: string;
  history?: PricePoint[];
  dealer?: DealerPace | null;
  now?: number;
}): { kind: TileKind; text: string; title?: string }[] {
  const tiles: { kind: TileKind; text: string; title?: string }[] = [];

  if (input.listedOn) {
    const d = daysListed(input.listedOn, input.now ?? Date.now());
    tiles.push({
      kind: "spec",
      text: d === 0 ? "Listed today" : d === 1 ? "1 day listed" : `${d} days listed`,
      title:
        "When this car appeared on the seller's site, from Voltcheck's nightly check — shown only when the seller was already being tracked when it appeared.",
    });
  }

  const cuts = listingCuts(input.history);
  if (cuts) {
    // Violet is money on this site, and this is money off this car's price.
    tiles.push({
      kind: "cut",
      text: cuts.count === 1 ? off(cuts.totalUsd) : `${off(cuts.totalUsd)} in ${cuts.count} cuts`,
      title: "Off this listing's asking price since Voltcheck first saw it.",
    });
  }

  const d = input.dealer;
  if (d && d.listingsN >= MIN_DEALER_LISTINGS) {
    // Putty, not violet: this is the seller's habit, not money off this car,
    // and one violet tile per block keeps the colour meaning what it means.
    tiles.push({
      kind: "spec",
      text: `${Math.round(d.cutShare * 100)}% of this seller's EVs cut est`,
      title: `${d.cutN} of ${d.listingsN} of this seller's live EVs came down by $500 or more in the last 30 days. Asking prices, not sales.`,
    });
    if (d.medianDaysToCut != null) {
      // Rounded up to a whole day: a "0 days" tile would claim a same-day
      // markdown off a median of a few hours, and the safe direction here is
      // saying the seller waits longer, not less.
      const days = Math.max(1, Math.round(d.medianDaysToCut));
      tiles.push({
        kind: "spec",
        text: `First cut at ${days} day${days === 1 ? "" : "s"} est`,
        title: `Median across ${d.datedN} of this seller's cars whose listing date Voltcheck can stand behind.`,
      });
    }
  }

  return tiles;
}

const REVALIDATE_SECONDS = 86_400; // the view is refreshed once a night

/** One dealer site's row from dealer_price_behavior (0084). Null for a seller
 *  the view holds no row for — under the eight-listing floor, an OEM locator
 *  lane, or the database not answering. Every one of those means the same
 *  thing to the caller: print nothing about this seller. */
export async function fetchDealerPace(dealerDomain?: string): Promise<DealerPace | null> {
  if (!dealerDomain || !dbConfigured()) return null;
  const base = process.env.SUPABASE_URL!.replace(/\/$/, "");
  const key = process.env.SUPABASE_ANON_KEY!;
  try {
    const res = await fetch(
      `${base}/rest/v1/dealer_price_behavior?select=listings_n,cut_n,cut_share,dated_n,median_days_to_cut&dealer_domain=eq.${encodeURIComponent(
        dealerDomain
      )}&limit=1`,
      {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        next: { revalidate: REVALIDATE_SECONDS, tags: [FEED_CACHE_TAG] },
      }
    );
    if (!res.ok) throw new Error(`PostgREST ${res.status}`);
    const [row] = (await res.json()) as {
      listings_n: number;
      cut_n: number;
      cut_share: number | string;
      dated_n: number;
      median_days_to_cut: number | string | null;
    }[];
    if (!row) return null;
    return {
      listingsN: row.listings_n,
      cutN: row.cut_n,
      // PostgREST serialises numeric as a string.
      cutShare: Number(row.cut_share),
      datedN: row.dated_n,
      medianDaysToCut: row.median_days_to_cut == null ? null : Number(row.median_days_to_cut),
    };
  } catch (err) {
    console.error("[listings] Supabase dealer-pace read failed:", err);
    return null;
  }
}
