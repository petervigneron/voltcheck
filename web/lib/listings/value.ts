import type { Listing } from "./types";
import {
  FALLBACK_USD_PER_MILE,
  MAX_PEER_MILE_GAP,
  MAX_UNDER_FRACTION,
  MIN_ABS_USD,
  MIN_PEERS,
  askCohortFetchPattern,
  askCohortPeers,
  buildAskIndex,
  cohortIdentityMixed,
  cohortIsMixed,
  compCohort,
  fetchCompIndex,
  median,
  usd,
  type CompCohort,
  type CompIndex,
} from "./comps";
import { fetchCohortFromDb, fetchModelYearAsksFromDb, type ModelYearAsk } from "./db";
import { enrichListing, packIdentity, specTrim } from "./enrich";
import { hasRealPrice, PRICE_FLOOR_USD } from "./price";
import { trimClaim } from "./trimClaim";

/**
 * What is this car worth? — /worth, the free valuation tool.
 *
 * A SIBLING of comps.ts and peers.ts, not a fork. Those two answer "how does
 * this listing's asking price compare", for a car that is for sale and has a
 * price on it. This one answers "what would this car fetch", for a car that is
 * in the owner's driveway and has no price at all. Same cohorts, same fitted
 * sold model, same guardrails — every gate below is imported from comps.ts or
 * restated with the name of the false claim it was added for, because each one
 * is there because something wrong reached the site once.
 *
 * ── The three tiers, best first ────────────────────────────────────────────
 *
 * SOLD needs a VIN, because ev_price_model (migration 0014) is keyed on VIN
 * positions 1-8 plus model year and nothing else addresses it. It quotes the
 * cohort's fitted line at this odometer, plus and minus the cohort's OWN
 * median absolute residual — half of a cohort's residuals fall inside its
 * median absolute residual by the definition of the statistic. The records
 * behind it are Washington title sales: money that changed hands. Since the
 * 2026-08-26 calibration the band is deflated to the NATIONAL price level
 * (WA asks run measured +5.7% over national), so it renders est-marked: an
 * adjusted figure standing on real sales, no longer the raw record.
 *
 * ESTIMATE is the default, and it is what the picker path gets. It is the
 * median live ask of comparable cars, moved to this car's odometer on the
 * cohort's own depreciation slope where there is one, then converted from an
 * ask to a transaction by the measured, proportional ASK_TO_SOLD_DISCOUNT
 * (the calibration block below). It is marked est everywhere it renders.
 *
 * ABSTAIN is under four comparable live listings, and it is one sentence and a
 * link — no number, no hedge. Four is comps.ts's MIN_PEERS, and its reasoning
 * carries over exactly: below four the median is one or two dealers' opinions
 * and a single aspirational asking price moves it thousands.
 *
 * ── What this tool is NOT allowed to say ───────────────────────────────────
 *
 * The ESTIMATE tier's pool, on the picker path, is a whole model year of one
 * nameplate — a mixture by construction, and comps.ts spends a hundred lines
 * refusing to quote a number off a mixture. The difference is the CLAIM, not
 * the data: askVsMarket says "THIS car is $18,408 above the market", which is
 * only true if the peers are the same car, and it was a 2023 Lightning
 * Platinum priced against Pros that taught us so. This tier's claim is a
 * MARKET estimate marked `est` — a level, never a per-car delta — which is
 * what a mixture can honestly support. (It used to also print a sentence
 * naming the pool; owner decision 2026-08-26 removed every sentence from a
 * numeric answer — see "The verdict" below.) A seller who wants the mixture
 * narrowed has two levers, and both are optional by owner decision: a VIN,
 * which swaps the pool for the VIN 1-8 cohort, and a trim, which narrows to
 * the trims the live cohort actually asserts.
 *
 * SOLD carries no such licence, because "sold between X and Y" IS a per-car
 * claim, so it runs every mixture gate askVsSold runs and one more.
 *
 * ── The trim field never free-matches ──────────────────────────────────────
 *
 * A typed trim narrows the pool only when it equals a trim the LIVE cohort
 * asserts, under trimClaim's judgement and specTrim's normalization — the same
 * two functions buildIndex.ts keys its narrow ask index with. A trim that
 * matches nothing is ignored in silence rather than reported as unrecognized:
 * the pool it would have selected does not exist, and the wide pool is the
 * honest answer to the question that was asked.
 *
 * ── Database discipline ────────────────────────────────────────────────────
 *
 * One cohort read on the picker path (db.ts fetchModelYearAsksFromDb, typed
 * columns, capped at 500 rows inside a mileage window). One on the VIN path
 * (fetchCohortFromDb, the same read peers.ts makes) — and a second only when
 * that cohort turns out too thin to price from, which is the case the
 * make/model pool exists to catch. The fitted sold model is one day-cached
 * request of a few hundred coefficient rows however many visitors ask. No
 * count over listings, no fan-out over VIN prefixes, nothing whose cost grows
 * with inventory.
 *
 * A read that FAILS is reported as a failure — "couldn't check right now" —
 * and never as "we can't value this car". They are opposite statements about
 * opposite things, and collapsing them would tell a seller their car is
 * unusual when the database merely hiccupped.
 */

// ── Inputs ─────────────────────────────────────────────────────────────────

export interface WorthInput {
  year: number;
  make: string;
  model: string;
  mileage: number;
  /** Optional. Upgrades ESTIMATE to SOLD when the cohort gates clear. */
  vin?: string;
  /** Optional. Narrows the ask pool, but only to a trim the live cohort
   *  asserts — see the header. */
  trim?: string;
  /** Optional. Narrows the ask pool to one drivetrain, under the same rule as
   *  the trim: only to a value the live pool actually carries, only when
   *  enough of it is for sale, silently ignored otherwise. A "SEL" pool mixes
   *  RWD and AWD, and they are different money. */
  drive?: "RWD" | "AWD" | "FWD";
  /**
   * Optional; absent on every URL minted before the question existed, and
   * absence behaves as "good". What the seller said about condition and title:
   *
   *   good     no accidents, clean title — the car the comp pools describe.
   *   issues   accident or repair history. Collected and deliberately NOT
   *            priced: the discount is real but this site has never measured
   *            it, and an unmeasured haircut is a guess wearing a number
   *            (the house rule on claims). The pools themselves are a market
   *            mixture that includes such cars, so the market estimate the
   *            tier claims stays honest.
   *   branded  rebuilt / salvage / branded title. Refused a number outright,
   *            below — every pool this tool can build is priced against clean
   *            titles, and a branded car sells so far outside that market
   *            that quoting it would be the false-bargain error inverted.
   */
  condition?: "good" | "issues" | "branded";
}

// The window askVsSold and buildAskIndex both draw around a DRIVEN car: below
// 2,000 miles a car is delivery mileage and the fitted line was never shown
// one, above 200,000 the model has nothing to say. Restated here rather than
// imported because comps.ts holds them as inline literals in two functions;
// if they ever move, these move with them.
const DRIVEN_MILES_LO = 2_000;
const DRIVEN_MILES_HI = 200_000;

// ev_price_model itself refuses to fit a cohort under 8 arms-length sales
// (migration 0015, `having count(*) >= 8`). Repeated here as a tripwire, not
// as a second opinion: if that floor is ever lowered, this surface's sold
// band should not quietly start standing on 3 sales.
const MIN_SOLD_N = 8;

/** A valuation quoted to the dollar claims a precision no fit on a few dozen
 *  title records has. The comparison surfaces round to the dollar because they
 *  print a DIFFERENCE between two known numbers; this prints a level. */
const round100 = (n: number): number => Math.round(n / 100) * 100;

// ── The 2026-08-26 calibration (docs/tools/worth-calibration.mts) ──────────
//
// Measured against WA title sales with a real train/test split (fit Mar-May
// 2026, judged on Jun-Jul): the two constants below halved the baseline's
// holdout error (5.9%→3.0% June, 4.6%→2.9% July, median absolute error over
// cohort × mileage-band cells). Re-run the script when WA publishes a new
// month — the drift extrapolation to "today" is the least-identified piece
// and each month of data firms it up.

/** Cars clear about this fraction UNDER their asking price, contemporaneously.
 *  Replaces the flat $1,100 (comps.ts ASK_OVER_SOLD_USD, which the comparison
 *  surfaces still use for their own delta claims): the flat figure was
 *  measured in a different market and is directionally wrong above $25k —
 *  it over-penalized a $12k Bolt by ~$750 and under-penalized a $60k car.
 *  Proportional, small, and est-marked, per the calibration. */
const ASK_TO_SOLD_DISCOUNT = 0.013;

/** Washington asking prices run this fraction ABOVE national asks for
 *  identical cohort/mileage cells (83 cells, 957 WA listings). Any WA-anchored
 *  price LEVEL shown to a national audience is deflated by it — which turns
 *  the sold band from a raw record into an estimate, and it is marked est
 *  accordingly. Slopes (usdPerMile) are untouched: a premium on the level
 *  cancels out of a per-mile difference. */
const WA_OVER_NATIONAL = 0.057;

// ── The SOLD tier ──────────────────────────────────────────────────────────

export interface SoldBand {
  lowUsd: number;
  highUsd: number;
  /** The fitted line at this odometer — the band's centre. */
  midUsd: number;
  salesN: number;
}

/**
 * The Washington sold band for this cohort at this odometer, or undefined.
 *
 * Every gate here is askVsSold's, in askVsSold's order, plus two this surface
 * needs and that one does not:
 *
 *   IDENTITY MIXTURE (`identityMixed`) — cohortIdentityMixed's answer, which
 *     the caller computes from the live cohort. Tesla stamps single-motor 2024
 *     Model Ys with one VIN code whether the pack is Long Range or standard,
 *     and Teslas carry no feed trim, so the trim-span gate below reads zero
 *     while cohort 7SAYGDED holds two different cars. peers.ts applies this to
 *     askVsSold on the listing page; this surface makes a louder claim off the
 *     same fit and cannot skip it.
 *
 *   FLAT OR INVERTED FIT (`usdPerMile >= 0`) — a cohort whose fitted line says
 *     a car gains value as it is driven has not fitted anything; it is a
 *     mixture, or a handful of points, and its intercept is wherever the
 *     algebra landed. askVsMarket already treats a negative slope as the
 *     condition for calling an adjustment "anchored in sales"
 *     (`slopeFromSales`); this makes the same test a gate rather than a label,
 *     because a band centred on such a line would be a confident number drawn
 *     from a line that does not describe depreciation. Those cohorts fall
 *     through to ESTIMATE, which is exactly where a car we can only compare
 *     against today's asks belongs.
 *
 * The band is the fit plus and minus the cohort's own median absolute
 * residual, floored at MIN_ABS_USD for the reason comps.ts floors its show
 * threshold there — a cohort that predicts itself to $200 is thin and
 * suspiciously tight, not precise — and refused outright when that half-width
 * runs past MAX_UNDER_FRACTION of the fit, because at that spread the band
 * covers a range in which this site would decline to call anything a bargain,
 * and a band that wide is not an answer.
 *
 * Finally the edges are clamped into the cohort's observed sale range. This is
 * the price axis of the odometer gate above and it is askVsSold's saleLo /
 * saleHi rule read for a level rather than a distance: a cohort whose dearest
 * sale was $61,798 must not print $64,100 as the top of what cars like this
 * one sell for, because no car in it ever reached that.
 */
export function soldBand(
  c: CompCohort | undefined,
  mileage: number,
  opts: { identityMixed: boolean }
): SoldBand | undefined {
  if (!c) return undefined;
  if (!Number.isFinite(mileage) || mileage < DRIVEN_MILES_LO || mileage > DRIVEN_MILES_HI) return undefined;
  // A line says nothing about mileage its cohort never saw — the 2020 Taycan
  // that read $11k underpriced off a fit built on 40k-mile cars.
  if (mileage < c.odoLo || mileage > c.odoHi) return undefined;
  // One car, or several? (migration 0022, the Lightning Pro-through-Platinum
  // cohorts whose error is biased rather than noisy.)
  if (cohortIsMixed(c)) return undefined;
  if (opts.identityMixed) return undefined;
  if (!Number.isFinite(c.salesN) || c.salesN < MIN_SOLD_N) return undefined;
  if (!Number.isFinite(c.usdPerMile) || c.usdPerMile >= 0) return undefined;

  const mid = c.interceptUsd + c.usdPerMile * mileage;
  if (!Number.isFinite(mid) || mid <= 0) return undefined;
  if (!Number.isFinite(c.saleLo) || !Number.isFinite(c.saleHi) || c.saleHi <= c.saleLo) return undefined;
  if (mid < c.saleLo || mid > c.saleHi) return undefined;

  const half = Math.max(c.residMedaeUsd, MIN_ABS_USD);
  if (!Number.isFinite(half) || half > MAX_UNDER_FRACTION * mid) return undefined;

  // Everything above runs in the WASHINGTON price frame the cohort was fitted
  // in — including the clamp into observed sales. The band is deflated to the
  // national level last (WA_OVER_NATIONAL above), which is also the moment it
  // stops being a raw record and becomes an estimate: the caller marks it est.
  const nat = 1 / (1 + WA_OVER_NATIONAL);
  const lowUsd = round100(Math.max(mid - half, c.saleLo) * nat);
  const highUsd = round100(Math.min(mid + half, c.saleHi) * nat);
  if (!(highUsd > lowUsd)) return undefined;
  return { lowUsd, highUsd, midUsd: round100(mid * nat), salesN: c.salesN };
}

// ── The ESTIMATE tier ──────────────────────────────────────────────────────

/** A live listing this car can be compared against. Deliberately smaller than
 *  comps.ts's AskPeer: the picker path never loads a payload, so it has no
 *  pack identity to carry (db.ts fetchModelYearAsksFromDb says why). */
export interface WorthPeer {
  vin: string;
  mileage: number;
  askUsd: number;
  /** Only where trimClaim will stand behind it, uppercased — buildIndex.ts's
   *  rule, because one dealer's "PRO" and the next one's "Pro" are one trim. */
  trimKey?: string;
  /** The same trim in the spelling specTrim settled on, kept alongside the key
   *  so a narrowed pool can be described in the market's words rather than in
   *  the visitor's. Typing "long range" must not make the page print "2023
   *  Tesla Model Y long range listings" — the trim is the maker's name for a
   *  version of the car, not a search term the reader supplied. */
  trimLabel?: string;
  drive?: "RWD" | "AWD" | "FWD";
}

export type PoolBasis = "vin-cohort" | "model-year";

export interface AskPool {
  peers: WorthPeer[];
  basis: PoolBasis;
  /** The trim the pool was narrowed to, in the maker's spelling. Absent when
   *  no trim was given, or when the one given matched nothing the live cohort
   *  asserts — the two are indistinguishable to the reader on purpose. */
  matchedTrim?: string;
  /** The drivetrain the pool was narrowed to, under the same absence rule. */
  matchedDrive?: "RWD" | "AWD" | "FWD";
  /** cohortIdentityMixed's verdict. Only ever meaningful on a vin-cohort
   *  pool: the model-year read carries no payload and therefore cannot match
   *  enrichment rows, so it cannot answer this question at all. */
  identityMixed: boolean;
  /** Whether that question was ASKED. False means the VIN cohort read did not
   *  answer, which must block the SOLD tier rather than pass it by default. */
  identityChecked: boolean;
}

export interface AskEstimate {
  valueUsd: number;
  peerN: number;
  /** True when the mileage adjustment used the cohort's own fitted slope
   *  rather than the dataset-wide fallback. */
  slopeFromSales: boolean;
}

/**
 * The mileage-adjusted median live ask, converted to a transaction estimate.
 *
 * The adjustment is askVsMarket's, verbatim in method and in constants: peers
 * more than MAX_PEER_MILE_GAP away are dropped rather than corrected (past
 * 40,000 miles the correction is bigger than the signal), the cohort's own
 * fitted slope moves the rest to this odometer where one exists, and
 * FALLBACK_USD_PER_MILE does it where one does not.
 *
 * The fallback slope is deliberately gentle, and comps.ts explains that as
 * erring toward making a car look EXPENSIVE. That is the safe direction here
 * too, for a different reason worth stating: this tool's reader is a SELLER,
 * and a seller told too low a number sells cheap and loses the difference,
 * while a seller told too high a number fails to sell and finds out. The
 * asymmetry points the same way on both surfaces.
 *
 * ASK_TO_SOLD_DISCOUNT then converts the ask median to a transaction figure,
 * because a median of asking prices is not what a car is worth — see the
 * calibration block above for why the conversion is proportional and small
 * rather than the flat $1,100 it replaced.
 */
export function askEstimate(
  pool: AskPool,
  mileage: number,
  c: CompCohort | undefined
): AskEstimate | undefined {
  if (!Number.isFinite(mileage) || mileage < DRIVEN_MILES_LO || mileage > DRIVEN_MILES_HI) return undefined;
  const comparable = pool.peers.filter((p) => Math.abs(p.mileage - mileage) <= MAX_PEER_MILE_GAP);
  if (comparable.length < MIN_PEERS) return undefined;

  const slopeFromSales = c != null && Number.isFinite(c.usdPerMile) && c.usdPerMile < 0;
  const perMile = slopeFromSales ? c!.usdPerMile : FALLBACK_USD_PER_MILE;
  const askMedian = median(comparable.map((p) => p.askUsd + perMile * (mileage - p.mileage)));
  if (!Number.isFinite(askMedian) || askMedian <= 0) return undefined;

  const value = askMedian * (1 - ASK_TO_SOLD_DISCOUNT);
  // A figure under the junk-price floor is the floor's own argument turned
  // around: at that level we do not believe a listed number is a price, so we
  // will not publish one as a valuation either.
  if (value < PRICE_FLOOR_USD) return undefined;
  return { valueUsd: round100(value), peerN: comparable.length, slopeFromSales };
}

/**
 * Narrow a pool to one trim, but only to a trim the pool itself asserts.
 *
 * The typed string is normalized through specTrim — the same function that
 * produced every trimKey in the pool — so "Long Range AWD" and "long range"
 * both land on the key "LONG RANGE" that a Tesla cohort actually carries, and
 * a spelling nobody uses lands on nothing. Equality, never containment: "GT"
 * must not select "GT Line", and "Premium" must not select "Premium Plus".
 *
 * A narrowed pool under MIN_PEERS is discarded and the wide pool kept. This is
 * askVsMarket's rule for the same situation read one way rather than the
 * other — that function returns nothing at all when a mixed cohort has too few
 * of this car's trim listed, because it is about to make a per-car claim off
 * the mixture; this one falls back to the mixture and says in its sourcing
 * line that the mixture is what it used.
 */
export function narrowByTrim(pool: AskPool, input: WorthInput): AskPool {
  const raw = (input.trim ?? "").trim();
  if (!raw) return pool;
  const want = specTrim({ make: input.make, model: input.model, year: input.year, trim: raw } as Listing);
  if (!want) return pool;
  const key = want.toUpperCase();
  const hits = pool.peers.filter((p) => p.trimKey === key);
  if (hits.length < MIN_PEERS) return pool;
  // The pool's own spelling wins over the visitor's — most common first, so
  // one dealer's shouted "LONG RANGE" cannot rename the version.
  const tally = new Map<string, number>();
  for (const p of hits) if (p.trimLabel) tally.set(p.trimLabel, (tally.get(p.trimLabel) ?? 0) + 1);
  const label = [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
  return { ...pool, peers: hits, matchedTrim: label ?? want };
}

/**
 * Narrow a pool to one drivetrain — narrowByTrim's rule on a cleaner axis:
 * the values are already a three-way enum, so there is no spelling to settle,
 * and the same MIN_PEERS floor keeps the wide pool when the narrowed one is
 * too thin to price from. Runs AFTER the trim narrowing on its result, so
 * "SEL AWD" prices against SEL AWDs when enough exist, SELs when not.
 */
export function narrowByDrive(pool: AskPool, input: WorthInput): AskPool {
  if (!input.drive) return pool;
  const hits = pool.peers.filter((p) => p.drive === input.drive);
  if (hits.length < MIN_PEERS) return pool;
  return { ...pool, peers: hits, matchedDrive: input.drive };
}

// ── Building a pool ────────────────────────────────────────────────────────

/** The VIN 1-8 cohort, out of the same fetch and the same derivations
 *  peers.ts makes for the listing page: trim only where trimClaim will stand
 *  behind it, pack identity from the enrichment layer, disclosed repurchases
 *  out of the pool, and buildAskIndex's own admission rules applied by
 *  buildAskIndex rather than restated here. */
export function vinCohortPool(rows: Listing[], input: WorthInput): AskPool {
  const self = (input.vin ?? "").toUpperCase();
  const members = rows
    .filter((m) => !m.buybackDisclosed && !m.brandedTitleDisclosed)
    .map((m) => {
      const t = trimClaim(m).assert ? specTrim(m) : undefined;
      return { ...m, trimKey: t ? t.toUpperCase() : undefined, identity: packIdentity(enrichListing(m)) };
    });
  const asks = buildAskIndex(members);
  // buildAskIndex carries the uppercased key and not the spelling, so the
  // spelling — and the drivetrain — come back off the members it was built
  // from.
  const labels = new Map(members.map((m) => [m.vin.toUpperCase(), specTrim(m)]));
  const drives = new Map(members.map((m) => [m.vin.toUpperCase(), m.drive]));
  return {
    peers: askCohortPeers(asks, input.vin, input.year)
      .filter((p) => p.vin !== self)
      .map((p) => ({
        vin: p.vin,
        mileage: p.mileage,
        askUsd: p.askUsd,
        trimKey: p.trimKey,
        trimLabel: p.trimKey ? labels.get(p.vin) : undefined,
        drive: drives.get(p.vin),
      })),
    basis: "vin-cohort",
    identityMixed: cohortIdentityMixed(asks, input.vin, input.year),
    identityChecked: true,
  };
}

/**
 * The make/model/model-year pool, from db.ts's typed-column read.
 *
 * Admission mirrors buildAskIndex's: a real price by the year-tiered floor
 * (not a bare threshold — a $1,493 finance payment on a 2023 Model Y cleared
 * the old one and would seed this pool with a false comp), a driven odometer,
 * and the subject's own listing excluded if it happens to be for sale.
 *
 * trimClaim runs on a listing assembled from typed columns, so two of its
 * three gates are live — cab styles ("SuperCrew" is not a trim) and feed
 * placeholders — and the third is not: `trimSuspect`, the corpus-and-
 * description judgement, lives in the payload this read deliberately does not
 * fetch. That gate covered 10 of 100,286 live listings when it was measured
 * (2026-08-21), and what it can cost here is bounded by where a trim is used
 * at all: narrowByTrim, which needs MIN_PEERS agreeing listings before it
 * narrows anything, so a single mislabelled car cannot become a pool.
 */
export function modelYearPool(rows: ModelYearAsk[], input: WorthInput): AskPool {
  const self = (input.vin ?? "").toUpperCase();
  const peers: WorthPeer[] = [];
  for (const r of rows) {
    if (!r.vin || r.mileage == null) continue;
    if (r.mileage < DRIVEN_MILES_LO || r.mileage > DRIVEN_MILES_HI) continue;
    if (!Number.isFinite(r.priceUsd)) continue;
    if (!hasRealPrice({ priceUsd: r.priceUsd, condition: r.condition, year: r.year })) continue;
    const vin = r.vin.toUpperCase();
    if (vin === self) continue;
    const as: Listing = {
      make: input.make,
      model: input.model,
      year: r.year,
      trim: r.trim,
    } as Listing;
    const t = trimClaim(as).assert ? specTrim(as) : undefined;
    // The payload's drive field, admitted only on exact enum match — a feed
    // that wrote "4x4" or "e-AWD" there abstains rather than seeding a
    // narrowed pool with a spelling the filter can never select.
    const d = r.drive === "RWD" || r.drive === "AWD" || r.drive === "FWD" ? r.drive : undefined;
    peers.push({
      vin,
      mileage: r.mileage,
      askUsd: r.priceUsd,
      trimKey: t ? t.toUpperCase() : undefined,
      trimLabel: t,
      drive: d,
    });
  }
  return { peers, basis: "model-year", identityMixed: false, identityChecked: false };
}

// ── The verdict ────────────────────────────────────────────────────────────
//
// A NUMERIC verdict carries no sentence, by owner decision (2026-08-26, his
// words: "I don't want any spurious line at all. I want people to be able to
// enter information about their car, and learn what its value is"). This is
// the house rule on copy applied to this page's own answer: the value IS the
// answer, the `est` mark carries the provenance promise, and the methodology
// is deliberately not described on the site (it is the model, and the model
// is the IP). Two earlier lines died for this — "Estimated from N listings
// for sale right now" (the launch copy) and a channel-naming line with a
// "a dealer buying yours will offer less" clause (shipped un-approved
// 2026-08-25, on the site for a day, exactly the disclaimer the rule
// forbids). Do not add a third. Everything this tool is unwilling to claim
// it handles by changing TIER, not by qualifying the number — the sentence
// tiers below are the cases where a sentence is the whole answer.

/** Did a Washington title figure go into this number? The sold band IS one,
 *  and an estimate is one whenever the cohort's fitted slope moved the peers
 *  rather than the dataset-wide fallback. Carried on the verdict because the
 *  ODbL credit that data.wa.gov rpr4-cgyd requires is a LICENCE TERM, not a
 *  design choice — same rule sales.ts and components/RecentSales.tsx follow —
 *  and the renderer has no other way to know whether it owes one. */
export type WaDerived = { waDerived: boolean };

export type Valuation =
  // estimated: true since the 2026-08-26 calibration — the band is the WA fit
  // deflated to the national level, an adjusted figure rather than a raw
  // record, and the est mark is the page's provenance promise.
  | ({ tier: "sold"; estimated: true; salesN: number; headline: string } & SoldBand & WaDerived)
  | ({
      tier: "estimate";
      estimated: true;
      valueUsd: number;
      peerN: number;
      basis: PoolBasis;
      matchedTrim?: string;
      matchedDrive?: "RWD" | "AWD" | "FWD";
      headline: string;
    } & WaDerived)
  | { tier: "abstain"; source: string }
  | { tier: "unavailable"; source: string };

/** "2023 Tesla Model Y" — what the reader picked, in their own words. */
export const vehicleLabel = (i: WorthInput): string => `${i.year} ${i.make} ${i.model}`.replace(/\s+/g, " ").trim();

/** The abstention. One sentence, no number, and the page puts a link to the
 *  model's listings beside it — the useful thing we can still do. */
export const abstainCopy = (i: WorthInput): string =>
  `Fewer than four comparable ${vehicleLabel(i)} listings are for sale right now — too few to put a number on, so we won't.`;

/** A read failed. Not the same statement as the one above, and the difference
 *  matters to a seller: their car is fine, our database is not. */
export const UNAVAILABLE_COPY =
  "We couldn't check right now — try again shortly.";

/** A branded title. One sentence, no number — see WorthInput.condition. */
export const BRANDED_TITLE_COPY =
  "Rebuilt, salvage, and branded titles sell outside the market these listings describe, so we won't put a number on one.";

/**
 * Tier selection, with every fetch already done. Pure, so the guardrail cases
 * are unit-testable without a database.
 *
 * Order is best-wins and it is not a fallthrough chain by accident: SOLD is
 * tried first and its refusal is silent, because a cohort that cannot support
 * a transaction claim can very often support an ask-side estimate, and the
 * reader is better served by the weaker true statement than by nothing.
 */
export function decideValue(
  input: WorthInput,
  comps: CompIndex,
  pool: AskPool | null,
  opts: { dbFailed: boolean } = { dbFailed: false }
): Valuation {
  // Before any pool is consulted: no pool this tool can build makes a number
  // for a branded title honest, so the refusal cannot depend on what was
  // fetched.
  if (input.condition === "branded") return { tier: "abstain", source: BRANDED_TITLE_COPY };
  if (!pool) return { tier: opts.dbFailed ? "unavailable" : "abstain", source: opts.dbFailed ? UNAVAILABLE_COPY : abstainCopy(input) };

  const c = compCohort(comps, input.vin, input.year);
  const narrowed = narrowByDrive(narrowByTrim(pool, input), input);

  // SOLD only where the VIN gave us a cohort AND the live cohort was actually
  // consulted about the identity mixture. A VIN with an unanswered cohort read
  // is a VIN we cannot run every gate for, and a gate we skipped is not a gate.
  if (input.vin && pool.identityChecked) {
    const band = soldBand(c, input.mileage, { identityMixed: pool.identityMixed });
    if (band)
      return {
        tier: "sold",
        estimated: true,
        waDerived: true,
        ...band,
        headline: `${usd(band.lowUsd)} – ${usd(band.highUsd)}`,
      };
  }

  const est = askEstimate(narrowed, input.mileage, c);
  if (est) {
    return {
      tier: "estimate",
      estimated: true,
      valueUsd: est.valueUsd,
      peerN: est.peerN,
      basis: narrowed.basis,
      matchedTrim: narrowed.matchedTrim,
      matchedDrive: narrowed.matchedDrive,
      waDerived: est.slopeFromSales,
      headline: usd(est.valueUsd),
    };
  }

  // Nothing to say. If a read failed on the way here we cannot tell "too few
  // like it" from "we didn't look", and must say the second.
  if (opts.dbFailed) return { tier: "unavailable", source: UNAVAILABLE_COPY };
  return { tier: "abstain", source: abstainCopy(input) };
}

// ── The one entry point the page calls ─────────────────────────────────────

export async function valueVehicle(input: WorthInput): Promise<Valuation> {
  const vin = input.vin && input.vin.length >= 8 ? input.vin.toUpperCase() : undefined;
  const i: WorthInput = { ...input, vin };
  if (!Number.isFinite(i.year) || !Number.isFinite(i.mileage) || !i.make || !i.model) {
    return { tier: "abstain", source: abstainCopy(i) };
  }

  // decideValue holds the branded-title refusal so it is unit-tested with the
  // other gates; short-circuiting here as well just spares the database two
  // reads whose answer could not change it.
  if (i.condition === "branded") return decideValue(i, new Map(), null);

  // A few hundred coefficient rows, day-cached, shared with every other
  // surface on the site that prices anything.
  const comps = await fetchCompIndex();

  let pool: AskPool | null = null;
  let dbFailed = false;

  if (vin) {
    // The listing page's read, for a car that may have no listing: the pattern
    // widens the fetch where a maker spent a VIN digit on something that is
    // not the vehicle (Ford's GVWR class in position 4).
    const rows = await fetchCohortFromDb(askCohortFetchPattern(vin.slice(0, 8)), i.year);
    if (rows === null) dbFailed = true;
    else {
      const built = vinCohortPool(rows, i);
      // Kept even when it is too thin to price from: its identity verdict is
      // what lets the SOLD tier run, and that verdict does not need four
      // listings — one live car resolving to a second pack is the whole
      // argument.
      pool = built;
    }
  }

  // The make/model pool is the picker's own, and the VIN path's safety net
  // when positions 1-8 turn out to address almost nothing for sale.
  if (!pool || pool.peers.length < MIN_PEERS) {
    const rows = await fetchModelYearAsksFromDb(
      i.make,
      i.model,
      i.year,
      i.mileage - MAX_PEER_MILE_GAP,
      i.mileage + MAX_PEER_MILE_GAP
    );
    if (rows === null) dbFailed = true;
    else {
      const wide = modelYearPool(rows, i);
      // The VIN cohort's identity verdict survives the swap — it is a fact
      // about the VIN, not about which pool we ended up pricing from.
      pool = pool
        ? { ...wide, identityMixed: pool.identityMixed, identityChecked: pool.identityChecked }
        : wide;
    }
  }

  return decideValue(i, comps, pool, { dbFailed });
}
