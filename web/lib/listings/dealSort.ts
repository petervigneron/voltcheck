import type { CardRow } from "./card";

// The deal-ranked screener: the browse grid ordered by how far each car sits
// under similar listings. Pro's one benefit that is OUR estimate rather than
// the shopper's own criteria, and the reason it can be sold without a new
// claim is that it ranks by a number every card already prints — the
// ask-vs-market tile (card.ts askVsMarketTile), computed by comps.ts
// askVsMarket with its own guards: four peers minimum, one pack identity per
// pool, a 40,000-mile peer window, and a cap on how far under a car may sit
// before the pool is called unreliable rather than the car a bargain.
//
// Ranking concentrates the false-bargain error at the top of the page, which
// is the house rule's most expensive error, so this file adds NO reach: a car
// with no delta (too few peers, a mixed pool, a manufacturer repurchase, a
// lease payment where a price should be) sorts to the end, never into a
// bracket it did not earn. Ties break cheapest-first, the same as the price
// sort, so the order is stable across renders.
//
// Pure, so the alert sender or a test can order rows without the grid.

/** The `sort` query value the grid and the rail agree on. */
export const DEAL_SORT = "deal";

const priceKey = (r: CardRow) => (r.realPrice ? r.priceUsd : Infinity);

/** Most under similar listings first; no measured delta last. */
export function compareDeal(a: CardRow, b: CardRow): number {
  const am = a.askVsMarket;
  const bm = b.askVsMarket;
  if (am && bm) return am.deltaUsd - bm.deltaUsd || priceKey(a) - priceKey(b);
  if (am) return -1;
  if (bm) return 1;
  const pa = priceKey(a);
  const pb = priceKey(b);
  if (pa === pb) return 0;
  return pa - pb;
}
