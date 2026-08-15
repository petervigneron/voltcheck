// Every displayed fact carries provenance. An `agg` value is never promoted
// silently and must render as unverified in the UI.
export type Source = "mfr" | "vpic" | "vin" | "photo" | "dealer" | "tested" | "est" | "agg" | "unknown";

export interface Fact<T> {
  value: T;
  source: Source;
  sourceUrl?: string;
  asOf: string; // ISO date the value was last checked
  confidence: "high" | "medium" | "low";
  note?: string;
}

export type HeatPump = "standard" | "optional" | "awd_only" | "none";
export type PortStandard = "NACS" | "CCS1" | "CHAdeMO" | "J1772";
export type SuperchargerAccess = "native" | "adapter" | "none";
export type Chemistry = "LFP" | "NMC" | "NCA" | "NCM";

// T1/T2 — what the VIN gives us via vPIC. T2 values are hints, never facts.
export interface VinDecode {
  vin: string;
  usMarket: boolean; // false when vPIC returns ErrorCode 7 (grey import / non-US)
  make?: string;
  model?: string;
  modelYear?: number;
  plantCity?: string;
  plantState?: string;
  plantCountry?: string;
  electrificationLevel?: string;
  bodyClass?: string;
  // T2 hints
  trim?: string;
  driveType?: string;
  batteryKwhHint?: number;
  errorText?: string;
}

// Tesla-specific decoding straight from VIN string positions (no lookup).
export interface TeslaVinFacts {
  plant?: { code: string; name: string };
  modelYearFromVin?: number;
  chemistryHint?: "ternary" | "LFP";
}

// T3 — one row of the enrichment table.
// Key: (make, model, model_year, trim, pack_variant, plant)
export interface EnrichmentRow {
  id: string;
  make: string;
  model: string;
  modelYears: [number, number]; // inclusive range
  trim?: string | string[]; // undefined = all trims; an array = any of these names (maker renames across a lineup year)
  drive?: "AWD" | "RWD" | "FWD"; // set when drivetrain determines the pack/rating
  packVariant?: string;
  plant?: string; // matches vPIC plant city or Tesla VIN plant code
  // VIN position 8 — the manufacturer's own motor/battery code (Ford: 2022–23
  // L=Standard Range, V=Extended Range; 2024+ K/7/M/U). Year-scoped by the
  // row's modelYears, since makers reuse letters across generations.
  vin8?: string[];
  // VIN positions 4–8 — for makers whose VDS encodes model/body/variant as a
  // block (Mercedes' Baumuster: "EG2BB" = EQE 350+ Sedan, "GM2BB" = the SUV).
  // A hard filter like vin8: a keyed row never matches a different prefix.
  vinPrefix?: string[];
  // Set when the maker's Part 565 battery-kWh figure is a model-level
  // constant, not a per-VIN fact (every 2023 Lightning reads "98", every 2024
  // EV6 reads "58" — including AWD cars that never had that pack). The
  // matcher then ignores the vpicBatteryKwh hint for this row's cohort.
  ignoreKwhHint?: boolean;

  battery?: {
    packGrossKwh?: Fact<number>;
    packUsableKwh?: Fact<number>;
    chemistry?: Fact<Chemistry>;
  };
  range?: {
    epaRangeMi?: Fact<number>;
    // Aggregate of named instrumented tests (Edmunds loop, C&D 75-mph,
    // InsideEVs 70-mph); note lists each test attributed.
    testedRangeMi?: Fact<number>;
    epaKwhPer100Mi?: Fact<number>;
  };
  charging?: {
    portStandard?: Fact<PortStandard>;
    superchargerAccess?: Fact<SuperchargerAccess>;
    dcPeakKw?: Fact<number>;
    // "fitted"/"not_fitted" are per-car resolutions (photo or window sticker),
    // vs the model-level "standard"/"optional"/"none".
    dcFastCharging?: Fact<"standard" | "optional" | "none" | "fitted" | "not_fitted">;
    architectureV?: Fact<400 | 800>;
  };
  thermal?: {
    heatPump?: Fact<HeatPump>;
    // For "optional"-type cases where specific trims are known: normalized
    // trim name → resolved status (e.g. EV6: GT standard, Light unavailable).
    heatPumpByTrim?: Record<string, HeatPump>;
    batteryPreconditioning?: Fact<boolean>;
  };
  warranty?: {
    batteryYears?: Fact<number>;
    batteryMiles?: Fact<number>;
    sohFloorPct?: Fact<number>;
    batteryTransfers?: Fact<boolean>;
    powertrainTransfers?: Fact<boolean>;
    extendedCoverage?: Fact<string>;
  };
  // Free-form flags the report surfaces prominently. `resolvedBy` names the
  // per-car evidence that retires the note when a listing carries it:
  // a photo read, a completed campaign check, or the listing's own
  // trim/drivetrain settling an option ambiguity.
  buyerNotes?: {
    headline: string;
    // Only the headline renders. `body` survives in older data files as
    // research context; the UI never shows it.
    body?: string;
    severity: "info" | "warning" | "trap";
    resolvedBy?: "photo_dcfc" | "campaign_check" | "config_resolved";
    learnMore?: string;
  }[];
}

// When one (make, model, year, trim) maps to materially different cars, the
// honest output is the candidates plus the question that discriminates them.
export interface EnrichmentResult {
  exact?: EnrichmentRow;
  candidates?: EnrichmentRow[];
  discriminator?: string; // e.g. "VIN position 11: F=Fremont, A=Austin"
}

// T4 — cannot be derived; rendered as a compact, de-emphasized reference list.
export interface ChecklistItem {
  question: string;
  why: string;
}
