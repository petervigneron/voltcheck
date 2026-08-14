import type { EnrichedListing } from "./enrich";
import { hasRealPrice } from "./price";

// The default (unsorted) homepage order. Cheapest-first put the junkiest cars
// on the front page; this scores what makes a listing worth a first look and
// adds a per-day shuffle so the same good cars don't sit there forever.

// Deterministic in (id, day): the front page reshuffles once a day, not on
// every request, so pagination stays stable within a day.
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

export function featuredKey(e: EnrichedListing, modelCount: number, day: number): number {
  const l = e.listing;
  let s = 0;
  // A card with no photo or no believable price can't lead the page.
  if (hasRealPrice(l)) s += 30;
  else s -= 200;
  if (l.imageUrl) s += 25;
  else s -= 100;
  const range = e.realRangeMi?.value ?? 0;
  if (range >= 250) s += 25;
  else if (range >= 200) s += 15;
  if (l.mileage != null && l.mileage > 0 && l.mileage < 60000) s += 10;
  if (l.year >= 2022) s += 10;
  if (e.heatPump?.status === "yes") s += 5;
  // Inventory depth is the popularity signal we actually have.
  s += Math.min(20, modelCount / 15);
  // Enough jitter to rotate within a tier, not enough to float junk to the top.
  return s + hash01(`${l.id}:${day}`) * 45;
}
