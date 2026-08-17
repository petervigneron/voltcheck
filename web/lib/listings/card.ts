import type { TileKind } from "@/components/Tile";
import type { BodyType } from "@/lib/filters";

// The browse grid's whole world: one compact, precomputed row per live
// listing, built hourly on the server (lib/listings/buildIndex.ts, served by
// /api/index) and filtered/sorted entirely in the browser. Every field is
// either displayed on a card or tested by a filter — nothing speculative
// rides along, because 70k+ of these ship to every first-time visitor (behind
// a 60-card first paint, lib/listings/firstPaint.ts, but the full set still
// downloads — a field added here costs 71,000 copies on the wire).
//
// This module is client-safe: types and pure scoring only, no data imports.

export interface CardTile {
  k: TileKind;
  t: string;
  /** Tooltip — the fact's provenance, same text the detail page shows. */
  ti?: string;
  /** Allow the tile text to wrap. Set only on tiles built in the card
   *  component itself (never packed): the one current user is the
   *  manufacturer-repurchase disclosure, longer than a narrow card. */
  w?: boolean;
}

export interface CardRow {
  id: string;
  /** Search haystack: "year make model trim color", lowercased. */
  hay: string;
  year: number;
  make: string;
  model: string;
  /** Display title, cab-style pseudo-trims already stripped. */
  title: string;
  priceUsd: number;
  /** Passed the junk-price floor (lease payments, accessory totals). */
  realPrice: boolean;
  /** A price cut worth attention (≥$500, ≤14 days, both prices real). */
  cut?: { amountUsd: number; at: string; prevUsd: number };
  mileage?: number;
  condition?: "new" | "used" | "certified";
  drive?: "RWD" | "AWD" | "FWD";
  body?: BodyType;
  city?: string;
  state?: string;
  /** Dealer-zip centroid, for distance filtering and sorting. */
  loc?: [number, number];
  imageUrl?: string;
  /**
   * Trim as a classifier, normalized across the model's feeds — the axis the
   * in-model spec facets group by, not the display string (that's in `title`).
   */
  trim?: string;
  /** Usable pack size, kWh, when the exact version is known. */
  kwh?: number;
  /** Resolved EPA range when the exact version is known. */
  rangeMi?: number;
  heatPump?: "yes" | "no" | "verify";
  /** Battery pack replaced under a campaign — the teal ground. */
  packReplaced?: boolean;
  /**
   * The seller's own description discloses a manufacturer repurchase
   * (buyback). The card states the fact and carries no price claim: a
   * repurchase differs from its clean-title cohort in exactly the way a
   * "$4,000 under sold price" tile would deny.
   */
  buyback?: boolean;
  /**
   * The date this car appeared on its seller's site ("2026-08-15"), present
   * only when that is honestly a listing date (migration 0028's guards).
   * Absent means unknowable — most inventory predates tracking — never "old".
   */
  listedOn?: string;
  /**
   * Ask minus what this variant actually sells for (lib/listings/comps.ts).
   * Positive = asking above transaction prices. Only set when the gap clears
   * its cohort's own error bar, so any value here is already meaningful.
   */
  askVsSold?: number;
  /**
   * Ask minus the mileage-adjusted median of the same variant listed RIGHT NOW
   * (lib/listings/comps.ts). A weaker signal than askVsSold and never a
   * substitute for it — asks aren't transactions — so surfaces show it only
   * where askVsSold is silent, which is most of the site.
   */
  askVsMarket?: { deltaUsd: number; peerN: number; trimMatched: boolean };
  tiles: CardTile[];
}

/**
 * The ask-vs-market claim as a tile — built here so the browse card and the
 * listing page render the identical words for the identical number. A claim
 * that greets a shopper on the card and vanishes on the page it links to
 * reads as retracted; a claim that changes wording reads as two claims.
 *
 * Deliberately the quiet putty tile, not the teal find: asking prices are
 * what dealers want, they run above what cars fetch, and live inventory
 * over-represents the ones that aren't selling. "Listings" is the
 * load-bearing word, as "paid" is on the sold tile's side.
 */
export function askVsMarketTile(m: NonNullable<CardRow["askVsMarket"]>): CardTile {
  const under = m.deltaUsd < 0;
  const amount = `$${Math.abs(m.deltaUsd).toLocaleString()}`;
  // "Similar" deliberately claims less than we sometimes know (trimMatched
  // peers are the same version, not merely similar) — owner-trimmed copy,
  // and underclaiming is the safe direction. The one caveat that must
  // survive any future trim is "asking prices, not sales": it is the only
  // place the tooltip separates this tile from the sold-price one.
  return {
    k: "spec",
    t: `${amount} ${under ? "below" : "above"} similar listings`,
    ti: `${amount} ${under ? "less" : "more"} than ${m.peerN} similar cars, adjusted for mileage. Asking prices, not sales.`,
  };
}

// The default (unsorted) homepage order. Cheapest-first put the junkiest cars
// on the front page; this scores what makes a listing worth a first look and
// adds a per-day shuffle so the same good cars don't sit there forever.

// Deterministic in (id, day): the front page reshuffles once a day, not on
// every render, so pagination stays stable within a day.
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

export function featuredScore(r: CardRow, modelCount: number, day: number): number {
  let s = 0;
  // A card with no photo or no believable price can't lead the page.
  if (r.realPrice) s += 30;
  else s -= 200;
  if (r.imageUrl) s += 25;
  else s -= 100;
  const range = r.rangeMi ?? 0;
  if (range >= 250) s += 25;
  else if (range >= 200) s += 15;
  if (r.mileage != null && r.mileage > 0 && r.mileage < 60000) s += 10;
  if (r.year >= 2022) s += 10;
  if (r.heatPump === "yes") s += 5;
  // Inventory depth is the popularity signal we actually have.
  s += Math.min(20, modelCount / 15);
  // Enough jitter to rotate within a tier, not enough to float junk to the top.
  return s + hash01(`${r.id}:${day}`) * 45;
}
