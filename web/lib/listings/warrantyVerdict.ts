import type { EnrichmentRow } from "../types";
import { batteryWarranty, type BatteryWarranty } from "./warranty";

// The client half of the /warranty tool (lib/listings/warrantyCheck.ts is the
// server half and says what the answer is). Kept apart because the server
// half reads the whole enrichment corpus, and the picker must not ship it.

export type WarrantyTerm = {
  years?: number;
  miles?: number;
  /** The trims this term applies to; absent when the rows do not say so unambiguously. */
  trims?: string[];
  /** Any row's figure for this term is not the manufacturer's own. */
  est: boolean;
};

/** What the verdict needs from the agreed term. Plain data: it crosses to the client. */
export type WarrantyBasis = {
  years?: number;
  miles?: number;
  /** The earliest documented in-service floor across the cohort, or absent if any row has none. */
  earliestInService?: string;
  est: boolean;
};

export type WarrantyAnswer = {
  terms: WarrantyTerm[];
  /** Set only when there is one term. */
  basis?: WarrantyBasis;
  floorPct?: number;
  transfers?: boolean;
  /** Every model string the cohort's rows and the shopper's pick go by, for the recall abstention. */
  models: string[];
};

/** One model in the /warranty picker: its answer for each model year the rows cover. */
export type WarrantyModel = {
  makeSlug: string;
  make: string;
  modelSlug: string;
  model: string;
  /** The model's battery-warranty fact sheet, when one exists. */
  sheet?: { href: string; label: string };
  years: { year: number; answer: WarrantyAnswer | null }[];
};

const fact = <T,>(value: T) => ({ value, source: "mfr" as const, asOf: "", confidence: "high" as const });

/**
 * In force or not, for one odometer reading. batteryWarranty() on one
 * synthetic row carrying only the agreed term, run once per model string the
 * cohort goes by: the Bolt recall abstention keys on the model name, and a
 * hub spelling must not be what steps around it. Any disagreement, and any
 * "unknown", is unknown.
 */
export function warrantyStatus(
  answer: Pick<WarrantyAnswer, "basis" | "models">,
  car: { make: string; year: number; mileage?: number },
  now: Date = new Date()
): BatteryWarranty {
  const b = answer.basis;
  if (!b) return { state: "unknown" };
  const row = {
    id: "warranty-check",
    make: car.make,
    model: answer.models[0] ?? "",
    modelYears: [car.year, car.year],
    warranty: {
      batteryYears: b.years != null ? fact(b.years) : undefined,
      batteryMiles: b.miles != null ? fact(b.miles) : undefined,
      earliestInService: b.earliestInService ? fact(b.earliestInService) : undefined,
    },
  } as EnrichmentRow;
  const results = (answer.models.length ? answer.models : [""]).map((model) =>
    batteryWarranty(row, { make: car.make, model, year: car.year, mileage: car.mileage }, now)
  );
  const first = results[0];
  if (first.state === "unknown") return first;
  return results.every((r) => r.state === first.state && r.label === first.label)
    ? first
    : { state: "unknown" };
}
