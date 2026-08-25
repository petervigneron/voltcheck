import type { EnrichmentResult, EnrichmentRow, VinDecode } from "../types";
import { matchIgnoringTrim } from "../enrichment/match";
import { decodeTeslaVin, isTeslaVin } from "../tesla-vin";

/**
 * The little that deciding this question actually needs. A `Listing`
 * satisfies it structurally, and so does a bare vPIC decode once its field
 * names are mapped across — which is the point: /vin/[vin] has no listing,
 * only a VIN, and it needs the same answer.
 */
export interface TeslaCollisionSubject {
  vin: string;
  make: string;
  model: string;
  year: number;
  drive?: string;
  vpicBatteryKwh?: number;
}

/**
 * Eight (model, model-year, VIN-8) combinations where Tesla's own motor code
 * — the one field a dealer feed can't blur, and the hard filter matchEnrichmentRaw
 * applies before anything else — still leaves TWO OR MORE real configurations
 * on the books with materially different EPA range. Read directly off the
 * rows in lib/enrichment/data.ts / data4.ts; confirmed by
 * docs/agents/trim-error-rate-2026-08-21.md §4, which is the measurement this
 * whole file exists to act on.
 *
 * Worst case: 2024 Model 3, VIN-8 "A" — 272 mi (RWD, no trim) vs 363 mi
 * (Long Range) — a wrong guess here is off by 91 miles, a third of the true
 * figure either way. The other seven run 33–70 miles.
 *
 * The trim that's supposed to pick between them is close to unverifiable for
 * Tesla specifically, not merely unchecked: that measurement found vPIC
 * returns a blank trim for 100% of Tesla VINs (36/36 sampled), price bands
 * overlap too much to separate versions (2024 Model 3 "RWD" resold for a
 * HIGHER median than "Long Range" in the same VIN-8/year pool — backwards
 * from MSRP order), and dealer.com's per-vehicle description — the one
 * channel that could in principle be independent — turned out to be a
 * template that substitutes the trim field back into itself ("...perfect
 * car? Contact {dealer} to see this {color} {trim} {bodyStyle}"), so it can
 * never disagree with a wrong trim by construction. Of the ~1,301 listings
 * in these eight buckets on 2026-08-21, only 8 (0.6%) had a trim any
 * available channel could actually check.
 */
const TESLA_RANGE_COLLISIONS: readonly {
  model: "Model 3" | "Model Y";
  minYear: number;
  maxYear: number;
  vin8: string;
}[] = [
  { model: "Model 3", minYear: 2018, maxYear: 2018, vin8: "A" }, // Mid Range 260 mi vs Long Range 310 mi
  { model: "Model 3", minYear: 2019, maxYear: 2019, vin8: "A" }, // Standard Range Plus 240 / Mid Range 264 vs Long Range 310 mi
  { model: "Model 3", minYear: 2024, maxYear: 2024, vin8: "A" }, // RWD 272 mi vs Long Range 363 mi — the 91-mile worst case
  { model: "Model 3", minYear: 2026, maxYear: 2026, vin8: "A" }, // Standard 321 mi vs Premium/Long Range 363 mi
  { model: "Model Y", minYear: 2022, maxYear: 2023, vin8: "E" }, // AWD (4680 pack) 279 mi vs Long Range AWD (2170 pack) 330 mi
  { model: "Model Y", minYear: 2024, maxYear: 2024, vin8: "D" }, // RWD 260 mi vs Long Range 320 mi
  { model: "Model Y", minYear: 2026, maxYear: 2026, vin8: "D" }, // Standard 321 mi vs Premium/Long Range 357 mi
  { model: "Model Y", minYear: 2026, maxYear: 2026, vin8: "E" }, // Standard AWD 294 mi vs Premium/Long Range AWD 327 mi
];

function inCollisionBucket(l: TeslaCollisionSubject): boolean {
  if (l.make.trim().toUpperCase() !== "TESLA") return false;
  const vin8 = l.vin?.[7]?.toUpperCase();
  if (!vin8) return false;
  const model = l.model.trim();
  return TESLA_RANGE_COLLISIONS.some(
    (b) => b.model === model && b.vin8 === vin8 && l.year >= b.minYear && l.year <= b.maxYear
  );
}

/**
 * Should this listing's published range be withheld?
 *
 * Narrowly scoped on purpose (owner decision, 2026-08-21, following
 * docs/agents/trim-error-rate-2026-08-21.md) — the range figure only, only
 * inside the eight buckets above, and only when nothing beyond the dealer's
 * own trim string says which car this is.
 *
 * "Nothing beyond the trim string" is answered by `matchIgnoringTrim`, and
 * deliberately NOT by re-running the ordinary matcher with the trim removed.
 * Every one of these eight buckets has a plain, trim-agnostic row sitting
 * right next to the trim-specific one it collides with (the "RWD, no trim"
 * row in the 2024 worst case is a real, ordinary car) — so dropping the trim
 * the ordinary way doesn't produce silence, it produces a DIFFERENT, equally
 * unearned exact answer: the trim-agnostic row wins by elimination, not by
 * evidence, which is exactly the failure lib/enrichment/match.ts's own
 * matchWithoutTrustedTrim was written to stop happening for contradicted
 * trims. matchIgnoringTrim keeps every row in the bucket in play — trimmed
 * and untrimmed alike — so it only comes back with one when vin8, Tesla's
 * plant code, the drivetrain, or a vPIC battery-size hint actually did the
 * narrowing. Today that resolves a Fremont-built 2022–23 Model Y (plant code
 * F can only be the 330-mile Long Range AWD car — Austin built both) and, in
 * principle, any listing whose battery-size hint lands closer to one row's
 * pack than the other. It resolves almost nothing else in these eight
 * buckets, which is why this abstains on very close to the full ~1,301
 * rather than a smaller number: real corroboration is close to absent here,
 * not merely unchecked.
 *
 * This is deliberately NOT fleet-wide: every other make, and every Tesla
 * outside these eight (model, year, VIN-8) combinations, is untouched. A
 * bucket where our own rows already agree on range, or where a VIN-8 code
 * resolves to exactly one row on its own, was never a candidate for this in
 * the first place — matchEnrichmentRaw returns that one row directly and
 * there is nothing here to withhold from it.
 */
export function abstainTeslaRange(l: TeslaCollisionSubject): boolean {
  return teslaCollisionRows(l) !== undefined;
}

/**
 * The rows this listing could still be once the trim is out of the room —
 * i.e. the cars whose facts the resolved row is standing in for — or
 * `undefined` when there is nothing to withhold (outside the eight buckets,
 * or the VIN narrowed it to one row on its own).
 *
 * `abstainTeslaRange` is the boolean form of exactly this question, and
 * callers that need to know WHICH rows collided want this. Fields differ
 * across the colliding rows by field, not by listing: range and pack differ
 * in all eight buckets, which is why those are withheld unconditionally,
 * while battery chemistry differs in only one of them (see the note on the
 * clone in lib/listings/enrich.ts). Asking the rows directly rather than
 * hard-coding a second per-bucket list keeps the two from drifting apart
 * when a chemistry fact is added to a row that today carries none.
 */
export function teslaCollisionRows(l: TeslaCollisionSubject): EnrichmentRow[] | undefined {
  const probe = collisionProbe(l);
  if (!probe || probe.exact) return undefined;
  return probe.candidates ?? [];
}

/**
 * What the VIN alone narrows this car to, with the trim never in the room —
 * `undefined` outside the eight buckets. An `exact` here means real VIN
 * evidence (vin8, Tesla's plant code, the drivetrain or a battery-size hint)
 * did the narrowing, never a trim string; `candidates` means nothing did.
 */
function collisionProbe(l: TeslaCollisionSubject): EnrichmentResult | undefined {
  if (!inCollisionBucket(l)) return undefined;
  const tesla = isTeslaVin(l.vin) ? decodeTeslaVin(l.vin) : null;
  return matchIgnoringTrim(
    {
      vin: l.vin,
      usMarket: true,
      make: l.make.toUpperCase(),
      model: l.model,
      modelYear: l.year,
      trim: undefined,
      driveType: l.drive,
      batteryKwhHint: l.vpicBatteryKwh,
    },
    tesla
  );
}

/**
 * Why we won't pick between the rows. States the mechanism rather than
 * hedging, because the shopper can act on the mechanism: the VIN genuinely
 * cannot answer this, and the two documents that can are in the car.
 */
export const TESLA_COLLISION_DISCRIMINATOR =
  "Tesla's VIN does not encode which version this is: position 8 gives the motor layout, not the trim, and NHTSA's decoder returns a blank trim for every Tesla VIN. These versions share this car's VIN pattern and differ materially in range and pack size. The window sticker or the door-jamb label names the exact one.";

/**
 * The same abstention, for a bare VIN.
 *
 * /vin/[vin] resolves its row straight from `matchEnrichment` and never calls
 * `enrichListing`, so until 2026-08-25 none of this applied there — and that
 * page is where it bites hardest, because a vPIC decode of a Tesla carries no
 * trim, no drivetrain and no battery size (verified against vPIC on
 * 5YJ3E1EA2RF745143: Trim, DriveType and BatteryKWh all come back empty).
 * With no trim, `trimMatches` refuses every trim-keyed row, so the match lands
 * on whichever row happens to carry no trim key — the by-elimination failure
 * lib/enrichment/match.ts documents at length — and prints it as a researched
 * exact answer. Measured across the 6,773 Teslas in the crawl cache: 997 sit
 * in a collision bucket, and 196 of those were served one unqualified EPA
 * range, including the 272-vs-363 mi worst case.
 *
 * The remaining ~800 failed the opposite way and this fixes them too: where
 * EVERY row in the bucket is trim-keyed (2018/2019 Model 3 "A" and both 2026
 * buckets), the trim-less match dropped all of them and the page said "no
 * researched row for this model yet" about cars we hold two researched rows
 * for. `matchIgnoringTrim` keeps them in play, so they become candidates.
 */
export function withTeslaCollisionAbstention(
  decode: VinDecode,
  result: EnrichmentResult
): EnrichmentResult {
  if (!decode.vin || !decode.make || !decode.model || !decode.modelYear) return result;
  const probe = collisionProbe({
    vin: decode.vin,
    make: decode.make,
    model: decode.model,
    year: decode.modelYear,
    drive: decode.driveType,
    vpicBatteryKwh: decode.batteryKwhHint,
  });
  if (!probe) return result; // not one of the eight buckets

  // The VIN resolved it on its own — a Fremont-built 2022–23 Model Y, where
  // plant code F can only be the 330-mile Long Range AWD because Austin built
  // both. The trim-less ordinary match had already dropped both trim-keyed
  // rows and left this page saying "no researched row for this model yet"
  // about a car the listing page happily shows 330 mi for. Same evidence,
  // same answer, both surfaces. An ordinary exact still wins: it was matched
  // with more in hand than the probe had.
  if (probe.exact) return result.exact ? result : { exact: probe.exact };

  const rows = probe.candidates ?? [];
  // Fewer than two rows in play can't happen while an exact exists — the
  // ignoring-trim set is a superset of the ordinary one — so there is nothing
  // better to say than what we already had.
  if (rows.length < 2) return result;
  return { candidates: rows, discriminator: TESLA_COLLISION_DISCRIMINATOR };
}
