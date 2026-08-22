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
  /**
   * Set when the listing's own description names a different version than
   * `trim` claims and the VIN can't settle it (lib/listings/trimTrust.ts).
   *
   * `trim` above still carries the disputed string, because the matcher needs
   * it: the question it asks is whether the trim CHANGED the answer, which
   * can only be asked by matching both with it and without it. Distrusting a
   * trim is not the same as not having one — a listing with no trim gets no
   * trim-keyed row at all, while this one is definitely one of the cohort's
   * versions and we simply may not say which.
   */
  trimUntrusted?: boolean;
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
  // VIN positions 1–3 (world manufacturer identifier) — the body-style
  // discriminator when one showroom name covers two different cars. Mercedes
  // dealers file the EQE sedan and the EQE SUV under the same model and trim
  // strings ("EQE" / "500 4MATIC"), but Bremen sedans are W1K and Tuscaloosa
  // SUVs are 4JG, and the two bodies carry different EPA ranges and prices.
  // A hard filter like vin8: a row keyed to WMIs never matches a VIN outside
  // them.
  wmi?: string[];
  // VIN positions 4 onward — the vehicle descriptor, where a maker encodes the
  // things a dealer feed blurs. Each entry is a prefix starting at position 4,
  // so "X" keys on position 4 alone and "AF0B" on positions 4-7. A hard filter
  // like `wmi` and `vin8`: a row keyed to descriptors never matches a VIN
  // outside them. Added 2026-08-22 for two cars the trim string could not
  // separate honestly — the Cadillac Lyriq V-Series (1GYXP, against an
  // ordinary 1GYKP) and the Nissan Ariya's 63-vs-87 kWh packs, where position
  // 8 carries the drivetrain and says nothing about the pack.
  vds?: string[];
  // Other model strings dealer feeds file this car under — most EQE SUV
  // listings arrive as model "EQE". Each alias matches exactly as `model`
  // does; the VIN-level wmi filter is what keeps an alias from poaching the
  // other body's listings.
  modelAliases?: string[];
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
    // BEV: the car's whole EPA range — unchanged meaning, don't repurpose it.
    // PHEV: the EPA ELECTRIC-ONLY range (fueleconomy.gov's `rangeA`, on
    // fuelType2/electricity) — the headline number for an EV-shopping site,
    // and the one a PHEV row should always carry even where the rest of this
    // group is thin. Never the blended or total figure for a PHEV; that's
    // epaRangeTotalMi below. A PHEV row with both fields set is how a shopper
    // tells them apart on the card; see EnrichmentReport.tsx's label swap.
    epaRangeMi?: Fact<number>;
    // PHEV only. Total range with the gas engine running after the battery
    // depletes (fueleconomy.gov's plain `range`, fuelType1+fuelType2
    // combined). Absent for BEVs — there is no second number to hold.
    epaRangeTotalMi?: Fact<number>;
    // Aggregate of named instrumented tests (Edmunds loop, C&D 75-mph,
    // InsideEVs 70-mph); note lists each test attributed.
    testedRangeMi?: Fact<number>;
    epaKwhPer100Mi?: Fact<number>;
    // PHEV only, from fueleconomy.gov: `combA08`, MPGe while running on the
    // battery (fuelType2). Distinct from mpgeCombined below — this is the
    // pure-electric figure, not the blended one.
    mpgeElectric?: Fact<number>;
    // PHEV only, from fueleconomy.gov's `phevComb`: EPA's own blended
    // gasoline-electricity composite MPGe, used in its annual-fuel-cost math.
    // A third number, distinct from both mpgeElectric and mpgGasoline —
    // don't collapse it into either.
    mpgeCombined?: Fact<number>;
    // PHEV only, from fueleconomy.gov's `comb08`: MPG on gasoline
    // (fuelType1) once the battery is depleted — the number that matters
    // once a shopper stops plugging in.
    mpgGasoline?: Fact<number>;
  };
  charging?: {
    portStandard?: Fact<PortStandard>;
    superchargerAccess?: Fact<SuperchargerAccess>;
    dcPeakKw?: Fact<number>;
    // Minutes for a 10%→80% state-of-charge DC session — a headline number
    // makers publish about as often as EPA range, but it's only true under
    // the condition the maker tested it at (usually the car's own peak rate,
    // on a compatible high-power station); state that condition in the note
    // the way dcPeakKw's own notes do, or this becomes exactly the
    // context-free "18 minutes!" claim docs/ENRICHMENT-SCHEMA.md warns about.
    chargeTime1080Min?: Fact<number>;
    // "fitted"/"not_fitted" are per-car resolutions (photo or window sticker),
    // vs the model-level "standard"/"optional"/"none".
    dcFastCharging?: Fact<"standard" | "optional" | "none" | "fitted" | "not_fitted">;
    // Pack nominal voltage. Not a two-valued enum: the Lucid Gravity GT is
    // 926V, well sourced from Lucid's own material, so `400 | 800` couldn't
    // express the truth for three shipped Lucid vehicles (Air, Gravity,
    // Gravity GT all differ). A plain number, like every other charging spec
    // here — FactRow renders it as `${v}V` and never branched on the two old
    // values.
    architectureV?: Fact<number>;
    // Max AC (Level 2) acceptance rate — separate from dcPeakKw, and the
    // number that actually sets home/public L2 charge time. Named in
    // docs/ENRICHMENT-SCHEMA.md as ac_onboard_kw; never implemented until now.
    acOnboardKw?: Fact<number>;
    // Whether the car can authenticate and bill a DC session with no app/card
    // (ISO 15118). Often an owner entitlement rather than a fixed hardware
    // fact (e.g. tied to a bundled charging plan) — the row's note should say
    // so when it is. Named in docs/ENRICHMENT-SCHEMA.md as plug_and_charge.
    plugAndCharge?: Fact<boolean>;
  };
  thermal?: {
    heatPump?: Fact<HeatPump>;
    // For "optional"-type cases where specific trims are known: normalized
    // trim name → resolved status (e.g. EV6: GT standard, Light unavailable).
    heatPumpByTrim?: Record<string, HeatPump>;
    batteryPreconditioning?: Fact<boolean>;
  };
  // Facts about the vehicle as a physical object, not its EV systems —
  // currently just tow rating, added for the ID. Buzz, but not really an
  // EV-specific fact, hence its own group rather than living under battery
  // or charging.
  specs?: {
    // The maximum (braked) tow rating a maker publishes; note text should
    // state the unbraked figure too where one exists, since the two numbers
    // are usually printed side by side and a shopper towing anything needs
    // both.
    towRatingLb?: Fact<number>;
  };
  warranty?: {
    batteryYears?: Fact<number>;
    batteryMiles?: Fact<number>;
    sohFloorPct?: Fact<number>;
    batteryTransfers?: Fact<boolean>;
    powertrainTerms?: Fact<string>;
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
