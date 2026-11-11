import type { ProSignals } from "@/lib/listings/proSignals";

// What a data key adds to a listing record. Pure, so the mapping is tested
// (tests/data-key.test.ts); lib/api/paid.ts loads the signals and checks the
// key.
//
// These are the two fields the public artifacts stopped carrying on
// 2026-09-05 (lib/listings/proSignals.ts): the owner's ruling was "we want
// people paying for that information". A Pro pass buys them in the browser;
// a data key buys them in the API. Neither is invented here — both are the
// figures comps.ts and the incentive matcher already computed for the grid,
// with every guardrail those carry.

export interface PaidFields {
  /**
   * The asking price minus the mileage-adjusted median asking price of the
   * same variant listed now. Negative means below similar listings. Asking
   * prices on both sides — not sale prices, and not a valuation. Absent
   * when fewer than four comparable cars exist or a guardrail withheld it,
   * which is most cars.
   */
  ask_vs_similar?: { delta_usd: number; peers: number; trim_matched: boolean };
  /**
   * The state or utility incentive program this car leads with under the
   * site's eligibility policy. Absent means it meets none — not "unknown".
   */
  incentive?: { program: string; usd?: number; over_cap_usd?: number; programs: number; state?: string; utility?: boolean };
}

export function paidFields(id: string, signals: ProSignals): PaidFields {
  const s = signals.get(id);
  if (!s) return {};
  const out: PaidFields = {};
  if (s.askVsMarket) {
    out.ask_vs_similar = {
      delta_usd: s.askVsMarket.deltaUsd,
      peers: s.askVsMarket.peerN,
      trim_matched: s.askVsMarket.trimMatched,
    };
  }
  if (s.incentive) {
    out.incentive = { program: s.incentive.name, programs: s.incentive.count };
    if (s.incentive.usd !== undefined) out.incentive.usd = s.incentive.usd;
    if (s.incentive.overCapUsd !== undefined) out.incentive.over_cap_usd = s.incentive.overCapUsd;
    if (s.incentive.state !== undefined) out.incentive.state = s.incentive.state;
    if (s.incentive.utility !== undefined) out.incentive.utility = s.incentive.utility;
  }
  return out;
}

/** The records with their paid fields merged in. New objects; inputs untouched. */
export function withPaidFields<T extends { id: string }>(records: T[], signals: ProSignals): (T & PaidFields)[] {
  return records.map((r) => ({ ...r, ...paidFields(r.id, signals) }));
}
