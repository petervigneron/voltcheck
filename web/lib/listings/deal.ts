import type { CardRow } from "./card";

// The Pro "deals" filter: cars whose asking price sits at least DEAL_MIN_PCT
// under similar cars listed right now, adjusted for mileage. It judges by the
// one number every card already prints — the ask-vs-market tile (card.ts
// askVsMarketTile), computed by comps.ts askVsMarket under its own guards:
// four peers minimum, one pack identity per pool, a 40,000-mile peer window,
// a $2,000 floor on the gap, and a 30% ceiling on how far under a car may sit
// before the pool is called unreliable rather than the car a bargain.
//
// Measured on the published index, 2026-09-02 (149,863 cars): 148,327 carry
// a real price, 16,575 of those carry a vs-similar figure at all (11.2% — the
// guards keep it a minority), 7,934 sit under. The median under-car is 8.9%
// under. Threshold → cars nationally: 5% 7,079 · 7.5% 5,234 · 10% 3,061 ·
// 15% 775 · 20% 162 · 25% 0. Ten is the first number that means "more than
// the ordinary spread" while a typical model search still shows some. The
// owner decides the number; this constant is the only place it lives.
//
// A car with no figure is not "not a deal", it is unjudged, and it is simply
// absent from the filtered set — the same way a car with no range sits out
// the range filter. Pure and dependency-free: the alert sender runs this
// under plain Node.

/** Percent under similar listings a car must reach to count. */
export const DEAL_MIN_PCT = 10;

/** How far under similar listings this car's ask sits, as a percent of the
 *  peer median; undefined when the car carries no figure or sits over. */
export function pctUnderSimilar(r: CardRow): number | undefined {
  const m = r.askVsMarket;
  if (!m || m.deltaUsd >= 0 || !r.realPrice) return undefined;
  const peerMedian = r.priceUsd - m.deltaUsd;
  if (peerMedian <= 0) return undefined;
  return (-m.deltaUsd / peerMedian) * 100;
}

export const isDeal = (r: CardRow, minPct: number = DEAL_MIN_PCT): boolean =>
  (pctUnderSimilar(r) ?? -1) >= minPct;
