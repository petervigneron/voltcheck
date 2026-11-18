import type { EnrichmentRow } from "@/lib/types";
import type { Listing } from "@/lib/listings/types";
import { slimBand, type ApiIndex, type ApiManifest } from "@/lib/api/records";
import { apiIndex, apiManifest } from "@/lib/api/artifacts";
import type { SimilarBand } from "@/lib/listings/similarBand";
import { batteryWarranty as carWarranty, warrantyUnknowableForTitle } from "@/lib/listings/warranty";
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
 * A coarse, free answer to "is this a fair asking price": below, typical of,
 * or above what similar cars ask (owner, 2026-11-18: assistants get the
 * coarse answer free; the exact figures stay Pro).
 *
 * The band is computed at publish time by lib/listings/similarBand.ts and
 * rides in the public API index (lib/api/records.ts SlimRow, last element),
 * so this reads no database and no Pro artifact. It is its own measure, not
 * a cut of the Pro askVsMarket figure: the pool takes cars listed now and
 * cars no longer listed for up to 30 days, the band is the pool's own spread
 * rather than a dollar floor, and a car whose comparison could be made and
 * whose price the band cannot tell apart from typical is "typical". No band
 * means only that the car could not be compared — no real price or
 * odometer, a buyback or branded title, too few cars of its version, or a
 * pool that mixes versions. A new car is compared on its discount from its
 * own sticker (lib/listings/newCarBand.ts), only where its listing carries
 * the sticker and a price before manufacturer incentives — no lane fills
 * those yet — and is never "below".
 *
 * Nothing that recovers a figure leaves here: no dollars, no percentage, no
 * peer count.
 */
export type AskingVsSimilar = SimilarBand;

/** The bands of one publish, by car id, with the price each was taken at. */
export type BandSet = { asOf: string; byId: Map<string, { band: AskingVsSimilar; priceUsd: number }> };

/** How long a connector call waits for the index. Past it the field is
 *  absent for that call, never a guess. */
export const BANDS_WAIT_MS = 5_000;

let memo: BandSet | undefined;

/** The band set of an index: only cars that carry one. */
export function bandSet(idx: ApiIndex): BandSet {
  const byId = new Map<string, { band: AskingVsSimilar; priceUsd: number }>();
  for (const row of idx.r) {
    const band = slimBand(row);
    if (band && row[4] > 0) byId.set(row[0], { band, priceUsd: row[4] });
  }
  return { asOf: idx.as_of, byId };
}

async function loadBands(): Promise<BandSet | null> {
  const m: ApiManifest | null = await apiManifest();
  if (!m) return null;
  if (memo?.asOf === m.as_of) return memo;
  const idx = await apiIndex(m);
  if (!idx) return null;
  return (memo = bandSet(idx));
}

/** The published bands, or null when unreadable in time. */
export async function similarBands(
  load: () => Promise<BandSet | null> = loadBands,
  ms: number = BANDS_WAIT_MS,
): Promise<BandSet | null> {
  return bounded(() => load(), ms);
}

/** The band for one car, from a band set of the SAME publish as the record,
 *  at the SAME price it was taken at. A set from another publish, or a price
 *  that has moved since, answers nothing. */
export function bucketFor(set: BandSet | null, asOf: string, id: string, askUsd: number | null | undefined): AskingVsSimilar | undefined {
  if (!set || set.asOf !== asOf || askUsd == null) return undefined;
  const hit = set.byId.get(id);
  return hit && hit.priceUsd === askUsd ? hit.band : undefined;
}
