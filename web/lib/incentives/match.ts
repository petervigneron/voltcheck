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
// The other half of the rule is what counts as settled. A condition is met
// only when the listing (or the enrichment matched to it) carries the fact
// the condition is about. A fact the listing does not carry is not met — it
// is not "probably fine", and it is not softened into a hedge. Matching
// nothing is honest; matching the wrong thing is not.
//
// Two conditions are common enough, and unsettleable enough, that whether to
// treat them as "stated, not checked" is an owner decision rather than a
// coding one. They sit behind POLICY below, default strict, and
// scripts/incentive-counts.mjs reports the car counts under both settings so
// the decision can be made on numbers. Everything else is strict without a
// switch.

export interface MatchPolicy {
  /**
   * New-car MSRP caps compared against the ASKING price. Off by default: the
   * listing carries no MSRP, and an asking price sits below MSRP on a
   * discounted car and above it on a marked-up one, so neither direction of
   * the comparison proves anything about the sticker. Measured 2026-09-02:
   * every live new-car state program (CO, CT, DE, MA, ME, NJ, NM, NY, OR, RI)
   * caps on MSRP, so with this off no new car matches a state program except
   * Illinois, whose cap is on the price paid.
   */
  askingPriceStandsForMsrp: boolean;
  /**
   * Car-side conditions the listing cannot settle — membership of a program's
   * eligible-vehicle list, a "participating dealer" requirement with no list
   * loaded, a used-price cap set on Kelley Blue Book or "market value" rather
   * than the price paid — are surfaced as conditions to check instead of
   * failing the match. Off by default: with it off, a program carrying any
   * such condition simply does not match.
   */
  unsettledCarConditionsAreStated: boolean;
}

export const STRICT_POLICY: MatchPolicy = { askingPriceStandsForMsrp: false, unsettledCarConditionsAreStated: false };

export interface IncentiveMatch {
  program: Program;
  /** The program's own figure for this car's condition and kind, when exactly
   *  one base tier can be settled from the listing. Otherwise absent: two
   *  tiers that the listing cannot choose between print nothing, not a range. */
  amountUsd?: number;
  amountLabel?: string;
  /** Further program figures that depend on who the buyer is (income-qualified
   *  tiers, adders). Stated one by one with their labels; never summed. */
  purchaserSideAmounts: { usd: number; label: string }[];
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

/** BEV or PHEV, from the enrichment row the listing matched — the stored
 *  payload carries no fuel kind (payload->>evKind was null on every live row
 *  read 2026-09-02; crawl.mjs computes it and ingest.mjs's field list drops
 *  it). A row declares a plug-in by `plugIn`, by carrying a total (gas +
 *  electric) range, or by a "PHEV" pack variant; a row with an EPA range and
 *  none of those is a battery-electric. Anything else is unknown, and unknown
 *  is not BEV: New Jersey, Illinois, Massachusetts and Maine pay on BEVs only,
 *  and a Wrangler 4xe matched to no row must not be told it meets them. */
export function vehicleKind(e: EnrichedListing): VehicleKind | undefined {
  const rows = e.row ? [e.row] : (e.enrichment.candidates ?? []);
  if (!rows.length) return undefined;
  const kinds = new Set<VehicleKind | "?">(
    rows.map((r) => {
      if (r.plugIn || r.range?.epaRangeTotalMi || r.packVariant?.toUpperCase() === "PHEV") return "PHEV";
      if (r.range?.epaRangeMi || r.range?.mfrRangeMi) return "BEV";
      return "?";
    })
  );
  if (kinds.size !== 1) return undefined;
  const [k] = [...kinds];
  return k === "?" ? undefined : k;
}

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
      // A usable figure under the boundary says nothing about the nameplate
      // figure the program reads (Oregon's 10 kWh): only a usable figure AT
      // OR ABOVE the boundary, or a total figure on either side, settles it.
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

export function matchIncentives(
  e: EnrichedListing,
  policy: MatchPolicy = STRICT_POLICY,
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
    if (p.jurisdiction.state !== state) continue;
    if (cond === "new" && !p.covers.new) continue;
    if (cond === "used" && !p.covers.used) continue;

    const checked: string[] = [`dealer in ${state}`, cond === "new" ? "new" : "used"];
    const toCheck: string[] = [];

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
        toCheck.push(
          p.transaction.dealerNote ?? "Bought or leased from a dealer enrolled with the program."
        );
        break;
      }
    }
    if (p.transaction.dealerInState && p.transaction.dealer !== "licensed_in_state") {
      checked.push("dealer in state");
    }

    // Price caps.
    if (p.vehicle.purchasePriceCapUsd !== undefined) {
      // A cap on the price paid: the asking price is the dealer's own figure
      // for exactly that, and a car asking more than the cap does not meet it.
      if (!hasRealPrice(l) || l.priceUsd > p.vehicle.purchasePriceCapUsd) continue;
      checked.push(`asking price at or under $${p.vehicle.purchasePriceCapUsd.toLocaleString()}`);
    }
    if (cond === "new" && p.vehicle.newPurchasePriceCapUsd !== undefined) {
      if (!hasRealPrice(l) || l.priceUsd > p.vehicle.newPurchasePriceCapUsd) continue;
      checked.push(`asking price at or under $${p.vehicle.newPurchasePriceCapUsd.toLocaleString()}`);
    }
    if (cond === "used" && p.vehicle.usedPriceCapUsd !== undefined) {
      const basis = p.vehicle.usedPriceCapBasis ?? "";
      const onPricePaid = /purchase price|price paid|final purchase/i.test(basis) && !/kelley|kbb|market value/i.test(basis);
      if (onPricePaid) {
        if (!hasRealPrice(l) || l.priceUsd > p.vehicle.usedPriceCapUsd) continue;
        checked.push(`asking price at or under $${p.vehicle.usedPriceCapUsd.toLocaleString()}`);
      } else {
        // Delaware reads Kelley Blue Book, New Mexico "market value": neither
        // is the asking price, in either direction.
        if (!policy.unsettledCarConditionsAreStated) continue;
        toCheck.push(`${basis || "Program price basis"} at or under $${p.vehicle.usedPriceCapUsd.toLocaleString()}.`);
      }
    }
    if (cond === "new" && p.vehicle.newMsrpCapUsd !== undefined) {
      if (policy.askingPriceStandsForMsrp) {
        if (!hasRealPrice(l) || l.priceUsd > p.vehicle.newMsrpCapUsd) continue;
        checked.push(`asking price at or under $${p.vehicle.newMsrpCapUsd.toLocaleString()} (MSRP cap)`);
        toCheck.push(`MSRP at or under $${p.vehicle.newMsrpCapUsd.toLocaleString()} on the window sticker.`);
      } else if (policy.unsettledCarConditionsAreStated) {
        toCheck.push(`MSRP at or under $${p.vehicle.newMsrpCapUsd.toLocaleString()} on the window sticker.`);
      } else {
        continue;
      }
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
        toCheck.push(`Price paid at least $${p.vehicle.usedPriceMinUsd.toLocaleString()}.`);
        if (!policy.unsettledCarConditionsAreStated) continue;
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
      toCheckOnTheCar: toCheck,
      purchaserConditions: p.purchaserConditions,
      checked,
    });
  }
  return out;
}
