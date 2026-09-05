import raw from "@/data/incentive-programs.json";

// The hand-curated incentive registry, typed. web/data/incentive-programs.json
// is the source of truth and is never generated from a scrape; this file only
// gives it a shape and refuses to load one that has drifted from it.
//
// Every figure in the registry is the PROGRAM'S OWN figure, read from the page
// named in `sources` on the date named there. Nothing here is computed. The
// research record with the dated captures is docs/incentives/ (local,
// gitignored).
//
// Two kinds of condition live on a program and they are kept apart on purpose:
//   - `vehicle` and `transaction` are CAR-SIDE and TRANSACTION-SIDE conditions
//     the matcher (lib/incentives/match.ts) may evaluate against a listing,
//     each only where the listing actually carries the fact.
//   - `purchaserConditions` are conditions on the BUYER (residency, income,
//     utility account, one per household…). They are prose to STATE, never
//     something the site evaluates; the site knows nothing about the shopper.

export type VehicleKind = "BEV" | "PHEV";
/** Whether a program is paying today. Only "live" is ever named on a car
 *  (lib/incentives/match.ts): the house rule is that a fund a shopper cannot
 *  actually draw on is a false bargain, not a smaller one.
 *
 *  "depleted" is the case the other three could not say honestly, added
 *  2026-09-05 for PNM. The utility still advertises the rebate on its own
 *  pages — so it is not "paused" or "ended" — but its last accounting to the
 *  regulator shows the money essentially spent. It is not "waitlist" either:
 *  no waiting list is published, which is precisely what makes it worse for a
 *  shopper than Maryland's. */
export type ProgramStatus = "live" | "waitlist" | "paused" | "ended" | "depleted";
export type ProgramKind = "rebate" | "tax_credit" | "tax_exemption" | "grant";
export type DealerRule =
  /** Any seller. */
  | "any"
  /** Any licensed dealer, in any state (private sales excluded). */
  | "licensed_any_state"
  /** A dealer licensed in the program's own state. */
  | "licensed_in_state"
  /** A dealer enrolled with the program. Verifiable only against a list the
   *  registry holds for that program; none is loaded yet. */
  | "participating";

export interface ProgramSource {
  url: string;
  capturedAt: string;
  what: string;
}

export interface ProgramAmount {
  usd: number;
  applies: {
    condition: "new" | "used" | "any";
    kind?: VehicleKind;
    /** The tier applies only below this MSRP (a car-side fact the listing does not carry). */
    msrpUnderUsd?: number;
    /** The tier applies only ABOVE this MSRP (New York's flat $500 over $42,000). */
    msrpOverUsd?: number;
    batteryKwhMin?: number;
    batteryKwhMaxExclusive?: number;
    epaElectricRangeMinMi?: number;
    epaElectricRangeMaxMi?: number;
  };
  label?: string;
  /**
   * A figure can expire on its own while the program carries on. Efficiency
   * Maine's rebates carry "an additional $1,000 bonus that expires September
   * 30, 2026" folded into the printed amounts, so from 2026-10-01 those
   * numbers are $1,000 too high while the rebate itself continues. Same
   * lesson as liveUntil one level down: a dated claim guarded only by prose
   * in a label is a claim that goes wrong on a known day.
   */
  from?: string;
  until?: string;
  /** Paid only to an income-qualified purchaser: purchaser-side, so stated, never asserted. */
  incomeQualified?: boolean;
  /** Stacks on top of a base tier rather than replacing it. */
  adder?: boolean;
  /** "Up to": the program caps the figure by a formula the listing cannot settle. */
  upTo?: boolean;
}

export interface Program {
  id: string;
  name: string;
  jurisdiction: { kind: "state" | "regional" | "utility"; state: string; regionNote?: string; utility?: string };
  administrator: string;
  kind: ProgramKind;
  status: ProgramStatus;
  statusAsOf: string;
  statusNote?: string;
  /**
   * A dated window the program only pays inside, when it publishes one.
   * `status` is a human's reading on `statusAsOf`; this is the part a clock
   * can check, and the matcher enforces it (lib/incentives/match.ts).
   *
   * Added 2026-09-05, from the PNM audit. Oregon's rebate runs a hard open
   * period — 2026-08-25 to 2026-11-04 — and the registry recorded it in a
   * statusNote, which is prose no code reads. On 2026-11-05 the program would
   * have gone on being named on ~1,974 cars until a person happened to
   * re-check it, which is the same shape as the PNM failure: a claim that
   * expires on a known date, guarded only by someone remembering. If only a
   * human eye can catch it, it is not caught.
   */
  liveFrom?: string;
  liveUntil?: string;
  sources: ProgramSource[];
  covers: { new: boolean; used: boolean; lease: boolean };
  usedNote?: string;
  leaseMinMonths?: number;
  vehicle: {
    kinds: VehicleKind[];
    newMsrpCapUsd?: number;
    newMsrpTierUsd?: number;
    newMsrpCapBasis?: string;
    /** A cap on the price actually paid (new and used alike). Comparable to an asking price. */
    purchasePriceCapUsd?: number;
    purchasePriceCapBasis?: string;
    /** A cap on the price paid for a NEW car specifically (Rhode Island's
     *  $75,000 "purchase price excluding taxes"), where the used cap differs. */
    newPurchasePriceCapUsd?: number;
    /** A cap on the used car's price. Comparable to an asking price only when the basis is the
     *  price paid; a KBB or "market value" basis is not the asking price. */
    usedPriceCapUsd?: number;
    usedPriceCapBasis?: string;
    usedMaxModelYearsOld?: number;
    usedMinModelYearsOld?: number;
    /** An absolute model-year floor ("2010 model year or newer"), as some
     *  utilities write it instead of an age. */
    minModelYear?: number;
    usedOdometerMaxMi?: number;
    /** A price FLOOR on used cars (Mississippi Power's "at least $10,000",
     *  Clark PU's $5,000 to $20,000 band). Comparable to an asking price. */
    usedPriceMinUsd?: number;
    batteryKwhMin?: number;
    /** Plug-in hybrids must have at least this EPA electric range (Concord's
     *  25 miles); battery-electrics are unaffected. */
    phevEpaElectricRangeMinMi?: number;
    gvwrMaxLb?: number;
    mustBeOnList?: boolean;
    mustBeNew?: string;
  };
  transaction: {
    dealer: DealerRule;
    dealerInState?: boolean;
    dealerNote?: string;
    pointOfSale: boolean;
    postPurchase: boolean;
    pointOfSaleNote?: string;
    applyWithinDays?: number;
  };
  purchaserConditions: string[];
  amounts: ProgramAmount[];
}

interface RegistryFile {
  capturedAt: string;
  programs: Program[];
}

const STATE_RE = /^[A-Z]{2}$/;

/** Validate the registry at load. Loud on purpose: a malformed entry would
 *  otherwise fail as "no program matched", which reads as a coverage gap. */
function validate(file: RegistryFile): Program[] {
  const ids = new Set<string>();
  for (const p of file.programs) {
    if (!p.id || ids.has(p.id)) throw new Error(`incentive registry: duplicate or missing id ${JSON.stringify(p.id)}`);
    ids.add(p.id);
    if (!STATE_RE.test(p.jurisdiction.state)) throw new Error(`incentive registry: ${p.id} has no two-letter state`);
    if (p.jurisdiction.kind === "utility" && !p.jurisdiction.utility) throw new Error(`incentive registry: ${p.id} is a utility program with no utility named`);
    if (!["live", "waitlist", "paused", "ended", "depleted"].includes(p.status)) throw new Error(`incentive registry: ${p.id} bad status`);
    for (const k of ["liveFrom", "liveUntil"] as const) {
      const v = p[k];
      if (v !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error(`incentive registry: ${p.id} has a bad ${k}`);
    }
    if (p.liveFrom && p.liveUntil && p.liveFrom > p.liveUntil) throw new Error(`incentive registry: ${p.id} window ends before it starts`);
    if (!p.sources.length) throw new Error(`incentive registry: ${p.id} has no source`);
    for (const s of p.sources) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s.capturedAt)) throw new Error(`incentive registry: ${p.id} source without a dated capture`);
    }
    if (!p.vehicle.kinds.length) throw new Error(`incentive registry: ${p.id} names no vehicle kind`);
    for (const a of p.amounts) {
      if (!(a.usd > 0)) throw new Error(`incentive registry: ${p.id} amount without a positive figure`);
      for (const k of ["from", "until"] as const) {
        const v = a[k];
        if (v !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error(`incentive registry: ${p.id} amount has a bad ${k}`);
      }
    }
    // A live program with a payable figure must say where the figure came from
    // by the same date; an ended one keeps an empty amounts list so nothing
    // can render a figure for it.
    if (p.status === "ended" && p.amounts.length) throw new Error(`incentive registry: ${p.id} is ended but carries amounts`);
  }
  return file.programs;
}

export const INCENTIVE_PROGRAMS: Program[] = validate(raw as unknown as RegistryFile);
export const INCENTIVE_REGISTRY_CAPTURED_AT: string = (raw as unknown as RegistryFile).capturedAt;

export function programById(id: string): Program | undefined {
  return INCENTIVE_PROGRAMS.find((p) => p.id === id);
}
