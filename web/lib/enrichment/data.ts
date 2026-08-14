import type { EnrichmentRow, Fact, Source } from "../types";

// Seed corpus. Every value here was checked against the sources cited in
// docs/ENRICHMENT-SCHEMA.md (researched August 2026). Sparse rows are
// deliberate: a missing field renders as "unknown", never as a guess.
const AS_OF = "2026-08-09";

function f<T>(
  value: T,
  source: Source,
  confidence: Fact<T>["confidence"] = "high",
  note?: string,
  sourceUrl?: string
): Fact<T> {
  return { value, source, asOf: AS_OF, confidence, note, sourceUrl };
}

// 2026-08-13 Ioniq 5 pass: heat-pump fitment, the facelift row, and DC-peak
// facts, read directly from Hyundai's per-model-year spec/feature sheets on
// hyundainews.com (see sourceUrls). Facts verified in that pass carry its date.
const AS_OF_I5 = "2026-08-13";
function f5<T>(
  value: T,
  source: Source,
  confidence: Fact<T>["confidence"] = "high",
  note?: string,
  sourceUrl?: string
): Fact<T> {
  return { value, source, asOf: AS_OF_I5, confidence, note, sourceUrl };
}

// 2026-08-14 Ioniq 5 range pass: per-variant EPA ranges read from the EPA's
// own vehicles dataset (fueleconomy.gov/feg/epadata, vehicles.csv). MY2023 is
// absent from that dataset entirely (control test: 2022 and 2024 Ioniq 5 and
// 2023 Ioniq 6 are all present), so MY2023 figures come from Hyundai's 2023
// spec sheet, which prints the same EPA-ratings table.
const AS_OF_I5_RANGE = "2026-08-14";
function f6<T>(
  value: T,
  source: Source,
  confidence: Fact<T>["confidence"] = "high",
  note?: string,
  sourceUrl?: string
): Fact<T> {
  return { value, source, asOf: AS_OF_I5_RANGE, confidence, note, sourceUrl };
}

export const ENRICHMENT_ROWS: EnrichmentRow[] = [
  // ── Tesla Model Y — "AWD" (279 mi) is not "Long Range AWD" (330 mi), and
  // listings routinely blur the two. EPA figures verified against
  // fueleconomy.gov's API 2026-08-09.
  {
    id: "model-y-lr-awd-2022-23",
    make: "TESLA",
    model: "Model Y",
    modelYears: [2022, 2023],
    vin8: ["E"], // dual motor, non-Performance — Tesla's own Part 565 motor code
    trim: "Long Range AWD",
    packVariant: "2170",
    battery: {
      packUsableKwh: f(76.5, "est", "medium", "~75–78 kWh; Tesla publishes no usable figure — from BMS logs and teardowns"),
      chemistry: f("NCA", "mfr"),
    },
    range: { epaRangeMi: f(330, "mfr", "high", "Official EPA rating for 'Model Y Long Range AWD'", "https://www.fueleconomy.gov"), testedRangeMi: f(276, "tested", "high", "70-mph test (InsideEVs, 2020 LR AWD): 276 mi; 75-mph (Car and Driver): 220; Edmunds mixed loop (2021): 317. Test cars were EPA 316–326") },
    charging: {
      portStandard: f("NACS", "mfr"),
      superchargerAccess: f("native", "mfr"),
    },
    thermal: { heatPump: f("standard", "mfr"), batteryPreconditioning: f(true, "mfr") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(120_000, "mfr"),
      sohFloorPct: f(70, "mfr"),
      batteryTransfers: f(true, "mfr"),
    },
    buyerNotes: [
      {
        headline: "FSD does not transfer with the car",
        severity: "warning",
      },
    ],
  },
  {
    id: "model-y-awd-4680-2022-23",
    make: "TESLA",
    model: "Model Y",
    modelYears: [2022, 2023],
    vin8: ["E"], // dual motor, non-Performance — Tesla's own Part 565 motor code
    trim: "AWD",
    packVariant: "4680",
    plant: "A",
    battery: {
      packUsableKwh: f(67.5, "est", "medium", "~67–68 kWh; Tesla publishes no usable figure — from BMS logs and teardowns"),
      chemistry: f("NCA", "mfr"),
    },
    range: { epaRangeMi: f(279, "mfr", "high", "Official EPA rating for 'Model Y AWD' — a distinct trim from Long Range AWD", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("NACS", "mfr"),
      superchargerAccess: f("native", "mfr"),
    },
    thermal: { heatPump: f("standard", "mfr"), batteryPreconditioning: f(true, "mfr") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(120_000, "mfr"),
      sohFloorPct: f(70, "mfr"),
      batteryTransfers: f(true, "mfr"),
    },
    buyerNotes: [
      {
        headline: "‘Model Y AWD’: 279 mi EPA — not the 330-mi ‘Long Range AWD’",
        severity: "trap",
      },
      {
        headline: "FSD does not transfer with the car",
        severity: "warning",
      },
    ],
  },
  {
    id: "model-y-lr-awd-2024",
    make: "TESLA",
    model: "Model Y",
    modelYears: [2024, 2024],
    vin8: ["E"], // dual motor, non-Performance — Tesla's own Part 565 motor code
    trim: "Long Range AWD",
    battery: {
      packUsableKwh: f(76.5, "est", "medium", "~75–78 kWh; Tesla publishes no usable figure — from BMS logs and teardowns"),
      chemistry: f("NCA", "mfr"),
    },
    range: { epaRangeMi: f(310, "mfr", "high", "Official 2024 EPA rating (308 for the AWD-I motor variant) — note this is lower than the 330 often quoted from 2022–23", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("NACS", "mfr"),
      superchargerAccess: f("native", "mfr"),
    },
    thermal: { heatPump: f("standard", "mfr"), batteryPreconditioning: f(true, "mfr") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(120_000, "mfr"),
      sohFloorPct: f(70, "mfr"),
      batteryTransfers: f(true, "mfr"),
    },
    buyerNotes: [
      {
        headline: "FSD does not transfer with the car",
        severity: "warning",
      },
    ],
  },

  // ── Tesla Model 3 — moved to data4.ts (2026-08-14 pass), re-keyed on the
  // VIN's motor code with per-variant EPA ranges; the 2020 heat-pump split
  // and pos-10 note carried over to those rows. ──

  // ── Chevrolet Bolt — DC fast charging was a $750 option ──
  {
    // 2020 split out to data4.ts (2026-08-14): its EPA rating is 259, and this
    // row's single 238 value was undershooting every 2020 car by 21 miles.
    id: "bolt-ev-2017-2019",
    make: "CHEVROLET",
    model: "Bolt EV",
    modelYears: [2017, 2019],
    range: { epaRangeMi: f(238, "mfr", "high", "MY2017–19 — EPA", "https://www.fueleconomy.gov") },
    charging: {
      dcFastCharging: f("optional", "mfr", "high", "RPO code CBT, $750 standalone option — optional on BOTH trims through MY2020"),
      portStandard: f("CCS1", "mfr", "high", "Only when the CBT option is present; without it the car is AC-only"),
    },
    thermal: { heatPump: f("none", "mfr") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      batteryTransfers: f(true, "mfr", "high", "GM booklet: \u201ctransferable at no cost to any subsequent person(s)\u201d (verified via extracted booklet text)"),
    },
    buyerNotes: [
      {
        headline: "DC fast charging: $750 factory option — not on every car",
        severity: "trap",
        resolvedBy: "photo_dcfc",
      },
      {
        headline: "Most 2017–19 cars got new battery modules under recall 21V560",
        severity: "info",
        resolvedBy: "campaign_check",
      },
      {
        headline: "No capacity floor on the battery warranty",
        severity: "warning",
      },
    ],
  },
  {
    id: "bolt-ev-2021-lt",
    make: "CHEVROLET",
    model: "Bolt EV",
    modelYears: [2021, 2021],
    trim: "LT",
    range: { epaRangeMi: f(259, "mfr", "high", "EPA figure", "https://www.fueleconomy.gov") },
    charging: {
      dcFastCharging: f("optional", "mfr", "high", "RPO CBT still optional on LT in MY2021; standard on Premier"),
    },
    thermal: { heatPump: f("none", "mfr") },
    warranty: { batteryYears: f(8, "mfr"), batteryMiles: f(100_000, "mfr"), batteryTransfers: f(true, "mfr", "high", "GM booklet: \u201ctransferable at no cost to any subsequent person(s)\u201d (verified via extracted booklet text)") },
    buyerNotes: [
      {
        headline: "DC fast charging: optional on LT this year",
        severity: "trap",
        resolvedBy: "photo_dcfc",
      },
      {
        headline: "Most 2020–22 cars kept their original packs (21V560)",
        severity: "info",
        resolvedBy: "campaign_check",
      },
    ],
  },
  {
    id: "bolt-ev-2021-premier",
    make: "CHEVROLET",
    model: "Bolt EV",
    modelYears: [2021, 2021],
    trim: "Premier",
    range: { epaRangeMi: f(259, "mfr", "high", "EPA figure", "https://www.fueleconomy.gov") },
    charging: { dcFastCharging: f("standard", "mfr") },
    thermal: { heatPump: f("none", "mfr") },
    warranty: { batteryYears: f(8, "mfr"), batteryMiles: f(100_000, "mfr"), batteryTransfers: f(true, "mfr", "high", "GM booklet: \u201ctransferable at no cost to any subsequent person(s)\u201d (verified via extracted booklet text)") },
  },
  {
    id: "bolt-2022-plus",
    make: "CHEVROLET",
    model: "Bolt EV",
    modelYears: [2022, 2023],
    range: { epaRangeMi: f(259, "mfr", "high", "EPA figure", "https://www.fueleconomy.gov"), testedRangeMi: f(260, "tested", "high", "70-mph (InsideEVs, 2022): 260 mi; Edmunds mixed loop: 278") },
    charging: { dcFastCharging: f("standard", "mfr"), portStandard: f("CCS1", "mfr") },
    thermal: { heatPump: f("none", "mfr") },
    warranty: { batteryYears: f(8, "mfr"), batteryMiles: f(100_000, "mfr"), batteryTransfers: f(true, "mfr", "high", "GM booklet: \u201ctransferable at no cost to any subsequent person(s)\u201d (verified via extracted booklet text)") },
    buyerNotes: [
      {
        headline: "Most 2020–22 cars kept their original packs (21V560)",
        severity: "info",
        resolvedBy: "campaign_check",
      },
    ],
  },

  // ── Hyundai Ioniq 5 — one row per drivetrain/pack variant, because the EPA
  // rating differs per variant and listings often omit which one they are.
  // Shared facts (warranty, ICCU, charging hardware) repeat per row on purpose:
  // each row must stand alone when matched.
  {
    id: "ioniq5-2022-sr",
    make: "HYUNDAI",
    model: "Ioniq 5",
    modelYears: [2022, 2022],
    trim: "Standard Range",
    drive: "RWD",
    battery: { packGrossKwh: f(58.0, "mfr", "medium", "Hyundai publishes one figure and does not say gross or usable") },
    range: { epaRangeMi: f6(220, "mfr", "high", "Official EPA rating, 'Ioniq 5 RWD (Standard Range)' — EPA vehicle id 44924", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("CCS1", "mfr"),
      superchargerAccess: f5("adapter", "mfr", "high", "Hyundai's March 2025 program opened US Superchargers to CCS-port cars via a NACS adapter. The free adapter was one per vehicle for owners who bought on or before 31 Jan 2025 — it does not automatically follow the car", "https://www.hyundainews.com/releases/4339"),
      dcPeakKw: f5(177, "tested", "medium", "58 kWh pack peak in instrumented sessions (InsideEVs charge analysis)", "https://insideevs.com/news/503522/hyundai-ioniq5-fast-charging-analysis/"),
      architectureV: f5(800, "mfr", "high", "522.7V-nominal Standard Range pack; 800V/350 kW ultra-fast charger standard", "https://www.hyundainews.com/assets/documents/original/48175-2022Ioniq5ProductGuidespecs090821.pdf"),
    },
    thermal: {
      heatPump: f5("none", "mfr", "high", "Heat pump is AWD-only through MY2024; every Standard Range car is RWD", "https://www.hyundainews.com/assets/documents/original/48175-2022Ioniq5ProductGuidespecs090821.pdf"),
      batteryPreconditioning: f5(false, "mfr", "medium", "The 2022 sheet lists only a battery heater (AWD-only) — the \"battery preconditioning function\" line first appears on the 2023 sheet", "https://www.hyundainews.com/assets/documents/original/48175-2022Ioniq5ProductGuidespecs090821.pdf"),
    },
    warranty: {
      batteryYears: f(10, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(70, "mfr"),
      batteryTransfers: f(true, "mfr", "high", "HV battery & EV system coverage transfers in full — confirmed in Hyundai's 2026 Owner's Handbook §6"),
      powertrainTransfers: f(false, "mfr", "high", "Powertrain 10yr/100k is original-owner-only; drops to 5yr/60k for a second owner"),
      extendedCoverage: f("ICCU: 15 years / 180,000 miles (extended April 2026, up from 10/100)", "mfr"),
    },
  },
  {
    id: "ioniq5-2022-rwd",
    make: "HYUNDAI",
    model: "Ioniq 5",
    modelYears: [2022, 2022],
    drive: "RWD",
    battery: { packGrossKwh: f(77.4, "mfr", "medium", "Long-range pack; Hyundai publishes one figure and does not say gross or usable") },
    range: { epaRangeMi: f6(303, "mfr", "high", "Official EPA rating, 'Ioniq 5 RWD (Long Range)' — EPA vehicle id 44923", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("CCS1", "mfr"),
      superchargerAccess: f5("adapter", "mfr", "high", "Hyundai's March 2025 program opened US Superchargers to CCS-port cars via a NACS adapter. The free adapter was one per vehicle for owners who bought on or before 31 Jan 2025 — it does not automatically follow the car", "https://www.hyundainews.com/releases/4339"),
      dcPeakKw: f5(235, "tested", "medium", "Hyundai publishes no vehicle peak — its sheet says only \"10–80% in 18 min\" on a >250 kW 800V charger. Instrumented sessions on the 77.4 kWh pack peak at ~233–236 kW (InsideEVs; EV Pulse)", "https://insideevs.com/news/503522/hyundai-ioniq5-fast-charging-analysis/"),
      architectureV: f5(800, "mfr", "high", "697V-nominal pack; the 2022 spec sheet lists the 800V/350 kW ultra-fast charger as standard", "https://www.hyundainews.com/assets/documents/original/48175-2022Ioniq5ProductGuidespecs090821.pdf"),
    },
    thermal: {
      heatPump: f5("none", "mfr", "high", "Heat pump is AWD-only for MY2022 — RWD cars have none", "https://www.hyundainews.com/assets/documents/original/48175-2022Ioniq5ProductGuidespecs090821.pdf"),
      batteryPreconditioning: f5(false, "mfr", "medium", "The 2022 sheet lists only a battery heater (AWD-only) — the \"battery preconditioning function\" line first appears on the 2023 sheet", "https://www.hyundainews.com/assets/documents/original/48175-2022Ioniq5ProductGuidespecs090821.pdf"),
    },
    warranty: {
      batteryYears: f(10, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(70, "mfr"),
      batteryTransfers: f(true, "mfr", "high", "HV battery & EV system coverage transfers in full — confirmed in Hyundai's 2026 Owner's Handbook §6"),
      powertrainTransfers: f(false, "mfr", "high", "Powertrain 10yr/100k is original-owner-only; drops to 5yr/60k for a second owner"),
      extendedCoverage: f("ICCU: 15 years / 180,000 miles (extended April 2026, up from 10/100)", "mfr"),
    },
  },
  {
    id: "ioniq5-2022-awd",
    make: "HYUNDAI",
    model: "Ioniq 5",
    modelYears: [2022, 2022],
    drive: "AWD",
    battery: { packGrossKwh: f(77.4, "mfr", "medium", "Long-range pack; Hyundai publishes one figure and does not say gross or usable") },
    range: { epaRangeMi: f6(256, "mfr", "high", "Official EPA rating, 'Ioniq 5 AWD (Long Range)' — EPA vehicle id 44922", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("CCS1", "mfr"),
      superchargerAccess: f5("adapter", "mfr", "high", "Hyundai's March 2025 program opened US Superchargers to CCS-port cars via a NACS adapter. The free adapter was one per vehicle for owners who bought on or before 31 Jan 2025 — it does not automatically follow the car", "https://www.hyundainews.com/releases/4339"),
      dcPeakKw: f5(235, "tested", "medium", "Hyundai publishes no vehicle peak — its sheet says only \"10–80% in 18 min\" on a >250 kW 800V charger. Instrumented sessions on the 77.4 kWh pack peak at ~233–236 kW (InsideEVs; EV Pulse)", "https://insideevs.com/news/503522/hyundai-ioniq5-fast-charging-analysis/"),
      architectureV: f5(800, "mfr", "high", "697V-nominal pack; the 2022 spec sheet lists the 800V/350 kW ultra-fast charger as standard", "https://www.hyundainews.com/assets/documents/original/48175-2022Ioniq5ProductGuidespecs090821.pdf"),
    },
    thermal: {
      heatPump: f5("standard", "mfr", "high", "Standard on AWD (the heat pump is AWD-only this model year)", "https://www.hyundainews.com/assets/documents/original/48175-2022Ioniq5ProductGuidespecs090821.pdf"),
      batteryPreconditioning: f5(false, "mfr", "medium", "The 2022 sheet lists only a battery heater (AWD-only) — the \"battery preconditioning function\" line first appears on the 2023 sheet", "https://www.hyundainews.com/assets/documents/original/48175-2022Ioniq5ProductGuidespecs090821.pdf"),
    },
    warranty: {
      batteryYears: f(10, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(70, "mfr"),
      batteryTransfers: f(true, "mfr", "high", "HV battery & EV system coverage transfers in full — confirmed in Hyundai's 2026 Owner's Handbook §6"),
      powertrainTransfers: f(false, "mfr", "high", "Powertrain 10yr/100k is original-owner-only; drops to 5yr/60k for a second owner"),
      extendedCoverage: f("ICCU: 15 years / 180,000 miles (extended April 2026, up from 10/100)", "mfr"),
    },
  },

  // ── Ioniq 5 MY2023–24. SR and LR RWD ratings are identical both years so
  // those rows span [2023, 2024]; the AWD rating changed (266 → 260), so AWD
  // gets one row per year.
  {
    id: "ioniq5-2023-2024-sr",
    make: "HYUNDAI",
    model: "Ioniq 5",
    modelYears: [2023, 2024],
    trim: "Standard Range",
    drive: "RWD",
    battery: { packGrossKwh: f(58.0, "mfr", "medium", "Hyundai publishes one figure and does not say gross or usable") },
    range: { epaRangeMi: f6(220, "mfr", "high", "MY2024 EPA rating, 'Ioniq 5 Standard range RWD' (EPA vehicle id 46961); the 2023 spec sheet prints the same 220-mile EPA figure", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("CCS1", "mfr", "high", "Pre-facelift cars are CCS1; the native NACS port arrives with the MY2025 facelift"),
      superchargerAccess: f5("adapter", "mfr", "high", "Hyundai's March 2025 program opened US Superchargers to CCS-port cars via a NACS adapter. The free adapter was one per vehicle for owners who bought on or before 31 Jan 2025 — it does not automatically follow the car", "https://www.hyundainews.com/releases/4339"),
      dcPeakKw: f5(177, "tested", "medium", "58 kWh pack peak in instrumented sessions (InsideEVs charge analysis)", "https://insideevs.com/news/503522/hyundai-ioniq5-fast-charging-analysis/"),
      architectureV: f5(800, "mfr", "high", "522.7V-nominal Standard Range pack; 800V/350 kW ultra-fast charger standard per the model-year spec sheets", "https://www.hyundainews.com/assets/documents/original/56233-2024IONIQ5Specs062623.pdf"),
    },
    thermal: {
      heatPump: f5("none", "mfr", "high", "Heat pump is AWD-only per the 2023 and 2024 feature sheets; every Standard Range car is RWD", "https://www.hyundainews.com/assets/documents/original/56232-2024IONIQ5Features062623.pdf"),
      batteryPreconditioning: f5(true, "mfr", "high", "\"Battery preconditioning function\" standard on all models per the 2023 and 2024 spec sheets", "https://www.hyundainews.com/assets/documents/original/50313-2023IONIQ5ProductSpecifications20220630.pdf"),
    },
    warranty: {
      batteryYears: f(10, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(70, "mfr"),
      batteryTransfers: f(true, "mfr", "high", "HV battery & EV system coverage transfers in full — confirmed in Hyundai's 2026 Owner's Handbook §6"),
      powertrainTransfers: f(false, "mfr", "high", "Powertrain 10yr/100k is original-owner-only; drops to 5yr/60k for a second owner"),
      extendedCoverage: f("ICCU: 15 years / 180,000 miles (extended April 2026, up from 10/100)", "mfr"),
    },
  },
  {
    id: "ioniq5-2023-2024-rwd",
    make: "HYUNDAI",
    model: "Ioniq 5",
    modelYears: [2023, 2024],
    drive: "RWD",
    battery: { packGrossKwh: f(77.4, "mfr", "medium", "Long-range pack; Hyundai publishes one figure and does not say gross or usable") },
    range: { epaRangeMi: f6(303, "mfr", "high", "MY2024 EPA rating, 'Ioniq 5 Long range RWD' (EPA vehicle id 46960); the 2023 spec sheet prints the same 303-mile EPA figure for SE/SEL/Limited RWD", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("CCS1", "mfr", "high", "Pre-facelift cars are CCS1; the native NACS port arrives with the MY2025 facelift"),
      superchargerAccess: f5("adapter", "mfr", "high", "Hyundai's March 2025 program opened US Superchargers to CCS-port cars via a NACS adapter. The free adapter was one per vehicle for owners who bought on or before 31 Jan 2025 — it does not automatically follow the car", "https://www.hyundainews.com/releases/4339"),
      dcPeakKw: f5(235, "tested", "medium", "Hyundai publishes no vehicle peak — its sheets say only \"10–80% in 18 min\" on a >250 kW 800V charger. Instrumented sessions on the 77.4 kWh pack peak at ~233–236 kW (InsideEVs; EV Pulse)", "https://insideevs.com/news/503522/hyundai-ioniq5-fast-charging-analysis/"),
      architectureV: f5(800, "mfr", "high", "697V-nominal long-range pack; 800V/350 kW ultra-fast charger standard per the model-year spec sheets", "https://www.hyundainews.com/assets/documents/original/56233-2024IONIQ5Specs062623.pdf"),
    },
    thermal: {
      heatPump: f5("none", "mfr", "high", "Heat pump is AWD-only on every trim per the 2023 and 2024 feature sheets — RWD cars have none", "https://www.hyundainews.com/assets/documents/original/56232-2024IONIQ5Features062623.pdf"),
      batteryPreconditioning: f5(true, "mfr", "high", "\"Battery preconditioning function\" standard on all models per the 2023 and 2024 spec sheets", "https://www.hyundainews.com/assets/documents/original/50313-2023IONIQ5ProductSpecifications20220630.pdf"),
    },
    warranty: {
      batteryYears: f(10, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(70, "mfr"),
      batteryTransfers: f(true, "mfr", "high", "HV battery & EV system coverage transfers in full — confirmed in Hyundai's 2026 Owner's Handbook §6"),
      powertrainTransfers: f(false, "mfr", "high", "Powertrain 10yr/100k is original-owner-only; drops to 5yr/60k for a second owner"),
      extendedCoverage: f("ICCU: 15 years / 180,000 miles (extended April 2026, up from 10/100)", "mfr"),
    },
  },
  {
    id: "ioniq5-2023-awd",
    make: "HYUNDAI",
    model: "Ioniq 5",
    modelYears: [2023, 2023],
    drive: "AWD",
    battery: { packGrossKwh: f(77.4, "mfr", "medium", "Long-range pack; Hyundai publishes one figure and does not say gross or usable") },
    range: { epaRangeMi: f6(266, "mfr", "high", "Hyundai's 2023 spec sheet: 266 miles EPA for SE/SEL/Limited AWD (printed in both the powertrain and EPA-ratings tables). The EPA's public dataset has no MY2023 Ioniq 5 records (verified by control test 2026-08-14), so the manufacturer sheet is the citable source", "https://www.hyundainews.com/assets/documents/original/50313-2023IONIQ5ProductSpecifications20220630.pdf") },
    charging: {
      portStandard: f("CCS1", "mfr", "high", "Pre-facelift cars are CCS1; the native NACS port arrives with the MY2025 facelift"),
      superchargerAccess: f5("adapter", "mfr", "high", "Hyundai's March 2025 program opened US Superchargers to CCS-port cars via a NACS adapter. The free adapter was one per vehicle for owners who bought on or before 31 Jan 2025 — it does not automatically follow the car", "https://www.hyundainews.com/releases/4339"),
      dcPeakKw: f5(235, "tested", "medium", "Hyundai publishes no vehicle peak — its sheets say only \"10–80% in 18 min\" on a >250 kW 800V charger. Instrumented sessions on the 77.4 kWh pack peak at ~233–236 kW (InsideEVs; EV Pulse)", "https://insideevs.com/news/503522/hyundai-ioniq5-fast-charging-analysis/"),
      architectureV: f5(800, "mfr", "high", "697V-nominal long-range pack; 800V/350 kW ultra-fast charger standard per the model-year spec sheets", "https://www.hyundainews.com/assets/documents/original/50313-2023IONIQ5ProductSpecifications20220630.pdf"),
    },
    thermal: {
      heatPump: f5("standard", "mfr", "high", "Standard on AWD (the heat pump is AWD-only per the 2023 feature sheet)", "https://www.hyundainews.com/assets/documents/original/56232-2024IONIQ5Features062623.pdf"),
      batteryPreconditioning: f5(true, "mfr", "high", "\"Battery preconditioning function\" standard on all models per the 2023 spec sheet", "https://www.hyundainews.com/assets/documents/original/50313-2023IONIQ5ProductSpecifications20220630.pdf"),
    },
    warranty: {
      batteryYears: f(10, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(70, "mfr"),
      batteryTransfers: f(true, "mfr", "high", "HV battery & EV system coverage transfers in full — confirmed in Hyundai's 2026 Owner's Handbook §6"),
      powertrainTransfers: f(false, "mfr", "high", "Powertrain 10yr/100k is original-owner-only; drops to 5yr/60k for a second owner"),
      extendedCoverage: f("ICCU: 15 years / 180,000 miles (extended April 2026, up from 10/100)", "mfr"),
    },
  },
  {
    id: "ioniq5-2024-awd",
    make: "HYUNDAI",
    model: "Ioniq 5",
    modelYears: [2024, 2024],
    drive: "AWD",
    battery: { packGrossKwh: f(77.4, "mfr", "medium", "Long-range pack; Hyundai publishes one figure and does not say gross or usable") },
    range: { epaRangeMi: f6(260, "mfr", "high", "Official EPA rating, 'Ioniq 5 Long range AWD' — EPA vehicle id 46962 (down from 266 in 2023)", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("CCS1", "mfr", "high", "Pre-facelift cars are CCS1; the native NACS port arrives with the MY2025 facelift"),
      superchargerAccess: f5("adapter", "mfr", "high", "Hyundai's March 2025 program opened US Superchargers to CCS-port cars via a NACS adapter. The free adapter was one per vehicle for owners who bought on or before 31 Jan 2025 — it does not automatically follow the car", "https://www.hyundainews.com/releases/4339"),
      dcPeakKw: f5(235, "tested", "medium", "Hyundai publishes no vehicle peak — its sheets say only \"10–80% in 18 min\" on a >250 kW 800V charger. Instrumented sessions on the 77.4 kWh pack peak at ~233–236 kW (InsideEVs; EV Pulse)", "https://insideevs.com/news/503522/hyundai-ioniq5-fast-charging-analysis/"),
      architectureV: f5(800, "mfr", "high", "697V-nominal long-range pack; 800V/350 kW ultra-fast charger standard per the model-year spec sheets", "https://www.hyundainews.com/assets/documents/original/56233-2024IONIQ5Specs062623.pdf"),
    },
    thermal: {
      heatPump: f5("standard", "mfr", "high", "Standard on AWD (the heat pump is AWD-only per the 2024 feature sheet)", "https://www.hyundainews.com/assets/documents/original/56232-2024IONIQ5Features062623.pdf"),
      batteryPreconditioning: f5(true, "mfr", "high", "\"Battery preconditioning function\" standard on all models per the 2024 spec sheet", "https://www.hyundainews.com/assets/documents/original/56233-2024IONIQ5Specs062623.pdf"),
    },
    warranty: {
      batteryYears: f(10, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(70, "mfr"),
      batteryTransfers: f(true, "mfr", "high", "HV battery & EV system coverage transfers in full — confirmed in Hyundai's 2026 Owner's Handbook §6"),
      powertrainTransfers: f(false, "mfr", "high", "Powertrain 10yr/100k is original-owner-only; drops to 5yr/60k for a second owner"),
      extendedCoverage: f("ICCU: 15 years / 180,000 miles (extended April 2026, up from 10/100)", "mfr"),
    },
  },

  // ── Ioniq 5 MY2025–26 — the facelift: native NACS, 63/84 kWh packs,
  // US-built (HMGMA). MY2026 is officially a carry-over, and the EPA's 2026
  // records repeat the 2025 figures exactly (verified 2026-08-14). AWD splits
  // by wheel size: 19" (SE/SEL) 290, 20" (Limited) 269, XRT 259. Identical
  // MY2027 EPA records already exist, but no 2027 Hyundai sheet — do not widen
  // these rows until one is published.
  {
    id: "ioniq5-2025-2026-sr",
    make: "HYUNDAI",
    model: "Ioniq 5",
    modelYears: [2025, 2026],
    trim: "Standard Range",
    drive: "RWD",
    battery: { packGrossKwh: f6(63.0, "mfr", "medium", "Standard Range pack, up from 58; Hyundai publishes one figure and does not say gross or usable", "https://www.hyundainews.com/assets/documents/original/64493-2025IONIQ5SpecsFeatures121124.pdf") },
    range: { epaRangeMi: f6(245, "mfr", "high", "Official EPA rating, 'Ioniq 5 Standard range' — EPA vehicle ids 48714 (2025) / 49961 (2026)", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f5("NACS", "mfr", "high", "Native NACS from the MY2025 facelift; 2025 cars shipped with a CCS adapter included", "https://www.hyundainews.com/assets/documents/original/63444-2025IONIQ5XRTLimited8272024finalmjab.pdf"),
      superchargerAccess: f5("native", "mfr"),
      architectureV: f5(800, "mfr", "high", "523V-nominal Standard Range pack; 800V/350 kW ultra-fast charger standard per the 2025 spec sheet", "https://www.hyundainews.com/assets/documents/original/64493-2025IONIQ5SpecsFeatures121124.pdf"),
    },
    thermal: {
      heatPump: f5("none", "mfr", "high", "Heat pump is AWD-only per the 2025 feature sheet; every Standard Range car is RWD", "https://www.hyundainews.com/assets/documents/original/64493-2025IONIQ5SpecsFeatures121124.pdf"),
      batteryPreconditioning: f5(true, "mfr", "high", "\"Battery preconditioning function\" standard on all models per the 2025 spec sheet", "https://www.hyundainews.com/assets/documents/original/64493-2025IONIQ5SpecsFeatures121124.pdf"),
    },
    warranty: {
      batteryYears: f(10, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(70, "mfr"),
      batteryTransfers: f(true, "mfr", "high", "HV battery & EV system coverage transfers in full — confirmed in Hyundai's 2026 Owner's Handbook §6"),
      powertrainTransfers: f(false, "mfr", "high", "Powertrain 10yr/100k is original-owner-only; drops to 5yr/60k for a second owner"),
      // Deliberately NO ICCU extendedCoverage on facelift rows: the recalls and
      // the April 2026 15yr/180k extension are documented for 2022–24 cars only.
    },
    buyerNotes: [
      {
        headline: "HV battery bus-bar recall: NHTSA 25V482 / 26V068",
        severity: "warning",
        resolvedBy: "campaign_check",
      },
    ],
  },
  {
    id: "ioniq5-2025-2026-rwd",
    make: "HYUNDAI",
    model: "Ioniq 5",
    modelYears: [2025, 2026],
    drive: "RWD",
    battery: { packGrossKwh: f5(84.0, "mfr", "medium", "Long-range pack, up from 77.4; Hyundai publishes one figure and does not say gross or usable", "https://www.hyundainews.com/assets/documents/original/64493-2025IONIQ5SpecsFeatures121124.pdf") },
    range: { epaRangeMi: f6(318, "mfr", "high", "Official EPA rating, 'Ioniq 5 RWD' — EPA vehicle ids 48713 (2025) / 49960 (2026); one rating covers all long-range RWD trims", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f5("NACS", "mfr", "high", "Native NACS from the MY2025 facelift; 2025 cars shipped with a CCS adapter included", "https://www.hyundainews.com/assets/documents/original/63444-2025IONIQ5XRTLimited8272024finalmjab.pdf"),
      superchargerAccess: f5("native", "mfr"),
      dcPeakKw: f5(257, "tested", "medium", "Hyundai publishes no vehicle peak. Instrumented curves on the 84 kWh pack peak at ~257–260 kW on 800V hardware — only reachable via the CCS adapter, not on today's 400V Superchargers"),
      architectureV: f5(800, "mfr", "high", "697V-nominal long-range pack; 800V/350 kW ultra-fast charger standard per the 2025 spec sheet", "https://www.hyundainews.com/assets/documents/original/64493-2025IONIQ5SpecsFeatures121124.pdf"),
    },
    thermal: {
      heatPump: f5("none", "mfr", "high", "The facelift did not make the heat pump standard: AWD-only per the 2025 feature sheet — RWD cars have none", "https://www.hyundainews.com/assets/documents/original/64493-2025IONIQ5SpecsFeatures121124.pdf"),
      batteryPreconditioning: f5(true, "mfr", "high", "\"Battery preconditioning function\" standard on all models per the 2025 spec sheet", "https://www.hyundainews.com/assets/documents/original/64493-2025IONIQ5SpecsFeatures121124.pdf"),
    },
    warranty: {
      batteryYears: f(10, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(70, "mfr"),
      batteryTransfers: f(true, "mfr", "high", "HV battery & EV system coverage transfers in full — confirmed in Hyundai's 2026 Owner's Handbook §6"),
      powertrainTransfers: f(false, "mfr", "high", "Powertrain 10yr/100k is original-owner-only; drops to 5yr/60k for a second owner"),
    },
    buyerNotes: [
      {
        headline: "HV battery bus-bar recall: NHTSA 25V482 / 26V068",
        severity: "warning",
        resolvedBy: "campaign_check",
      },
      {
        headline: "10–80%: 30 min on Superchargers (400V), 20 min on 350 kW CCS via adapter",
        severity: "info",
      },
    ],
  },
  {
    id: "ioniq5-2025-2026-awd",
    make: "HYUNDAI",
    model: "Ioniq 5",
    modelYears: [2025, 2026],
    drive: "AWD",
    battery: { packGrossKwh: f5(84.0, "mfr", "medium", "Long-range pack, up from 77.4; Hyundai publishes one figure and does not say gross or usable", "https://www.hyundainews.com/assets/documents/original/64493-2025IONIQ5SpecsFeatures121124.pdf") },
    range: { epaRangeMi: f6(290, "mfr", "high", "Official EPA rating, 'Ioniq 5 AWD (19 inch Wheels)' (SE/SEL) — EPA vehicle ids 48710 (2025) / 49962 (2026). Limited (20\") is rated 269 and XRT 259 — separate rows", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f5("NACS", "mfr", "high", "Native NACS from the MY2025 facelift; 2025 cars shipped with a CCS adapter included", "https://www.hyundainews.com/assets/documents/original/63444-2025IONIQ5XRTLimited8272024finalmjab.pdf"),
      superchargerAccess: f5("native", "mfr"),
      dcPeakKw: f5(257, "tested", "medium", "Hyundai publishes no vehicle peak. Instrumented curves on the 84 kWh pack peak at ~257–260 kW on 800V hardware — only reachable via the CCS adapter, not on today's 400V Superchargers"),
      architectureV: f5(800, "mfr", "high", "697V-nominal long-range pack; 800V/350 kW ultra-fast charger standard per the 2025 spec sheet", "https://www.hyundainews.com/assets/documents/original/64493-2025IONIQ5SpecsFeatures121124.pdf"),
    },
    thermal: {
      heatPump: f5("standard", "mfr", "high", "Standard on AWD (the heat pump is AWD-only per the 2025 feature sheet)", "https://www.hyundainews.com/assets/documents/original/64493-2025IONIQ5SpecsFeatures121124.pdf"),
      batteryPreconditioning: f5(true, "mfr", "high", "\"Battery preconditioning function\" standard on all models per the 2025 spec sheet", "https://www.hyundainews.com/assets/documents/original/64493-2025IONIQ5SpecsFeatures121124.pdf"),
    },
    warranty: {
      batteryYears: f(10, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(70, "mfr"),
      batteryTransfers: f(true, "mfr", "high", "HV battery & EV system coverage transfers in full — confirmed in Hyundai's 2026 Owner's Handbook §6"),
      powertrainTransfers: f(false, "mfr", "high", "Powertrain 10yr/100k is original-owner-only; drops to 5yr/60k for a second owner"),
    },
    buyerNotes: [
      {
        headline: "HV battery bus-bar recall: NHTSA 25V482 / 26V068",
        severity: "warning",
        resolvedBy: "campaign_check",
      },
      {
        headline: "10–80%: 30 min on Superchargers (400V), 20 min on 350 kW CCS via adapter",
        severity: "info",
      },
    ],
  },
  {
    id: "ioniq5-2025-2026-awd-limited",
    make: "HYUNDAI",
    model: "Ioniq 5",
    modelYears: [2025, 2026],
    trim: "Limited",
    drive: "AWD",
    battery: { packGrossKwh: f5(84.0, "mfr", "medium", "Long-range pack, up from 77.4; Hyundai publishes one figure and does not say gross or usable", "https://www.hyundainews.com/assets/documents/original/64493-2025IONIQ5SpecsFeatures121124.pdf") },
    range: { epaRangeMi: f6(269, "mfr", "high", "Official EPA rating, 'Ioniq 5 AWD (20 inch Wheels)' — the Limited AWD's wheels — EPA vehicle ids 48711 (2025) / 49963 (2026)", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f5("NACS", "mfr", "high", "Native NACS from the MY2025 facelift; 2025 cars shipped with a CCS adapter included", "https://www.hyundainews.com/assets/documents/original/63444-2025IONIQ5XRTLimited8272024finalmjab.pdf"),
      superchargerAccess: f5("native", "mfr"),
      dcPeakKw: f5(257, "tested", "medium", "Hyundai publishes no vehicle peak. Instrumented curves on the 84 kWh pack peak at ~257–260 kW on 800V hardware — only reachable via the CCS adapter, not on today's 400V Superchargers"),
      architectureV: f5(800, "mfr", "high", "697V-nominal long-range pack; 800V/350 kW ultra-fast charger standard per the 2025 spec sheet", "https://www.hyundainews.com/assets/documents/original/64493-2025IONIQ5SpecsFeatures121124.pdf"),
    },
    thermal: {
      heatPump: f5("standard", "mfr", "high", "Standard on AWD (the heat pump is AWD-only per the 2025 feature sheet)", "https://www.hyundainews.com/assets/documents/original/64493-2025IONIQ5SpecsFeatures121124.pdf"),
      batteryPreconditioning: f5(true, "mfr", "high", "\"Battery preconditioning function\" standard on all models per the 2025 spec sheet", "https://www.hyundainews.com/assets/documents/original/64493-2025IONIQ5SpecsFeatures121124.pdf"),
    },
    warranty: {
      batteryYears: f(10, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(70, "mfr"),
      batteryTransfers: f(true, "mfr", "high", "HV battery & EV system coverage transfers in full — confirmed in Hyundai's 2026 Owner's Handbook §6"),
      powertrainTransfers: f(false, "mfr", "high", "Powertrain 10yr/100k is original-owner-only; drops to 5yr/60k for a second owner"),
    },
    buyerNotes: [
      {
        headline: "HV battery bus-bar recall: NHTSA 25V482 / 26V068",
        severity: "warning",
        resolvedBy: "campaign_check",
      },
      {
        headline: "10–80%: 30 min on Superchargers (400V), 20 min on 350 kW CCS via adapter",
        severity: "info",
      },
    ],
  },
  {
    id: "ioniq5-2025-2026-xrt",
    make: "HYUNDAI",
    model: "Ioniq 5",
    modelYears: [2025, 2026],
    trim: "XRT",
    drive: "AWD",
    battery: { packGrossKwh: f5(84.0, "mfr", "medium", "Long-range pack, up from 77.4; Hyundai publishes one figure and does not say gross or usable", "https://www.hyundainews.com/assets/documents/original/64493-2025IONIQ5SpecsFeatures121124.pdf") },
    range: { epaRangeMi: f6(259, "mfr", "high", "Official EPA rating, 'Ioniq 5 AWD XRT' — EPA vehicle ids 48712 (2025) / 49964 (2026)", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f5("NACS", "mfr", "high", "Native NACS from the MY2025 facelift; 2025 cars shipped with a CCS adapter included", "https://www.hyundainews.com/assets/documents/original/63444-2025IONIQ5XRTLimited8272024finalmjab.pdf"),
      superchargerAccess: f5("native", "mfr"),
      dcPeakKw: f5(257, "tested", "medium", "Hyundai publishes no vehicle peak. Instrumented curves on the 84 kWh pack peak at ~257–260 kW on 800V hardware — only reachable via the CCS adapter, not on today's 400V Superchargers"),
      architectureV: f5(800, "mfr", "high", "697V-nominal long-range pack; 800V/350 kW ultra-fast charger standard per the 2025 spec sheet", "https://www.hyundainews.com/assets/documents/original/64493-2025IONIQ5SpecsFeatures121124.pdf"),
    },
    thermal: {
      heatPump: f5("standard", "mfr", "high", "XRT is an AWD-only trim, and the heat pump is standard on AWD per the 2025 feature sheet", "https://www.hyundainews.com/assets/documents/original/64493-2025IONIQ5SpecsFeatures121124.pdf"),
      batteryPreconditioning: f5(true, "mfr", "high", "\"Battery preconditioning function\" standard on all models per the 2025 spec sheet", "https://www.hyundainews.com/assets/documents/original/64493-2025IONIQ5SpecsFeatures121124.pdf"),
    },
    warranty: {
      batteryYears: f(10, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(70, "mfr"),
      batteryTransfers: f(true, "mfr", "high", "HV battery & EV system coverage transfers in full — confirmed in Hyundai's 2026 Owner's Handbook §6"),
      powertrainTransfers: f(false, "mfr", "high", "Powertrain 10yr/100k is original-owner-only; drops to 5yr/60k for a second owner"),
    },
    buyerNotes: [
      {
        headline: "HV battery bus-bar recall: NHTSA 25V482 / 26V068",
        severity: "warning",
        resolvedBy: "campaign_check",
      },
      {
        headline: "10–80%: 30 min on Superchargers (400V), 20 min on 350 kW CCS via adapter",
        severity: "info",
      },
    ],
  },
  // Sparse on purpose: keyed by trim "N" so an Ioniq 5 N listed under the base
  // model name doesn't inherit the 290-mile AWD rating. Only facts verified in
  // this pass are present.
  {
    id: "ioniq5-n-2025-2026",
    make: "HYUNDAI",
    model: "Ioniq 5",
    modelYears: [2025, 2026],
    trim: "N",
    drive: "AWD",
    battery: { packGrossKwh: f6(84.0, "mfr", "medium", "Hyundai publishes one figure and does not say gross or usable") },
    range: { epaRangeMi: f6(221, "mfr", "high", "Official EPA rating, 'Ioniq 5 N' — EPA vehicle ids 48360 (2025) / 49965 (2026)", "https://www.fueleconomy.gov") },
    thermal: {
      heatPump: f5("standard", "mfr", "high", "The N feature sheet lists the heat pump as standard (\"S\")"),
    },
    warranty: {
      batteryYears: f(10, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(70, "mfr"),
      batteryTransfers: f(true, "mfr", "high", "HV battery & EV system coverage transfers in full — confirmed in Hyundai's 2026 Owner's Handbook §6"),
      powertrainTransfers: f(false, "mfr", "high", "Powertrain 10yr/100k is original-owner-only; drops to 5yr/60k for a second owner"),
    },
  },

  // ── Kia EV6 — the heat pump is a factory option, not a trim feature ──
  {
    id: "ev6-2022-2024",
    make: "KIA",
    model: "EV6",
    modelYears: [2022, 2024],
    charging: { portStandard: f("CCS1", "mfr") },
    thermal: {
      heatPump: f("optional", "mfr", "high", "Factory option: unavailable on Light, optional on Wind and GT-Line, standard only on GT"),
      heatPumpByTrim: { GT: "standard", LIGHT: "none" },
    },
    warranty: {
      batteryYears: f(10, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(70, "mfr"),
      batteryTransfers: f(true, "mfr", "high", "Kia manual: everything except the Power Train (Original Owner) warranty is fully transferable"),
      powertrainTransfers: f(false, "mfr"),
      extendedCoverage: f("ICCU: 15 years / 180,000 miles (extended April 2026, up from 10/100)", "mfr"),
    },
    buyerNotes: [
      {
        headline: "Heat pump: factory option — on the window sticker",
        severity: "trap",
        resolvedBy: "config_resolved",
      },
    ],
  },
];
