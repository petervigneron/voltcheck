import type { CardRow } from "./card";

// Which listing pages scripts/indexnow.mjs announces after a publish. Pure,
// so the selection is tested (tests/indexnow-picks.test.ts) rather than
// trusted.
//
// A price drop is read from the served row's `cut` — the card's own price-cut
// field (lib/listings/price.ts priceCut): the current asking price is at
// least $500 under the previous one, both prices are real, and `cut.at` is
// when Census saw the change. That timestamp is what makes "dropped since the
// previous publish" answerable. Drops under $500, and drops whose previous
// price failed the junk-price floor, are not on the row at all, so they are
// not announced: the shard carries no previous price for them to compare.

const after = (iso: string | undefined, since: number) => {
  if (!iso) return false;
  const t = Date.parse(iso);
  return Number.isFinite(t) && t > since;
};

/** Ids of listings first seen after `since` (epoch ms). */
export function firstSeenSince(rows: readonly CardRow[], since: number): string[] {
  return rows.filter((r) => after(r.firstSeenAt, since)).map((r) => r.id);
}

/** Ids of listings whose asking price dropped after `since` (epoch ms). */
export function priceDroppedSince(rows: readonly CardRow[], since: number): string[] {
  return rows.filter((r) => r.cut != null && r.cut.amountUsd > 0 && after(r.cut.at, since)).map((r) => r.id);
}
