// Has a saved car dropped in price since we last wrote to the shopper?
//
// The card's cut badge (priceCut, price.ts) answers a different question:
// "did the LAST price step cut $500 or more?" For a car a shopper has
// starred that is the wrong bar twice over (owner, 2026-10-09):
//
//   * A dealer's pricing tool that takes $400 off every day never trips a
//     $500 single-step bar, and the car is $2,800 cheaper a week later with
//     no word sent. The shopper asked about THIS car; the drift is the news.
//   * live_listings_feed withholds prev_price_usd when the last two readings
//     came from different readers (0103's one-reader-one-price guard, built
//     for the 2026-09-25 same-site two-reader headline flap). Right for the
//     grid's badge, but it also went quiet on a 2022 Lightning Lariat the
//     owner had starred when it went $43,800 → $42,431 across a reader
//     change on 2026-10-08.
//
// So a saved car is judged against its own price history. The baseline is
// the lower of two things, both read at `since` (the last digest, or the
// subscription's start): the price IN FORCE then — the latest reading at or
// before `since`, however old, because listing_price_history is written
// only when a price changes (0001 onwards, `is distinct from`), so a car
// that sat at $45,000 for a month has one row a month old and that row is
// its price — and the LOWEST real price any reader reported in the 14-day
// window up to `since`. The car's current price must sit at least
// SAVED_DROP_MIN_USD under that baseline.
//
// Why the window's lowest joins the in-force price: it is what cannot flap.
// Two readers alternating $43,800 / $42,431 produce one mail, on the first
// $42,431 — after that $42,431 is in the baseline and the next alternation
// is silence. The in-force price alone would re-mail the same "cut" on
// every other crawl. And lowest is the smaller number, the asymmetric
// direction the house rule asks for on a claimed bargain.
//
// Why $250 and not $500: the $500 bar was set for a badge every car on the
// grid can earn, where the cost of noise is a grey card going orange. Here
// the shopper picked the car, and the cost of silence was a $400-a-day
// slide nobody heard about. $250 clears the daily jitter pricing tools
// produce and sits under the owner's $400 example. Measured over the
// owner's 78 saved cars on 2026-10-09 (listing_price_history, 14-day
// window): 7 moved down at all, 2 of them only by steps under $250 ($107
// and $100), none by a step between $250 and $499, 5 by $500 or more. One
// constant; change it here.
//
// Junk prices are ignored (the same floors hasRealPrice gives the card), and
// a car with no real price now, or none at all before `since`, makes no
// claim: a drop that happened before the shopper subscribed is not news.

import { hasRealPrice, PRICE_CUT_WINDOW_DAYS } from "./price";

export const SAVED_DROP_MIN_USD = 250;

export interface PriceObservation {
  priceUsd: number;
  /** ISO timestamp; listing_price_history.observed_at. */
  observedAt: string;
}

export interface SavedDrop {
  /** fromUsd − the current price. */
  amountUsd: number;
  /** The lowest real price any reader reported before `since`, in the window. */
  fromUsd: number;
}

export function savedDrop(
  car: { priceUsd?: number; condition?: string; year?: number },
  history: readonly PriceObservation[],
  sinceMs: number,
  nowMs: number = Date.now()
): SavedDrop | null {
  if (!hasRealPrice(car) || typeof car.priceUsd !== "number") return null;
  const windowStart = nowMs - PRICE_CUT_WINDOW_DAYS * 86_400_000;
  let low: number | undefined; // lowest real reading in the window, at or before since
  let inForce: { t: number; priceUsd: number } | undefined; // latest real reading at or before since
  for (const h of history) {
    const t = Date.parse(h.observedAt);
    if (!Number.isFinite(t) || t > sinceMs) continue;
    if (!hasRealPrice({ priceUsd: h.priceUsd, condition: car.condition, year: car.year })) continue;
    if (!inForce || t > inForce.t) inForce = { t, priceUsd: h.priceUsd };
    if (t > windowStart && (low === undefined || h.priceUsd < low)) low = h.priceUsd;
  }
  if (!inForce) return null;
  if (low === undefined || inForce.priceUsd < low) low = inForce.priceUsd;
  const amountUsd = low - car.priceUsd;
  if (amountUsd < SAVED_DROP_MIN_USD) return null;
  return { amountUsd, fromUsd: low };
}
