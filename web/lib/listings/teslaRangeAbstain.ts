import type { Listing } from "./types";
import { matchIgnoringTrim } from "../enrichment/match";
import { decodeTeslaVin, isTeslaVin } from "../tesla-vin";

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

function inCollisionBucket(l: Listing): boolean {
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
export function abstainTeslaRange(l: Listing): boolean {
  if (!inCollisionBucket(l)) return false;
  const tesla = isTeslaVin(l.vin) ? decodeTeslaVin(l.vin) : null;
  const corroborated = matchIgnoringTrim(
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
  ).exact;
  return corroborated === undefined;
}
