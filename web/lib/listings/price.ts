import type { Listing } from "./types";

/**
 * Some dealer feeds publish a lease payment where the price belongs — $499 for
 * a Bolt EUV, $799 for an Ioniq 5. In the live data every value below this
 * floor is one of those, and the cheapest real car is just under $5,000.
 *
 * The old card printed the number small in a list; this layout makes price the
 * biggest thing on the page and sorts by it, so a monthly payment would lead
 * the homepage. House rule applies: we don't know this car's price, so we say
 * so instead of repeating a number that isn't one.
 */
export const PRICE_FLOOR_USD = 1000;

export function hasRealPrice(l: Pick<Listing, "priceUsd">): boolean {
  return typeof l.priceUsd === "number" && l.priceUsd >= PRICE_FLOOR_USD;
}
