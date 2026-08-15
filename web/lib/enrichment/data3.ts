import type { EnrichmentRow, Fact, Source } from "../types";

// Third research tranche (2026-08-10): models in live inventory with zero
// matching rows. EPA ranges fetched live from fueleconomy.gov's REST API
// (menu/model -> menu/options -> /vehicle/{id}) per year/trim, not carried
// over from any prior estimate. Warranty facts from docs/WARRANTY-RESEARCH.md
// at the tier recorded there. Tested range from docs/RANGE-TESTS.md where a
// matching variant exists. Recalls fetched from NHTSA's recallsByVehicle API
// (note: that endpoint indexes Mach-E under the model string "MUSTANG MACH E",
// no hyphen — a hyphenated query silently returns zero results with no error,
// caught by running a 2021 control fetch, since 22V-412/23V-687 are already
// documented as existing for that year).
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

export const RESEARCH_ROWS_3: EnrichmentRow[] = [
  // ---------------------------------------------------------------------
  // Ford Mustang Mach-E — moved to data4.ts (2026-08-14 pass), re-keyed on
  // VIN position 8 so the pack, chemistry, and GT-vs-Performance identity
  // come from the VIN instead of the dealer's trim string. The recalls,
  // BlueCruise, and connected-services research from this tranche carried
  // over to those rows unchanged.
  // ---------------------------------------------------------------------

  // ---------------------------------------------------------------------
  // Porsche Taycan — moved to data4.ts (2026-08-14): full per-variant rows
  // keyed on trim + the per-VIN pack size in Porsche's Part 565 submissions
  // (79.2 = Performance Battery, 93.4 = Plus), replacing the compound-trim
  // workaround rows this comment used to describe.





  // ---------------------------------------------------------------------
  // Polestar 2 — 1 in inventory, 2021 (only real US variant that year was
  // the dual-motor Launch Edition, confirmed by fueleconomy.gov listing
  // exactly one 2021 configuration).
  // ---------------------------------------------------------------------
  {
    id: "polestar2-2021",
    make: "POLESTAR",
    model: "Polestar 2",
    modelYears: [2021, 2021],
    drive: "AWD",
    battery: {
      packGrossKwh: f(78, "mfr", "high", "Polestar's own US spec sheet: “78 kWh lithium-ion, 27 modules”", "https://www.polestar.com"),
      packUsableKwh: f(75, "agg", "medium", "Corroborated by an independent InsideEVs review; not the exact wording of Polestar's own spec table"),
    },
    range: {
      epaRangeMi: f(233, "mfr", "high", "2021 Polestar 2 dual-motor Launch Edition — the only EPA-certified US variant for MY2021 — EPA", "https://www.fueleconomy.gov"),
      testedRangeMi: f(226, "tested", "high", "70-mph steady highway (InsideEVs): 226 mi sustained before needing to slow, +7 mi on secondary roads = 233.4 mi total — essentially matched EPA combined and slightly beat EPA highway (222 mi)"),
    },
    charging: {
      portStandard: f("CCS1", "agg", "medium", "Widely reported as CCS1 for the US market; not confirmed in a Polestar primary spec document"),
      dcPeakKw: f(150, "agg", "medium", "Polestar's rated peak; see buyer note on the real-world shortfall InsideEVs measured on this specific car"),
    },
    thermal: { heatPump: f("none", "agg", "medium", "Heat pump was introduced via a “Plus Pack” announced April 2021 for updated/MY2022 builds — not confirmed standard on the original MY2021 Launch Edition") },
    warranty: {
      batteryYears: f(8, "mfr", "high", "“Eight (8) years or 100,000 miles/160,000 kilometers” — Polestar's own Warranty Policy and Procedures Manual (produced to NHTSA under FOIA), applies to all Polestar vehicles"),
      batteryMiles: f(100_000, "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high", "“Any remaining portion of the warranty is fully transferable to subsequent owners free of charge” — Polestar's own Warranty Policy and Procedures Manual"),
    },
    buyerNotes: [
      {
        headline: "HV battery software fault can cut drive power — check this VIN's status",
        body: "21V110 (2021–2022 Polestar 2): the Battery Energy Control Module microprocessor may reset and disconnect the high-voltage system, causing loss of drive power. Free OTA or dealer software fix; owner notices mailed April 2021.",
        severity: "trap",
      },
      {
        headline: "One Pedal Drive brake-function-loss recall",
        body: "25V409 (2021 and 2024 Polestar 2): brake function can be lost while coasting downhill using One Pedal Drive. Remedy is an OTA software update; interim advisory was to avoid One Pedal Drive until repaired.",
        severity: "warning",
      },
      {
        headline: "Real-world DC fast-charge peak fell well short of the rated 150 kW",
        body: "InsideEVs measured only about 99 kW peak DC charging on a 2021 Polestar 2 test car, against Polestar's 150 kW rating — attributed at the time to a software/network compatibility limit, which may not reflect current software on every car.",
        severity: "info",
      },
      {
        headline: "Overlapping rearview-camera recalls",
        body: "24V477, 25V280, and 25V615 (2021–2025 Polestar 2) all address rearview-camera display issues, with 25V615 superseding the earlier two campaigns. VINs became searchable on NHTSA.gov starting April 2026.",
        severity: "info",
      },
    ],
  },

  // ---------------------------------------------------------------------
  // BMW iX — 1 in inventory, 2023 xDrive M60.
  // ---------------------------------------------------------------------
  {
    id: "ix-2023-m60",
    make: "BMW",
    model: "iX",
    modelYears: [2023, 2023],
    trim: "M60",
    drive: "AWD",
    battery: {
      packGrossKwh: f(111.5, "mfr", "high", "BMW USA press: “Energy capacity, gross/net kWh 111.5/106.3” — shared pack across xDrive50 and M60"),
      packUsableKwh: f(106.3, "mfr", "high", "BMW USA press, same spec table"),
    },
    range: {
      epaRangeMi: f(288, "mfr", "high", "2023 iX M60, 21-inch wheels — EPA; 22-inch wheels: 274 mi (BMW voluntarily lowered this from a preliminary 291 mi estimate before final certification)", "https://www.fueleconomy.gov"),
      testedRangeMi: f(325, "tested", "medium", "Edmunds real-world test, 22-inch-wheel M60: 325 mi — reported tier, Edmunds domain-wide 403s block direct verification; no InsideEVs 70-mph or Car and Driver 75-mph test found for M60 specifically"),
    },
    charging: {
      portStandard: f("CCS1", "agg", "medium", "BMW's own term is “Combined Charging Unit”; not independently re-verified as CCS1 in the M60-specific press document, but consistent with the rest of the US BMW BEV lineup"),
      superchargerAccess: f("adapter", "agg", "high", "Opened Dec 2025 via BMW-approved adapter; requires a Remote Software Upgrade first — same platform-level fact as i4"),
      dcPeakKw: f(195, "mfr", "high", "BMW USA press: “Maximum charging, DC kW 195” — platform-level figure shared with xDrive50; some secondary aggregators round this to 200 kW"),
    },
    thermal: { heatPump: f("standard", "mfr", "high", "BMW USA iX launch press release: “Integrated Heating and Cooling System with Heat Pump Function…for both the BMW eDrive components and the vehicle interior” — platform-level; M60 shares the same drivetrain/battery/thermal hardware") },
    warranty: {
      batteryYears: f(8, "mfr", "high"),
      batteryMiles: f(100_000, "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high", "NVLW runs to “the first retail purchaser, and each subsequent purchaser”"),
      extendedCoverage: f("MY2023 capacity-floor status is unresolved (MY2022 verified as no floor; MY2026 verified at 70% SoH; MY2023–25 booklets unobtainable). BMW Certified MY22–25 EVs delivered certified after 2026-03-01 get an 8yr/100k, 75%-SoH CPO battery coverage — verified.", "mfr", "high"),
    },
    buyerNotes: [
      {
        headline: "Multiple HV battery recalls — check this VIN's status",
        body: "22V541 (2022–23 iX/i4: internal battery damage, short-circuit/fire risk, park-it/park-outside advisory, battery replacement); 25V470 (2022–2025 iX: battery cell module improperly assembled, fire risk — remedy was still pending as of the September 2025 interim notice, with parts anticipated by end of 2025); 22V944 (HV battery ECU software, power interruption); 23V449 (HV battery charging unit improperly assembled, stall risk).",
        severity: "trap",
      },
      {
        headline: "Drive motor controller software recall",
        body: "25V395 (2022–2024 iX): a software fault in the drive motor controller can cause an HV shutdown and loss of drive power. Remedy is OTA or dealer software update; notices mailed around August 2025.",
        severity: "warning",
      },
      {
        headline: "The MY2025–26 “SoH stuck at 100%” bug does not apply to this car",
        body: "This service action (NHTSA bulletin SIB 61 20 25) is scoped explicitly to the G60 platform — i5 eDrive40, i5 xDrive40, and 550e xDrive built Feb–Oct 2025. The iX (I20 platform) is not named in the bulletin, so an unrepaired SoH reading on this car is not evidence of that specific bug.",
        severity: "info",
      },
    ],
  },

  {
    id: "ix-2024-2025-xdrive50",
    make: "BMW",
    model: "iX",
    // Value corrected 303 -> 307 in the 2026-08-14 pass: 2024 rates a flat
    // 307 on all wheels; 2025 spans 302-309.
    modelYears: [2024, 2025],
    trim: "xDrive50",
    drive: "AWD",
    battery: {
      packGrossKwh: f(111.5, "mfr", "high", "BMW USA press: “Energy capacity, gross/net kWh 111.5/106.3” — shared pack across xDrive50 and M60"),
      packUsableKwh: f(106.3, "mfr", "high", "BMW USA press, same spec table"),
    },
    range: { epaRangeMi: f(307, "mfr", "high", "MY2024: 307 on every wheel size; MY2025: 302–309 by wheels — EPA", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("CCS1", "agg", "medium", "BMW's own term is “Combined Charging Unit”; not independently re-verified as CCS1 in a xDrive50-specific document, but consistent with the rest of the US BMW BEV lineup"),
      superchargerAccess: f("adapter", "agg", "high", "Opened Dec 2025 via BMW-approved adapter; requires a Remote Software Upgrade first — same platform-level fact as i4/M60"),
      dcPeakKw: f(195, "mfr", "high", "BMW USA press: “Maximum charging, DC kW 195” — platform-level figure shared with M60"),
    },
    thermal: { heatPump: f("standard", "mfr", "high", "BMW USA iX launch press release: integrated heat pump for cabin, battery, and drive — platform-level; xDrive50 shares the same drivetrain/battery/thermal hardware as M60") },
    warranty: {
      batteryYears: f(8, "mfr", "high"),
      batteryMiles: f(100_000, "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high", "NVLW runs to “the first retail purchaser, and each subsequent purchaser”"),
      extendedCoverage: f("MY2024–25 capacity-floor status is unresolved (MY2022 verified as no floor; MY2026 verified at 70% SoH; MY2023–25 booklets unobtainable). BMW Certified MY22–25 EVs delivered certified after 2026-03-01 get an 8yr/100k, 75%-SoH CPO battery coverage — verified.", "mfr", "high"),
    },
    buyerNotes: [
      {
        headline: "Multiple HV battery recalls — check this VIN's status",
        body: "23V295 (2022–2024 xDrive50: HV battery cell monitoring circuit loose connections can cause a stall); 25V470 (2022–2025 iX: battery cell module improperly assembled, fire risk — remedy was still pending as of the September 2025 interim notice, parts anticipated by end of 2025).",
        severity: "trap",
      },
      {
        headline: "Cruise control and drive motor controller recalls",
        body: "23V409 (2022–2024 xDrive50/M60: cruise control may unintentionally reactivate while turning at low speed); 25V395 (2022–2025 iX: a software fault in the drive motor controller can cause an HV shutdown and loss of drive power). Both remedied by free software update.",
        severity: "warning",
      },
      {
        headline: "The MY2025–26 “SoH stuck at 100%” bug does not apply to this car",
        body: "This service action (NHTSA bulletin SIB 61 20 25) is scoped explicitly to the G60 platform — i5 eDrive40, i5 xDrive40, and 550e xDrive built Feb–Oct 2025. The iX (I20 platform) is not named in the bulletin.",
        severity: "info",
      },
    ],
  },

  {
    id: "ix-2026-m70",
    make: "BMW",
    model: "iX",
    modelYears: [2026, 2026],
    trim: "M70",
    drive: "AWD",
    range: { epaRangeMi: f(303, "mfr", "high", "2026 iX M70, 21-inch wheels — EPA; 22-inch wheels: 284 mi. A 23-inch wheel option also exists on this trim, figure not fetched.", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("CCS1", "agg", "low", "Inferred by platform continuity from the outgoing xDrive50/M60 generation; not independently confirmed for the MY2026-refresh M70"),
      superchargerAccess: f("adapter", "agg", "low", "Inferred by platform continuity; not independently confirmed for M70"),
    },
    thermal: { heatPump: f("standard", "agg", "low", "Inferred by platform continuity from the outgoing generation; not independently re-confirmed for M70") },
    warranty: {
      batteryYears: f(8, "mfr", "high"),
      batteryMiles: f(100_000, "mfr", "high"),
      sohFloorPct: f(70, "mfr", "high", "MY2026 BEVs have a verified 70% SoH floor with “restore to at least 70%” remedy — full booklet read"),
      batteryTransfers: f(true, "mfr", "high", "NVLW runs to “the first retail purchaser, and each subsequent purchaser”"),
    },
    buyerNotes: [
      {
        headline: "This is a new-generation iX — battery specs not yet independently confirmed",
        body: "M70 is part of BMW's 2026 iX refresh (replacing the xDrive40/xDrive50/M60 lineup with xDrive45/xDrive60/M70). Battery capacity for this generation was not confirmed in this research pass — don't assume it matches the outgoing generation's 111.5/106.3 kWh pack.",
        severity: "info",
      },
      {
        headline: "No recalls on file yet",
        body: "As of 2026-08-10, NHTSA's recall database returns zero campaigns for the 2026 iX M70 — consistent with this being a brand-new model-year refresh.",
        severity: "info",
      },
    ],
  },

  // ---------------------------------------------------------------------
  // Audi e-tron GT — 1 in inventory, 2024 quattro Premium Plus.
  // ---------------------------------------------------------------------
  {
    id: "etron-gt-2024-quattro-premium-plus",
    make: "AUDI",
    model: "e-tron GT",
    modelYears: [2024, 2024],
    trim: "quattro Premium Plus",
    drive: "AWD",
    battery: {
      packGrossKwh: f(93, "mfr", "high", "Audi's own e-tron GT tech page (pre-2025-refresh model, matching MY2024): “93 kWh gross”", "https://www.audi.com"),
      packUsableKwh: f(84, "mfr", "high", "Audi: “84 kWh of energy net” — do not confuse with the 2025+ refreshed e-tron GT's larger 105/97 kWh pack"),
    },
    range: {
      epaRangeMi: f(249, "mfr", "high", "2024 Audi e-tron GT quattro — EPA (RS e-tron GT performance variant rates identically at 249 mi despite higher output)", "https://www.fueleconomy.gov"),
      testedRangeMi: f(273, "tested", "medium", "Edmunds test of the MY2022 e-tron GT (273 mi) — same-generation battery, but predates the MY2024 EPA rating bump from 238 to 249 mi; no test found matching the 2024 car's exact rating"),
    },
    charging: {
      portStandard: f("CCS1", "agg", "medium", "Universal across US e-tron GT production; not independently re-confirmed against a primary Audi spec sheet in this research pass"),
      architectureV: f(800, "mfr", "high", "Audi: “approx. 800 volts”"),
      dcPeakKw: f(270, "mfr", "high", "Audi: “up to 270 kW”, 5%→80% SoC in under 22.5 minutes — do not confuse with the 2025+ refreshed e-tron GT's 320 kW rating on a different pack"),
    },
    thermal: { heatPump: f("standard", "mfr", "high", "Audi: “the e-tron GT includes a heat pump that heats the interior with the waste heat of the high-voltage components” — standard, not optional") },
    warranty: {
      batteryYears: f(8, "agg", "low", "Commonly reported across dealer/aggregator sources but not confirmed in a readable Audi USA primary document — Audi's own new-vehicle warranty page states only the 4yr/50k basic term and does not separately address the HV battery"),
      batteryMiles: f(100_000, "agg", "low", "Same caveat as batteryYears"),
    },
    buyerNotes: [
      {
        headline: "HV battery short-circuit recall — check this VIN's status",
        body: "24V228 and 24V726 (2024 e-tron GT/RS e-tron GT): the HV battery may short internally, fire risk. 24V726 supersedes and expands 24V228 — cars already repaired under the earlier campaign still need the newer remedy (advanced diagnostic software, plus interim 80% charge cap or online monitoring in some cases).",
        severity: "trap",
      },
      {
        headline: "Portable charging cable can overheat",
        body: "23V842: the 220V/240V portable charging cable can overheat the outlet or cable itself when charging to 100%, fire risk. Free replacement cable with a temperature sensor; owner notices mailed March 2024.",
        severity: "warning",
      },
      {
        headline: "Front brake hoses can tear and leak",
        body: "24V465: front axle brake hoses can develop tears or leaks, increasing stopping distance. Free replacement; owner notices mailed August 2024.",
        severity: "warning",
      },
      {
        headline: "HV battery warranty term not confirmed against a primary Audi document",
        body: "The commonly-cited 8-year/100,000-mile HV battery term comes from dealer and aggregator sources; a readable Audi USA document stating this specifically for the e-tron GT was not located in this research pass.",
        severity: "info",
      },
    ],
  },

  // ---------------------------------------------------------------------
  // Lucid Air — 2 in inventory: 2025 Pure RWD, 2025 Touring AWD.
  // ---------------------------------------------------------------------
  {
    id: "lucid-air-2025-pure-rwd",
    make: "LUCID",
    model: "Air",
    modelYears: [2025, 2025],
    // No trim key: Lucid's real name for this car is "Pure," but this
    // site's scraped inventory data has at least one dealer listing it as
    // "Base" instead — a naming mismatch discovered auditing live inventory,
    // same shape as the Toyota bZ "Series" issue below. Left trim-agnostic
    // so it matches regardless of which label a given dealer used; Touring
    // (AWD-only) still takes the RWD/AWD split correctly.
    drive: "RWD",
    battery: { packGrossKwh: f(84, "mfr", "high", "Lucid's own 2025 Pure technical-spec sheet: “84 kWh (16 module)”; no usable/net split published by Lucid", "https://lucidmotors.com") },
    range: {
      epaRangeMi: f(420, "mfr", "high", "2025 Air Pure RWD, 19-inch wheels (standard) — EPA; 20-inch wheel option: 372 mi", "https://www.fueleconomy.gov"),
      testedRangeMi: f(366, "tested", "high", "70-mph steady-state (InsideEVs): 365.6 mi — 12.9% below the 420-mi EPA rating. Edmunds test on 20-inch wheels/summer tires: 349 mi (vs 372 mi EPA for that config) — reported tier, Edmunds fetch blocked. Car and Driver ~310 mi at 75 mph reported only via secondary summary, not independently confirmed."),
    },
    charging: {
      portStandard: f("CCS1", "mfr", "high", "Lucid's own site: “Your Lucid Air has a J1772 (CCS1) charge port” — confirmed current as of the most recent Lucid material found (July 2025); still no native NACS port"),
      superchargerAccess: f("adapter", "mfr", "high", "All Air owners gained Supercharger access July 31, 2025 via a Lucid-sold NACS-to-CCS1 adapter ($220); capped around 50 kW / up to 200 mi of range per hour on that adapter path — well below the car's native CCS1 DC peak"),
      dcPeakKw: f(219, "agg", "low", "Lucid's own Pure spec sheet gives only a charge-time estimate, no peak-kW figure (pack architecture is “650V+” per that sheet — outside this site's 400/800V field, noted here instead). A third-party instrumented test (evchargingstations.com) measured 219 kW peak on a 350 kW DC charger, sustained above 210 kW to 18% SOC — secondary, unverified"),
    },
    thermal: { heatPump: f("standard", "mfr", "high", "Lucid IR press release: “The heat pump first employed on Lucid Sapphire now becomes standard across the lineup” — MY2025 onward; not standard in earlier model years") },
    warranty: {
      batteryYears: f(8, "mfr", "high", "“High-voltage battery: 8 Years / 100,000 miles (whichever comes first) retaining 70% capacity” — Lucid's own warranty page"),
      batteryMiles: f(100_000, "mfr", "high"),
      sohFloorPct: f(70, "mfr", "high", "Same Lucid warranty-page quote"),
      batteryTransfers: f(true, "mfr", "high", "“…and to subsequent owner(s) if the vehicle is within the applicable coverage period” — Lucid's own warranty page"),
    },
    buyerNotes: [
      {
        headline: "Four RWD-only recalls — check this VIN's status",
        body: "24V836 (2024–2025 Pure RWD: rear subframe wiring harness too short, can cut power to the rear drive unit; free harness replacement, notices mailed December 2024). 25V669 and 26V193 (2024–2026 Pure RWD: half-shaft bolts may allow disconnection from the drive unit; free bolt inspection/replacement, notices through mid-2026). 26V309 (2024–2025 RWD: Gen 4 inverter internal friction/damage can cause loss of drive power; OTA monitoring plus free replacement if a failure is detected, notices mailed July 2026). None of these four apply to the AWD Touring.",
        severity: "trap",
      },
      {
        headline: "Rearview-camera recalls apply across the Air lineup",
        body: "25V670 (2022–2025, all trims: camera image can fail, delay, or display inaccurately) and 26V017 (2022–2026, cars with the AD02 package: camera may not display in reverse). Both fixed via free OTA update.",
        severity: "warning",
      },
    ],
  },

  {
    id: "lucid-air-2025-touring-awd",
    make: "LUCID",
    model: "Air",
    modelYears: [2025, 2025],
    trim: "Touring",
    drive: "AWD",
    battery: { packGrossKwh: f(92, "mfr", "high", "Lucid's own 2025 Touring technical-spec sheet: “92 kWh (18 module)”; no usable/net split published by Lucid", "https://lucidmotors.com") },
    range: { epaRangeMi: f(406, "mfr", "high", "2025 Air Touring AWD, 19-inch wheels (standard) — EPA; 20-inch: 377 mi; 21-inch: 361 mi", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("CCS1", "mfr", "high", "Lucid's own site: “Your Lucid Air has a J1772 (CCS1) charge port” — confirmed current as of the most recent Lucid material found (July 2025); still no native NACS port"),
      superchargerAccess: f("adapter", "mfr", "high", "All Air owners gained Supercharger access July 31, 2025 via a Lucid-sold NACS-to-CCS1 adapter ($220); capped around 50 kW / up to 200 mi of range per hour on that adapter path — well below the car's native CCS1 DC peak"),
      dcPeakKw: f(250, "mfr", "high", "Lucid's own Touring spec sheet: “DC charge power: Up to 250 kW” (pack architecture is “700V+” per that sheet — outside this site's 400/800V field, noted here instead)"),
    },
    thermal: { heatPump: f("standard", "mfr", "high", "Lucid IR press release: “The heat pump first employed on Lucid Sapphire now becomes standard across the lineup” — MY2025 onward; not standard in earlier model years") },
    warranty: {
      batteryYears: f(8, "mfr", "high", "“High-voltage battery: 8 Years / 100,000 miles (whichever comes first) retaining 70% capacity” — Lucid's own warranty page"),
      batteryMiles: f(100_000, "mfr", "high"),
      sohFloorPct: f(70, "mfr", "high", "Same Lucid warranty-page quote"),
      batteryTransfers: f(true, "mfr", "high", "“…and to subsequent owner(s) if the vehicle is within the applicable coverage period” — Lucid's own warranty page"),
    },
    buyerNotes: [
      {
        headline: "Rearview-camera recalls apply across the Air lineup",
        body: "25V670 (2022–2025, all trims: camera image can fail, delay, or display inaccurately) and 26V017 (2022–2026, cars with the AD02 package: camera may not display in reverse). Both fixed via free OTA update. The Pure RWD's wiring-harness, half-shaft, and inverter recalls do not apply to this AWD Touring.",
        severity: "warning",
      },
    ],
  },

  // ---------------------------------------------------------------------
  // Toyota bZ / bZ Woodland (2026 redesign — distinct nameplate from bZ4X,
  // which already has its own rows). Research finding worth flagging loudly:
  // this site's own scraped inventory data carries trim labels ("11 Series",
  // "15 Series", "17 Series") that do not correspond to any real Toyota bZ
  // grade name in Toyota's press materials, fueleconomy.gov, NHTSA, or CARB
  // filings — Toyota's actual MY2026 grades are XLE FWD, XLE FWD Plus, XLE
  // AWD, Limited FWD, Limited AWD (bZ), and Woodland / Woodland Premium (bZ
  // Woodland). These rows are keyed by drivetrain only (no trim field) and
  // say so explicitly in a buyer note, since the label on the listing itself
  // cannot be trusted to mean anything.
  // ---------------------------------------------------------------------
  {
    id: "bz-2026-fwd-standard",
    make: "TOYOTA",
    model: "bZ",
    modelYears: [2026, 2026],
    drive: "FWD",
    battery: { packGrossKwh: f(57.7, "mfr", "high", "Toyota press: base FWD pack (XLE FWD)") },
    range: { epaRangeMi: f(236, "mfr", "high", "2026 Toyota bZ, base 57.7 kWh pack, FWD — EPA; a larger 74.7 kWh pack (XLE FWD Plus) is also available on this drivetrain, rated 314 mi — see buyer note", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("NACS", "mfr", "high", "Toyota press release: “NACS charging port” — confirmed change from the outgoing bZ4X's CCS1-only port"),
      dcPeakKw: f(150, "agg", "medium", "Widely reported flat across the 2026 bZ lineup; Toyota's own release states only “10% to 80% in around 30 minutes,” no kW figure"),
    },
    thermal: { heatPump: f("standard", "mfr", "high", "Toyota press release: “Heat pump system for both heating and air-conditioning” listed as standard") },
    warranty: {
      batteryYears: f(8, "mfr", "high", "Toyota's 8yr/100k battery+transaxle+inverter warranty, verified against both MY2023 and MY2026 guides, carries to the new bZ nameplate"),
      batteryMiles: f(100_000, "mfr", "high"),
      sohFloorPct: f(70, "mfr", "high", "“Below 70% of original capacity” covered; ≤30% loss “considered normal”"),
      batteryTransfers: f(true, "mfr", "high", "“Warranty coverage is automatically transferred at no cost to subsequent vehicle owners”"),
    },
    buyerNotes: [
      {
        headline: "This listing's trim label doesn't match any real Toyota bZ grade",
        body: "Toyota's actual MY2026 bZ grades are XLE FWD, XLE FWD Plus, XLE AWD, Limited FWD, and Limited AWD — none named “Series.” This row assumes the base 57.7 kWh XLE FWD pack (236 mi EPA); a larger 74.7 kWh XLE FWD Plus pack is also sold on this same FWD drivetrain, rated 314 mi. Check the window sticker or door-jamb label to confirm which pack this car has.",
        severity: "warning",
      },
      {
        headline: "HV battery ECU recall — check this VIN's status",
        body: "26V393 (2026 Toyota bZ, Lexus RZ, and Subaru Solterra): the ECU controlling the HV battery may fault, causing loss of drive power. Free ECU software update; owner notices expected August 2026.",
        severity: "warning",
      },
    ],
  },

  {
    id: "bz-2026-fwd-plus",
    make: "TOYOTA",
    model: "bZ",
    modelYears: [2026, 2026],
    drive: "FWD",
    battery: { packGrossKwh: f(74.7, "mfr", "high", "Toyota press: larger FWD pack (XLE FWD Plus)") },
    range: { epaRangeMi: f(314, "mfr", "high", "2026 Toyota bZ, larger 74.7 kWh pack, FWD (XLE FWD Plus) — EPA; a smaller 57.7 kWh base pack is also available on this drivetrain, rated 236 mi — see buyer note", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("NACS", "mfr", "high", "Toyota press release: “NACS charging port” — confirmed change from the outgoing bZ4X's CCS1-only port"),
      dcPeakKw: f(150, "agg", "medium", "Widely reported flat across the 2026 bZ lineup; Toyota's own release states only “10% to 80% in around 30 minutes,” no kW figure"),
    },
    thermal: { heatPump: f("standard", "mfr", "high", "Toyota press release: “Heat pump system for both heating and air-conditioning” listed as standard") },
    warranty: {
      batteryYears: f(8, "mfr", "high", "Toyota's 8yr/100k battery+transaxle+inverter warranty, verified against both MY2023 and MY2026 guides, carries to the new bZ nameplate"),
      batteryMiles: f(100_000, "mfr", "high"),
      sohFloorPct: f(70, "mfr", "high", "“Below 70% of original capacity” covered; ≤30% loss “considered normal”"),
      batteryTransfers: f(true, "mfr", "high", "“Warranty coverage is automatically transferred at no cost to subsequent vehicle owners”"),
    },
    buyerNotes: [
      {
        headline: "This listing's trim label doesn't match any real Toyota bZ grade",
        body: "Toyota's actual MY2026 bZ grades are XLE FWD, XLE FWD Plus, XLE AWD, Limited FWD, and Limited AWD — none named “Series.” This row assumes the larger 74.7 kWh XLE FWD Plus pack (314 mi EPA); a smaller 57.7 kWh base pack is also sold on this same FWD drivetrain, rated 236 mi. Check the window sticker or door-jamb label to confirm which pack this car has.",
        severity: "warning",
      },
      {
        headline: "HV battery ECU recall — check this VIN's status",
        body: "26V393 (2026 Toyota bZ, Lexus RZ, and Subaru Solterra): the ECU controlling the HV battery may fault, causing loss of drive power. Free ECU software update; owner notices expected August 2026.",
        severity: "warning",
      },
    ],
  },

  {
    id: "bz-2026-awd",
    make: "TOYOTA",
    model: "bZ",
    modelYears: [2026, 2026],
    drive: "AWD",
    battery: { packGrossKwh: f(74.7, "mfr", "high", "Toyota press: single AWD pack shared by XLE AWD and Limited AWD") },
    range: { epaRangeMi: f(288, "mfr", "high", "2026 Toyota bZ XLE AWD — EPA; Limited AWD (same battery, different equipment): 278 mi", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("NACS", "mfr", "high", "Toyota press release: “NACS charging port” — confirmed change from the outgoing bZ4X's CCS1-only port"),
      dcPeakKw: f(150, "agg", "medium", "Widely reported flat across the 2026 bZ lineup; Toyota's own release states only “10% to 80% in around 30 minutes,” no kW figure"),
    },
    thermal: { heatPump: f("standard", "mfr", "high", "Toyota press release: “Heat pump system for both heating and air-conditioning” listed as standard") },
    warranty: {
      batteryYears: f(8, "mfr", "high", "Toyota's 8yr/100k battery+transaxle+inverter warranty, verified against both MY2023 and MY2026 guides, carries to the new bZ nameplate"),
      batteryMiles: f(100_000, "mfr", "high"),
      sohFloorPct: f(70, "mfr", "high", "“Below 70% of original capacity” covered; ≤30% loss “considered normal”"),
      batteryTransfers: f(true, "mfr", "high", "“Warranty coverage is automatically transferred at no cost to subsequent vehicle owners”"),
    },
    buyerNotes: [
      {
        headline: "This listing's trim label doesn't match any real Toyota bZ grade",
        body: "Toyota's actual MY2026 bZ grades are XLE FWD, XLE FWD Plus, XLE AWD, Limited FWD, and Limited AWD — none named “Series.” XLE AWD and Limited AWD share the same 74.7 kWh battery; range differs only slightly (288 vs 278 mi) by equipment.",
        severity: "info",
      },
      {
        headline: "HV battery ECU recall — check this VIN's status",
        body: "26V393 (2026 Toyota bZ, Lexus RZ, and Subaru Solterra): the ECU controlling the HV battery may fault, causing loss of drive power. Free ECU software update; owner notices expected August 2026.",
        severity: "warning",
      },
    ],
  },

  {
    id: "bz-woodland-2026-awd",
    make: "TOYOTA",
    model: "bZ Woodland",
    modelYears: [2026, 2026],
    drive: "AWD",
    battery: { packGrossKwh: f(74.7, "mfr", "high", "Toyota press: bZ Woodland and Woodland Premium both use this pack") },
    range: { epaRangeMi: f(281, "mfr", "high", "2026 bZ Woodland, standard 235/60R18 tires — EPA; Woodland Premium's all-terrain 235/65R18 tires: 260 mi", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("NACS", "mfr", "high", "Toyota's bZ Woodland press release: “NACS charging port”; onboard AC charger 11 kW, ~7.0 hr Level 2 full charge"),
      dcPeakKw: f(150, "agg", "medium", "Widely reported flat across the 2026 bZ lineup; Toyota's own release states only “10% to 80% in around 30 minutes,” no kW figure"),
    },
    thermal: { heatPump: f("standard", "agg", "medium", "A dealer page quoting Toyota's own spec sheet states heat pump standard; Toyota's own bZ Woodland press release itself doesn't mention it directly — one tier less direct than the base bZ's confirmation") },
    warranty: {
      batteryYears: f(8, "mfr", "high", "Toyota's 8yr/100k battery+transaxle+inverter warranty, verified against both MY2023 and MY2026 guides, carries to the new bZ nameplate"),
      batteryMiles: f(100_000, "mfr", "high"),
      sohFloorPct: f(70, "mfr", "high", "“Below 70% of original capacity” covered; ≤30% loss “considered normal”"),
      batteryTransfers: f(true, "mfr", "high", "“Warranty coverage is automatically transferred at no cost to subsequent vehicle owners”"),
    },
    buyerNotes: [
      {
        headline: "This listing's trim label doesn't match any real Toyota bZ Woodland grade",
        body: "Toyota's actual bZ Woodland lineup is “Woodland” and “Woodland Premium” — not “Series”-numbered. This row assumes base Woodland with standard-tire 281 mi EPA range; Woodland Premium's all-terrain tires bring that down to 260 mi. Check the window sticker or door-jamb label.",
        severity: "warning",
      },
      {
        headline: "No recalls found yet — but this is a very new nameplate",
        body: "As of 2026-08-10, NHTSA's recall database returns zero campaigns for bZ Woodland, and NHTSA's own model taxonomy doesn't yet list “Woodland” as a distinct model at all. Treat this as “not yet checkable” rather than a clean safety record — worth a re-check as the nameplate matures.",
        severity: "info",
      },
    ],
  },

  // ---------------------------------------------------------------------
  // Tesla Model S / Model X floor rows — fully retired (2026-08-14): the
  // 2021+ cars moved to vin8-keyed rows in data4.ts earlier that day, and
  // the pre-2021 S and X floors followed once the motor-code + pack-badge
  // rows landed (the feed now carries trims, which the floors predate).
  // ---------------------------------------------------------------------





  // ---------------------------------------------------------------------
  // GM Ultium EVs — Cadillac Optiq, Escalade IQ, Escalade IQL, GMC Sierra EV.
  // Warranty terms carried forward from the established GM-family convention
  // used for Lyriq/Silverado EV in data2.ts (8yr/100k, 75% SoH floor,
  // transfers at no cost), now on firmer footing: GMC's current-edition EV
  // warranty booklet was read directly this pass and confirms the exact
  // language for the GMC brand; Cadillac's 2022 Lyriq booklet confirms the
  // identical clause for that brand, though a current Cadillac-brand booklet
  // naming Optiq/Escalade IQ explicitly could not be retrieved.
  //
  // Notable split: Optiq charges natively via NACS (no adapter needed) —
  // the opposite of Escalade IQ/Sierra EV/Silverado EV/Lyriq, which are all
  // CCS1-native and need a GM adapter for Superchargers.
  // ---------------------------------------------------------------------
  {
    id: "cadillac-optiq-2026-2027",
    make: "CADILLAC",
    model: "Optiq",
    modelYears: [2026, 2027],
    drive: "RWD",
    battery: { packGrossKwh: f(85, "mfr", "high", "Cadillac's own Optiq specs page (cadillac.com)") },
    range: { epaRangeMi: f(317, "mfr", "high", "2026 and 2027 Optiq RWD — EPA (identical both years)", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("NACS", "mfr", "high", "Cadillac's own Optiq specs page: “J3400 (NACS)” — native NACS, unlike the CCS1-native pattern used by Escalade IQ/Sierra EV/Silverado EV/Lyriq"),
      superchargerAccess: f("native", "mfr", "high", "Charge port is NACS natively — no adapter needed for Superchargers; a GM-approved adapter is instead needed for CCS/J1772 chargers"),
      dcPeakKw: f(150, "mfr", "high", "Cadillac's own Optiq specs page: 150 kW peak, up to 81 mi added in ~10 min"),
    },
    thermal: { heatPump: f("standard", "agg", "medium", "GM's Ultium Energy Recovery heat pump is platform-wide standard; independently corroborated for the Optiq specifically by a trade-press writeup") },
    warranty: {
      batteryYears: f(8, "mfr", "high", "“8 years or 100,000 miles” — GMC's current-edition Electric Vehicle Limited Warranty booklet, read directly; same Ultium/BEV3 propulsion-battery-warranty family confirmed for the Cadillac brand via the 2022 Lyriq booklet"),
      batteryMiles: f(100_000, "mfr", "high"),
      sohFloorPct: f(75, "mfr", "high", "“The battery will be replaced/repaired if the capacity falls below 75% of its original value during the warranty period, as determined by a certified dealer” — GMC's current-edition EV warranty booklet, read directly"),
      batteryTransfers: f(true, "mfr", "high", "“Transferable at no cost” — GM EV booklets"),
    },
    buyerNotes: [
      {
        headline: "This car charges differently than most other GM EVs — no Supercharger adapter needed",
        body: "Optiq has a native NACS (Tesla-style) charge port, unlike Escalade IQ, Sierra EV, Silverado EV, and Lyriq, which are all CCS1-native and need a GM adapter for Superchargers. On Optiq, it's the reverse: a GM-approved adapter is needed to use CCS or J1772 chargers.",
        severity: "info",
      },
      {
        headline: "Tire tread-detachment recall — check this VIN's status",
        body: "25V704 (2025–2026 Optiq and Chevy Equinox EV with 21-inch Continental all-season tires from DOT week 4024): partial or full tread detachment risk. Free dealer inspection/replacement; owner notices mailed November 2025.",
        severity: "trap",
      },
      {
        headline: "Owner's manual recall",
        body: "26V114 (wide multi-model GM campaign): the radio wasn't set correctly during production and the electronic owner's manual failed to download. Free dealer radio reset; owner notices mailed April 2026.",
        severity: "info",
      },
    ],
  },

  {
    id: "cadillac-optiq-2027-awd", // window extended to 2026 (same 303-mi EPA rating, id 49948) 2026-08-14
    make: "CADILLAC",
    model: "Optiq",
    modelYears: [2026, 2027],
    drive: "AWD",
    battery: { packGrossKwh: f(85, "mfr", "high", "Cadillac's own Optiq specs page (cadillac.com); AWD adds a second motor, not a different pack, per the RWD/AWD EPA records sharing the same platform family") },
    range: { epaRangeMi: f(303, "mfr", "high", "2027 Optiq AWD — EPA", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("NACS", "mfr", "high", "Cadillac's own Optiq specs page: “J3400 (NACS)” — native NACS, unlike the CCS1-native pattern used by Escalade IQ/Sierra EV/Silverado EV/Lyriq"),
      superchargerAccess: f("native", "mfr", "high", "Charge port is NACS natively — no adapter needed for Superchargers; a GM-approved adapter is instead needed for CCS/J1772 chargers"),
      dcPeakKw: f(150, "mfr", "high", "Cadillac's own Optiq specs page: 150 kW peak, up to 81 mi added in ~10 min"),
    },
    thermal: { heatPump: f("standard", "agg", "medium", "GM's Ultium Energy Recovery heat pump is platform-wide standard; independently corroborated for the Optiq specifically by a trade-press writeup") },
    warranty: {
      batteryYears: f(8, "mfr", "high", "“8 years or 100,000 miles” — GMC's current-edition Electric Vehicle Limited Warranty booklet, read directly; same Ultium/BEV3 propulsion-battery-warranty family confirmed for the Cadillac brand via the 2022 Lyriq booklet"),
      batteryMiles: f(100_000, "mfr", "high"),
      sohFloorPct: f(75, "mfr", "high", "“The battery will be replaced/repaired if the capacity falls below 75% of its original value during the warranty period, as determined by a certified dealer” — GMC's current-edition EV warranty booklet, read directly"),
      batteryTransfers: f(true, "mfr", "high", "“Transferable at no cost” — GM EV booklets"),
    },
    buyerNotes: [
      {
        headline: "This car charges differently than most other GM EVs — no Supercharger adapter needed",
        body: "Optiq has a native NACS (Tesla-style) charge port, unlike Escalade IQ, Sierra EV, Silverado EV, and Lyriq, which are all CCS1-native and need a GM adapter for Superchargers. On Optiq, it's the reverse: a GM-approved adapter is needed to use CCS or J1772 chargers.",
        severity: "info",
      },
      {
        headline: "Owner's manual recall",
        body: "26V114 (wide multi-model GM campaign): the radio wasn't set correctly during production and the electronic owner's manual failed to download. Free dealer radio reset; owner notices mailed April 2026.",
        severity: "info",
      },
    ],
  },

  {
    id: "cadillac-escalade-iq-2026",
    make: "CADILLAC",
    model: "Escalade IQ",
    modelYears: [2025, 2026], // window extended to the MY2025 launch year (2026-08-14)
    drive: "AWD",
    battery: { packGrossKwh: f(205, "mfr", "high", "Cadillac's own Escalade IQ specs page (cadillac.com)") },
    range: {
      epaRangeMi: f(465, "mfr", "medium", "Cadillac-estimated 465 mi — NOT an EPA rating; at ~10,600 lb GVWR the Escalade IQ is exempt from EPA range labeling (see note)", "https://www.cadillac.com/electric/escalade-iq"),
      
      testedRangeMi: f(482, "tested", "high", "70-mph steady-state (InsideEVs): 482.2 mi, using 222.7 kWh. Edmunds' own mixed-driving methodology recorded 558 mi; a third-party 60-mph constant-speed test (Tom Moloughney/State of Charge) recorded 607 mi — all three exceed Cadillac's own 465-mi estimate. No EPA-certified figure exists to compare against."),
    },
    charging: {
      portStandard: f("CCS1", "mfr", "high", "Cadillac's own Escalade IQ specs page"),
      superchargerAccess: f("adapter", "mfr", "high", "GM-approved adapter, 29,000+ Tesla Superchargers — the opposite pattern from Optiq, which is NACS-native"),
      dcPeakKw: f(350, "mfr", "high", "Cadillac's own Escalade IQ specs page: 350 kW peak, up to 117 mi in ~10 min"),
      architectureV: f(800, "mfr", "high", "Cadillac's own Escalade IQ specs page"),
    },
    thermal: { heatPump: f("standard", "agg", "low", "GM's Ultium Energy Recovery heat pump is platform-wide standard; not independently re-confirmed for Escalade IQ specifically") },
    warranty: {
      batteryYears: f(8, "mfr", "high", "“8 years or 100,000 miles” — GMC's current-edition Electric Vehicle Limited Warranty booklet, read directly; same Ultium/BEV3 propulsion-battery-warranty family confirmed for the Cadillac brand via the 2022 Lyriq booklet"),
      batteryMiles: f(100_000, "mfr", "high"),
      sohFloorPct: f(75, "mfr", "high", "“The battery will be replaced/repaired if the capacity falls below 75% of its original value during the warranty period, as determined by a certified dealer” — GMC's current-edition EV warranty booklet, read directly"),
      batteryTransfers: f(true, "mfr", "high", "“Transferable at no cost” — GM EV booklets"),
    },
    buyerNotes: [
      {
        headline: "No EPA-certified range exists for this vehicle — Cadillac's own figure is not an EPA rating",
        body: "At roughly 10,600 lb GVWR, Escalade IQ exceeds the 10,000 lb cutoff for EPA's fuel-economy/range labeling program — the same weight-class exemption that applies to the Hummer EV. fueleconomy.gov has no Escalade IQ record under any model year checked, confirming the exemption applies here too. Cadillac's own marketing states “465 miles, Cadillac-estimated” — its own site explicitly does not call this an EPA figure. Independent instrumented tests (below) suggest the real-world range is at least in that neighborhood, but there is no government-certified number to cite.",
        severity: "warning",
      },
      {
        headline: "HV battery module recall — remedy not yet available",
        body: "26V494 (2026 Escalade IQ, Escalade IQL, Sierra EV, Silverado EV): an improperly secured internal module component in the HV battery may move and damage the battery, increasing fire risk. Dealers will replace the entire HV battery free of charge, but owner notification letters were not expected to be mailed until September 14, 2026 — as of this writing, the remedy process had not yet started for affected owners.",
        severity: "trap",
      },
    ],
  },

  {
    id: "cadillac-escalade-iql-2026",
    make: "CADILLAC",
    model: "Escalade IQL",
    modelYears: [2026, 2026],
    drive: "AWD",
    range: { epaRangeMi: f(460, "mfr", "medium", "Cadillac-estimated 460 mi — NOT an EPA rating; the IQL shares the Escalade IQ's EPA weight-class exemption", "https://www.cadillac.com/electric/escalade-iql") },
    battery: { packGrossKwh: f(200, "mfr", "medium", "Cadillac's own Escalade IQL specs page states only “over 200 kWh” — vaguer wording than the Escalade IQ page's specific 205 kWh figure") },
    charging: {
      portStandard: f("CCS1", "mfr", "high", "Cadillac's own Escalade IQL specs page"),
      superchargerAccess: f("adapter", "mfr", "high", "GM-approved adapter, 29,000+ Tesla Superchargers"),
      dcPeakKw: f(350, "mfr", "high", "Cadillac's own Escalade IQL specs page"),
      architectureV: f(800, "mfr", "high", "Cadillac's own Escalade IQL specs page"),
    },
    thermal: { heatPump: f("standard", "agg", "low", "GM's Ultium Energy Recovery heat pump is platform-wide standard; not independently re-confirmed for Escalade IQL specifically") },
    warranty: {
      batteryYears: f(8, "mfr", "high", "“8 years or 100,000 miles” — GMC's current-edition Electric Vehicle Limited Warranty booklet, read directly; same Ultium/BEV3 propulsion-battery-warranty family confirmed for the Cadillac brand via the 2022 Lyriq booklet"),
      batteryMiles: f(100_000, "mfr", "high"),
      sohFloorPct: f(75, "mfr", "high", "“The battery will be replaced/repaired if the capacity falls below 75% of its original value during the warranty period, as determined by a certified dealer” — GMC's current-edition EV warranty booklet, read directly"),
      batteryTransfers: f(true, "mfr", "high", "“Transferable at no cost” — GM EV booklets"),
    },
    buyerNotes: [
      {
        headline: "No EPA-certified range exists for this vehicle — Cadillac's own figure is not an EPA rating",
        body: "fueleconomy.gov has no Escalade IQL record under any model year checked. Cadillac's own marketing states “460 miles, Cadillac-estimated” — its own site explicitly does not call this an EPA figure. The shorter-wheelbase Escalade IQ has been independently tested well past its own estimate, but no reviewer has published a tested figure for the IQL specifically — don't assume the IQ's test results carry over.",
        severity: "warning",
      },
      {
        headline: "HV battery module recall — remedy not yet available",
        body: "26V494 (2026 Escalade IQ, Escalade IQL, Sierra EV, Silverado EV): an improperly secured internal module component in the HV battery may move and damage the battery, increasing fire risk. Dealers will replace the entire HV battery free of charge, but owner notification letters were not expected to be mailed until September 14, 2026 — as of this writing, the remedy process had not yet started for affected owners.",
        severity: "trap",
      },
    ],
  },

  {
    id: "sierra-ev-2026-standard-range",
    make: "GMC",
    model: "Sierra EV",
    modelYears: [2026, 2026],
    drive: "AWD",
    battery: { packGrossKwh: f(120, "agg", "low", "Reported by a GM-focused trade outlet, corroborated by a second aggregator; not confirmed on any gmc.com page — GMC's own /specs and /charging pages for Sierra EV both 404") },
    range: { epaRangeMi: f(283, "mfr", "high", "2026 Sierra EV Elevation, Standard Range (the pack this trim ships with by default) — EPA, cross-corroborated by GMC's own site FAQ", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("CCS1", "agg", "low", "Not stated on any GMC page found for Sierra EV specifically; inferred by platform-family analogy to Silverado EV, which shares this Ultium truck platform"),
      dcPeakKw: f(220, "agg", "low", "Reported by a GM-focused trade outlet; not confirmed on a GM page"),
    },
    thermal: { heatPump: f("standard", "agg", "low", "GM's Ultium Energy Recovery heat pump is platform-wide standard; not independently confirmed on any GMC page for Sierra EV") },
    warranty: {
      batteryYears: f(8, "mfr", "high", "“8 years or 100,000 miles” — GMC's current-edition Electric Vehicle Limited Warranty booklet, read directly and directly governs this brand/model"),
      batteryMiles: f(100_000, "mfr", "high"),
      sohFloorPct: f(75, "mfr", "high", "“The battery will be replaced/repaired if the capacity falls below 75% of its original value during the warranty period, as determined by a certified dealer” — GMC's current-edition EV warranty booklet, read directly"),
      batteryTransfers: f(true, "mfr", "high", "“Transferable at no cost” — GM EV booklets"),
    },
    buyerNotes: [
      {
        headline: "This listing doesn't say which battery pack this Elevation trim has",
        body: "GMC's own site confirms the Elevation trim ships standard with the Standard Range pack (283 mi EPA) but offers an Extended Range pack (410 mi EPA) as an upgrade on the same trim. This row assumes Standard Range; check the window sticker or door-jamb label to confirm.",
        severity: "warning",
      },
      {
        headline: "HV battery module recall — remedy not yet available",
        body: "26V494 (2026 Sierra EV, Silverado EV, Escalade IQ, Escalade IQL): an improperly secured internal module component in the HV battery may move and damage the battery, increasing fire risk. Dealers will replace the entire HV battery free of charge, but owner notification letters were not expected to be mailed until September 14, 2026.",
        severity: "trap",
      },
      {
        headline: "Spare-wheel cracking and ESC-warning-light recalls",
        body: "26V496 (2026 Sierra EV/Silverado EV built Oct 2025–Mar 2026, ~513 units): the spare steel wheel may crack at the disc vent holes. Remedy pending, letters expected September 2026. 25V594 (2026 Sierra EV/Silverado EV): after an ESC malfunction, the warning light may not re-illuminate on the next key cycle. Free OTA or dealer software update, already available.",
        severity: "warning",
      },
    ],
  },

  {
    id: "sierra-ev-2026-extended-range",
    make: "GMC",
    model: "Sierra EV",
    modelYears: [2026, 2026],
    drive: "AWD",
    battery: { packGrossKwh: f(170, "agg", "low", "Reported by a GM-focused trade outlet, corroborated by a second aggregator; not confirmed on any gmc.com page — GMC's own /specs and /charging pages for Sierra EV both 404") },
    range: { epaRangeMi: f(410, "mfr", "high", "2026 Sierra EV Elevation with the optional Extended Range pack — EPA, cross-corroborated by GMC's own site FAQ", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("CCS1", "agg", "low", "Not stated on any GMC page found for Sierra EV specifically; inferred by platform-family analogy to Silverado EV, which shares this Ultium truck platform"),
      dcPeakKw: f(300, "agg", "low", "Reported by a GM-focused trade outlet; not confirmed on a GM page"),
    },
    thermal: { heatPump: f("standard", "agg", "low", "GM's Ultium Energy Recovery heat pump is platform-wide standard; not independently confirmed on any GMC page for Sierra EV") },
    warranty: {
      batteryYears: f(8, "mfr", "high", "“8 years or 100,000 miles” — GMC's current-edition Electric Vehicle Limited Warranty booklet, read directly and directly governs this brand/model"),
      batteryMiles: f(100_000, "mfr", "high"),
      sohFloorPct: f(75, "mfr", "high", "“The battery will be replaced/repaired if the capacity falls below 75% of its original value during the warranty period, as determined by a certified dealer” — GMC's current-edition EV warranty booklet, read directly"),
      batteryTransfers: f(true, "mfr", "high", "“Transferable at no cost” — GM EV booklets"),
    },
    buyerNotes: [
      {
        headline: "This listing doesn't say which battery pack this Elevation trim has",
        body: "GMC's own site confirms the Elevation trim ships standard with the Standard Range pack (283 mi EPA) but offers this Extended Range pack (410 mi EPA) as an upgrade on the same trim. This row assumes Extended Range; check the window sticker or door-jamb label to confirm.",
        severity: "warning",
      },
      {
        headline: "HV battery module recall — remedy not yet available",
        body: "26V494 (2026 Sierra EV, Silverado EV, Escalade IQ, Escalade IQL): an improperly secured internal module component in the HV battery may move and damage the battery, increasing fire risk. Dealers will replace the entire HV battery free of charge, but owner notification letters were not expected to be mailed until September 14, 2026.",
        severity: "trap",
      },
      {
        headline: "Spare-wheel cracking and ESC-warning-light recalls",
        body: "26V496 (2026 Sierra EV/Silverado EV built Oct 2025–Mar 2026, ~513 units): the spare steel wheel may crack at the disc vent holes. Remedy pending, letters expected September 2026. 25V594 (2026 Sierra EV/Silverado EV): after an ESC malfunction, the warning light may not re-illuminate on the next key cycle. Free OTA or dealer software update, already available.",
        severity: "warning",
      },
    ],
  },
];
