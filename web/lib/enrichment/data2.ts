import type { EnrichmentRow, Fact, Source } from "../types";

// Second research tranche (2026-08-10): 14 models researched by agents against
// primary sources; every EPA range spot-checked or drawn from fueleconomy.gov's
// API. Warranty facts from docs/WARRANTY-RESEARCH.md (verified booklet reads
// → "mfr"; secondary-source facts → "agg" until a primary doc is read).
const AS_OF = "2026-08-10";

function f<T>(
  value: T,
  source: Source,
  confidence: Fact<T>["confidence"] = "high",
  note?: string,
  sourceUrl?: string
): Fact<T> {
  return { value, source, asOf: AS_OF, confidence, note, sourceUrl };
}

export const RESEARCH_ROWS: EnrichmentRow[] = [
  {
    id: "id4-2021-pro-rwd",
    make: "VOLKSWAGEN",
    model: "ID.4",
    modelYears: [2021, 2021],
    trim: "Pro",
    drive: "RWD",
    battery: { packUsableKwh: f(77, "mfr", "medium", "82 gross / 77 usable"), chemistry: f("NMC", "agg", "medium") },
    range: { epaRangeMi: f(260, "mfr", "high", "2021 Pro RWD; 1st Edition/Pro S: 250 — EPA", "https://www.fueleconomy.gov"), testedRangeMi: f(234, "tested", "high", "70-mph (InsideEVs, First Edition RWD): 234 mi; 75-mph (C&D): 190; Edmunds loop: 287–288") },
    charging: {
      portStandard: f("CCS1", "mfr"),
      superchargerAccess: f("adapter", "mfr", "high", "VW-approved NACS adapter ($200), access opened Nov 2025"),
      dcPeakKw: f(170, "agg", "medium"),
    },
    thermal: { heatPump: f("none", "agg", "medium", "No US ID.4 has a heat pump in any year/trim") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(70, "mfr", "high", "Repairs restore to ≥70%, not to as-new (verified MY2025 booklet; earlier years reported same)"),
      batteryTransfers: f(true, "mfr", "high", "“Automatically transferred without cost” — VW EV warranty booklet"),
    },
    buyerNotes: [
      {
        headline: "No US ID.4 has a heat pump",
        body: "All US ID.4 model years and trims use a resistive cabin heater; the heat pump offered in Europe was never available here.",
        severity: "warning",
      },
      {
        headline: "Battery and door-handle recalls — check this VIN's campaign status",
        body: "2023–25 Chattanooga-built cars: HV battery cell-module recalls (25V-836, 26V-028, 26V-030) with module replacement as remedy and an interim 80% charge cap with DC fast charging disabled. All years: door-handle water-intrusion recall (24V-651, doors can open while driving). A repaired car is fine — an unrepaired one is materially worse until fixed.",
        severity: "trap",
      },
      {
        headline: "Rental or rideshare history permanently voids the HV warranty",
        body: "VW's booklet: commercial use voids the high-voltage system warranty, and “if a commercial vehicle is sold to a subsequent retail owner, this warranty still does not apply.”",
        severity: "warning",
      },
    ],
  },

  {
    id: "id4-2021-pro-awd",
    make: "VOLKSWAGEN",
    model: "ID.4",
    modelYears: [2021, 2021],
    trim: "Pro",
    drive: "AWD",
    battery: { packUsableKwh: f(77, "mfr", "medium", "82 gross / 77 usable"), chemistry: f("NMC", "agg", "medium") },
    range: { epaRangeMi: f(249, "mfr", "high", "2021 Pro AWD; Pro S AWD: 240 — EPA", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("CCS1", "mfr"),
      superchargerAccess: f("adapter", "mfr", "high", "VW-approved NACS adapter ($200), access opened Nov 2025"),
      dcPeakKw: f(170, "agg", "medium"),
    },
    thermal: { heatPump: f("none", "agg", "medium", "No US ID.4 has a heat pump in any year/trim") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(70, "mfr", "high", "Repairs restore to ≥70%, not to as-new (verified MY2025 booklet; earlier years reported same)"),
      batteryTransfers: f(true, "mfr", "high", "“Automatically transferred without cost” — VW EV warranty booklet"),
    },
    buyerNotes: [
      {
        headline: "No US ID.4 has a heat pump",
        body: "All US ID.4 model years and trims use a resistive cabin heater; the heat pump offered in Europe was never available here.",
        severity: "warning",
      },
      {
        headline: "Battery and door-handle recalls — check this VIN's campaign status",
        body: "2023–25 Chattanooga-built cars: HV battery cell-module recalls (25V-836, 26V-028, 26V-030) with module replacement as remedy and an interim 80% charge cap with DC fast charging disabled. All years: door-handle water-intrusion recall (24V-651, doors can open while driving). A repaired car is fine — an unrepaired one is materially worse until fixed.",
        severity: "trap",
      },
      {
        headline: "Rental or rideshare history permanently voids the HV warranty",
        body: "VW's booklet: commercial use voids the high-voltage system warranty, and “if a commercial vehicle is sold to a subsequent retail owner, this warranty still does not apply.”",
        severity: "warning",
      },
    ],
  },

  {
    id: "id4-2022-pro-rwd",
    make: "VOLKSWAGEN",
    model: "ID.4",
    modelYears: [2022, 2022],
    trim: "Pro",
    drive: "RWD",
    battery: { packUsableKwh: f(77, "mfr", "medium", "82 gross / 77 usable"), chemistry: f("NMC", "agg", "medium") },
    range: { epaRangeMi: f(275, "mfr", "high", "2022 Pro RWD; Pro S: 262 — EPA", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("CCS1", "mfr"),
      superchargerAccess: f("adapter", "mfr", "high", "VW-approved NACS adapter ($200), access opened Nov 2025"),
      dcPeakKw: f(170, "agg", "medium"),
    },
    thermal: { heatPump: f("none", "agg", "medium", "No US ID.4 has a heat pump in any year/trim") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(70, "mfr", "high", "Repairs restore to ≥70%, not to as-new (verified MY2025 booklet; earlier years reported same)"),
      batteryTransfers: f(true, "mfr", "high", "“Automatically transferred without cost” — VW EV warranty booklet"),
    },
    buyerNotes: [
      {
        headline: "No US ID.4 has a heat pump",
        body: "All US ID.4 model years and trims use a resistive cabin heater; the heat pump offered in Europe was never available here.",
        severity: "warning",
      },
      {
        headline: "Battery and door-handle recalls — check this VIN's campaign status",
        body: "2023–25 Chattanooga-built cars: HV battery cell-module recalls (25V-836, 26V-028, 26V-030) with module replacement as remedy and an interim 80% charge cap with DC fast charging disabled. All years: door-handle water-intrusion recall (24V-651, doors can open while driving). A repaired car is fine — an unrepaired one is materially worse until fixed.",
        severity: "trap",
      },
      {
        headline: "Rental or rideshare history permanently voids the HV warranty",
        body: "VW's booklet: commercial use voids the high-voltage system warranty, and “if a commercial vehicle is sold to a subsequent retail owner, this warranty still does not apply.”",
        severity: "warning",
      },
    ],
  },

  {
    id: "id4-2022-pro-awd",
    make: "VOLKSWAGEN",
    model: "ID.4",
    modelYears: [2022, 2022],
    trim: "Pro",
    drive: "AWD",
    battery: { packUsableKwh: f(77, "mfr", "medium", "82 gross / 77 usable"), chemistry: f("NMC", "agg", "medium") },
    range: { epaRangeMi: f(251, "mfr", "high", "2022 Pro AWD; Pro S: 245 — EPA", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("CCS1", "mfr"),
      superchargerAccess: f("adapter", "mfr", "high", "VW-approved NACS adapter ($200), access opened Nov 2025"),
      dcPeakKw: f(170, "agg", "medium"),
    },
    thermal: { heatPump: f("none", "agg", "medium", "No US ID.4 has a heat pump in any year/trim") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(70, "mfr", "high", "Repairs restore to ≥70%, not to as-new (verified MY2025 booklet; earlier years reported same)"),
      batteryTransfers: f(true, "mfr", "high", "“Automatically transferred without cost” — VW EV warranty booklet"),
    },
    buyerNotes: [
      {
        headline: "No US ID.4 has a heat pump",
        body: "All US ID.4 model years and trims use a resistive cabin heater; the heat pump offered in Europe was never available here.",
        severity: "warning",
      },
      {
        headline: "Battery and door-handle recalls — check this VIN's campaign status",
        body: "2023–25 Chattanooga-built cars: HV battery cell-module recalls (25V-836, 26V-028, 26V-030) with module replacement as remedy and an interim 80% charge cap with DC fast charging disabled. All years: door-handle water-intrusion recall (24V-651, doors can open while driving). A repaired car is fine — an unrepaired one is materially worse until fixed.",
        severity: "trap",
      },
      {
        headline: "Rental or rideshare history permanently voids the HV warranty",
        body: "VW's booklet: commercial use voids the high-voltage system warranty, and “if a commercial vehicle is sold to a subsequent retail owner, this warranty still does not apply.”",
        severity: "warning",
      },
    ],
  },

  {
    id: "id4-2023-pro-rwd",
    make: "VOLKSWAGEN",
    model: "ID.4",
    modelYears: [2023, 2023],
    trim: "Pro",
    drive: "RWD",
    battery: { packUsableKwh: f(77, "mfr", "medium", "82 gross / 77 usable"), chemistry: f("NMC", "agg", "medium") },
    range: { epaRangeMi: f(275, "mfr", "high", "2023 Pro / Pro S RWD — EPA", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("CCS1", "mfr"),
      superchargerAccess: f("adapter", "mfr", "high", "VW-approved NACS adapter ($200), access opened Nov 2025"),
      dcPeakKw: f(170, "agg", "medium"),
    },
    thermal: { heatPump: f("none", "agg", "medium", "No US ID.4 has a heat pump in any year/trim") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(70, "mfr", "high", "Repairs restore to ≥70%, not to as-new (verified MY2025 booklet; earlier years reported same)"),
      batteryTransfers: f(true, "mfr", "high", "“Automatically transferred without cost” — VW EV warranty booklet"),
    },
    buyerNotes: [
      {
        headline: "No US ID.4 has a heat pump",
        body: "All US ID.4 model years and trims use a resistive cabin heater; the heat pump offered in Europe was never available here.",
        severity: "warning",
      },
      {
        headline: "Battery and door-handle recalls — check this VIN's campaign status",
        body: "2023–25 Chattanooga-built cars: HV battery cell-module recalls (25V-836, 26V-028, 26V-030) with module replacement as remedy and an interim 80% charge cap with DC fast charging disabled. All years: door-handle water-intrusion recall (24V-651, doors can open while driving). A repaired car is fine — an unrepaired one is materially worse until fixed.",
        severity: "trap",
      },
      {
        headline: "Rental or rideshare history permanently voids the HV warranty",
        body: "VW's booklet: commercial use voids the high-voltage system warranty, and “if a commercial vehicle is sold to a subsequent retail owner, this warranty still does not apply.”",
        severity: "warning",
      },
    ],
  },

  {
    id: "id4-2023-pro-awd",
    make: "VOLKSWAGEN",
    model: "ID.4",
    modelYears: [2023, 2023],
    trim: "Pro",
    drive: "AWD",
    battery: { packUsableKwh: f(77, "mfr", "medium", "82 gross / 77 usable"), chemistry: f("NMC", "agg", "medium") },
    range: { epaRangeMi: f(255, "mfr", "high", "2023 Pro / Pro S AWD — EPA", "https://www.fueleconomy.gov"), testedRangeMi: f(269, "tested", "medium", "Edmunds mixed loop, 2023 Pro S AWD: 269 mi (no steady-speed test found)") },
    charging: {
      portStandard: f("CCS1", "mfr"),
      superchargerAccess: f("adapter", "mfr", "high", "VW-approved NACS adapter ($200), access opened Nov 2025"),
      dcPeakKw: f(170, "agg", "medium"),
    },
    thermal: { heatPump: f("none", "agg", "medium", "No US ID.4 has a heat pump in any year/trim") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(70, "mfr", "high", "Repairs restore to ≥70%, not to as-new (verified MY2025 booklet; earlier years reported same)"),
      batteryTransfers: f(true, "mfr", "high", "“Automatically transferred without cost” — VW EV warranty booklet"),
    },
    buyerNotes: [
      {
        headline: "No US ID.4 has a heat pump",
        body: "All US ID.4 model years and trims use a resistive cabin heater; the heat pump offered in Europe was never available here.",
        severity: "warning",
      },
      {
        headline: "Battery and door-handle recalls — check this VIN's campaign status",
        body: "2023–25 Chattanooga-built cars: HV battery cell-module recalls (25V-836, 26V-028, 26V-030) with module replacement as remedy and an interim 80% charge cap with DC fast charging disabled. All years: door-handle water-intrusion recall (24V-651, doors can open while driving). A repaired car is fine — an unrepaired one is materially worse until fixed.",
        severity: "trap",
      },
      {
        headline: "Rental or rideshare history permanently voids the HV warranty",
        body: "VW's booklet: commercial use voids the high-voltage system warranty, and “if a commercial vehicle is sold to a subsequent retail owner, this warranty still does not apply.”",
        severity: "warning",
      },
    ],
  },

  {
    id: "id4-2024-pro-rwd",
    make: "VOLKSWAGEN",
    model: "ID.4",
    modelYears: [2024, 2024],
    trim: "Pro",
    drive: "RWD",
    battery: { packUsableKwh: f(77, "mfr", "medium", "82 gross / 77 usable"), chemistry: f("NMC", "agg", "medium") },
    range: { epaRangeMi: f(291, "mfr", "high", "2024 Pro / Pro S RWD — EPA", "https://www.fueleconomy.gov"), testedRangeMi: f(299, "tested", "medium", "Edmunds mixed loop, 2024 Pro S RWD: 299 mi") },
    charging: {
      portStandard: f("CCS1", "mfr"),
      superchargerAccess: f("adapter", "mfr", "high", "VW-approved NACS adapter ($200), access opened Nov 2025"),
      dcPeakKw: f(170, "agg", "medium"),
    },
    thermal: { heatPump: f("none", "agg", "medium", "No US ID.4 has a heat pump in any year/trim") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(70, "mfr", "high", "Repairs restore to ≥70%, not to as-new (verified MY2025 booklet; earlier years reported same)"),
      batteryTransfers: f(true, "mfr", "high", "“Automatically transferred without cost” — VW EV warranty booklet"),
    },
    buyerNotes: [
      {
        headline: "No US ID.4 has a heat pump",
        body: "All US ID.4 model years and trims use a resistive cabin heater; the heat pump offered in Europe was never available here.",
        severity: "warning",
      },
      {
        headline: "Battery and door-handle recalls — check this VIN's campaign status",
        body: "2023–25 Chattanooga-built cars: HV battery cell-module recalls (25V-836, 26V-028, 26V-030) with module replacement as remedy and an interim 80% charge cap with DC fast charging disabled. All years: door-handle water-intrusion recall (24V-651, doors can open while driving). A repaired car is fine — an unrepaired one is materially worse until fixed.",
        severity: "trap",
      },
      {
        headline: "Rental or rideshare history permanently voids the HV warranty",
        body: "VW's booklet: commercial use voids the high-voltage system warranty, and “if a commercial vehicle is sold to a subsequent retail owner, this warranty still does not apply.”",
        severity: "warning",
      },
    ],
  },

  {
    id: "id4-2024-pro-awd",
    make: "VOLKSWAGEN",
    model: "ID.4",
    modelYears: [2024, 2024],
    trim: "Pro",
    drive: "AWD",
    battery: { packUsableKwh: f(77, "mfr", "medium", "82 gross / 77 usable"), chemistry: f("NMC", "agg", "medium") },
    range: { epaRangeMi: f(263, "mfr", "high", "2024 Pro / Pro S AWD — EPA", "https://www.fueleconomy.gov"), testedRangeMi: f(240, "tested", "medium", "75-mph (Car and Driver), 2024 Pro S AWD: 240 mi") },
    charging: {
      portStandard: f("CCS1", "mfr"),
      superchargerAccess: f("adapter", "mfr", "high", "VW-approved NACS adapter ($200), access opened Nov 2025"),
      dcPeakKw: f(170, "agg", "medium"),
    },
    thermal: { heatPump: f("none", "agg", "medium", "No US ID.4 has a heat pump in any year/trim") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(70, "mfr", "high", "Repairs restore to ≥70%, not to as-new (verified MY2025 booklet; earlier years reported same)"),
      batteryTransfers: f(true, "mfr", "high", "“Automatically transferred without cost” — VW EV warranty booklet"),
    },
    buyerNotes: [
      {
        headline: "No US ID.4 has a heat pump",
        body: "All US ID.4 model years and trims use a resistive cabin heater; the heat pump offered in Europe was never available here.",
        severity: "warning",
      },
      {
        headline: "Battery and door-handle recalls — check this VIN's campaign status",
        body: "2023–25 Chattanooga-built cars: HV battery cell-module recalls (25V-836, 26V-028, 26V-030) with module replacement as remedy and an interim 80% charge cap with DC fast charging disabled. All years: door-handle water-intrusion recall (24V-651, doors can open while driving). A repaired car is fine — an unrepaired one is materially worse until fixed.",
        severity: "trap",
      },
      {
        headline: "Rental or rideshare history permanently voids the HV warranty",
        body: "VW's booklet: commercial use voids the high-voltage system warranty, and “if a commercial vehicle is sold to a subsequent retail owner, this warranty still does not apply.”",
        severity: "warning",
      },
    ],
  },

  {
    id: "id4-2023-standard",
    make: "VOLKSWAGEN",
    model: "ID.4",
    modelYears: [2023, 2023],
    trim: "Standard",
    battery: { packUsableKwh: f(58, "est", "medium", "62 gross / ~58 usable"), chemistry: f("NMC", "agg", "medium") },
    range: { epaRangeMi: f(209, "mfr", "high", "2023 Standard (62 kWh) — EPA", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("CCS1", "mfr"),
      superchargerAccess: f("adapter", "mfr", "high", "VW-approved NACS adapter ($200), access opened Nov 2025"),
      dcPeakKw: f(140, "agg", "medium"),
    },
    thermal: { heatPump: f("none", "agg", "medium", "No US ID.4 has a heat pump in any year/trim") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(70, "mfr", "high", "Repairs restore to ≥70%, not to as-new (verified MY2025 booklet; earlier years reported same)"),
      batteryTransfers: f(true, "mfr", "high", "“Automatically transferred without cost” — VW EV warranty booklet"),
    },
    buyerNotes: [
      {
        headline: "No US ID.4 has a heat pump",
        body: "All US ID.4 model years and trims use a resistive cabin heater; the heat pump offered in Europe was never available here.",
        severity: "warning",
      },
      {
        headline: "Battery and door-handle recalls — check this VIN's campaign status",
        body: "2023–25 Chattanooga-built cars: HV battery cell-module recalls (25V-836, 26V-028, 26V-030) with module replacement as remedy and an interim 80% charge cap with DC fast charging disabled. All years: door-handle water-intrusion recall (24V-651, doors can open while driving). A repaired car is fine — an unrepaired one is materially worse until fixed.",
        severity: "trap",
      },
      {
        headline: "Rental or rideshare history permanently voids the HV warranty",
        body: "VW's booklet: commercial use voids the high-voltage system warranty, and “if a commercial vehicle is sold to a subsequent retail owner, this warranty still does not apply.”",
        severity: "warning",
      },
    ],
  },

  {
    id: "id4-2023-s",
    make: "VOLKSWAGEN",
    model: "ID.4",
    modelYears: [2023, 2023],
    trim: "S",
    battery: { packUsableKwh: f(58, "est", "medium", "62 gross / ~58 usable"), chemistry: f("NMC", "agg", "medium") },
    range: { epaRangeMi: f(209, "mfr", "high", "2023 S (62 kWh) — EPA", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("CCS1", "mfr"),
      superchargerAccess: f("adapter", "mfr", "high", "VW-approved NACS adapter ($200), access opened Nov 2025"),
      dcPeakKw: f(140, "agg", "medium"),
    },
    thermal: { heatPump: f("none", "agg", "medium", "No US ID.4 has a heat pump in any year/trim") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(70, "mfr", "high", "Repairs restore to ≥70%, not to as-new (verified MY2025 booklet; earlier years reported same)"),
      batteryTransfers: f(true, "mfr", "high", "“Automatically transferred without cost” — VW EV warranty booklet"),
    },
    buyerNotes: [
      {
        headline: "No US ID.4 has a heat pump",
        body: "All US ID.4 model years and trims use a resistive cabin heater; the heat pump offered in Europe was never available here.",
        severity: "warning",
      },
      {
        headline: "Battery and door-handle recalls — check this VIN's campaign status",
        body: "2023–25 Chattanooga-built cars: HV battery cell-module recalls (25V-836, 26V-028, 26V-030) with module replacement as remedy and an interim 80% charge cap with DC fast charging disabled. All years: door-handle water-intrusion recall (24V-651, doors can open while driving). A repaired car is fine — an unrepaired one is materially worse until fixed.",
        severity: "trap",
      },
      {
        headline: "Rental or rideshare history permanently voids the HV warranty",
        body: "VW's booklet: commercial use voids the high-voltage system warranty, and “if a commercial vehicle is sold to a subsequent retail owner, this warranty still does not apply.”",
        severity: "warning",
      },
    ],
  },

  {
    id: "id4-2024-standard",
    make: "VOLKSWAGEN",
    model: "ID.4",
    modelYears: [2024, 2024],
    trim: "Standard",
    battery: { packUsableKwh: f(58, "est", "medium", "62 gross / ~58 usable"), chemistry: f("NMC", "agg", "medium") },
    range: { epaRangeMi: f(206, "mfr", "high", "2024 Standard (62 kWh) — EPA", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("CCS1", "mfr"),
      superchargerAccess: f("adapter", "mfr", "high", "VW-approved NACS adapter ($200), access opened Nov 2025"),
      dcPeakKw: f(140, "agg", "medium"),
    },
    thermal: { heatPump: f("none", "agg", "medium", "No US ID.4 has a heat pump in any year/trim") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(70, "mfr", "high", "Repairs restore to ≥70%, not to as-new (verified MY2025 booklet; earlier years reported same)"),
      batteryTransfers: f(true, "mfr", "high", "“Automatically transferred without cost” — VW EV warranty booklet"),
    },
    buyerNotes: [
      {
        headline: "No US ID.4 has a heat pump",
        body: "All US ID.4 model years and trims use a resistive cabin heater; the heat pump offered in Europe was never available here.",
        severity: "warning",
      },
      {
        headline: "Battery and door-handle recalls — check this VIN's campaign status",
        body: "2023–25 Chattanooga-built cars: HV battery cell-module recalls (25V-836, 26V-028, 26V-030) with module replacement as remedy and an interim 80% charge cap with DC fast charging disabled. All years: door-handle water-intrusion recall (24V-651, doors can open while driving). A repaired car is fine — an unrepaired one is materially worse until fixed.",
        severity: "trap",
      },
      {
        headline: "Rental or rideshare history permanently voids the HV warranty",
        body: "VW's booklet: commercial use voids the high-voltage system warranty, and “if a commercial vehicle is sold to a subsequent retail owner, this warranty still does not apply.”",
        severity: "warning",
      },
    ],
  },

  {
    id: "id4-2024-s",
    make: "VOLKSWAGEN",
    model: "ID.4",
    modelYears: [2024, 2024],
    trim: "S",
    battery: { packUsableKwh: f(58, "est", "medium", "62 gross / ~58 usable"), chemistry: f("NMC", "agg", "medium") },
    range: { epaRangeMi: f(206, "mfr", "high", "2024 S (62 kWh) — EPA", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("CCS1", "mfr"),
      superchargerAccess: f("adapter", "mfr", "high", "VW-approved NACS adapter ($200), access opened Nov 2025"),
      dcPeakKw: f(140, "agg", "medium"),
    },
    thermal: { heatPump: f("none", "agg", "medium", "No US ID.4 has a heat pump in any year/trim") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(70, "mfr", "high", "Repairs restore to ≥70%, not to as-new (verified MY2025 booklet; earlier years reported same)"),
      batteryTransfers: f(true, "mfr", "high", "“Automatically transferred without cost” — VW EV warranty booklet"),
    },
    buyerNotes: [
      {
        headline: "No US ID.4 has a heat pump",
        body: "All US ID.4 model years and trims use a resistive cabin heater; the heat pump offered in Europe was never available here.",
        severity: "warning",
      },
      {
        headline: "Battery and door-handle recalls — check this VIN's campaign status",
        body: "2023–25 Chattanooga-built cars: HV battery cell-module recalls (25V-836, 26V-028, 26V-030) with module replacement as remedy and an interim 80% charge cap with DC fast charging disabled. All years: door-handle water-intrusion recall (24V-651, doors can open while driving). A repaired car is fine — an unrepaired one is materially worse until fixed.",
        severity: "trap",
      },
      {
        headline: "Rental or rideshare history permanently voids the HV warranty",
        body: "VW's booklet: commercial use voids the high-voltage system warranty, and “if a commercial vehicle is sold to a subsequent retail owner, this warranty still does not apply.”",
        severity: "warning",
      },
    ],
  },

  {
    id: "leaf-s",
    make: "NISSAN",
    model: "Leaf",
    modelYears: [2018, 2025],
    trim: "S",
    battery: { packGrossKwh: f(40, "mfr", "medium", "40 kWh gross"), chemistry: f("NMC", "agg", "medium") },
    range: { epaRangeMi: f(149, "mfr", "high", "2018: 151; 2019: 150; 2020–25: 149 — EPA", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("CHAdeMO", "mfr", "high", "AC charging is standard J1772"),
      superchargerAccess: f("none", "mfr", "high", "No CHAdeMO→NACS adapter exists"),
      dcPeakKw: f(50, "agg", "medium"),
    },
    thermal: { heatPump: f("none", "agg", "medium", "Base S uses a resistive heater; the hybrid-heater (heat pump) was not offered on S") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      batteryTransfers: f(true, "mfr", "high", "“Original and subsequent owner(s)” — voided only if exported within 6 months of first sale"),
      extendedCoverage: f("Capacity warranty: below 9 of 12 gauge bars (Nissan states no percentage)", "mfr", "high", "2018+ 62/40 kWh: 8yr/100k; 2014-era: 5yr/60k"),
    },
    buyerNotes: [
      {
        headline: "Air-cooled battery; CHAdeMO fast-charge port",
        body: "The Leaf's battery is passively air-cooled (no liquid thermal management). Repeated DC fast-charge sessions trigger thermal throttling. The DC port is CHAdeMO, which no US network is expanding, and no CHAdeMO-to-NACS adapter exists. The in-car 12-bar gauge shows battery capacity; the capacity warranty triggers below 9 bars. Recalls 24V-700 (2019–20) and 25V-655 (2021–22): quick-charge fire risk, with owners instructed not to DC fast-charge until the software remedy is applied.",
        severity: "warning",
      },
    ],
  },

  {
    id: "leaf-sv",
    make: "NISSAN",
    model: "Leaf",
    modelYears: [2018, 2022],
    trim: "SV",
    battery: { packGrossKwh: f(40, "mfr", "medium", "40 kWh gross"), chemistry: f("NMC", "agg", "medium") },
    range: { epaRangeMi: f(149, "mfr", "high", "2018: 151; 2019: 150; 2020–22: 149 — EPA", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("CHAdeMO", "mfr", "high", "AC charging is standard J1772"),
      superchargerAccess: f("none", "mfr", "high", "No CHAdeMO→NACS adapter exists"),
      dcPeakKw: f(50, "agg", "medium"),
    },
    thermal: { heatPump: f("standard", "agg", "medium", "Hybrid heater (heat pump + PTC) on SV/SL trims") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      batteryTransfers: f(true, "mfr", "high", "“Original and subsequent owner(s)” — voided only if exported within 6 months of first sale"),
      extendedCoverage: f("Capacity warranty: below 9 of 12 gauge bars (Nissan states no percentage)", "mfr", "high", "2018+ 62/40 kWh: 8yr/100k; 2014-era: 5yr/60k"),
    },
    buyerNotes: [
      {
        headline: "Air-cooled battery; CHAdeMO fast-charge port",
        body: "The Leaf's battery is passively air-cooled (no liquid thermal management). Repeated DC fast-charge sessions trigger thermal throttling. The DC port is CHAdeMO, which no US network is expanding, and no CHAdeMO-to-NACS adapter exists. The in-car 12-bar gauge shows battery capacity; the capacity warranty triggers below 9 bars. Recalls 24V-700 (2019–20) and 25V-655 (2021–22): quick-charge fire risk, with owners instructed not to DC fast-charge until the software remedy is applied.",
        severity: "warning",
      },
    ],
  },

  {
    id: "leaf-sl",
    make: "NISSAN",
    model: "Leaf",
    modelYears: [2018, 2019],
    trim: "SL",
    battery: { packGrossKwh: f(40, "mfr", "medium", "40 kWh gross"), chemistry: f("NMC", "agg", "medium") },
    range: { epaRangeMi: f(150, "mfr", "high", "2018: 151; 2019: 150 — EPA", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("CHAdeMO", "mfr", "high", "AC charging is standard J1772"),
      superchargerAccess: f("none", "mfr", "high", "No CHAdeMO→NACS adapter exists"),
      dcPeakKw: f(50, "agg", "medium"),
    },
    thermal: { heatPump: f("standard", "agg", "medium", "Hybrid heater (heat pump + PTC) on SV/SL trims") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      batteryTransfers: f(true, "mfr", "high", "“Original and subsequent owner(s)” — voided only if exported within 6 months of first sale"),
      extendedCoverage: f("Capacity warranty: below 9 of 12 gauge bars (Nissan states no percentage)", "mfr", "high", "2018+ 62/40 kWh: 8yr/100k; 2014-era: 5yr/60k"),
    },
    buyerNotes: [
      {
        headline: "Air-cooled battery; CHAdeMO fast-charge port",
        body: "The Leaf's battery is passively air-cooled (no liquid thermal management). Repeated DC fast-charge sessions trigger thermal throttling. The DC port is CHAdeMO, which no US network is expanding, and no CHAdeMO-to-NACS adapter exists. The in-car 12-bar gauge shows battery capacity; the capacity warranty triggers below 9 bars. Recalls 24V-700 (2019–20) and 25V-655 (2021–22): quick-charge fire risk, with owners instructed not to DC fast-charge until the software remedy is applied.",
        severity: "warning",
      },
    ],
  },

  {
    id: "leaf-s-plus",
    make: "NISSAN",
    model: "Leaf",
    modelYears: [2019, 2022],
    trim: "S Plus",
    battery: { packGrossKwh: f(62, "mfr", "medium", "62 kWh gross"), chemistry: f("NMC", "agg", "medium") },
    range: { epaRangeMi: f(226, "mfr", "high", "EPA figure, all years", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("CHAdeMO", "mfr", "high", "AC charging is standard J1772"),
      superchargerAccess: f("none", "mfr", "high", "No CHAdeMO→NACS adapter exists"),
      dcPeakKw: f(100, "agg", "medium"),
    },
    thermal: { heatPump: f("none", "agg", "medium", "Base S Plus uses a resistive heater") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      batteryTransfers: f(true, "mfr", "high", "“Original and subsequent owner(s)” — voided only if exported within 6 months of first sale"),
      extendedCoverage: f("Capacity warranty: below 9 of 12 gauge bars (Nissan states no percentage)", "mfr", "high", "2018+ 62/40 kWh: 8yr/100k; 2014-era: 5yr/60k"),
    },
    buyerNotes: [
      {
        headline: "Air-cooled battery; CHAdeMO fast-charge port",
        body: "The Leaf's battery is passively air-cooled (no liquid thermal management). Repeated DC fast-charge sessions trigger thermal throttling. The DC port is CHAdeMO, which no US network is expanding, and no CHAdeMO-to-NACS adapter exists. The in-car 12-bar gauge shows battery capacity; the capacity warranty triggers below 9 bars. Recalls 24V-700 (2019–20) and 25V-655 (2021–22): quick-charge fire risk, with owners instructed not to DC fast-charge until the software remedy is applied.",
        severity: "warning",
      },
    ],
  },

  {
    id: "leaf-sv-plus",
    make: "NISSAN",
    model: "Leaf",
    modelYears: [2019, 2025],
    trim: "SV Plus",
    battery: { packGrossKwh: f(62, "est", "medium", "62 kWh gross (2023–25: ~60)"), chemistry: f("NMC", "agg", "medium") },
    range: { epaRangeMi: f(215, "mfr", "high", "2019–22: 215; 2023–25: 212 — EPA", "https://www.fueleconomy.gov"), testedRangeMi: f(190, "tested", "medium", "70-mph test of the same-pack 2020 SL Plus (InsideEVs): 190 mi") },
    charging: {
      portStandard: f("CHAdeMO", "mfr", "high", "AC charging is standard J1772"),
      superchargerAccess: f("none", "mfr", "high", "No CHAdeMO→NACS adapter exists"),
      dcPeakKw: f(100, "agg", "medium"),
    },
    thermal: { heatPump: f("standard", "agg", "medium", "Hybrid heater on SV/SL Plus") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      batteryTransfers: f(true, "mfr", "high", "“Original and subsequent owner(s)” — voided only if exported within 6 months of first sale"),
      extendedCoverage: f("Capacity warranty: below 9 of 12 gauge bars (Nissan states no percentage)", "mfr", "high", "2018+ 62/40 kWh: 8yr/100k; 2014-era: 5yr/60k"),
    },
    buyerNotes: [
      {
        headline: "Air-cooled battery; CHAdeMO fast-charge port",
        body: "The Leaf's battery is passively air-cooled (no liquid thermal management). Repeated DC fast-charge sessions trigger thermal throttling. The DC port is CHAdeMO, which no US network is expanding, and no CHAdeMO-to-NACS adapter exists. The in-car 12-bar gauge shows battery capacity; the capacity warranty triggers below 9 bars. Recalls 24V-700 (2019–20) and 25V-655 (2021–22): quick-charge fire risk, with owners instructed not to DC fast-charge until the software remedy is applied.",
        severity: "warning",
      },
    ],
  },

  {
    id: "leaf-sl-plus",
    make: "NISSAN",
    model: "Leaf",
    modelYears: [2019, 2022],
    trim: "SL Plus",
    battery: { packGrossKwh: f(62, "mfr", "medium", "62 kWh gross"), chemistry: f("NMC", "agg", "medium") },
    range: { epaRangeMi: f(215, "mfr", "high", "EPA figure", "https://www.fueleconomy.gov"), testedRangeMi: f(190, "tested", "high", "70-mph test (InsideEVs, 2020 SL Plus): 190 mi") },
    charging: {
      portStandard: f("CHAdeMO", "mfr", "high", "AC charging is standard J1772"),
      superchargerAccess: f("none", "mfr", "high", "No CHAdeMO→NACS adapter exists"),
      dcPeakKw: f(100, "agg", "medium"),
    },
    thermal: { heatPump: f("standard", "agg", "medium", "Hybrid heater on SV/SL Plus") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      batteryTransfers: f(true, "mfr", "high", "“Original and subsequent owner(s)” — voided only if exported within 6 months of first sale"),
      extendedCoverage: f("Capacity warranty: below 9 of 12 gauge bars (Nissan states no percentage)", "mfr", "high", "2018+ 62/40 kWh: 8yr/100k; 2014-era: 5yr/60k"),
    },
    buyerNotes: [
      {
        headline: "Air-cooled battery; CHAdeMO fast-charge port",
        body: "The Leaf's battery is passively air-cooled (no liquid thermal management). Repeated DC fast-charge sessions trigger thermal throttling. The DC port is CHAdeMO, which no US network is expanding, and no CHAdeMO-to-NACS adapter exists. The in-car 12-bar gauge shows battery capacity; the capacity warranty triggers below 9 bars. Recalls 24V-700 (2019–20) and 25V-655 (2021–22): quick-charge fire risk, with owners instructed not to DC fast-charge until the software remedy is applied.",
        severity: "warning",
      },
    ],
  },

  {
    id: "ariya-engage-fwd",
    make: "NISSAN",
    model: "Ariya",
    modelYears: [2023, 2025],
    trim: "Engage",
    drive: "FWD",
    battery: { packUsableKwh: f(63, "mfr", "medium", "63 kWh usable (Nissan-quoted); Engage+ is the 87 kWh pack"), chemistry: f("NMC", "agg", "medium") },
    range: { epaRangeMi: f(216, "mfr", "high", "Engage FWD (63 kWh) — EPA", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("CCS1", "mfr"),
      superchargerAccess: f("adapter", "mfr", "high", "Nissan OEM NACS adapter (part T99F9-5MP1B), early 2025"),
      dcPeakKw: f(130, "agg", "medium"),
    },
    thermal: { heatPump: f("standard", "agg", "medium", "Reported standard on all US trims") },
    warranty: { batteryYears: f(8, "agg", "medium"), batteryMiles: f(100_000, "agg", "medium") },
    buyerNotes: [
      {
        headline: "2023 build-year recalls — confirm completion",
        body: "2023-only: steering-wheel bolt (23V-131), inverter software that can shut down the EV system while driving (23V-657 + 24V-560), front-motor O-rings (24V-391). All have free fixes; check this VIN's status.",
        severity: "warning",
      },
    ],
  },

  {
    id: "ariya-engage-awd",
    make: "NISSAN",
    model: "Ariya",
    modelYears: [2023, 2025],
    trim: "Engage",
    drive: "AWD",
    battery: { packUsableKwh: f(63, "mfr", "medium", "63 kWh usable; Engage+ e-4ORCE (87 kWh): 272 mi"), chemistry: f("NMC", "agg", "medium") },
    range: { epaRangeMi: f(205, "mfr", "high", "Engage e-4ORCE (63 kWh) — EPA; Engage+ e-4ORCE: 272", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("CCS1", "mfr"),
      superchargerAccess: f("adapter", "mfr", "high", "Nissan OEM NACS adapter (part T99F9-5MP1B), early 2025"),
      dcPeakKw: f(130, "agg", "medium"),
    },
    thermal: { heatPump: f("standard", "agg", "medium", "Reported standard on all US trims") },
    warranty: { batteryYears: f(8, "agg", "medium"), batteryMiles: f(100_000, "agg", "medium") },
    buyerNotes: [
      {
        headline: "2023 build-year recalls — confirm completion",
        body: "2023-only: steering-wheel bolt (23V-131), inverter software that can shut down the EV system while driving (23V-657 + 24V-560), front-motor O-rings (24V-391). All have free fixes; check this VIN's status.",
        severity: "warning",
      },
    ],
  },

  {
    id: "ariya-87-fwd",
    make: "NISSAN",
    model: "Ariya",
    modelYears: [2023, 2025],
    drive: "FWD",
    battery: { packUsableKwh: f(87, "mfr", "medium", "87 kWh usable (Nissan-quoted)"), chemistry: f("NMC", "agg", "medium") },
    range: { epaRangeMi: f(289, "mfr", "high", "Evolve+/Empower+ FWD: 289; Venture+ (2023–24): 304 — EPA", "https://www.fueleconomy.gov"), testedRangeMi: f(240, "tested", "medium", "75-mph (Car and Driver, Empower+ FWD): 240 mi") },
    charging: {
      portStandard: f("CCS1", "mfr"),
      superchargerAccess: f("adapter", "mfr", "high", "Nissan OEM NACS adapter (part T99F9-5MP1B), early 2025"),
      dcPeakKw: f(130, "agg", "medium"),
    },
    thermal: { heatPump: f("standard", "agg", "medium", "Reported standard on all US trims") },
    warranty: { batteryYears: f(8, "agg", "medium"), batteryMiles: f(100_000, "agg", "medium") },
    buyerNotes: [
      {
        headline: "2023 build-year recalls — confirm completion",
        body: "2023-only: steering-wheel bolt (23V-131), inverter software that can shut down the EV system while driving (23V-657 + 24V-560), front-motor O-rings (24V-391). All have free fixes; check this VIN's status.",
        severity: "warning",
      },
    ],
  },

  {
    id: "ariya-87-awd",
    make: "NISSAN",
    model: "Ariya",
    modelYears: [2023, 2025],
    drive: "AWD",
    battery: { packUsableKwh: f(87, "mfr", "medium", "87 kWh usable (Nissan-quoted)"), chemistry: f("NMC", "agg", "medium") },
    range: { epaRangeMi: f(267, "mfr", "high", "e-4ORCE 87 kWh: Engage+/Evolve+ 272; Platinum+ 257–267 by wheels — EPA", "https://www.fueleconomy.gov"), testedRangeMi: f(250, "tested", "high", "70-mph (InsideEVs, 2025 Platinum+ e-4ORCE 20-inch): 250 mi; 75-mph (C&D): 210; Edmunds loop: 265") },
    charging: {
      portStandard: f("CCS1", "mfr"),
      superchargerAccess: f("adapter", "mfr", "high", "Nissan OEM NACS adapter (part T99F9-5MP1B), early 2025"),
      dcPeakKw: f(130, "agg", "medium"),
    },
    thermal: { heatPump: f("standard", "agg", "medium", "Reported standard on all US trims") },
    warranty: { batteryYears: f(8, "agg", "medium"), batteryMiles: f(100_000, "agg", "medium") },
    buyerNotes: [
      {
        headline: "2023 build-year recalls — confirm completion",
        body: "2023-only: steering-wheel bolt (23V-131), inverter software that can shut down the EV system while driving (23V-657 + 24V-560), front-motor O-rings (24V-391). All have free fixes; check this VIN's status.",
        severity: "warning",
      },
    ],
  },

  {
    id: "bz4x-2023-fwd",
    make: "TOYOTA",
    model: "bZ4X",
    modelYears: [2023, 2023],
    drive: "FWD",
    battery: { packGrossKwh: f(71.4, "est", "medium", "FWD 71.4 (Panasonic) / AWD 72.8 (CATL) gross; usable ~64 est"), chemistry: f("NMC", "agg", "medium") },
    range: { epaRangeMi: f(252, "mfr", "high", "2023 XLE FWD; Limited: 242 — EPA", "https://www.fueleconomy.gov"), testedRangeMi: f(227, "tested", "medium", "Edmunds mixed loop, 2023 Limited FWD: 227 mi (one of few EVs to miss EPA on that loop)") },
    charging: {
      portStandard: f("CCS1", "mfr", "high", "Free OEM NACS adapter program for MY23–25"),
      superchargerAccess: f("adapter", "mfr"),
      dcPeakKw: f(150, "agg", "medium"),
    },
    thermal: { heatPump: f("standard", "mfr", "high", "Toyota pressroom: heat pump for heating and A/C, all trims") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(70, "mfr", "high", "“Below 70% of original capacity” covered; ≤30% loss “considered normal”"),
      batteryTransfers: f(true, "mfr", "high", "“Warranty coverage is automatically transferred at no cost to subsequent vehicle owners”"),
    },
    buyerNotes: [
      {
        headline: "Launch recall: wheels could detach — and early software gimped charging",
        body: "The 2022 launch stop-sale (22V-444) was for wheel hub bolts loosening to the point of wheel detachment; verify the remedy on any 2023. Early software also refused DC fast charging below 32°F on AWD cars and limited sessions — confirm software is current. AWD's 100 kW charging cap is permanent.",
        severity: "warning",
      },
    ],
  },

  {
    id: "bz4x-2024-fwd",
    make: "TOYOTA",
    model: "bZ4X",
    modelYears: [2024, 2025],
    drive: "FWD",
    battery: { packGrossKwh: f(71.4, "est", "medium", "FWD 71.4 (Panasonic) / AWD 72.8 (CATL) gross; usable ~64 est"), chemistry: f("NMC", "agg", "medium") },
    range: { epaRangeMi: f(236, "mfr", "high", "XLE/Limited FWD — EPA", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("CCS1", "mfr", "high", "Free OEM NACS adapter program for MY23–25"),
      superchargerAccess: f("adapter", "mfr"),
      dcPeakKw: f(150, "agg", "medium"),
    },
    thermal: { heatPump: f("standard", "mfr", "high", "Toyota pressroom: heat pump for heating and A/C, all trims") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(70, "mfr", "high", "“Below 70% of original capacity” covered; ≤30% loss “considered normal”"),
      batteryTransfers: f(true, "mfr", "high", "“Warranty coverage is automatically transferred at no cost to subsequent vehicle owners”"),
    },
    buyerNotes: [
      {
        headline: "Launch recall: wheels could detach — and early software gimped charging",
        body: "The 2022 launch stop-sale (22V-444) was for wheel hub bolts loosening to the point of wheel detachment; verify the remedy on any 2023. Early software also refused DC fast charging below 32°F on AWD cars and limited sessions — confirm software is current. AWD's 100 kW charging cap is permanent.",
        severity: "warning",
      },
    ],
  },

  {
    id: "bz4x-2023-awd",
    make: "TOYOTA",
    model: "bZ4X",
    modelYears: [2023, 2025],
    drive: "AWD",
    battery: { packGrossKwh: f(71.4, "est", "medium", "FWD 71.4 (Panasonic) / AWD 72.8 (CATL) gross; usable ~64 est"), chemistry: f("NMC", "agg", "medium") },
    range: { epaRangeMi: f(228, "mfr", "high", "XLE AWD; Limited/20-inch: 222 — EPA", "https://www.fueleconomy.gov"), testedRangeMi: f(160, "tested", "high", "75-mph (Car and Driver, 2023 Limited AWD): 160 mi") },
    charging: {
      portStandard: f("CCS1", "mfr", "high", "Free OEM NACS adapter program for MY23–25"),
      superchargerAccess: f("adapter", "mfr"),
      dcPeakKw: f(100, "agg", "medium"),
    },
    thermal: { heatPump: f("standard", "mfr", "high", "Toyota pressroom: heat pump for heating and A/C, all trims") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(70, "mfr", "high", "“Below 70% of original capacity” covered; ≤30% loss “considered normal”"),
      batteryTransfers: f(true, "mfr", "high", "“Warranty coverage is automatically transferred at no cost to subsequent vehicle owners”"),
    },
    buyerNotes: [
      {
        headline: "Launch recall: wheels could detach — and early software gimped charging",
        body: "The 2022 launch stop-sale (22V-444) was for wheel hub bolts loosening to the point of wheel detachment; verify the remedy on any 2023. Early software also refused DC fast charging below 32°F on AWD cars and limited sessions — confirm software is current. AWD's 100 kW charging cap is permanent.",
        severity: "warning",
      },
    ],
  },

  {
    id: "lyriq-2023-rwd",
    make: "CADILLAC",
    model: "Lyriq",
    modelYears: [2023, 2024],
    drive: "RWD",
    battery: { packGrossKwh: f(102, "mfr", "medium", "GM quotes 102 kWh; usable split unpublished"), chemistry: f("NMC", "agg", "medium") },
    range: { epaRangeMi: f(312, "mfr", "high", "2023: 312; 2024: 314 — EPA", "https://www.fueleconomy.gov"), testedRangeMi: f(330, "tested", "high", "70-mph (InsideEVs, 2023 RWD): 330 mi; 75-mph (C&D): 270; Edmunds loop (2024): 319") },
    charging: {
      portStandard: f("CCS1", "agg", "high"),
      superchargerAccess: f("adapter", "agg", "high", "GM $225 NACS adapter"),
      dcPeakKw: f(190, "agg", "medium"),
    },
    thermal: { heatPump: f("standard", "agg", "medium", "Ultium Energy Recovery") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(75, "mfr", "high", "“Below 75% of its original value” — GM EV booklets (extracted text)"),
      batteryTransfers: f(true, "mfr", "high", "“Transferable at no cost” — GM EV booklets"),
    },
    buyerNotes: [
      {
        headline: "Early cars: blank-display recalls and infotainment growing pains",
        body: "2023–24: driver display can go blank while driving (22V-710, 25V-356 — software fixes), plus 23V-367 (HV battery pack connections, 2023) and 24V-589 (AWD ABS activation). All free fixes — check completion on this VIN. Early 2023 software was rough; later updates substantially improved it.",
        severity: "warning",
      },
    ],
  },

  {
    id: "lyriq-2025-rwd",
    make: "CADILLAC",
    model: "Lyriq",
    modelYears: [2025, 2026],
    drive: "RWD",
    battery: { packGrossKwh: f(102, "mfr", "medium", "GM quotes 102 kWh; usable split unpublished"), chemistry: f("NMC", "agg", "medium") },
    range: { epaRangeMi: f(326, "mfr", "high", "EPA figure (11 kW and 19.2 kW chargers)", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("CCS1", "agg", "high"),
      superchargerAccess: f("adapter", "agg", "high", "GM $225 NACS adapter"),
      dcPeakKw: f(190, "agg", "medium"),
    },
    thermal: { heatPump: f("standard", "agg", "medium", "Ultium Energy Recovery") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(75, "mfr", "high", "“Below 75% of its original value” — GM EV booklets (extracted text)"),
      batteryTransfers: f(true, "mfr", "high", "“Transferable at no cost” — GM EV booklets"),
    },
    buyerNotes: [
      {
        headline: "Early cars: blank-display recalls and infotainment growing pains",
        body: "2023–24: driver display can go blank while driving (22V-710, 25V-356 — software fixes), plus 23V-367 (HV battery pack connections, 2023) and 24V-589 (AWD ABS activation). All free fixes — check completion on this VIN. Early 2023 software was rough; later updates substantially improved it.",
        severity: "warning",
      },
    ],
  },

  {
    id: "lyriq-2023-awd",
    make: "CADILLAC",
    model: "Lyriq",
    modelYears: [2023, 2024],
    drive: "AWD",
    battery: { packGrossKwh: f(102, "mfr", "medium", "GM quotes 102 kWh; usable split unpublished"), chemistry: f("NMC", "agg", "medium") },
    range: { epaRangeMi: f(307, "mfr", "high", "EPA figure", "https://www.fueleconomy.gov"), testedRangeMi: f(220, "tested", "medium", "75-mph (Car and Driver): 220 mi") },
    charging: {
      portStandard: f("CCS1", "agg", "high"),
      superchargerAccess: f("adapter", "agg", "high", "GM $225 NACS adapter"),
      dcPeakKw: f(190, "agg", "medium"),
    },
    thermal: { heatPump: f("standard", "agg", "medium", "Ultium Energy Recovery") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(75, "mfr", "high", "“Below 75% of its original value” — GM EV booklets (extracted text)"),
      batteryTransfers: f(true, "mfr", "high", "“Transferable at no cost” — GM EV booklets"),
    },
    buyerNotes: [
      {
        headline: "Early cars: blank-display recalls and infotainment growing pains",
        body: "2023–24: driver display can go blank while driving (22V-710, 25V-356 — software fixes), plus 23V-367 (HV battery pack connections, 2023) and 24V-589 (AWD ABS activation). All free fixes — check completion on this VIN. Early 2023 software was rough; later updates substantially improved it.",
        severity: "warning",
      },
    ],
  },

  {
    id: "lyriq-2025-awd",
    make: "CADILLAC",
    model: "Lyriq",
    modelYears: [2025, 2026],
    drive: "AWD",
    battery: { packGrossKwh: f(102, "mfr", "medium", "GM quotes 102 kWh; usable split unpublished"), chemistry: f("NMC", "agg", "medium") },
    range: { epaRangeMi: f(303, "mfr", "high", "303 (19.2 kW charger) / 319 (11 kW, 2025 PAWD); 2026 V-Series: 285 — EPA", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("CCS1", "agg", "high"),
      superchargerAccess: f("adapter", "agg", "high", "GM $225 NACS adapter"),
      dcPeakKw: f(190, "agg", "medium"),
    },
    thermal: { heatPump: f("standard", "agg", "medium", "Ultium Energy Recovery") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(75, "mfr", "high", "“Below 75% of its original value” — GM EV booklets (extracted text)"),
      batteryTransfers: f(true, "mfr", "high", "“Transferable at no cost” — GM EV booklets"),
    },
    buyerNotes: [
      {
        headline: "Early cars: blank-display recalls and infotainment growing pains",
        body: "2023–24: driver display can go blank while driving (22V-710, 25V-356 — software fixes), plus 23V-367 (HV battery pack connections, 2023) and 24V-589 (AWD ABS activation). All free fixes — check completion on this VIN. Early 2023 software was rough; later updates substantially improved it.",
        severity: "warning",
      },
    ],
  },

  {
    id: "prologue-2024-fwd",
    make: "HONDA",
    model: "Prologue",
    modelYears: [2024, 2024],
    drive: "FWD",
    battery: { packGrossKwh: f(85, "mfr", "medium", "85 kWh (GM Ultium pack); split unpublished"), chemistry: f("NMC", "agg", "medium") },
    range: { epaRangeMi: f(296, "mfr", "high", "EPA figure", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("CCS1", "mfr"),
      superchargerAccess: f("adapter", "mfr", "high", "Honda-approved NACS adapter, mid-2025"),
      dcPeakKw: f(155, "agg", "medium"),
    },
    thermal: { heatPump: f("standard", "agg", "medium", "Ultium Energy Recovery") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(75, "mfr", "high", "“Replaced/repaired if the capacity falls below 75% of its original value” — Honda BEV Warranty Basebook"),
      batteryTransfers: f(true, "mfr", "high", "No owner restriction in Honda's BEV booklet (only the rust warranty is original-owner-only)"),
    },
    buyerNotes: [
      {
        headline: "Two recalls on 2024 cars",
        body: "24V-540 (front lower control arm, shared with Blazer EV) and 26V-112 (instrument display failure, software). Free fixes; check completion.",
        severity: "info",
      },
    ],
  },

  {
    id: "prologue-2025-fwd",
    make: "HONDA",
    model: "Prologue",
    // 2026 carries the same 308-mi FWD rating (EPA id 50208) — window extended
    // in the 2026-08-14 pass.
    modelYears: [2025, 2026],
    drive: "FWD",
    battery: { packGrossKwh: f(85, "mfr", "medium", "85 kWh (GM Ultium pack); split unpublished"), chemistry: f("NMC", "agg", "medium") },
    range: { epaRangeMi: f(308, "mfr", "high", "EPA figure", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("CCS1", "mfr"),
      superchargerAccess: f("adapter", "mfr", "high", "Honda-approved NACS adapter, mid-2025"),
      dcPeakKw: f(155, "agg", "medium"),
    },
    thermal: { heatPump: f("standard", "agg", "medium", "Ultium Energy Recovery") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(75, "mfr", "high", "“Replaced/repaired if the capacity falls below 75% of its original value” — Honda BEV Warranty Basebook"),
      batteryTransfers: f(true, "mfr", "high", "No owner restriction in Honda's BEV booklet (only the rust warranty is original-owner-only)"),
    },
    buyerNotes: [
      {
        headline: "Two recalls on 2024 cars",
        body: "24V-540 (front lower control arm, shared with Blazer EV) and 26V-112 (instrument display failure, software). Free fixes; check completion.",
        severity: "info",
      },
    ],
  },

  {
    id: "prologue-2024-awd",
    make: "HONDA",
    model: "Prologue",
    modelYears: [2024, 2024],
    drive: "AWD",
    battery: { packGrossKwh: f(85, "mfr", "medium", "85 kWh (GM Ultium pack); split unpublished"), chemistry: f("NMC", "agg", "medium") },
    range: { epaRangeMi: f(281, "mfr", "high", "Touring AWD 281; Elite 273 — EPA", "https://www.fueleconomy.gov"), testedRangeMi: f(240, "tested", "medium", "75-mph (Car and Driver, Elite AWD): 240 mi; Edmunds mixed loop: 320") },
    charging: {
      portStandard: f("CCS1", "mfr"),
      superchargerAccess: f("adapter", "mfr", "high", "Honda-approved NACS adapter, mid-2025"),
      dcPeakKw: f(155, "agg", "medium"),
    },
    thermal: { heatPump: f("standard", "agg", "medium", "Ultium Energy Recovery") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(75, "mfr", "high", "“Replaced/repaired if the capacity falls below 75% of its original value” — Honda BEV Warranty Basebook"),
      batteryTransfers: f(true, "mfr", "high", "No owner restriction in Honda's BEV booklet (only the rust warranty is original-owner-only)"),
    },
    buyerNotes: [
      {
        headline: "Two recalls on 2024 cars",
        body: "24V-540 (front lower control arm, shared with Blazer EV) and 26V-112 (instrument display failure, software). Free fixes; check completion.",
        severity: "info",
      },
    ],
  },

  {
    id: "prologue-2025-awd",
    make: "HONDA",
    model: "Prologue",
    // 2026 carries the same AWD ratings. EPA certifies the Elite separately
    // (283 mi, heavier wheels) — that trim's row lives in data4.ts; this row
    // is the 294-mi rating for the other AWD trims.
    modelYears: [2025, 2026],
    drive: "AWD",
    battery: { packGrossKwh: f(85, "mfr", "medium", "85 kWh (GM Ultium pack); split unpublished"), chemistry: f("NMC", "agg", "medium") },
    range: { epaRangeMi: f(294, "mfr", "high", "Touring AWD 294; Elite 283 — EPA", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("CCS1", "mfr"),
      superchargerAccess: f("adapter", "mfr", "high", "Honda-approved NACS adapter, mid-2025"),
      dcPeakKw: f(155, "agg", "medium"),
    },
    thermal: { heatPump: f("standard", "agg", "medium", "Ultium Energy Recovery") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(75, "mfr", "high", "“Replaced/repaired if the capacity falls below 75% of its original value” — Honda BEV Warranty Basebook"),
      batteryTransfers: f(true, "mfr", "high", "No owner restriction in Honda's BEV booklet (only the rust warranty is original-owner-only)"),
    },
    buyerNotes: [
      {
        headline: "Two recalls on 2024 cars",
        body: "24V-540 (front lower control arm, shared with Blazer EV) and 26V-112 (instrument display failure, software). Free fixes; check completion.",
        severity: "info",
      },
    ],
  },

  {
    id: "equinox-fwd",
    make: "CHEVROLET",
    model: "Equinox EV",
    modelYears: [2024, 2026],
    drive: "FWD",
    battery: { packGrossKwh: f(85, "mfr", "medium", "GM-quoted 85 kWh; split unpublished"), chemistry: f("NMC", "agg", "medium") },
    range: { epaRangeMi: f(319, "mfr", "high", "All years — EPA", "https://www.fueleconomy.gov"), testedRangeMi: f(303, "tested", "high", "70-mph (InsideEVs, 2024 2RS FWD): 303 mi; 75-mph (C&D): 260; Edmunds loop (2025): 356") },
    charging: {
      portStandard: f("CCS1", "agg", "high"),
      superchargerAccess: f("adapter", "agg", "high", "GM $225 NACS adapter"),
      dcPeakKw: f(150, "agg", "medium"),
    },
    thermal: { heatPump: f("standard", "agg", "medium", "Ultium Energy Recovery") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(75, "mfr", "high", "“Below 75% of its original value” — GM EV booklets (extracted text)"),
      batteryTransfers: f(true, "mfr", "high", "“Transferable at no cost” — GM EV booklets"),
    },
    buyerNotes: [
      {
        headline: "No Apple CarPlay or Android Auto",
        body: "GM's current EVs use built-in Google software and do not support phone projection on any trim.",
        severity: "info",
      },
    ],
  },

  {
    id: "equinox-awd",
    make: "CHEVROLET",
    model: "Equinox EV",
    modelYears: [2024, 2026],
    drive: "AWD",
    battery: { packGrossKwh: f(85, "mfr", "medium", "GM-quoted 85 kWh; split unpublished"), chemistry: f("NMC", "agg", "medium") },
    range: { epaRangeMi: f(297, "mfr", "high", "2024: 285; 2025–26: 307 (288 with 19.2 kW charger) — EPA", "https://www.fueleconomy.gov"), testedRangeMi: f(260, "tested", "low", "75-mph (Car and Driver): 260 mi — reported secondhand") },
    charging: {
      portStandard: f("CCS1", "agg", "high"),
      superchargerAccess: f("adapter", "agg", "high", "GM $225 NACS adapter"),
      dcPeakKw: f(150, "agg", "medium"),
    },
    thermal: { heatPump: f("standard", "agg", "medium", "Ultium Energy Recovery") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(75, "mfr", "high", "“Below 75% of its original value” — GM EV booklets (extracted text)"),
      batteryTransfers: f(true, "mfr", "high", "“Transferable at no cost” — GM EV booklets"),
    },
    buyerNotes: [
      {
        headline: "No Apple CarPlay or Android Auto",
        body: "GM's current EVs use built-in Google software and do not support phone projection on any trim.",
        severity: "info",
      },
    ],
  },

  {
    id: "blazer-fwd",
    make: "CHEVROLET",
    model: "Blazer EV",
    modelYears: [2025, 2026],
    drive: "FWD",
    battery: { packGrossKwh: f(85, "mfr", "medium", "85 kWh (FWD/AWD)"), chemistry: f("NMC", "agg", "medium") },
    range: { epaRangeMi: f(312, "mfr", "high", "312; 283 with 22-inch wheels — EPA", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("CCS1", "agg", "high"),
      superchargerAccess: f("adapter", "agg", "high", "GM $225 NACS adapter"),
      dcPeakKw: f(150, "agg", "medium"),
    },
    thermal: { heatPump: f("standard", "agg", "medium", "Ultium Energy Recovery") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(75, "mfr", "high", "“Below 75% of its original value” — GM EV booklets (extracted text)"),
      batteryTransfers: f(true, "mfr", "high", "“Transferable at no cost” — GM EV booklets"),
    },
    buyerNotes: [
      {
        headline: "Early 2024s shipped with rough software — a stop-sale rough",
        body: "GM halted Blazer EV sales in Dec 2023 over software faults (frozen displays, DC-charging failures); the remedy was a service-campaign software update, not an NHTSA recall — confirm it was applied to early-VIN 2024 cars. NHTSA recalls: 24V-487 (front lower control arm), 25V-433/26V-031 (parking-brake harness). No Apple CarPlay or Android Auto on any trim.",
        severity: "warning",
      },
    ],
  },

  {
    id: "blazer-awd",
    make: "CHEVROLET",
    model: "Blazer EV",
    modelYears: [2024, 2026],
    drive: "AWD",
    battery: { packGrossKwh: f(85, "mfr", "medium", "85 kWh (FWD/AWD)"), chemistry: f("NMC", "agg", "medium") },
    range: { epaRangeMi: f(283, "mfr", "high", "2024: 279; 2025–26: 283 — EPA", "https://www.fueleconomy.gov"), testedRangeMi: f(200, "tested", "high", "75-mph (Car and Driver, 2024 RS AWD): 200 mi vs 279 EPA; Edmunds mixed loop: 320") },
    charging: {
      portStandard: f("CCS1", "agg", "high"),
      superchargerAccess: f("adapter", "agg", "high", "GM $225 NACS adapter"),
      dcPeakKw: f(150, "agg", "medium"),
    },
    thermal: { heatPump: f("standard", "agg", "medium", "Ultium Energy Recovery") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(75, "mfr", "high", "“Below 75% of its original value” — GM EV booklets (extracted text)"),
      batteryTransfers: f(true, "mfr", "high", "“Transferable at no cost” — GM EV booklets"),
    },
    buyerNotes: [
      {
        headline: "Early 2024s shipped with rough software — a stop-sale rough",
        body: "GM halted Blazer EV sales in Dec 2023 over software faults (frozen displays, DC-charging failures); the remedy was a service-campaign software update, not an NHTSA recall — confirm it was applied to early-VIN 2024 cars. NHTSA recalls: 24V-487 (front lower control arm), 25V-433/26V-031 (parking-brake harness). No Apple CarPlay or Android Auto on any trim.",
        severity: "warning",
      },
    ],
  },

  {
    id: "blazer-rwd",
    make: "CHEVROLET",
    model: "Blazer EV",
    modelYears: [2024, 2025],
    drive: "RWD",
    battery: { packGrossKwh: f(102, "mfr", "medium", "102 kWh (RWD/SS)"), chemistry: f("NMC", "agg", "medium") },
    range: { epaRangeMi: f(334, "mfr", "high", "2024: 324; 2025: 334 — EPA", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("CCS1", "agg", "high"),
      superchargerAccess: f("adapter", "agg", "high", "GM $225 NACS adapter"),
      dcPeakKw: f(190, "agg", "medium"),
    },
    thermal: { heatPump: f("standard", "agg", "medium", "Ultium Energy Recovery") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(75, "mfr", "high", "“Below 75% of its original value” — GM EV booklets (extracted text)"),
      batteryTransfers: f(true, "mfr", "high", "“Transferable at no cost” — GM EV booklets"),
    },
    buyerNotes: [
      {
        headline: "Early 2024s shipped with rough software — a stop-sale rough",
        body: "GM halted Blazer EV sales in Dec 2023 over software faults (frozen displays, DC-charging failures); the remedy was a service-campaign software update, not an NHTSA recall — confirm it was applied to early-VIN 2024 cars. NHTSA recalls: 24V-487 (front lower control arm), 25V-433/26V-031 (parking-brake harness). No Apple CarPlay or Android Auto on any trim.",
        severity: "warning",
      },
    ],
  },

  {
    id: "blazer-ss",
    make: "CHEVROLET",
    model: "Blazer EV",
    modelYears: [2025, 2026],
    trim: "SS",
    drive: "AWD",
    battery: { packGrossKwh: f(102, "mfr", "medium", "102 kWh (RWD/SS)"), chemistry: f("NMC", "agg", "medium") },
    range: { epaRangeMi: f(303, "mfr", "high", "2025: 303; 2026: 302 — EPA", "https://www.fueleconomy.gov"), testedRangeMi: f(250, "tested", "high", "75-mph (Car and Driver, 2025 SS): 250 mi") },
    charging: {
      portStandard: f("CCS1", "agg", "high"),
      superchargerAccess: f("adapter", "agg", "high", "GM $225 NACS adapter"),
      dcPeakKw: f(190, "agg", "medium"),
    },
    thermal: { heatPump: f("standard", "agg", "medium", "Ultium Energy Recovery") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(75, "mfr", "high", "“Below 75% of its original value” — GM EV booklets (extracted text)"),
      batteryTransfers: f(true, "mfr", "high", "“Transferable at no cost” — GM EV booklets"),
    },
    buyerNotes: [
      {
        headline: "Early 2024s shipped with rough software — a stop-sale rough",
        body: "GM halted Blazer EV sales in Dec 2023 over software faults (frozen displays, DC-charging failures); the remedy was a service-campaign software update, not an NHTSA recall — confirm it was applied to early-VIN 2024 cars. NHTSA recalls: 24V-487 (front lower control arm), 25V-433/26V-031 (parking-brake harness). No Apple CarPlay or Android Auto on any trim.",
        severity: "warning",
      },
    ],
  },

  {
    id: "hummer-ev-pickup",
    make: "GMC",
    model: "Hummer EV",
    modelYears: [2022, 2025],
    battery: { packGrossKwh: f(205, "est", "medium", "~205 kWh usable est (213.7 gross reported); smaller 2M20 variants from 2024, capacity unpublished"), chemistry: f("NMC", "agg", "medium") },
    range: { epaRangeMi: f(314, "mfr", "high", "2024–25: 298–318 by config/tires — EPA. 2022–23: no EPA rating exists (GM est. 329)", "https://www.fueleconomy.gov"), testedRangeMi: f(343, "tested", "high", "70-mph (InsideEVs, 2022 Edition 1): 343 mi — beat its 329 GM estimate; 75-mph (C&D): 290") },
    charging: {
      portStandard: f("CCS1", "agg", "high"),
      superchargerAccess: f("adapter", "agg", "high", "GM $225 NACS adapter"),
      dcPeakKw: f(350, "agg", "medium"),
    },
    thermal: { heatPump: f("standard", "agg", "medium", "Ultium Energy Recovery") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(75, "mfr", "high", "“Below 75% of its original value” — GM EV booklets (extracted text)"),
      batteryTransfers: f(true, "mfr", "high", "“Transferable at no cost” — GM EV booklets"),
    },
    buyerNotes: [
      {
        headline: "2022–23 trucks have no EPA range rating",
        body: "2022–23 Hummer EVs exceed the GVWR class the EPA rates, so any range figure quoted for them is GM's estimate (Edition 1: 329 mi), not an EPA rating. Curb weight ~9,000 lb; EPA efficiency (2024+, rated trucks): 47–53 MPGe. Recalls: 22V-771 (water intrusion in the HV battery enclosure, 2022–23 pickups) and 23V-367 (HV battery pack connections).",
        severity: "info",
      },
    ],
  },

  {
    id: "hummer-ev-suv",
    make: "GMC",
    model: "Hummer EV SUV",
    modelYears: [2024, 2025],
    battery: { packGrossKwh: f(205, "est", "medium", "~205 kWh usable est; smaller-pack variants unpublished"), chemistry: f("NMC", "agg", "medium") },
    range: { epaRangeMi: f(312, "mfr", "high", "312–315 (282–289 with MT tires) — EPA", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("CCS1", "agg", "high"),
      superchargerAccess: f("adapter", "agg", "high", "GM $225 NACS adapter"),
      dcPeakKw: f(350, "agg", "medium"),
    },
    thermal: { heatPump: f("standard", "agg", "medium", "Ultium Energy Recovery") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(75, "mfr", "high", "“Below 75% of its original value” — GM EV booklets (extracted text)"),
      batteryTransfers: f(true, "mfr", "high", "“Transferable at no cost” — GM EV booklets"),
    },
    buyerNotes: [
      {
        headline: "2022–23 trucks have no EPA range rating",
        body: "2022–23 Hummer EVs exceed the GVWR class the EPA rates, so any range figure quoted for them is GM's estimate (Edition 1: 329 mi), not an EPA rating. Curb weight ~9,000 lb; EPA efficiency (2024+, rated trucks): 47–53 MPGe. Recalls: 22V-771 (water intrusion in the HV battery enclosure, 2022–23 pickups) and 23V-367 (HV battery pack connections).",
        severity: "info",
      },
    ],
  },

  {
    id: "subaru-solterra-2023-25",
    make: "SUBARU",
    model: "Solterra",
    modelYears: [2023, 2025],
    battery: {
      packGrossKwh: f(72.8, "mfr", "high", "CATL pack shared with bZ4X AWD; usable ~64 est"),
      chemistry: f("NMC", "agg", "medium"),
    },
    range: { epaRangeMi: f(227, "mfr", "high", "222–228 by year/trim (AWD only) — EPA figures", "https://www.fueleconomy.gov"), testedRangeMi: f(200, "tested", "low", "75-mph (Car and Driver): 200 mi — reported secondhand; no verified instrumented test found") },
    charging: {
      portStandard: f("CCS1", "mfr"),
      superchargerAccess: f("adapter", "agg", "medium", "Adapter program alongside Toyota, late 2025"),
      dcPeakKw: f(100, "agg", "medium", "100 kW cap through MY2025; weak cold-weather charging on 2023 cars"),
    },
    thermal: { heatPump: f("standard", "agg", "medium", "DENSO heat pump system (supplier announcement)") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(70, "mfr", "high", "“Retention of 70% or more of the original battery capacity” (MY2023 BEV booklet; later years reported same)"),
      batteryTransfers: f(true, "mfr", "high", "“Every owner of the vehicle during the warranty period shall be entitled to the benefits”"),
    },
    buyerNotes: [
      {
        headline: "Same wheel-detachment recall as its Toyota twin",
        body: "Recall 22V-444 (wheel hub bolts can loosen; wheels can detach) plus Subaru's follow-up 23V-064 (bolts improperly tightened during the first remedy). Both remedies are free; check completion on this VIN. DC charging peaks at 100 kW; 2023 cars lack the improved cold-weather battery conditioning added for 2024.",
        severity: "warning",
      },
    ],
  },

  {
    id: "kia-niro-ev-2019-22",
    make: "KIA",
    model: "Niro EV",
    modelYears: [2019, 2022],
    battery: { packGrossKwh: f(64, "mfr", "high", "Kia-quoted 64 kWh"), chemistry: f("NMC", "agg", "medium") },
    range: { epaRangeMi: f(239, "mfr", "high", "All trims — EPA figure", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("CCS1", "mfr"),
      superchargerAccess: f("adapter", "mfr", "high", "Kia NACS adapter ($249), live April 2025"),
      dcPeakKw: f(77, "agg", "medium", "~77–85 kW real peak; slow DC charging regardless of trim"),
    },
    thermal: { heatPump: f("optional", "mfr", "high", "Optional every year (Cold Weather Package, ~$1,100: heat pump + battery heater) — window sticker check") },
    warranty: {
      batteryYears: f(10, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(70, "mfr"),
      batteryTransfers: f(true, "mfr", "high", "Kia: everything except the original-owner powertrain warranty transfers in full"),
      powertrainTransfers: f(false, "mfr"),
    },
    buyerNotes: [
      {
        headline: "Without the cold-weather package, winter is rough",
        body: "The heat pump AND battery heater were a single option package every year. A car without it loses more range in winter and DC-charges very slowly in the cold. The window sticker is the authority.",
        severity: "trap",
      },
    ],
  },
  {
    id: "kia-niro-ev-2023-24",
    make: "KIA",
    model: "Niro EV",
    modelYears: [2023, 2026], // 2025–26 carry the same 253-mi rating (EPA ids 48370/49664) — window extended 2026-08-14
    battery: { packGrossKwh: f(64.8, "mfr", "high"), chemistry: f("NMC", "agg", "medium") },
    range: { epaRangeMi: f(253, "mfr", "high", "Wind/Wave — EPA figure", "https://www.fueleconomy.gov"), testedRangeMi: f(210, "tested", "medium", "75-mph (Car and Driver, 2023): 210 mi; Edmunds mixed loop: 280") },
    charging: {
      portStandard: f("CCS1", "mfr"),
      superchargerAccess: f("adapter", "mfr", "high", "Kia NACS adapter ($249), live April 2025"),
      dcPeakKw: f(85, "agg", "medium", "~45 min 10–80% — slow for the class"),
    },
    thermal: { heatPump: f("optional", "mfr", "high", "Preserve Package option on both Wind and Wave — window sticker check") },
    warranty: {
      batteryYears: f(10, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(70, "mfr"),
      batteryTransfers: f(true, "mfr"),
      powertrainTransfers: f(false, "mfr"),
    },
    buyerNotes: [
      {
        headline: "Heat pump is still an option package — check the sticker",
        body: "The Preserve Package (heat pump + battery warmer) was optional on both trims. Two identical-looking Niro EVs differ in winter.",
        severity: "trap",
      },
    ],
  },

  {
    id: "bmw-i4-edrive40",
    make: "BMW",
    model: "i4",
    // 2025 (318 mi) and 2026 (333) get their own rows in data4.ts — one value
    // for 2022-25 was overstating the split (2026-08-14).
    modelYears: [2022, 2024],
    trim: "eDrive40",
    battery: {
      packUsableKwh: f(81.5, "mfr", "high", "83.9 gross / 81.5 net (BMW-published)"),
      chemistry: f("NMC", "agg", "medium"),
    },
    range: { epaRangeMi: f(301, "mfr", "high", "282\u2013318 by year and wheels: 301/282 (18\u2033/19\u2033) 2022\u201324, 318/295 in 2025 \u2014 EPA figures", "https://www.fueleconomy.gov"), testedRangeMi: f(280, "tested", "medium", "75-mph (Car and Driver, 2025): 280 mi") },
    charging: {
      portStandard: f("CCS1", "mfr"),
      superchargerAccess: f("adapter", "agg", "high", "Opened Dec 2025 via BMW-approved adapter; requires a Remote Software Upgrade first"),
      dcPeakKw: f(205, "agg", "medium"),
    },
    thermal: { heatPump: f("standard", "mfr", "high", "Integrated heat pump for cabin, battery and drive (BMW press)") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      batteryTransfers: f(true, "mfr", "high", "NVLW runs to \u201cthe first retail purchaser, and each subsequent purchaser\u201d"),
      extendedCoverage: f("MY2022 has NO capacity floor (defects-only, verified). BMW Certified MY22\u201325 cars delivered after Mar 2026 get an 8yr/100k, 75%-SoH CPO battery coverage", "mfr", "high"),
    },
    buyerNotes: [
      {
        headline: "A 2022 i4 bought certified now has better battery coverage than it had new",
        body: "The 2022 i4's factory battery warranty covers defects only \u2014 no capacity floor (verified in the booklet). But BMW's CPO program adds an 8-year/100k, 75%-state-of-health coverage to MY22\u201325 EVs delivered certified after March 2026. Where you buy this car changes what protects its battery.",
        severity: "info",
      },
      {
        headline: "Battery-module recalls \u2014 check campaign status",
        body: "22V-541 (2022) and 25V-470 (2022\u201325): defective cell modules, remedy includes module or full-pack replacement on affected VINs.",
        severity: "warning",
      },
    ],
  },

  {
    id: "bmw-i4-edrive35",
    make: "BMW",
    model: "i4",
    // 2024 (276 mi) and 2025 (266) rows live in data4.ts (2026-08-14).
    modelYears: [2023, 2023],
    trim: "eDrive35",
    battery: {
      packUsableKwh: f(66, "mfr", "high", "70.2 gross / ~66 net (BMW-published)"),
      chemistry: f("NMC", "agg", "medium"),
    },
    range: { epaRangeMi: f(256, "mfr", "high", "235\u2013276 by year and wheels \u2014 EPA figures", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("CCS1", "mfr"),
      superchargerAccess: f("adapter", "agg", "high", "Opened Dec 2025 via BMW-approved adapter; requires a Remote Software Upgrade first"),
      dcPeakKw: f(180, "agg", "medium"),
    },
    thermal: { heatPump: f("standard", "mfr", "high", "Integrated heat pump for cabin, battery and drive (BMW press)") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      batteryTransfers: f(true, "mfr", "high", "NVLW runs to \u201cthe first retail purchaser, and each subsequent purchaser\u201d"),
      extendedCoverage: f("MY2022 has NO capacity floor (defects-only, verified). BMW Certified MY22\u201325 cars delivered after Mar 2026 get an 8yr/100k, 75%-SoH CPO battery coverage", "mfr", "high"),
    },
    buyerNotes: [
      {
        headline: "A 2022 i4 bought certified now has better battery coverage than it had new",
        body: "The 2022 i4's factory battery warranty covers defects only \u2014 no capacity floor (verified in the booklet). But BMW's CPO program adds an 8-year/100k, 75%-state-of-health coverage to MY22\u201325 EVs delivered certified after March 2026. Where you buy this car changes what protects its battery.",
        severity: "info",
      },
      {
        headline: "Battery-module recalls \u2014 check campaign status",
        body: "22V-541 (2022) and 25V-470 (2022\u201325): defective cell modules, remedy includes module or full-pack replacement on affected VINs.",
        severity: "warning",
      },
    ],
  },

  {
    id: "bmw-i4-xdrive40",
    make: "BMW",
    model: "i4",
    // 287 is the MY2025 figure; MY2024 rated 307 and has its own row in
    // data4.ts (2026-08-14).
    modelYears: [2025, 2025],
    trim: "xDrive40",
    battery: {
      packUsableKwh: f(81.5, "mfr", "high", "83.9 gross / 81.5 net (BMW-published)"),
      chemistry: f("NMC", "agg", "medium"),
    },
    range: { epaRangeMi: f(287, "mfr", "high", "268\u2013307 by year and wheels \u2014 EPA figures", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("CCS1", "mfr"),
      superchargerAccess: f("adapter", "agg", "high", "Opened Dec 2025 via BMW-approved adapter; requires a Remote Software Upgrade first"),
      dcPeakKw: f(205, "agg", "medium"),
    },
    thermal: { heatPump: f("standard", "mfr", "high", "Integrated heat pump for cabin, battery and drive (BMW press)") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      batteryTransfers: f(true, "mfr", "high", "NVLW runs to \u201cthe first retail purchaser, and each subsequent purchaser\u201d"),
      extendedCoverage: f("MY2022 has NO capacity floor (defects-only, verified). BMW Certified MY22\u201325 cars delivered after Mar 2026 get an 8yr/100k, 75%-SoH CPO battery coverage", "mfr", "high"),
    },
    buyerNotes: [
      {
        headline: "A 2022 i4 bought certified now has better battery coverage than it had new",
        body: "The 2022 i4's factory battery warranty covers defects only \u2014 no capacity floor (verified in the booklet). But BMW's CPO program adds an 8-year/100k, 75%-state-of-health coverage to MY22\u201325 EVs delivered certified after March 2026. Where you buy this car changes what protects its battery.",
        severity: "info",
      },
      {
        headline: "Battery-module recalls \u2014 check campaign status",
        body: "22V-541 (2022) and 25V-470 (2022\u201325): defective cell modules, remedy includes module or full-pack replacement on affected VINs.",
        severity: "warning",
      },
    ],
  },

  {
    id: "bmw-i4-m50",
    make: "BMW",
    model: "i4",
    modelYears: [2022, 2025],
    trim: "M50",
    battery: {
      packUsableKwh: f(81.5, "mfr", "high", "83.9 gross / 81.5 net (BMW-published)"),
      chemistry: f("NMC", "agg", "medium"),
    },
    range: { epaRangeMi: f(269, "mfr", "high", "227\u2013271 by year and wheels \u2014 EPA figures", "https://www.fueleconomy.gov"), testedRangeMi: f(239, "tested", "high", "70-mph (InsideEVs, 2022 M50): 239 mi — beat its 227 EPA; Edmunds loop: 268") },
    charging: {
      portStandard: f("CCS1", "mfr"),
      superchargerAccess: f("adapter", "agg", "high", "Opened Dec 2025 via BMW-approved adapter; requires a Remote Software Upgrade first"),
      dcPeakKw: f(205, "agg", "medium"),
    },
    thermal: { heatPump: f("standard", "mfr", "high", "Integrated heat pump for cabin, battery and drive (BMW press)") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      batteryTransfers: f(true, "mfr", "high", "NVLW runs to \u201cthe first retail purchaser, and each subsequent purchaser\u201d"),
      extendedCoverage: f("MY2022 has NO capacity floor (defects-only, verified). BMW Certified MY22\u201325 cars delivered after Mar 2026 get an 8yr/100k, 75%-SoH CPO battery coverage", "mfr", "high"),
    },
    buyerNotes: [
      {
        headline: "A 2022 i4 bought certified now has better battery coverage than it had new",
        body: "The 2022 i4's factory battery warranty covers defects only \u2014 no capacity floor (verified in the booklet). But BMW's CPO program adds an 8-year/100k, 75%-state-of-health coverage to MY22\u201325 EVs delivered certified after March 2026. Where you buy this car changes what protects its battery.",
        severity: "info",
      },
      {
        headline: "Battery-module recalls \u2014 check campaign status",
        body: "22V-541 (2022) and 25V-470 (2022\u201325): defective cell modules, remedy includes module or full-pack replacement on affected VINs.",
        severity: "warning",
      },
    ],
  },

  {
    id: "silverado-wt-standard",
    make: "CHEVROLET",
    model: "Silverado EV",
    modelYears: [2025, 2026],
    trim: "Standard Range",
    battery: { packUsableKwh: f(119, "est", "medium", "~119 kWh usable (GM publishes no official split)"), chemistry: f("NCM", "agg", "medium") },
    range: { epaRangeMi: f(283, "mfr", "high", "2025 2WT: 282 mi; 2026 Standard: 283\u2013286 mi \u2014 EPA figures", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("CCS1", "agg", "high"),
      superchargerAccess: f("adapter", "agg", "high", "GM $225 NACS adapter"),
      dcPeakKw: f(300, "agg", "medium"),
    },
    thermal: { heatPump: f("standard", "agg", "medium", "Ultium Energy Recovery") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(75, "mfr", "high", "\u201cBelow 75% of its original value\u201d \u2014 GM EV booklets (extracted text)"),
      batteryTransfers: f(true, "mfr", "high", "\u201cTransferable at no cost\u201d \u2014 GM EV booklets"),
    },
    buyerNotes: [
      {
        headline: "NHTSA recalls on file",
        body: "Seat-belt anchorage: 23V-786, 24V-087, 25V-015. HV wiring harness: 24V-320 (multi-model). Free remedies; check completion on this VIN.",
        severity: "info",
      },
    ],
  },

  {
    id: "silverado-wt-extended",
    make: "CHEVROLET",
    model: "Silverado EV",
    modelYears: [2025, 2026],
    trim: "Extended Range",
    battery: { packUsableKwh: f(170, "est", "medium", "~170 kWh usable (GM publishes no official split)"), chemistry: f("NCM", "agg", "medium") },
    range: { epaRangeMi: f(424, "mfr", "high", "2025 5WT: 422 mi; 2026 Extended: 424 mi (410/385 with equipment differences) \u2014 EPA figures", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("CCS1", "agg", "high"),
      superchargerAccess: f("adapter", "agg", "high", "GM $225 NACS adapter"),
      dcPeakKw: f(350, "agg", "medium"),
    },
    thermal: { heatPump: f("standard", "agg", "medium", "Ultium Energy Recovery") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(75, "mfr", "high", "\u201cBelow 75% of its original value\u201d \u2014 GM EV booklets (extracted text)"),
      batteryTransfers: f(true, "mfr", "high", "\u201cTransferable at no cost\u201d \u2014 GM EV booklets"),
    },
    buyerNotes: [
      {
        headline: "NHTSA recalls on file",
        body: "Seat-belt anchorage: 23V-786, 24V-087, 25V-015. HV wiring harness: 24V-320 (multi-model). Free remedies; check completion on this VIN.",
        severity: "info",
      },
    ],
  },

  {
    id: "silverado-wt-max",
    make: "CHEVROLET",
    model: "Silverado EV",
    modelYears: [2025, 2026],
    trim: "Max Range",
    battery: { packUsableKwh: f(205, "est", "medium", "~205 kWh usable (213.7 gross reported)"), chemistry: f("NCM", "agg", "medium") },
    range: { epaRangeMi: f(493, "mfr", "high", "2025 8WT: 492 mi; 2026 Max: 493 mi \u2014 EPA figures", "https://www.fueleconomy.gov"), testedRangeMi: f(539, "tested", "medium", "Edmunds mixed loop, 2025 WT Max Range: 539 mi — the longest Edmunds has recorded") },
    charging: {
      portStandard: f("CCS1", "agg", "high"),
      superchargerAccess: f("adapter", "agg", "high", "GM $225 NACS adapter"),
      dcPeakKw: f(350, "agg", "medium"),
    },
    thermal: { heatPump: f("standard", "agg", "medium", "Ultium Energy Recovery") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(75, "mfr", "high", "\u201cBelow 75% of its original value\u201d \u2014 GM EV booklets (extracted text)"),
      batteryTransfers: f(true, "mfr", "high", "\u201cTransferable at no cost\u201d \u2014 GM EV booklets"),
    },
    buyerNotes: [
      {
        headline: "NHTSA recalls on file",
        body: "Seat-belt anchorage: 23V-786, 24V-087, 25V-015. HV wiring harness: 24V-320 (multi-model). Free remedies; check completion on this VIN.",
        severity: "info",
      },
    ],
  },

  {
    id: "silverado-3wt",
    make: "CHEVROLET",
    model: "Silverado EV",
    modelYears: [2024, 2024],
    trim: "3WT",
    battery: { packUsableKwh: f(170, "est", "medium", "~170 kWh usable"), chemistry: f("NCM", "agg", "medium") },
    range: { epaRangeMi: f(393, "mfr", "high", "2024 3WT \u2014 EPA figure", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("CCS1", "agg", "high"),
      superchargerAccess: f("adapter", "agg", "high", "GM $225 NACS adapter"),
      dcPeakKw: f(350, "agg", "medium"),
    },
    thermal: { heatPump: f("standard", "agg", "medium", "Ultium Energy Recovery") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(75, "mfr", "high", "\u201cBelow 75% of its original value\u201d \u2014 GM EV booklets (extracted text)"),
      batteryTransfers: f(true, "mfr", "high", "\u201cTransferable at no cost\u201d \u2014 GM EV booklets"),
    },
    buyerNotes: [
      {
        headline: "NHTSA recalls on file",
        body: "Seat-belt anchorage: 23V-786, 24V-087, 25V-015. HV wiring harness: 24V-320 (multi-model). Free remedies; check completion on this VIN.",
        severity: "info",
      },
    ],
  },

  {
    id: "silverado-4wt",
    make: "CHEVROLET",
    model: "Silverado EV",
    modelYears: [2024, 2024],
    trim: "4WT",
    battery: { packUsableKwh: f(205, "est", "medium", "~205 kWh usable"), chemistry: f("NCM", "agg", "medium") },
    range: { epaRangeMi: f(450, "mfr", "high", "2024 4WT \u2014 EPA figure", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("CCS1", "agg", "high"),
      superchargerAccess: f("adapter", "agg", "high", "GM $225 NACS adapter"),
      dcPeakKw: f(350, "agg", "medium"),
    },
    thermal: { heatPump: f("standard", "agg", "medium", "Ultium Energy Recovery") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(75, "mfr", "high", "\u201cBelow 75% of its original value\u201d \u2014 GM EV booklets (extracted text)"),
      batteryTransfers: f(true, "mfr", "high", "\u201cTransferable at no cost\u201d \u2014 GM EV booklets"),
    },
    buyerNotes: [
      {
        headline: "NHTSA recalls on file",
        body: "Seat-belt anchorage: 23V-786, 24V-087, 25V-015. HV wiring harness: 24V-320 (multi-model). Free remedies; check completion on this VIN.",
        severity: "info",
      },
    ],
  },

  {
    id: "silverado-rst",
    make: "CHEVROLET",
    model: "Silverado EV",
    modelYears: [2025, 2026],
    trim: "RST",
    battery: { packUsableKwh: f(205, "est", "medium", "~205 kWh usable (Max pack)"), chemistry: f("NCM", "agg", "medium") },
    range: { epaRangeMi: f(408, "mfr", "high", "2025 RST: 408 mi (390 with 19.2 kW charger); 2026: 410/385 \u2014 EPA figures", "https://www.fueleconomy.gov"), testedRangeMi: f(442, "tested", "high", "70-mph (InsideEVs, 2024 RST First Edition): 442 mi; 75-mph (C&D): 400; Edmunds loop: 484") },
    charging: {
      portStandard: f("CCS1", "agg", "high"),
      superchargerAccess: f("adapter", "agg", "high", "GM $225 NACS adapter"),
      dcPeakKw: f(350, "agg", "medium"),
    },
    thermal: { heatPump: f("standard", "agg", "medium", "Ultium Energy Recovery") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(75, "mfr", "high", "\u201cBelow 75% of its original value\u201d \u2014 GM EV booklets (extracted text)"),
      batteryTransfers: f(true, "mfr", "high", "\u201cTransferable at no cost\u201d \u2014 GM EV booklets"),
    },
    buyerNotes: [
      {
        headline: "NHTSA recalls on file",
        body: "Seat-belt anchorage: 23V-786, 24V-087, 25V-015. HV wiring harness: 24V-320 (multi-model). Free remedies; check completion on this VIN.",
        severity: "info",
      },
    ],
  },

  {
    id: "jaguar-ipace-2019-24",
    make: "JAGUAR",
    model: "I-PACE",
    modelYears: [2019, 2024],
    battery: { packUsableKwh: f(84.7, "mfr", "medium", "90 gross / 84.7 usable (Jaguar-published)"), chemistry: f("NMC", "agg", "medium") },
    range: { epaRangeMi: f(234, "mfr", "high", "2019–21: 234; 2023–24: 246 (20″) / 217 (22″). No US MY2022 exists (no MY2022 was sold in the US)", "https://www.fueleconomy.gov"), testedRangeMi: f(195, "tested", "high", "70-mph (InsideEVs, 2022 EV400): 195 mi; 75-mph (C&D, 2019): 190") },
    charging: {
      portStandard: f("CCS1", "mfr"),
      superchargerAccess: f("none", "agg", "medium", "JLR was network-whitelisted (~Aug 2025) but no approved adapter confirmed shipping — treat as no Supercharger access until verified"),
      dcPeakKw: f(100, "agg", "medium", "Slow: 100–104 kW"),
    },
    thermal: { heatPump: f("standard", "mfr", "high", "Jaguar-published thermal system with heat pump") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(70, "mfr", "high", "“Shall perform to at least 70% of as-new capacity” — Jaguar Passport to Service"),
      batteryTransfers: f(true, "mfr", "high", "“In favor of the original purchaser and each subsequent owner”; EliteCare (incl. 5yr/60k maintenance) “fully transferable”"),
    },
    buyerNotes: [
      {
        headline: "The battery recall saga defines this car — check the VIN before anything else",
        body: "Verified from Jaguar's NHTSA filings: for MY2019 cars the final remedy is a REPURCHASE — Jaguar buys the car back (recall H536) — so a 2019 on a lot may be a car Jaguar offered to buy. MY2020–21 cars (26V-067) run a 90% charge cap with the final fix still ‘under development’ as of Feb 2026. Jaguar ended I-PACE production in 2024.",
        severity: "trap",
      },
    ],
  },

];
