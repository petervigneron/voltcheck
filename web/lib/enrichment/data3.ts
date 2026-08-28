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

// ---------------------------------------------------------------------
// Mercedes-Benz EQE / EQS shared facts. The EQE rows below this file's
// original Mercedes block spell every one of these out inline, one row at a
// time; the EQS block added 2026-08-25 shares them instead, because it is
// 33 rows and the warranty, charging and recall text is identical across
// all of them. Nothing here is new research: the warranty terms are the
// ones already verified against the MY25/MY26 EQ booklets, and the recall
// wording is NHTSA's own campaign summary, re-read 2026-08-25 through
// api.nhtsa.gov (both the per-campaign text and the vehicle-level index
// that says which body and year each campaign actually reaches).
// ---------------------------------------------------------------------
const MB_EQ_W_BASE = {
  batteryYears: f(10, "mfr", "high", "10 yr/155,000 mi applies to the whole EQE/EQS family including SUVs, verified against MY25/MY26 EQ booklets"),
  batteryMiles: f(155_000, "mfr", "high"),
  batteryTransfers: f(true, "mfr", "high", "“To the original and each subsequent owner”, verified MY25/MY26 EQ booklets"),
};
const MB_EQE_W = {
  ...MB_EQ_W_BASE,
  extendedCoverage: f("Floor is stated as a per-pack amp-hour number in Mercedes' own booklet (EQE: 204 Ah), not a percentage. Battery coverage is conditioned on completed scheduled maintenance, a skipped-service history can void it.", "mfr", "high"),
};
const MB_EQS_W = {
  ...MB_EQ_W_BASE,
  extendedCoverage: f("Floor is stated as a per-pack amp-hour number in Mercedes' own booklet (EQS: 192 Ah), not a percentage. Battery coverage is conditioned on completed scheduled maintenance, a skipped-service history can void it.", "mfr", "high"),
};
const MB_EQE_CHG = {
  portStandard: f<"CCS1">("CCS1", "agg", "medium"),
  dcPeakKw: f(170, "agg", "low", "170 kW peak across the EQE family; Mercedes-Benz USA's MY2026 EQE320 spec pages state it, and no year of this family has been reported at a different peak"),
};
const MB_EQS_CHG = {
  portStandard: f<"CCS1">("CCS1", "agg", "medium"),
  dcPeakKw: f(200, "agg", "low", "200 kW peak across the EQS family; Mercedes-Benz USA's MY2026 EQS spec pages state it, and no year of this family has been reported at a different peak"),
  architectureV: f(400, "agg", "low", "The CCS 500A/400V ceiling matches the 200 kW peak; Mercedes does not state the pack voltage on its own US spec pages"),
};
// The EQE SUV's heat pump is the only one in this family Mercedes states in
// its own words, and it is stated about that SUV — not about the EQS SUV, not
// about any sedan. The other three entries say what they rest on instead.
const MB_REL_EQE_SUV = "https://media.mbusa.com/releases/release-aba56cd1404245f552982a75a0042334-mercedes-benz-usa-announces-pricing-and-packaging-structures-for-alabama-built-eqe-suv";
const MB_HP_EQE_SUV = {
  heatPump: f<"standard">("standard", "mfr", "high", "“Two all-new standard innovations launch with the EQE SUV to further improve range: a heat pump and an intelligent powertrain management system” — MBUSA EQE SUV launch release, read directly", MB_REL_EQE_SUV),
};
const MB_HP_EQS_SUV = {
  heatPump: f<"standard">("standard", "agg", "medium", "Standard on the Alabama-built EQ SUVs from launch; Mercedes states it in its own words for the EQE SUV this car shares a platform and plant with, not for the EQS SUV specifically"),
};
const MB_HP_SED_EARLY = {
  heatPump: f<"optional">("optional", "agg", "medium", "Mercedes made the heat pump standard on EQE/EQS sedans starting MY2024, the earlier sedan likely lacks it unless optioned. (It was already standard on the EQ SUVs.)"),
};
const MB_HP_SED = {
  heatPump: f<"standard">("standard", "agg", "medium", "Standard on EQE/EQS sedans from MY2024 (read directly on the MY2026 MBUSA spec pages)"),
};
const MB_EQE_PACK_906 = {
  packUsableKwh: f(90.6, "agg", "medium", "The pre-refresh EVA2 pack Mercedes quotes for the MY2023 EQE (“Fitted standard with a 90.6 kWh battery”); the AMG kept it after the MY2025 refresh moved the 350+ to 96 kWh"),
};
const MB_EQS_PACK_1078 = {
  packUsableKwh: f(107.8, "agg", "medium", "107.8 kWh usable — the pre-MY2025 EQS pack, consistently documented across Mercedes materials and press; Mercedes' own US pages state a figure only for the current car"),
};
const MB_EQS_PACK_118 = {
  packUsableKwh: f(118, "vin", "high", "Mercedes' per-VIN Part 565 submissions read 118.00 kWh on MY2025–26 EQS sedans and SUVs alike, matching the figure MBUSA's own MY2026 spec page states"),
};
const NOTE_MB_FUSE_TWO_ROUNDS = {
  headline: "Fuse-box fire/power-loss recall, two rounds, check which repair this VIN got",
  body: "24V115 (80-Amp fuses manufactured incorrectly, which can cause a sudden loss of drive power or a fire risk): free replacement fuse box. 25V255: some vehicles repaired under 24V115 received an INCORRECT fuse box that was not designed for the vehicle, which itself carries a fire and power-loss risk, a second free repair. Confirm this VIN got the correct part, not just “a” repair.",
  severity: "trap" as const,
};
const NOTE_MB_FUSE_24V115 = {
  headline: "Fuse-box fire/power-loss recall, check remedy status",
  body: "24V115 (2023–2024 Mercedes models including EQS450, EQS580 and AMG EQS): the 80-Amp fuses may have been manufactured incorrectly, which can cause a sudden loss of drive power or a fire risk. Free dealer replacement of the fuse box; owner notices mailed April 2024.",
  severity: "trap" as const,
};
const NOTE_MB_BMS_24V372 = {
  headline: "Battery-management software recall, check remedy status",
  body: "24V372: the battery management system software may cause the high-voltage battery to shut down, which can result in a sudden loss of drive power. Free dealer software update; owner notices mailed July 2024. NHTSA's campaign names the 2024 EQE and EQS sedans, the 2023–2025 EQE and EQS SUVs, and the 2024–2025 EQS SUV 680 4MATIC.",
  severity: "trap" as const,
};
const NOTE_MB_AVAS_25V366 = {
  headline: "Pedestrian-alert sound software recall",
  body: "25V366 (2022–2025 EQE, EQE SUV, EQS, EQS SUV and S-Class): the Acoustic Vehicle Alerting System software may play an incorrect external warning sound while reversing. Free dealer software update; owner notices mailed August 2025.",
  severity: "info" as const,
};
const NOTE_EQE_STEER_25V533 = {
  headline: "Steering coupling bolt recall",
  body: "25V533 (2023–2026 EQE and GLC): the steering coupling bolt may be improperly tightened, allowing the coupling to loosen from the steering rack and risking a loss of steering control. Owner notices mailed October 2025.",
  severity: "warning" as const,
};
const NOTE_EQE_ROOF_23V555 = {
  headline: "Roof-frame absorbers may not be secured, check remedy status",
  body: "23V555 (2023 AMG EQE, EQE 500 and EQE 350): the absorbers in the roof frame may not be secured properly and can detach during window air bag deployment. Free dealer replacement; owner notices mailed September 2023.",
  severity: "warning" as const,
};
const NOTE_EQS_DRIVE_23V405 = {
  headline: "Drivetrain software recall, a loss of drive power, check remedy status",
  body: "23V405 (2022–2023 EQS 450, AMG EQS and EQS 580, plus the 2023 AMG EQE): a software error in the electric drivetrain may cause a loss of drive power. Free dealer software update; owner notices mailed July 2023.",
  severity: "trap" as const,
};
const NOTE_EQS_BMS_23V309 = {
  headline: "Battery-monitoring software recall, check remedy status",
  body: "23V309 (2022–2023 EQS 450 and EQS 580, 2022 AMG EQS 53, EQS 450+, plus the 2023 EQE 350): the high-voltage battery monitoring software may not alert the driver to a battery malfunction, an FMVSS 305 non-compliance. Free dealer software update; owner notices mailed August 2023.",
  severity: "warning" as const,
};
const NOTE_EQS_STEERWHEEL_22V189 = {
  headline: "Heated-steering-wheel hands-off detection recall",
  body: "22V189 (2021–2022 Mercedes models including the EQS, when fitted with a heated leather steering wheel): a software error in the hand-detection control unit can stop Active Distance Assist DISTRONIC from noticing that the driver's hands are off the wheel. Free dealer software update; owner notices mailed May 2022.",
  severity: "warning" as const,
};
const NOTE_EQS_NEXTGEN = {
  headline: "This is the current 400V EQS, not the newly-announced next-generation car",
  body: "Mercedes announced an upgraded EQS on an 800V architecture with up to 350 kW DC charging in April 2026, as of this research it was orderable in Germany only, with no confirmed US on-sale date. This listing's EPA record predates that announcement and matches the existing 400V-architecture car's specs exactly (118 kWh, 200 kW). Don't assume this car has the newer, faster-charging hardware.",
  severity: "info" as const,
};

// ── GMC Sierra EV shared facts ─────────────────────────────────────────────
// Seven configurations share everything except pack, range and DC rate; these
// exist so a change to the warranty or a recall is made once rather than seven
// times. The full story of the nameplate is in the block comment on the rows.
const GMC_SIERRA = "https://www.gmc.com/electric/sierra-ev";
const SIERRA_HP_ABSTAIN =
  "GM does not name cabin-heating hardware in its own vehicle documents - even the Blazer EV owner manual, whose press release touts the Ultium heat pump, never says the words. The control test is the 2027 Bolt, whose GM press release DOES name one: GM states it when it means to, so silence on the other cars is evidence rather than an omission. These rows previously asserted `standard` from the platform-wide Ultium claim plus a trade-press writeup - the same source class that produced the falsified Volvo heat-pump claim. Owner decision 2026-08-26: abstain.";
const SIERRA_PACK_NOTE =
  "Reported by a GM-focused trade outlet, corroborated by a second aggregator; not confirmed on any gmc.com page, GMC's own /specs and /charging pages for Sierra EV both 404";
// Deliberately no packGrossKwh on the Max Range rows below. The trade figures
// above cover the 14- and 20-module packs only, and gmc.com states no capacity
// for any Sierra EV pack — a grep of its whole Sierra EV page for "kWh"
// returns nothing at all. Scaling 170 kWh by 24/20 would be arithmetic, not a
// source, so those two rows carry range and no capacity.
// The one unresolved thing on this nameplate; see the block comment. It rides
// as a row note (hover only, never page copy) rather than a buyer note.
const CHARGER_NOTE =
  "EPA rated the Extended Range truck twice — 410 miles with the 11 kW onboard charger and 385 with the 19 kW — and no VIN field says which one a given truck has. GMC's own FAQ publishes 410 for the Elevation and the Denali with no charger qualifier, so this is the standard configuration's figure.";
const SIERRA_MAX_PACK_ABSTAIN =
  "GMC publishes no battery capacity for any Sierra EV pack — a search of its whole Sierra EV page for \u201ckWh\u201d returns nothing — and the trade figures the smaller packs rest on cover the 14- and 20-module packs only, so scaling one of them by 24/20 would be arithmetic rather than a source";
const MAX_RANGE_NOTE =
  "24-module Max Range pack. EPA holds no record for it — its 2026 Sierra EV list is one Std Range and two Ext Range entries — so this is GMC's own estimate, not a rating.";
const SIERRA_WARRANTY = {
  batteryYears: f(8, "mfr", "high"),
  batteryMiles: f(100_000, "mfr", "high"),
  sohFloorPct: f(75, "mfr", "high"),
  batteryTransfers: f(true, "mfr", "high"),
};
const SIERRA_PORT = f<"CCS1">(
  "CCS1",
  "agg",
  "low",
  "Not stated on any GMC page found for Sierra EV specifically; inferred by platform-family analogy to Silverado EV, which shares this Ultium truck platform"
);
const SIERRA_CHARGING_STD = { portStandard: SIERRA_PORT, dcPeakKw: f(220, "agg", "low") };
const SIERRA_CHARGING_EXT = { portStandard: SIERRA_PORT, dcPeakKw: f(300, "agg", "low") };
// The Max Range pack is the one GMC makes a public DC claim about: "up to 120
// miles in approximately 10 minutes" on 800V, which is a rate claim rather
// than a peak-kW figure, so it stays in the note and no dcPeakKw is asserted.
const SIERRA_CHARGING_MAX = { portStandard: SIERRA_PORT };
const SIERRA_RECALLS = [
  {
    headline: "HV battery module recall, remedy not yet available",
    body: "26V494 (2026 Sierra EV, Silverado EV, Escalade IQ, Escalade IQL): an improperly secured internal module component in the HV battery may move and damage the battery, increasing fire risk. Dealers will replace the entire HV battery free of charge, but owner notification letters were not expected to be mailed until September 14, 2026.",
    severity: "trap" as const,
  },
  {
    headline: "Spare-wheel cracking and ESC-warning-light recalls",
    body: "26V496 (2026 Sierra EV/Silverado EV built Oct 2025\u2013Mar 2026, ~513 units): the spare steel wheel may crack at the disc vent holes. Remedy pending, letters expected September 2026. 25V594 (2026 Sierra EV/Silverado EV): after an ESC malfunction, the warning light may not re-illuminate on the next key cycle. Free OTA or dealer software update, already available.",
    severity: "warning" as const,
  },
];

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
    battery: { packUsableKwh: { value: 108.9, source: "mfr", asOf: "2026-08-24", confidence: "medium", note: "BMW's spec-sheet net figure; BMW USA press copy prints 112.8 kWh net usable for the same variant", sourceUrl: "https://www.press.bmwgroup.com/global/article/attachment/T0447642EN/630684" } },
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
    // Trim key dropped 2026-08-14: every 2024 e-tron GT rates 249 (the RS
    // too), so "Prestige"/"4D Sedan" listings were going unmatched for
    // nothing. 2022–23 GT/RS rows live in data4.
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
    //
    // Corrected 2026-08-25. This row printed 480 on the belief that the Grand
    // Touring's standard wheel is the 20-inch Aero Lite while the Pure and
    // Touring get 19s. The document this row already cites for its pack size
    // says otherwise, in a table nobody had read to the bottom: its Tires
    // section lists "19” wheel (standard)", with the 20 and the 21 both
    // marked "(optional)" — the same standard-19 fitment the Pure and Touring
    // spec sheets carry. So the standard-configuration figure is the 19-inch
    // 512, not the 20-inch 480, and the row was understating Lucid's flagship
    // by 32 miles. The EPA id moves with it (48371 is the 19-inch entry,
    // 48372 the 20-inch one). Understating is the safe direction, which is
    // why this survived a pass, but it is still the wrong number.
    id: "lucid-air-2025-grand-touring-awd",
    make: "LUCID",
    model: "Air",
    modelYears: [2025, 2025],
    trim: "Grand Touring",
    drive: "AWD",
    // Pack read off the same Lucid document the range figure above was checked
    // against — its range table prints 512/480/446 for 19/20/21-inch wheels
    // and its tire table names the 19 as standard, which together are where
    // this row's standard-config choice comes from. Same shape as the Pure
    // (84, 16 module) and Touring (92, 18 module) rows.
    battery: { packGrossKwh: f(117, "mfr", "high", "Lucid's own 2025 Grand Touring technical-spec sheet: \u201c117 (22 module)\u201d; no usable/net split published by Lucid", "https://lucidmotors.com/media/document/lucid-air-grand-touring-technical-specs-2025.pdf") },
    range: { epaRangeMi: f(512, "mfr", "high", "19-inch wheels, standard; 480 on the 20s and 446 on the 21s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48371") },
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
  // THE WOODLAND'S TWO RANGES ARE NOT TWO GRADES — corrected 2026-08-25.
  // The table above reads EPA's two Woodland records as base-vs-Premium
  // because that is the only split EPA's own model strings suggest, and the
  // rows below were keyed that way: trim "Premium" got 260, everything else
  // 281. Toyota's own launch release says otherwise, in one sentence —
  // "281 Mile of EPA-Estimated Driving Range Rating (260 miles for bZ
  // Woodland Models Equipped with Optional All-Terrain Tire)" — and its grade
  // walk lists the all-terrain tire as AVAILABLE on both grades, not standard
  // on the Premium (pressroom.toyota.com/toyotas-all-electric-lineup-gains-
  // rugged-powerful-new-bz-woodland-suv/, fetched 2026-08-25). So the 21-mile
  // spread is an option box, and a Premium on the standard tire is a 281-mile
  // car that this corpus was telling its shopper was a 260-mile car. Under,
  // not over, so it never sold anyone a false bargain — but it is still
  // matching the wrong thing, and it was 374 live listings deep. (That count
  // is the whole feed, re-measured 2026-08-25 by replaying the deleted row's
  // trim keys against all 24 shards. An earlier note here said 176, which was
  // a half-feed measurement taken while twelve shards were returning 500s —
  // the kind of number that looks precise and is half the truth.)
  //
  // The fix follows the rule the wheel-size case already settled: state the
  // STANDARD configuration's rating and LABEL it, rather than printing the
  // lowest figure or going silent. One Woodland row now, carrying 281 with
  // the tire named in the note, and the option's 260 in a buyer note. The two
  // grade-keyed rows are deleted rather than both set to 281: identical rows
  // whose only distinguishing key encodes a split that does not exist are how
  // this defect gets re-derived by the next reader.
  //
  // MY2027 — both nameplates carry over, and Toyota says so in as many words.
  // "Returning for its fifth year in the lineup, the 2027 bZ remains
  // unchanged from the prior model year" (pressroom.toyota.com/everyday-
  // electric-confidence-returns-for-2027-with-toyota-bz/) and "Overall,
  // features and specifications remain unchanged from the 2026 model year"
  // (pressroom.toyota.com/rugged-powerful-and-charged-up-for-adventure-2027-
  // toyota-bz-woodland/), both fetched 2026-08-25, both restating every pack
  // size and range figure in the table above to the digit — 57.7/74.7 kWh,
  // 236/314/299/288/278, and the Woodland's 281 and 260. The rows' windows
  // extend to 2027 rather than being copied into a new file, and their ids
  // keep the launch-year name (tests and backfill.ts key on those ids), the
  // same way data3's own escalade-iq-2026 carries a 2025 window.
  //
  // Two things about that extension a later reader should not have to guess.
  // First, EPA has published NOTHING for MY2027 — its 2027 Toyota model list
  // is Corolla Hatchback, Land Cruiser and Prius, checked 2026-08-25 — so the
  // epa() links below cite the MY2026 record for a figure Toyota restates for
  // MY2027 itself; when EPA files the 2027 records, re-point them. Second,
  // Toyota's MY2027 wording for Limited FWD is 299 miles, where these rows
  // print 296: that is the deliberate lower-of-two-suppliers choice made for
  // MY2026 above, and it stays, because it errs in the direction that cannot
  // cost a shopper money.
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
    modelYears: [2026, 2027],
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
    modelYears: [2026, 2027],
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
    modelYears: [2026, 2027],
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
    modelYears: [2026, 2027],
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
    modelYears: [2026, 2027],
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
    modelYears: [2026, 2027],
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
    modelYears: [2026, 2027],
    drive: "AWD",
    // One row for the nameplate: both grades take the same pack, and the two
    // EPA records differ on the tire, not the grade (see the correction in the
    // block comment above). 281 is the standard fitment and the note names it,
    // rather than printing the option's lower figure as if it were the car's.
    battery: { packGrossKwh: f(74.7, "mfr", "high") },
    range: {
      epaRangeMi: f(
        281,
        "mfr",
        "high",
        "EPA rating on the standard tire; the optional all-terrain tire is rated 260 miles",
        epa(50305)
      ),
    },
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
    buyerNotes: [
      {
        headline: "The optional all-terrain tire costs 21 miles of range — 260 instead of 281",
        severity: "info",
        learnMore: epa(50306),
      },
    ],
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
    abstains: { packUsableKwh: "Seven EPA-labeled 2019 variants span 74 to 100 usable kWh across two pack generations, and nothing on a listing separates them", epaRangeMi: "Nothing in the VIN, vPIC or the feed separates 60D from 100D on these cars, and the four are up to 111 miles apart" },
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
    abstains: { packUsableKwh: "Tesla certified 60 through 100 kWh packs for 2017 (60D/75D/90D/100D) and nothing on a listing separates them", epaRangeMi: "Nothing in the VIN, vPIC or the feed separates 60D from 100D on these cars, and the four are up to 111 miles apart" },
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
    abstains: { packUsableKwh: "Tesla certified 75 and 100 kWh packs for 2018 and nothing on a listing separates them", epaRangeMi: "Nothing in the VIN, vPIC or the feed separates 60D from 100D on these cars, and the four are up to 111 miles apart" },
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
    // Same composite trap the EQS 450 4MATIC rows carry, and the same fix:
    // Mercedes' own Part 565 trim for the MY2024–25 EG1CB car reads
    // "EQE350+ 4MATIC" — a plus on a 4MATIC — so trimMatches' one-sided-plus
    // rule rejects it against the plus-less key, and a /vin/ decode would
    // fall through to the 350+ row's 298 mi instead of this car's 280.
    // Twenty-four MY2024 VINs in the vPIC cache spell it that way (three
    // more in MY2025); MY2023's EG1CB reads "EQE 350 4MATIC" and needs no
    // alias, which is why the 2023 row above does not carry one.
    trim: ["EQE 350 4MATIC", "EQE350+ 4MATIC"],
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
    trim: ["EQE 350 4MATIC", "EQE350+ 4MATIC"], // see the MY2024 row's note

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
    // Bare "EQE" was kept off this row so a trim-less "EQE" listing could not
    // resolve to AMG figures. trimMatches now refuses a trim-keyed row an
    // absent trim outright, so that guard is doing nothing the matcher isn't
    // already doing — and it was costing every live AMG listing filed as
    // model "EQE" with the AMG named in the trim instead, which is how the
    // MY2023 cars all arrive. The MY2024 AMG EQE SUV (4JG) files the same
    // model and trim strings; the wmi key is what keeps it out.
    modelAliases: ["AMG EQE", "AMG EQE Sedan", "EQE"],
    modelYears: [2024, 2024],
    // "AMG EQE 4MATIC+" is Mercedes' own full name for this car and the
    // spelling 12 live MY2024 listings use. It has to be listed explicitly:
    // trimMatches refuses a one-sided plus, so the plus-less key alone
    // rejected every one of them.
    trim: ["AMG EQE 4MATIC", "AMG EQE 4MATIC+", "AMG EQE"],
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
  // The rest of the Mercedes EQ line-up (added 2026-08-25). The block above
  // covered the EQE's volume trims and three MY2026 cars; on the live feed
  // that left 631 of 1,187 Mercedes EQ listings resolving to nothing at all —
  // every EQS of either body except the MY2026 450 4MATIC sedan, both AMG
  // bodies outside MY2024, and the 500 4MATIC in its second year.
  //
  // Keyed the same way as the rows above: trim + WMI. W1K is the
  // Sindelfingen/Bremen sedan, 4JG the Tuscaloosa SUV, and dealers file both
  // bodies under the same model and trim strings, so the WMI is the only
  // thing that separates an EQS 450 4MATIC sedan (367 mi) from an EQS SUV
  // wearing the same badge (312 mi). Control test, 2,700 Mercedes BEV VINs in
  // the vPIC cache: every W1K decodes to a sedan Baumuster (CG/EG/FJ) and
  // every 4JG to an SUV one (DM/DX/GM), with no crossing. (The EQB is neither
  // — it is W1N, Kecskemét — which is why no row here claims it.)
  //
  // Three things the trim keys have to survive, all read off the live feed
  // and the VIN filings rather than guessed at:
  //
  //  1. The MY2026 SUV rename. EPA certifies the 2026 EQS SUV as "EQS 400
  //     4matic" and "EQS 550 4matic"; Mercedes' own Part 565 filings for the
  //     same MY2026 VINs still read EQS450 4MATIC and EQS580 4MATIC, and so
  //     do the dealers. Those rows carry both names, and the EPA figure is
  //     identical across the rename anyway (312 and 317 in 2025, 2026 and
  //     2027 alike), so nothing rests on which name a listing uses.
  //  2. The "+" is identity, not punctuation — EQS 450+ is the RWD car,
  //     EQS 450 4MATIC the AWD one, ~10 mi apart. trimMatches already refuses
  //     a one-sided plus, so a plus-less "450" cannot reach a 450+ row; it
  //     falls to the 4MATIC row, which understates by 10 mi rather than
  //     overstating. Deliberate: a plus-less "450" is genuinely ambiguous and
  //     the cheap error is the low one. What is NOT safe is adding a
  //     plus-less spelling to a 450+ row to catch those — the exact-trim pass
  //     runs before the drivetrain filter, so it would hand every AWD "450"
  //     listing the RWD car's range.
  //  3. vPIC writes the sedan's own composite, "EQS450+ 4MATIC", for MY2024–25
  //     CG2EB cars, which are 4MATICs. Those rows list that spelling too, or
  //     the plus rule would reject the /vin/ page's own decode.
  //
  // EPA: every figure below was re-read from fueleconomy.gov's REST records
  // on 2026-08-25, id by id. Two holes it has, both verified against its own
  // menu API rather than assumed: it carries NO MY2023 EQE record of either
  // body, and of the MY2023 EQS only the 450 4MATIC sedan and the three SUVs
  // — so the MY2023 450+, 580 and AMG sedans below carry the unchanged MY2022
  // certification forward, marked agg, and the MY2023 AMG EQE carries no
  // range at all.
  //
  // Recalls: NHTSA's per-campaign text and its vehicle-level index, both read
  // 2026-08-25. A campaign appears on a row only where the index lists that
  // body and year, or where the campaign's own summary names it outright.
  // ---------------------------------------------------------------------

  // EQE sedan — the 500 4MATIC's second year. The 2023 row above stops at
  // 2023 because MY2024 re-rated 260 → 298.
  {
    id: "eqe-2024-500-4matic",
    make: "MERCEDES-BENZ",
    model: "EQE",
    modelAliases: ["EQE 500", "EQE Sedan"],
    modelYears: [2024, 2024],
    trim: ["EQE 500 4MATIC", "EQE 500"],
    drive: "AWD",
    wmi: ["W1K"],
    battery: MB_EQE_PACK_906,
    range: { epaRangeMi: f(298, "mfr", "high", "MY2024 EQE 500 4MATIC, EPA", epa(47460)) },
    charging: MB_EQE_CHG,
    thermal: MB_HP_SED,
    warranty: MB_EQE_W,
    buyerNotes: [NOTE_EQE_STEER_25V533, NOTE_MB_AVAS_25V366],
  },

  // AMG EQE sedan, MY2023 — the launch year. No range: fueleconomy.gov has
  // no MY2023 EQE certification of any trim, and unlike the 350/500 rows
  // above there is no Mercedes-sourced announced figure to put in its place.
  {
    id: "eqe-2023-amg",
    abstains: {
      epaRangeMi:
        "EPA published no MY2023 AMG EQE certification (verified against fueleconomy.gov's own menu API, which carries no MY2023 EQE record of any trim), and no Mercedes document stating an announced figure for this car could be read — the MY2024 car's 230 mi belongs to the MY2024 car",
    },
    make: "MERCEDES-BENZ",
    model: "EQE AMG",
    // Bare "EQE" is admitted here, unlike on the MY2024 AMG row, because
    // every live MY2023 AMG listing files that way and names AMG in the trim
    // instead — and a trim-less "EQE" listing still cannot land here, since
    // trimMatches refuses a trim-keyed row an absent trim.
    modelAliases: ["AMG EQE", "AMG EQE Sedan", "EQE"],
    modelYears: [2023, 2023],
    // "AMG EQE 4MATIC+" is Mercedes' own full name and the spelling 12 live
    // listings use; without it the one-sided-plus rule rejects them outright.
    trim: ["AMG EQE", "AMG EQE 4MATIC", "AMG EQE 4MATIC+"],
    drive: "AWD",
    wmi: ["W1K"],
    battery: MB_EQE_PACK_906,
    charging: MB_EQE_CHG,
    thermal: MB_HP_SED_EARLY,
    warranty: MB_EQE_W,
    buyerNotes: [NOTE_EQS_DRIVE_23V405, NOTE_EQE_ROOF_23V555, NOTE_MB_FUSE_24V115],
  },

  // AMG EQE sedan, MY2025–26. One certification, carried by both years
  // (48382 and 49678 rate identically at 220 mi).
  {
    id: "eqe-2025-26-amg",
    make: "MERCEDES-BENZ",
    model: "EQE AMG",
    modelAliases: ["AMG EQE", "AMG EQE Sedan", "EQE"],
    modelYears: [2025, 2026],
    trim: ["AMG EQE", "AMG EQE 4MATIC", "AMG EQE 4MATIC+"],
    drive: "AWD",
    wmi: ["W1K"],
    battery: {
      packUsableKwh: f(90.6, "agg", "low", "The AMG kept the pre-refresh 90.6 kWh pack while the MY2025 refresh moved the 350+ to 96 kWh; Mercedes' per-VIN Part 565 filings read 90.60 for the MY2026 AMG EQE SUV, and no MY2025–26 AMG sedan VIN filing was available to read"),
    },
    range: { epaRangeMi: f(220, "mfr", "high", "MY2025 and MY2026 AMG EQE (EPA model string “AMG EQE 4matic Plus”), EPA — ids 48382 and 49678 rate identically", epa(48382)) },
    charging: MB_EQE_CHG,
    thermal: MB_HP_SED,
    warranty: MB_EQE_W,
  },

  // EQE SUV — the 500 4MATIC's second and final year.
  {
    id: "eqe-suv-2024-500-4matic",
    make: "MERCEDES-BENZ",
    model: "EQE SUV",
    modelAliases: ["EQE", "EQE 500"],
    modelYears: [2024, 2024],
    trim: ["EQE 500 4MATIC", "500 SUV", "EQE 500"],
    drive: "AWD",
    wmi: ["4JG"],
    battery: MB_EQE_PACK_906,
    range: { epaRangeMi: f(282, "mfr", "high", "MY2024 EQE 500 4MATIC SUV, EPA", epa(47849)) },
    charging: MB_EQE_CHG,
    thermal: MB_HP_EQE_SUV,
    warranty: MB_EQE_W,
    buyerNotes: [NOTE_MB_BMS_24V372, NOTE_MB_AVAS_25V366],
  },

  // AMG EQE SUV. The sedan AMG rows file the same trim strings; the wmi key
  // is the whole of what separates them.
  {
    id: "eqe-suv-2024-amg",
    make: "MERCEDES-BENZ",
    model: "EQE AMG SUV",
    modelAliases: ["AMG EQE SUV", "EQE AMG", "AMG EQE", "EQE"],
    modelYears: [2024, 2024],
    trim: ["AMG EQE", "AMG EQE 4MATIC", "AMG EQE 4MATIC+"],
    drive: "AWD",
    wmi: ["4JG"],
    battery: MB_EQE_PACK_906,
    range: { epaRangeMi: f(235, "mfr", "high", "MY2024 AMG EQE SUV (EPA model string “AMG EQE 4matic Plus (SUV)”), EPA", epa(46971)) },
    charging: MB_EQE_CHG,
    thermal: MB_HP_EQE_SUV,
    warranty: MB_EQE_W,
    buyerNotes: [NOTE_MB_BMS_24V372, NOTE_MB_AVAS_25V366],
  },

  // AMG EQE SUV, split by year rather than spanning 2025–26 on one row.
  // Both years carry the same 230-mi certification (48393 and 49686), so the
  // split buys nothing on the facts — it is the recalls. 24V372 stops at
  // MY2025 and 25V366 at MY2025, and NHTSA does return MY2026 rows for other
  // Mercedes campaigns, so the absence is real rather than a gap in the
  // index. A spanning row would have rendered both headlines on the MY2026
  // car — including a "trap"-severity battery recall — and the year caveat
  // that would have corrected it lives in the note body, which the report
  // never shows: EnrichmentReport renders the headline alone.
  {
    id: "eqe-suv-2025-amg",
    make: "MERCEDES-BENZ",
    model: "EQE AMG SUV",
    modelAliases: ["AMG EQE SUV", "EQE AMG", "AMG EQE", "EQE"],
    modelYears: [2025, 2025],
    trim: ["AMG EQE", "AMG EQE 4MATIC", "AMG EQE 4MATIC+"],
    drive: "AWD",
    wmi: ["4JG"],
    battery: { packUsableKwh: f(90.6, "vin", "high", "Mercedes' per-VIN Part 565 submissions read 90.60 kWh for the MY2026 AMG EQE SUV — the pre-refresh pack, which the AMG kept when the 320+ moved to 96 kWh") },
    range: { epaRangeMi: f(230, "mfr", "high", "MY2025 AMG EQE SUV, EPA — the MY2026 car (id 49686) rates identically", epa(48393)) },
    charging: MB_EQE_CHG,
    thermal: MB_HP_EQE_SUV,
    warranty: MB_EQE_W,
    buyerNotes: [NOTE_MB_BMS_24V372, NOTE_MB_AVAS_25V366],
  },

  {
    id: "eqe-suv-2026-amg",
    make: "MERCEDES-BENZ",
    model: "EQE AMG SUV",
    modelAliases: ["AMG EQE SUV", "EQE AMG", "AMG EQE", "EQE"],
    modelYears: [2026, 2026],
    trim: ["AMG EQE", "AMG EQE 4MATIC", "AMG EQE 4MATIC+"],
    drive: "AWD",
    wmi: ["4JG"],
    battery: { packUsableKwh: f(90.6, "vin", "high", "Mercedes' per-VIN Part 565 submissions read 90.60 kWh for the MY2026 AMG EQE SUV — the pre-refresh pack, which the AMG kept when the 320+ moved to 96 kWh") },
    range: { epaRangeMi: f(230, "mfr", "high", "MY2026 AMG EQE SUV, EPA — unchanged from MY2025 (id 48393)", epa(49686)) },
    charging: MB_EQE_CHG,
    thermal: MB_HP_EQE_SUV,
    warranty: MB_EQE_W,
  },

  // EQE 320+ SUV — the RWD half of the MY2026 rename. The MY2026 SUV row
  // above is the 4MATIC only, and MY2027 carries the same certification
  // (50661, also 302 mi), so the window runs to 2027.
  {
    id: "eqe-suv-2026-27-320-plus",
    make: "MERCEDES-BENZ",
    model: "EQE SUV",
    modelAliases: ["EQE", "EQE 320+", "EQE 320+ SUV"],
    modelYears: [2026, 2027],
    trim: "EQE320+",
    drive: "RWD",
    wmi: ["4JG"],
    battery: { packUsableKwh: f(96, "vin", "high", "Mercedes' per-VIN Part 565 submissions read 96.00 kWh for the MY2026 EQE320+ SUV — the larger pack the RWD cars took at the refresh, against 90.5 on the 4MATIC") },
    range: { epaRangeMi: f(302, "mfr", "high", "MY2026 and MY2027 EQE 320+ SUV, EPA — ids 49684 and 50661 rate identically", epa(49684)) },
    charging: MB_EQE_CHG,
    thermal: MB_HP_EQE_SUV,
    warranty: MB_EQE_W,
  },

  // EQE 320 4MATIC SUV, MY2027. The MY2026 row above stops at 2026 on
  // purpose: EPA has certified no MY2027 EQE 320 4MATIC of either body (its
  // menu API lists exactly three MY2027 Mercedes EQ records, and this is not
  // one of them). MY2025 and MY2026 agree at 253, but this cohort has already
  // been re-rated once inside its own generation — 265 in 2024, then 253 —
  // so carrying 253 forward would be a guess about whether it moved again.
  // The car is real (41 MY2027 4JG GM1CB VINs in the vPIC cache) and the rest
  // of what a shopper needs about it is not in doubt, so the row exists and
  // says nothing about range rather than not existing at all.
  {
    id: "eqe-suv-2027-320-4matic",
    abstains: {
      epaRangeMi:
        "EPA has published no MY2027 EQE 320 4MATIC certification of either body, and this cohort has already been re-rated once inside its own generation (265 mi in 2024, then 253 in 2025 and 2026), so a carried-forward figure would be a guess about whether it moved again",
    },
    make: "MERCEDES-BENZ",
    model: "EQE SUV",
    modelAliases: ["EQE", "EQE 320"],
    modelYears: [2027, 2027],
    trim: ["EQE320 4MATIC", "EQE 320 4MATIC"],
    drive: "AWD",
    wmi: ["4JG"],
    battery: { packUsableKwh: f(90.5, "agg", "low", "The MY2026 EQE320 4MATIC SUV files 90.5 kWh per VIN under Part 565 and MBUSA's spec page states the same; the MY2027 filings carry no pack figure to check it against") },
    charging: MB_EQE_CHG,
    thermal: MB_HP_EQE_SUV,
    warranty: MB_EQE_W,
  },

  // -------------------------------------------------------------------
  // EQS sedan (W1K). MY2022 is 450+ and 580 4MATIC only; the 450 4MATIC
  // arrives for MY2023, and the MY2025 refresh replaces the 107.8 kWh pack
  // with 118 kWh — worth 38 miles on the 450+, which is why no figure is
  // carried across that year.
  // -------------------------------------------------------------------
  {
    id: "eqs-2022-450-plus",
    make: "MERCEDES-BENZ",
    model: "EQS",
    modelAliases: ["EQS Sedan", "EQS 450+", "EQS 450+ Sedan"],
    modelYears: [2022, 2022],
    // The plus-less "EQS 450" spelling is safe on THIS row and only this row:
    // MY2022 had no EQS 450 4MATIC at all (EPA certified two EQS sedans that
    // year, the 450+ and the 580, and no 4MATIC 450 VIN exists in the vPIC
    // cache), so there is no sibling for the exact-trim pass to take a "450"
    // listing away from. Never copy it onto a year where both exist.
    trim: ["EQS 450+", "EQS 450"],
    drive: "RWD",
    wmi: ["W1K"],
    battery: MB_EQS_PACK_1078,
    range: { epaRangeMi: f(350, "mfr", "high", "MY2022 EQS 450+, EPA", epa(44785)) },
    charging: MB_EQS_CHG,
    thermal: MB_HP_SED_EARLY,
    warranty: MB_EQS_W,
    buyerNotes: [NOTE_EQS_BMS_23V309, NOTE_MB_AVAS_25V366, NOTE_EQS_STEERWHEEL_22V189],
  },

  {
    id: "eqs-2023-450-plus",
    make: "MERCEDES-BENZ",
    model: "EQS",
    modelAliases: ["EQS Sedan", "EQS 450+", "EQS 450+ Sedan"],
    modelYears: [2023, 2023],
    trim: "EQS 450+",
    drive: "RWD",
    wmi: ["W1K"],
    battery: MB_EQS_PACK_1078,
    range: { epaRangeMi: f(350, "agg", "medium", "MY2023 carries the unchanged MY2022 certification (350 mi, id 44785); fueleconomy.gov's own menu API lists no MY2023 EQS 450+ record, and the MY2024 car re-rated to 352", epa(44785)) },
    charging: MB_EQS_CHG,
    thermal: MB_HP_SED_EARLY,
    warranty: MB_EQS_W,
    buyerNotes: [NOTE_MB_FUSE_TWO_ROUNDS, NOTE_MB_AVAS_25V366],
  },

  {
    id: "eqs-2024-450-plus",
    make: "MERCEDES-BENZ",
    model: "EQS",
    modelAliases: ["EQS Sedan", "EQS 450+", "EQS 450+ Sedan"],
    modelYears: [2024, 2024],
    trim: "EQS 450+",
    drive: "RWD",
    wmi: ["W1K"],
    battery: MB_EQS_PACK_1078,
    range: { epaRangeMi: f(352, "mfr", "high", "MY2024 EQS 450+, EPA", epa(47463)) },
    charging: MB_EQS_CHG,
    thermal: MB_HP_SED,
    warranty: MB_EQS_W,
    buyerNotes: [NOTE_MB_BMS_24V372, NOTE_MB_AVAS_25V366],
  },

  {
    id: "eqs-2025-26-450-plus",
    make: "MERCEDES-BENZ",
    model: "EQS",
    modelAliases: ["EQS Sedan", "EQS 450+", "EQS 450+ Sedan"],
    modelYears: [2025, 2026],
    trim: "EQS 450+",
    drive: "RWD",
    wmi: ["W1K"],
    battery: MB_EQS_PACK_118,
    range: { epaRangeMi: f(390, "mfr", "high", "MY2025 and MY2026 EQS 450+ on the 118 kWh pack, EPA — ids 48388 and 49681 rate identically", epa(48388)) },
    charging: MB_EQS_CHG,
    thermal: MB_HP_SED,
    warranty: MB_EQS_W,
    buyerNotes: [NOTE_EQS_NEXTGEN],
  },

  {
    id: "eqs-2023-450-4matic",
    make: "MERCEDES-BENZ",
    model: "EQS",
    modelAliases: ["EQS Sedan", "EQS 450", "EQS 450 Sedan"],
    modelYears: [2023, 2023],
    trim: ["EQS 450 4MATIC", "EQS450+ 4MATIC"],
    drive: "AWD",
    wmi: ["W1K"],
    battery: MB_EQS_PACK_1078,
    range: { epaRangeMi: f(340, "mfr", "high", "MY2023 EQS 450 4MATIC, EPA", epa(46009)) },
    charging: MB_EQS_CHG,
    thermal: MB_HP_SED_EARLY,
    warranty: MB_EQS_W,
    buyerNotes: [NOTE_MB_FUSE_TWO_ROUNDS, NOTE_MB_AVAS_25V366],
  },

  {
    id: "eqs-2024-450-4matic",
    make: "MERCEDES-BENZ",
    model: "EQS",
    modelAliases: ["EQS Sedan", "EQS 450", "EQS 450 Sedan"],
    modelYears: [2024, 2024],
    trim: ["EQS 450 4MATIC", "EQS450+ 4MATIC"],
    drive: "AWD",
    wmi: ["W1K"],
    battery: MB_EQS_PACK_1078,
    range: { epaRangeMi: f(345, "mfr", "high", "MY2024 EQS 450 4MATIC, EPA", epa(47462)) },
    charging: MB_EQS_CHG,
    thermal: MB_HP_SED,
    warranty: MB_EQS_W,
    buyerNotes: [NOTE_MB_BMS_24V372, NOTE_MB_AVAS_25V366],
  },

  // MY2026 is already covered by eqs-2026-450-4matic above (the same 367-mi
  // certification, id 49683), so this row stops at 2025 rather than
  // duplicating it.
  {
    id: "eqs-2025-450-4matic",
    make: "MERCEDES-BENZ",
    model: "EQS",
    modelAliases: ["EQS Sedan", "EQS 450", "EQS 450 Sedan"],
    modelYears: [2025, 2025],
    trim: ["EQS 450 4MATIC", "EQS450+ 4MATIC"],
    drive: "AWD",
    wmi: ["W1K"],
    battery: MB_EQS_PACK_118,
    range: { epaRangeMi: f(367, "mfr", "high", "MY2025 EQS 450 4MATIC on the 118 kWh pack, EPA", epa(48387)) },
    charging: MB_EQS_CHG,
    thermal: MB_HP_SED,
    warranty: MB_EQS_W,
    buyerNotes: [NOTE_EQS_NEXTGEN],
  },

  {
    id: "eqs-2022-580-4matic",
    make: "MERCEDES-BENZ",
    model: "EQS",
    modelAliases: ["EQS Sedan", "EQS 580", "EQS 580 Sedan"],
    modelYears: [2022, 2022],
    trim: "EQS 580 4MATIC",
    drive: "AWD",
    wmi: ["W1K"],
    battery: MB_EQS_PACK_1078,
    range: { epaRangeMi: f(340, "mfr", "high", "MY2022 EQS 580 4MATIC, EPA", epa(45023)) },
    charging: MB_EQS_CHG,
    thermal: MB_HP_SED_EARLY,
    warranty: MB_EQS_W,
    buyerNotes: [NOTE_MB_AVAS_25V366],
  },

  {
    id: "eqs-2023-580-4matic",
    make: "MERCEDES-BENZ",
    model: "EQS",
    modelAliases: ["EQS Sedan", "EQS 580", "EQS 580 Sedan"],
    modelYears: [2023, 2023],
    trim: "EQS 580 4MATIC",
    drive: "AWD",
    wmi: ["W1K"],
    battery: MB_EQS_PACK_1078,
    range: { epaRangeMi: f(340, "agg", "medium", "MY2023 carries the unchanged MY2022 certification (340 mi, id 45023); fueleconomy.gov's own menu API lists no MY2023 EQS 580 record, and the MY2024 car re-rated to 345", epa(45023)) },
    charging: MB_EQS_CHG,
    thermal: MB_HP_SED_EARLY,
    warranty: MB_EQS_W,
    buyerNotes: [NOTE_MB_FUSE_TWO_ROUNDS, NOTE_MB_AVAS_25V366],
  },

  {
    id: "eqs-2024-580-4matic",
    make: "MERCEDES-BENZ",
    model: "EQS",
    modelAliases: ["EQS Sedan", "EQS 580", "EQS 580 Sedan"],
    modelYears: [2024, 2024],
    trim: "EQS 580 4MATIC",
    drive: "AWD",
    wmi: ["W1K"],
    battery: MB_EQS_PACK_1078,
    range: { epaRangeMi: f(345, "mfr", "high", "MY2024 EQS 580 4MATIC, EPA", epa(47464)) },
    charging: MB_EQS_CHG,
    thermal: MB_HP_SED,
    warranty: MB_EQS_W,
    buyerNotes: [NOTE_MB_BMS_24V372],
  },

  {
    id: "eqs-2025-26-580-4matic",
    make: "MERCEDES-BENZ",
    model: "EQS",
    modelAliases: ["EQS Sedan", "EQS 580", "EQS 580 Sedan"],
    modelYears: [2025, 2026],
    trim: "EQS 580 4MATIC",
    drive: "AWD",
    wmi: ["W1K"],
    battery: MB_EQS_PACK_118,
    range: { epaRangeMi: f(371, "mfr", "high", "MY2025 and MY2026 EQS 580 4MATIC on the 118 kWh pack, EPA — ids 48389 and 49682 rate identically", epa(48389)) },
    charging: MB_EQS_CHG,
    thermal: MB_HP_SED,
    warranty: MB_EQS_W,
    buyerNotes: [NOTE_EQS_NEXTGEN],
  },

  // AMG EQS sedan. Mercedes' own name is AMG EQS 53 4MATIC+, and dealers
  // spell it a dozen ways; the plus-bearing spellings are listed explicitly
  // because trimMatches refuses a one-sided plus.
  {
    id: "eqs-2022-amg",
    make: "MERCEDES-BENZ",
    model: "EQS AMG",
    modelAliases: ["AMG EQS", "AMG EQS Sedan", "EQS"],
    modelYears: [2022, 2022],
    trim: ["AMG EQS", "AMG EQS 4MATIC+", "AMG EQS 53 4MATIC+"],
    drive: "AWD",
    wmi: ["W1K"],
    battery: MB_EQS_PACK_1078,
    range: { epaRangeMi: f(277, "mfr", "high", "MY2022 AMG EQS (EPA model string “AMG EQS 4matic Plus”), EPA", epa(46330)) },
    charging: MB_EQS_CHG,
    thermal: MB_HP_SED_EARLY,
    warranty: MB_EQS_W,
    buyerNotes: [NOTE_EQS_DRIVE_23V405, NOTE_EQS_STEERWHEEL_22V189],
  },

  {
    id: "eqs-2023-amg",
    make: "MERCEDES-BENZ",
    model: "EQS AMG",
    modelAliases: ["AMG EQS", "AMG EQS Sedan", "EQS"],
    modelYears: [2023, 2023],
    trim: ["AMG EQS", "AMG EQS 4MATIC+", "AMG EQS 53 4MATIC+"],
    drive: "AWD",
    wmi: ["W1K"],
    battery: MB_EQS_PACK_1078,
    range: { epaRangeMi: f(277, "agg", "medium", "MY2023 carries the unchanged MY2022 certification (277 mi, id 46330); fueleconomy.gov's own menu API lists no MY2023 AMG EQS record, and the MY2024 car re-rated to 305", epa(46330)) },
    charging: MB_EQS_CHG,
    thermal: MB_HP_SED_EARLY,
    warranty: MB_EQS_W,
    buyerNotes: [NOTE_EQS_DRIVE_23V405, NOTE_MB_FUSE_24V115],
  },

  {
    id: "eqs-2024-amg",
    make: "MERCEDES-BENZ",
    model: "EQS AMG",
    modelAliases: ["AMG EQS", "AMG EQS Sedan", "EQS"],
    modelYears: [2024, 2024],
    trim: ["AMG EQS", "AMG EQS 4MATIC+", "AMG EQS 53 4MATIC+"],
    drive: "AWD",
    wmi: ["W1K"],
    battery: MB_EQS_PACK_1078,
    range: { epaRangeMi: f(305, "mfr", "high", "MY2024 AMG EQS (EPA model string “AMG EQS 4matic Plus”), EPA", epa(47461)) },
    charging: MB_EQS_CHG,
    thermal: MB_HP_SED,
    warranty: MB_EQS_W,
    buyerNotes: [NOTE_MB_FUSE_24V115, NOTE_MB_BMS_24V372],
  },

  {
    id: "eqs-2025-amg",
    make: "MERCEDES-BENZ",
    model: "EQS AMG",
    modelAliases: ["AMG EQS", "AMG EQS Sedan", "EQS"],
    modelYears: [2025, 2025],
    trim: ["AMG EQS", "AMG EQS 4MATIC+", "AMG EQS 53 4MATIC+"],
    drive: "AWD",
    wmi: ["W1K"],
    battery: MB_EQS_PACK_118,
    range: { epaRangeMi: f(315, "mfr", "high", "MY2025 AMG EQS on the 118 kWh pack, EPA", epa(48386)) },
    charging: MB_EQS_CHG,
    thermal: MB_HP_SED,
    warranty: MB_EQS_W,
    buyerNotes: [NOTE_EQS_NEXTGEN],
  },

  // -------------------------------------------------------------------
  // EQS SUV (4JG). Same badges as the sedan, different car: the MY2023 450+
  // SUV is 305 mi against the sedan's 350, and the MY2026 450 4MATIC badge
  // means 312 mi on this body against 367 on the sedan. Only the WMI tells
  // them apart, which is why every row here carries it.
  // -------------------------------------------------------------------
  {
    id: "eqs-suv-2023-450-plus",
    make: "MERCEDES-BENZ",
    model: "EQS SUV",
    modelAliases: ["EQS", "EQS 450+", "EQS 450+ SUV"],
    modelYears: [2023, 2023],
    trim: "EQS 450+",
    drive: "RWD",
    wmi: ["4JG"],
    battery: MB_EQS_PACK_1078,
    range: { epaRangeMi: f(305, "mfr", "high", "MY2023 EQS 450+ SUV, EPA", epa(46011)) },
    charging: MB_EQS_CHG,
    thermal: MB_HP_EQS_SUV,
    warranty: MB_EQS_W,
    buyerNotes: [NOTE_MB_BMS_24V372, NOTE_MB_AVAS_25V366],
  },

  {
    id: "eqs-suv-2024-450-plus",
    make: "MERCEDES-BENZ",
    model: "EQS SUV",
    modelAliases: ["EQS", "EQS 450+", "EQS 450+ SUV"],
    modelYears: [2024, 2024],
    trim: "EQS 450+",
    drive: "RWD",
    wmi: ["4JG"],
    battery: MB_EQS_PACK_1078,
    range: { epaRangeMi: f(339, "mfr", "high", "MY2024 EQS 450+ SUV, EPA", epa(47847)) },
    charging: MB_EQS_CHG,
    thermal: MB_HP_EQS_SUV,
    warranty: MB_EQS_W,
    buyerNotes: [NOTE_MB_BMS_24V372, NOTE_MB_AVAS_25V366],
  },

  // The 450+ SUV's last year — EPA certifies no RWD EQS SUV for MY2026 or
  // MY2027, so this row does not run past 2025.
  {
    id: "eqs-suv-2025-450-plus",
    make: "MERCEDES-BENZ",
    model: "EQS SUV",
    modelAliases: ["EQS", "EQS 450+", "EQS 450+ SUV"],
    modelYears: [2025, 2025],
    trim: "EQS 450+",
    drive: "RWD",
    wmi: ["4JG"],
    battery: MB_EQS_PACK_118,
    range: { epaRangeMi: f(323, "mfr", "high", "MY2025 EQS 450+ SUV on the 118 kWh pack, EPA", epa(48392)) },
    charging: MB_EQS_CHG,
    thermal: MB_HP_EQS_SUV,
    warranty: MB_EQS_W,
    buyerNotes: [NOTE_MB_BMS_24V372, NOTE_MB_AVAS_25V366, NOTE_EQS_NEXTGEN],
  },

  {
    id: "eqs-suv-2023-450-4matic",
    make: "MERCEDES-BENZ",
    model: "EQS SUV",
    modelAliases: ["EQS", "EQS 450", "EQS 450 SUV"],
    modelYears: [2023, 2023],
    trim: ["EQS 450 4MATIC", "EQS450+ 4MATIC"],
    drive: "AWD",
    wmi: ["4JG"],
    battery: MB_EQS_PACK_1078,
    range: { epaRangeMi: f(285, "mfr", "high", "MY2023 EQS 450 4MATIC SUV, EPA", epa(46010)) },
    charging: MB_EQS_CHG,
    thermal: MB_HP_EQS_SUV,
    warranty: MB_EQS_W,
    buyerNotes: [NOTE_MB_BMS_24V372, NOTE_MB_AVAS_25V366],
  },

  {
    id: "eqs-suv-2024-450-4matic",
    make: "MERCEDES-BENZ",
    model: "EQS SUV",
    modelAliases: ["EQS", "EQS 450", "EQS 450 SUV"],
    modelYears: [2024, 2024],
    trim: ["EQS 450 4MATIC", "EQS450+ 4MATIC"],
    drive: "AWD",
    wmi: ["4JG"],
    battery: MB_EQS_PACK_1078,
    range: { epaRangeMi: f(330, "mfr", "high", "MY2024 EQS 450 4MATIC SUV, EPA", epa(47850)) },
    charging: MB_EQS_CHG,
    thermal: MB_HP_EQS_SUV,
    warranty: MB_EQS_W,
    buyerNotes: [NOTE_MB_BMS_24V372, NOTE_MB_AVAS_25V366],
  },

  // The rename row: sold as EQS 450 4MATIC SUV in MY2025, certified as
  // EQS 400 4matic (SUV) from MY2026 — and Mercedes' own MY2026 VIN filings
  // still read EQS450 4MATIC, so dealers write both. All three years carry
  // the same 312-mi certification (48395 / 49688 / 50662).
  {
    id: "eqs-suv-2025-27-400-4matic",
    make: "MERCEDES-BENZ",
    model: "EQS SUV",
    modelAliases: ["EQS", "EQS 400 SUV", "EQS 450 SUV", "EQS 400", "EQS 450"],
    modelYears: [2025, 2027],
    trim: ["EQS 450 4MATIC", "EQS 400 4MATIC", "EQS450+ 4MATIC"],
    drive: "AWD",
    wmi: ["4JG"],
    battery: MB_EQS_PACK_118,
    range: { epaRangeMi: f(312, "mfr", "high", "MY2025–2027 EQS 400 4MATIC SUV (sold as EQS 450 4MATIC SUV in MY2025) on the 118 kWh pack, EPA — ids 48395, 49688 and 50662 rate identically", epa(49688)) },
    charging: MB_EQS_CHG,
    thermal: MB_HP_EQS_SUV,
    warranty: MB_EQS_W,
    buyerNotes: [NOTE_EQS_NEXTGEN],
  },

  {
    id: "eqs-suv-2023-580-4matic",
    make: "MERCEDES-BENZ",
    model: "EQS SUV",
    modelAliases: ["EQS", "EQS 580", "EQS 580 SUV"],
    modelYears: [2023, 2023],
    trim: "EQS 580 4MATIC",
    drive: "AWD",
    wmi: ["4JG"],
    battery: MB_EQS_PACK_1078,
    range: { epaRangeMi: f(285, "mfr", "high", "MY2023 EQS 580 4MATIC SUV, EPA", epa(46012)) },
    charging: MB_EQS_CHG,
    thermal: MB_HP_EQS_SUV,
    warranty: MB_EQS_W,
    buyerNotes: [NOTE_MB_BMS_24V372, NOTE_MB_FUSE_TWO_ROUNDS, NOTE_MB_AVAS_25V366],
  },

  {
    id: "eqs-suv-2024-580-4matic",
    make: "MERCEDES-BENZ",
    model: "EQS SUV",
    modelAliases: ["EQS", "EQS 580", "EQS 580 SUV"],
    modelYears: [2024, 2024],
    trim: "EQS 580 4MATIC",
    drive: "AWD",
    wmi: ["4JG"],
    battery: MB_EQS_PACK_1078,
    range: { epaRangeMi: f(330, "mfr", "high", "MY2024 EQS 580 4MATIC SUV, EPA", epa(47851)) },
    charging: MB_EQS_CHG,
    thermal: MB_HP_EQS_SUV,
    warranty: MB_EQS_W,
    buyerNotes: [NOTE_MB_BMS_24V372, NOTE_MB_AVAS_25V366],
  },

  // The other half of the rename: EQS 580 4MATIC SUV in MY2025, certified as
  // EQS 550 4matic (SUV) from MY2026, one 317-mi figure across all three
  // years (48396 / 49689 / 50663). Bare "EQS 580" is deliberately NOT an
  // alias here — the sedan wears that model string in the same years.
  {
    id: "eqs-suv-2025-27-550-4matic",
    make: "MERCEDES-BENZ",
    model: "EQS SUV",
    modelAliases: ["EQS", "EQS 550 SUV", "EQS 580 SUV", "EQS 550"],
    modelYears: [2025, 2027],
    trim: ["EQS 580 4MATIC", "EQS 550 4MATIC"],
    drive: "AWD",
    wmi: ["4JG"],
    battery: MB_EQS_PACK_118,
    range: { epaRangeMi: f(317, "mfr", "high", "MY2025–2027 EQS 550 4MATIC SUV (sold as EQS 580 4MATIC SUV in MY2025) on the 118 kWh pack, EPA — ids 48396, 49689 and 50663 rate identically", epa(49689)) },
    charging: MB_EQS_CHG,
    thermal: MB_HP_EQS_SUV,
    warranty: MB_EQS_W,
    buyerNotes: [NOTE_EQS_NEXTGEN],
  },

  // Mercedes-Maybach EQS 680 SUV. MY2024 carries TWO certifications, 280 mi
  // and 321 mi (ids 47465 and 47852), and nothing in the VIN, the listing or
  // EPA's own record says which configuration a given car is. Printing
  // either would be picking one; printing the lower would be the "quote the
  // lowest" rule this project ratified and then reversed the same day. The
  // buyer note names both and says what settles it.
  {
    id: "eqs-suv-2024-maybach-680",
    abstains: {
      epaRangeMi:
        "EPA carries two MY2024 certifications for this vehicle, 280 mi and 321 mi (ids 47465 and 47852), and no VIN position, listing field or EPA record distinguishes the two configurations — both figures are in the buyer note instead",
    },
    make: "MERCEDES-BENZ",
    model: "EQS SUV",
    modelAliases: ["EQS", "Maybach EQS SUV", "Mercedes-Maybach EQS", "Mercedes-Maybach EQS SUV"],
    modelYears: [2024, 2024],
    trim: ["Mercedes-Maybach EQS 680", "Maybach EQS680 4MATIC", "EQS680 4MATIC"],
    drive: "AWD",
    wmi: ["4JG"],
    battery: MB_EQS_PACK_1078,
    charging: MB_EQS_CHG,
    thermal: MB_HP_EQS_SUV,
    warranty: MB_EQS_W,
    buyerNotes: [
      {
        headline: "Two different EPA ratings exist for this model year, 280 mi and 321 mi",
        body: "EPA holds two MY2024 Maybach EQS 680 SUV certifications, 280 mi (id 47465) and 321 mi (id 47852). Nothing in the VIN or a dealer listing says which one a given car is; the window sticker or the door-jamb EPA label names the figure this car was actually rated at.",
        severity: "warning",
      },
      NOTE_MB_BMS_24V372,
    ],
  },

  {
    id: "eqs-suv-2025-maybach-680",
    make: "MERCEDES-BENZ",
    model: "EQS SUV",
    modelAliases: ["EQS", "Maybach EQS SUV", "Mercedes-Maybach EQS", "Mercedes-Maybach EQS SUV"],
    modelYears: [2025, 2025],
    trim: ["Mercedes-Maybach EQS 680", "Maybach EQS680 4MATIC", "EQS680 4MATIC"],
    drive: "AWD",
    wmi: ["4JG"],
    battery: MB_EQS_PACK_118,
    range: { epaRangeMi: f(302, "mfr", "high", "MY2025 Maybach EQS 680 SUV, EPA — one certification this year, unlike MY2024's two", epa(48397)) },
    charging: MB_EQS_CHG,
    thermal: MB_HP_EQS_SUV,
    warranty: MB_EQS_W,
    buyerNotes: [NOTE_MB_BMS_24V372, NOTE_EQS_NEXTGEN],
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
    abstains: { heatPump: "GM does not name cabin-heating hardware in its own vehicle documents - even the Blazer EV owner manual, whose press release touts the Ultium heat pump, never says the words. The control test is the 2027 Bolt, whose GM press release DOES name one: GM states it when it means to, so silence on the other cars is evidence rather than an omission. These rows previously asserted `standard` from the platform-wide Ultium claim plus a trade-press writeup - the same source class that produced the falsified Volvo heat-pump claim. Owner decision 2026-08-26: abstain." },
    battery: { packGrossKwh: f(85, "mfr", "high") },
    range: { epaRangeMi: f(317, "mfr", "high", "2026 and 2027 Optiq RWD, EPA (identical both years)", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("NACS", "mfr", "high", "Cadillac's own Optiq specs page: “J3400 (NACS)”, native NACS, unlike the CCS1-native pattern used by Escalade IQ/Sierra EV/Silverado EV/Lyriq"),
      superchargerAccess: f("native", "mfr", "high", "Charge port is NACS natively, no adapter needed for Superchargers; a GM-approved adapter is instead needed for CCS/J1772 chargers"),
      dcPeakKw: f(150, "mfr", "high", "Cadillac's own Optiq specs page: 150 kW peak, up to 81 mi added in ~10 min"),
    },
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
    abstains: { heatPump: "GM does not name cabin-heating hardware in its own vehicle documents - even the Blazer EV owner manual, whose press release touts the Ultium heat pump, never says the words. The control test is the 2027 Bolt, whose GM press release DOES name one: GM states it when it means to, so silence on the other cars is evidence rather than an omission. These rows previously asserted `standard` from the platform-wide Ultium claim plus a trade-press writeup - the same source class that produced the falsified Volvo heat-pump claim. Owner decision 2026-08-26: abstain." },
    battery: { packGrossKwh: f(85, "mfr", "high", "Cadillac's own Optiq specs page (cadillac.com); AWD adds a second motor, not a different pack, per the RWD/AWD EPA records sharing the same platform family") },
    range: { epaRangeMi: f(303, "mfr", "high", "2027 Optiq AWD, EPA", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("NACS", "mfr", "high", "Cadillac's own Optiq specs page: “J3400 (NACS)”, native NACS, unlike the CCS1-native pattern used by Escalade IQ/Sierra EV/Silverado EV/Lyriq"),
      superchargerAccess: f("native", "mfr", "high", "Charge port is NACS natively, no adapter needed for Superchargers; a GM-approved adapter is instead needed for CCS/J1772 chargers"),
      dcPeakKw: f(150, "mfr", "high", "Cadillac's own Optiq specs page: 150 kW peak, up to 81 mi added in ~10 min"),
    },
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
    abstains: { heatPump: "GM does not name cabin-heating hardware in its own vehicle documents - even the Blazer EV owner manual, whose press release touts the Ultium heat pump, never says the words. The control test is the 2027 Bolt, whose GM press release DOES name one: GM states it when it means to, so silence on the other cars is evidence rather than an omission. These rows previously asserted `standard` from the platform-wide Ultium claim plus a trade-press writeup - the same source class that produced the falsified Volvo heat-pump claim. Owner decision 2026-08-26: abstain.",  epaRangeMi: "No EPA rating exists: NHTSA's VIN decode puts this in GVWR Class 3, above EPA's labelling threshold, and fueleconomy.gov has no record under either nameplate; Cadillac's own figure is an estimate and stays in the buyer note" },
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
    abstains: { heatPump: "GM does not name cabin-heating hardware in its own vehicle documents - even the Blazer EV owner manual, whose press release touts the Ultium heat pump, never says the words. The control test is the 2027 Bolt, whose GM press release DOES name one: GM states it when it means to, so silence on the other cars is evidence rather than an omission. These rows previously asserted `standard` from the platform-wide Ultium claim plus a trade-press writeup - the same source class that produced the falsified Volvo heat-pump claim. Owner decision 2026-08-26: abstain.",  epaRangeMi: "No EPA rating exists: NHTSA's VIN decode puts this in GVWR Class 3, above EPA's labelling threshold, and fueleconomy.gov has no record under either nameplate; Cadillac's own figure is an estimate and stays in the buyer note" },
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


  // ─────────────────────────── GMC SIERRA EV ───────────────────────────────
  //
  // 969 live listings, 773 of which showed NO RANGE until 2026-08-28, and the
  // cause was not research: both rows below already carried the right EPA
  // figures. They carried no VIN key and no trim key, so every Sierra EV
  // matched BOTH of them, came back as `candidates`, and rendered as a
  // 283-410 spread instead of a number — while the listing's own trim string
  // said "Elevation Standard Range" in 373 cases and "Elevation Extended
  // Range" in 338. The site was declining to answer a question the feed had
  // already answered. Worse, each row carried a note reading "This listing
  // doesn't say which battery pack this Elevation trim has", which was false
  // for 629 of the 773 and is deleted below.
  //
  // THE VIN, NOT THE TRIM STRING, and here it matters more than usual. The
  // trim strings are a mess — "Elevation Standard Range", "Standard Range
  // Elevation", "Elevation STD Range", "Elevation 14", "e4wd Elevation
  // Extended Range", "Elevation Premium Extended Range", 35 bare "Elevation"
  // and 10 with no trim at all — and a substring rule over that set is how
  // the Lyriq V-Series row once swallowed 878 ordinary Lyriqs. Positions 4-8
  // say it exactly, on every VIN, whatever the dealer typed.
  //
  // THE POSITION-6 TRAP, which cost a wrong cohort and is why these rows are
  // keyed on a FIVE-character descriptor rather than on `vin8` alone. Swept
  // across positions 4, 6 and 8 on 2026-08-28, every character:
  //
  //   position 4  1 or 4, GVWR code; no effect on trim, pack or motor
  //   position 6  S/T Elevation, U/V AT4, W/X/Y Denali — and vPIC reports its
  //               `Trim` field from THIS POSITION ALONE
  //   position 8  H = EWX / 14-MOD, D = ETI / 20-MOD, L = ETN / 24-MOD
  //
  // vPIC's Trim string embeds a module count ("Elevation 14", "Denali 20",
  // "AT4 24") and that count is a property of position 6, not of the pack the
  // van actually has: feed position 6 = S with position 8 = L and vPIC still
  // answers "Elevation 14" while its own OtherEngineInfo reads 24-MOD. It
  // decodes each position independently and never cross-checks them, so the
  // sweep manufactures combinations no real truck has. Every one of the ten
  // descriptors actually present in the live feed IS self-consistent — pos 6's
  // nominal pack always equals pos 8's — so the honest key is the PAIR, which
  // a five-character `vds` prefix pins in one field. A row keyed on vPIC's
  // Trim string, or on position 8 alone, would be keyed on half the evidence.
  // (Same class as the vPIC constant-field trap that put "98 kWh" on every
  // Lightning: control-test two cohorts that must differ before cohorting.)
  //
  // RANGE IS PER TRIM AS WELL AS PER PACK, which one row per pack could not
  // have expressed. GMC's own FAQ enumerates all seven configurations:
  //
  //   Elevation Standard  283  EPA-estimated      Denali Standard  283  EPA
  //   Elevation Extended  410  EPA-estimated      Denali Extended  410  EPA
  //   AT4       Extended  390  GM-estimated       Denali Max       478  GM-est
  //   AT4       Max       478  GM-estimated
  //
  // The AT4 is the one that makes the point: same 20-module pack as the
  // Elevation, 20 fewer miles, because it is the off-road trim. A single
  // "extended range = 410" row would have overclaimed by 20 miles on all 29
  // of them. THREE of the seven have no EPA rating at all — EPA's own record
  // list for the 2026 Sierra EV holds Std Range and two Ext Range entries and
  // nothing for Max Range — so those three carry `mfrRangeMi` (lib/types.ts),
  // the field added the same day for the BrightDrop vans, and render as "478
  // mi est" rather than as nothing.
  //
  // NO `trim` KEY ON ANY OF THESE, and the reason is a trap worth naming: on
  // a VIN-keyed row a trim key is not belt-and-braces, it is a VETO.
  // `trimMatches` (match.ts) returns false when the LISTING carries no trim —
  // deliberately, so a blank-trim listing cannot pick up an arbitrary row —
  // and it runs in the row filter BEFORE the vds filter. So a row carrying
  // both keys is unreachable for exactly the listings the VIN was added to
  // rescue. Measured: with `trim` set alongside `vds`, 19 Sierra EVs whose
  // descriptor named their pack exactly still matched nothing, every one of
  // them a listing whose trim field was blank or said only "Denali". The vds
  // already pins the trim family — that is what position 6 is — so the trim
  // key bought nothing and cost those 19.
  //
  // THE 19 kW CHARGER, recorded here because it is the one thing on this
  // nameplate that is not fully resolved. EPA lists the Extended Range twice —
  // "SIERRA EV Ext Range (11kW Charger)" at 410 miles and "(19kW Charger)" at
  // 385 — and nothing in the VIN says which onboard charger a truck has
  // (checked: vPIC's full decode for these VINs carries no charging-module
  // field, unlike its pack RPO). GMC's own consumer FAQ publishes 410 for the
  // Elevation and the Denali with no charger qualifier, so 410 is the figure
  // for the standard configuration and that is what these rows print — the
  // rule this file already settled for range-varies-by-wheel-size. It stays a
  // row `note`, which renders only on hover, rather than a buyer note: a
  // shopper cannot act on "one of two EPA records may apply to your truck".
  //
  // MY2024 AND MY2025 LIVE IN data4.ts, under ids spelled `sierraev-` rather
  // than `sierra-ev-`, which is why a grep for this file's ids does not find
  // them — worth knowing before adding a row here for either year. That block
  // was keyed on the dealer's trim string because it had concluded position 8
  // was unreliable; its control test turns out to have compared a TRIM across
  // model years rather than a pack, and the correction (with the three VINs
  // that settle it) is written up there. Those rows now carry `vds` keys of
  // the same shape as these — 401EL, 10MED, 40LEL.
  {
    id: "sierra-ev-2026-elevation-standard",
    make: "GMC",
    model: "Sierra EV",
    modelYears: [2026, 2026],
    vds: ["1ESEH", "4ESEH"],
    drive: "AWD",
    packVariant: "Standard Range",
    abstains: { heatPump: SIERRA_HP_ABSTAIN },
    battery: { packGrossKwh: f(120, "agg", "low", SIERRA_PACK_NOTE) },
    range: { epaRangeMi: f(283, "mfr", "high", "Elevation, Standard Range (14-module) pack", epa(49660)) },
    charging: SIERRA_CHARGING_STD,
    warranty: SIERRA_WARRANTY,
    buyerNotes: SIERRA_RECALLS,
  },

  {
    id: "sierra-ev-2026-elevation-extended",
    make: "GMC",
    model: "Sierra EV",
    modelYears: [2026, 2026],
    vds: ["1ETED", "4ETED"],
    drive: "AWD",
    packVariant: "Extended Range",
    abstains: { heatPump: SIERRA_HP_ABSTAIN },
    battery: { packGrossKwh: f(170, "agg", "low", SIERRA_PACK_NOTE) },
    range: { epaRangeMi: f(410, "mfr", "high", CHARGER_NOTE, epa(49658)) },
    charging: SIERRA_CHARGING_EXT,
    warranty: SIERRA_WARRANTY,
    buyerNotes: SIERRA_RECALLS,
  },

  {
    id: "sierra-ev-2026-denali-standard",
    make: "GMC",
    model: "Sierra EV",
    modelYears: [2026, 2026],
    vds: ["1EWEH", "4EWEH"],
    drive: "AWD",
    packVariant: "Standard Range",
    abstains: { heatPump: SIERRA_HP_ABSTAIN },
    battery: { packGrossKwh: f(120, "agg", "low", SIERRA_PACK_NOTE) },
    range: { epaRangeMi: f(283, "mfr", "high", "Denali, Standard Range (14-module) pack", epa(49660)) },
    charging: SIERRA_CHARGING_STD,
    warranty: SIERRA_WARRANTY,
    buyerNotes: SIERRA_RECALLS,
  },

  {
    id: "sierra-ev-2026-denali-extended",
    make: "GMC",
    model: "Sierra EV",
    modelYears: [2026, 2026],
    vds: ["1EXED", "4EXED"],
    drive: "AWD",
    packVariant: "Extended Range",
    abstains: { heatPump: SIERRA_HP_ABSTAIN },
    battery: { packGrossKwh: f(170, "agg", "low", SIERRA_PACK_NOTE) },
    range: { epaRangeMi: f(410, "mfr", "high", CHARGER_NOTE, epa(49658)) },
    charging: SIERRA_CHARGING_EXT,
    warranty: SIERRA_WARRANTY,
    buyerNotes: SIERRA_RECALLS,
  },

  // The three GM-estimated configurations. EPA rated none of them, so these
  // are the rows that would have printed nothing at all before mfrRangeMi.
  {
    id: "sierra-ev-2026-at4-extended",
    make: "GMC",
    model: "Sierra EV",
    modelYears: [2026, 2026],
    vds: ["1EUED", "4EUED"],
    drive: "AWD",
    packVariant: "Extended Range",
    abstains: { heatPump: SIERRA_HP_ABSTAIN },
    battery: { packGrossKwh: f(170, "agg", "low", SIERRA_PACK_NOTE) },
    range: {
      mfrRangeMi: f(390, "mfr", "high", "AT4 Extended Range — the same 20-module pack as the Elevation's 410-mile EPA rating, 20 miles shorter on the off-road trim, and GMC publishes it as its own estimate rather than an EPA figure", GMC_SIERRA),
    },
    charging: SIERRA_CHARGING_EXT,
    warranty: SIERRA_WARRANTY,
    buyerNotes: SIERRA_RECALLS,
  },

  {
    id: "sierra-ev-2026-at4-max",
    make: "GMC",
    model: "Sierra EV",
    modelYears: [2026, 2026],
    vds: ["1EVEL", "4EVEL"],
    drive: "AWD",
    packVariant: "Max Range",
    abstains: { heatPump: SIERRA_HP_ABSTAIN, packUsableKwh: SIERRA_MAX_PACK_ABSTAIN },
    range: { mfrRangeMi: f(478, "mfr", "high", MAX_RANGE_NOTE, GMC_SIERRA) },
    charging: SIERRA_CHARGING_MAX,
    warranty: SIERRA_WARRANTY,
    buyerNotes: SIERRA_RECALLS,
  },

  {
    id: "sierra-ev-2026-denali-max",
    make: "GMC",
    model: "Sierra EV",
    modelYears: [2026, 2026],
    vds: ["1EYEL", "4EYEL"],
    drive: "AWD",
    packVariant: "Max Range",
    abstains: { heatPump: SIERRA_HP_ABSTAIN, packUsableKwh: SIERRA_MAX_PACK_ABSTAIN },
    range: { mfrRangeMi: f(478, "mfr", "high", MAX_RANGE_NOTE, GMC_SIERRA) },
    charging: SIERRA_CHARGING_MAX,
    warranty: SIERRA_WARRANTY,
    buyerNotes: SIERRA_RECALLS,
  },
];
