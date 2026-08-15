import type { TileKind } from "@/components/Tile";
import type { BodyType } from "@/lib/filters";

// The browse grid's whole world: one compact, precomputed row per live
// listing, built hourly on the server (lib/listings/buildIndex.ts, served by
// /api/index) and filtered/sorted entirely in the browser. Every field is
// either displayed on a card or tested by a filter — nothing speculative
// rides along, because 16k of these ship to every first-time visitor.
//
// This module is client-safe: types and pure scoring only, no data imports.

export interface CardTile {
  k: TileKind;
  t: string;
  /** Tooltip — the fact's provenance, same text the detail page shows. */
  ti?: string;
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
  /** Resolved EPA range when the exact version is known. */
  rangeMi?: number;
  heatPump?: "yes" | "no" | "verify";
  /** Battery pack replaced under a campaign — the teal ground. */
  packReplaced?: boolean;
  /**
   * Ask minus what this variant actually sells for (lib/listings/comps.ts).
   * Positive = asking above transaction prices. Only set when the gap clears
   * its cohort's own error bar, so any value here is already meaningful.
   */
  askVsSold?: number;
  tiles: CardTile[];
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
