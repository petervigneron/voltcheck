// The asking-price series must end at the price on the page.
//
// listing_price_display (migration 0061) draws the current seller's chain,
// but history rows are written on price change while the listing's owner
// flips on any observation, so the chain can end at a price the page no
// longer shows — measured 2026-09-03 at 20,933 live cars after 0061, 42,036
// before it. The sparkline labels its last point as the price a shopper
// would pay today and its aria-label says "still $X"; both are false the
// moment X is not the headline. Matching nothing is honest; a chart that
// ends somewhere else is not. So the series is dropped whole rather than
// drawn short.
//
// Not patched by appending the headline as a final point: when the headline
// came from a row the view's provenance guard dropped (0040/0041), the
// append re-draws exactly the step that guard refused.
export function seriesEndingAt(
  history: { priceUsd: number; observedAt: string }[],
  priceUsd: number | undefined
): { priceUsd: number; observedAt: string }[] {
  if (history.length === 0) return history;
  if (priceUsd === undefined) return [];
  return history[history.length - 1].priceUsd === priceUsd ? history : [];
}
