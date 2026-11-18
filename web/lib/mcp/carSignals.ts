import type { EnrichmentRow } from "@/lib/types";
import type { Listing } from "@/lib/listings/types";
import type { ProSignals } from "@/lib/listings/proSignals";
import { batteryWarranty as carWarranty, warrantyUnknowableForTitle } from "@/lib/listings/warranty";
import { paidSignalSet } from "@/lib/api/paid";
import { bounded } from "./insights";

// Two per-car answers the connector adds to a listing record, each the
// answer the site already gives somewhere else, and each absent wherever
// that answer is.

// ------------------------------------------------------------ battery warranty

/** This car's high-voltage battery warranty, as its listing page prints it. */
export interface CarBatteryWarranty {
  /** The label the listing page's "HV battery coverage" row prints, exactly. */
  status: string;
  in_force: boolean;
  /** True where the page marks the row "est.": the term that settled it is
   *  not the manufacturer's own figure. */
  estimated: boolean;
}

/**
 * The listing page's battery-warranty row for one car, from the same inputs:
 * the listing as findListing returns it (its batteryCoverage, when GM's own
 * record for the VIN exists) and the exact-matched enrichment row
 * enrichListing gives it. Undefined wherever the page prints no verdict:
 *
 *   - no enrichment row: the page's spec block, and its warranty group with
 *     it, does not render at all (app/listing/[id]/page.tsx `e.row &&`);
 *   - a branded title of unstated kind: the page prints no warranty block
 *     (warrantyUnknowableForTitle);
 *   - the function's own "unknown": between the bounds, or a Bolt under the
 *     pack-replacement recall with no record of its own.
 *
 * `estimated` follows the page's provenance exactly: the row takes its source
 * from batteryYears, else batteryMiles, else "mfr" (components/
 * EnrichmentReport.tsx), and "est." prints for an `est` or `agg` source
 * (components/SourceBadge.tsx).
 */
export function carBatteryWarranty(
  row: EnrichmentRow | undefined,
  listing: Pick<Listing, "year" | "mileage" | "make" | "model" | "batteryCoverage" | "brandedTitleDisclosed" | "buybackDisclosed">,
  now: Date = new Date(),
): CarBatteryWarranty | undefined {
  if (!row) return undefined;
  if (warrantyUnknowableForTitle(listing)) return undefined;
  const w = carWarranty(row, listing, now);
  if (w.state === "unknown") return undefined;
  const source = (row.warranty?.batteryYears ?? row.warranty?.batteryMiles)?.source ?? "mfr";
  return { status: w.label, in_force: w.state === "active", estimated: source === "est" || source === "agg" };
}

// ------------------------------------------------------------ asking vs similar

/**
 * A coarse, free answer to "is this a fair asking price", from the Pro
 * figure and nothing else (owner, 2026-11-18: assistants get the coarse
 * answer free; the exact figures stay Pro).
 *
 * The figure is askVsMarket (lib/listings/comps.ts): this car's asking price
 * minus the mileage-adjusted median asking price of the same variant listed
 * now, in dollars, with every guardrail comps.ts and the publisher apply — at
 * least four comparable cars, no pool that mixes trims or pack identities, no
 * buyback or branded title, a difference of at least $2,000, and nothing more
 * than 30% under. Where any of those withheld it there is no signal, and the
 * bucket is absent too: the bucket never reaches past the figure it is cut
 * from.
 *
 * Cut as a fraction of the similar cars' median (ask − delta), because a
 * $3,000 gap is noise on a $70,000 truck and a lot on a $15,000 Leaf.
 *
 * The thresholds, measured 2026-11-18 on the live feed (170,293 cars, the
 * figure rebuilt from the public shards without the pack-identity guard, so
 * a slight superset: 18,281 cars carry one):
 *
 *   - Within a variant's own listings, a car's mileage-adjusted ask sits a
 *     median 4.4% from its cohort's median; 62% of cars sit within 5.9%,
 *     75% within 8.2%. That spread is what similar cars ordinarily ask.
 *   - The site's measured valuation error floor is ~6% of price (2026-08-22
 *     holdouts): no price model here resolves a car more finely than that.
 *
 * So "above" starts at +6%: past the ordinary spread for most cohorts and
 * at the floor. "below" needs −10%: well past the floor and past three
 * quarters of the ordinary spread, because a false bargain costs a shopper
 * money and a false "above" costs a dealer a look (the asymmetry of CLAUDE.md
 * and of comps.ts's own guards). On that feed: below 3,719 (20%), above
 * 8,153 (45%), typical the remaining 35%.
 *
 * Nothing that recovers the figure leaves here: no dollars, no percentage,
 * no peer count. The asking price and the bucket bound it to a band at best.
 */
export const BELOW_AT = -0.1;
export const ABOVE_AT = 0.06;

export type AskingVsSimilar = "below" | "typical" | "above";

/** The bucket for a guarded delta at the asking price it was computed on.
 *  Undefined when there is no figure or the inputs cannot be a market. */
export function askingVsSimilar(askUsd: number | null | undefined, deltaUsd: number | undefined): AskingVsSimilar | undefined {
  if (deltaUsd === undefined || !Number.isFinite(deltaUsd) || askUsd == null || !Number.isFinite(askUsd) || askUsd <= 0) return undefined;
  const similar = askUsd - deltaUsd;
  if (!(similar > 0)) return undefined;
  const f = deltaUsd / similar;
  if (f <= BELOW_AT) return "below";
  if (f >= ABOVE_AT) return "above";
  return "typical";
}

/** The Pro artifact, from the publish it came from. */
export type SignalSet = { asOf: string; signals: ProSignals };

/** How long a connector call waits for the sealed artifact (~3.6 MB, opened
 *  once per publish per instance). Past it the field is absent for that call,
 *  never a guess. */
export const SIGNALS_WAIT_MS = 5_000;

/** The Pro signals, or null when unreadable in time. `load` is the paid
 *  tier's own reader (lib/api/paid.ts), the one /api/v1/data uses: nothing
 *  of it is exposed, and no database is read. */
export async function similarSignals(
  load: () => Promise<SignalSet | null> = paidSignalSet,
  ms: number = SIGNALS_WAIT_MS,
): Promise<SignalSet | null> {
  return bounded(() => load(), ms);
}

/** The bucket for one car, from a signal set of the SAME publish as the
 *  price it is paired with. A set from another publish answers nothing: its
 *  delta was taken at a price this record may no longer carry. */
export function bucketFor(set: SignalSet | null, asOf: string, id: string, askUsd: number | null | undefined): AskingVsSimilar | undefined {
  if (!set || set.asOf !== asOf) return undefined;
  return askingVsSimilar(askUsd, set.signals.get(id)?.askVsMarket?.deltaUsd);
}
