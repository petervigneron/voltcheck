import {
  askCohortKey,
  askCohortSlope,
  median,
  MAX_PEER_MILE_GAP,
  type AskIndex,
  type AskPeer,
  type CompIndex,
} from "./comps";

// The free, coarse answer to "is this asking price below, typical of, or
// above what similar cars ask" — the connector's asking_vs_similar, published
// as one small code per car in the API index (lib/api/records.ts SlimRow).
//
// It is NOT askVsMarket (comps.ts), and nothing here changes that figure or
// what a Pro page prints. Owner, 2026-11-18, on the first version of this
// field, which was cut from askVsMarket and so went quiet on ~89% of cars:
//   1. four LIVE peers is unnecessary when recent cars are known;
//   2. $2,000 is much too large — $1,000 below is worth knowing;
//   3. say when a car is reasonably priced, not only when it is a deal.
// Each answer below is measured, 2026-11-18, on the live feed (170,293 cars)
// and on every used car delisted in the last 60 days (one read).
//
// ── 1. The pool: live cars AND cars no longer listed for up to 30 days ─────
//
// A car that left the site in the last 30 days, at its last asking price, is
// as good a comparison as a live one, and slightly a safer one:
//
//   delisted   cars    median vs today's live median   spread (MAD)
//   0-7 d      9,512   −1.0%                           4.6%
//   8-14 d     8,863   −0.7%                           4.6%
//   15-30 d   21,008   −0.2%                           4.6%
//   31-45 d   19,585   +0.2%                           4.8%
//   46-60 d   21,914   +0.6%                           5.0%
//   live      60,384    0 (by definition)              4.4%
//
// Cars that leave ask a little less than the ones that stay (live inventory
// is survivorship-biased toward cars that are not selling — comps.ts), so
// within 30 days they pull the pool median DOWN, which makes a "below" harder
// to earn: the safe direction. Past 30 days the market's own drift has
// carried them above today's asks — they would make live cars look cheaper
// than they are, a false bargain — so the window stops at 30 and no
// staleness adjustment is needed inside it. The two are never mixed with the
// sold side: ev_price_model (Washington titles) and retail_filed_sales are
// money that changed hands, measured to sit ~$1,100 under asks
// (ASK_OVER_SOLD_USD) and fitted on a different population; a median of
// asks and sale prices is neither.
//
// Same version is still the whole guard: VIN 1-8 + model year with comps.ts's
// masks, the trim split where the cohort mixes trims, one pack identity in
// the pool, peers within 40,000 miles, mileage-adjusted on the cohort's sold
// slope. A recent car keeps the trim key and pack identity the publisher gave
// it while it was live (vin_trend_key, 0077), so it is held to exactly the
// same tests as a live one.
//
// ── 2. The band: the cohort's own spread, not one dollar figure ────────────
//
// Asks within a version sit a median 4.4% from their cohort median, and
// cohorts differ: a dollar floor is too strict on a $12,000 Leaf and too
// loose on a $70,000 truck. So the band is a fraction of the pool median:
// the pool's own median absolute deviation where the pool is big enough to
// measure one (SPREAD_MIN_N), never less than SPREAD_FLOOR; a smaller pool is
// held to the site-wide spread (SPREAD_DEFAULT), because three or four asks
// cannot tell you their own spread. Outside the band is "below" or "above";
// a gap must also be at least MIN_GAP_USD in dollars. Measured spread (MAD of
// a car's ask around its own pool's median, pools of 8+): 6.0% ($794) under
// $15k, 4.5% ($988) $15-25k, 4.2% ($1,218) $25-35k, 4.1% ($1,694) $35-50k,
// 4.1% ($2,765) over $50k. So $1,000 is past the ordinary spread on a cheap
// car and well inside it on a dear one, and the band says so.
//
// The bar is also widened for a small pool, by (1 + SE/√n): a median of
// four asks is itself uncertain. Measured by drawing k peers at random from
// pools of 20+ and asking how often a "below" from the k disagrees with the
// whole pool: without this margin, 2.4-3.9% of such "below" labels sat at or
// OVER the whole pool's median; with 2/√n on the "below" side, 0.7-1.2%.
//
// The asymmetry is kept three times over: "below" needs BELOW_K times the
// spread where "above" needs ABOVE_K, its small-pool margin is BELOW_SE to
// ABOVE_SE, and every label must survive dropping ANY one peer (tested
// against the median least favourable to it). A gap under the pool larger
// than 30% of the asking price stays withheld entirely, as in comps.ts.
//
// ── 3. "typical" whenever the comparison was made ──────────────────────────
//
// A car whose pool exists and whose price the band cannot tell apart from
// what similar cars ask is "typical" — including a car whose label would
// flip if one peer were dropped: that is precisely a price the data cannot
// distinguish from typical. No answer now means only "could not compare".

/** Recent (no longer listed) cars count for this long after they left. */
export const RECENT_DAYS = 30;
/** Peers, live and recent together, below which nothing is compared. */
export const MIN_POOL = 3;
/** A pool this size or more measures its own spread. */
export const SPREAD_MIN_N = 20;
/** The site-wide spread of asks around their version's median (MAD, as a
 *  fraction): what a pool too small to measure its own is held to. */
export const SPREAD_DEFAULT = 0.045;
/** No pool is trusted to be tighter than this. */
export const SPREAD_FLOOR = 0.03;
/** Multiples of the spread a gap must reach. BELOW_K ≥ ABOVE_K, always. */
export const ABOVE_K = 1.0;
export const BELOW_K = 1.25;
/** And a margin for how well the pool pins its own median: the bar is
 *  multiplied by (1 + SE/√n), more on the "below" side. */
export const ABOVE_SE = 1;
export const BELOW_SE = 2;
/** And in dollars, on either side. */
export const MIN_GAP_USD = 1000;
/** A gap under the pool larger than this share of the asking price says the
 *  car differs in a way the listing does not state: withheld, never "below"
 *  (comps.ts's guard, measured the same way). */
export const MAX_UNDER_FRACTION = 0.3;

export type SimilarBand = "below" | "typical" | "above";

/** Working figures — for tests and the backtest only. Nothing here is
 *  published: the artifact carries the band and nothing else. */
export interface SimilarBandDetail {
  band: SimilarBand;
  poolN: number;
  recentN: number;
  peerMedianUsd: number;
  gapFraction: number;
  spread: number;
  /** The label the full pool alone would give, before the drop-one test. */
  rawBand: SimilarBand;
  /** The pool's asks moved to this car's mileage, ascending. */
  adj: number[];
}

/** This car's comparable pool, under askVsMarket's own guards (comps.ts):
 *  same masked cohort, within 40,000 miles, the trim split where the cohort
 *  mixes asserted trims, and one pack identity. Undefined = no pool. */
function pool(asks: AskIndex, vin: string, year: number, mileage: number, trimKey?: string, identity?: string, drive?: string): AskPeer[] | undefined {
  const k = askCohortKey(vin.slice(0, 8), year);
  const self = vin.toUpperCase();
  const all = asks.wide.get(k) ?? [];
  const comparable = (p: AskPeer) => p.vin !== self && Math.abs(p.mileage - mileage) <= MAX_PEER_MILE_GAP;
  const trims = new Set<string>();
  for (const p of all) if (p.trimKey) trims.add(p.trimKey);
  let peers: AskPeer[];
  if (trims.size <= 1) peers = all.filter(comparable);
  else if (trimKey) peers = (asks.narrow.get(`${k}|${trimKey}`) ?? []).filter(comparable);
  // Several versions under one VIN code and this car's own is not asserted:
  // the pool would be a mixture.
  else return undefined;
  if (peers.length < MIN_POOL) return undefined;
  const ids = new Set<string>();
  if (identity) ids.add(identity);
  for (const p of peers) if (p.identity) ids.add(p.identity);
  if (ids.size > 1) return undefined;
  // Two holes askVsMarket's identity guard leaves, closed here because this
  // answer is free and reaches more cars. Measured on 2026-11-18's "below"
  // labels before these lines: 325 of 9,125 were cars with no pack identity
  // of their own in a pool whose members all had one (a car we cannot show
  // is the same car), and 53 stated a drive most of their pool did not
  // (2023 Ioniq 6 AWD among RWDs, 2023 EQS 450 among 4MATICs). Either way the
  // comparison is not established, so there is none.
  // And a car with no pack identity at all, in a pool with none either
  // (2024 Alfa Romeo Tonale, 2023 EQS: no enrichment row): the VIN cohort
  // is the only evidence of sameness, and that is the evidence the 2024
  // Model Y 7SAYGDED pool showed to be insufficient. 83 of the 6,512
  // "below" labels were these.
  if (!identity) return undefined;
  if (drive) {
    const stated = peers.filter((p) => p.drive);
    if (stated.length >= 2 && stated.filter((p) => p.drive === drive).length * 2 < stated.length) return undefined;
  }
  return peers;
}

const cut = (f: number, spread: number, n: number, gapUsd: number): SimilarBand => {
  if (f <= -BELOW_K * spread * (1 + BELOW_SE / Math.sqrt(n)) && -gapUsd >= MIN_GAP_USD) return "below";
  if (f >= ABOVE_K * spread * (1 + ABOVE_SE / Math.sqrt(n)) && gapUsd >= MIN_GAP_USD) return "above";
  return "typical";
};

export function similarBandDetail(
  asks: AskIndex,
  comps: CompIndex,
  vin: string | undefined,
  year: number,
  mileage: number | undefined,
  askUsd: number,
  realPrice: boolean,
  trimKey?: string,
  identity?: string,
  /** The drive the card states (feed's word, else the enrichment row's). */
  drive?: string
): SimilarBandDetail | undefined {
  if (!realPrice || !vin || vin.length < 8) return undefined;
  if (mileage == null || mileage < 2000 || mileage > 200_000) return undefined;
  if (!Number.isFinite(askUsd) || askUsd <= 0) return undefined;
  const peers = pool(asks, vin, year, mileage, trimKey, identity, drive);
  if (!peers) return undefined;

  const { perMile } = askCohortSlope(comps, asks, vin, year);
  const adj = peers.map((p) => p.askUsd + perMile * (mileage - p.mileage)).sort((a, b) => a - b);
  const med = median(adj);
  if (!Number.isFinite(med) || med <= 0) return undefined;

  const gapUsd = askUsd - med;
  const f = gapUsd / med;
  if (f < 0 && -gapUsd > MAX_UNDER_FRACTION * askUsd) return undefined;

  const mad = median(adj.map((a) => Math.abs(a - med))) / med;
  const spread = adj.length >= SPREAD_MIN_N ? Math.max(mad, SPREAD_FLOOR) : Math.max(mad, SPREAD_DEFAULT);
  const rawBand = cut(f, spread, adj.length, gapUsd);

  // Drop-one: a label that one peer's absence would flip is not a claim.
  // Removing the dearest peer gives the lowest median a "below" could be
  // measured against, removing the cheapest the highest one an "above"
  // could; anything else lies between them.
  let band = rawBand;
  if (rawBand !== "typical") {
    const loMed = median(adj.slice(0, -1));
    const hiMed = median(adj.slice(1));
    const against = rawBand === "below" ? loMed : hiMed;
    const g = askUsd - against;
    if (cut(g / against, spread, adj.length - 1, g) !== rawBand) band = "typical";
  }
  return {
    band,
    poolN: peers.length,
    recentN: peers.filter((p) => p.recent).length,
    peerMedianUsd: Math.round(med),
    gapFraction: f,
    spread,
    rawBand,
    adj,
  };
}

/** The band and nothing else: what the publisher writes. */
export function similarBand(...args: Parameters<typeof similarBandDetail>): SimilarBand | undefined {
  return similarBandDetail(...args)?.band;
}
