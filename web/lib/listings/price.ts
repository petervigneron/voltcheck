import type { Listing } from "./types";

/**
 * Some dealer feeds publish a number that isn't the price where the price
 * belongs. Two observed shapes:
 *  - a lease payment ($499 for a Bolt EUV, $799 for an Ioniq 5) — every live
 *    value below $1,000 was one of these, and the cheapest real car is just
 *    under $5,000;
 *  - dealer.com JSON-LD emitting the optional-accessories total as the Offer
 *    price ($2,293 on a new Ioniq 5 whose visible page said $50,498 —
 *    VIN 7YAKN4DA0SY005538, verified against the dealer's page 2026-08-14).
 *
 * This layout makes price the biggest thing on the page and sorts by it, so a
 * junk number would lead the homepage and the paid-price comparison. House
 * rule applies: we don't know this car's price, so we say so instead of
 * repeating a number that isn't one. New cars get a higher floor because no
 * new EV lists under $15,000; used floors stay low because old Leafs are real
 * cars at real four-figure prices.
 */
export const PRICE_FLOOR_USD = 1000;
export const NEW_PRICE_FLOOR_USD = 15_000;

export function hasRealPrice(l: Pick<Listing, "priceUsd" | "condition">): boolean {
  if (typeof l.priceUsd !== "number") return false;
  return l.priceUsd >= (l.condition === "new" ? NEW_PRICE_FLOOR_USD : PRICE_FLOOR_USD);
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
  if (!hasRealPrice({ priceUsd: l.prevPriceUsd, condition: l.condition })) return null;
  const amountUsd = l.prevPriceUsd - l.priceUsd;
  if (amountUsd < PRICE_CUT_MIN_USD) return null;
  if (Date.now() - Date.parse(l.priceChangedAt) > PRICE_CUT_WINDOW_DAYS * 86_400_000) return null;
  return { amountUsd, at: l.priceChangedAt };
}
