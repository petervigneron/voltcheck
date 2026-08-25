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

// A fueleconomy.gov citation that resolves to the exact record a figure came
// from, rather than the site's front door (same convention as data4.ts).
const epa = (id: number) => `https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=${id}`;

// NHTSA 26V393 covers the 2026 bZ, Lexus RZ and Subaru Solterra, so every bZ
// row carries the identical note; bZ Woodland is not in the campaign.
const BZ_RECALL_NOTE = {
  headline: "A battery-ECU fault can cut drive power; free update, confirm it on this car",
  body: "26V393 (2026 Toyota bZ, Lexus RZ, and Subaru Solterra): the ECU controlling the HV battery may fault, causing loss of drive power. Free ECU software update; owner notices expected August 2026.",
  severity: "warning" as const,
};

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
      packGrossKwh: f(78, "mfr", "high", undefined, "https://www.polestar.com"),
      packUsableKwh: f(75, "agg", "medium", "Corroborated by an independent InsideEVs review; not the exact wording of Polestar's own spec table"),
    },
    range: {
      epaRangeMi: f(233, "mfr", "high", "2021 Polestar 2 dual-motor Launch Edition, the only EPA-certified US variant for MY2021, EPA", "https://www.fueleconomy.gov"),
      testedRangeMi: f(226, "tested", "high", "70-mph steady highway (InsideEVs): 226 mi sustained before needing to slow, +7 mi on secondary roads = 233.4 mi total, essentially matched EPA combined and slightly beat EPA highway (222 mi)"),
    },
    charging: {
      portStandard: f("CCS1", "agg", "medium", "Widely reported as CCS1 for the US market; not confirmed in a Polestar primary spec document"),
      dcPeakKw: f(150, "agg", "medium", "Polestar's rated peak; see buyer note on the real-world shortfall InsideEVs measured on this specific car"),
    },
    thermal: { heatPump: f("none", "agg", "medium", "Heat pump was introduced via a “Plus Pack” announced April 2021 for updated/MY2022 builds, not confirmed standard on the original MY2021 Launch Edition") },
    warranty: {
      batteryYears: f(8, "mfr", "high"),
      batteryMiles: f(100_000, "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high"),
    },
    buyerNotes: [
      {
        headline: "A battery-control fault can cut drive power; free fix, confirm it on this car",
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
        body: "InsideEVs measured only about 99 kW peak DC charging on a 2021 Polestar 2 test car, against Polestar's 150 kW rating, attributed at the time to a software/network compatibility limit, which may not reflect current software on every car.",
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
      packGrossKwh: f(111.5, "mfr", "high", "BMW USA press: “Energy capacity, gross/net kWh 111.5/106.3”, shared pack across xDrive50 and M60"),
      packUsableKwh: f(106.3, "mfr", "high"),
    },
    range: {
      epaRangeMi: f(288, "mfr", "high", "21-inch wheels, standard", epa(45326)),
      testedRangeMi: f(325, "tested", "medium", "Edmunds real-world test, 22-inch-wheel M60: 325 mi, reported tier, Edmunds domain-wide 403s block direct verification; no InsideEVs 70-mph or Car and Driver 75-mph test found for M60 specifically"),
    },
    charging: {
      portStandard: f("CCS1", "agg", "medium", "BMW's own term is “Combined Charging Unit”; not independently re-verified as CCS1 in the M60-specific press document, but consistent with the rest of the US BMW BEV lineup"),
      superchargerAccess: f("adapter", "agg", "high", "Opened Dec 2025 via BMW-approved adapter; requires a Remote Software Upgrade first, same platform-level fact as i4"),
      dcPeakKw: f(195, "mfr", "high", "BMW USA press: “Maximum charging, DC kW 195”, platform-level figure shared with xDrive50; some secondary aggregators round this to 200 kW"),
    },
    thermal: { heatPump: f("standard", "mfr", "high", "BMW USA iX launch press release: “Integrated Heating and Cooling System with Heat Pump Function…for both the BMW eDrive components and the vehicle interior”, platform-level; M60 shares the same drivetrain/battery/thermal hardware") },
    warranty: {
      batteryYears: f(8, "mfr", "high"),
      batteryMiles: f(100_000, "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high"),
      extendedCoverage: f("MY2023 capacity-floor status is unresolved (MY2022 verified as no floor; MY2026 verified at 70% SoH; MY2023–25 booklets unobtainable). BMW Certified MY22–25 EVs delivered certified after 2026-03-01 get an 8yr/100k, 75%-SoH CPO battery coverage, verified.", "mfr", "high"),
    },
    buyerNotes: [
      {
        headline: "Several battery recalls, one a fire risk with a remedy still pending; confirm status on this car",
        body: "22V541 (2022–23 iX/i4: internal battery damage, short-circuit/fire risk, park-it/park-outside advisory, battery replacement); 25V470 (2022–2025 iX: battery cell module improperly assembled, fire risk, remedy was still pending as of the September 2025 interim notice, with parts anticipated by end of 2025); 22V944 (HV battery ECU software, power interruption); 23V449 (HV battery charging unit improperly assembled, stall risk).",
        severity: "trap",
      },
      {
        headline: "Drive motor controller software recall",
        body: "25V395 (2022–2024 iX): a software fault in the drive motor controller can cause an HV shutdown and loss of drive power. Remedy is OTA or dealer software update; notices mailed around August 2025.",
        severity: "warning",
      },
      {
        headline: "The MY2025–26 “SoH stuck at 100%” bug does not apply to this car",
        body: "This service action (NHTSA bulletin SIB 61 20 25) is scoped explicitly to the G60 platform, i5 eDrive40, i5 xDrive40, and 550e xDrive built Feb–Oct 2025. The iX (I20 platform) is not named in the bulletin, so an unrepaired SoH reading on this car is not evidence of that specific bug.",
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
      packGrossKwh: f(111.5, "mfr", "high", "BMW USA press: “Energy capacity, gross/net kWh 111.5/106.3”, shared pack across xDrive50 and M60"),
      packUsableKwh: f(106.3, "mfr", "high"),
    },
    range: { epaRangeMi: f(307, "mfr", "high", "MY2024: 307 on every wheel size; MY2025: 302–309 by wheels, EPA", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("CCS1", "agg", "medium", "BMW's own term is “Combined Charging Unit”; not independently re-verified as CCS1 in a xDrive50-specific document, but consistent with the rest of the US BMW BEV lineup"),
      superchargerAccess: f("adapter", "agg", "high", "Opened Dec 2025 via BMW-approved adapter; requires a Remote Software Upgrade first, same platform-level fact as i4/M60"),
      dcPeakKw: f(195, "mfr", "high", "BMW USA press: “Maximum charging, DC kW 195”, platform-level figure shared with M60"),
    },
    thermal: { heatPump: f("standard", "mfr", "high", "BMW USA iX launch press release: integrated heat pump for cabin, battery, and drive, platform-level; xDrive50 shares the same drivetrain/battery/thermal hardware as M60") },
    warranty: {
      batteryYears: f(8, "mfr", "high"),
      batteryMiles: f(100_000, "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high"),
      extendedCoverage: f("MY2024–25 capacity-floor status is unresolved (MY2022 verified as no floor; MY2026 verified at 70% SoH; MY2023–25 booklets unobtainable). BMW Certified MY22–25 EVs delivered certified after 2026-03-01 get an 8yr/100k, 75%-SoH CPO battery coverage, verified.", "mfr", "high"),
    },
    buyerNotes: [
      {
        headline: "Two battery recalls, one a fire risk still awaiting a remedy; confirm both on this car",
        body: "23V295 (2022–2024 xDrive50: HV battery cell monitoring circuit loose connections can cause a stall); 25V470 (2022–2025 iX: battery cell module improperly assembled, fire risk, remedy was still pending as of the September 2025 interim notice, parts anticipated by end of 2025).",
        severity: "trap",
      },
      {
        headline: "Cruise control and drive motor controller recalls",
        body: "23V409 (2022–2024 xDrive50/M60: cruise control may unintentionally reactivate while turning at low speed); 25V395 (2022–2025 iX: a software fault in the drive motor controller can cause an HV shutdown and loss of drive power). Both remedied by free software update.",
        severity: "warning",
      },
      {
        headline: "The MY2025–26 “SoH stuck at 100%” bug does not apply to this car",
        body: "This service action (NHTSA bulletin SIB 61 20 25) is scoped explicitly to the G60 platform, i5 eDrive40, i5 xDrive40, and 550e xDrive built Feb–Oct 2025. The iX (I20 platform) is not named in the bulletin.",
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
    range: { epaRangeMi: f(303, "mfr", "high", "21-inch wheels, standard", epa(49627)) },
    charging: {
      portStandard: f("CCS1", "agg", "low", "Inferred by platform continuity from the outgoing xDrive50/M60 generation; not independently confirmed for the MY2026-refresh M70"),
      superchargerAccess: f("adapter", "agg", "low"),
    },
    thermal: { heatPump: f("standard", "agg", "low") },
    warranty: {
      batteryYears: f(8, "mfr", "high"),
      batteryMiles: f(100_000, "mfr", "high"),
      sohFloorPct: f(70, "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high"),
    },
    buyerNotes: [
      {
        headline: "This is a new-generation iX, battery specs not yet independently confirmed",
        body: "M70 is part of BMW's 2026 iX refresh (replacing the xDrive40/xDrive50/M60 lineup with xDrive45/xDrive60/M70). Battery capacity for this generation was not confirmed in this research pass, don't assume it matches the outgoing generation's 111.5/106.3 kWh pack.",
        severity: "info",
      },
      {
        headline: "No recalls on file yet",
        body: "As of 2026-08-10, NHTSA's recall database returns zero campaigns for the 2026 iX M70, consistent with this being a brand-new model-year refresh.",
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
      packUsableKwh: f(84, "mfr", "high", "Audi: “84 kWh of energy net”, do not confuse with the 2025+ refreshed e-tron GT's larger 105/97 kWh pack"),
    },
    range: {
      epaRangeMi: f(249, "mfr", "high", "2024 Audi e-tron GT quattro, EPA (RS e-tron GT performance variant rates identically at 249 mi despite higher output)", "https://www.fueleconomy.gov"),
      testedRangeMi: f(273, "tested", "medium", "Edmunds test of the MY2022 e-tron GT (273 mi), same-generation battery, but predates the MY2024 EPA rating bump from 238 to 249 mi; no test found matching the 2024 car's exact rating"),
    },
    charging: {
      portStandard: f("CCS1", "agg", "medium", "Universal across US e-tron GT production; not independently re-confirmed against a primary Audi spec sheet in this research pass"),
      architectureV: f(800, "mfr", "high"),
      dcPeakKw: f(270, "mfr", "high", "Audi: “up to 270 kW”, 5%→80% SoC in under 22.5 minutes, do not confuse with the 2025+ refreshed e-tron GT's 320 kW rating on a different pack"),
    },
    thermal: { heatPump: f("standard", "mfr", "high") },
    warranty: {
      batteryYears: f(8, "agg", "low", "Commonly reported across dealer/aggregator sources but not confirmed in a readable Audi USA primary document, Audi's own new-vehicle warranty page states only the 4yr/50k basic term and does not separately address the HV battery"),
      batteryMiles: f(100_000, "agg", "low", "Same caveat as batteryYears"),
    },
    buyerNotes: [
      {
        headline: "A battery short-circuit fire recall; even repaired cars need the newer fix, confirm it",
        body: "24V228 and 24V726 (2024 e-tron GT/RS e-tron GT): the HV battery may short internally, fire risk. 24V726 supersedes and expands 24V228, cars already repaired under the earlier campaign still need the newer remedy (advanced diagnostic software, plus interim 80% charge cap or online monitoring in some cases).",
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
      epaRangeMi: f(420, "mfr", "high", "19-inch wheels, standard", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48374"),
      testedRangeMi: f(366, "tested", "high", "70-mph steady-state (InsideEVs): 365.6 mi, 12.9% below the 420-mi EPA rating. Edmunds test on 20-inch wheels/summer tires: 349 mi (vs 372 mi EPA for that config), reported tier, Edmunds fetch blocked. Car and Driver ~310 mi at 75 mph reported only via secondary summary, not independently confirmed."),
    },
    charging: {
      portStandard: f("CCS1", "mfr", "high", "Lucid's own site: “Your Lucid Air has a J1772 (CCS1) charge port”, confirmed current as of the most recent Lucid material found (July 2025); still no native NACS port"),
      superchargerAccess: f("adapter", "mfr", "high", "All Air owners gained Supercharger access July 31, 2025 via a Lucid-sold NACS-to-CCS1 adapter ($220); capped around 50 kW / up to 200 mi of range per hour on that adapter path, well below the car's native CCS1 DC peak"),
      dcPeakKw: f(219, "agg", "low", "Lucid's own Pure spec sheet gives only a charge-time estimate, no peak-kW figure (pack architecture is “650V+” per that sheet, outside this site's 400/800V field, noted here instead). A third-party instrumented test (evchargingstations.com) measured 219 kW peak on a 350 kW DC charger, sustained above 210 kW to 18% SOC, secondary, unverified"),
    },
    thermal: { heatPump: f("standard", "mfr", "high", "Lucid IR press release: “The heat pump first employed on Lucid Sapphire now becomes standard across the lineup”, MY2025 onward; not standard in earlier model years") },
    warranty: {
      batteryYears: f(8, "mfr", "high"),
      batteryMiles: f(100_000, "mfr", "high"),
      sohFloorPct: f(70, "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high"),
    },
    buyerNotes: [
      {
        headline: "Four recalls on RWD builds, none on the AWD Touring; confirm each on this car",
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
    range: { epaRangeMi: f(406, "mfr", "high", "19-inch wheels, standard", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48377") },
    charging: {
      portStandard: f("CCS1", "mfr", "high", "Lucid's own site: “Your Lucid Air has a J1772 (CCS1) charge port”, confirmed current as of the most recent Lucid material found (July 2025); still no native NACS port"),
      superchargerAccess: f("adapter", "mfr", "high", "All Air owners gained Supercharger access July 31, 2025 via a Lucid-sold NACS-to-CCS1 adapter ($220); capped around 50 kW / up to 200 mi of range per hour on that adapter path, well below the car's native CCS1 DC peak"),
      dcPeakKw: f(250, "mfr", "high", "Lucid's own Touring spec sheet: “DC charge power: Up to 250 kW” (pack architecture is “700V+” per that sheet, outside this site's 400/800V field, noted here instead)"),
    },
    thermal: { heatPump: f("standard", "mfr", "high", "Lucid IR press release: “The heat pump first employed on Lucid Sapphire now becomes standard across the lineup”, MY2025 onward; not standard in earlier model years") },
    warranty: {
      batteryYears: f(8, "mfr", "high"),
      batteryMiles: f(100_000, "mfr", "high"),
      sohFloorPct: f(70, "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high"),
    },
    buyerNotes: [
      {
        headline: "Rearview-camera recalls apply across the Air lineup",
        body: "25V670 (2022–2025, all trims: camera image can fail, delay, or display inaccurately) and 26V017 (2022–2026, cars with the AD02 package: camera may not display in reverse). Both fixed via free OTA update. The Pure RWD's wiring-harness, half-shaft, and inverter recalls do not apply to this AWD Touring.",
        severity: "warning",
      },
    ],
  },

  {
    // The Grand Touring needs its own row because "Touring" is a substring of
    // "Grand Touring", so trimStringsOverlap handed all 7 live MY2025 Grand
    // Tourings the Touring row's 406 mi — understating Lucid's flagship by 74.
    // Its standard wheel is the 20-inch Aero Lite (Lucid's own per-trim spec
    // data), not the 19 the Pure and Touring get, so the standard-config
    // figure here is 480 rather than the 19-inch 512.
    id: "lucid-air-2025-grand-touring-awd",
    make: "LUCID",
    model: "Air",
    modelYears: [2025, 2025],
    trim: "Grand Touring",
    drive: "AWD",
    // Pack read off the same Lucid document the 480-mile figure above was
    // checked against — its range table prints 512/480/446 for 19/20/21-inch
    // wheels, which is where this row's standard-config choice comes from.
    // Same shape as the Pure (84, 16 module) and Touring (92, 18 module) rows.
    battery: { packGrossKwh: f(117, "mfr", "high", "Lucid's own 2025 Grand Touring technical-spec sheet: \u201c117 (22 module)\u201d; no usable/net split published by Lucid", "https://lucidmotors.com/media/document/lucid-air-grand-touring-technical-specs-2025.pdf") },
    range: { epaRangeMi: f(480, "mfr", "high", "20-inch wheels, standard", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48372") },
    charging: {
      portStandard: f("CCS1", "mfr", "high", "Lucid's own site: “Your Lucid Air has a J1772 (CCS1) charge port”, confirmed current as of the most recent Lucid material found (July 2025); still no native NACS port"),
      superchargerAccess: f("adapter", "mfr", "high", "All Air owners gained Supercharger access July 31, 2025 via a Lucid-sold NACS-to-CCS1 adapter ($220); capped around 50 kW / up to 200 mi of range per hour on that adapter path, well below the car's native CCS1 DC peak"),
      dcPeakKw: f(300, "mfr", "high", undefined, "https://lucidmotors.com/media/document/lucid-air-grand-touring-technical-specs-2025.pdf"),
    },
    thermal: { heatPump: f("standard", "mfr", "high", "Lucid IR press release: “The heat pump first employed on Lucid Sapphire now becomes standard across the lineup”, MY2025 onward; not standard in earlier model years") },
    warranty: {
      batteryYears: f(8, "mfr", "high"),
      batteryMiles: f(100_000, "mfr", "high"),
      sohFloorPct: f(70, "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high"),
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
  // which already has its own rows).
  //
  // These rows were written keyed on drivetrain alone, on the finding that
  // our feed labelled these cars "11 Series" / "15 Series" / "17 Series",
  // which are not Toyota grade names. Re-counted against the live feed
  // 2026-08-22: of 2,589 MY2026 bZ listings, 1,950 read "XLE", 402 "Limited",
  // 199 "XLE Plus", and 3 "15 Series". The junk labels are the exception now,
  // not the rule, and keying on drivetrain alone was costing real accuracy —
  // every AWD Limited was being shown the XLE AWD's 288 mi when EPA rates it
  // 278, and every one of those 2,589 cars carried a buyer note telling its
  // shopper the trim wasn't a real grade.
  //
  // So: one trim-agnostic row per nameplate carrying what every version
  // shares (port, peak rate, heat pump, warranty, the recall), and a
  // trim-keyed row per grade carrying the two facts that actually vary —
  // pack size and EPA range. A car whose trim we can't read matches the
  // agnostic row and is shown no range at all, which is the honest answer
  // when 236 and 314 are both live on the same drivetrain. No note explains
  // that; the absence is the statement.
  //
  // MY2026 grades and EPA records (fueleconomy.gov, re-pulled 2026-08-22):
  //   XLE FWD       57.7 kWh  236 mi  id 49983
  //   XLE FWD Plus  74.7 kWh  314 mi  id 50042
  //   Limited FWD   74.7 kWh  299 mi  id 50043 / 296 mi id 49984
  //   XLE AWD       74.7 kWh  288 mi  id 49985
  //   Limited AWD   74.7 kWh  278 mi  id 49986
  //   Woodland      74.7 kWh  281 mi  id 50305 (235/60R18)
  //   Woodland Prem 74.7 kWh  260 mi  id 50306 (235/65R18)
  //
  // Limited FWD has two EPA records three miles apart. They are not two
  // grades: both are "bZ LIMITED" FWD, both draw 8.0 hr on 240V and ~80 kWh
  // at the wall (the 74.7 kWh pack; the 57.7 kWh XLE draws 6.0 hr and 61
  // kWh), so this is one pack from two cell suppliers — 191 Ah at ~391 V and
  // 200 Ah at ~373 V — exactly the split already recorded on the bZ4X. A VIN
  // cannot tell them apart, so the row states the lower of the two published
  // figures. That is a 1% choice made in the direction that cannot cost a
  // shopper money, not a rule that the lowest EPA figure wins generally.
  // ---------------------------------------------------------------------
  {
    id: "bz-2026",
    make: "TOYOTA",
    model: "bZ",
    modelYears: [2026, 2026],
    // Base row for the nameplate — see the block comment above. Both facts
    // that vary by grade live on the trim-keyed rows; this one carries only
    // what every 2026 bZ shares.
    abstains: {
      packUsableKwh: "Varies by grade (XLE FWD 57.7 kWh, every other grade 74.7); the trim-keyed rows below carry it, and a car whose grade we cannot read is shown nothing",
      epaRangeMi: "Varies by grade across 236 to 314 miles on the same nameplate; the trim-keyed rows below carry it, and picking one for a car we cannot place would be a coin flip",
    },
    charging: {
      portStandard: f("NACS", "mfr", "high"),
      dcPeakKw: f(150, "agg", "medium"),
      chargeTime1080Min: f(30, "mfr", "medium"),
    },
    thermal: { heatPump: f("standard", "mfr", "high") },
    warranty: {
      batteryYears: f(8, "mfr", "high"),
      batteryMiles: f(100_000, "mfr", "high"),
      sohFloorPct: f(70, "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high"),
    },
    buyerNotes: [BZ_RECALL_NOTE],
  },

  {
    id: "bz-2026-fwd-xle",
    make: "TOYOTA",
    model: "bZ",
    modelYears: [2026, 2026],
    trim: ["XLE", "XLE FWD"],
    drive: "FWD",
    battery: { packGrossKwh: f(57.7, "mfr", "high") },
    range: { epaRangeMi: f(236, "mfr", "high", undefined, epa(49983)) },
    charging: {
      portStandard: f("NACS", "mfr", "high"),
      dcPeakKw: f(150, "agg", "medium"),
      chargeTime1080Min: f(30, "mfr", "medium"),
    },
    thermal: { heatPump: f("standard", "mfr", "high") },
    warranty: {
      batteryYears: f(8, "mfr", "high"),
      batteryMiles: f(100_000, "mfr", "high"),
      sohFloorPct: f(70, "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high"),
    },
    buyerNotes: [BZ_RECALL_NOTE],
  },

  {
    id: "bz-2026-fwd-xle-plus",
    make: "TOYOTA",
    model: "bZ",
    modelYears: [2026, 2026],
    trim: ["XLE Plus", "XLE FWD Plus"],
    drive: "FWD",
    battery: { packGrossKwh: f(74.7, "mfr", "high") },
    range: { epaRangeMi: f(314, "mfr", "high", undefined, epa(50042)) },
    charging: {
      portStandard: f("NACS", "mfr", "high"),
      dcPeakKw: f(150, "agg", "medium"),
      chargeTime1080Min: f(30, "mfr", "medium"),
    },
    thermal: { heatPump: f("standard", "mfr", "high") },
    warranty: {
      batteryYears: f(8, "mfr", "high"),
      batteryMiles: f(100_000, "mfr", "high"),
      sohFloorPct: f(70, "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high"),
    },
    buyerNotes: [BZ_RECALL_NOTE],
  },

  {
    id: "bz-2026-fwd-limited",
    make: "TOYOTA",
    model: "bZ",
    modelYears: [2026, 2026],
    trim: ["Limited", "Limited FWD"],
    drive: "FWD",
    battery: { packGrossKwh: f(74.7, "mfr", "high") },
    range: { epaRangeMi: f(296, "mfr", "high", undefined, epa(49984)) },
    charging: {
      portStandard: f("NACS", "mfr", "high"),
      dcPeakKw: f(150, "agg", "medium"),
      chargeTime1080Min: f(30, "mfr", "medium"),
    },
    thermal: { heatPump: f("standard", "mfr", "high") },
    warranty: {
      batteryYears: f(8, "mfr", "high"),
      batteryMiles: f(100_000, "mfr", "high"),
      sohFloorPct: f(70, "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high"),
    },
    buyerNotes: [BZ_RECALL_NOTE],
  },

  {
    id: "bz-2026-awd-xle",
    make: "TOYOTA",
    model: "bZ",
    modelYears: [2026, 2026],
    trim: ["XLE", "XLE AWD"],
    drive: "AWD",
    battery: { packGrossKwh: f(74.7, "mfr", "high") },
    range: { epaRangeMi: f(288, "mfr", "high", undefined, epa(49985)) },
    charging: {
      portStandard: f("NACS", "mfr", "high"),
      dcPeakKw: f(150, "agg", "medium"),
      chargeTime1080Min: f(30, "mfr", "medium"),
    },
    thermal: { heatPump: f("standard", "mfr", "high") },
    warranty: {
      batteryYears: f(8, "mfr", "high"),
      batteryMiles: f(100_000, "mfr", "high"),
      sohFloorPct: f(70, "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high"),
    },
    buyerNotes: [BZ_RECALL_NOTE],
  },

  {
    id: "bz-2026-awd-limited",
    make: "TOYOTA",
    model: "bZ",
    modelYears: [2026, 2026],
    trim: ["Limited", "Limited AWD"],
    drive: "AWD",
    battery: { packGrossKwh: f(74.7, "mfr", "high") },
    range: { epaRangeMi: f(278, "mfr", "high", undefined, epa(49986)) },
    charging: {
      portStandard: f("NACS", "mfr", "high"),
      dcPeakKw: f(150, "agg", "medium"),
      chargeTime1080Min: f(30, "mfr", "medium"),
    },
    thermal: { heatPump: f("standard", "mfr", "high") },
    warranty: {
      batteryYears: f(8, "mfr", "high"),
      batteryMiles: f(100_000, "mfr", "high"),
      sohFloorPct: f(70, "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high"),
    },
    buyerNotes: [BZ_RECALL_NOTE],
  },

  {
    id: "bz-woodland-2026",
    make: "TOYOTA",
    model: "bZ Woodland",
    modelYears: [2026, 2026],
    drive: "AWD",
    // Base row; the pack is shared but the tyres are not, and they are worth
    // 21 miles.
    abstains: { epaRangeMi: "Varies by grade on tyre size alone (base 281 on 235/60R18, Premium 260 on 235/65R18); the trim-keyed rows below carry it" },
    battery: { packGrossKwh: f(74.7, "mfr", "high") },
    charging: {
      portStandard: f("NACS", "mfr", "high"),
      dcPeakKw: f(150, "agg", "medium"),
      chargeTime1080Min: f(30, "mfr", "medium"),
    },
    thermal: { heatPump: f("standard", "agg", "medium") },
    warranty: {
      batteryYears: f(8, "mfr", "high"),
      batteryMiles: f(100_000, "mfr", "high"),
      sohFloorPct: f(70, "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high"),
    },
  },

  {
    id: "bz-woodland-2026-base",
    make: "TOYOTA",
    model: "bZ Woodland",
    modelYears: [2026, 2026],
    trim: ["Woodland", "bZ Woodland"],
    drive: "AWD",
    battery: { packGrossKwh: f(74.7, "mfr", "high") },
    range: { epaRangeMi: f(281, "mfr", "high", undefined, epa(50305)) },
    charging: {
      portStandard: f("NACS", "mfr", "high"),
      dcPeakKw: f(150, "agg", "medium"),
      chargeTime1080Min: f(30, "mfr", "medium"),
    },
    thermal: { heatPump: f("standard", "agg", "medium") },
    warranty: {
      batteryYears: f(8, "mfr", "high"),
      batteryMiles: f(100_000, "mfr", "high"),
      sohFloorPct: f(70, "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high"),
    },
  },

  {
    id: "bz-woodland-2026-premium",
    make: "TOYOTA",
    model: "bZ Woodland",
    modelYears: [2026, 2026],
    trim: ["Woodland Premium", "bZ Woodland Premium", "Premium", "Premium AWD"],
    drive: "AWD",
    battery: { packGrossKwh: f(74.7, "mfr", "high") },
    range: { epaRangeMi: f(260, "mfr", "high", undefined, epa(50306)) },
    charging: {
      portStandard: f("NACS", "mfr", "high"),
      dcPeakKw: f(150, "agg", "medium"),
      chargeTime1080Min: f(30, "mfr", "medium"),
    },
    thermal: { heatPump: f("standard", "agg", "medium") },
    warranty: {
      batteryYears: f(8, "mfr", "high"),
      batteryMiles: f(100_000, "mfr", "high"),
      sohFloorPct: f(70, "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high"),
    },
  },

  // ---------------------------------------------------------------------
  // Tesla Model S / Model X — 6 + 6 in inventory. Every one of these
  // listings carries NO trim string at all (scraped "trim" field is empty)
  // and almost none carry a battery-kWh hint, so there is no way to
  // discriminate which of several real EPA-certified trims a given car
  // actually is. Verified negative from research: unlike Model Y, Model S/X
  // were built at Fremont only for their entire US production run (no
  // plant-code split to lean on either).
  //
  // Rather than exploding into 3-7 same-year candidate rows (poor UX) or
  // guessing one trim as if it were confirmed, each row here uses the
  // lowest-range non-performance EPA figure for that year as a stated
  // floor — so the site never overstates range — with every other real
  // trim's figure spelled out in the fact's note and in a buyer note
  // telling the reader this listing's exact trim isn't recorded.
  // ---------------------------------------------------------------------
  // 2021+ Model S/X moved to data4.ts (2026-08-14): VIN position 8 resolves
  // dual (5) vs tri-motor Plaid (6), which is exactly what these floor-value
  // rows existed to work around. Pre-2021 floors below still apply.
  {
    id: "tesla-model-s-2019",
    make: "TESLA",
    model: "Model S",
    modelYears: [2019, 2019],
    drive: "AWD",
    // No EPA range on these three. They used to print the lowest-range trim of
    // the year as a "floor" and say so in a note — but that note runs ~50
    // words, so noteRule's 14-word cap kept it off the page entirely, and what
    // a shopper actually saw was a plain range chip carrying a manufacturer
    // citation. 61 of the 109 live cars on these rows had their own dealer
    // trim naming a higher-range configuration, by up to 111 miles.
    //
    // Understating is not the safe direction here. The printed figure IS the
    // browse filter's minRange and one of featuredScore's buckets, so a
    // 295-mile 100D shown as 200 drops out of a "250 miles or more" search
    // altogether. And nothing available separates 60D/75D/90D/100D: VIN
    // position 7 is E on all 112 live cars, position 8 only tells Performance
    // from not, vPIC returns Series, Trim and BatteryKWh all blank, and the
    // dealer's trim string is exactly what 6a6e4f3 stopped letting decide a
    // range. Every other pre-2021 S/X bucket already prints nothing; these
    // three were the anomaly, not the norm.
    abstains: { epaRangeMi: "Nothing in the VIN, vPIC or the feed separates 60D from 100D on these cars, and the four are up to 111 miles apart" },
    charging: {
      portStandard: f("NACS", "mfr", "high", "Tesla's proprietary connector"),
      superchargerAccess: f("native", "mfr", "high"),
    },
    thermal: { heatPump: f("none", "agg", "medium", "Octovalve heat pump arrived with the January 2021 Model S/X refresh; pre-refresh cars (through ~end of 2020 production) had resistive heat only, corroborated by NHTSA recall 22V050000, which describes the heat-pump valve hardware as present only on 2021+ cars") },
    warranty: {
      batteryYears: f(8, "mfr", "high", "“8 years or 150,000 miles, whichever comes first”, Tesla's own vehicle-warranty page (archived capture, live page blocked by bot-detection; dated 2025-04-16, ~16 months old relative to today but Tesla's S/X battery terms have historically been stable)"),
      batteryMiles: f(150_000, "mfr", "high", "Model S/X get a higher mileage cap than Model 3/Y, same source"),
      sohFloorPct: f(70, "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high"),
    },
    buyerNotes: [
      {
        headline: "This listing doesn't say which 2019 Model S trim this is, range varies by up to 111 miles",
        body: "Tesla sold seven distinct EPA-rated configurations in 2019 (75D 259 mi up to Long Range 370 mi). This scraped listing has no trim field. Check the car's window sticker, door-jamb EPA label, or the Tesla owner account tied to this VIN to confirm the actual trim before trusting a specific range figure.",
        severity: "warning",
      },
      {
        headline: "Hood secondary latch and power-steering recalls, already fixed via update",
        body: "21V00B (2019 Model S: front trunk latch may be misaligned, secondary latch may not engage, hood could open unexpectedly) and 22V818 (electric power steering may lose assist on rough roads). Both remedied by free dealer service or OTA update; owner notices already mailed.",
        severity: "info",
      },
    ],
  },



  {
    id: "tesla-model-x-2017",
    make: "TESLA",
    model: "Model X",
    modelYears: [2017, 2017],
    drive: "AWD",
    // No EPA range on these three. They used to print the lowest-range trim of
    // the year as a "floor" and say so in a note — but that note runs ~50
    // words, so noteRule's 14-word cap kept it off the page entirely, and what
    // a shopper actually saw was a plain range chip carrying a manufacturer
    // citation. 61 of the 109 live cars on these rows had their own dealer
    // trim naming a higher-range configuration, by up to 111 miles.
    //
    // Understating is not the safe direction here. The printed figure IS the
    // browse filter's minRange and one of featuredScore's buckets, so a
    // 295-mile 100D shown as 200 drops out of a "250 miles or more" search
    // altogether. And nothing available separates 60D/75D/90D/100D: VIN
    // position 7 is E on all 112 live cars, position 8 only tells Performance
    // from not, vPIC returns Series, Trim and BatteryKWh all blank, and the
    // dealer's trim string is exactly what 6a6e4f3 stopped letting decide a
    // range. Every other pre-2021 S/X bucket already prints nothing; these
    // three were the anomaly, not the norm.
    abstains: { epaRangeMi: "Nothing in the VIN, vPIC or the feed separates 60D from 100D on these cars, and the four are up to 111 miles apart" },
    charging: {
      portStandard: f("NACS", "mfr", "high", "Tesla's proprietary connector"),
      superchargerAccess: f("native", "mfr", "high"),
    },
    thermal: { heatPump: f("none", "agg", "medium", "Octovalve heat pump arrived with the January 2021 Model S/X refresh; 2017 cars have resistive heat only") },
    warranty: {
      batteryYears: f(8, "mfr", "high", "“8 years or 150,000 miles, whichever comes first”, Tesla's own vehicle-warranty page (archived capture, dated 2025-04-16)"),
      batteryMiles: f(150_000, "mfr", "high"),
      sohFloorPct: f(70, "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high"),
    },
    buyerNotes: [
      {
        headline: "This listing doesn't say which 2017 Model X trim this is, range varies by up to 95 miles",
        body: "Tesla sold six distinct EPA-rated configurations in 2017 (60D 200 mi up to 100D 295 mi). This scraped listing has no trim field. Check the window sticker, door-jamb EPA label, or the Tesla owner account tied to this VIN to confirm the actual trim.",
        severity: "warning",
      },
      {
        headline: "Center display can fail and take rearview camera/turn signals with it",
        body: "21V035 (2016–2018 Model X): the center display's memory chip wears out over time, eventually causing the display to fail, which also takes out the rearview camera image, defrost controls, and turn-signal chime. Free dealer replacement of the display's daughterboard; software 2020.48.48.12+ warns the owner in advance.",
        severity: "trap",
      },
      {
        headline: "Second-row seat back may not fully latch",
        body: "17V639 (2016–2017 Model X): the left-side second-row reclining seat back may not fully latch. Free dealer cable adjustment.",
        severity: "warning",
      },
    ],
  },

  {
    id: "tesla-model-x-2018",
    make: "TESLA",
    model: "Model X",
    modelYears: [2018, 2018],
    drive: "AWD",
    // No EPA range on these three. They used to print the lowest-range trim of
    // the year as a "floor" and say so in a note — but that note runs ~50
    // words, so noteRule's 14-word cap kept it off the page entirely, and what
    // a shopper actually saw was a plain range chip carrying a manufacturer
    // citation. 61 of the 109 live cars on these rows had their own dealer
    // trim naming a higher-range configuration, by up to 111 miles.
    //
    // Understating is not the safe direction here. The printed figure IS the
    // browse filter's minRange and one of featuredScore's buckets, so a
    // 295-mile 100D shown as 200 drops out of a "250 miles or more" search
    // altogether. And nothing available separates 60D/75D/90D/100D: VIN
    // position 7 is E on all 112 live cars, position 8 only tells Performance
    // from not, vPIC returns Series, Trim and BatteryKWh all blank, and the
    // dealer's trim string is exactly what 6a6e4f3 stopped letting decide a
    // range. Every other pre-2021 S/X bucket already prints nothing; these
    // three were the anomaly, not the norm.
    abstains: { epaRangeMi: "Nothing in the VIN, vPIC or the feed separates 60D from 100D on these cars, and the four are up to 111 miles apart" },
    charging: {
      portStandard: f("NACS", "mfr", "high", "Tesla's proprietary connector"),
      superchargerAccess: f("native", "mfr", "high"),
    },
    thermal: { heatPump: f("none", "agg", "medium", "Octovalve heat pump arrived with the January 2021 Model S/X refresh; 2018 cars have resistive heat only") },
    warranty: {
      batteryYears: f(8, "mfr", "high", "“8 years or 150,000 miles, whichever comes first”, Tesla's own vehicle-warranty page (archived capture, dated 2025-04-16)"),
      batteryMiles: f(150_000, "mfr", "high"),
      sohFloorPct: f(70, "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high"),
    },
    buyerNotes: [
      {
        headline: "This listing doesn't say which 2018 Model X trim this is, range varies by up to 57 miles",
        body: "Tesla sold three distinct EPA-rated configurations in 2018 (75D 238 mi up to 100D 295 mi). This scraped listing has no trim field. Check the window sticker, door-jamb EPA label, or the Tesla owner account tied to this VIN to confirm the actual trim.",
        severity: "warning",
      },
      {
        headline: "Center display can fail and take rearview camera/turn signals with it",
        body: "21V035 (2016–2018 Model X): the center display's memory chip wears out over time, eventually causing the display to fail, which also takes out the rearview camera image, defrost controls, and turn-signal chime. Free dealer replacement of the display's daughterboard; software 2020.48.48.12+ warns the owner in advance.",
        severity: "trap",
      },
    ],
  },



  // ---------------------------------------------------------------------
  // Mercedes-Benz EQE / EQS family. Warranty terms below (10 yr/155,000 mi,
  // floor stated in amp-hours not a percentage, conditioned on completed
  // maintenance, transfers to subsequent owners) are already verified in
  // docs/WARRANTY-RESEARCH.md against MY25/MY26 EQ booklets — carried
  // forward here rather than re-derived.
  //
  // Two research findings that shape every row in this block:
  //
  // 1. Sedan and SUV are different cars filed under one name. Dealers file
  //    both bodies as model "EQE" with the same trim strings ("500 4MATIC"),
  //    and vPIC agrees they are distinct vehicles ("EQE-Class Sedan" vs
  //    "EQE-Class SUV"). Only the VIN separates them: W1K = Bremen sedan,
  //    4JG = Tuscaloosa SUV. Live inventory 2026-08-16 priced them ~$3.7k
  //    apart (27 sedans vs 42 SUVs, mileage-adjusted), so every Mercedes row
  //    here is WMI-keyed — pooling the bodies printed a false price gap.
  //
  // 2. fueleconomy.gov has NO MY2023 EQE certification of either body. The
  //    MY2024 records (sedan 298 mi, SUV 282 mi) belong to the updated
  //    MY2024 cars and must not be carried back: Mercedes' own MY2023
  //    EPA-estimated figures, corroborated across franchise-dealer spec
  //    pages and launch coverage, were sedan 260 mi / SUV 269 mi. This row
  //    previously printed the MY2024 sedan figure (298) for 2023 cars — a
  //    38-mile overstatement, replaced 2026-08-16.
  // ---------------------------------------------------------------------
  {
    id: "eqe-2023-500-4matic",
    make: "MERCEDES-BENZ",
    model: "EQE",
    modelYears: [2023, 2023],
    trim: "EQE 500 4MATIC",
    drive: "AWD",
    wmi: ["W1K"],
    battery: { packUsableKwh: f(90.6, "agg", "low", "Widely reported across aggregators; Mercedes' own press materials (media.mbusa.com) are blocked by bot-detection and could not be independently confirmed for MY2023 specifically") },
    range: { epaRangeMi: f(260, "mfr", "medium", "Mercedes' own EPA-estimated figure for the MY2023 EQE 500 4MATIC sedan, corroborated across multiple Mercedes franchise-dealer spec pages and period reviews. fueleconomy.gov has no MY2023 EQE record at all; its MY2024 “EQE 500 4matic” certification (298 mi) is the updated MY2024 car and is not carried back", "https://www.mbofwilmington.com/2023-eqe-sedan-range/") },
    charging: {
      portStandard: f("CCS1", "agg", "medium"),
      dcPeakKw: f(170, "agg", "low"),
      architectureV: f(400, "agg", "low", "Reported by secondary sources (electrive.com, autoevolution); not confirmed on a Mercedes primary document, the CCS 500A/400V ceiling matches the 170 kW peak"),
    },
    thermal: { heatPump: f("optional", "agg", "medium", "Mercedes made the heat pump standard on EQE/EQS sedans starting MY2024, the 2023 sedan likely lacks it unless optioned. (It was already standard on the EQE SUV since MY2023.)") },
    warranty: {
      batteryYears: f(10, "mfr", "high", "10 yr/155,000 mi applies to the whole EQE/EQS family including SUVs, verified against MY25/MY26 EQ booklets"),
      batteryMiles: f(155_000, "mfr", "high"),
      extendedCoverage: f("Floor is stated as a per-pack amp-hour number in Mercedes' own booklet (EQE: 204 Ah), not a percentage. Battery coverage is conditioned on completed scheduled maintenance, a skipped-service history can void it.", "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high"),
    },
    buyerNotes: [
      {
        headline: "A fuse-box fire recall had two rounds; confirm this car got the corrected part",
        body: "24V115 (80-Amp fuses manufactured incorrectly, can cause sudden loss of drive power or fire risk): free replacement fuse box. 25V255: some vehicles repaired under 24V115 received the WRONG replacement fuse box, which itself carries increased fire risk, a second free repair. Confirm this VIN got the correct part, not just “a” repair.",
        severity: "trap",
      },
      {
        headline: "Roof-frame absorbers may be unsecured; confirm the recall fix on this car",
        body: "23V555 (2023 EQE 500/350, AMG EQE): roof frame absorbers may not be properly secured and can detach during side-curtain air bag deployment. Free dealer replacement; owner notices mailed September 2023.",
        severity: "warning",
      },
      {
        headline: "Steering coupling bolt recall",
        body: "25V533 (2023–2026 EQE): a steering coupling bolt may be improperly tightened, risking loss of steering control. Owner notices mailed October 2025.",
        severity: "warning",
      },
      {
        headline: "Pedestrian-alert sound software recall",
        body: "25V366 (2023–2024 EQE 500 4MATIC among others): the Acoustic Vehicle Alerting System software can fail to play the required pedestrian warning sound. Free dealer software update.",
        severity: "info",
      },
    ],
  },

  // The other body under the same showroom name: Tuscaloosa-built (4JG), a
  // different vPIC model ("EQE-Class SUV"), its own EPA rating, and its own
  // recall history — 24V372 covers the 2023 SUV but not the 2023 sedan, and
  // the sedan's roof-absorber/steering-bolt campaigns don't reach the SUV.
  // Most listings arrive as model "EQE" with sedan-identical trim strings;
  // the wmi key is what routes them here.
  {
    id: "eqe-suv-2023-500-4matic",
    make: "MERCEDES-BENZ",
    model: "EQE SUV",
    modelAliases: ["EQE"],
    modelYears: [2023, 2023],
    trim: ["EQE 500 4MATIC", "500 SUV"],
    drive: "AWD",
    wmi: ["4JG"],
    battery: { packUsableKwh: f(90.6, "agg", "low", "Same EVA2-platform pack as the EQE sedan; widely reported across aggregators, and Mercedes' own press materials (media.mbusa.com) are bot-walled so it could not be confirmed on a primary document") },
    range: { epaRangeMi: f(269, "mfr", "medium", "Mercedes' own EPA-estimated figure announced for the MY2023 EQE 500 4MATIC SUV. fueleconomy.gov has no MY2023 EQE record of either body; its MY2024 “EQE 500 4matic (SUV)” certification (282 mi) is the updated MY2024 car and is not carried back", "https://insideevs.com/news/668377/2023-mercedes-eqe-suv-epa-range-price/") },
    charging: {
      portStandard: f("CCS1", "agg", "medium"),
      dcPeakKw: f(170, "agg", "low", "Widely reported, matching the sedan's EVA2 hardware; not confirmed against a primary Mercedes document for MY2023"),
      architectureV: f(400, "agg", "low"),
    },
    thermal: { heatPump: f("standard", "agg", "medium", "Standard on the EQE SUV from its MY2023 launch — unlike the 2023 sedan, where it was optional") },
    warranty: {
      batteryYears: f(10, "mfr", "high", "10 yr/155,000 mi applies to the whole EQE/EQS family including SUVs, verified against MY25/MY26 EQ booklets"),
      batteryMiles: f(155_000, "mfr", "high"),
      extendedCoverage: f("Floor is stated as a per-pack amp-hour number in Mercedes' own booklet (EQE: 204 Ah), not a percentage. Battery coverage is conditioned on completed scheduled maintenance, a skipped-service history can void it.", "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high"),
    },
    buyerNotes: [
      {
        headline: "Battery-management software recall; confirm the fix on this car",
        body: "24V372 (2023–2025 EQE SUV 350/350+/500 4MATIC, plus EQS SUVs and 2024 sedans): a BMS software fault may cause the high-voltage battery to shut down, a sudden loss of drive power. Free software update; owner notices mailed July 2024. NHTSA's vehicle-level index scopes this to the SUV for MY2023 — the 2023 sedan is not included.",
        severity: "trap",
      },
      {
        headline: "Some fuse-box recall repairs used a wrong part; confirm this car got the corrected one",
        body: "25V255 (NHTSA's vehicle-level scope includes the 2023 EQE SUV 350/500 4MATIC): some vehicles repaired under the 24V115 fuse-box campaign received an INCORRECT replacement fuse box, which itself carries increased fire risk — a second free repair. Confirm this VIN either was never in 24V115 scope or got the corrected part.",
        severity: "warning",
      },
      {
        headline: "Pedestrian-alert sound software recall",
        body: "25V366 (2023–2025 EQE SUV among others): the Acoustic Vehicle Alerting System software can fail to play the required pedestrian warning sound. Free dealer software update.",
        severity: "info",
      },
    ],
  },

  // -------------------------------------------------------------------
  // EQE 350 / 350+, both bodies, 2023–2025 — the volume trims. Live
  // inventory 2026-08-16: 286 SUV 350 4MATICs and 178 SUV 350+ alone.
  //
  // Dealer strings, checked against VIN positions 4–8 (Mercedes' Baumuster:
  // EG2BB = 350+ sedan, EG1CB = 350 4MATIC sedan, GM2BB = 350+ SUV,
  // GM1CB = 350 4MATIC SUV) across all 600+ live 350-family listings:
  // every "+"-less filing ("350", "350 SUV", "EQE 350", "350 4MATIC") is a
  // 4MATIC, and every 350+ carries its plus in some spelling. So bare-"350"
  // trims key the 4MATIC rows only, and the one-sided-plus rule in
  // trimMatches keeps them out of the 350+ rows. A bare "4MATIC" stays
  // genuinely ambiguous between 350 and 500 — candidates, not a guess;
  // before these rows existed it exact-matched the 500 row by default.
  //
  // MY2023 ranges are Mercedes' own announced EPA-estimates (no MY2023 EQE
  // certification of either body exists on fueleconomy.gov — verified via
  // its menu API 2026-08-16). MY2024/2025 figures are EPA certifications
  // read directly from fueleconomy.gov, per-body ("(SUV)"-suffixed model
  // strings) and per-year — the two years differ (sedan 350+ 298→308,
  // SUV 350+ 307→302), so neither is carried across.
  //
  // Recall scopes are from NHTSA's vehicle-level index per campaign
  // (api.nhtsa.gov, read 2026-08-16), which names the bodies separately
  // ("EQE 350" vs "EQE SUV 350 4MATIC"): the fuse-box (24V115), roof-
  // absorber (23V555) and steering-bolt (25V533) campaigns list no EQE
  // SUVs; the BMS campaign (24V372) reaches sedans only for MY2024 but
  // SUVs for MY2023–25; the AVAS campaign (25V366) lists the 350+ sedan
  // but not the 350 4MATIC sedan.
  // -------------------------------------------------------------------
  {
    id: "eqe-2023-350-plus",
    make: "MERCEDES-BENZ",
    model: "EQE",
    modelAliases: ["EQE 350+", "EQE 350 Sedan", "EQE 350+ Sedan"],
    modelYears: [2023, 2023],
    trim: "EQE 350+",
    drive: "RWD",
    wmi: ["W1K"],
    battery: { packUsableKwh: f(90.6, "mfr", "medium", "“Fitted standard with a 90.6 kWh battery, the EQE 350+ delivers 305 miles of range” — Mercedes' own MY2023 EQE Sedan launch release, read directly (media.mbusa.com)") },
    range: { epaRangeMi: f(305, "mfr", "medium", "“Up to 305 miles of range according to EPA estimates” — Mercedes' own MY2023 launch release for the EQE 350+ sedan. fueleconomy.gov has no MY2023 EQE record of either body; its MY2024 “EQE 350 Plus” certification (298 mi) is the updated MY2024 car and is not carried back", "https://media.mbusa.com/releases/release-2f7d9b3c5c8916ac7e38443cec0023e3-all-new-fully-electric-eqe-sedan-to-start-from-74900") },
    charging: {
      portStandard: f("CCS1", "agg", "medium"),
      dcPeakKw: f(170, "agg", "low"),
      architectureV: f(400, "agg", "low", "The CCS 500A/400V ceiling matches the 170 kW peak"),
    },
    thermal: { heatPump: f("optional", "agg", "medium", "Mercedes made the heat pump standard on EQE/EQS sedans starting MY2024, the 2023 sedan likely lacks it unless optioned. (It was already standard on the EQE SUV since MY2023.)") },
    warranty: {
      batteryYears: f(10, "mfr", "high", "10 yr/155,000 mi applies to the whole EQE/EQS family including SUVs, verified against MY25/MY26 EQ booklets"),
      batteryMiles: f(155_000, "mfr", "high"),
      extendedCoverage: f("Floor is stated as a per-pack amp-hour number in Mercedes' own booklet (EQE: 204 Ah), not a percentage. Battery coverage is conditioned on completed scheduled maintenance, a skipped-service history can void it.", "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high", "“To the original and each subsequent owner”, verified MY25/MY26 EQ booklets"),
    },
    buyerNotes: [
      {
        headline: "Fuse-box fire/power-loss recall, check remedy status",
        body: "24V115 (2023–2024 EQE 350 among others): the 80-Amp fuses may have been manufactured incorrectly, which can cause sudden loss of drive power or a fire risk. Free dealer replacement of the fuse box; owner notices mailed April 2024. (NHTSA's wrong-part follow-up 25V255 lists the 350 4MATIC and 500 4MATIC, not the 350+ sedan.)",
        severity: "trap",
      },
      {
        headline: "Roof-frame absorbers may not be secured, check remedy status",
        body: "23V555 (2023 EQE 500/350, AMG EQE): roof frame absorbers may not be properly secured and can detach during side-curtain air bag deployment. Free dealer replacement; owner notices mailed September 2023.",
        severity: "warning",
      },
      {
        headline: "Steering coupling bolt recall",
        body: "25V533 (2023–2026 EQE): a steering coupling bolt may be improperly tightened, risking loss of steering control. Owner notices mailed October 2025.",
        severity: "warning",
      },
      {
        headline: "Pedestrian-alert sound software recall",
        body: "25V366 (2023–2024 EQE 350+ among others): the Acoustic Vehicle Alerting System software can fail to play the required pedestrian warning sound. Free dealer software update.",
        severity: "info",
      },
    ],
  },

  {
    id: "eqe-2024-350-plus",
    make: "MERCEDES-BENZ",
    model: "EQE",
    modelAliases: ["EQE 350+", "EQE 350 Sedan", "EQE 350+ Sedan"],
    modelYears: [2024, 2024],
    trim: "EQE 350+",
    drive: "RWD",
    wmi: ["W1K"],
    battery: { packUsableKwh: f(90.6, "agg", "medium", "Carry-over of the pre-refresh pack Mercedes quoted for MY2023 (“Fitted standard with a 90.6 kWh battery”); the larger 96 kWh pack arrived with the MY2025 refresh") },
    range: { epaRangeMi: f(298, "mfr", "high", "MY2024 EQE 350+, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47459") },
    charging: {
      portStandard: f("CCS1", "agg", "medium"),
      dcPeakKw: f(170, "agg", "low"),
    },
    thermal: { heatPump: f("standard", "agg", "medium", "Standard on EQE/EQS sedans from MY2024 (read directly on the MY2026 MBUSA spec pages)") },
    warranty: {
      batteryYears: f(10, "mfr", "high", "10 yr/155,000 mi applies to the whole EQE/EQS family including SUVs, verified against MY25/MY26 EQ booklets"),
      batteryMiles: f(155_000, "mfr", "high"),
      extendedCoverage: f("Floor is stated as a per-pack amp-hour number in Mercedes' own booklet (EQE: 204 Ah), not a percentage. Battery coverage is conditioned on completed scheduled maintenance, a skipped-service history can void it.", "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high", "“To the original and each subsequent owner”, verified MY25/MY26 EQ booklets"),
    },
    buyerNotes: [
      {
        headline: "Fuse-box fire/power-loss recall, check remedy status",
        body: "24V115 (2023–2024 EQE 350 among others): the 80-Amp fuses may have been manufactured incorrectly, which can cause sudden loss of drive power or a fire risk. Free dealer replacement of the fuse box; owner notices mailed April 2024.",
        severity: "trap",
      },
      {
        headline: "Battery-management-system software recall, check remedy status",
        body: "24V372 (2024 EQE 350+/350 4MATIC/500 4MATIC sedans, plus 2023–2025 EQE SUVs): a BMS software fault may cause the high-voltage battery to shut down, a sudden loss of drive power. Free software update; owner notices mailed July 2024. NHTSA's vehicle-level index scopes the sedan to MY2024 only.",
        severity: "trap",
      },
      {
        headline: "Steering coupling bolt recall",
        body: "25V533 (2023–2026 EQE): a steering coupling bolt may be improperly tightened, risking loss of steering control. Owner notices mailed October 2025.",
        severity: "warning",
      },
      {
        headline: "Pedestrian-alert sound software recall",
        body: "25V366 (2023–2024 EQE 350+ among others): the Acoustic Vehicle Alerting System software can fail to play the required pedestrian warning sound. Free dealer software update.",
        severity: "info",
      },
    ],
  },

  {
    id: "eqe-2025-350-plus",
    make: "MERCEDES-BENZ",
    model: "EQE",
    modelAliases: ["EQE 350+", "EQE 350 Sedan", "EQE 350+ Sedan"],
    modelYears: [2025, 2025],
    trim: "EQE 350+",
    drive: "RWD",
    wmi: ["W1K"],
    battery: { packUsableKwh: f(96, "vin", "medium", "Mercedes' per-VIN Part 565 filings on live MY2025 350+ sedans read 96.00 kWh — the pack the MY2026 EQE320+ (same 308-mi certification, renamed) lists on its MBUSA spec page; press coverage documented the larger pack arriving with the MY2025 refresh") },
    range: { epaRangeMi: f(308, "mfr", "high", "MY2025 EQE 350+, EPA — the same certification the renamed MY2026 EQE320+ carries forward", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48384") },
    charging: {
      portStandard: f("CCS1", "agg", "medium"),
      dcPeakKw: f(170, "agg", "low", "170 kW on the MY2026 EQE320+ MBUSA spec page, whose certification this car shares; not confirmed on a MY2025-specific document"),
    },
    thermal: { heatPump: f("standard", "agg", "medium", "Standard on EQE/EQS sedans from MY2024 (read directly on the MY2026 MBUSA spec pages)") },
    warranty: {
      batteryYears: f(10, "mfr", "high", "10 yr/155,000 mi applies to the whole EQE/EQS family including SUVs, verified against MY25/MY26 EQ booklets"),
      batteryMiles: f(155_000, "mfr", "high"),
      extendedCoverage: f("Floor is stated as a per-pack amp-hour number in Mercedes' own booklet (EQE: 204 Ah), not a percentage. Battery coverage is conditioned on completed scheduled maintenance, a skipped-service history can void it.", "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high", "“To the original and each subsequent owner”, verified MY25/MY26 EQ booklets"),
    },
    buyerNotes: [
      {
        headline: "Steering coupling bolt recall",
        body: "25V533 (2023–2026 EQE): a steering coupling bolt may be improperly tightened, risking loss of steering control. Owner notices mailed October 2025.",
        severity: "warning",
      },
    ],
  },

  {
    id: "eqe-2023-350-4matic",
    make: "MERCEDES-BENZ",
    model: "EQE",
    modelAliases: ["EQE 350"],
    modelYears: [2023, 2023],
    trim: "EQE 350 4MATIC",
    drive: "AWD",
    wmi: ["W1K"],
    battery: { packUsableKwh: f(90.6, "agg", "medium", "Same EVA2 pack across the MY2023 EQE sedan line — Mercedes' launch release quotes 90.6 kWh for the 350+, and period reviews report the same pack for the 4MATIC") },
    range: { epaRangeMi: f(260, "mfr", "medium", "Mercedes' own EPA-estimated figure for the MY2023 EQE 350 4MATIC sedan, corroborated across multiple Mercedes franchise-dealer spec pages and period reviews. fueleconomy.gov has no MY2023 EQE record at all; its MY2024 “EQE 350 4matic” certification (280 mi) is the updated MY2024 car and is not carried back", "https://www.mbkcsouth.com/2023-eqe-sedan-range/") },
    charging: {
      portStandard: f("CCS1", "agg", "medium"),
      dcPeakKw: f(170, "agg", "low"),
      architectureV: f(400, "agg", "low", "The CCS 500A/400V ceiling matches the 170 kW peak"),
    },
    thermal: { heatPump: f("optional", "agg", "medium", "Mercedes made the heat pump standard on EQE/EQS sedans starting MY2024, the 2023 sedan likely lacks it unless optioned. (It was already standard on the EQE SUV since MY2023.)") },
    warranty: {
      batteryYears: f(10, "mfr", "high", "10 yr/155,000 mi applies to the whole EQE/EQS family including SUVs, verified against MY25/MY26 EQ booklets"),
      batteryMiles: f(155_000, "mfr", "high"),
      extendedCoverage: f("Floor is stated as a per-pack amp-hour number in Mercedes' own booklet (EQE: 204 Ah), not a percentage. Battery coverage is conditioned on completed scheduled maintenance, a skipped-service history can void it.", "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high", "“To the original and each subsequent owner”, verified MY25/MY26 EQ booklets"),
    },
    buyerNotes: [
      {
        headline: "Fuse-box fire/power-loss recall, two rounds, check which repair this VIN got",
        body: "24V115 (80-Amp fuses manufactured incorrectly, can cause sudden loss of drive power or fire risk): free replacement fuse box. 25V255: some vehicles repaired under 24V115 received the WRONG replacement fuse box, which itself carries increased fire risk, a second free repair — NHTSA's vehicle-level scope for that follow-up includes the 2023 EQE 350 4MATIC sedan. Confirm this VIN got the correct part, not just “a” repair.",
        severity: "trap",
      },
      {
        headline: "Roof-frame absorbers may not be secured, check remedy status",
        body: "23V555 (2023 EQE 500/350, AMG EQE): roof frame absorbers may not be properly secured and can detach during side-curtain air bag deployment. Free dealer replacement; owner notices mailed September 2023.",
        severity: "warning",
      },
      {
        headline: "Steering coupling bolt recall",
        body: "25V533 (2023–2026 EQE): a steering coupling bolt may be improperly tightened, risking loss of steering control. Owner notices mailed October 2025.",
        severity: "warning",
      },
    ],
  },

  {
    id: "eqe-2024-350-4matic",
    make: "MERCEDES-BENZ",
    model: "EQE",
    modelAliases: ["EQE 350"],
    modelYears: [2024, 2024],
    trim: "EQE 350 4MATIC",
    drive: "AWD",
    wmi: ["W1K"],
    battery: { packUsableKwh: f(90.6, "agg", "medium", "Carry-over of the pre-refresh EVA2 pack; the MY2025 refresh's larger 96 kWh pack went to the 350+ and 500, not the 350 4MATIC") },
    range: { epaRangeMi: f(280, "mfr", "high", "MY2024 EQE 350 4MATIC, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47458") },
    charging: {
      portStandard: f("CCS1", "agg", "medium"),
      dcPeakKw: f(170, "agg", "low"),
    },
    thermal: { heatPump: f("standard", "agg", "medium", "Standard on EQE/EQS sedans from MY2024 (read directly on the MY2026 MBUSA spec pages)") },
    warranty: {
      batteryYears: f(10, "mfr", "high", "10 yr/155,000 mi applies to the whole EQE/EQS family including SUVs, verified against MY25/MY26 EQ booklets"),
      batteryMiles: f(155_000, "mfr", "high"),
      extendedCoverage: f("Floor is stated as a per-pack amp-hour number in Mercedes' own booklet (EQE: 204 Ah), not a percentage. Battery coverage is conditioned on completed scheduled maintenance, a skipped-service history can void it.", "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high", "“To the original and each subsequent owner”, verified MY25/MY26 EQ booklets"),
    },
    buyerNotes: [
      {
        headline: "Fuse-box fire/power-loss recall, check remedy status",
        body: "24V115 (2023–2024 EQE 350 among others): the 80-Amp fuses may have been manufactured incorrectly, which can cause sudden loss of drive power or a fire risk. Free dealer replacement of the fuse box; owner notices mailed April 2024.",
        severity: "trap",
      },
      {
        headline: "Battery-management-system software recall, check remedy status",
        body: "24V372 (2024 EQE 350+/350 4MATIC/500 4MATIC sedans, plus 2023–2025 EQE SUVs): a BMS software fault may cause the high-voltage battery to shut down, a sudden loss of drive power. Free software update; owner notices mailed July 2024. NHTSA's vehicle-level index scopes the sedan to MY2024 only.",
        severity: "trap",
      },
      {
        headline: "Steering coupling bolt recall",
        body: "25V533 (2023–2026 EQE): a steering coupling bolt may be improperly tightened, risking loss of steering control. Owner notices mailed October 2025.",
        severity: "warning",
      },
    ],
  },

  {
    id: "eqe-2025-350-4matic",
    make: "MERCEDES-BENZ",
    model: "EQE",
    modelAliases: ["EQE 350"],
    modelYears: [2025, 2025],
    trim: "EQE 350 4MATIC",
    drive: "AWD",
    wmi: ["W1K"],
    battery: { packUsableKwh: f(90.5, "agg", "low", "The MY2026 EQE320 4MATIC — which carries this exact 267-mi certification forward — is a 90.5 kWh car on Mercedes' own spec page, and press reporting on the MY2025 refresh kept the smaller pack on the 350 4MATIC. Mercedes' per-VIN Part 565 filings on live MY2025 350 4MATICs read 96.00, contradicting both; the conflict is flagged here rather than resolved") },
    range: { epaRangeMi: f(267, "mfr", "high", "MY2025 EQE 350 4MATIC, EPA — the same certification the renamed MY2026 EQE320 4MATIC carries forward", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48383") },
    charging: {
      portStandard: f("CCS1", "agg", "medium"),
      dcPeakKw: f(170, "agg", "low", "170 kW on the MY2026 EQE320 4MATIC MBUSA spec page, whose certification this car shares; not confirmed on a MY2025-specific document"),
    },
    thermal: { heatPump: f("standard", "agg", "medium", "Standard on EQE/EQS sedans from MY2024 (read directly on the MY2026 MBUSA spec pages)") },
    warranty: {
      batteryYears: f(10, "mfr", "high", "10 yr/155,000 mi applies to the whole EQE/EQS family including SUVs, verified against MY25/MY26 EQ booklets"),
      batteryMiles: f(155_000, "mfr", "high"),
      extendedCoverage: f("Floor is stated as a per-pack amp-hour number in Mercedes' own booklet (EQE: 204 Ah), not a percentage. Battery coverage is conditioned on completed scheduled maintenance, a skipped-service history can void it.", "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high", "“To the original and each subsequent owner”, verified MY25/MY26 EQ booklets"),
    },
    buyerNotes: [
      {
        headline: "Steering coupling bolt recall",
        body: "25V533 (2023–2026 EQE): a steering coupling bolt may be improperly tightened, risking loss of steering control. Owner notices mailed October 2025.",
        severity: "warning",
      },
    ],
  },

  // The SUV counterparts — Tuscaloosa-built (4JG), separate EPA ratings,
  // and a recall history that is broader than the sedan's for the BMS
  // campaign (MY2023–25 vs sedan MY2024 only) and narrower for the fuse,
  // roof and steering campaigns (no EQE SUVs listed at all).
  {
    id: "eqe-suv-2023-350-plus",
    make: "MERCEDES-BENZ",
    model: "EQE SUV",
    modelAliases: ["EQE", "EQE 350+", "Mercedes-EQ EQE SUV"],
    modelYears: [2023, 2023],
    trim: ["EQE 350+", "350+ SUV"],
    drive: "RWD",
    wmi: ["4JG"],
    battery: { packUsableKwh: f(90.6, "agg", "low", "Same EVA2-platform pack as the EQE sedan; widely reported across aggregators, and Mercedes' own press materials for the SUV do not state a pack size") },
    range: { epaRangeMi: f(279, "mfr", "medium", "Mercedes' own EPA-estimated figure announced for the MY2023 EQE 350+ SUV. fueleconomy.gov has no MY2023 EQE record of either body; its MY2024 “EQE 350 Plus (SUV)” certification (307 mi) is the updated MY2024 car and is not carried back", "https://insideevs.com/news/668377/2023-mercedes-eqe-suv-epa-range-price/") },
    charging: {
      portStandard: f("CCS1", "agg", "medium"),
      dcPeakKw: f(170, "agg", "low", "Widely reported, matching the sedan's EVA2 hardware; not confirmed against a primary Mercedes document for MY2023"),
      architectureV: f(400, "agg", "low", "The CCS 500A/400V ceiling matches the 170 kW peak"),
    },
    thermal: { heatPump: f("standard", "mfr", "high", "“Two all-new standard innovations launch with the EQE SUV to further improve range: a heat pump and an intelligent powertrain management system” — MBUSA EQE SUV launch release, read directly") },
    warranty: {
      batteryYears: f(10, "mfr", "high", "10 yr/155,000 mi applies to the whole EQE/EQS family including SUVs, verified against MY25/MY26 EQ booklets"),
      batteryMiles: f(155_000, "mfr", "high"),
      extendedCoverage: f("Floor is stated as a per-pack amp-hour number in Mercedes' own booklet (EQE: 204 Ah), not a percentage. Battery coverage is conditioned on completed scheduled maintenance, a skipped-service history can void it.", "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high", "“To the original and each subsequent owner”, verified MY25/MY26 EQ booklets"),
    },
    buyerNotes: [
      {
        headline: "Battery-management-system software recall, check remedy status",
        body: "24V372 (2023–2025 EQE SUV 350/350+/500 4MATIC, plus EQS SUVs and 2024 sedans): a BMS software fault may cause the high-voltage battery to shut down, a sudden loss of drive power. Free software update; owner notices mailed July 2024. NHTSA's vehicle-level index scopes this to the SUV for MY2023 — the 2023 sedan is not included.",
        severity: "trap",
      },
      {
        headline: "Pedestrian-alert sound software recall",
        body: "25V366 (2023–2025 EQE SUV among others): the Acoustic Vehicle Alerting System software can fail to play the required pedestrian warning sound. Free dealer software update.",
        severity: "info",
      },
    ],
  },

  {
    id: "eqe-suv-2024-350-plus",
    make: "MERCEDES-BENZ",
    model: "EQE SUV",
    modelAliases: ["EQE", "EQE 350+", "Mercedes-EQ EQE SUV"],
    modelYears: [2024, 2024],
    trim: ["EQE 350+", "350+ SUV"],
    drive: "RWD",
    wmi: ["4JG"],
    battery: { packUsableKwh: f(90.6, "agg", "low", "Same EVA2-platform pack as the EQE sedan; widely reported across aggregators, and Mercedes' own press materials for the SUV do not state a pack size") },
    range: { epaRangeMi: f(307, "mfr", "high", "MY2024 EQE 350+ SUV, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47846") },
    charging: {
      portStandard: f("CCS1", "agg", "medium"),
      dcPeakKw: f(170, "agg", "low", "Widely reported, matching the sedan's EVA2 hardware; not confirmed against a primary Mercedes document for MY2024"),
    },
    thermal: { heatPump: f("standard", "mfr", "high", "“Two all-new standard innovations launch with the EQE SUV to further improve range: a heat pump and an intelligent powertrain management system” — MBUSA EQE SUV launch release, read directly; standard since launch") },
    warranty: {
      batteryYears: f(10, "mfr", "high", "10 yr/155,000 mi applies to the whole EQE/EQS family including SUVs, verified against MY25/MY26 EQ booklets"),
      batteryMiles: f(155_000, "mfr", "high"),
      extendedCoverage: f("Floor is stated as a per-pack amp-hour number in Mercedes' own booklet (EQE: 204 Ah), not a percentage. Battery coverage is conditioned on completed scheduled maintenance, a skipped-service history can void it.", "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high", "“To the original and each subsequent owner”, verified MY25/MY26 EQ booklets"),
    },
    buyerNotes: [
      {
        headline: "Battery-management-system software recall, check remedy status",
        body: "24V372 (2023–2025 EQE SUV 350/350+/500 4MATIC, plus EQS SUVs and 2024 sedans): a BMS software fault may cause the high-voltage battery to shut down, a sudden loss of drive power. Free software update; owner notices mailed July 2024.",
        severity: "trap",
      },
      {
        headline: "Pedestrian-alert sound software recall",
        body: "25V366 (2023–2025 EQE SUV among others): the Acoustic Vehicle Alerting System software can fail to play the required pedestrian warning sound. Free dealer software update.",
        severity: "info",
      },
    ],
  },

  {
    id: "eqe-suv-2025-350-plus",
    make: "MERCEDES-BENZ",
    model: "EQE SUV",
    modelAliases: ["EQE", "EQE 350+", "Mercedes-EQ EQE SUV"],
    modelYears: [2025, 2025],
    trim: ["EQE 350+", "350+ SUV"],
    drive: "RWD",
    wmi: ["4JG"],
    battery: { packUsableKwh: f(96, "agg", "medium", "The MY2026 EQE320+ SUV — which carries this exact 302-mi certification forward under the new name — files 96.00 kWh per VIN under Part 565, and the sedan 350+ moved to the 96 kWh pack for MY2025; no MY2025-SUV-specific primary document located") },
    range: { epaRangeMi: f(302, "mfr", "high", "MY2025 EQE 350+ SUV, EPA — the same certification the renamed MY2026 EQE320+ SUV carries forward", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48390") },
    charging: {
      portStandard: f("CCS1", "agg", "medium"),
      dcPeakKw: f(170, "agg", "low", "Widely reported, matching the EQE family's EVA2 hardware; not confirmed against a MY2025-specific Mercedes document"),
    },
    thermal: { heatPump: f("standard", "mfr", "high", "“Two all-new standard innovations launch with the EQE SUV to further improve range: a heat pump and an intelligent powertrain management system” — MBUSA EQE SUV launch release, read directly; standard since launch") },
    warranty: {
      batteryYears: f(10, "mfr", "high", "10 yr/155,000 mi applies to the whole EQE/EQS family including SUVs, verified against MY25/MY26 EQ booklets"),
      batteryMiles: f(155_000, "mfr", "high"),
      extendedCoverage: f("Floor is stated as a per-pack amp-hour number in Mercedes' own booklet (EQE: 204 Ah), not a percentage. Battery coverage is conditioned on completed scheduled maintenance, a skipped-service history can void it.", "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high", "“To the original and each subsequent owner”, verified MY25/MY26 EQ booklets"),
    },
    buyerNotes: [
      {
        headline: "Battery-management-system software recall, check remedy status",
        body: "24V372 (2023–2025 EQE SUV 350/350+/500 4MATIC, plus EQS SUVs and 2024 sedans): a BMS software fault may cause the high-voltage battery to shut down, a sudden loss of drive power. Free software update; owner notices mailed July 2024.",
        severity: "trap",
      },
      {
        headline: "Pedestrian-alert sound software recall",
        body: "25V366 (2023–2025 EQE SUV among others): the Acoustic Vehicle Alerting System software can fail to play the required pedestrian warning sound. Free dealer software update.",
        severity: "info",
      },
    ],
  },

  {
    id: "eqe-suv-2023-350-4matic",
    make: "MERCEDES-BENZ",
    model: "EQE SUV",
    modelAliases: ["EQE", "EQE 350", "EQE 350 SUV"],
    modelYears: [2023, 2023],
    trim: ["EQE 350 4MATIC", "350 SUV"],
    drive: "AWD",
    wmi: ["4JG"],
    battery: { packUsableKwh: f(90.6, "agg", "low", "Same EVA2-platform pack as the EQE sedan; widely reported across aggregators, and Mercedes' own press materials for the SUV do not state a pack size") },
    range: { epaRangeMi: f(253, "mfr", "medium", "Mercedes' own EPA-estimated figure announced for the MY2023 EQE 350 4MATIC SUV. fueleconomy.gov has no MY2023 EQE record of either body; its MY2024 “EQE 350 4matic (SUV)” certification (265 mi) is the updated MY2024 car and is not carried back", "https://insideevs.com/news/668377/2023-mercedes-eqe-suv-epa-range-price/") },
    charging: {
      portStandard: f("CCS1", "agg", "medium"),
      dcPeakKw: f(170, "agg", "low", "Widely reported, matching the sedan's EVA2 hardware; not confirmed against a primary Mercedes document for MY2023"),
      architectureV: f(400, "agg", "low", "The CCS 500A/400V ceiling matches the 170 kW peak"),
    },
    thermal: { heatPump: f("standard", "mfr", "high", "“Two all-new standard innovations launch with the EQE SUV to further improve range: a heat pump and an intelligent powertrain management system” — MBUSA EQE SUV launch release, read directly") },
    warranty: {
      batteryYears: f(10, "mfr", "high", "10 yr/155,000 mi applies to the whole EQE/EQS family including SUVs, verified against MY25/MY26 EQ booklets"),
      batteryMiles: f(155_000, "mfr", "high"),
      extendedCoverage: f("Floor is stated as a per-pack amp-hour number in Mercedes' own booklet (EQE: 204 Ah), not a percentage. Battery coverage is conditioned on completed scheduled maintenance, a skipped-service history can void it.", "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high", "“To the original and each subsequent owner”, verified MY25/MY26 EQ booklets"),
    },
    buyerNotes: [
      {
        headline: "Battery-management-system software recall, check remedy status",
        body: "24V372 (2023–2025 EQE SUV 350/350+/500 4MATIC, plus EQS SUVs and 2024 sedans): a BMS software fault may cause the high-voltage battery to shut down, a sudden loss of drive power. Free software update; owner notices mailed July 2024. NHTSA's vehicle-level index scopes this to the SUV for MY2023 — the 2023 sedan is not included.",
        severity: "trap",
      },
      {
        headline: "Some fuse-box repairs used the wrong part, check which fix this VIN got",
        body: "25V255 (NHTSA's vehicle-level scope includes the 2023 EQE SUV 350/500 4MATIC): some vehicles repaired under the 24V115 fuse-box campaign received an INCORRECT replacement fuse box, which itself carries increased fire risk — a second free repair. Confirm this VIN either was never in 24V115 scope or got the corrected part.",
        severity: "warning",
      },
      {
        headline: "Pedestrian-alert sound software recall",
        body: "25V366 (2023–2025 EQE SUV among others): the Acoustic Vehicle Alerting System software can fail to play the required pedestrian warning sound. Free dealer software update.",
        severity: "info",
      },
    ],
  },

  {
    id: "eqe-suv-2024-350-4matic",
    make: "MERCEDES-BENZ",
    model: "EQE SUV",
    modelAliases: ["EQE", "EQE 350", "EQE 350 SUV"],
    modelYears: [2024, 2024],
    trim: ["EQE 350 4MATIC", "350 SUV"],
    drive: "AWD",
    wmi: ["4JG"],
    battery: { packUsableKwh: f(90.6, "agg", "low", "Same EVA2-platform pack as the EQE sedan; widely reported across aggregators, and Mercedes' own press materials for the SUV do not state a pack size") },
    range: { epaRangeMi: f(265, "mfr", "high", "MY2024 EQE 350 4MATIC SUV, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47848") },
    charging: {
      portStandard: f("CCS1", "agg", "medium"),
      dcPeakKw: f(170, "agg", "low", "Widely reported, matching the sedan's EVA2 hardware; not confirmed against a primary Mercedes document for MY2024"),
    },
    thermal: { heatPump: f("standard", "mfr", "high", "“Two all-new standard innovations launch with the EQE SUV to further improve range: a heat pump and an intelligent powertrain management system” — MBUSA EQE SUV launch release, read directly; standard since launch") },
    warranty: {
      batteryYears: f(10, "mfr", "high", "10 yr/155,000 mi applies to the whole EQE/EQS family including SUVs, verified against MY25/MY26 EQ booklets"),
      batteryMiles: f(155_000, "mfr", "high"),
      extendedCoverage: f("Floor is stated as a per-pack amp-hour number in Mercedes' own booklet (EQE: 204 Ah), not a percentage. Battery coverage is conditioned on completed scheduled maintenance, a skipped-service history can void it.", "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high", "“To the original and each subsequent owner”, verified MY25/MY26 EQ booklets"),
    },
    buyerNotes: [
      {
        headline: "Battery-management-system software recall, check remedy status",
        body: "24V372 (2023–2025 EQE SUV 350/350+/500 4MATIC, plus EQS SUVs and 2024 sedans): a BMS software fault may cause the high-voltage battery to shut down, a sudden loss of drive power. Free software update; owner notices mailed July 2024.",
        severity: "trap",
      },
      {
        headline: "Pedestrian-alert sound software recall",
        body: "25V366 (2023–2025 EQE SUV among others): the Acoustic Vehicle Alerting System software can fail to play the required pedestrian warning sound. Free dealer software update.",
        severity: "info",
      },
    ],
  },

  {
    id: "eqe-suv-2025-350-4matic",
    make: "MERCEDES-BENZ",
    model: "EQE SUV",
    modelAliases: ["EQE", "EQE 350", "EQE 350 SUV"],
    modelYears: [2025, 2025],
    trim: ["EQE 350 4MATIC", "350 SUV"],
    drive: "AWD",
    wmi: ["4JG"],
    battery: { packUsableKwh: f(90.5, "agg", "low", "The MY2026 EQE320 4MATIC SUV — which carries this exact 253-mi certification forward under the new name — files 90.5 kWh per VIN under Part 565, matching its MBUSA spec page; not separately confirmed for MY2025") },
    range: { epaRangeMi: f(253, "mfr", "high", "MY2025 EQE 350 4MATIC SUV, EPA — the same certification the renamed MY2026 EQE320 4MATIC SUV carries forward", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48394") },
    charging: {
      portStandard: f("CCS1", "agg", "medium"),
      dcPeakKw: f(170, "agg", "low", "Widely reported, matching the EQE family's EVA2 hardware; not confirmed against a MY2025-specific Mercedes document"),
    },
    thermal: { heatPump: f("standard", "mfr", "high", "“Two all-new standard innovations launch with the EQE SUV to further improve range: a heat pump and an intelligent powertrain management system” — MBUSA EQE SUV launch release, read directly; standard since launch") },
    warranty: {
      batteryYears: f(10, "mfr", "high", "10 yr/155,000 mi applies to the whole EQE/EQS family including SUVs, verified against MY25/MY26 EQ booklets"),
      batteryMiles: f(155_000, "mfr", "high"),
      extendedCoverage: f("Floor is stated as a per-pack amp-hour number in Mercedes' own booklet (EQE: 204 Ah), not a percentage. Battery coverage is conditioned on completed scheduled maintenance, a skipped-service history can void it.", "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high", "“To the original and each subsequent owner”, verified MY25/MY26 EQ booklets"),
    },
    buyerNotes: [
      {
        headline: "Battery-management-system software recall, check remedy status",
        body: "24V372 (2023–2025 EQE SUV 350/350+/500 4MATIC, plus EQS SUVs and 2024 sedans): a BMS software fault may cause the high-voltage battery to shut down, a sudden loss of drive power. Free software update; owner notices mailed July 2024.",
        severity: "trap",
      },
      {
        headline: "Pedestrian-alert sound software recall",
        body: "25V366 (2023–2025 EQE SUV among others): the Acoustic Vehicle Alerting System software can fail to play the required pedestrian warning sound. Free dealer software update.",
        severity: "info",
      },
    ],
  },

  {
    id: "eqe-2026-320-4matic",
    make: "MERCEDES-BENZ",
    model: "EQE",
    modelAliases: ["EQE 320"],
    modelYears: [2026, 2026],
    trim: "EQE320 4MATIC",
    drive: "AWD",
    wmi: ["W1K"],
    battery: { packUsableKwh: f(90.5, "mfr", "high") },
    range: {
      epaRangeMi: f(267, "mfr", "high", "2026 EQE320 4MATIC, EPA", "https://www.fueleconomy.gov"),
      testedRangeMi: f(332, "tested", "high", "70-mph highway test (Consumer Reports): 332 mi, beat EPA by ~65 mi"),
    },
    charging: {
      portStandard: f("CCS1", "mfr", "high", "AC charging is J1772"),
      dcPeakKw: f(170, "mfr", "high"),
      chargeTime1080Min: f(32, "mfr", "high"),
    },
    thermal: { heatPump: f("standard", "mfr", "high") },
    warranty: {
      batteryYears: f(10, "mfr", "high", "10 yr/155,000 mi applies to the whole EQE/EQS family including SUVs, verified against MY25/MY26 EQ booklets"),
      batteryMiles: f(155_000, "mfr", "high"),
      extendedCoverage: f("Floor is stated as a per-pack amp-hour number in Mercedes' own booklet (EQE: 204 Ah), not a percentage. Battery coverage is conditioned on completed scheduled maintenance.", "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high"),
    },
    buyerNotes: [
      {
        headline: "No recalls on file yet",
        body: "As of 2026-08-10, NHTSA's recall database returns zero campaigns for the MY2026 EQE320 4MATIC, consistent with this being a brand-new nameplate/model-year introduction.",
        severity: "info",
      },
    ],
  },

  {
    id: "eqe-2026-320-plus-rwd",
    make: "MERCEDES-BENZ",
    model: "EQE",
    modelAliases: ["EQE 320"],
    modelYears: [2026, 2026],
    trim: "EQE320+",
    drive: "RWD",
    wmi: ["W1K"],
    battery: { packUsableKwh: f(96, "mfr", "high") },
    range: { epaRangeMi: f(308, "mfr", "high", "2026 EQE320+, EPA", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("CCS1", "mfr", "high"),
      dcPeakKw: f(170, "mfr", "high"),
    },
    thermal: { heatPump: f("standard", "mfr", "high") },
    warranty: {
      batteryYears: f(10, "mfr", "high", "10 yr/155,000 mi applies to the whole EQE/EQS family including SUVs, verified against MY25/MY26 EQ booklets"),
      batteryMiles: f(155_000, "mfr", "high"),
      extendedCoverage: f("Floor is stated as a per-pack amp-hour number in Mercedes' own booklet (EQE: 204 Ah), not a percentage. Battery coverage is conditioned on completed scheduled maintenance.", "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high"),
    },
    buyerNotes: [
      {
        headline: "No recalls on file yet",
        body: "As of 2026-08-10, NHTSA's recall database returns zero campaigns for the MY2026 EQE320+. One unrelated NHTSA consumer complaint (not a recall or investigation) was filed in July 2026 alleging unintended acceleration; cause undetermined.",
        severity: "info",
      },
    ],
  },

  {
    id: "eqe-amg-2024-4matic",
    make: "MERCEDES-BENZ",
    model: "EQE AMG",
    // Only unambiguous AMG spellings — never bare "EQE": a trim-less "EQE"
    // listing must not resolve to AMG figures. The MY2024 AMG EQE SUV (4JG)
    // files the same trim strings; the wmi key keeps it out.
    modelAliases: ["AMG EQE", "AMG EQE Sedan"],
    modelYears: [2024, 2024],
    trim: "AMG EQE 4MATIC",
    drive: "AWD",
    wmi: ["W1K"],
    battery: { packUsableKwh: f(90.6, "agg", "low", "Widely reported by aggregators; corroborated indirectly via Mercedes-Benz USA's current AMG EQE Sedan spec page (same powertrain generation, no evidence of a mid-cycle battery change), but no MY2024-specific primary document was located") },
    range: { epaRangeMi: f(230, "mfr", "high", "2024 AMG EQE 4MATIC (EPA model string “AMG EQE 4matic Plus”), EPA", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("CCS1", "agg", "medium"),
      dcPeakKw: f(170, "agg", "low", "Widely reported; corroborated indirectly via the current AMG EQE Sedan spec page, not a MY2024-specific primary document"),
    },
    thermal: { heatPump: f("standard", "agg", "medium") },
    warranty: {
      batteryYears: f(10, "mfr", "high", "10 yr/155,000 mi applies to the whole EQE/EQS family including SUVs, verified against MY25/MY26 EQ booklets; reasonably extends to the AMG performance variant of the same platform"),
      batteryMiles: f(155_000, "mfr", "high"),
      extendedCoverage: f("Floor is stated as a per-pack amp-hour number in Mercedes' own booklet (EQE: 204 Ah), not a percentage. Battery coverage is conditioned on completed scheduled maintenance.", "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high"),
    },
    buyerNotes: [
      {
        headline: "Battery-management software recall; confirm the fix on this car",
        body: "24V372 (2024 AMG EQE 53 4MATIC and several other EQE/EQS variants): a BMS software fault may cause the high-voltage battery to shut down, a sudden loss of drive power. Free software update; owner notices mailed July 2024. Note: the separate 24V115 fuse-box recall does NOT apply to this 2024 model year, NHTSA's own vehicle-level index scopes that one to MY2023 only.",
        severity: "trap",
      },
      {
        headline: "Steering coupling bolt recall",
        body: "25V533 (2023–2024 AMG EQE 53 4MATIC): a steering coupling bolt may be improperly tightened, risking loss of steering control. Owner notices mailed October 2025.",
        severity: "warning",
      },
    ],
  },

  {
    id: "eqe-suv-2026-320-4matic",
    make: "MERCEDES-BENZ",
    model: "EQE SUV",
    // Not bare "EQE": MY2026 sells both a 320 4MATIC and a 320+ SUV, and a
    // trim-less "EQE"-filed 4JG listing (five live on 2026-08-16) would
    // resolve here as the only SUV row — an exact match the data can't
    // support. The 2023 500 row keeps the bare alias despite the same
    // trim-less residual because 40+ live listings file that way with real
    // trims; no trim-less 4JG 2023 EQE was observed.
    modelAliases: ["EQE 320"],
    modelYears: [2026, 2026],
    trim: "EQE320 4MATIC",
    drive: "AWD",
    wmi: ["4JG"],
    battery: { packUsableKwh: f(90.5, "agg", "medium", "Mercedes-Benz USA's live configurator has already rolled forward past this model year for this SUV nameplate, so a direct MY2026-labeled primary spec page could not be retrieved. Aggregated secondary sources converge on this figure, matching the sedan AWD pack size exactly") },
    range: { epaRangeMi: f(253, "mfr", "high", "2026 EQE SUV, EQE320 4MATIC, EPA", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("CCS1", "agg", "medium"),
      dcPeakKw: f(170, "agg", "low", "Assumed consistent with the EQE sedan family; not independently confirmed for the SUV body style"),
    },
    thermal: { heatPump: f("standard", "agg", "medium", "Standard on the EQE SUV since MY2023; presumed to continue for 2026 but not independently re-verified for this specific model year") },
    warranty: {
      batteryYears: f(10, "mfr", "high", "10 yr/155,000 mi applies to the whole EQE/EQS family including SUVs, verified against MY25/MY26 EQ booklets"),
      batteryMiles: f(155_000, "mfr", "high"),
      extendedCoverage: f("Floor is stated as a per-pack amp-hour number in Mercedes' own booklet (EQE: 204 Ah), not a percentage. Battery coverage is conditioned on completed scheduled maintenance.", "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high"),
    },
    buyerNotes: [
      {
        headline: "No recalls on file yet",
        body: "As of 2026-08-10, NHTSA's recall database returns zero campaigns for the MY2026 EQE SUV 320 4MATIC, consistent with this being a brand-new nameplate/model-year introduction.",
        severity: "info",
      },
    ],
  },

  {
    id: "eqs-2026-450-4matic",
    make: "MERCEDES-BENZ",
    model: "EQS",
    modelYears: [2026, 2026],
    trim: "EQS450 4MATIC",
    drive: "AWD",
    // Every live "EQS"-filed EQS SUV sampled 2026-08-16 was 4JG with
    // sedan-identical trim strings ("450 4MATIC"); this row is the
    // Sindelfingen sedan only.
    wmi: ["W1K"],
    battery: { packUsableKwh: f(118, "mfr", "high") },
    range: { epaRangeMi: f(367, "mfr", "high", "2026 EQS450 4MATIC, EPA", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("CCS1", "mfr", "high"),
      dcPeakKw: f(200, "mfr", "high"),
      chargeTime1080Min: f(31, "mfr", "high"),
      architectureV: f(400, "agg", "medium", "Not stated explicitly on Mercedes-Benz USA's spec page; independently corroborated by two secondary sources and consistent with the 200 kW DC figure (500A × 400V CCS ceiling)"),
    },
    thermal: { heatPump: f("standard", "mfr", "high") },
    warranty: {
      batteryYears: f(10, "mfr", "high", "10 yr/155,000 mi applies to the whole EQE/EQS family including SUVs, verified against MY25/MY26 EQ booklets"),
      batteryMiles: f(155_000, "mfr", "high"),
      extendedCoverage: f("Floor is stated as a per-pack amp-hour number in Mercedes' own booklet (EQS: 192 Ah), not a percentage. Battery coverage is conditioned on completed scheduled maintenance.", "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high"),
    },
    buyerNotes: [
      {
        headline: "This is the current 400V EQS, not the newly-announced next-generation car",
        body: "Mercedes announced an upgraded EQS on an 800V architecture with up to 350 kW DC charging in April 2026, as of this research it was orderable in Germany only, with no confirmed US on-sale date. This listing's EPA record predates that announcement and matches the existing 400V-architecture car's specs exactly (118 kWh, 367 mi, 200 kW). Don't assume this car has the newer, faster-charging hardware.",
        severity: "info",
      },
      {
        headline: "No recalls on file yet",
        body: "As of 2026-08-10, NHTSA's recall database returns zero campaigns for the MY2026 EQS450 4MATIC, consistent with this being a brand-new nameplate/model-year introduction.",
        severity: "info",
      },
    ],
  },

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
    battery: { packGrossKwh: f(85, "mfr", "high") },
    range: { epaRangeMi: f(317, "mfr", "high", "2026 and 2027 Optiq RWD, EPA (identical both years)", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("NACS", "mfr", "high", "Cadillac's own Optiq specs page: “J3400 (NACS)”, native NACS, unlike the CCS1-native pattern used by Escalade IQ/Sierra EV/Silverado EV/Lyriq"),
      superchargerAccess: f("native", "mfr", "high", "Charge port is NACS natively, no adapter needed for Superchargers; a GM-approved adapter is instead needed for CCS/J1772 chargers"),
      dcPeakKw: f(150, "mfr", "high", "Cadillac's own Optiq specs page: 150 kW peak, up to 81 mi added in ~10 min"),
    },
    thermal: { heatPump: f("standard", "agg", "medium", "GM's Ultium Energy Recovery heat pump is platform-wide standard; independently corroborated for the Optiq specifically by a trade-press writeup") },
    warranty: {
      batteryYears: f(8, "mfr", "high"),
      batteryMiles: f(100_000, "mfr", "high"),
      sohFloorPct: f(75, "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high"),
    },
    buyerNotes: [
      {
        headline: "This car charges differently than most other GM EVs, no Supercharger adapter needed",
        body: "Optiq has a native NACS (Tesla-style) charge port, unlike Escalade IQ, Sierra EV, Silverado EV, and Lyriq, which are all CCS1-native and need a GM adapter for Superchargers. On Optiq, it's the reverse: a GM-approved adapter is needed to use CCS or J1772 chargers.",
        severity: "info",
      },
      {
        headline: "A tire tread-detachment recall on some 21-inch Continental tires; confirm this car's were replaced",
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
    range: { epaRangeMi: f(303, "mfr", "high", "2027 Optiq AWD, EPA", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("NACS", "mfr", "high", "Cadillac's own Optiq specs page: “J3400 (NACS)”, native NACS, unlike the CCS1-native pattern used by Escalade IQ/Sierra EV/Silverado EV/Lyriq"),
      superchargerAccess: f("native", "mfr", "high", "Charge port is NACS natively, no adapter needed for Superchargers; a GM-approved adapter is instead needed for CCS/J1772 chargers"),
      dcPeakKw: f(150, "mfr", "high", "Cadillac's own Optiq specs page: 150 kW peak, up to 81 mi added in ~10 min"),
    },
    thermal: { heatPump: f("standard", "agg", "medium", "GM's Ultium Energy Recovery heat pump is platform-wide standard; independently corroborated for the Optiq specifically by a trade-press writeup") },
    warranty: {
      batteryYears: f(8, "mfr", "high"),
      batteryMiles: f(100_000, "mfr", "high"),
      sohFloorPct: f(75, "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high"),
    },
    buyerNotes: [
      {
        headline: "This car charges differently than most other GM EVs, no Supercharger adapter needed",
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
    abstains: { epaRangeMi: "No EPA rating exists: NHTSA's VIN decode puts this in GVWR Class 3, above EPA's labelling threshold, and fueleconomy.gov has no record under either nameplate; Cadillac's own figure is an estimate and stays in the buyer note" },
    make: "CADILLAC",
    model: "Escalade IQ",
    modelYears: [2025, 2026], // window extended to the MY2025 launch year (2026-08-14)
    drive: "AWD",
    battery: { packGrossKwh: f(205, "mfr", "high") },
    range: {
      testedRangeMi: f(482, "tested", "high", "70-mph steady-state (InsideEVs): 482.2 mi, using 222.7 kWh. Edmunds' own mixed-driving methodology recorded 558 mi; a third-party 60-mph constant-speed test (Tom Moloughney/State of Charge) recorded 607 mi, all three exceed Cadillac's own 465-mi estimate. No EPA-certified figure exists to compare against."),
    },
    charging: {
      portStandard: f("CCS1", "mfr", "high"),
      superchargerAccess: f("adapter", "mfr", "high", "GM-approved adapter, 29,000+ Tesla Superchargers, the opposite pattern from Optiq, which is NACS-native"),
      dcPeakKw: f(350, "mfr", "high", "Cadillac's own Escalade IQ specs page: 350 kW peak, up to 117 mi in ~10 min"),
      architectureV: f(800, "mfr", "high"),
    },
    thermal: { heatPump: f("standard", "agg", "low", "GM's Ultium Energy Recovery heat pump is platform-wide standard; not independently re-confirmed for Escalade IQ specifically") },
    warranty: {
      batteryYears: f(8, "mfr", "high"),
      batteryMiles: f(100_000, "mfr", "high"),
      sohFloorPct: f(75, "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high"),
    },
    buyerNotes: [
      {
        headline: "No EPA-certified range exists for this vehicle, Cadillac's own figure is not an EPA rating",
        body: "At roughly 10,600 lb GVWR, Escalade IQ exceeds the 10,000 lb cutoff for EPA's fuel-economy/range labeling program, NHTSA's own VIN decode places both the IQ and the IQL in GVWR Class 3, over 10,000 lb. fueleconomy.gov has no Escalade IQ or IQL record under any model year checked, on either nameplate. Cadillac's own marketing states “465 miles, Cadillac-estimated”, its own site explicitly does not call this an EPA figure. Independent instrumented tests (below) suggest the real-world range is at least in that neighborhood, but there is no government-certified number to cite.",
        severity: "warning",
      },
      {
        headline: "HV battery module recall, remedy not yet available",
        body: "26V494 (2026 Escalade IQ, Escalade IQL, Sierra EV, Silverado EV): an improperly secured internal module component in the HV battery may move and damage the battery, increasing fire risk. Dealers will replace the entire HV battery free of charge, but owner notification letters were not expected to be mailed until September 14, 2026, as of this writing, the remedy process had not yet started for affected owners.",
        severity: "trap",
      },
    ],
  },

  {
    id: "cadillac-escalade-iql-2026",
    abstains: { epaRangeMi: "No EPA rating exists: NHTSA's VIN decode puts this in GVWR Class 3, above EPA's labelling threshold, and fueleconomy.gov has no record under either nameplate; Cadillac's own figure is an estimate and stays in the buyer note" },
    make: "CADILLAC",
    model: "Escalade IQL",
    modelYears: [2026, 2026],
    drive: "AWD",
    // No epaRangeMi: EnrichmentReport renders that field under the literal
    // label "EPA range", and no EPA rating exists for this vehicle. Cadillac's
    // own 460-mile figure is a manufacturer estimate and stays in the buyer
    // note, where it is labelled as one; the tested figure is the only number
    // this card prints, which is right — it is a real measurement with a
    // stated method, not a government rating in disguise.
    battery: { packGrossKwh: f(200, "mfr", "medium", "Cadillac's own Escalade IQL specs page states only “over 200 kWh”, vaguer wording than the Escalade IQ page's specific 205 kWh figure") },
    charging: {
      portStandard: f("CCS1", "mfr", "high"),
      superchargerAccess: f("adapter", "mfr", "high", "GM-approved adapter, 29,000+ Tesla Superchargers"),
      dcPeakKw: f(350, "mfr", "high"),
      architectureV: f(800, "mfr", "high"),
    },
    thermal: { heatPump: f("standard", "agg", "low", "GM's Ultium Energy Recovery heat pump is platform-wide standard; not independently re-confirmed for Escalade IQL specifically") },
    warranty: {
      batteryYears: f(8, "mfr", "high"),
      batteryMiles: f(100_000, "mfr", "high"),
      sohFloorPct: f(75, "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high"),
    },
    buyerNotes: [
      {
        headline: "No EPA-certified range exists for this vehicle, Cadillac's own figure is not an EPA rating",
        body: "fueleconomy.gov has no Escalade IQL record under any model year checked. Cadillac's own marketing states “460 miles, Cadillac-estimated”, its own site explicitly does not call this an EPA figure. The shorter-wheelbase Escalade IQ has been independently tested well past its own estimate, but no reviewer has published a tested figure for the IQL specifically, don't assume the IQ's test results carry over.",
        severity: "warning",
      },
      {
        headline: "HV battery module recall, remedy not yet available",
        body: "26V494 (2026 Escalade IQ, Escalade IQL, Sierra EV, Silverado EV): an improperly secured internal module component in the HV battery may move and damage the battery, increasing fire risk. Dealers will replace the entire HV battery free of charge, but owner notification letters were not expected to be mailed until September 14, 2026, as of this writing, the remedy process had not yet started for affected owners.",
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
    battery: { packGrossKwh: f(120, "agg", "low", "Reported by a GM-focused trade outlet, corroborated by a second aggregator; not confirmed on any gmc.com page, GMC's own /specs and /charging pages for Sierra EV both 404") },
    range: { epaRangeMi: f(283, "mfr", "high", "2026 Sierra EV Elevation, Standard Range (the pack this trim ships with by default), EPA, cross-corroborated by GMC's own site FAQ", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("CCS1", "agg", "low", "Not stated on any GMC page found for Sierra EV specifically; inferred by platform-family analogy to Silverado EV, which shares this Ultium truck platform"),
      dcPeakKw: f(220, "agg", "low"),
    },
    thermal: { heatPump: f("standard", "agg", "low", "GM's Ultium Energy Recovery heat pump is platform-wide standard; not independently confirmed on any GMC page for Sierra EV") },
    warranty: {
      batteryYears: f(8, "mfr", "high"),
      batteryMiles: f(100_000, "mfr", "high"),
      sohFloorPct: f(75, "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high"),
    },
    buyerNotes: [
      {
        headline: "This listing doesn't say which battery pack this Elevation trim has",
        body: "GMC's own site confirms the Elevation trim ships standard with the Standard Range pack (283 mi EPA) but offers an Extended Range pack (410 mi EPA) as an upgrade on the same trim. This row assumes Standard Range; check the window sticker or door-jamb label to confirm.",
        severity: "warning",
      },
      {
        headline: "HV battery module recall, remedy not yet available",
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
    battery: { packGrossKwh: f(170, "agg", "low", "Reported by a GM-focused trade outlet, corroborated by a second aggregator; not confirmed on any gmc.com page, GMC's own /specs and /charging pages for Sierra EV both 404") },
    range: { epaRangeMi: f(410, "mfr", "high", "2026 Sierra EV Elevation with the optional Extended Range pack, EPA, cross-corroborated by GMC's own site FAQ", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("CCS1", "agg", "low", "Not stated on any GMC page found for Sierra EV specifically; inferred by platform-family analogy to Silverado EV, which shares this Ultium truck platform"),
      dcPeakKw: f(300, "agg", "low"),
    },
    thermal: { heatPump: f("standard", "agg", "low", "GM's Ultium Energy Recovery heat pump is platform-wide standard; not independently confirmed on any GMC page for Sierra EV") },
    warranty: {
      batteryYears: f(8, "mfr", "high"),
      batteryMiles: f(100_000, "mfr", "high"),
      sohFloorPct: f(75, "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high"),
    },
    buyerNotes: [
      {
        headline: "This listing doesn't say which battery pack this Elevation trim has",
        body: "GMC's own site confirms the Elevation trim ships standard with the Standard Range pack (283 mi EPA) but offers this Extended Range pack (410 mi EPA) as an upgrade on the same trim. This row assumes Extended Range; check the window sticker or door-jamb label to confirm.",
        severity: "warning",
      },
      {
        headline: "HV battery module recall, remedy not yet available",
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
