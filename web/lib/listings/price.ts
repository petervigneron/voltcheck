import type { Listing } from "./types";

/**
 * Some dealer feeds publish a number that isn't the price where the price
 * belongs — a lease payment, a subscription/"startup" fee, a down payment, or
 * (on dealer.com JSON-LD) the optional-accessories total. Shapes verified in
 * production: $2,293 accessories total on a new Ioniq 5 whose page said
 * $50,498 (VIN 7YAKN4DA0SY005538, 2026-08-14); a finance payment as the Offer
 * price on used cars — $1,493 on a 2023 Model Y, $1,150 on a 2023 EQE, $1,280
 * on a 2024 Wrangler 4xe (beckchryslerdodgejeep.com, every platform price
 * field zeroed, 2026-08-19).
 *
 * A single flat used floor can't tell a real cheap car from a payment,
 * because "cheap" depends on the car. Three false bargains reported live
 * 2026-08-20, each clearing the old flat $5k/$1k floors:
 *   - a 2026 Mach-E at $5,500 (pricefordofsimivalley.com) whose new-inventory
 *     page carried no condition, so it dodged the $15k new floor and cleared
 *     the $5k recent-used one — four VINs, all $5,500, siblings asking $43k+;
 *   - a 2024 Rolls-Royce Spectre CPO at $5,399 (ogaracoachsandiego.com), a
 *     ~$420k car, the figure a monthly payment;
 *   - a 2019 Tesla Model X at "USD 1,990/mo" (motorenvy.com), a subscription
 *     price, which 2019 let clear the $1k floor.
 *
 * So the used floor is tiered by model year, cut where the live data
 * separates real asks from payments (2026-08-20 inventory): 2020+ real asks
 * bottom at $8,795 and payments top at $5,399, floor $7,000 between them;
 * 2018–2019 real asks bottom at $5,995 and the one payment is $1,990, floor
 * $4,000; <=2017 real cars reach down to $2,400 with no payments, floor
 * $1,000. New keeps its own $15,000 floor — no new EV lists under that.
 *
 * This layout makes price the biggest thing on the page and sorts by it, so a
 * junk number would lead the homepage and the paid-price comparison. House
 * rule applies: we don't know this car's price, so we say so instead of
 * repeating a number that isn't one. Mirrored in scraper/lib/price-floor.mjs —
 * two copies, keep them in sync.
 */
export const PRICE_FLOOR_USD = 1000;
export const NEW_PRICE_FLOOR_USD = 15_000;
export const LATE_MODEL_USED_FLOOR_USD = 7_000;
export const RECENT_USED_PRICE_FLOOR_USD = 4_000;
export const LATE_MODEL_YEAR = 2020;
export const RECENT_USED_YEAR = 2018;

export function hasRealPrice(l: {
  priceUsd?: number;
  condition?: string;
  year?: number;
}): boolean {
  if (typeof l.priceUsd !== "number") return false;
  const year = l.year ?? 0;
  const floor =
    l.condition === "new"
      ? NEW_PRICE_FLOOR_USD
      : year >= LATE_MODEL_YEAR
        ? LATE_MODEL_USED_FLOOR_USD
        : year >= RECENT_USED_YEAR
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
