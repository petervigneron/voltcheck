// Is a listing's asking price stated before manufacturer incentives?
//
// The crawl records the answer beside the price it judged
// (scraper/lib/sticker.mjs): `priceBeforeIncentives` true / false, and
// `priceBeforeIncentivesUsd`, the price it was about. The database can move
// priceUsd after that without a crawl — ingest_listings keeps the incumbent
// reader's price on a disputed reading (0103) and recheck_listings writes a
// new priceUsd into the payload — and neither touches these two keys. So the
// answer holds only while the price it was about IS the listing's price.
// Otherwise there is no answer: absent, never a guess.

export interface IncentiveFacts {
  priceUsd: number;
  condition?: "new" | "used" | "certified";
  msrpUsd?: number;
  priceBeforeIncentives?: boolean;
  priceBeforeIncentivesUsd?: number;
}

/** true / false when the stored judgement is about this exact price on a new
 *  car; undefined in every other case. */
export function incentiveBasis(l: IncentiveFacts): boolean | undefined {
  if (l.condition !== "new") return undefined;
  if (!(l.priceUsd > 0)) return undefined;
  if (typeof l.priceBeforeIncentives !== "boolean") return undefined;
  if (l.priceBeforeIncentivesUsd !== l.priceUsd) return undefined;
  return l.priceBeforeIncentives;
}

/** The sticker, only on a new car. */
export function stickerOf(l: IncentiveFacts): number | undefined {
  return l.condition === "new" && typeof l.msrpUsd === "number" && l.msrpUsd > 0 ? l.msrpUsd : undefined;
}
