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
  // Porsche Taycan — 2 in inventory. Both listings carry a compound,
  // ambiguous dealer trim string ("4S / 4S with Performance Pack" for 2020,
  // "Turbo / Turbo S" for 2022). The matcher's trim-substring guard forces
  // an exact match for any trim key under 3 characters, so a short key like
  // "4S" cannot match this dealer's compound string at all — the literal
  // compound string is used as the trim key here, deliberately, and is the
  // only value that will match. For 2022 this compound string genuinely
  // covers two different real cars (Turbo vs Turbo S have different EPA
  // ranges) with no way to tell them apart from this dealer's data, so both
  // are written as separate rows sharing the same trim key — the matcher
  // will present them as honest candidates, same as the Mach-E Premium case.
  //
  // Research finding worth flagging: Porsche's own 2020 and 2022 US Warranty
  // Manual PDFs (read in full, pdftotext) state NO capacity-retention
  // percentage anywhere for the HV battery warranty — the commonly-repeated
  // "70%" figure traces only to dealer-marketing pages, not Porsche's own
  // document. Left absent here rather than asserting an unverified number.
  // ---------------------------------------------------------------------
  {
    id: "taycan-2020-4s",
    make: "PORSCHE",
    model: "Taycan",
    modelYears: [2020, 2020],
    trim: "4S / 4S with Performance Pack",
    drive: "AWD",
    battery: { packGrossKwh: f(93.4, "mfr", "high", "Performance Battery Plus gross capacity (Porsche Newsroom); the only 2020 4S variant EPA-certified — no non-Plus 4S was EPA-listed for MY2020 despite this listing's 'Performance Pack' phrasing", "https://newsroom.porsche.com") },
    range: {
      epaRangeMi: f(203, "mfr", "high", "2020 Taycan 4S, Performance Battery Plus — EPA", "https://www.fueleconomy.gov"),
      testedRangeMi: f(278, "tested", "high", "70-mph steady-state (InsideEVs, largest/widest wheel option): 278 mi — beat EPA by 37%; same test at 14°F: 213 mi. Edmunds reportedly measured 323 mi on a mixed loop but that could not be independently confirmed (Edmunds fetch blocked)"),
    },
    charging: {
      portStandard: f("CCS1", "mfr", "high", "Porsche Newsroom charging page; CCS1 is the US-market implementation"),
      dcPeakKw: f(270, "mfr", "high", "Performance Battery Plus peak — Porsche Newsroom: “up to 270 kW”"),
      architectureV: f(800, "mfr", "high", "Porsche Newsroom: “the first production vehicle with a system voltage of 800 volts”"),
    },
    warranty: {
      batteryYears: f(8, "mfr", "high", "“Eight (8) years or 100,000 miles” — Porsche's own 2020 US Warranty Manual, HV Battery Warranty line item"),
      batteryMiles: f(100_000, "mfr", "high"),
      batteryTransfers: f(true, "mfr", "medium", "Inferred from Porsche's own warranty manual: the warranty clock starts at first retail sale/in-service date and does not reset at resale, and owners are instructed to leave warranty documents in the car when selling. No single explicit “transfers to subsequent owner” sentence was found, unlike VW/Toyota's booklets."),
    },
    buyerNotes: [
      {
        headline: "HV battery module short-circuit recall — check this VIN's status",
        body: "24V731 and 24V732 (2021–2024 Taycan): the HV battery may short internally, fire risk. Interim remedy is an 80% charge cap; final remedy is diagnostic software plus module replacement as needed. These campaigns supersede and expand earlier campaigns 23V840, 24V215, and 24V217. Notices mailed through 2025.",
        severity: "trap",
      },
      {
        headline: "Porsche's own warranty booklet states no capacity-floor percentage",
        body: "Porsche's 2020 US Warranty Manual states the HV battery warranty term (8 yr/100,000 mi) but does not state a minimum capacity-retention percentage anywhere in the document. The 70% figure commonly quoted elsewhere comes from dealer-marketing pages, not Porsche's own booklet.",
        severity: "info",
      },
      {
        headline: "Powertrain-shutdown software recall — already fixed via update",
        body: "21V486 (2020 Taycan): monitoring software could false-fault and shut down the powertrain, causing loss of drive power. Remedy is a free software reprogram; owner notices were mailed July 2021.",
        severity: "info",
      },
    ],
  },

  {
    id: "taycan-2022-turbo",
    make: "PORSCHE",
    model: "Taycan",
    modelYears: [2022, 2022],
    trim: "Turbo / Turbo S",
    drive: "AWD",
    battery: { packGrossKwh: f(93.4, "agg", "medium", "Turbo and Turbo S are widely documented as standard-equipped with the larger Performance Battery Plus pack (93.4 kWh gross per Porsche Newsroom); not independently re-confirmed for these specific trims in this research pass") },
    range: { epaRangeMi: f(212, "mfr", "high", "2022 Taycan Turbo — EPA", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("CCS1", "mfr", "high", "Porsche Newsroom charging page; CCS1 is the US-market implementation"),
      dcPeakKw: f(270, "mfr", "high", "Performance Battery Plus peak — Porsche Newsroom: “up to 270 kW”"),
      architectureV: f(800, "mfr", "high", "Porsche Newsroom: “the first production vehicle with a system voltage of 800 volts”"),
    },
    warranty: {
      batteryYears: f(8, "mfr", "high", "“Eight (8) years or 100,000 miles” — Porsche's own 2022 US Warranty Manual, HV Battery Warranty line item"),
      batteryMiles: f(100_000, "mfr", "high"),
      batteryTransfers: f(true, "mfr", "medium", "Inferred from Porsche's own warranty manual: the warranty clock starts at first retail sale/in-service date and does not reset at resale, and owners are instructed to leave warranty documents in the car when selling. No single explicit “transfers to subsequent owner” sentence was found, unlike VW/Toyota's booklets."),
    },
    buyerNotes: [
      {
        headline: "This listing doesn't say Turbo or Turbo S — the two have different range",
        body: "The dealer's own listing data names this car “Turbo / Turbo S” without picking one. This row assumes Turbo (212 mi EPA); the Turbo S variant is rated 201 mi. Check the window sticker or door-jamb label to confirm which trim this VIN actually is.",
        severity: "warning",
      },
      {
        headline: "HV battery module short-circuit recall family — check this VIN's status",
        body: "23V840, 24V215, and 24V217 (module short-circuit, fire risk, various 2020–2024 Taycan trims including 2022 Turbo/Turbo S) were later superseded and expanded by 24V731 and 24V732. Interim remedy is an 80% charge cap; final remedy is diagnostic software plus module replacement as needed.",
        severity: "trap",
      },
      {
        headline: "Front passenger airbag may not deploy correctly",
        body: "25V221 (2022–2023 Taycan): an occupant-classification error can deactivate the front passenger airbag. Remedy is a free seat-cushion replacement; owner notices mailed November 2025.",
        severity: "warning",
      },
      {
        headline: "Porsche's own warranty booklet states no capacity-floor percentage",
        body: "Porsche's 2022 US Warranty Manual states the HV battery warranty term (8 yr/100,000 mi) but does not state a minimum capacity-retention percentage anywhere in the document. The 70% figure commonly quoted elsewhere comes from dealer-marketing pages, not Porsche's own booklet.",
        severity: "info",
      },
    ],
  },

  {
    id: "taycan-2022-turbo-s",
    make: "PORSCHE",
    model: "Taycan",
    modelYears: [2022, 2022],
    trim: "Turbo / Turbo S",
    drive: "AWD",
    battery: { packGrossKwh: f(93.4, "agg", "medium", "Turbo and Turbo S are widely documented as standard-equipped with the larger Performance Battery Plus pack (93.4 kWh gross per Porsche Newsroom); not independently re-confirmed for these specific trims in this research pass") },
    range: { epaRangeMi: f(201, "mfr", "high", "2022 Taycan Turbo S — EPA", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("CCS1", "mfr", "high", "Porsche Newsroom charging page; CCS1 is the US-market implementation"),
      dcPeakKw: f(270, "mfr", "high", "Performance Battery Plus peak — Porsche Newsroom: “up to 270 kW”"),
      architectureV: f(800, "mfr", "high", "Porsche Newsroom: “the first production vehicle with a system voltage of 800 volts”"),
    },
    warranty: {
      batteryYears: f(8, "mfr", "high", "“Eight (8) years or 100,000 miles” — Porsche's own 2022 US Warranty Manual, HV Battery Warranty line item"),
      batteryMiles: f(100_000, "mfr", "high"),
      batteryTransfers: f(true, "mfr", "medium", "Inferred from Porsche's own warranty manual: the warranty clock starts at first retail sale/in-service date and does not reset at resale, and owners are instructed to leave warranty documents in the car when selling. No single explicit “transfers to subsequent owner” sentence was found, unlike VW/Toyota's booklets."),
    },
    buyerNotes: [
      {
        headline: "This listing doesn't say Turbo or Turbo S — the two have different range",
        body: "The dealer's own listing data names this car “Turbo / Turbo S” without picking one. This row assumes Turbo S (201 mi EPA); the Turbo variant is rated 212 mi. Check the window sticker or door-jamb label to confirm which trim this VIN actually is.",
        severity: "warning",
      },
      {
        headline: "HV battery module short-circuit recall family — check this VIN's status",
        body: "23V840, 24V215, and 24V217 (module short-circuit, fire risk, various 2020–2024 Taycan trims including 2022 Turbo/Turbo S) were later superseded and expanded by 24V731 and 24V732. Interim remedy is an 80% charge cap; final remedy is diagnostic software plus module replacement as needed.",
        severity: "trap",
      },
      {
        headline: "Front passenger airbag may not deploy correctly",
        body: "25V221 (2022–2023 Taycan): an occupant-classification error can deactivate the front passenger airbag. Remedy is a free seat-cushion replacement; owner notices mailed November 2025.",
        severity: "warning",
      },
      {
        headline: "Porsche's own warranty booklet states no capacity-floor percentage",
        body: "Porsche's 2022 US Warranty Manual states the HV battery warranty term (8 yr/100,000 mi) but does not state a minimum capacity-retention percentage anywhere in the document. The 70% figure commonly quoted elsewhere comes from dealer-marketing pages, not Porsche's own booklet.",
        severity: "info",
      },
    ],
  },

  {
    id: "taycan-2023-base-standard-battery",
    make: "PORSCHE",
    model: "Taycan",
    modelYears: [2023, 2023],
    trim: "Taycan",
    drive: "RWD",
    battery: { packGrossKwh: f(79.2, "mfr", "high", "Performance Battery (standard) gross capacity — Porsche Newsroom") },
    range: { epaRangeMi: f(208, "mfr", "high", "2023 base Taycan RWD, Performance Battery (standard pack) — EPA; Performance Battery Plus (optional pack), same trim: 242 mi", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("CCS1", "mfr", "high", "Porsche Newsroom charging page; CCS1 is the US-market implementation"),
      dcPeakKw: f(225, "mfr", "high", "Performance Battery peak — Porsche Newsroom: “up to 225 kW”"),
      architectureV: f(800, "mfr", "high", "Porsche Newsroom: “the first production vehicle with a system voltage of 800 volts”"),
    },
    warranty: {
      batteryYears: f(8, "mfr", "high", "“Eight (8) years or 100,000 miles” — Porsche's own US Warranty Manual, HV Battery Warranty line item"),
      batteryMiles: f(100_000, "mfr", "high"),
      batteryTransfers: f(true, "mfr", "medium", "Inferred from Porsche's own warranty manual: the warranty clock starts at first retail sale/in-service date and does not reset at resale, and owners are instructed to leave warranty documents in the car when selling. No single explicit “transfers to subsequent owner” sentence was found, unlike VW/Toyota's booklets."),
    },
    buyerNotes: [
      {
        headline: "This listing doesn't say which battery pack this base Taycan has",
        body: "The base “Taycan” trim was sold with a buyer's choice of the standard Performance Battery (208 mi EPA, 225 kW peak) or the optional Performance Battery Plus (242 mi EPA, 270 kW peak). Check the window sticker or door-jamb label to confirm which pack this car has.",
        severity: "warning",
      },
      {
        headline: "HV battery module short-circuit recall family — check this VIN's status",
        body: "23V840, 24V215, and 24V217 (module short-circuit, fire risk, various 2020–2024 Taycan trims) were later superseded and expanded by 24V731 and 24V732. Interim remedy is an 80% charge cap; final remedy is diagnostic software plus module replacement as needed.",
        severity: "trap",
      },
      {
        headline: "Porsche's own warranty booklet states no capacity-floor percentage",
        body: "Porsche's US Warranty Manual states the HV battery warranty term (8 yr/100,000 mi) but does not state a minimum capacity-retention percentage anywhere in the document. The 70% figure commonly quoted elsewhere comes from dealer-marketing pages, not Porsche's own booklet.",
        severity: "info",
      },
    ],
  },

  {
    id: "taycan-2023-base-plus-battery",
    make: "PORSCHE",
    model: "Taycan",
    modelYears: [2023, 2023],
    trim: "Taycan",
    drive: "RWD",
    battery: { packGrossKwh: f(93.4, "mfr", "high", "Performance Battery Plus (optional upgrade) gross capacity — Porsche Newsroom") },
    range: { epaRangeMi: f(242, "mfr", "high", "2023 base Taycan RWD, Performance Battery Plus (optional pack) — EPA; standard Performance Battery, same trim: 208 mi", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("CCS1", "mfr", "high", "Porsche Newsroom charging page; CCS1 is the US-market implementation"),
      dcPeakKw: f(270, "mfr", "high", "Performance Battery Plus peak — Porsche Newsroom: “up to 270 kW”"),
      architectureV: f(800, "mfr", "high", "Porsche Newsroom: “the first production vehicle with a system voltage of 800 volts”"),
    },
    warranty: {
      batteryYears: f(8, "mfr", "high", "“Eight (8) years or 100,000 miles” — Porsche's own US Warranty Manual, HV Battery Warranty line item"),
      batteryMiles: f(100_000, "mfr", "high"),
      batteryTransfers: f(true, "mfr", "medium", "Inferred from Porsche's own warranty manual: the warranty clock starts at first retail sale/in-service date and does not reset at resale, and owners are instructed to leave warranty documents in the car when selling. No single explicit “transfers to subsequent owner” sentence was found, unlike VW/Toyota's booklets."),
    },
    buyerNotes: [
      {
        headline: "This listing doesn't say which battery pack this base Taycan has",
        body: "The base “Taycan” trim was sold with a buyer's choice of the standard Performance Battery (208 mi EPA, 225 kW peak) or this optional Performance Battery Plus (242 mi EPA, 270 kW peak). Check the window sticker or door-jamb label to confirm which pack this car has.",
        severity: "warning",
      },
      {
        headline: "HV battery module short-circuit recall family — check this VIN's status",
        body: "23V840, 24V215, and 24V217 (module short-circuit, fire risk, various 2020–2024 Taycan trims) were later superseded and expanded by 24V731 and 24V732. Interim remedy is an 80% charge cap; final remedy is diagnostic software plus module replacement as needed.",
        severity: "trap",
      },
      {
        headline: "Porsche's own warranty booklet states no capacity-floor percentage",
        body: "Porsche's US Warranty Manual states the HV battery warranty term (8 yr/100,000 mi) but does not state a minimum capacity-retention percentage anywhere in the document. The 70% figure commonly quoted elsewhere comes from dealer-marketing pages, not Porsche's own booklet.",
        severity: "info",
      },
    ],
  },

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
  {
    id: "tesla-model-s-2019",
    make: "TESLA",
    model: "Model S",
    modelYears: [2019, 2019],
    drive: "AWD",
    range: { epaRangeMi: f(259, "mfr", "medium", "This listing's exact trim isn't recorded — 259 mi (75D) is the lowest-range 2019 Model S trim, used here as a floor, not a confirmed match. Full 2019 lineup — EPA: 75D 259 / Standard Range 285 / P100D 315 / Performance 21″ 325 / Performance 19″ 345 / 100D 335 / Long Range 370", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("NACS", "mfr", "high", "Tesla's proprietary connector"),
      superchargerAccess: f("native", "mfr", "high"),
    },
    thermal: { heatPump: f("none", "agg", "medium", "Octovalve heat pump arrived with the January 2021 Model S/X refresh; pre-refresh cars (through ~end of 2020 production) had resistive heat only — corroborated by NHTSA recall 22V050000, which describes the heat-pump valve hardware as present only on 2021+ cars") },
    warranty: {
      batteryYears: f(8, "mfr", "high", "“8 years or 150,000 miles, whichever comes first” — Tesla's own vehicle-warranty page (archived capture, live page blocked by bot-detection; dated 2025-04-16, ~16 months old relative to today but Tesla's S/X battery terms have historically been stable)"),
      batteryMiles: f(150_000, "mfr", "high", "Model S/X get a higher mileage cap than Model 3/Y — same source"),
      sohFloorPct: f(70, "mfr", "high", "“minimum 70% retention of Battery capacity over the warranty period” — same Tesla warranty page"),
      batteryTransfers: f(true, "mfr", "high", "“Your New Vehicle Limited Warranty will follow your vehicle and be transferred to the new owner when a vehicle ownership transfer is performed through Tesla”; “the balance of original Battery and Drive Unit Limited warranty still applies for used vehicles” — same Tesla warranty page"),
    },
    buyerNotes: [
      {
        headline: "This listing doesn't say which 2019 Model S trim this is — range varies by up to 111 miles",
        body: "Tesla sold seven distinct EPA-rated configurations in 2019 (75D 259 mi up to Long Range 370 mi). This scraped listing has no trim field. Check the car's window sticker, door-jamb EPA label, or the Tesla owner account tied to this VIN to confirm the actual trim before trusting a specific range figure.",
        severity: "warning",
      },
      {
        headline: "Hood secondary latch and power-steering recalls — already fixed via update",
        body: "21V00B (2019 Model S: front trunk latch may be misaligned, secondary latch may not engage, hood could open unexpectedly) and 22V818 (electric power steering may lose assist on rough roads). Both remedied by free dealer service or OTA update; owner notices already mailed.",
        severity: "info",
      },
    ],
  },

  {
    id: "tesla-model-s-2023",
    make: "TESLA",
    model: "Model S",
    modelYears: [2023, 2023],
    drive: "AWD",
    range: { epaRangeMi: f(405, "mfr", "high", "2023 Model S — the only EPA-certified trim fueleconomy.gov lists for MY2023 (no separate Plaid record that year)", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("NACS", "mfr", "high", "Tesla's proprietary connector"),
      superchargerAccess: f("native", "mfr", "high"),
      dcPeakKw: f(250, "agg", "low", "Tesla's design-studio material cites “up to 250 kW” for current-generation cars; no per-trim primary spec table was located"),
    },
    thermal: { heatPump: f("standard", "agg", "medium", "Octovalve heat pump, standard on all Tesla models since the January 2021 refresh; corroborated by NHTSA recall 22V050000 describing the heat-pump valve hardware") },
    warranty: {
      batteryYears: f(8, "mfr", "high", "“8 years or 150,000 miles, whichever comes first” — Tesla's own vehicle-warranty page (archived capture, dated 2025-04-16)"),
      batteryMiles: f(150_000, "mfr", "high"),
      sohFloorPct: f(70, "mfr", "high", "“minimum 70% retention of Battery capacity over the warranty period”"),
      batteryTransfers: f(true, "mfr", "high", "“Your New Vehicle Limited Warranty will follow your vehicle and be transferred to the new owner when a vehicle ownership transfer is performed through Tesla”"),
    },
    buyerNotes: [
      {
        headline: "Forward camera and seat-belt anchor recalls — check remedy status",
        body: "23V489 (forward camera misalignment can silently disable automatic emergency braking, lane assist, and collision warning — not obvious to the driver); 23V488 (front-row seat belts may not connect properly to pretensioner anchors, can detach). Both remedied by free dealer inspection/repair; owner notices mailed September 2023.",
        severity: "warning",
      },
      {
        headline: "Driver air bag may tear during deployment",
        body: "24V967 (2021–2025 Model S): the driver's air bag could tear during deployment. Free dealer replacement of the air bag assembly; owner notices mailed February 2025.",
        severity: "warning",
      },
    ],
  },

  {
    id: "tesla-model-s-2025",
    make: "TESLA",
    model: "Model S",
    modelYears: [2025, 2025],
    drive: "AWD",
    battery: { packGrossKwh: f(100, "vin", "medium", "vPIC battery-capacity decode on inventory VINs of this year — shared pack size across the base/Long Range and Plaid trims, so this does not by itself indicate which trim") },
    range: { epaRangeMi: f(312, "mfr", "medium", "This listing's exact trim isn't recorded — 312 mi (Plaid, 21″ wheels) is the lowest-range 2025 Model S trim, used here as a floor, not a confirmed match. Full 2025 lineup — EPA: Plaid 21″ 312 / Plaid 19″ 348 / base/Long Range 410", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("NACS", "mfr", "high", "Tesla's proprietary connector"),
      superchargerAccess: f("native", "mfr", "high"),
      dcPeakKw: f(250, "agg", "low", "Tesla's design-studio material cites “up to 250 kW” for current-generation cars; no per-trim primary spec table was located"),
    },
    thermal: { heatPump: f("standard", "agg", "medium", "Octovalve heat pump, standard on all Tesla models since the January 2021 refresh") },
    warranty: {
      batteryYears: f(8, "mfr", "high", "“8 years or 150,000 miles, whichever comes first” — Tesla's own vehicle-warranty page (archived capture, dated 2025-04-16)"),
      batteryMiles: f(150_000, "mfr", "high"),
      sohFloorPct: f(70, "mfr", "high", "“minimum 70% retention of Battery capacity over the warranty period”"),
      batteryTransfers: f(true, "mfr", "high", "“Your New Vehicle Limited Warranty will follow your vehicle and be transferred to the new owner when a vehicle ownership transfer is performed through Tesla”"),
    },
    buyerNotes: [
      {
        headline: "This listing doesn't say which 2025 Model S trim this is — range varies by up to 98 miles",
        body: "The base/Long Range trim is EPA-rated 410 mi; Plaid trades range for performance at 312–348 mi depending on wheel size. This scraped listing has no trim field. Check the window sticker, door-jamb EPA label, or the Tesla owner account tied to this VIN to confirm the actual trim.",
        severity: "warning",
      },
      {
        headline: "Rearview camera and driver air bag recalls — check remedy status",
        body: "25V002 (2025 Model S: computer circuit board may short, losing the rearview camera image — free OTA update plus computer replacement if affected); 24V967 (2021–2025: driver air bag may tear during deployment — free replacement). Owner notices mailed 2025.",
        severity: "warning",
      },
    ],
  },

  {
    id: "tesla-model-x-2017",
    make: "TESLA",
    model: "Model X",
    modelYears: [2017, 2017],
    drive: "AWD",
    range: { epaRangeMi: f(200, "mfr", "medium", "This listing's exact trim isn't recorded — 200 mi (60D) is the lowest-range 2017 Model X trim, used here as a floor, not a confirmed match. Full 2017 lineup — EPA: 60D 200 / 75D 238 / P90D 250 / 90D 257 / P100D 289 / 100D 295", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("NACS", "mfr", "high", "Tesla's proprietary connector"),
      superchargerAccess: f("native", "mfr", "high"),
    },
    thermal: { heatPump: f("none", "agg", "medium", "Octovalve heat pump arrived with the January 2021 Model S/X refresh; 2017 cars have resistive heat only") },
    warranty: {
      batteryYears: f(8, "mfr", "high", "“8 years or 150,000 miles, whichever comes first” — Tesla's own vehicle-warranty page (archived capture, dated 2025-04-16)"),
      batteryMiles: f(150_000, "mfr", "high"),
      sohFloorPct: f(70, "mfr", "high", "“minimum 70% retention of Battery capacity over the warranty period”"),
      batteryTransfers: f(true, "mfr", "high", "“Your New Vehicle Limited Warranty will follow your vehicle and be transferred to the new owner when a vehicle ownership transfer is performed through Tesla”"),
    },
    buyerNotes: [
      {
        headline: "This listing doesn't say which 2017 Model X trim this is — range varies by up to 95 miles",
        body: "Tesla sold six distinct EPA-rated configurations in 2017 (60D 200 mi up to 100D 295 mi). This scraped listing has no trim field. Check the window sticker, door-jamb EPA label, or the Tesla owner account tied to this VIN to confirm the actual trim.",
        severity: "warning",
      },
      {
        headline: "Center display can fail and take rearview camera/turn signals with it",
        body: "21V035 (2016–2018 Model X): the center display's memory chip wears out over time, eventually causing the display to fail — which also takes out the rearview camera image, defrost controls, and turn-signal chime. Free dealer replacement of the display's daughterboard; software 2020.48.48.12+ warns the owner in advance.",
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
    range: { epaRangeMi: f(238, "mfr", "medium", "This listing's exact trim isn't recorded — 238 mi (75D) is the lowest-range 2018 Model X trim, used here as a floor, not a confirmed match. Full 2018 lineup — EPA: 75D 238 / P100D 289 / 100D 295", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("NACS", "mfr", "high", "Tesla's proprietary connector"),
      superchargerAccess: f("native", "mfr", "high"),
    },
    thermal: { heatPump: f("none", "agg", "medium", "Octovalve heat pump arrived with the January 2021 Model S/X refresh; 2018 cars have resistive heat only") },
    warranty: {
      batteryYears: f(8, "mfr", "high", "“8 years or 150,000 miles, whichever comes first” — Tesla's own vehicle-warranty page (archived capture, dated 2025-04-16)"),
      batteryMiles: f(150_000, "mfr", "high"),
      sohFloorPct: f(70, "mfr", "high", "“minimum 70% retention of Battery capacity over the warranty period”"),
      batteryTransfers: f(true, "mfr", "high", "“Your New Vehicle Limited Warranty will follow your vehicle and be transferred to the new owner when a vehicle ownership transfer is performed through Tesla”"),
    },
    buyerNotes: [
      {
        headline: "This listing doesn't say which 2018 Model X trim this is — range varies by up to 57 miles",
        body: "Tesla sold three distinct EPA-rated configurations in 2018 (75D 238 mi up to 100D 295 mi). This scraped listing has no trim field. Check the window sticker, door-jamb EPA label, or the Tesla owner account tied to this VIN to confirm the actual trim.",
        severity: "warning",
      },
      {
        headline: "Center display can fail and take rearview camera/turn signals with it",
        body: "21V035 (2016–2018 Model X): the center display's memory chip wears out over time, eventually causing the display to fail — which also takes out the rearview camera image, defrost controls, and turn-signal chime. Free dealer replacement of the display's daughterboard; software 2020.48.48.12+ warns the owner in advance.",
        severity: "trap",
      },
    ],
  },

  {
    id: "tesla-model-x-2022",
    make: "TESLA",
    model: "Model X",
    modelYears: [2022, 2022],
    drive: "AWD",
    battery: { packGrossKwh: f(100, "vin", "medium", "vPIC battery-capacity decode on inventory VINs of this year — shared pack size across the base/Long Range and Plaid trims, so this does not by itself indicate which trim") },
    range: { epaRangeMi: f(311, "mfr", "medium", "This listing's exact trim isn't recorded — 311 mi (Plaid, 22″ wheels) is the lowest-range 2022 Model X trim, used here as a floor, not a confirmed match. Full 2022 lineup — EPA: Plaid 22″ 311 / Plaid 20″ 333 / base/Long Range 348", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("NACS", "mfr", "high", "Tesla's proprietary connector"),
      superchargerAccess: f("native", "mfr", "high"),
      dcPeakKw: f(250, "agg", "low", "Tesla's design-studio material cites “up to 250 kW” for current-generation cars; no per-trim primary spec table was located"),
    },
    thermal: { heatPump: f("standard", "agg", "medium", "Octovalve heat pump, standard on all Tesla models since the January 2021 refresh") },
    warranty: {
      batteryYears: f(8, "mfr", "high", "“8 years or 150,000 miles, whichever comes first” — Tesla's own vehicle-warranty page (archived capture, dated 2025-04-16)"),
      batteryMiles: f(150_000, "mfr", "high"),
      sohFloorPct: f(70, "mfr", "high", "“minimum 70% retention of Battery capacity over the warranty period”"),
      batteryTransfers: f(true, "mfr", "high", "“Your New Vehicle Limited Warranty will follow your vehicle and be transferred to the new owner when a vehicle ownership transfer is performed through Tesla”"),
    },
    buyerNotes: [
      {
        headline: "This listing doesn't say which 2022 Model X trim this is — range varies by up to 37 miles",
        body: "The base/Long Range trim is EPA-rated 348 mi; Plaid trades range for performance at 311–333 mi depending on wheel size. This scraped listing has no trim field. Check the window sticker, door-jamb EPA label, or the Tesla owner account tied to this VIN.",
        severity: "warning",
      },
      {
        headline: "Side curtain air bags and front passenger air bag recalls — check remedy status",
        body: "22V233 (2021–2022 Model X: front-row side curtain air bags may not deploy correctly with the windows lowered — free dealer replacement of both curtain air bags); 22V843 (2021–2023: front passenger air bag may deploy incorrectly in certain low-speed crashes due to a restraint-control-module calibration issue — free OTA recalibration).",
        severity: "trap",
      },
      {
        headline: "Infotainment computer can overheat during fast-charging prep",
        body: "22V296 (2022 Model X): the infotainment CPU may overheat while preparing for a fast charge, causing lag or a restart that briefly loses the rearview camera, gear indicator, and warning displays. Free OTA thermal-management update.",
        severity: "info",
      },
    ],
  },

  {
    id: "tesla-model-x-2023",
    make: "TESLA",
    model: "Model X",
    modelYears: [2023, 2023],
    drive: "AWD",
    range: { epaRangeMi: f(311, "mfr", "medium", "This listing's exact trim isn't recorded — 311 mi (Plaid, 22″ wheels) is the lowest-range 2023 Model X trim, used here as a floor, not a confirmed match. Full 2023 lineup — EPA: Plaid 22″ 311 / Plaid 20″ 333 / base/Long Range 348", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("NACS", "mfr", "high", "Tesla's proprietary connector"),
      superchargerAccess: f("native", "mfr", "high"),
      dcPeakKw: f(250, "agg", "low", "Tesla's design-studio material cites “up to 250 kW” for current-generation cars; no per-trim primary spec table was located"),
    },
    thermal: { heatPump: f("standard", "agg", "medium", "Octovalve heat pump, standard on all Tesla models since the January 2021 refresh") },
    warranty: {
      batteryYears: f(8, "mfr", "high", "“8 years or 150,000 miles, whichever comes first” — Tesla's own vehicle-warranty page (archived capture, dated 2025-04-16)"),
      batteryMiles: f(150_000, "mfr", "high"),
      sohFloorPct: f(70, "mfr", "high", "“minimum 70% retention of Battery capacity over the warranty period”"),
      batteryTransfers: f(true, "mfr", "high", "“Your New Vehicle Limited Warranty will follow your vehicle and be transferred to the new owner when a vehicle ownership transfer is performed through Tesla”"),
    },
    buyerNotes: [
      {
        headline: "This listing doesn't say which 2023 Model X trim this is — range varies by up to 37 miles",
        body: "The base/Long Range trim is EPA-rated 348 mi; Plaid trades range for performance at 311–333 mi depending on wheel size. This scraped listing has no trim field. Check the window sticker, door-jamb EPA label, or the Tesla owner account tied to this VIN.",
        severity: "warning",
      },
      {
        headline: "Front passenger air bag, seat belt, and brake-fluid-warning recalls — check remedy status",
        body: "22V843 (2021–2023: front passenger air bag may deploy incorrectly in certain low-speed crashes); 23V488 (front-row seat belts may not connect properly to pretensioner anchors, can detach); 23V679 (2021–2023: vehicle controller may fail to warn of low brake fluid). All remedied by free OTA update or dealer repair.",
        severity: "warning",
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
  // Research finding worth flagging: fueleconomy.gov has NO MY2023
  // certification for "EQE 500 4matic" — the identical trim name only
  // exists under MY2024 (298 mi). Used here as the best verified figure
  // for the 2023 listing, with the year mismatch stated explicitly rather
  // than silently carried over.
  // ---------------------------------------------------------------------
  {
    id: "eqe-2023-500-4matic",
    make: "MERCEDES-BENZ",
    model: "EQE",
    modelYears: [2023, 2023],
    trim: "EQE 500 4MATIC",
    drive: "AWD",
    battery: { packUsableKwh: f(90.6, "agg", "low", "Widely reported across aggregators; Mercedes' own press materials (media.mbusa.com) are blocked by bot-detection and could not be independently confirmed for MY2023 specifically") },
    range: { epaRangeMi: f(298, "mfr", "medium", "fueleconomy.gov has no MY2023 record for this trim — the identical trim string “EQE 500 4matic” exists only under MY2024 (298 mi). Used here as the best verified figure; this is a year mismatch, not a confirmed 2023-specific rating", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("CCS1", "agg", "medium"),
      dcPeakKw: f(170, "agg", "low", "Widely reported; not confirmed against a primary Mercedes document for MY2023"),
      architectureV: f(400, "agg", "low", "Reported by secondary sources (electrive.com, autoevolution); not confirmed on a Mercedes primary document — the CCS 500A/400V ceiling matches the 170 kW peak"),
    },
    thermal: { heatPump: f("optional", "agg", "medium", "Mercedes made the heat pump standard on EQE/EQS sedans starting MY2024 — the 2023 sedan likely lacks it unless optioned. (It was already standard on the EQE SUV since MY2023.)") },
    warranty: {
      batteryYears: f(10, "mfr", "high", "10 yr/155,000 mi applies to the whole EQE/EQS family including SUVs — verified against MY25/MY26 EQ booklets"),
      batteryMiles: f(155_000, "mfr", "high"),
      extendedCoverage: f("Floor is stated as a per-pack amp-hour number in Mercedes' own booklet (EQE: 204 Ah), not a percentage. Battery coverage is conditioned on completed scheduled maintenance — a skipped-service history can void it.", "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high", "“To the original and each subsequent owner” — verified MY25/MY26 EQ booklets"),
    },
    buyerNotes: [
      {
        headline: "Fuse-box fire/power-loss recall — two rounds, check which repair this VIN got",
        body: "24V115 (80-Amp fuses manufactured incorrectly, can cause sudden loss of drive power or fire risk): free replacement fuse box. 25V255: some vehicles repaired under 24V115 received the WRONG replacement fuse box, which itself carries increased fire risk — a second free repair. Confirm this VIN got the correct part, not just “a” repair.",
        severity: "trap",
      },
      {
        headline: "Roof-frame absorbers may not be secured — check remedy status",
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
    id: "eqe-2026-320-4matic",
    make: "MERCEDES-BENZ",
    model: "EQE",
    modelYears: [2026, 2026],
    trim: "EQE320 4MATIC",
    drive: "AWD",
    battery: { packUsableKwh: f(90.5, "mfr", "high", "Mercedes-Benz USA's own EQE320 4MATIC spec page") },
    range: {
      epaRangeMi: f(267, "mfr", "high", "2026 EQE320 4MATIC — EPA", "https://www.fueleconomy.gov"),
      testedRangeMi: f(332, "tested", "high", "70-mph highway test (Consumer Reports): 332 mi — beat EPA by ~65 mi"),
    },
    charging: {
      portStandard: f("CCS1", "mfr", "high", "Mercedes-Benz USA spec page: CCS DC port / J1772 AC port"),
      dcPeakKw: f(170, "mfr", "high", "Mercedes-Benz USA spec page: 170 kW peak, 32 min 10–80%"),
    },
    thermal: { heatPump: f("standard", "mfr", "high", "Mercedes-Benz USA spec page lists “Innovative heat pump” as standard") },
    warranty: {
      batteryYears: f(10, "mfr", "high", "10 yr/155,000 mi applies to the whole EQE/EQS family including SUVs — verified against MY25/MY26 EQ booklets"),
      batteryMiles: f(155_000, "mfr", "high"),
      extendedCoverage: f("Floor is stated as a per-pack amp-hour number in Mercedes' own booklet (EQE: 204 Ah), not a percentage. Battery coverage is conditioned on completed scheduled maintenance.", "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high", "“To the original and each subsequent owner” — verified MY25/MY26 EQ booklets"),
    },
    buyerNotes: [
      {
        headline: "No recalls on file yet",
        body: "As of 2026-08-10, NHTSA's recall database returns zero campaigns for the MY2026 EQE320 4MATIC — consistent with this being a brand-new nameplate/model-year introduction.",
        severity: "info",
      },
    ],
  },

  {
    id: "eqe-2026-320-plus-rwd",
    make: "MERCEDES-BENZ",
    model: "EQE",
    modelYears: [2026, 2026],
    trim: "EQE320+",
    drive: "RWD",
    battery: { packUsableKwh: f(96, "mfr", "high", "Mercedes-Benz USA's own EQE320+ spec page") },
    range: { epaRangeMi: f(308, "mfr", "high", "2026 EQE320+ — EPA", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("CCS1", "mfr", "high", "Mercedes-Benz USA spec page"),
      dcPeakKw: f(170, "mfr", "high", "Mercedes-Benz USA spec page"),
    },
    thermal: { heatPump: f("standard", "mfr", "high", "Mercedes-Benz USA spec page lists heat pump as standard") },
    warranty: {
      batteryYears: f(10, "mfr", "high", "10 yr/155,000 mi applies to the whole EQE/EQS family including SUVs — verified against MY25/MY26 EQ booklets"),
      batteryMiles: f(155_000, "mfr", "high"),
      extendedCoverage: f("Floor is stated as a per-pack amp-hour number in Mercedes' own booklet (EQE: 204 Ah), not a percentage. Battery coverage is conditioned on completed scheduled maintenance.", "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high", "“To the original and each subsequent owner” — verified MY25/MY26 EQ booklets"),
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
    modelYears: [2024, 2024],
    trim: "AMG EQE 4MATIC",
    drive: "AWD",
    battery: { packUsableKwh: f(90.6, "agg", "low", "Widely reported by aggregators; corroborated indirectly via Mercedes-Benz USA's current AMG EQE Sedan spec page (same powertrain generation, no evidence of a mid-cycle battery change), but no MY2024-specific primary document was located") },
    range: { epaRangeMi: f(230, "mfr", "high", "2024 AMG EQE 4MATIC (EPA model string “AMG EQE 4matic Plus”) — EPA", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("CCS1", "agg", "medium"),
      dcPeakKw: f(170, "agg", "low", "Widely reported; corroborated indirectly via the current AMG EQE Sedan spec page, not a MY2024-specific primary document"),
    },
    thermal: { heatPump: f("standard", "agg", "medium", "Corroborated via the current AMG EQE Sedan spec page; not a MY2024-specific primary document") },
    warranty: {
      batteryYears: f(10, "mfr", "high", "10 yr/155,000 mi applies to the whole EQE/EQS family including SUVs — verified against MY25/MY26 EQ booklets; reasonably extends to the AMG performance variant of the same platform"),
      batteryMiles: f(155_000, "mfr", "high"),
      extendedCoverage: f("Floor is stated as a per-pack amp-hour number in Mercedes' own booklet (EQE: 204 Ah), not a percentage. Battery coverage is conditioned on completed scheduled maintenance.", "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high", "“To the original and each subsequent owner” — verified MY25/MY26 EQ booklets"),
    },
    buyerNotes: [
      {
        headline: "Battery-management-system software recall — check remedy status",
        body: "24V372 (2024 AMG EQE 53 4MATIC and several other EQE/EQS variants): a BMS software fault may cause the high-voltage battery to shut down, a sudden loss of drive power. Free software update; owner notices mailed July 2024. Note: the separate 24V115 fuse-box recall does NOT apply to this 2024 model year — NHTSA's own vehicle-level index scopes that one to MY2023 only.",
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
    modelYears: [2026, 2026],
    trim: "EQE320 4MATIC",
    drive: "AWD",
    battery: { packUsableKwh: f(90.5, "agg", "medium", "Mercedes-Benz USA's live configurator has already rolled forward past this model year for this SUV nameplate, so a direct MY2026-labeled primary spec page could not be retrieved. Aggregated secondary sources converge on this figure, matching the sedan AWD pack size exactly") },
    range: { epaRangeMi: f(253, "mfr", "high", "2026 EQE SUV, EQE320 4MATIC — EPA", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("CCS1", "agg", "medium"),
      dcPeakKw: f(170, "agg", "low", "Assumed consistent with the EQE sedan family; not independently confirmed for the SUV body style"),
    },
    thermal: { heatPump: f("standard", "agg", "medium", "Standard on the EQE SUV since MY2023; presumed to continue for 2026 but not independently re-verified for this specific model year") },
    warranty: {
      batteryYears: f(10, "mfr", "high", "10 yr/155,000 mi applies to the whole EQE/EQS family including SUVs — verified against MY25/MY26 EQ booklets"),
      batteryMiles: f(155_000, "mfr", "high"),
      extendedCoverage: f("Floor is stated as a per-pack amp-hour number in Mercedes' own booklet (EQE: 204 Ah), not a percentage. Battery coverage is conditioned on completed scheduled maintenance.", "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high", "“To the original and each subsequent owner” — verified MY25/MY26 EQ booklets"),
    },
    buyerNotes: [
      {
        headline: "No recalls on file yet",
        body: "As of 2026-08-10, NHTSA's recall database returns zero campaigns for the MY2026 EQE SUV 320 4MATIC — consistent with this being a brand-new nameplate/model-year introduction.",
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
    battery: { packUsableKwh: f(118, "mfr", "high", "Mercedes-Benz USA's own EQS450 4MATIC spec page") },
    range: { epaRangeMi: f(367, "mfr", "high", "2026 EQS450 4MATIC — EPA", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("CCS1", "mfr", "high", "Mercedes-Benz USA spec page"),
      dcPeakKw: f(200, "mfr", "high", "Mercedes-Benz USA spec page: 200 kW peak, 31 min 10–80%"),
      architectureV: f(400, "agg", "medium", "Not stated explicitly on Mercedes-Benz USA's spec page; independently corroborated by two secondary sources and consistent with the 200 kW DC figure (500A × 400V CCS ceiling)"),
    },
    thermal: { heatPump: f("standard", "mfr", "high", "Mercedes-Benz USA spec page lists heat pump as standard") },
    warranty: {
      batteryYears: f(10, "mfr", "high", "10 yr/155,000 mi applies to the whole EQE/EQS family including SUVs — verified against MY25/MY26 EQ booklets"),
      batteryMiles: f(155_000, "mfr", "high"),
      extendedCoverage: f("Floor is stated as a per-pack amp-hour number in Mercedes' own booklet (EQS: 192 Ah), not a percentage. Battery coverage is conditioned on completed scheduled maintenance.", "mfr", "high"),
      batteryTransfers: f(true, "mfr", "high", "“To the original and each subsequent owner” — verified MY25/MY26 EQ booklets"),
    },
    buyerNotes: [
      {
        headline: "This is the current 400V EQS, not the newly-announced next-generation car",
        body: "Mercedes announced an upgraded EQS on an 800V architecture with up to 350 kW DC charging in April 2026 — as of this research it was orderable in Germany only, with no confirmed US on-sale date. This listing's EPA record predates that announcement and matches the existing 400V-architecture car's specs exactly (118 kWh, 367 mi, 200 kW). Don't assume this car has the newer, faster-charging hardware.",
        severity: "info",
      },
      {
        headline: "No recalls on file yet",
        body: "As of 2026-08-10, NHTSA's recall database returns zero campaigns for the MY2026 EQS450 4MATIC — consistent with this being a brand-new nameplate/model-year introduction.",
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
    modelYears: [2026, 2026],
    drive: "AWD",
    battery: { packGrossKwh: f(205, "mfr", "high", "Cadillac's own Escalade IQ specs page (cadillac.com)") },
    range: {
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
