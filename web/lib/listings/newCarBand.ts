import { askCohortKey, median } from "./comps";
import type { SimilarBand } from "./similarBand";

// The new-car half of the free asking-vs-similar band: the same published
// code per car, the same connector field, the same three words. The used-car
// rule (similarBand.ts) is untouched and never sees a new car; this one never
// sees a used one.
//
// ── Why it compares the DISCOUNT from the sticker, not the asking price ─────
//
// Measured 2026-11-18 on all 100,415 live new cars (public API, one read):
//
//  1. Raw asks within a version (VIN 1-8 + model year + trim + drive + pack)
//     sit a median 1.9% from their version's median, but the tails are long
//     (p90 8.0%) and they are not price: BMW, Mercedes, Cadillac and Volvo
//     options move a sticker by thousands inside one trim. Of 9 "below" labels
//     a raw-ask rule gave whose dealer page could be read, 2 were cars priced
//     at their own sticker with fewer options than their peers (a 2027 Optiq
//     Sport at $56,151 MSRP, a 2026 X5 xDrive50e at $79,650 MSRP).
//  2. The stored price is not one rung of the dealer's price ladder across
//     lanes. Of 31 dealer pages read: 11 stored the sticker, 8 an
//     unconditional dealer price, 1 a price net of incentives the page itself
//     says "not all customers will qualify" for, 11 could not be told from the
//     page (8 of them Team Velocity, whose stored new prices sat 2.6-17.8%
//     under the page's sticker). Ford's $4,500 retail stack shows it plainly:
//     one Mach-E dealer's stored price is MSRP, the next one's is MSRP minus
//     $4,500 of rebates, and a raw-ask pool of the two calls the first one
//     "above" and the second "below" for the same deal. Of 7 raw-ask "above"
//     labels read, 5 were that mixture and 1 was options.
//
// So the backtest of a raw-ask rule was 4 of 9 readable "below" labels not to
// stand behind (44%), against a 5% bar — no threshold separates them, because
// rebate stacks ($1,000-$7,500) and option spreads sit exactly where a real
// discount does. A raw-ask comparison is not built.
//
// What would be honest is the discount from the car's OWN sticker, compared
// with the discount its version's other cars carry, and only where every price
// in the comparison is read from a rung before manufacturer incentives. That
// takes out options (they are in the sticker) and the rebate mixture (no car
// carries one). Neither fact is stored today: the lanes read an MSRP at crawl
// time (dealer.com msrp, the Dealer Inspire card's msrp, DealerOn's ladder,
// the OEM locators) and drop it, and no lane marks which rung its price is.
// Until a lane fills `msrpUsd` AND `priceBeforeIncentives` on a listing, this
// rule answers nothing for that car — absent, never a guess.
//
// ── "below" is never said for a new car ────────────────────────────────────
//
// Even on the sticker basis a deep discount is the shape of a conditional
// rebate a lane failed to mark, and the page reads above found three such
// stacks with no field that says which lines are conditional. The cost of a
// false "below" is a shopper's money; the cost of silence is a missed label.
// A new car whose discount clears what "below" would need gets NO answer, not
// "typical": calling it typical would be a second false statement.
//
// ── Demos and leftovers ─────────────────────────────────────────────────────
//
// Cars sold as new with 500-1,999 miles sit 1.0% under their version and 31%
// of them more than 5% under (100-499 miles: 21%; under 100: 13%) — loaners and
// demos priced down for a reason the price alone cannot show. A new car with
// a stated odometer of NEW_MAX_MILES or more is neither compared nor a peer.
// A prior-model-year car is compared only with cars of its own model year (the
// cohort key carries the year), so a 2025 left over in late 2026 is held
// against other 2025 leftovers, not against 2026s.
//
// ── Regions ─────────────────────────────────────────────────────────────────
//
// One national pool. Every state with 300+ new cars in pools of 20 sits within
// 0.5% of the national version median (CA −0.07%, TX +0.17%, NY +0.01%, FL
// 0.00%; Kentucky, 426 cars, −0.7%), and each state's share of cars more than
// 5% off its version is within a few points of the national 10%. The spread is
// dealer-shaped, not state-shaped (dealers' own median gaps run −3.8% to
// +2.7%, deciles 1-9), which is what the sticker basis takes out.

/** A new car with a stated odometer at or past this is not compared. */
export const NEW_MAX_MILES = 500;
/** Peers below which nothing is compared. New-car pools are large: 89,919 of
 *  96,679 priced new cars sit in raw-ask versions of 20 or more. */
export const NEW_MIN_POOL = 5;
/** A pool this size measures its own spread of discounts. */
export const NEW_SPREAD_MIN_N = 20;
/** No pool's spread of discounts is trusted tighter than this (points of
 *  MSRP), and a smaller pool is held to the default. */
export const NEW_SPREAD_FLOOR = 0.015;
export const NEW_SPREAD_DEFAULT = 0.025;
/** "above": the car's discount must fall short of its version's typical
 *  discount by this many spreads, widened by (1 + ABOVE_SE/√n). */
export const NEW_ABOVE_K = 1.0;
export const NEW_ABOVE_SE = 1;
/** The gap the "below" side would need. Not a label: a car past it gets no
 *  answer. Kept at least as far out as "above", as the house rule asks. */
export const NEW_BELOW_K = 1.25;
export const NEW_BELOW_SE = 2;
/** And in dollars, either side. */
export const NEW_MIN_GAP_USD = 1000;
/** A price outside this share of its own sticker is not a price we can
 *  compare: deeper than 25% off is a rebate stack (dealer.com's own 0.6 floor
 *  is the abstain line; 25% is past every unconditional discount read), and
 *  more than 15% over is an add-on or a misread. */
export const NEW_MAX_DISCOUNT = 0.25;
export const NEW_MAX_MARKUP = 0.15;

export interface NewCarPeer {
  vin: string;
  askUsd: number;
  msrpUsd: number;
  /** 1 − ask/MSRP: positive under the sticker, negative over it. */
  discount: number;
  trimKey?: string;
  identity?: string;
  drive?: string;
}

export interface NewCarIndex {
  wide: Map<string, NewCarPeer[]>;
  narrow: Map<string, NewCarPeer[]>;
}

export interface NewCarInput {
  vin?: string;
  year: number;
  condition?: string;
  mileage?: number;
  priceUsd: number;
  /** The car's own sticker, as its lane read it. */
  msrpUsd?: number;
  /** True only where the lane read the price from a rung it knows comes
   *  before any manufacturer incentive (the MSRP, or the dealer's own price
   *  before rebates). Absent = not known, and not compared. */
  priceBeforeIncentives?: boolean;
  realPrice: boolean;
  buybackDisclosed?: boolean;
  brandedTitleDisclosed?: boolean;
  trimKey?: string;
  identity?: string;
  drive?: string;
}

/** The car's discount from its own sticker, or undefined where this rule
 *  cannot use the car at all — as a subject or as a peer. */
export function newCarDiscount(c: NewCarInput): number | undefined {
  if (c.condition !== "new" || !c.realPrice) return undefined;
  if (c.buybackDisclosed || c.brandedTitleDisclosed) return undefined;
  if (c.mileage != null && c.mileage >= NEW_MAX_MILES) return undefined;
  if (!c.vin || c.vin.length < 8) return undefined;
  if (c.priceBeforeIncentives !== true) return undefined;
  const msrp = c.msrpUsd;
  if (msrp == null || !Number.isFinite(msrp) || msrp <= 0) return undefined;
  if (!Number.isFinite(c.priceUsd) || c.priceUsd <= 0) return undefined;
  const d = 1 - c.priceUsd / msrp;
  if (d > NEW_MAX_DISCOUNT || -d > NEW_MAX_MARKUP) return undefined;
  return d;
}

const push = (m: Map<string, NewCarPeer[]>, k: string, p: NewCarPeer): void => {
  const b = m.get(k);
  if (b) b.push(p);
  else m.set(k, [p]);
};

/** Every comparable new car, keyed like the used pools (VIN 1-8 with
 *  comps.ts's masks + model year), and again by trim. */
export function buildNewCarIndex(cars: NewCarInput[]): NewCarIndex {
  const index: NewCarIndex = { wide: new Map(), narrow: new Map() };
  for (const c of cars) {
    const d = newCarDiscount(c);
    if (d === undefined) continue;
    const k = askCohortKey(c.vin!.slice(0, 8), c.year);
    const peer: NewCarPeer = { vin: c.vin!.toUpperCase(), askUsd: c.priceUsd, msrpUsd: c.msrpUsd!, discount: d, trimKey: c.trimKey, identity: c.identity, drive: c.drive };
    push(index.wide, k, peer);
    if (c.trimKey) push(index.narrow, `${k}|${c.trimKey}`, peer);
  }
  return index;
}

/** The same sameness tests as the used band's pool (similarBand.ts): the trim
 *  split where the cohort mixes asserted trims, one pack identity and the
 *  car's own, and a drive most of the pool shares. */
function newPool(idx: NewCarIndex, c: NewCarInput): NewCarPeer[] | undefined {
  const k = askCohortKey(c.vin!.slice(0, 8), c.year);
  const self = c.vin!.toUpperCase();
  const all = idx.wide.get(k) ?? [];
  const trims = new Set<string>();
  for (const p of all) if (p.trimKey) trims.add(p.trimKey);
  let peers: NewCarPeer[];
  if (trims.size <= 1) peers = all.filter((p) => p.vin !== self);
  else if (c.trimKey) peers = (idx.narrow.get(`${k}|${c.trimKey}`) ?? []).filter((p) => p.vin !== self);
  else return undefined;
  if (peers.length < NEW_MIN_POOL) return undefined;
  if (!c.identity) return undefined;
  for (const p of peers) if (p.identity !== c.identity) return undefined;
  if (c.drive) {
    const stated = peers.filter((p) => p.drive);
    if (stated.length >= 2 && stated.filter((p) => p.drive === c.drive).length * 2 < stated.length) return undefined;
  }
  return peers;
}

type Cut = "short" | "typical" | "deep";

/** short = the car's discount falls short of typical (it asks more);
 *  deep = it is discounted further than typical. In points of MSRP. */
function cut(shortfall: number, spread: number, n: number, gapUsd: number): Cut {
  if (shortfall >= NEW_ABOVE_K * spread * (1 + NEW_ABOVE_SE / Math.sqrt(n)) && gapUsd >= NEW_MIN_GAP_USD) return "short";
  if (-shortfall >= NEW_BELOW_K * spread * (1 + NEW_BELOW_SE / Math.sqrt(n)) && -gapUsd >= NEW_MIN_GAP_USD) return "deep";
  return "typical";
}

/** Working figures — tests only; nothing here is published. */
export interface NewCarBandDetail {
  band: SimilarBand | undefined;
  poolN: number;
  /** The version's typical discount from MSRP (median of the peers'). */
  typicalDiscount: number;
  discount: number;
  spread: number;
  raw: Cut;
}

export function newCarBandDetail(idx: NewCarIndex, c: NewCarInput): NewCarBandDetail | undefined {
  const d = newCarDiscount(c);
  if (d === undefined) return undefined;
  const peers = newPool(idx, c);
  if (!peers) return undefined;
  const ds = peers.map((p) => p.discount).sort((a, b) => a - b);
  const typ = median(ds);
  const mad = median(ds.map((x) => Math.abs(x - typ)));
  const spread = ds.length >= NEW_SPREAD_MIN_N ? Math.max(mad, NEW_SPREAD_FLOOR) : Math.max(mad, NEW_SPREAD_DEFAULT);
  const msrp = c.msrpUsd!;
  const raw = cut(typ - d, spread, ds.length, (typ - d) * msrp);
  let band: SimilarBand | undefined;
  if (raw === "deep") band = undefined; // see the header: never "below", and not "typical" either
  else if (raw === "typical") band = "typical";
  else {
    // Drop-one, against the typical discount least favourable to "above":
    // without the peer that gave the most off, the median discount is lowest.
    const lo = median(ds.slice(0, -1));
    band = cut(lo - d, spread, ds.length - 1, (lo - d) * msrp) === "short" ? "above" : "typical";
  }
  return { band, poolN: peers.length, typicalDiscount: typ, discount: d, spread, raw };
}

/** The band and nothing else: what the publisher writes for a new car. */
export function newCarBand(idx: NewCarIndex, c: NewCarInput): SimilarBand | undefined {
  return newCarBandDetail(idx, c)?.band;
}
