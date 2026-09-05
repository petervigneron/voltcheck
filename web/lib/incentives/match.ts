import type { EnrichedListing } from "@/lib/listings/enrich";
import type { Listing } from "@/lib/listings/types";
import { bodyTypeOf } from "@/lib/listings/bodyType";
import { hasRealPrice } from "@/lib/listings/price";
import { INCENTIVE_PROGRAMS, type Program, type ProgramAmount, type VehicleKind } from "./registry";

// Which incentive programs THIS car meets the car-side conditions of.
//
// The claim this module is allowed to produce is narrow, and the narrowness
// is the product: "this car meets the conditions of <program> that a listing
// can settle; here are the ones only the buyer can settle." It never says a
// shopper qualifies, never says what they will get, and never evaluates a
// purchaser-side condition (residency, income, utility account) — those are
// prose from the registry, passed through to be stated.
//
// What counts as settled is decided per condition, and a condition the
// listing cannot settle is either FAILED or STATED, never assumed. The owner
// chose (2026-09-02) which of those two the site does for the conditions no
// listing can carry, and that choice is SITE_POLICY below; STRICT_POLICY is
// kept for the count script so the difference stays measurable.

export interface MatchPolicy {
  /**
   * New-car MSRP caps compared against the ASKING price. The listing carries
   * no MSRP, and an asking price sits below MSRP on a discounted car and
   * above it on a marked-up one, so the comparison settles nothing either
   * way — which is exactly why, when this is on, the cap is always STATED
   * beside the figure ("MSRP at or under $55,000 on the window sticker") and
   * never reported as met. Measured 2026-09-02: every live new-car state
   * program except Illinois and Rhode Island caps on MSRP, so with this off
   * no new car in those states is ever named.
   */
  askingPriceStandsForMsrp: boolean;
  /**
   * Car-side conditions the listing cannot settle — membership of a
   * program's eligible-vehicle list, a "participating dealer" requirement
   * with no list loaded, a used-price cap set on Kelley Blue Book or "market
   * value" rather than the price paid — are surfaced as conditions to check
   * instead of failing the match.
   */
  unsettledCarConditionsAreStated: boolean;
  /**
   * How far OVER a price cap an asking price may sit and still have the
   * program named, as a fraction of the cap. Owner's call (2026-09-02): a
   * car listed at $52,000 against a $50,000 cap is exactly the information a
   * shopper needs — the cap is printed beside the price and the shopper
   * negotiates — while a $52,000 car against a $25,000 cap is not. At 0.10,
   * the first is named and the second is not. A match over the cap carries
   * `cap.askOverByUsd` so every surface prints the cap, never "meets".
   */
  capMarginPct: number;
}

export const STRICT_POLICY: MatchPolicy = {
  askingPriceStandsForMsrp: false,
  unsettledCarConditionsAreStated: false,
  capMarginPct: 0,
};

/** What the site runs. */
export const SITE_POLICY: MatchPolicy = {
  askingPriceStandsForMsrp: true,
  unsettledCarConditionsAreStated: true,
  capMarginPct: 0.1,
};

export interface IncentiveMatch {
  program: Program;
  /** The program's own figure for this car's condition and kind, when exactly
   *  one base tier can be settled from the listing. Otherwise absent: two
   *  tiers that the listing cannot choose between print nothing, not a range. */
  amountUsd?: number;
  amountLabel?: string;
  /** Further program figures that depend on who the buyer is (income-qualified
   *  tiers, adders, "up to" ceilings). Stated one by one with their labels;
   *  never summed. */
  purchaserSideAmounts: { usd: number; label: string }[];
  /** The price cap this car was measured against, when the program has one.
   *  `askOverByUsd` is set when the asking price sits above it within the
   *  policy margin — the program is named for the shopper's information and
   *  the cap must print beside the price. */
  cap?: { usd: number; basis: string; askOverByUsd?: number };
  /** Car-side conditions the listing could not settle, only ever non-empty
   *  under `unsettledCarConditionsAreStated`. */
  toCheckOnTheCar: string[];
  /** Purchaser-side conditions, verbatim from the registry. */
  purchaserConditions: string[];
  /** What was checked and held, for the row's hover. */
  checked: string[];
}

// ---- state --------------------------------------------------------------

// The 2026-09-02 packed feed carried 60 rows with state "Arizona", 6
// "Pennsylvania", 5 "Virginia", 3 "Georgia" beside the 2-letter codes, plus
// 565 "PR", 5 "GU", 3 "MP". A spelled-out name is the same fact and maps
// exactly; a territory is not a state and matches no program.
const STATE_NAMES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO", connecticut: "CT",
  delaware: "DE", florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA",
  kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI",
  minnesota: "MN", mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH",
  "new jersey": "NJ", "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND", ohio: "OH",
  oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC", "south dakota": "SD",
  tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT", virginia: "VA", washington: "WA", "west virginia": "WV",
  wisconsin: "WI", wyoming: "WY", "district of columbia": "DC",
};
const STATE_CODES = new Set([...Object.values(STATE_NAMES)]);

/** The dealer's state as a two-letter code, or undefined when the listing
 *  does not say. 19,662 of 149,863 feed rows had no state on 2026-09-02;
 *  they match nothing, which is the honest answer for a car whose seller we
 *  cannot place. */
export function dealerState(l: Pick<Listing, "state">): string | undefined {
  const s = l.state?.trim();
  if (!s) return undefined;
  const up = s.toUpperCase();
  if (STATE_CODES.has(up)) return up;
  return STATE_NAMES[s.toLowerCase()];
}

// ---- vehicle kind -------------------------------------------------------

/** Battery-electric or plug-in hybrid, settled from the enrichment row
 *  alone. Lives in lib/listings/kind.ts since 2026-09-03 so the card tiles
 *  read the same answer; re-exported here for the callers and tests that
 *  learned it at this address. */
import { vehicleKind } from "@/lib/listings/kind";
export { vehicleKind };

// ---- GVWR -----------------------------------------------------------------

// No surface on this site holds a GVWR: enrichment rows have none, and the
// scraper's vPIC cache keeps only Series/Trim/DriveType/BatteryKWh/
// ElectrificationLevel/FuelType/Make. A program with a numeric GVWR cap
// (Colorado's 8,500 lb) therefore matches only where the cap is settled by
// what the vehicle IS: a sedan, hatchback or crossover is a Class 1-2a
// vehicle by construction, and the exceptions below are the ones heavy enough
// to cross 8,500 lb that are sold under an SUV badge. Trucks and vans are
// never settled this way: the Silverado EV and Sierra EV are 9,900 lb GVWR,
// the R1T 8,532, the Hummer EV 10,550 — a "truck" body is exactly the class
// where the cap bites, so it is unmet until a GVWR is held.
const HEAVY_OR_UNSETTLED_SUVS = [
  /hummer/i, // GMC Hummer EV SUV, 10,550 lb GVWR (Edition 1 figure)
  /\br1s\b/i, // Rivian R1S, 8,532 lb GVWR — Class 2b by 32 lb
  /escalade/i, // Escalade IQ / IQL: published figures disagree (7,700 vs a 9,000 lb curb weight); unsettled
];

function gvwrUnderLb(l: Listing, capLb: number): boolean | undefined {
  if (capLb < 8500) return undefined; // no body-class argument settles a lower cap
  const body = bodyTypeOf(l);
  if (body === "truck" || body === "van" || body === undefined) return undefined;
  if (HEAVY_OR_UNSETTLED_SUVS.some((re) => re.test(`${l.make} ${l.model}`))) return undefined;
  return true;
}

// ---- the match ------------------------------------------------------------

type Cond = "new" | "used";

function listingCondition(l: Listing): Cond | undefined {
  // Certified is a used car with a dealer warranty; no program read on
  // 2026-09-02 distinguishes it from used, and New Mexico's used credit
  // requires exactly that certification. An absent condition matches nothing:
  // the payload used to publish "used" for anything not new, and that
  // else-branch is how a Spanish "Nuevo" shipped as used (scraper/lib/
  // condition.mjs); 1,555 feed rows carried no condition on 2026-09-02.
  if (l.condition === "new") return "new";
  if (l.condition === "used" || l.condition === "certified") return "used";
  return undefined;
}

function amountFits(a: ProgramAmount, cond: Cond, kind: VehicleKind | undefined): boolean {
  if (a.applies.condition !== "any" && a.applies.condition !== cond) return false;
  if (a.applies.kind && a.applies.kind !== kind) return false;
  return true;
}

/** Settle the base figure for this car, or nothing. A figure gated on a fact
 *  the listing does not carry (an MSRP tier, an EPA electric range the row
 *  does not hold, a battery size on the wrong side of a tier boundary) is
 *  left out rather than guessed. */
function settleAmount(
  program: Program,
  cond: Cond,
  kind: VehicleKind | undefined,
  e: EnrichedListing,
  policy: MatchPolicy
): { usd: number; label?: string } | undefined {
  const l = e.listing;
  // "Up to" figures are a ceiling on a formula the listing cannot run, so
  // they are never the settled figure; they are stated with their label.
  const base = program.amounts.filter((a) => !a.incomeQualified && !a.adder && !a.upTo && amountFits(a, cond, kind));
  const settled: ProgramAmount[] = [];
  for (const a of base) {
    const ap = a.applies;
    if (ap.msrpUnderUsd !== undefined) {
      // An MSRP tier is only ever settled under the asking-price policy, and
      // even then only downward: an ask under the tier can still be a
      // discounted sticker over it, so this is the one place the policy is
      // allowed to say "stands for".
      if (!policy.askingPriceStandsForMsrp || !hasRealPrice(l) || l.priceUsd >= ap.msrpUnderUsd) continue;
    }
    if (ap.msrpOverUsd !== undefined) {
      // The mirror tier (New York's flat $500 above $42,000). Without this
      // gate the tier settled for EVERY car, and a $21,500 Bolt was handed
      // $500 where the program pays $2,000 (caught by tests/incentives.test.ts
      // on 2026-09-02, before anything rendered).
      if (!policy.askingPriceStandsForMsrp || !hasRealPrice(l) || l.priceUsd <= ap.msrpOverUsd) continue;
    }
    if (ap.batteryKwhMin !== undefined || ap.batteryKwhMaxExclusive !== undefined) {
      const kwh = e.packKwh?.value;
      if (kwh === undefined) continue;
      // Below the boundary: a total figure says the tier does not apply, a
      // usable figure says nothing about the nameplate. Unsettled either way.
      if (ap.batteryKwhMin !== undefined && kwh < ap.batteryKwhMin) continue;
      if (ap.batteryKwhMaxExclusive !== undefined && !(kwh < ap.batteryKwhMaxExclusive && e.packKwh?.basis === "total")) continue;
    }
    if (ap.epaElectricRangeMinMi !== undefined || ap.epaElectricRangeMaxMi !== undefined) {
      const r = e.row?.range?.epaRangeMi?.value;
      if (r === undefined || e.rangeIsMfrEstimate) continue;
      if (ap.epaElectricRangeMinMi !== undefined && r < ap.epaElectricRangeMinMi) continue;
      if (ap.epaElectricRangeMaxMi !== undefined && r > ap.epaElectricRangeMaxMi) continue;
    }
    settled.push(a);
  }
  // Two base tiers the listing could not separate (New York's over/under
  // $42,000 without an MSRP; Oregon's 10 kWh boundary on a usable figure) mean
  // no figure — a range is a guess wearing two numbers.
  if (settled.length !== 1) return undefined;
  return { usd: settled[0].usd, label: settled[0].label };
}

/** An asking price against a cap on the price paid: under the cap it is
 *  met; over it by less than the policy margin it is named with the gap
 *  recorded; further over, or with no real price, it fails. */
function priceAgainstCap(
  l: Listing,
  capUsd: number,
  policy: MatchPolicy
): { ok: false } | { ok: true; overByUsd?: number } {
  if (!hasRealPrice(l)) return { ok: false };
  if (l.priceUsd <= capUsd) return { ok: true };
  if (l.priceUsd <= capUsd * (1 + policy.capMarginPct)) return { ok: true, overByUsd: l.priceUsd - capUsd };
  return { ok: false };
}

const usd = (n: number) => `$${n.toLocaleString("en-US")}`;

export function matchIncentives(
  e: EnrichedListing,
  policy: MatchPolicy = SITE_POLICY,
  programs: Program[] = INCENTIVE_PROGRAMS,
  today: Date = new Date()
): IncentiveMatch[] {
  const l = e.listing;
  const state = dealerState(l);
  if (!state) return [];
  const cond = listingCondition(l);
  if (!cond) return [];
  // Private sellers: every live program read on 2026-09-02 requires a dealer
  // (licensed, in-state or participating), so a private listing meets none.
  if (l.sellerType !== "dealer") return [];
  const kind = vehicleKind(e);
  const year = today.getUTCFullYear();
  const out: IncentiveMatch[] = [];

  for (const p of programs) {
    // Only a program that is paying today is named. A depleted fund with a
    // waiting list (Maryland, FY2026) is not "money on this car", and naming
    // it beside a figure is the false bargain the house rule is asymmetric
    // about.
    if (p.status !== "live") continue;
    // …and paying TODAY. A program that publishes a dated open period is only
    // named inside it (registry.ts liveFrom/liveUntil): Oregon's runs
    // 2026-08-25 to 2026-11-04, and before this the window lived in a
    // statusNote that nothing read, so the claim would have outlived the
    // program by however long it took someone to notice.
    const day = today.toISOString().slice(0, 10);
    if (p.liveFrom && day < p.liveFrom) continue;
    if (p.liveUntil && day > p.liveUntil) continue;
    if (p.jurisdiction.state !== state) continue;
    if (cond === "new" && !p.covers.new) continue;
    if (cond === "used" && !p.covers.used) continue;

    const checked: string[] = [`dealer in ${state}`, cond === "new" ? "new" : "used"];
    const toCheck: string[] = [];
    let cap: IncentiveMatch["cap"];

    // Kind: a program limited to one kind needs the car's kind settled.
    if (p.vehicle.kinds.length === 1) {
      if (kind !== p.vehicle.kinds[0]) continue;
      checked.push(kind);
    } else if (kind) {
      checked.push(kind);
    }

    // Dealer rule.
    switch (p.transaction.dealer) {
      case "any":
      case "licensed_any_state":
        break;
      case "licensed_in_state":
        // The dealer's state is the program's state (checked above) and the
        // seller is a dealer; a rooftop selling in a state is licensed there.
        checked.push("licensed dealer in state");
        break;
      case "participating": {
        if (!policy.unsettledCarConditionsAreStated) continue;
        toCheck.push(p.transaction.dealerNote ?? "Bought or leased from a dealer enrolled with the program.");
        break;
      }
    }
    if (p.transaction.dealerInState && p.transaction.dealer !== "licensed_in_state") {
      checked.push("dealer in state");
    }

    // Price caps. Three shapes, in decreasing order of what an asking price
    // can say about them.
    const pricePaidCap =
      p.vehicle.purchasePriceCapUsd ??
      (cond === "new" ? p.vehicle.newPurchasePriceCapUsd : undefined);
    if (pricePaidCap !== undefined) {
      // A cap on the price paid: the asking price is the dealer's own figure
      // for exactly that.
      const r = priceAgainstCap(l, pricePaidCap, policy);
      if (!r.ok) continue;
      cap = { usd: pricePaidCap, basis: p.vehicle.purchasePriceCapBasis ?? "Price paid.", askOverByUsd: r.overByUsd };
      checked.push(r.overByUsd ? `asking price ${usd(r.overByUsd)} over the ${usd(pricePaidCap)} cap` : `asking price at or under ${usd(pricePaidCap)}`);
    }
    if (cond === "used" && p.vehicle.usedPriceCapUsd !== undefined) {
      const basis = p.vehicle.usedPriceCapBasis ?? "";
      const onPricePaid = /purchase price|price paid|final purchase|sale price/i.test(basis) && !/kelley|kbb|market value/i.test(basis);
      if (onPricePaid) {
        const r = priceAgainstCap(l, p.vehicle.usedPriceCapUsd, policy);
        if (!r.ok) continue;
        cap = { usd: p.vehicle.usedPriceCapUsd, basis, askOverByUsd: r.overByUsd };
        checked.push(r.overByUsd ? `asking price ${usd(r.overByUsd)} over the ${usd(p.vehicle.usedPriceCapUsd)} cap` : `asking price at or under ${usd(p.vehicle.usedPriceCapUsd)}`);
      } else {
        // Delaware reads Kelley Blue Book, New Mexico "market value": neither
        // is the asking price, in either direction. Named only under the
        // stated policy, and even then only when the ask is within the
        // margin — a $60,000 car is not "market value $25,000 or less".
        if (!policy.unsettledCarConditionsAreStated) continue;
        const r = priceAgainstCap(l, p.vehicle.usedPriceCapUsd, policy);
        if (!r.ok) continue;
        cap = { usd: p.vehicle.usedPriceCapUsd, basis: basis || "Program price basis", askOverByUsd: r.overByUsd };
        toCheck.push(`${basis || "Program price basis"} at or under ${usd(p.vehicle.usedPriceCapUsd)}.`);
      }
    }
    if (cond === "new" && p.vehicle.newMsrpCapUsd !== undefined) {
      if (!policy.askingPriceStandsForMsrp) continue;
      // No margin on an MSRP cap (owner, 2026-09-03): a car asking above the
      // MSRP cap is not labelled eligible. The margin is for price-paid caps,
      // where the shopper can negotiate under the number; a sticker cannot be
      // negotiated. Under the cap the sticker is still unsettled and is stated.
      if (!hasRealPrice(l) || l.priceUsd > p.vehicle.newMsrpCapUsd) continue;
      cap = { usd: p.vehicle.newMsrpCapUsd, basis: p.vehicle.newMsrpCapBasis ?? "MSRP." };
      checked.push(`asking price at or under the ${usd(p.vehicle.newMsrpCapUsd)} MSRP cap`);
      toCheck.push(`MSRP at or under ${usd(p.vehicle.newMsrpCapUsd)} on the window sticker.`);
    }

    // Used-car age and odometer rules, against the current calendar year the
    // way every program reads them ("in 2026 the oldest eligible model year
    // is 2018" — Delaware's own example, which is year - 8).
    if (cond === "used") {
      if (p.vehicle.usedMaxModelYearsOld !== undefined) {
        if (l.year < year - p.vehicle.usedMaxModelYearsOld) continue;
        checked.push(`model year ${l.year}`);
      }
      if (p.vehicle.usedMinModelYearsOld !== undefined) {
        if (l.year > year - p.vehicle.usedMinModelYearsOld) continue;
        checked.push(`model year ${l.year}`);
      }
      if (p.vehicle.usedOdometerMaxMi !== undefined) {
        if (l.mileage === undefined || l.mileage > p.vehicle.usedOdometerMaxMi) continue;
        checked.push(`${l.mileage.toLocaleString()} mi`);
      }
      if (p.vehicle.usedPriceMinUsd !== undefined) {
        // A price floor (Mississippi Power's "at least $10,000"): the asking
        // price is the upper bound on what will be paid, so an ask UNDER the
        // floor settles it as unmet, and an ask over it does not settle it as
        // met — the shopper may pay less. Stated, not checked, in that case.
        if (!hasRealPrice(l) || l.priceUsd < p.vehicle.usedPriceMinUsd) continue;
        if (!policy.unsettledCarConditionsAreStated) continue;
        toCheck.push(`Price paid at least ${usd(p.vehicle.usedPriceMinUsd)}.`);
      }
    }
    if (p.vehicle.minModelYear !== undefined) {
      if (l.year < p.vehicle.minModelYear) continue;
      checked.push(`model year ${l.year}`);
    }
    // A plug-in's electric range must clear the program's floor; settled only
    // from an EPA figure on the matched row, never from a maker estimate.
    if (p.vehicle.phevEpaElectricRangeMinMi !== undefined) {
      // An unknown kind might be a plug-in under the floor: unmet.
      if (kind === undefined) continue;
      if (kind === "PHEV") {
        const r = e.row?.range?.epaRangeMi?.value;
        if (r === undefined || e.rangeIsMfrEstimate || r < p.vehicle.phevEpaElectricRangeMinMi) continue;
        checked.push(`${r} mi electric range`);
      }
    }

    // Battery minimum: satisfied by a usable OR a total figure at or above
    // it, since usable never exceeds total. Absent → unmet.
    if (p.vehicle.batteryKwhMin !== undefined) {
      const kwh = e.packKwh?.value;
      if (kwh === undefined || kwh < p.vehicle.batteryKwhMin) continue;
      checked.push(`${Math.round(kwh)} kWh`);
    }

    // GVWR.
    if (p.vehicle.gvwrMaxLb !== undefined) {
      if (gvwrUnderLb(l, p.vehicle.gvwrMaxLb) !== true) continue;
      checked.push(`under ${p.vehicle.gvwrMaxLb.toLocaleString()} lb GVWR`);
    }

    // Eligible-vehicle lists: none is loaded, so membership is unsettled.
    if (p.vehicle.mustBeOnList) {
      if (!policy.unsettledCarConditionsAreStated) continue;
      toCheck.push("On the program's eligible-vehicle list.");
    }

    const amount = settleAmount(p, cond, kind, e, policy);
    const purchaserSideAmounts = p.amounts
      .filter((a) => (a.incomeQualified || a.adder || a.upTo) && amountFits(a, cond, kind))
      .map((a) => ({ usd: a.usd, label: a.label ?? (a.adder ? "adder" : a.upTo ? "up to" : "income-qualified") }));

    out.push({
      program: p,
      amountUsd: amount?.usd,
      amountLabel: amount?.label,
      purchaserSideAmounts,
      cap,
      toCheckOnTheCar: toCheck,
      purchaserConditions: p.purchaserConditions,
      checked,
    });
  }
  return out;
}

// ---- the card's one-line summary --------------------------------------

/** What the browse card carries: the one program worth leading with, its
 *  figure when one is settled, and how many programs the car meets in all.
 *  State and regional programs outrank utility ones (a utility program is
 *  for that utility's customers only); within a rank the largest settled
 *  figure leads, and a program with a settled figure outranks one without.
 *  `overCapUsd` is set when the leading program's cap sits under the asking
 *  price, so the card can print the cap rather than the figure. */
export interface CardIncentive {
  programId: string;
  name: string;
  usd?: number;
  overCapUsd?: number;
  count: number;
  /** The leading program is a utility's, for its own customers only — the
   *  card's tag says "utility" rather than "resident" (lib/incentives/copy.ts). */
  utility: boolean;
  /** The program's two-letter state, so the tag never has to normalise a
   *  spelled-out dealer state on the client. */
  state: string;
}

export function cardIncentive(matches: IncentiveMatch[]): CardIncentive | undefined {
  if (!matches.length) return undefined;
  const rank = (m: IncentiveMatch) =>
    (m.program.jurisdiction.kind === "utility" ? 0 : 1_000_000) +
    (m.cap?.askOverByUsd ? 0 : 100_000) +
    (m.amountUsd ?? Math.max(0, ...m.purchaserSideAmounts.map((a) => a.usd)) / 2);
  const lead = [...matches].sort((a, b) => rank(b) - rank(a))[0];
  return {
    programId: lead.program.id,
    name: lead.program.name,
    usd: lead.amountUsd,
    overCapUsd: lead.cap?.askOverByUsd ? lead.cap.usd : undefined,
    count: matches.length,
    utility: lead.program.jurisdiction.kind === "utility",
    state: lead.program.jurisdiction.state,
  };
}
