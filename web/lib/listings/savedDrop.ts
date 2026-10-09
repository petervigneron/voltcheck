// Has a saved car dropped in price since we last wrote to the shopper?
//
// The card's cut badge (priceCut, price.ts) answers a different question:
// "did the LAST price step cut $500 or more?" For a car a shopper has
// starred that is the wrong bar (owner, 2026-10-09): a dealer's pricing
// tool that takes $400 off every day never trips a $500 single-step bar,
// and the car is $2,800 cheaper a week later with no word sent. The shopper
// asked about THIS car; the drift is the news.
//
// So a saved car is judged against its own asking-price series — and it
// must be the series the listing page draws, nothing wider. The first
// version of this file (9e7157a8, the same day) read every reader's rows
// from listing_price_history and mailed the owner "cut $1,369" on a 2022
// Lightning Lariat: $43,800 read off Hudson Nissan's own site on Oct 6,
// $42,431 read off Ford Blue Advantage on Oct 8. The dealer's site asked
// $43,200 that evening. Two readers, two numbers, no $1,369 cut — exactly
// the flap 0041/0103 keep off the chart, and the page showed one point.
// The owner opened the listing and asked why the email said otherwise.
//
// The page's chain is listing_price_display (0061: the current seller's
// like-for-like readings, provenance-matched step to step), filtered to
// real prices and dropped whole unless it ends at the headline
// (priceSeries.ts seriesEndingAt). The sender reads that view and this
// function applies the same two filters, so the alert can only ever claim
// a step the chart draws. An alert is a promise that the page will show it.
//
// On that chain the baseline is the lower of two things, both read at
// `since` (the last digest, or the subscription's start): the price IN
// FORCE then — the latest point at or before `since`, however old, because
// history rows are written only when a price changes (0001 onwards,
// `is distinct from`), so a car that sat at $45,000 for a month has one
// point a month old and that point is its price — and the LOWEST point in
// the 14-day window up to `since`. The current price must sit at least
// SAVED_DROP_MIN_USD under that baseline. The window's low is what cannot
// re-mail: a price that stepped down, up, and down again mails once, on the
// first low, and it is the smaller number, the asymmetric direction the
// house rule asks for on a claimed bargain.
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
// A car with no real price now, a chain that does not end at that price,
// or no point at all before `since` makes no claim: a drop that happened
// before the shopper subscribed is not news.

import { hasRealPrice, PRICE_CUT_WINDOW_DAYS } from "./price";
import { seriesEndingAt } from "./priceSeries";

export const SAVED_DROP_MIN_USD = 250;

export interface PriceObservation {
  priceUsd: number;
  /** ISO timestamp; listing_price_display.observed_at. */
  observedAt: string;
}

export interface SavedDrop {
  /** fromUsd − the current price. */
  amountUsd: number;
  /** The baseline: the lower of the price in force at `since` and the window's low. */
  fromUsd: number;
}

export function savedDrop(
  car: { priceUsd?: number; condition?: string; year?: number },
  chain: readonly PriceObservation[],
  sinceMs: number,
  nowMs: number = Date.now()
): SavedDrop | null {
  if (!hasRealPrice(car) || typeof car.priceUsd !== "number") return null;
  const series = seriesEndingAt(
    chain
      .filter((h) => hasRealPrice({ priceUsd: h.priceUsd, condition: car.condition, year: car.year }))
      .slice()
      .sort((a, b) => a.observedAt.localeCompare(b.observedAt)),
    car.priceUsd
  );
  const windowStart = nowMs - PRICE_CUT_WINDOW_DAYS * 86_400_000;
  let low: number | undefined; // lowest point in the window, at or before since
  let inForce: { t: number; priceUsd: number } | undefined; // latest point at or before since
  for (const h of series) {
    const t = Date.parse(h.observedAt);
    if (!Number.isFinite(t) || t > sinceMs) continue;
    if (!inForce || t > inForce.t) inForce = { t, priceUsd: h.priceUsd };
    if (t > windowStart && (low === undefined || h.priceUsd < low)) low = h.priceUsd;
  }
  if (!inForce) return null;
  if (low === undefined || inForce.priceUsd < low) low = inForce.priceUsd;
  const amountUsd = low - car.priceUsd;
  if (amountUsd < SAVED_DROP_MIN_USD) return null;
  return { amountUsd, fromUsd: low };
}
