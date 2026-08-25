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

// A fueleconomy.gov citation that resolves to the exact record a figure came
// from, rather than the site's front door (same convention as data3/data4.ts).
const epa = (id: number) => `https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=${id}`;

export const RESEARCH_ROWS: EnrichmentRow[] = [
  {
    id: "id4-2021-pro-rwd",
    make: "VOLKSWAGEN",
    model: "ID.4",
    modelYears: [2021, 2021],
    trim: "Pro",
    drive: "RWD",
    battery: { packUsableKwh: f(77, "mfr", "medium", "82 gross / 77 usable"), chemistry: f("NMC", "agg", "medium") },
    range: { epaRangeMi: f(260, "mfr", "high", undefined, epa(44052)) },
    charging: {
      portStandard: f("CCS1", "mfr"),
      superchargerAccess: f("adapter", "mfr", "high", "VW-approved NACS adapter ($200), access opened Nov 2025"),
      dcPeakKw: f(170, "agg", "medium"),
    },
    thermal: { heatPump: f("none", "agg", "medium") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(70, "mfr", "high", "Repairs restore to ≥70%, not to as-new"),
      batteryTransfers: f(true, "mfr", "high"),
    },
    buyerNotes: [
      {
        headline: "Battery and door-handle recalls; confirm the repairs were done on this car",
        body: "2023–25 Chattanooga-built cars: HV battery cell-module recalls (25V-836, 26V-028, 26V-030) with module replacement as remedy and an interim 80% charge cap with DC fast charging disabled. All years: door-handle water-intrusion recall (24V-651, doors can open while driving). A repaired car is fine, an unrepaired one is materially worse until fixed.",
        severity: "trap",
      },
    ],
  },

  {
    id: "id4-2021-pros-rwd",
    make: "VOLKSWAGEN",
    model: "ID.4",
    modelYears: [2021, 2021],
    trim: "Pro S",
    drive: "RWD",
    battery: { packUsableKwh: f(77, "mfr", "medium", "82 gross / 77 usable"), chemistry: f("NMC", "agg", "medium") },
    range: { epaRangeMi: f(250, "mfr", "high", undefined, epa(43558)) },
    charging: {
      portStandard: f("CCS1", "mfr"),
      superchargerAccess: f("adapter", "mfr", "high", "VW-approved NACS adapter ($200), access opened Nov 2025"),
      dcPeakKw: f(170, "agg", "medium"),
    },
    thermal: { heatPump: f("none", "agg", "medium") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(70, "mfr", "high", "Repairs restore to ≥70%, not to as-new"),
      batteryTransfers: f(true, "mfr", "high"),
    },
    buyerNotes: [
      {
        headline: "Battery and door-handle recalls; confirm the repairs were done on this car",
        body: "2023–25 Chattanooga-built cars: HV battery cell-module recalls (25V-836, 26V-028, 26V-030) with module replacement as remedy and an interim 80% charge cap with DC fast charging disabled. All years: door-handle water-intrusion recall (24V-651, doors can open while driving). A repaired car is fine, an unrepaired one is materially worse until fixed.",
        severity: "trap",
      },
    ],
  },

  {
    id: "id4-2021-1st",
    make: "VOLKSWAGEN",
    model: "ID.4",
    modelYears: [2021, 2021],
    trim: "1st Edition",
    drive: "RWD",
    battery: { packUsableKwh: f(77, "mfr", "medium", "82 gross / 77 usable"), chemistry: f("NMC", "agg", "medium") },
    range: { epaRangeMi: f(250, "mfr", "high", undefined, epa(43557)), testedRangeMi: f(234, "tested", "high", "70 mph steady-state highway (InsideEVs)") },
    charging: {
      portStandard: f("CCS1", "mfr"),
      superchargerAccess: f("adapter", "mfr", "high", "VW-approved NACS adapter ($200), access opened Nov 2025"),
      dcPeakKw: f(170, "agg", "medium"),
    },
    thermal: { heatPump: f("none", "agg", "medium") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(70, "mfr", "high", "Repairs restore to ≥70%, not to as-new"),
      batteryTransfers: f(true, "mfr", "high"),
    },
    buyerNotes: [
      {
        headline: "Battery and door-handle recalls; confirm the repairs were done on this car",
        body: "2023–25 Chattanooga-built cars: HV battery cell-module recalls (25V-836, 26V-028, 26V-030) with module replacement as remedy and an interim 80% charge cap with DC fast charging disabled. All years: door-handle water-intrusion recall (24V-651, doors can open while driving). A repaired car is fine, an unrepaired one is materially worse until fixed.",
        severity: "trap",
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
    range: { epaRangeMi: f(249, "mfr", "high", undefined, epa(44725)) },
    charging: {
      portStandard: f("CCS1", "mfr"),
      superchargerAccess: f("adapter", "mfr", "high", "VW-approved NACS adapter ($200), access opened Nov 2025"),
      dcPeakKw: f(170, "agg", "medium"),
    },
    thermal: { heatPump: f("none", "agg", "medium") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(70, "mfr", "high", "Repairs restore to ≥70%, not to as-new"),
      batteryTransfers: f(true, "mfr", "high"),
    },
    buyerNotes: [
      {
        headline: "Battery and door-handle recalls; confirm the repairs were done on this car",
        body: "2023–25 Chattanooga-built cars: HV battery cell-module recalls (25V-836, 26V-028, 26V-030) with module replacement as remedy and an interim 80% charge cap with DC fast charging disabled. All years: door-handle water-intrusion recall (24V-651, doors can open while driving). A repaired car is fine, an unrepaired one is materially worse until fixed.",
        severity: "trap",
      },
    ],
  },

  {
    id: "id4-2021-pros-awd",
    make: "VOLKSWAGEN",
    model: "ID.4",
    modelYears: [2021, 2021],
    trim: "Pro S",
    drive: "AWD",
    battery: { packUsableKwh: f(77, "mfr", "medium", "82 gross / 77 usable"), chemistry: f("NMC", "agg", "medium") },
    range: { epaRangeMi: f(240, "mfr", "high", undefined, epa(44726)) },
    charging: {
      portStandard: f("CCS1", "mfr"),
      superchargerAccess: f("adapter", "mfr", "high", "VW-approved NACS adapter ($200), access opened Nov 2025"),
      dcPeakKw: f(170, "agg", "medium"),
    },
    thermal: { heatPump: f("none", "agg", "medium") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(70, "mfr", "high", "Repairs restore to ≥70%, not to as-new"),
      batteryTransfers: f(true, "mfr", "high"),
    },
    buyerNotes: [
      {
        headline: "Battery and door-handle recalls; confirm the repairs were done on this car",
        body: "2023–25 Chattanooga-built cars: HV battery cell-module recalls (25V-836, 26V-028, 26V-030) with module replacement as remedy and an interim 80% charge cap with DC fast charging disabled. All years: door-handle water-intrusion recall (24V-651, doors can open while driving). A repaired car is fine, an unrepaired one is materially worse until fixed.",
        severity: "trap",
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
    range: { epaRangeMi: f(275, "mfr", "high", undefined, epa(45259)) },
    charging: {
      portStandard: f("CCS1", "mfr"),
      superchargerAccess: f("adapter", "mfr", "high", "VW-approved NACS adapter ($200), access opened Nov 2025"),
      dcPeakKw: f(170, "agg", "medium"),
    },
    thermal: { heatPump: f("none", "agg", "medium") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(70, "mfr", "high", "Repairs restore to ≥70%, not to as-new"),
      batteryTransfers: f(true, "mfr", "high"),
    },
    buyerNotes: [
      {
        headline: "Battery and door-handle recalls; confirm the repairs were done on this car",
        body: "2023–25 Chattanooga-built cars: HV battery cell-module recalls (25V-836, 26V-028, 26V-030) with module replacement as remedy and an interim 80% charge cap with DC fast charging disabled. All years: door-handle water-intrusion recall (24V-651, doors can open while driving). A repaired car is fine, an unrepaired one is materially worse until fixed.",
        severity: "trap",
      },
    ],
  },

  {
    id: "id4-2022-pros-rwd",
    make: "VOLKSWAGEN",
    model: "ID.4",
    modelYears: [2022, 2022],
    trim: "Pro S",
    drive: "RWD",
    battery: { packUsableKwh: f(77, "mfr", "medium", "82 gross / 77 usable"), chemistry: f("NMC", "agg", "medium") },
    range: { epaRangeMi: f(262, "mfr", "high", undefined, epa(45413)) },
    charging: {
      portStandard: f("CCS1", "mfr"),
      superchargerAccess: f("adapter", "mfr", "high", "VW-approved NACS adapter ($200), access opened Nov 2025"),
      dcPeakKw: f(170, "agg", "medium"),
    },
    thermal: { heatPump: f("none", "agg", "medium") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(70, "mfr", "high", "Repairs restore to ≥70%, not to as-new"),
      batteryTransfers: f(true, "mfr", "high"),
    },
    buyerNotes: [
      {
        headline: "Battery and door-handle recalls; confirm the repairs were done on this car",
        body: "2023–25 Chattanooga-built cars: HV battery cell-module recalls (25V-836, 26V-028, 26V-030) with module replacement as remedy and an interim 80% charge cap with DC fast charging disabled. All years: door-handle water-intrusion recall (24V-651, doors can open while driving). A repaired car is fine, an unrepaired one is materially worse until fixed.",
        severity: "trap",
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
    range: { epaRangeMi: f(251, "mfr", "high", undefined, epa(45257)) },
    charging: {
      portStandard: f("CCS1", "mfr"),
      superchargerAccess: f("adapter", "mfr", "high", "VW-approved NACS adapter ($200), access opened Nov 2025"),
      dcPeakKw: f(170, "agg", "medium"),
    },
    thermal: { heatPump: f("none", "agg", "medium") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(70, "mfr", "high", "Repairs restore to ≥70%, not to as-new"),
      batteryTransfers: f(true, "mfr", "high"),
    },
    buyerNotes: [
      {
        headline: "Battery and door-handle recalls; confirm the repairs were done on this car",
        body: "2023–25 Chattanooga-built cars: HV battery cell-module recalls (25V-836, 26V-028, 26V-030) with module replacement as remedy and an interim 80% charge cap with DC fast charging disabled. All years: door-handle water-intrusion recall (24V-651, doors can open while driving). A repaired car is fine, an unrepaired one is materially worse until fixed.",
        severity: "trap",
      },
    ],
  },

  {
    id: "id4-2022-pros-awd",
    make: "VOLKSWAGEN",
    model: "ID.4",
    modelYears: [2022, 2022],
    trim: "Pro S",
    drive: "AWD",
    battery: { packUsableKwh: f(77, "mfr", "medium", "82 gross / 77 usable"), chemistry: f("NMC", "agg", "medium") },
    range: { epaRangeMi: f(245, "mfr", "high", undefined, epa(45258)) },
    charging: {
      portStandard: f("CCS1", "mfr"),
      superchargerAccess: f("adapter", "mfr", "high", "VW-approved NACS adapter ($200), access opened Nov 2025"),
      dcPeakKw: f(170, "agg", "medium"),
    },
    thermal: { heatPump: f("none", "agg", "medium") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(70, "mfr", "high", "Repairs restore to ≥70%, not to as-new"),
      batteryTransfers: f(true, "mfr", "high"),
    },
    buyerNotes: [
      {
        headline: "Battery and door-handle recalls; confirm the repairs were done on this car",
        body: "2023–25 Chattanooga-built cars: HV battery cell-module recalls (25V-836, 26V-028, 26V-030) with module replacement as remedy and an interim 80% charge cap with DC fast charging disabled. All years: door-handle water-intrusion recall (24V-651, doors can open while driving). A repaired car is fine, an unrepaired one is materially worse until fixed.",
        severity: "trap",
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
    range: { epaRangeMi: f(275, "mfr", "high", "2023 Pro / Pro S RWD, EPA", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("CCS1", "mfr"),
      superchargerAccess: f("adapter", "mfr", "high", "VW-approved NACS adapter ($200), access opened Nov 2025"),
      dcPeakKw: f(170, "agg", "medium"),
    },
    thermal: { heatPump: f("none", "agg", "medium") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(70, "mfr", "high", "Repairs restore to ≥70%, not to as-new"),
      batteryTransfers: f(true, "mfr", "high"),
    },
    buyerNotes: [
      {
        headline: "Battery and door-handle recalls; confirm the repairs were done on this car",
        body: "2023–25 Chattanooga-built cars: HV battery cell-module recalls (25V-836, 26V-028, 26V-030) with module replacement as remedy and an interim 80% charge cap with DC fast charging disabled. All years: door-handle water-intrusion recall (24V-651, doors can open while driving). A repaired car is fine, an unrepaired one is materially worse until fixed.",
        severity: "trap",
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
    range: { epaRangeMi: f(255, "mfr", "high", "2023 Pro / Pro S AWD, EPA", "https://www.fueleconomy.gov"), testedRangeMi: f(269, "tested", "medium", "Edmunds mixed loop, 2023 Pro S AWD: 269 mi (no steady-speed test found)") },
    charging: {
      portStandard: f("CCS1", "mfr"),
      superchargerAccess: f("adapter", "mfr", "high", "VW-approved NACS adapter ($200), access opened Nov 2025"),
      dcPeakKw: f(170, "agg", "medium"),
    },
    thermal: { heatPump: f("none", "agg", "medium") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(70, "mfr", "high", "Repairs restore to ≥70%, not to as-new"),
      batteryTransfers: f(true, "mfr", "high"),
    },
    buyerNotes: [
      {
        headline: "Battery and door-handle recalls; confirm the repairs were done on this car",
        body: "2023–25 Chattanooga-built cars: HV battery cell-module recalls (25V-836, 26V-028, 26V-030) with module replacement as remedy and an interim 80% charge cap with DC fast charging disabled. All years: door-handle water-intrusion recall (24V-651, doors can open while driving). A repaired car is fine, an unrepaired one is materially worse until fixed.",
        severity: "trap",
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
    range: { epaRangeMi: f(291, "mfr", "high", "2024 Pro / Pro S RWD, EPA", "https://www.fueleconomy.gov"), testedRangeMi: f(299, "tested", "medium", "Edmunds mixed loop, 2024 Pro S RWD: 299 mi") },
    charging: {
      portStandard: f("CCS1", "mfr"),
      superchargerAccess: f("adapter", "mfr", "high", "VW-approved NACS adapter ($200), access opened Nov 2025"),
      dcPeakKw: f(170, "agg", "medium"),
    },
    thermal: { heatPump: f("none", "agg", "medium") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(70, "mfr", "high", "Repairs restore to ≥70%, not to as-new"),
      batteryTransfers: f(true, "mfr", "high"),
    },
    buyerNotes: [
      {
        headline: "Battery and door-handle recalls; confirm the repairs were done on this car",
        body: "2023–25 Chattanooga-built cars: HV battery cell-module recalls (25V-836, 26V-028, 26V-030) with module replacement as remedy and an interim 80% charge cap with DC fast charging disabled. All years: door-handle water-intrusion recall (24V-651, doors can open while driving). A repaired car is fine, an unrepaired one is materially worse until fixed.",
        severity: "trap",
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
    range: { epaRangeMi: f(263, "mfr", "high", "2024 Pro / Pro S AWD, EPA", "https://www.fueleconomy.gov"), testedRangeMi: f(240, "tested", "medium", "75-mph (Car and Driver), 2024 Pro S AWD: 240 mi") },
    charging: {
      portStandard: f("CCS1", "mfr"),
      superchargerAccess: f("adapter", "mfr", "high", "VW-approved NACS adapter ($200), access opened Nov 2025"),
      dcPeakKw: f(170, "agg", "medium"),
    },
    thermal: { heatPump: f("none", "agg", "medium") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(70, "mfr", "high", "Repairs restore to ≥70%, not to as-new"),
      batteryTransfers: f(true, "mfr", "high"),
    },
    buyerNotes: [
      {
        headline: "Battery and door-handle recalls; confirm the repairs were done on this car",
        body: "2023–25 Chattanooga-built cars: HV battery cell-module recalls (25V-836, 26V-028, 26V-030) with module replacement as remedy and an interim 80% charge cap with DC fast charging disabled. All years: door-handle water-intrusion recall (24V-651, doors can open while driving). A repaired car is fine, an unrepaired one is materially worse until fixed.",
        severity: "trap",
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
    range: { epaRangeMi: f(209, "mfr", "high", "2023 Standard (62 kWh), EPA", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("CCS1", "mfr"),
      superchargerAccess: f("adapter", "mfr", "high", "VW-approved NACS adapter ($200), access opened Nov 2025"),
      dcPeakKw: f(140, "agg", "medium"),
    },
    thermal: { heatPump: f("none", "agg", "medium") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(70, "mfr", "high", "Repairs restore to ≥70%, not to as-new"),
      batteryTransfers: f(true, "mfr", "high"),
    },
    buyerNotes: [
      {
        headline: "Battery and door-handle recalls; confirm the repairs were done on this car",
        body: "2023–25 Chattanooga-built cars: HV battery cell-module recalls (25V-836, 26V-028, 26V-030) with module replacement as remedy and an interim 80% charge cap with DC fast charging disabled. All years: door-handle water-intrusion recall (24V-651, doors can open while driving). A repaired car is fine, an unrepaired one is materially worse until fixed.",
        severity: "trap",
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
    range: { epaRangeMi: f(209, "mfr", "high", "2023 S (62 kWh), EPA", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("CCS1", "mfr"),
      superchargerAccess: f("adapter", "mfr", "high", "VW-approved NACS adapter ($200), access opened Nov 2025"),
      dcPeakKw: f(140, "agg", "medium"),
    },
    thermal: { heatPump: f("none", "agg", "medium") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(70, "mfr", "high", "Repairs restore to ≥70%, not to as-new"),
      batteryTransfers: f(true, "mfr", "high"),
    },
    buyerNotes: [
      {
        headline: "Battery and door-handle recalls; confirm the repairs were done on this car",
        body: "2023–25 Chattanooga-built cars: HV battery cell-module recalls (25V-836, 26V-028, 26V-030) with module replacement as remedy and an interim 80% charge cap with DC fast charging disabled. All years: door-handle water-intrusion recall (24V-651, doors can open while driving). A repaired car is fine, an unrepaired one is materially worse until fixed.",
        severity: "trap",
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
    range: { epaRangeMi: f(206, "mfr", "high", "2024 Standard (62 kWh), EPA", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("CCS1", "mfr"),
      superchargerAccess: f("adapter", "mfr", "high", "VW-approved NACS adapter ($200), access opened Nov 2025"),
      dcPeakKw: f(140, "agg", "medium"),
    },
    thermal: { heatPump: f("none", "agg", "medium") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(70, "mfr", "high", "Repairs restore to ≥70%, not to as-new"),
      batteryTransfers: f(true, "mfr", "high"),
    },
    buyerNotes: [
      {
        headline: "Battery and door-handle recalls; confirm the repairs were done on this car",
        body: "2023–25 Chattanooga-built cars: HV battery cell-module recalls (25V-836, 26V-028, 26V-030) with module replacement as remedy and an interim 80% charge cap with DC fast charging disabled. All years: door-handle water-intrusion recall (24V-651, doors can open while driving). A repaired car is fine, an unrepaired one is materially worse until fixed.",
        severity: "trap",
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
    range: { epaRangeMi: f(206, "mfr", "high", "2024 S (62 kWh), EPA", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("CCS1", "mfr"),
      superchargerAccess: f("adapter", "mfr", "high", "VW-approved NACS adapter ($200), access opened Nov 2025"),
      dcPeakKw: f(140, "agg", "medium"),
    },
    thermal: { heatPump: f("none", "agg", "medium") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(70, "mfr", "high", "Repairs restore to ≥70%, not to as-new"),
      batteryTransfers: f(true, "mfr", "high"),
    },
    buyerNotes: [
      {
        headline: "Battery and door-handle recalls; confirm the repairs were done on this car",
        body: "2023–25 Chattanooga-built cars: HV battery cell-module recalls (25V-836, 26V-028, 26V-030) with module replacement as remedy and an interim 80% charge cap with DC fast charging disabled. All years: door-handle water-intrusion recall (24V-651, doors can open while driving). A repaired car is fine, an unrepaired one is materially worse until fixed.",
        severity: "trap",
      },
    ],
  },

  {
    id: "leaf-s",
    make: "NISSAN",
    model: "Leaf",
    // Same pack as its trim siblings; packVariant groups them for peer
    // pooling (lib/listings/enrich.ts packIdentity) - the value restates
    // this row's own battery fact.
    packVariant: "40 kWh",
    modelYears: [2018, 2025],
    trim: "S",
    battery: { packGrossKwh: f(40, "mfr", "medium", "40 kWh gross"), chemistry: f("NMC", "agg", "medium") },
    range: { epaRangeMi: f(149, "mfr", "high", "2018: 151; 2019: 150; 2020–25: 149, EPA", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("CHAdeMO", "mfr", "high", "AC charging is standard J1772"),
      superchargerAccess: f("none", "mfr", "high", "No CHAdeMO→NACS adapter exists"),
      dcPeakKw: f(50, "agg", "medium"),
    },
    thermal: { heatPump: f("none", "agg", "medium", "Base S uses a resistive heater; the hybrid-heater (heat pump) was not offered on S") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      batteryTransfers: f(true, "mfr", "high", "“Original and subsequent owner(s)”, voided only if exported within 6 months of first sale"),
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
    // Same pack as its trim siblings; packVariant groups them for peer
    // pooling (lib/listings/enrich.ts packIdentity) - the value restates
    // this row's own battery fact.
    packVariant: "40 kWh",
    modelYears: [2018, 2022],
    trim: "SV",
    battery: { packGrossKwh: f(40, "mfr", "medium", "40 kWh gross"), chemistry: f("NMC", "agg", "medium") },
    range: { epaRangeMi: f(149, "mfr", "high", "2018: 151; 2019: 150; 2020–22: 149, EPA", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("CHAdeMO", "mfr", "high", "AC charging is standard J1772"),
      superchargerAccess: f("none", "mfr", "high", "No CHAdeMO→NACS adapter exists"),
      dcPeakKw: f(50, "agg", "medium"),
    },
    thermal: { heatPump: f("standard", "agg", "medium", "Hybrid heater (heat pump + PTC) on SV/SL trims") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      batteryTransfers: f(true, "mfr", "high", "“Original and subsequent owner(s)”, voided only if exported within 6 months of first sale"),
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
    // Same pack as its trim siblings; packVariant groups them for peer
    // pooling (lib/listings/enrich.ts packIdentity) - the value restates
    // this row's own battery fact.
    packVariant: "40 kWh",
    modelYears: [2018, 2019],
    trim: "SL",
    battery: { packGrossKwh: f(40, "mfr", "medium", "40 kWh gross"), chemistry: f("NMC", "agg", "medium") },
    range: { epaRangeMi: f(150, "mfr", "high", "2018: 151; 2019: 150, EPA", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("CHAdeMO", "mfr", "high", "AC charging is standard J1772"),
      superchargerAccess: f("none", "mfr", "high", "No CHAdeMO→NACS adapter exists"),
      dcPeakKw: f(50, "agg", "medium"),
    },
    thermal: { heatPump: f("standard", "agg", "medium", "Hybrid heater (heat pump + PTC) on SV/SL trims") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      batteryTransfers: f(true, "mfr", "high", "“Original and subsequent owner(s)”, voided only if exported within 6 months of first sale"),
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
    // Same pack as its trim siblings; packVariant groups them for peer
    // pooling (lib/listings/enrich.ts packIdentity) - the value restates
    // this row's own battery fact.
    packVariant: "62 kWh e+",
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
      batteryTransfers: f(true, "mfr", "high", "“Original and subsequent owner(s)”, voided only if exported within 6 months of first sale"),
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
    // Same pack as its trim siblings; packVariant groups them for peer
    // pooling (lib/listings/enrich.ts packIdentity) - the value restates
    // this row's own battery fact.
    packVariant: "62 kWh e+",
    modelYears: [2019, 2025],
    trim: "SV Plus",
    battery: { packGrossKwh: f(62, "est", "medium", "62 kWh gross (2023–25: ~60)"), chemistry: f("NMC", "agg", "medium") },
    range: { epaRangeMi: f(215, "mfr", "high", "2019–22: 215; 2023–25: 212, EPA", "https://www.fueleconomy.gov"), testedRangeMi: f(190, "tested", "medium", "70-mph test of the same-pack 2020 SL Plus (InsideEVs): 190 mi") },
    charging: {
      portStandard: f("CHAdeMO", "mfr", "high", "AC charging is standard J1772"),
      superchargerAccess: f("none", "mfr", "high", "No CHAdeMO→NACS adapter exists"),
      dcPeakKw: f(100, "agg", "medium"),
    },
    thermal: { heatPump: f("standard", "agg", "medium", "Hybrid heater on SV/SL Plus") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      batteryTransfers: f(true, "mfr", "high", "“Original and subsequent owner(s)”, voided only if exported within 6 months of first sale"),
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
    // Same pack as its trim siblings; packVariant groups them for peer
    // pooling (lib/listings/enrich.ts packIdentity) - the value restates
    // this row's own battery fact.
    packVariant: "62 kWh e+",
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
      batteryTransfers: f(true, "mfr", "high", "“Original and subsequent owner(s)”, voided only if exported within 6 months of first sale"),
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

  // ---------------------------------------------------------------------
  // Nissan Ariya MY2023-2025. Re-keyed on the VIN 2026-08-22, because the
  // trim string was deciding the PACK and getting it wrong in the expensive
  // direction: 20 live 63 kWh cars were being shown an 87 kWh pack and 62-73
  // more miles than EPA files for them, having fallen through to the 87 kWh
  // rows on a junk trim (48 listings arrive with the body style "Small" in
  // the trim field) or on no trim at all. One of them, JN1CF0BB9RM735014, the
  // dealer itself advertises as "ENGAGE+ e-4ORCE"; the VIN says plain Engage.
  //
  // The VIN's descriptor separates all six configurations with no overlap in
  // 951 live listings, and vPIC corroborates it per VIN (EngineKW 66 on every
  // 63 kWh car, 91 on every 87 kWh one; Trim returns VENTURE only on position
  // 7 = A and PLAT only on position 7 = C). Position 8 carries the drivetrain
  // and says nothing about the pack, which is why vin8 alone could not do it.
  //
  //   AF0B  FWD 63  216      CF0B  AWD 63  205
  //   BF0B  FWD 87  289      DF0B  AWD 87  272
  //   BF0A  FWD 87  304      DF0C  AWD 87  267   (Venture+ / Platinum+)
  //
  // Every rating is identical across 2023, 2024 and 2025, so one row spans
  // all three. `ignoreKwhHint` is set for the same reason the Lightning rows
  // set it: vPIC returns BatteryKWh 66 with BatteryKWh_to 91 for the Ariya, a
  // model-level RANGE rather than a per-VIN value, and lib/vpic.ts reads the
  // low end. That hint was vetoing the 87 kWh rows on three cars that are
  // 87 kWh.
  //
  // Platinum+ is EPA-rated 267 on 19-inch wheels and 257 on 20s. Nissan's own
  // product page captions the car "with available 20-inch wheels", so 19s are
  // standard and 267 is the standard configuration's figure.
  // ---------------------------------------------------------------------

  {
    id: "ariya-63-fwd",
    make: "NISSAN",
    model: "Ariya",
    // vPIC calls this car "Ariya Hatchback"; the feed calls it "ARIYA". The
    // /vin/ page matches on the decoder's string, so without this alias every
    // Ariya answered the VIN check with "No researched row for this model
    // yet" — see tests/phev-vpic-aliases.test.ts. The `vds` filter below does
    // NOT cover this: it picks between rows once the model has matched, so a
    // model-string miss loses all six rows before it ever runs.
    modelAliases: ["Ariya Hatchback", "Ariya MPV"],
    modelYears: [2023, 2025],
    vds: ["AF0B"],
    drive: "FWD",
    ignoreKwhHint: true,
    battery: { packUsableKwh: f(63, "mfr", "medium"), chemistry: f("NMC", "agg", "medium") },
    range: { epaRangeMi: f(216, "mfr", "high", undefined, epa(46013)) },
    charging: {
      portStandard: f("CCS1", "mfr"),
      superchargerAccess: f("adapter", "mfr", "high", "Nissan OEM NACS adapter (part T99F9-5MP1B), early 2025"),
      dcPeakKw: f(130, "agg", "medium"),
    },
    thermal: { heatPump: f("standard", "agg", "medium") },
    warranty: { batteryYears: f(8, "agg", "medium"), batteryMiles: f(100_000, "agg", "medium") },
    buyerNotes: [
      {
        headline: "2023 build-year recalls, confirm completion",
        body: "2023-only: steering-wheel bolt (23V-131), inverter software that can shut down the EV system while driving (23V-657 + 24V-560), front-motor O-rings (24V-391). All have free fixes; check this VIN's status.",
        severity: "warning",
      },
    ],
  },

  {
    id: "ariya-63-awd",
    make: "NISSAN",
    model: "Ariya",
    // vPIC calls this car "Ariya Hatchback"; the feed calls it "ARIYA". The
    // /vin/ page matches on the decoder's string, so without this alias every
    // Ariya answered the VIN check with "No researched row for this model
    // yet" — see tests/phev-vpic-aliases.test.ts. The `vds` filter below does
    // NOT cover this: it picks between rows once the model has matched, so a
    // model-string miss loses all six rows before it ever runs.
    modelAliases: ["Ariya Hatchback", "Ariya MPV"],
    modelYears: [2023, 2025],
    vds: ["CF0B"],
    drive: "AWD",
    ignoreKwhHint: true,
    battery: { packUsableKwh: f(63, "mfr", "medium"), chemistry: f("NMC", "agg", "medium") },
    range: { epaRangeMi: f(205, "mfr", "high", undefined, epa(46990)) },
    charging: {
      portStandard: f("CCS1", "mfr"),
      superchargerAccess: f("adapter", "mfr", "high", "Nissan OEM NACS adapter (part T99F9-5MP1B), early 2025"),
      dcPeakKw: f(130, "agg", "medium"),
    },
    thermal: { heatPump: f("standard", "agg", "medium") },
    warranty: { batteryYears: f(8, "agg", "medium"), batteryMiles: f(100_000, "agg", "medium") },
    buyerNotes: [
      {
        headline: "2023 build-year recalls, confirm completion",
        body: "2023-only: steering-wheel bolt (23V-131), inverter software that can shut down the EV system while driving (23V-657 + 24V-560), front-motor O-rings (24V-391). All have free fixes; check this VIN's status.",
        severity: "warning",
      },
    ],
  },

  {
    id: "ariya-87-fwd",
    make: "NISSAN",
    model: "Ariya",
    // vPIC calls this car "Ariya Hatchback"; the feed calls it "ARIYA". The
    // /vin/ page matches on the decoder's string, so without this alias every
    // Ariya answered the VIN check with "No researched row for this model
    // yet" — see tests/phev-vpic-aliases.test.ts. The `vds` filter below does
    // NOT cover this: it picks between rows once the model has matched, so a
    // model-string miss loses all six rows before it ever runs.
    modelAliases: ["Ariya Hatchback", "Ariya MPV"],
    modelYears: [2023, 2025],
    vds: ["BF0B"],
    drive: "FWD",
    ignoreKwhHint: true,
    battery: { packUsableKwh: f(87, "mfr", "medium"), chemistry: f("NMC", "agg", "medium") },
    range: { epaRangeMi: f(289, "mfr", "high", undefined, epa(46014)) },
    charging: {
      portStandard: f("CCS1", "mfr"),
      superchargerAccess: f("adapter", "mfr", "high", "Nissan OEM NACS adapter (part T99F9-5MP1B), early 2025"),
      dcPeakKw: f(130, "agg", "medium"),
    },
    thermal: { heatPump: f("standard", "agg", "medium") },
    warranty: { batteryYears: f(8, "agg", "medium"), batteryMiles: f(100_000, "agg", "medium") },
    buyerNotes: [
      {
        headline: "2023 build-year recalls, confirm completion",
        body: "2023-only: steering-wheel bolt (23V-131), inverter software that can shut down the EV system while driving (23V-657 + 24V-560), front-motor O-rings (24V-391). All have free fixes; check this VIN's status.",
        severity: "warning",
      },
    ],
  },

  {
    id: "ariya-87-fwd-venture",
    make: "NISSAN",
    model: "Ariya",
    // vPIC calls this car "Ariya Hatchback"; the feed calls it "ARIYA". The
    // /vin/ page matches on the decoder's string, so without this alias every
    // Ariya answered the VIN check with "No researched row for this model
    // yet" — see tests/phev-vpic-aliases.test.ts. The `vds` filter below does
    // NOT cover this: it picks between rows once the model has matched, so a
    // model-string miss loses all six rows before it ever runs.
    modelAliases: ["Ariya Hatchback", "Ariya MPV"],
    modelYears: [2023, 2025],
    vds: ["BF0A"],
    drive: "FWD",
    ignoreKwhHint: true,
    battery: { packUsableKwh: f(87, "mfr", "medium"), chemistry: f("NMC", "agg", "medium") },
    range: { epaRangeMi: f(304, "mfr", "high", undefined, epa(46015)) },
    charging: {
      portStandard: f("CCS1", "mfr"),
      superchargerAccess: f("adapter", "mfr", "high", "Nissan OEM NACS adapter (part T99F9-5MP1B), early 2025"),
      dcPeakKw: f(130, "agg", "medium"),
    },
    thermal: { heatPump: f("standard", "agg", "medium") },
    warranty: { batteryYears: f(8, "agg", "medium"), batteryMiles: f(100_000, "agg", "medium") },
    buyerNotes: [
      {
        headline: "2023 build-year recalls, confirm completion",
        body: "2023-only: steering-wheel bolt (23V-131), inverter software that can shut down the EV system while driving (23V-657 + 24V-560), front-motor O-rings (24V-391). All have free fixes; check this VIN's status.",
        severity: "warning",
      },
    ],
  },

  {
    id: "ariya-87-awd",
    make: "NISSAN",
    model: "Ariya",
    // vPIC calls this car "Ariya Hatchback"; the feed calls it "ARIYA". The
    // /vin/ page matches on the decoder's string, so without this alias every
    // Ariya answered the VIN check with "No researched row for this model
    // yet" — see tests/phev-vpic-aliases.test.ts. The `vds` filter below does
    // NOT cover this: it picks between rows once the model has matched, so a
    // model-string miss loses all six rows before it ever runs.
    modelAliases: ["Ariya Hatchback", "Ariya MPV"],
    modelYears: [2023, 2025],
    vds: ["DF0B"],
    drive: "AWD",
    ignoreKwhHint: true,
    battery: { packUsableKwh: f(87, "mfr", "medium"), chemistry: f("NMC", "agg", "medium") },
    range: { epaRangeMi: f(272, "mfr", "high", undefined, epa(46989)) },
    charging: {
      portStandard: f("CCS1", "mfr"),
      superchargerAccess: f("adapter", "mfr", "high", "Nissan OEM NACS adapter (part T99F9-5MP1B), early 2025"),
      dcPeakKw: f(130, "agg", "medium"),
    },
    thermal: { heatPump: f("standard", "agg", "medium") },
    warranty: { batteryYears: f(8, "agg", "medium"), batteryMiles: f(100_000, "agg", "medium") },
    buyerNotes: [
      {
        headline: "2023 build-year recalls, confirm completion",
        body: "2023-only: steering-wheel bolt (23V-131), inverter software that can shut down the EV system while driving (23V-657 + 24V-560), front-motor O-rings (24V-391). All have free fixes; check this VIN's status.",
        severity: "warning",
      },
    ],
  },

  {
    id: "ariya-87-awd-platinum",
    make: "NISSAN",
    model: "Ariya",
    // vPIC calls this car "Ariya Hatchback"; the feed calls it "ARIYA". The
    // /vin/ page matches on the decoder's string, so without this alias every
    // Ariya answered the VIN check with "No researched row for this model
    // yet" — see tests/phev-vpic-aliases.test.ts. The `vds` filter below does
    // NOT cover this: it picks between rows once the model has matched, so a
    // model-string miss loses all six rows before it ever runs.
    modelAliases: ["Ariya Hatchback", "Ariya MPV"],
    modelYears: [2023, 2025],
    vds: ["DF0C"],
    drive: "AWD",
    ignoreKwhHint: true,
    battery: { packUsableKwh: f(87, "mfr", "medium"), chemistry: f("NMC", "agg", "medium") },
    range: { epaRangeMi: f(267, "mfr", "high", "19-inch wheels", epa(46991)) },
    charging: {
      portStandard: f("CCS1", "mfr"),
      superchargerAccess: f("adapter", "mfr", "high", "Nissan OEM NACS adapter (part T99F9-5MP1B), early 2025"),
      dcPeakKw: f(130, "agg", "medium"),
    },
    thermal: { heatPump: f("standard", "agg", "medium") },
    warranty: { batteryYears: f(8, "agg", "medium"), batteryMiles: f(100_000, "agg", "medium") },
    buyerNotes: [
      {
        headline: "2023 build-year recalls, confirm completion",
        body: "2023-only: steering-wheel bolt (23V-131), inverter software that can shut down the EV system while driving (23V-657 + 24V-560), front-motor O-rings (24V-391). All have free fixes; check this VIN's status.",
        severity: "warning",
      },
    ],
  },

  // ---------------------------------------------------------------------
  // Toyota bZ4X MY2023-2025. Re-keyed on trim 2026-08-22, same shape as the
  // 2026 bZ: one row per drivetrain carrying what every grade shares and NO
  // range, plus a trim-keyed row per grade. The rows used to be keyed on
  // drivetrain alone and were wrong in both directions on 162 live listings -
  // 91 Limiteds shown the XLE's figure (252 where EPA files 242, 228 where it
  // files 222) and 51 XLE FWDs shown the Limited's 236 where EPA files 252,
  // because the MY2024-25 FWD row carried the Limited number for both grades.
  //
  // EPA never prints the word "XLE": the plain "bZ4X" entry is XLE by
  // elimination from the US lineup. That holds for 2023-24, where XLE and
  // Limited are the whole lineup, and stops holding for 2025, when Nightshade
  // joins - which is exactly why the XLE rows are keyed to the trim string
  // rather than left trim-agnostic. A Nightshade matches the drivetrain row
  // and is shown no range, because EPA's third 2025 AWD entry (id 49128, 20in
  // wheels, 222 mi) is only PLAUSIBLY the Nightshade and we have no primary
  // source saying so.
  //
  // EPA records (re-pulled 2026-08-22): XLE FWD 252 all three years (45756 /
  // 47918 / 49126); Limited FWD 242 in 2023 (45757) then 236 (47919 / 48997);
  // XLE AWD 228 (45758 / 47920 / 49127); Limited AWD 222 (45759 / 47921 /
  // 49129). Pack from the EPA wall-energy figures: FWD 71.4 (Panasonic), AWD
  // 72.8 (CATL) - the AWD rows used to print the FWD's 71.4 while their own
  // note said 72.8.
  // ---------------------------------------------------------------------

  {
    id: "bz4x-fwd",
    make: "TOYOTA",
    model: "bZ4X",
    modelYears: [2023, 2025],
    drive: "FWD",
    // The base row of the pair: XLE and Limited are 252 and 242/236, and this
    // row is what a car matches when its trim string names neither. Printing
    // one of the two would be a coin flip on a shopper's range.
    abstains: { epaRangeMi: "Varies by grade (XLE 252, Limited 242 then 236); the trim-keyed rows below carry it, and a car whose grade we cannot read is shown nothing" },
    battery: { packGrossKwh: f(71.4, "est", "medium"), chemistry: f("NMC", "agg", "medium") },
    charging: {
      portStandard: f("CCS1", "mfr", "high", "Free OEM NACS adapter program for MY23–25"),
      superchargerAccess: f("adapter", "mfr"),
      dcPeakKw: f(150, "agg", "medium"),
    },
    thermal: { heatPump: f("standard", "mfr", "high") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(70, "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high"),
    },
    buyerNotes: [
      {
        headline: "Launch recall: wheels could detach, and early software gimped charging",
        body: "The 2022 launch stop-sale (22V-444) was for wheel hub bolts loosening to the point of wheel detachment; verify the remedy on any 2023. Early software also refused DC fast charging below 32°F on AWD cars and limited sessions, confirm software is current. AWD's 100 kW charging cap is permanent.",
        severity: "warning",
      },
    ],
  },

  {
    id: "bz4x-xle-fwd",
    make: "TOYOTA",
    model: "bZ4X",
    modelYears: [2023, 2025],
    trim: "XLE",
    drive: "FWD",
    battery: { packGrossKwh: f(71.4, "est", "medium"), chemistry: f("NMC", "agg", "medium") },
    range: { epaRangeMi: f(252, "mfr", "high", undefined, epa(45756)) },
    charging: {
      portStandard: f("CCS1", "mfr", "high", "Free OEM NACS adapter program for MY23–25"),
      superchargerAccess: f("adapter", "mfr"),
      dcPeakKw: f(150, "agg", "medium"),
    },
    thermal: { heatPump: f("standard", "mfr", "high") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(70, "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high"),
    },
    buyerNotes: [
      {
        headline: "Launch recall: wheels could detach, and early software gimped charging",
        body: "The 2022 launch stop-sale (22V-444) was for wheel hub bolts loosening to the point of wheel detachment; verify the remedy on any 2023. Early software also refused DC fast charging below 32°F on AWD cars and limited sessions, confirm software is current. AWD's 100 kW charging cap is permanent.",
        severity: "warning",
      },
    ],
  },

  {
    id: "bz4x-ltd-fwd-2023",
    make: "TOYOTA",
    model: "bZ4X",
    modelYears: [2023, 2023],
    trim: "Limited",
    drive: "FWD",
    battery: { packGrossKwh: f(71.4, "est", "medium"), chemistry: f("NMC", "agg", "medium") },
    range: { epaRangeMi: f(242, "mfr", "high", undefined, epa(45757)), testedRangeMi: f(227, "tested", "medium", "Edmunds mixed loop") },
    charging: {
      portStandard: f("CCS1", "mfr", "high", "Free OEM NACS adapter program for MY23–25"),
      superchargerAccess: f("adapter", "mfr"),
      dcPeakKw: f(150, "agg", "medium"),
    },
    thermal: { heatPump: f("standard", "mfr", "high") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(70, "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high"),
    },
    buyerNotes: [
      {
        headline: "Launch recall: wheels could detach, and early software gimped charging",
        body: "The 2022 launch stop-sale (22V-444) was for wheel hub bolts loosening to the point of wheel detachment; verify the remedy on any 2023. Early software also refused DC fast charging below 32°F on AWD cars and limited sessions, confirm software is current. AWD's 100 kW charging cap is permanent.",
        severity: "warning",
      },
    ],
  },

  {
    id: "bz4x-ltd-fwd-2024",
    make: "TOYOTA",
    model: "bZ4X",
    modelYears: [2024, 2025],
    trim: "Limited",
    drive: "FWD",
    battery: { packGrossKwh: f(71.4, "est", "medium"), chemistry: f("NMC", "agg", "medium") },
    range: { epaRangeMi: f(236, "mfr", "high", undefined, epa(47919)) },
    charging: {
      portStandard: f("CCS1", "mfr", "high", "Free OEM NACS adapter program for MY23–25"),
      superchargerAccess: f("adapter", "mfr"),
      dcPeakKw: f(150, "agg", "medium"),
    },
    thermal: { heatPump: f("standard", "mfr", "high") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(70, "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high"),
    },
    buyerNotes: [
      {
        headline: "Launch recall: wheels could detach, and early software gimped charging",
        body: "The 2022 launch stop-sale (22V-444) was for wheel hub bolts loosening to the point of wheel detachment; verify the remedy on any 2023. Early software also refused DC fast charging below 32°F on AWD cars and limited sessions, confirm software is current. AWD's 100 kW charging cap is permanent.",
        severity: "warning",
      },
    ],
  },

  {
    id: "bz4x-awd",
    make: "TOYOTA",
    model: "bZ4X",
    modelYears: [2023, 2025],
    drive: "AWD",
    // Base row, and the 2025 Nightshade lands here: EPA's third 2025 AWD
    // entry (id 49128, 222 mi) is only plausibly its rating and no primary
    // source says so, so this row says nothing rather than guessing.
    abstains: { epaRangeMi: "Varies by grade (XLE 228, Limited 222); the trim-keyed rows below carry it, and the 2025 Nightshade matches here because no source ties it to an EPA record" },
    battery: { packGrossKwh: f(72.8, "est", "medium"), chemistry: f("NMC", "agg", "medium") },
    charging: {
      portStandard: f("CCS1", "mfr", "high", "Free OEM NACS adapter program for MY23–25"),
      superchargerAccess: f("adapter", "mfr"),
      dcPeakKw: f(100, "agg", "medium"),
    },
    thermal: { heatPump: f("standard", "mfr", "high") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(70, "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high"),
    },
    buyerNotes: [
      {
        headline: "Launch recall: wheels could detach, and early software gimped charging",
        body: "The 2022 launch stop-sale (22V-444) was for wheel hub bolts loosening to the point of wheel detachment; verify the remedy on any 2023. Early software also refused DC fast charging below 32°F on AWD cars and limited sessions, confirm software is current. AWD's 100 kW charging cap is permanent.",
        severity: "warning",
      },
    ],
  },

  {
    id: "bz4x-xle-awd",
    make: "TOYOTA",
    model: "bZ4X",
    modelYears: [2023, 2024],
    trim: "XLE",
    drive: "AWD",
    battery: { packGrossKwh: f(72.8, "est", "medium"), chemistry: f("NMC", "agg", "medium") },
    range: { epaRangeMi: f(228, "mfr", "high", undefined, epa(45758)) },
    charging: {
      portStandard: f("CCS1", "mfr", "high", "Free OEM NACS adapter program for MY23–25"),
      superchargerAccess: f("adapter", "mfr"),
      dcPeakKw: f(100, "agg", "medium"),
    },
    thermal: { heatPump: f("standard", "mfr", "high") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(70, "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high"),
    },
    buyerNotes: [
      {
        headline: "Launch recall: wheels could detach, and early software gimped charging",
        body: "The 2022 launch stop-sale (22V-444) was for wheel hub bolts loosening to the point of wheel detachment; verify the remedy on any 2023. Early software also refused DC fast charging below 32°F on AWD cars and limited sessions, confirm software is current. AWD's 100 kW charging cap is permanent.",
        severity: "warning",
      },
    ],
  },

  {
    id: "bz4x-xle-awd-2025",
    make: "TOYOTA",
    model: "bZ4X",
    modelYears: [2025, 2025],
    trim: "XLE",
    drive: "AWD",
    battery: { packGrossKwh: f(72.8, "est", "medium"), chemistry: f("NMC", "agg", "medium") },
    range: { epaRangeMi: f(228, "mfr", "high", "18-inch wheels", epa(49127)) },
    charging: {
      portStandard: f("CCS1", "mfr", "high", "Free OEM NACS adapter program for MY23–25"),
      superchargerAccess: f("adapter", "mfr"),
      dcPeakKw: f(100, "agg", "medium"),
    },
    thermal: { heatPump: f("standard", "mfr", "high") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(70, "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high"),
    },
    buyerNotes: [
      {
        headline: "Launch recall: wheels could detach, and early software gimped charging",
        body: "The 2022 launch stop-sale (22V-444) was for wheel hub bolts loosening to the point of wheel detachment; verify the remedy on any 2023. Early software also refused DC fast charging below 32°F on AWD cars and limited sessions, confirm software is current. AWD's 100 kW charging cap is permanent.",
        severity: "warning",
      },
    ],
  },

  {
    id: "bz4x-ltd-awd",
    make: "TOYOTA",
    model: "bZ4X",
    modelYears: [2023, 2025],
    trim: "Limited",
    drive: "AWD",
    battery: { packGrossKwh: f(72.8, "est", "medium"), chemistry: f("NMC", "agg", "medium") },
    range: { epaRangeMi: f(222, "mfr", "high", undefined, epa(45759)), testedRangeMi: f(160, "tested", "high", "75 mph (Car and Driver)") },
    charging: {
      portStandard: f("CCS1", "mfr", "high", "Free OEM NACS adapter program for MY23–25"),
      superchargerAccess: f("adapter", "mfr"),
      dcPeakKw: f(100, "agg", "medium"),
    },
    thermal: { heatPump: f("standard", "mfr", "high") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(70, "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high"),
    },
    buyerNotes: [
      {
        headline: "Launch recall: wheels could detach, and early software gimped charging",
        body: "The 2022 launch stop-sale (22V-444) was for wheel hub bolts loosening to the point of wheel detachment; verify the remedy on any 2023. Early software also refused DC fast charging below 32°F on AWD cars and limited sessions, confirm software is current. AWD's 100 kW charging cap is permanent.",
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
    battery: { packGrossKwh: f(102, "mfr", "medium"), chemistry: f("NCMA", "agg", "medium") },
    range: { epaRangeMi: f(312, "mfr", "high", "2023: 312; 2024: 314, EPA", "https://www.fueleconomy.gov"), testedRangeMi: f(330, "tested", "high", "70-mph (InsideEVs, 2023 RWD): 330 mi; 75-mph (C&D): 270; Edmunds loop (2024): 319") },
    charging: {
      portStandard: f("CCS1", "agg", "high"),
      superchargerAccess: f("adapter", "agg", "high", "GM $225 NACS adapter"),
      dcPeakKw: f(190, "agg", "medium"),
    },
    thermal: { heatPump: f("standard", "agg", "medium", "Ultium Energy Recovery") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(75, "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high"),
    },
    buyerNotes: [
      {
        headline: "Early cars: blank-display recalls and infotainment growing pains",
        body: "2023–24: driver display can go blank while driving (22V-710, 25V-356, software fixes), plus 23V-367 (HV battery pack connections, 2023) and 24V-589 (AWD ABS activation). All free fixes, check completion on this VIN. Early 2023 software was rough; later updates substantially improved it.",
        severity: "warning",
      },
    ],
  },

  {
    id: "lyriq-2025-rwd", // vin8 + 2027 extension (same 326 rating) added 2026-08-14
    make: "CADILLAC",
    model: "Lyriq",
    modelYears: [2025, 2027],
    vin8: ["K"], // GM Part 565: K = RWD, L = PAWD
    // The V-Series is 1GYXP where an ordinary Lyriq is 1GYKP, and those two
    // are the only descriptors in 5,610 live listings. Keying both sides of
    // the split means a real V is never served an ordinary car's range just
    // because its trim field reads "-V", which is below the trim matcher's
    // three-character floor.
    vds: ["KP"],
    drive: "RWD",
    battery: { packGrossKwh: f(102, "mfr", "medium"), chemistry: f("NCMA", "agg", "medium") },
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
      sohFloorPct: f(75, "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high"),
    },
    buyerNotes: [
      {
        headline: "Early cars: blank-display recalls and infotainment growing pains",
        body: "2023–24: driver display can go blank while driving (22V-710, 25V-356, software fixes), plus 23V-367 (HV battery pack connections, 2023) and 24V-589 (AWD ABS activation). All free fixes, check completion on this VIN. Early 2023 software was rough; later updates substantially improved it.",
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
    battery: { packGrossKwh: f(102, "mfr", "medium"), chemistry: f("NCMA", "agg", "medium") },
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
      sohFloorPct: f(75, "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high"),
    },
    buyerNotes: [
      {
        headline: "Early cars: blank-display recalls and infotainment growing pains",
        body: "2023–24: driver display can go blank while driving (22V-710, 25V-356, software fixes), plus 23V-367 (HV battery pack connections, 2023) and 24V-589 (AWD ABS activation). All free fixes, check completion on this VIN. Early 2023 software was rough; later updates substantially improved it.",
        severity: "warning",
      },
    ],
  },

  {
    // 319, not 303. EPA certifies the AWD Lyriq twice, by onboard charger:
    // 11.5 kW rates 319 and the optional 19.2 kW rates 303, and not one of
    // 4,579 live MY2025-27 listings states which it has. The standard
    // configuration is the 11.5 kW module, so 319 is the figure this row owes
    // its shopper. Verified two ways: GM's own Monroney for a real MY2025 car
    // (1GYKPNRL3SZ307993) reads "CHARGING MODULE, 11.5 KW" and "Driving Range
    // ... 319 miles", and Cadillac's MY2027 LYRIQ page lists the 11.5 kW
    // module under key STANDARD features with the 19.2 kW under AVAILABLE
    // ones. MY2026 is inferred from the identical EPA structure between two
    // verified years, not from a document of its own.
    id: "lyriq-2025-awd",
    make: "CADILLAC",
    model: "Lyriq",
    modelYears: [2025, 2027],
    vin8: ["L"], // GM Part 565: L = RWD + PAWD (dual motor)
    vds: ["KP"], // ordinary Lyriq; the V-Series is 1GYXP — see lyriq-2025-rwd
    drive: "AWD",
    battery: { packGrossKwh: f(102, "mfr", "medium"), chemistry: f("NCMA", "agg", "medium") },
    range: { epaRangeMi: f(319, "mfr", "high", "11.5 kW onboard charger, standard", epa(48692)) },
    charging: {
      portStandard: f("CCS1", "agg", "high"),
      superchargerAccess: f("adapter", "agg", "high", "GM $225 NACS adapter"),
      dcPeakKw: f(190, "agg", "medium"),
    },
    thermal: { heatPump: f("standard", "agg", "medium", "Ultium Energy Recovery") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(75, "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high"),
    },
    buyerNotes: [
      {
        headline: "Early cars: blank-display recalls and infotainment growing pains",
        body: "2023–24: driver display can go blank while driving (22V-710, 25V-356, software fixes), plus 23V-367 (HV battery pack connections, 2023) and 24V-589 (AWD ABS activation). All free fixes, check completion on this VIN. Early 2023 software was rough; later updates substantially improved it.",
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
    battery: { packGrossKwh: f(85, "mfr", "medium", "GM Ultium pack"), chemistry: f("NCMA", "agg", "medium") },
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
      sohFloorPct: f(75, "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high"),
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
    battery: { packGrossKwh: f(85, "mfr", "medium", "GM Ultium pack"), chemistry: f("NCMA", "agg", "medium") },
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
      sohFloorPct: f(75, "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high"),
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
    trim: ["EX", "Touring"],
    vds: ["KHV", "KHX"],
    drive: "AWD",
    battery: { packGrossKwh: f(85, "mfr", "medium", "GM Ultium pack"), chemistry: f("NCMA", "agg", "medium") },
    range: { epaRangeMi: f(281, "mfr", "high", undefined, epa(47830)), testedRangeMi: f(240, "tested", "medium", "75-mph (Car and Driver, Elite AWD): 240 mi; Edmunds mixed loop: 320") },
    charging: {
      portStandard: f("CCS1", "mfr"),
      superchargerAccess: f("adapter", "mfr", "high", "Honda-approved NACS adapter, mid-2025"),
      dcPeakKw: f(155, "agg", "medium"),
    },
    thermal: { heatPump: f("standard", "agg", "medium", "Ultium Energy Recovery") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(75, "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high"),
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
    // Honda certifies the Elite separately from EX and Touring in every year,
    // and the MY2024 Elite row was missing: 44 live 2024 Elites fell into the
    // EX/Touring row and printed 281 against their own 273. Keyed on the VIN
    // descriptor as well as the trim — KHZ is the Elite AWD — so a trim-less
    // Elite resolves too.
    id: "prologue-2024-awd-elite",
    make: "HONDA",
    model: "Prologue",
    modelYears: [2024, 2024],
    trim: "Elite",
    vds: ["KHZ"],
    drive: "AWD",
    battery: { packGrossKwh: f(85, "mfr", "medium", "GM Ultium pack"), chemistry: f("NCMA", "agg", "medium") },
    range: { epaRangeMi: f(273, "mfr", "high", undefined, epa(47829)), testedRangeMi: f(240, "tested", "medium", "75-mph (Car and Driver, Elite AWD): 240 mi; Edmunds mixed loop: 320") },
    charging: {
      portStandard: f("CCS1", "mfr"),
      superchargerAccess: f("adapter", "mfr", "high", "Honda-approved NACS adapter, mid-2025"),
      dcPeakKw: f(155, "agg", "medium"),
    },
    thermal: { heatPump: f("standard", "agg", "medium", "Ultium Energy Recovery") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(75, "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high"),
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
    trim: ["EX", "Touring"],
    vds: ["KHV", "KHX"],
    drive: "AWD",
    battery: { packGrossKwh: f(85, "mfr", "medium", "GM Ultium pack"), chemistry: f("NCMA", "agg", "medium") },
    range: { epaRangeMi: f(294, "mfr", "high", undefined, epa(49089)) },
    charging: {
      portStandard: f("CCS1", "mfr"),
      superchargerAccess: f("adapter", "mfr", "high", "Honda-approved NACS adapter, mid-2025"),
      dcPeakKw: f(155, "agg", "medium"),
    },
    thermal: { heatPump: f("standard", "agg", "medium", "Ultium Energy Recovery") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(75, "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high"),
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
    battery: { packGrossKwh: f(85, "mfr", "medium"), chemistry: f("NCMA", "agg", "medium") },
    range: { epaRangeMi: f(319, "mfr", "high", "All years, EPA", "https://www.fueleconomy.gov"), testedRangeMi: f(303, "tested", "high", "70-mph (InsideEVs, 2024 2RS FWD): 303 mi; 75-mph (C&D): 260; Edmunds loop (2025): 356") },
    charging: {
      portStandard: f("CCS1", "agg", "high"),
      superchargerAccess: f("adapter", "agg", "high", "GM $225 NACS adapter"),
      dcPeakKw: f(150, "agg", "medium"),
    },
    thermal: { heatPump: f("standard", "agg", "medium", "Ultium Energy Recovery") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(75, "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high"),
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
    battery: { packGrossKwh: f(85, "mfr", "medium"), chemistry: f("NCMA", "agg", "medium") },
    range: { epaRangeMi: f(297, "mfr", "high", "2024: 285; 2025–26: 307 (288 with 19.2 kW charger), EPA", "https://www.fueleconomy.gov"), testedRangeMi: f(260, "tested", "low", "75 mph (Car and Driver)") },
    charging: {
      portStandard: f("CCS1", "agg", "high"),
      superchargerAccess: f("adapter", "agg", "high", "GM $225 NACS adapter"),
      dcPeakKw: f(150, "agg", "medium"),
    },
    thermal: { heatPump: f("standard", "agg", "medium", "Ultium Energy Recovery") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(75, "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high"),
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
    // The 22-inch wheel that rates 283 is part of a $3,750 option package on
    // RS FWD only, and nothing on a listing states wheel size — not the trim,
    // not the name, not the VIN (the two VDS codes differ by Super Cruise and
    // both appear at 283 and at 312). Standard is 19-inch on LT and 21-inch on
    // RS, and both rate 312.
    id: "blazer-fwd",
    make: "CHEVROLET",
    model: "Blazer EV",
    modelYears: [2025, 2026],
    drive: "FWD",
    battery: { packGrossKwh: f(85, "mfr", "medium", "FWD/AWD"), chemistry: f("NCMA", "agg", "medium") },
    range: { epaRangeMi: f(312, "mfr", "high", undefined, epa(49069)) },
    charging: {
      portStandard: f("CCS1", "agg", "high"),
      superchargerAccess: f("adapter", "agg", "high", "GM $225 NACS adapter"),
      dcPeakKw: f(150, "agg", "medium"),
    },
    thermal: { heatPump: f("standard", "agg", "medium", "Ultium Energy Recovery") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(75, "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high"),
    },
    buyerNotes: [
      {
        headline: "Early 2024s shipped with rough software, a stop-sale rough",
        body: "GM halted Blazer EV sales in Dec 2023 over software faults (frozen displays, DC-charging failures); the remedy was a service-campaign software update, not an NHTSA recall, confirm it was applied to early-VIN 2024 cars. NHTSA recalls: 24V-487 (front lower control arm), 25V-433/26V-031 (parking-brake harness). No Apple CarPlay or Android Auto on any trim.",
        severity: "warning",
      },
    ],
  },

  {
    // Split by year 2026-08-22: the row spanned 2024-26 at 283 and MY2024 is
    // certified 279.
    id: "blazer-awd-2024",
    make: "CHEVROLET",
    model: "Blazer EV",
    modelYears: [2024, 2024],
    drive: "AWD",
    battery: { packGrossKwh: f(85, "mfr", "medium", "FWD/AWD"), chemistry: f("NCMA", "agg", "medium") },
    range: { epaRangeMi: f(279, "mfr", "high", undefined, epa(47445)), testedRangeMi: f(200, "tested", "high", "75-mph (Car and Driver, 2024 RS AWD): 200 mi vs 279 EPA; Edmunds mixed loop: 320") },
    charging: {
      portStandard: f("CCS1", "agg", "high"),
      superchargerAccess: f("adapter", "agg", "high", "GM $225 NACS adapter"),
      dcPeakKw: f(150, "agg", "medium"),
    },
    thermal: { heatPump: f("standard", "agg", "medium", "Ultium Energy Recovery") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(75, "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high"),
    },
    buyerNotes: [
      {
        headline: "Early 2024s shipped with rough software, a stop-sale rough",
        body: "GM halted Blazer EV sales in Dec 2023 over software faults (frozen displays, DC-charging failures); the remedy was a service-campaign software update, not an NHTSA recall, confirm it was applied to early-VIN 2024 cars. NHTSA recalls: 24V-487 (front lower control arm), 25V-433/26V-031 (parking-brake harness). No Apple CarPlay or Android Auto on any trim.",
        severity: "warning",
      },
    ],
  },

  {
    // Split by year 2026-08-22: the row spanned 2024-26 at 283 and MY2024 is
    // certified 279.
    id: "blazer-awd-2025",
    make: "CHEVROLET",
    model: "Blazer EV",
    modelYears: [2025, 2026],
    drive: "AWD",
    battery: { packGrossKwh: f(85, "mfr", "medium", "FWD/AWD"), chemistry: f("NCMA", "agg", "medium") },
    range: { epaRangeMi: f(283, "mfr", "high", undefined, epa(48342)), testedRangeMi: f(200, "tested", "high", "75-mph (Car and Driver, 2024 RS AWD): 200 mi vs 279 EPA; Edmunds mixed loop: 320") },
    charging: {
      portStandard: f("CCS1", "agg", "high"),
      superchargerAccess: f("adapter", "agg", "high", "GM $225 NACS adapter"),
      dcPeakKw: f(150, "agg", "medium"),
    },
    thermal: { heatPump: f("standard", "agg", "medium", "Ultium Energy Recovery") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(75, "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high"),
    },
    buyerNotes: [
      {
        headline: "Early 2024s shipped with rough software, a stop-sale rough",
        body: "GM halted Blazer EV sales in Dec 2023 over software faults (frozen displays, DC-charging failures); the remedy was a service-campaign software update, not an NHTSA recall, confirm it was applied to early-VIN 2024 cars. NHTSA recalls: 24V-487 (front lower control arm), 25V-433/26V-031 (parking-brake harness). No Apple CarPlay or Android Auto on any trim.",
        severity: "warning",
      },
    ],
  },

  {
    // Split by year 2026-08-22: 18 live MY2024 RS listings were printing
    // MY2025's 334 against their own 324.
    id: "blazer-rwd-2024",
    make: "CHEVROLET",
    model: "Blazer EV",
    modelYears: [2024, 2024],
    drive: "RWD",
    battery: { packGrossKwh: f(102, "mfr", "medium", "RWD/SS"), chemistry: f("NCMA", "agg", "medium") },
    range: { epaRangeMi: f(324, "mfr", "high", undefined, epa(47813)) },
    charging: {
      portStandard: f("CCS1", "agg", "high"),
      superchargerAccess: f("adapter", "agg", "high", "GM $225 NACS adapter"),
      dcPeakKw: f(190, "agg", "medium"),
    },
    thermal: { heatPump: f("standard", "agg", "medium", "Ultium Energy Recovery") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(75, "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high"),
    },
    buyerNotes: [
      {
        headline: "Early 2024s shipped with rough software, a stop-sale rough",
        body: "GM halted Blazer EV sales in Dec 2023 over software faults (frozen displays, DC-charging failures); the remedy was a service-campaign software update, not an NHTSA recall, confirm it was applied to early-VIN 2024 cars. NHTSA recalls: 24V-487 (front lower control arm), 25V-433/26V-031 (parking-brake harness). No Apple CarPlay or Android Auto on any trim.",
        severity: "warning",
      },
    ],
  },

  {
    // Split by year 2026-08-22: 18 live MY2024 RS listings were printing
    // MY2025's 334 against their own 324.
    id: "blazer-rwd-2025",
    make: "CHEVROLET",
    model: "Blazer EV",
    modelYears: [2025, 2025],
    drive: "RWD",
    battery: { packGrossKwh: f(102, "mfr", "medium", "RWD/SS"), chemistry: f("NCMA", "agg", "medium") },
    range: { epaRangeMi: f(334, "mfr", "high", undefined, epa(48694)) },
    charging: {
      portStandard: f("CCS1", "agg", "high"),
      superchargerAccess: f("adapter", "agg", "high", "GM $225 NACS adapter"),
      dcPeakKw: f(190, "agg", "medium"),
    },
    thermal: { heatPump: f("standard", "agg", "medium", "Ultium Energy Recovery") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(75, "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high"),
    },
    buyerNotes: [
      {
        headline: "Early 2024s shipped with rough software, a stop-sale rough",
        body: "GM halted Blazer EV sales in Dec 2023 over software faults (frozen displays, DC-charging failures); the remedy was a service-campaign software update, not an NHTSA recall, confirm it was applied to early-VIN 2024 cars. NHTSA recalls: 24V-487 (front lower control arm), 25V-433/26V-031 (parking-brake harness). No Apple CarPlay or Android Auto on any trim.",
        severity: "warning",
      },
    ],
  },

  {
    id: "blazer-ss-2025",
    make: "CHEVROLET",
    model: "Blazer EV",
    modelYears: [2025, 2025],
    trim: "SS",
    drive: "AWD",
    battery: { packGrossKwh: f(102, "mfr", "medium", "RWD/SS"), chemistry: f("NCMA", "agg", "medium") },
    range: { epaRangeMi: f(303, "mfr", "high", undefined, epa(49068)), testedRangeMi: f(250, "tested", "high", "75-mph (Car and Driver, 2025 SS): 250 mi") },
    charging: {
      portStandard: f("CCS1", "agg", "high"),
      superchargerAccess: f("adapter", "agg", "high", "GM $225 NACS adapter"),
      dcPeakKw: f(190, "agg", "medium"),
    },
    thermal: { heatPump: f("standard", "agg", "medium", "Ultium Energy Recovery") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(75, "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high"),
    },
    buyerNotes: [
      {
        headline: "Early 2024s shipped with rough software, a stop-sale rough",
        body: "GM halted Blazer EV sales in Dec 2023 over software faults (frozen displays, DC-charging failures); the remedy was a service-campaign software update, not an NHTSA recall, confirm it was applied to early-VIN 2024 cars. NHTSA recalls: 24V-487 (front lower control arm), 25V-433/26V-031 (parking-brake harness). No Apple CarPlay or Android Auto on any trim.",
        severity: "warning",
      },
    ],
  },

  {
    id: "blazer-ss-2026",
    make: "CHEVROLET",
    model: "Blazer EV",
    modelYears: [2026, 2026],
    trim: "SS",
    drive: "AWD",
    battery: { packGrossKwh: f(102, "mfr", "medium", "RWD/SS"), chemistry: f("NCMA", "agg", "medium") },
    range: { epaRangeMi: f(302, "mfr", "high", undefined, epa(49954)), testedRangeMi: f(250, "tested", "high", "75-mph (Car and Driver, 2025 SS): 250 mi") },
    charging: {
      portStandard: f("CCS1", "agg", "high"),
      superchargerAccess: f("adapter", "agg", "high", "GM $225 NACS adapter"),
      dcPeakKw: f(190, "agg", "medium"),
    },
    thermal: { heatPump: f("standard", "agg", "medium", "Ultium Energy Recovery") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(75, "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high"),
    },
    buyerNotes: [
      {
        headline: "Early 2024s shipped with rough software, a stop-sale rough",
        body: "GM halted Blazer EV sales in Dec 2023 over software faults (frozen displays, DC-charging failures); the remedy was a service-campaign software update, not an NHTSA recall, confirm it was applied to early-VIN 2024 cars. NHTSA recalls: 24V-487 (front lower control arm), 25V-433/26V-031 (parking-brake harness). No Apple CarPlay or Android Auto on any trim.",
        severity: "warning",
      },
    ],
  },

  {
    id: "hummer-ev-pickup",
    make: "GMC",
    model: "Hummer EV",
    // vPIC calls the truck "Hummer EV Pickup" (the SUV rows decode as
    // "Hummer EV SUV", which the corpus already answers to). Safe as an
    // alias because GMC's Hummer EV has only ever been electric — there is
    // no combustion car of that name for it to poach.
    modelAliases: ["Hummer EV Pickup"],
    modelYears: [2022, 2025],
    battery: { packUsableKwh: f(205, "est", "medium", "213.7 kWh gross; 2024+ 2M20 variants are smaller"), chemistry: f("NCMA", "agg", "medium") },
    range: { epaRangeMi: f(314, "mfr", "high", "2024–25: 298–318 by config/tires, EPA. 2022–23: no EPA rating exists (GM est. 329)", "https://www.fueleconomy.gov"), testedRangeMi: f(343, "tested", "high", "70-mph (InsideEVs, 2022 Edition 1): 343 mi, beat its 329 GM estimate; 75-mph (C&D): 290") },
    charging: {
      portStandard: f("CCS1", "agg", "high"),
      superchargerAccess: f("adapter", "agg", "high", "GM $225 NACS adapter"),
      dcPeakKw: f(350, "agg", "medium"),
    },
    thermal: { heatPump: f("standard", "agg", "medium", "Ultium Energy Recovery") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(75, "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high"),
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
    // Split by year 2026-08-22. This row printed 312 for both years, and 312
    // corresponds to no MY2024 configuration at all: MY2024 certifies 314
    // (standard tires) / 303 (2M20) / 298 and 279 (mud-terrain). 312 is
    // MY2025's 3X figure, written from 2025 data and stretched back over 149
    // live MY2024 listings. Mud-terrain tires are an extra-cost option, so the
    // unsuffixed certification is the standard fitment.
    id: "hummer-ev-suv-2024",
    make: "GMC",
    model: "Hummer EV SUV",
    modelYears: [2024, 2024],
    battery: { packUsableKwh: f(205, "est", "medium"), chemistry: f("NCMA", "agg", "medium") },
    range: { epaRangeMi: f(314, "mfr", "high", "All-terrain tires, standard", epa(46953)) },
    charging: {
      portStandard: f("CCS1", "agg", "high"),
      superchargerAccess: f("adapter", "agg", "high", "GM $225 NACS adapter"),
      dcPeakKw: f(350, "agg", "medium"),
    },
    thermal: { heatPump: f("standard", "agg", "medium", "Ultium Energy Recovery") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(75, "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high"),
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
    // Split by year 2026-08-22. This row printed 312 for both years, and 312
    // corresponds to no MY2024 configuration at all: MY2024 certifies 314
    // (standard tires) / 303 (2M20) / 298 and 279 (mud-terrain). 312 is
    // MY2025's 3X figure, written from 2025 data and stretched back over 149
    // live MY2024 listings. Mud-terrain tires are an extra-cost option, so the
    // unsuffixed certification is the standard fitment.
    id: "hummer-ev-suv-2025",
    make: "GMC",
    model: "Hummer EV SUV",
    modelYears: [2025, 2025],
    battery: { packUsableKwh: f(205, "est", "medium"), chemistry: f("NCMA", "agg", "medium") },
    range: { epaRangeMi: f(312, "mfr", "high", "All-terrain tires, standard", epa(48348)) },
    charging: {
      portStandard: f("CCS1", "agg", "high"),
      superchargerAccess: f("adapter", "agg", "high", "GM $225 NACS adapter"),
      dcPeakKw: f(350, "agg", "medium"),
    },
    thermal: { heatPump: f("standard", "agg", "medium", "Ultium Energy Recovery") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(75, "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high"),
    },
    buyerNotes: [
      {
        headline: "2022–23 trucks have no EPA range rating",
        body: "2022–23 Hummer EVs exceed the GVWR class the EPA rates, so any range figure quoted for them is GM's estimate (Edition 1: 329 mi), not an EPA rating. Curb weight ~9,000 lb; EPA efficiency (2024+, rated trucks): 47–53 MPGe. Recalls: 22V-771 (water intrusion in the HV battery enclosure, 2022–23 pickups) and 23V-367 (HV battery pack connections).",
        severity: "info",
      },
    ],
  },

  // ---------------------------------------------------------------------
  // Subaru Solterra MY2023-2025 (AWD only). One row used to cover the whole
  // lineup at 227 mi with the note "222-228 by year/trim" - and 229 live
  // Limited and Touring listings were claiming five miles more than EPA files
  // for them. EPA names the upper config "Limited/Touring AWD" explicitly;
  // the lower entry is plain "Solterra AWD", which is Premium by elimination
  // (the US lineup is exactly Premium/Limited/Touring). Split by trim, and
  // split Premium by year rather than collapsing its 228/227 - both are EPA's
  // own figure for that year, so there is nothing to round.
  //
  // EPA records (re-pulled 2026-08-22): Premium 228 in 2023 (46030), 227 in
  // 2024-25 (47482 / 48762); Limited/Touring 222 all three years (46031 /
  // 47483 / 48763). A trim we cannot read ("15 Series", "Premier", blank -
  // 18 listings) matches the trim-agnostic row and is shown no range.
  // ---------------------------------------------------------------------

  {
    id: "subaru-solterra",
    make: "SUBARU",
    model: "Solterra",
    modelYears: [2023, 2025],
    // Base row. The 18 listings whose trim reads "15 Series", "Premier" or
    // nothing at all match here and are shown the tested figure only.
    abstains: { epaRangeMi: "Varies by grade (Premium 228 in 2023 then 227, Limited/Touring 222); the trim-keyed rows below carry it, and an unreadable trim is shown nothing" },
    battery: {
      packGrossKwh: f(72.8, "mfr", "high", "CATL pack, shared with the bZ4X AWD"),
      chemistry: f("NMC", "agg", "medium"),
    },
    range: { testedRangeMi: f(200, "tested", "low", "75 mph (Car and Driver)") },
    charging: {
      portStandard: f("CCS1", "mfr"),
      superchargerAccess: f("adapter", "agg", "medium", "Adapter program alongside Toyota, late 2025"),
      dcPeakKw: f(100, "agg", "medium", "100 kW cap through MY2025"),
    },
    thermal: { heatPump: f("standard", "agg", "medium") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(70, "mfr", "high", "“Retention of 70% or more of the original battery capacity” (MY2023 BEV booklet; later years reported same)"),
      batteryTransfers: f(true, "mfr", "high"),
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
    id: "subaru-solterra-premium-2023",
    make: "SUBARU",
    model: "Solterra",
    modelYears: [2023, 2023],
    trim: "Premium",
    battery: {
      packGrossKwh: f(72.8, "mfr", "high", "CATL pack, shared with the bZ4X AWD"),
      chemistry: f("NMC", "agg", "medium"),
    },
    range: { epaRangeMi: f(228, "mfr", "high", undefined, epa(46030)), testedRangeMi: f(200, "tested", "low", "75 mph (Car and Driver)") },
    charging: {
      portStandard: f("CCS1", "mfr"),
      superchargerAccess: f("adapter", "agg", "medium", "Adapter program alongside Toyota, late 2025"),
      dcPeakKw: f(100, "agg", "medium", "100 kW cap through MY2025"),
    },
    thermal: { heatPump: f("standard", "agg", "medium") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(70, "mfr", "high", "“Retention of 70% or more of the original battery capacity” (MY2023 BEV booklet; later years reported same)"),
      batteryTransfers: f(true, "mfr", "high"),
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
    id: "subaru-solterra-premium-2024",
    make: "SUBARU",
    model: "Solterra",
    modelYears: [2024, 2025],
    trim: "Premium",
    battery: {
      packGrossKwh: f(72.8, "mfr", "high", "CATL pack, shared with the bZ4X AWD"),
      chemistry: f("NMC", "agg", "medium"),
    },
    range: { epaRangeMi: f(227, "mfr", "high", undefined, epa(47482)), testedRangeMi: f(200, "tested", "low", "75 mph (Car and Driver)") },
    charging: {
      portStandard: f("CCS1", "mfr"),
      superchargerAccess: f("adapter", "agg", "medium", "Adapter program alongside Toyota, late 2025"),
      dcPeakKw: f(100, "agg", "medium", "100 kW cap through MY2025"),
    },
    thermal: { heatPump: f("standard", "agg", "medium") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(70, "mfr", "high", "“Retention of 70% or more of the original battery capacity” (MY2023 BEV booklet; later years reported same)"),
      batteryTransfers: f(true, "mfr", "high"),
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
    id: "subaru-solterra-ltd-touring",
    make: "SUBARU",
    model: "Solterra",
    modelYears: [2023, 2025],
    trim: ["Limited", "Touring"],
    battery: {
      packGrossKwh: f(72.8, "mfr", "high", "CATL pack, shared with the bZ4X AWD"),
      chemistry: f("NMC", "agg", "medium"),
    },
    range: { epaRangeMi: f(222, "mfr", "high", undefined, epa(46031)), testedRangeMi: f(200, "tested", "low", "75 mph (Car and Driver)") },
    charging: {
      portStandard: f("CCS1", "mfr"),
      superchargerAccess: f("adapter", "agg", "medium", "Adapter program alongside Toyota, late 2025"),
      dcPeakKw: f(100, "agg", "medium", "100 kW cap through MY2025"),
    },
    thermal: { heatPump: f("standard", "agg", "medium") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(70, "mfr", "high", "“Retention of 70% or more of the original battery capacity” (MY2023 BEV booklet; later years reported same)"),
      batteryTransfers: f(true, "mfr", "high"),
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
    range: { epaRangeMi: f(239, "mfr", "high", "All trims, EPA figure", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("CCS1", "mfr"),
      superchargerAccess: f("adapter", "mfr", "high", "Kia NACS adapter ($249), live April 2025"),
      dcPeakKw: f(77, "agg", "medium", "~77–85 kW real peak; slow DC charging regardless of trim"),
    },
    thermal: { heatPump: f("optional", "mfr", "high", "Optional every year (Cold Weather Package, ~$1,100: heat pump + battery heater), window sticker check") },
    warranty: {
      batteryYears: f(10, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(70, "mfr"),
      batteryTransfers: f(true, "mfr", "high", "Kia: everything except the original-owner powertrain warranty transfers in full"),
      powertrainTerms: f("1st owner 10yr/100k; subsequent owners 5yr/60k", "mfr", "high"),
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
    range: { epaRangeMi: f(253, "mfr", "high", "Wind/Wave, EPA figure", "https://www.fueleconomy.gov"), testedRangeMi: f(210, "tested", "medium", "75-mph (Car and Driver, 2023): 210 mi; Edmunds mixed loop: 280") },
    charging: {
      portStandard: f("CCS1", "mfr"),
      superchargerAccess: f("adapter", "mfr", "high", "Kia NACS adapter ($249), live April 2025"),
      dcPeakKw: f(85, "agg", "medium", "~45 min 10–80%, slow for the class"),
    },
    thermal: { heatPump: f("optional", "mfr", "high", "Preserve Package option on both Wind and Wave, window sticker check") },
    warranty: {
      batteryYears: f(10, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(70, "mfr"),
      batteryTransfers: f(true, "mfr"),
      powertrainTerms: f("1st owner 10yr/100k; subsequent owners 5yr/60k", "mfr", "high"),
    },
    buyerNotes: [
      {
        headline: "Heat pump is still an option package, check the sticker",
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
      packUsableKwh: f(81.5, "mfr", "high", "83.9 kWh gross"),
      chemistry: f("NMC", "agg", "medium"),
    },
    range: { epaRangeMi: f(301, "mfr", "high", "18-inch wheels, standard", epa(45133)), testedRangeMi: f(280, "tested", "medium", "75-mph (Car and Driver, 2025): 280 mi") },
    charging: {
      portStandard: f("CCS1", "mfr"),
      superchargerAccess: f("adapter", "agg", "high", "Opened Dec 2025 via BMW-approved adapter; requires a Remote Software Upgrade first"),
      dcPeakKw: f(205, "agg", "medium"),
    },
    thermal: { heatPump: f("standard", "mfr", "high", "Cabin, battery and drive") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      batteryTransfers: f(true, "mfr", "high"),
      extendedCoverage: f("MY2022 has NO capacity floor (defects-only, verified). BMW Certified MY22\u201325 cars delivered after Mar 2026 get an 8yr/100k, 75%-SoH CPO battery coverage", "mfr", "high"),
    },
    buyerNotes: [
      {
        headline: "A 2022 i4 bought certified now has better battery coverage than it had new",
        body: "The 2022 i4's factory battery warranty covers defects only \u2014 no capacity floor (verified in the booklet). But BMW's CPO program adds an 8-year/100k, 75%-state-of-health coverage to MY22\u201325 EVs delivered certified after March 2026. Where you buy this car changes what protects its battery.",
        severity: "info",
      },
      {
        headline: "Battery-module recall; confirm the fix was done on this car",
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
    range: { epaRangeMi: f(256, "mfr", "high", "18-inch wheels, standard", epa(46616)) },
    charging: {
      portStandard: f("CCS1", "mfr"),
      superchargerAccess: f("adapter", "agg", "high", "Opened Dec 2025 via BMW-approved adapter; requires a Remote Software Upgrade first"),
      dcPeakKw: f(180, "agg", "medium"),
    },
    thermal: { heatPump: f("standard", "mfr", "high", "Cabin, battery and drive") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      batteryTransfers: f(true, "mfr", "high"),
      extendedCoverage: f("MY2022 has NO capacity floor (defects-only, verified). BMW Certified MY22\u201325 cars delivered after Mar 2026 get an 8yr/100k, 75%-SoH CPO battery coverage", "mfr", "high"),
    },
    buyerNotes: [
      {
        headline: "A 2022 i4 bought certified now has better battery coverage than it had new",
        body: "The 2022 i4's factory battery warranty covers defects only \u2014 no capacity floor (verified in the booklet). But BMW's CPO program adds an 8-year/100k, 75%-state-of-health coverage to MY22\u201325 EVs delivered certified after March 2026. Where you buy this car changes what protects its battery.",
        severity: "info",
      },
      {
        headline: "Battery-module recall; confirm the fix was done on this car",
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
      packUsableKwh: f(81.5, "mfr", "high", "83.9 kWh gross"),
      chemistry: f("NMC", "agg", "medium"),
    },
    range: { epaRangeMi: f(287, "mfr", "high", "18-inch wheels, standard", epa(48314)) },
    charging: {
      portStandard: f("CCS1", "mfr"),
      superchargerAccess: f("adapter", "agg", "high", "Opened Dec 2025 via BMW-approved adapter; requires a Remote Software Upgrade first"),
      dcPeakKw: f(205, "agg", "medium"),
    },
    thermal: { heatPump: f("standard", "mfr", "high", "Cabin, battery and drive") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      batteryTransfers: f(true, "mfr", "high"),
      extendedCoverage: f("MY2022 has NO capacity floor (defects-only, verified). BMW Certified MY22\u201325 cars delivered after Mar 2026 get an 8yr/100k, 75%-SoH CPO battery coverage", "mfr", "high"),
    },
    buyerNotes: [
      {
        headline: "A 2022 i4 bought certified now has better battery coverage than it had new",
        body: "The 2022 i4's factory battery warranty covers defects only \u2014 no capacity floor (verified in the booklet). But BMW's CPO program adds an 8-year/100k, 75%-state-of-health coverage to MY22\u201325 EVs delivered certified after March 2026. Where you buy this car changes what protects its battery.",
        severity: "info",
      },
      {
        headline: "Battery-module recall; confirm the fix was done on this car",
        body: "22V-541 (2022) and 25V-470 (2022\u201325): defective cell modules, remedy includes module or full-pack replacement on affected VINs.",
        severity: "warning",
      },
    ],
  },

  {
    // Split by year 2026-08-22: one row spanning 2022-25 printed 269, which is
    // only MY2024's figure. EPA rates the standard 19-inch M50 separately every
    // year — 270 / 271 / 269 / 267 — and 109 live listings sat on the single
    // number. The 42-mile gap to the 20-inch fitment is a different axis, and
    // is handled by labelling the standard wheel rather than by a note naming
    // the other figure.
    id: "bmw-i4-m50-2022",
    make: "BMW",
    model: "i4",
    modelYears: [2022, 2022],
    trim: "M50",
    battery: {
      packUsableKwh: f(81.5, "mfr", "high", "83.9 kWh gross"),
      chemistry: f("NMC", "agg", "medium"),
    },
    range: { epaRangeMi: f(270, "mfr", "high", "19-inch wheels, standard", epa(45131)), testedRangeMi: f(239, "tested", "high", "70-mph (InsideEVs, 2022 M50): 239 mi, beat its 227 EPA; Edmunds loop: 268") },
    charging: {
      portStandard: f("CCS1", "mfr"),
      superchargerAccess: f("adapter", "agg", "high", "Opened Dec 2025 via BMW-approved adapter; requires a Remote Software Upgrade first"),
      dcPeakKw: f(205, "agg", "medium"),
    },
    thermal: { heatPump: f("standard", "mfr", "high", "Cabin, battery and drive") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      batteryTransfers: f(true, "mfr", "high"),
      extendedCoverage: f("MY2022 has NO capacity floor (defects-only, verified). BMW Certified MY22\u201325 cars delivered after Mar 2026 get an 8yr/100k, 75%-SoH CPO battery coverage", "mfr", "high"),
    },
    buyerNotes: [
      {
        headline: "A 2022 i4 bought certified now has better battery coverage than it had new",
        body: "The 2022 i4's factory battery warranty covers defects only \u2014 no capacity floor (verified in the booklet). But BMW's CPO program adds an 8-year/100k, 75%-state-of-health coverage to MY22\u201325 EVs delivered certified after March 2026. Where you buy this car changes what protects its battery.",
        severity: "info",
      },
      {
        headline: "Battery-module recall; confirm the fix was done on this car",
        body: "22V-541 (2022) and 25V-470 (2022\u201325): defective cell modules, remedy includes module or full-pack replacement on affected VINs.",
        severity: "warning",
      },
    ],
  },

  {
    // Split by year 2026-08-22: one row spanning 2022-25 printed 269, which is
    // only MY2024's figure. EPA rates the standard 19-inch M50 separately every
    // year — 270 / 271 / 269 / 267 — and 109 live listings sat on the single
    // number. The 42-mile gap to the 20-inch fitment is a different axis, and
    // is handled by labelling the standard wheel rather than by a note naming
    // the other figure.
    id: "bmw-i4-m50-2025",
    make: "BMW",
    model: "i4",
    modelYears: [2025, 2025],
    trim: "M50",
    battery: {
      packUsableKwh: f(81.5, "mfr", "high", "83.9 kWh gross"),
      chemistry: f("NMC", "agg", "medium"),
    },
    range: { epaRangeMi: f(267, "mfr", "high", "19-inch wheels, standard", epa(48312)), testedRangeMi: f(239, "tested", "high", "70-mph (InsideEVs, 2022 M50): 239 mi, beat its 227 EPA; Edmunds loop: 268") },
    charging: {
      portStandard: f("CCS1", "mfr"),
      superchargerAccess: f("adapter", "agg", "high", "Opened Dec 2025 via BMW-approved adapter; requires a Remote Software Upgrade first"),
      dcPeakKw: f(205, "agg", "medium"),
    },
    thermal: { heatPump: f("standard", "mfr", "high", "Cabin, battery and drive") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      batteryTransfers: f(true, "mfr", "high"),
      extendedCoverage: f("MY2022 has NO capacity floor (defects-only, verified). BMW Certified MY22\u201325 cars delivered after Mar 2026 get an 8yr/100k, 75%-SoH CPO battery coverage", "mfr", "high"),
    },
    buyerNotes: [
      {
        headline: "A 2022 i4 bought certified now has better battery coverage than it had new",
        body: "The 2022 i4's factory battery warranty covers defects only \u2014 no capacity floor (verified in the booklet). But BMW's CPO program adds an 8-year/100k, 75%-state-of-health coverage to MY22\u201325 EVs delivered certified after March 2026. Where you buy this car changes what protects its battery.",
        severity: "info",
      },
      {
        headline: "Battery-module recall; confirm the fix was done on this car",
        body: "22V-541 (2022) and 25V-470 (2022\u201325): defective cell modules, remedy includes module or full-pack replacement on affected VINs.",
        severity: "warning",
      },
    ],
  },

  {
    // Split by year 2026-08-22: one row spanning 2022-25 printed 269, which is
    // only MY2024's figure. EPA rates the standard 19-inch M50 separately every
    // year — 270 / 271 / 269 / 267 — and 109 live listings sat on the single
    // number. The 42-mile gap to the 20-inch fitment is a different axis, and
    // is handled by labelling the standard wheel rather than by a note naming
    // the other figure.
    id: "bmw-i4-m50-2024",
    make: "BMW",
    model: "i4",
    modelYears: [2024, 2024],
    trim: "M50",
    battery: {
      packUsableKwh: f(81.5, "mfr", "high", "83.9 kWh gross"),
      chemistry: f("NMC", "agg", "medium"),
    },
    range: { epaRangeMi: f(269, "mfr", "high", "19-inch wheels, standard", epa(46915)), testedRangeMi: f(239, "tested", "high", "70-mph (InsideEVs, 2022 M50): 239 mi, beat its 227 EPA; Edmunds loop: 268") },
    charging: {
      portStandard: f("CCS1", "mfr"),
      superchargerAccess: f("adapter", "agg", "high", "Opened Dec 2025 via BMW-approved adapter; requires a Remote Software Upgrade first"),
      dcPeakKw: f(205, "agg", "medium"),
    },
    thermal: { heatPump: f("standard", "mfr", "high", "Cabin, battery and drive") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      batteryTransfers: f(true, "mfr", "high"),
      extendedCoverage: f("MY2022 has NO capacity floor (defects-only, verified). BMW Certified MY22\u201325 cars delivered after Mar 2026 get an 8yr/100k, 75%-SoH CPO battery coverage", "mfr", "high"),
    },
    buyerNotes: [
      {
        headline: "A 2022 i4 bought certified now has better battery coverage than it had new",
        body: "The 2022 i4's factory battery warranty covers defects only \u2014 no capacity floor (verified in the booklet). But BMW's CPO program adds an 8-year/100k, 75%-state-of-health coverage to MY22\u201325 EVs delivered certified after March 2026. Where you buy this car changes what protects its battery.",
        severity: "info",
      },
      {
        headline: "Battery-module recall; confirm the fix was done on this car",
        body: "22V-541 (2022) and 25V-470 (2022\u201325): defective cell modules, remedy includes module or full-pack replacement on affected VINs.",
        severity: "warning",
      },
    ],
  },

  {
    // Split by year 2026-08-22: one row spanning 2022-25 printed 269, which is
    // only MY2024's figure. EPA rates the standard 19-inch M50 separately every
    // year — 270 / 271 / 269 / 267 — and 109 live listings sat on the single
    // number. The 42-mile gap to the 20-inch fitment is a different axis, and
    // is handled by labelling the standard wheel rather than by a note naming
    // the other figure.
    id: "bmw-i4-m50-2023",
    make: "BMW",
    model: "i4",
    modelYears: [2023, 2023],
    trim: "M50",
    battery: {
      packUsableKwh: f(81.5, "mfr", "high", "83.9 kWh gross"),
      chemistry: f("NMC", "agg", "medium"),
    },
    range: { epaRangeMi: f(271, "mfr", "high", "19-inch wheels, standard", epa(45990)), testedRangeMi: f(239, "tested", "high", "70-mph (InsideEVs, 2022 M50): 239 mi, beat its 227 EPA; Edmunds loop: 268") },
    charging: {
      portStandard: f("CCS1", "mfr"),
      superchargerAccess: f("adapter", "agg", "high", "Opened Dec 2025 via BMW-approved adapter; requires a Remote Software Upgrade first"),
      dcPeakKw: f(205, "agg", "medium"),
    },
    thermal: { heatPump: f("standard", "mfr", "high", "Cabin, battery and drive") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      batteryTransfers: f(true, "mfr", "high"),
      extendedCoverage: f("MY2022 has NO capacity floor (defects-only, verified). BMW Certified MY22\u201325 cars delivered after Mar 2026 get an 8yr/100k, 75%-SoH CPO battery coverage", "mfr", "high"),
    },
    buyerNotes: [
      {
        headline: "A 2022 i4 bought certified now has better battery coverage than it had new",
        body: "The 2022 i4's factory battery warranty covers defects only \u2014 no capacity floor (verified in the booklet). But BMW's CPO program adds an 8-year/100k, 75%-state-of-health coverage to MY22\u201325 EVs delivered certified after March 2026. Where you buy this car changes what protects its battery.",
        severity: "info",
      },
      {
        headline: "Battery-module recall; confirm the fix was done on this car",
        body: "22V-541 (2022) and 25V-470 (2022\u201325): defective cell modules, remedy includes module or full-pack replacement on affected VINs.",
        severity: "warning",
      },
    ],
  },

  // ---------------------------------------------------------------------
  // Chevrolet Silverado EV. Re-keyed on the VIN descriptor 2026-08-22. The
  // rows were keyed on trim strings "Standard Range" / "Extended Range" /
  // "Max Range", and the feed does not carry those: `trim` reads "LT", "WT",
  // "Trail Boss" or "RST", and the pack name lives in the listing NAME. So
  // the rows were being reached through substring luck and the kWh hint, and
  // ~215 live listings were wrong.
  //
  // The descriptor carries the exact GM trim code, the pack AND the weight
  // class. Position 4 is the class: `1GC1` is Class 2H and rated, `1GC4` is
  // Class 3 and has NO EPA rating in existence. That is a control-tested
  // negative, not a research gap — 11 Class-3 window stickers from GM's own
  // Monroney service (cws.gm.com/vs-cws/vehshop/v2/vehicle/windowsticker)
  // all have a blank fuel-economy panel, and EPA's API has no entry for any
  // of them. 109 Class-3 listings were printing a range that does not exist,
  // including 7 RST Max trucks showing an Extended pack's 408.
  //
  // Also note the 2025 "(11 kW)/(19 kW)" EPA pair is not an unstated option:
  // it is trim-determined, LT Extended shipping the 11.5 kW charger (408) and
  // RST Extended the 19.2 kW (390). And EPA id 49641 (2026 Extended, 19 kW,
  // 385) matches no VIN in our inventory — 0 of 7 Class-2H Extended stickers
  // carried that charger — so 410 is the standard configuration for 2026.
  // ---------------------------------------------------------------------

  {
    id: "silverado-2024-3wt",
    make: "CHEVROLET",
    model: "Silverado EV",
    modelYears: [2024, 2024],
    vds: ["10UED"],
    battery: { packUsableKwh: f(170, "est", "medium"), chemistry: f("NCMA", "agg", "medium") },
    range: { epaRangeMi: f(393, "mfr", "high", undefined, epa(47446)) },
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
    id: "silverado-2024-4wt",
    make: "CHEVROLET",
    model: "Silverado EV",
    modelYears: [2024, 2024],
    vds: ["10VEL"],
    battery: { packUsableKwh: f(205, "est", "medium"), chemistry: f("NCMA", "agg", "medium") },
    range: { epaRangeMi: f(450, "mfr", "high", undefined, epa(46946)) },
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
    id: "silverado-2025-2wt",
    make: "CHEVROLET",
    model: "Silverado EV",
    modelYears: [2025, 2025],
    vds: ["10TEF"],
    battery: { packUsableKwh: f(119, "est", "medium"), chemistry: f("NCMA", "agg", "medium") },
    range: { epaRangeMi: f(282, "mfr", "high", undefined, epa(49071)) },
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
    id: "silverado-2025-3lt",
    make: "CHEVROLET",
    model: "Silverado EV",
    modelYears: [2025, 2025],
    vds: ["10ZED"],
    battery: { packUsableKwh: f(170, "est", "medium"), chemistry: f("NCMA", "agg", "medium") },
    range: { epaRangeMi: f(408, "mfr", "high", undefined, epa(48700)) },
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
    id: "silverado-2025-rst",
    make: "CHEVROLET",
    model: "Silverado EV",
    modelYears: [2025, 2025],
    vds: ["101ED"],
    battery: { packUsableKwh: f(170, "est", "medium"), chemistry: f("NCMA", "agg", "medium") },
    range: { epaRangeMi: f(390, "mfr", "high", undefined, epa(48701)) },
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
    id: "silverado-2025-5wt",
    make: "CHEVROLET",
    model: "Silverado EV",
    modelYears: [2025, 2025],
    vds: ["10VED"],
    battery: { packUsableKwh: f(170, "est", "medium"), chemistry: f("NCMA", "agg", "medium") },
    range: { epaRangeMi: f(422, "mfr", "high", undefined, epa(48702)) },
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
    id: "silverado-2025-8wt",
    make: "CHEVROLET",
    model: "Silverado EV",
    modelYears: [2025, 2025],
    vds: ["10WEL"],
    battery: { packUsableKwh: f(205, "est", "medium"), chemistry: f("NCMA", "agg", "medium") },
    range: { epaRangeMi: f(492, "mfr", "high", undefined, epa(48698)) },
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
    id: "silverado-2026-standard",
    make: "CHEVROLET",
    model: "Silverado EV",
    modelYears: [2026, 2026],
    vds: ["10UEH", "10YEH"],
    battery: { packUsableKwh: f(119, "est", "medium"), chemistry: f("NCMA", "agg", "medium") },
    range: { epaRangeMi: f(283, "mfr", "high", undefined, epa(49643)) },
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
    id: "silverado-2026-extended",
    make: "CHEVROLET",
    model: "Silverado EV",
    modelYears: [2026, 2026],
    vds: ["10ZED", "103ED"],
    battery: { packUsableKwh: f(170, "est", "medium"), chemistry: f("NCMA", "agg", "medium") },
    range: { epaRangeMi: f(410, "mfr", "high", undefined, epa(49640)) },
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
    id: "silverado-2026-5wt",
    make: "CHEVROLET",
    model: "Silverado EV",
    modelYears: [2026, 2026],
    vds: ["10VED"],
    battery: { packUsableKwh: f(170, "est", "medium"), chemistry: f("NCMA", "agg", "medium") },
    range: { epaRangeMi: f(424, "mfr", "high", undefined, epa(49638)) },
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
    id: "silverado-2026-8wt",
    make: "CHEVROLET",
    model: "Silverado EV",
    modelYears: [2026, 2026],
    vds: ["10WEL"],
    battery: { packUsableKwh: f(205, "est", "medium"), chemistry: f("NCMA", "agg", "medium") },
    range: { epaRangeMi: f(493, "mfr", "high", undefined, epa(49639)) },
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
    // Class 3 (VIN position 4 = 4, over 10,000 lb GVWR): above EPA's
    // light-duty labelling threshold, so no rating exists to print.
    id: "silverado-class3-standard",
    abstains: { epaRangeMi: "No EPA rating exists: at over 10,000 lb GVWR these are above EPA's light-duty labelling threshold, confirmed by a blank Monroney range panel and no fueleconomy.gov record" },
    make: "CHEVROLET",
    model: "Silverado EV",
    modelYears: [2024, 2026],
    vds: ["4"],
    vin8: ["H", "F"],
    battery: { packUsableKwh: f(119, "est", "medium"), chemistry: f("NCMA", "agg", "medium") },
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
    id: "silverado-class3-extended",
    abstains: { epaRangeMi: "No EPA rating exists: at over 10,000 lb GVWR these are above EPA's light-duty labelling threshold, confirmed by a blank Monroney range panel and no fueleconomy.gov record" },
    make: "CHEVROLET",
    model: "Silverado EV",
    modelYears: [2024, 2026],
    vds: ["4"],
    vin8: ["D"],
    battery: { packUsableKwh: f(170, "est", "medium"), chemistry: f("NCMA", "agg", "medium") },
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
    id: "silverado-class3-max",
    abstains: { epaRangeMi: "No EPA rating exists: at over 10,000 lb GVWR these are above EPA's light-duty labelling threshold, confirmed by a blank Monroney range panel and no fueleconomy.gov record" },
    make: "CHEVROLET",
    model: "Silverado EV",
    modelYears: [2024, 2026],
    vds: ["4"],
    vin8: ["L"],
    battery: { packUsableKwh: f(205, "est", "medium"), chemistry: f("NCMA", "agg", "medium") },
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
    battery: { packUsableKwh: f(84.7, "mfr", "medium", "90 kWh gross"), chemistry: f("NMC", "agg", "medium") },
    range: { epaRangeMi: f(234, "mfr", "high", "2019–21: 234; 2023–24: 246 (20″) / 217 (22″). No US MY2022 exists (no MY2022 was sold in the US)", "https://www.fueleconomy.gov"), testedRangeMi: f(195, "tested", "high", "70-mph (InsideEVs, 2022 EV400): 195 mi; 75-mph (C&D, 2019): 190") },
    charging: {
      portStandard: f("CCS1", "mfr"),
      superchargerAccess: f("none", "agg", "medium", "JLR was network-whitelisted (~Aug 2025) but no approved adapter confirmed shipping, treat as no Supercharger access until verified"),
      dcPeakKw: f(100, "agg", "medium", "Slow: 100–104 kW"),
    },
    thermal: { heatPump: f("standard", "mfr", "high") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(70, "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high", "“In favor of the original purchaser and each subsequent owner”; EliteCare (incl. 5yr/60k maintenance) “fully transferable”"),
    },
    buyerNotes: [
      {
        headline: "Battery recall defines this car; confirm whether it was bought back or is charge-capped",
        body: "Verified from Jaguar's NHTSA filings: for MY2019 cars the final remedy is a REPURCHASE, Jaguar buys the car back (recall H536), so a 2019 on a lot may be a car Jaguar offered to buy. MY2020–21 cars (26V-067) run a 90% charge cap with the final fix still ‘under development’ as of Feb 2026. Jaguar ended I-PACE production in 2024.",
        severity: "trap",
      },
    ],
  },

];
