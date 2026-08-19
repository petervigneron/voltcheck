import type { Listing } from "./types";

/**
 * Some dealer feeds publish a number that isn't the price where the price
 * belongs. Three observed shapes:
 *  - a lease payment ($499 for a Bolt EUV, $799 for an Ioniq 5) — every live
 *    value below $1,000 was one of these, and the cheapest real car is just
 *    under $5,000;
 *  - dealer.com JSON-LD emitting the optional-accessories total as the Offer
 *    price ($2,293 on a new Ioniq 5 whose visible page said $50,498 —
 *    VIN 7YAKN4DA0SY005538, verified against the dealer's page 2026-08-14);
 *  - dealer.com JSON-LD intermittently emitting a finance payment as the
 *    Offer price on USED cars ($1,493 on a 2023 Model Y, $1,150 on a 2023
 *    EQE, $1,280 on a 2024 Wrangler 4xe — the last verified live against
 *    beckchryslerdodgejeep.com on 2026-08-19, with every platform price
 *    field zeroed). These clear the flat $1,000 used floor, so recent used
 *    cars get their own: no 2020+ EV really asks under $5,000, while old
 *    Leafs are real cars at real four-figure prices and keep the low floor.
 *
 * This layout makes price the biggest thing on the page and sorts by it, so a
 * junk number would lead the homepage and the paid-price comparison. House
 * rule applies: we don't know this car's price, so we say so instead of
 * repeating a number that isn't one. New cars get a higher floor because no
 * new EV lists under $15,000. Mirrored in scraper/lib/price-floor.mjs — two
 * copies, keep them in sync.
 */
export const PRICE_FLOOR_USD = 1000;
export const NEW_PRICE_FLOOR_USD = 15_000;
export const RECENT_USED_PRICE_FLOOR_USD = 5_000;
export const RECENT_EV_YEAR = 2020;

export function hasRealPrice(l: {
  priceUsd?: number;
  condition?: string;
  year?: number;
}): boolean {
  if (typeof l.priceUsd !== "number") return false;
  const floor =
    l.condition === "new"
      ? NEW_PRICE_FLOOR_USD
      : (l.year ?? 0) >= RECENT_EV_YEAR
        ? RECENT_USED_PRICE_FLOOR_USD
        : PRICE_FLOOR_USD;
  return l.priceUsd >= floor;
}

/**
 * A price cut worth a card's attention: at least $500 off, within the last
 * 14 days, between two prices that both pass the junk-price floor. The $500
 * bar comes from live data (2026-08-14: any-cut = 7.3% of inventory, ≥$500 =
 * 3.6% — about two cards per page of sixty, an exception rather than a
 * pattern; ≥5% = 0.6%, too rare to teach the color's meaning).
 */
export const PRICE_CUT_MIN_USD = 500;
export const PRICE_CUT_WINDOW_DAYS = 14;

export function priceCut(l: Listing): { amountUsd: number; at: string } | null {
  if (!hasRealPrice(l) || l.prevPriceUsd == null || !l.priceChangedAt) return null;
  if (!hasRealPrice({ priceUsd: l.prevPriceUsd, condition: l.condition, year: l.year })) return null;
  const amountUsd = l.prevPriceUsd - l.priceUsd;
  if (amountUsd < PRICE_CUT_MIN_USD) return null;
  if (Date.now() - Date.parse(l.priceChangedAt) > PRICE_CUT_WINDOW_DAYS * 86_400_000) return null;
  return { amountUsd, at: l.priceChangedAt };
}
