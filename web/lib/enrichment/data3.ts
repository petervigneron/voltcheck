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
  // Ford Mustang Mach-E — 18 in inventory, highest priority.
  // Standard Range pack switched NMC -> LFP mid-MY2023 production; EPA
  // certified both as separate variants (247 mi NMC / 250 mi LFP). Extended
  // Range stayed NMC throughout. 2026 Premium is sold with buyer's choice of
  // either pack — genuinely ambiguous without a kWh hint or window sticker,
  // same shape as the Model Y Fremont/Austin case the matcher already knows
  // how to present as candidates.
  // ---------------------------------------------------------------------
  {
    id: "mache-2023-select-rwd",
    make: "FORD",
    model: "Mustang Mach-E",
    modelYears: [2023, 2023],
    trim: "Select",
    drive: "RWD",
    battery: {
      packUsableKwh: f(72, "vin", "medium", "vPIC battery-capacity decode on inventory VINs of this trim/drive"),
      chemistry: f("NMC", "agg", "low", "Standard Range pack switched cell chemistry from NMC to LFP partway through MY2023 production — see buyer note"),
    },
    range: {
      epaRangeMi: f(250, "mfr", "high", "247 mi (NMC, early-build) / 250 mi (LFP, late-build) — EPA certified both as separate variants for MY2023 Standard Range RWD", "https://www.fueleconomy.gov"),
    },
    charging: {
      portStandard: f("CCS1", "mfr"),
      superchargerAccess: f("adapter", "agg", "medium", "Ford-approved NACS adapter ($200) required for Supercharger access"),
      dcPeakKw: f(115, "agg", "medium", "Standard Range peak; Extended Range packs peak higher"),
    },
    thermal: { heatPump: f("none", "agg", "high", "No heat pump on any 2021–2024 Mach-E (resistive PTC heater only); heat pump became standard starting MY2025") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(70, "mfr", "high", "“Less than 70 percent of…beginning of life capacity…is considered excessive” — Ford Warranty Guide"),
      batteryTransfers: f(true, "mfr", "high", "“If you bought a previously owned…electric vehicle, you are eligible for any remaining warranty coverages” — every Ford MY guide"),
    },
    buyerNotes: [
      {
        headline: "Two unresolved 2023 recalls — check this VIN's status",
        body: "26V417 (rear differential pinion shaft may fracture, 2021–2023 Mach-E): Ford's remedy was not yet available as of the July 2026 interim notice, with a fix anticipated late December 2026. 26V487 (rear quarter-window trim may detach, 2023–2025): remedy not yet available as of the September 2026 interim notice. 25V404 (electronic door latches can stay locked on low battery charge, trapping an occupant, 2021–2025): this one has a free software fix; owner notices mailed September 2025.",
        severity: "trap",
      },
      {
        headline: "Standard Range pack switched cell chemistry mid-2023",
        body: "Ford's Standard Range pack changed from NMC to LFP cells during MY2023 production; EPA certified both as separate variants (247 mi NMC vs 250 mi LFP — functionally the same range). LFP cells tolerate repeated charging to 100% without the added wear NMC cells see. Check the window sticker or ask the seller which chemistry this VIN has.",
        severity: "info",
      },
      {
        headline: "BlueCruise does not transfer to a new owner",
        body: "Ford's own FAQ states BlueCruise plans are VIN-specific and non-transferable; a used Mach-E's remaining BlueCruise time does not carry over from a prior owner.",
        severity: "info",
      },
      {
        headline: "Connected services run 7 years from the warranty start date",
        body: "Ford states connected services are available for a minimum of seven years from the vehicle's new-vehicle warranty start date; for a 2023 model that typically means service ends around 2030.",
        severity: "info",
      },
    ],
  },

  {
    id: "mache-2023-premium-rwd",
    make: "FORD",
    model: "Mustang Mach-E",
    modelYears: [2023, 2023],
    trim: "Premium",
    drive: "RWD",
    battery: {
      packUsableKwh: f(72, "vin", "medium", "vPIC battery-capacity decode on inventory VINs of this trim/drive"),
      chemistry: f("NMC", "agg", "low", "Standard Range pack switched cell chemistry from NMC to LFP partway through MY2023 production — see buyer note"),
    },
    range: {
      epaRangeMi: f(250, "mfr", "high", "247 mi (NMC, early-build) / 250 mi (LFP, late-build) — EPA certified both as separate variants for MY2023 Standard Range RWD", "https://www.fueleconomy.gov"),
    },
    charging: {
      portStandard: f("CCS1", "mfr"),
      superchargerAccess: f("adapter", "agg", "medium", "Ford-approved NACS adapter ($200) required for Supercharger access"),
      dcPeakKw: f(115, "agg", "medium", "Standard Range peak; Extended Range packs peak higher"),
    },
    thermal: { heatPump: f("none", "agg", "high", "No heat pump on any 2021–2024 Mach-E (resistive PTC heater only); heat pump became standard starting MY2025") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(70, "mfr", "high", "“Less than 70 percent of…beginning of life capacity…is considered excessive” — Ford Warranty Guide"),
      batteryTransfers: f(true, "mfr", "high", "“If you bought a previously owned…electric vehicle, you are eligible for any remaining warranty coverages” — every Ford MY guide"),
    },
    buyerNotes: [
      {
        headline: "Two unresolved 2023 recalls — check this VIN's status",
        body: "26V417 (rear differential pinion shaft may fracture, 2021–2023 Mach-E): Ford's remedy was not yet available as of the July 2026 interim notice, with a fix anticipated late December 2026. 26V487 (rear quarter-window trim may detach, 2023–2025): remedy not yet available as of the September 2026 interim notice. 25V404 (electronic door latches can stay locked on low battery charge, trapping an occupant, 2021–2025): this one has a free software fix; owner notices mailed September 2025.",
        severity: "trap",
      },
      {
        headline: "Standard Range pack switched cell chemistry mid-2023",
        body: "Ford's Standard Range pack changed from NMC to LFP cells during MY2023 production; EPA certified both as separate variants (247 mi NMC vs 250 mi LFP — functionally the same range). LFP cells tolerate repeated charging to 100% without the added wear NMC cells see. Check the window sticker or ask the seller which chemistry this VIN has.",
        severity: "info",
      },
      {
        headline: "BlueCruise does not transfer to a new owner",
        body: "Ford's own FAQ states BlueCruise plans are VIN-specific and non-transferable; a used Mach-E's remaining BlueCruise time does not carry over from a prior owner.",
        severity: "info",
      },
      {
        headline: "Connected services run 7 years from the warranty start date",
        body: "Ford states connected services are available for a minimum of seven years from the vehicle's new-vehicle warranty start date; for a 2023 model that typically means service ends around 2030.",
        severity: "info",
      },
    ],
  },

  {
    id: "mache-2023-premium-awd",
    make: "FORD",
    model: "Mustang Mach-E",
    modelYears: [2023, 2023],
    trim: "Premium",
    drive: "AWD",
    battery: {
      packUsableKwh: f(72, "vin", "medium", "vPIC battery-capacity decode on inventory VINs of this trim/drive"),
      chemistry: f("NMC", "agg", "low", "Standard Range pack switched cell chemistry from NMC to LFP partway through MY2023 production — see buyer note"),
    },
    range: { epaRangeMi: f(224, "mfr", "high", "MY2023 Standard Range AWD — EPA", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("CCS1", "mfr"),
      superchargerAccess: f("adapter", "agg", "medium", "Ford-approved NACS adapter ($200) required for Supercharger access"),
      dcPeakKw: f(115, "agg", "medium", "Standard Range peak; Extended Range packs peak higher"),
    },
    thermal: { heatPump: f("none", "agg", "high", "No heat pump on any 2021–2024 Mach-E (resistive PTC heater only); heat pump became standard starting MY2025") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(70, "mfr", "high", "“Less than 70 percent of…beginning of life capacity…is considered excessive” — Ford Warranty Guide"),
      batteryTransfers: f(true, "mfr", "high", "“If you bought a previously owned…electric vehicle, you are eligible for any remaining warranty coverages” — every Ford MY guide"),
    },
    buyerNotes: [
      {
        headline: "Two unresolved 2023 recalls — check this VIN's status",
        body: "26V417 (rear differential pinion shaft may fracture, 2021–2023 Mach-E): Ford's remedy was not yet available as of the July 2026 interim notice, with a fix anticipated late December 2026. 26V487 (rear quarter-window trim may detach, 2023–2025): remedy not yet available as of the September 2026 interim notice. 25V404 (electronic door latches can stay locked on low battery charge, trapping an occupant, 2021–2025): this one has a free software fix; owner notices mailed September 2025.",
        severity: "trap",
      },
      {
        headline: "BlueCruise does not transfer to a new owner",
        body: "Ford's own FAQ states BlueCruise plans are VIN-specific and non-transferable; a used Mach-E's remaining BlueCruise time does not carry over from a prior owner.",
        severity: "info",
      },
      {
        headline: "Connected services run 7 years from the warranty start date",
        body: "Ford states connected services are available for a minimum of seven years from the vehicle's new-vehicle warranty start date; for a 2023 model that typically means service ends around 2030.",
        severity: "info",
      },
    ],
  },

  {
    id: "mache-2023-california-route-1-awd",
    make: "FORD",
    model: "Mustang Mach-E",
    modelYears: [2023, 2023],
    trim: "California Route 1",
    drive: "AWD",
    battery: { packUsableKwh: f(91, "vin", "medium", "vPIC battery-capacity decode on inventory VINs of this trim; Extended Range pack, NMC cells throughout (no LFP switch on this pack)"), chemistry: f("NMC", "agg", "medium") },
    range: { epaRangeMi: f(312, "mfr", "high", "MY2023 California Route 1 Extended Range AWD — EPA", "https://www.fueleconomy.gov"), testedRangeMi: f(287, "tested", "medium", "70-mph (InsideEVs, 2021 CA Rt1 RWD, prior-gen same nameplate/pack family): 287 mi; Edmunds loop (2021): 305") },
    charging: {
      portStandard: f("CCS1", "mfr"),
      superchargerAccess: f("adapter", "agg", "medium", "Ford-approved NACS adapter ($200) required for Supercharger access"),
      dcPeakKw: f(150, "agg", "medium", "Extended Range peak"),
    },
    thermal: { heatPump: f("none", "agg", "high", "No heat pump on any 2021–2024 Mach-E (resistive PTC heater only); heat pump became standard starting MY2025") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(70, "mfr", "high", "“Less than 70 percent of…beginning of life capacity…is considered excessive” — Ford Warranty Guide"),
      batteryTransfers: f(true, "mfr", "high", "“If you bought a previously owned…electric vehicle, you are eligible for any remaining warranty coverages” — every Ford MY guide"),
    },
    buyerNotes: [
      {
        headline: "Two unresolved 2023 recalls — check this VIN's status",
        body: "26V417 (rear differential pinion shaft may fracture, 2021–2023 Mach-E): Ford's remedy was not yet available as of the July 2026 interim notice, with a fix anticipated late December 2026. 26V487 (rear quarter-window trim may detach, 2023–2025): remedy not yet available as of the September 2026 interim notice. 25V404 (electronic door latches can stay locked on low battery charge, trapping an occupant, 2021–2025): this one has a free software fix; owner notices mailed September 2025.",
        severity: "trap",
      },
      {
        headline: "BlueCruise does not transfer to a new owner",
        body: "Ford's own FAQ states BlueCruise plans are VIN-specific and non-transferable; a used Mach-E's remaining BlueCruise time does not carry over from a prior owner.",
        severity: "info",
      },
      {
        headline: "Connected services run 7 years from the warranty start date",
        body: "Ford states connected services are available for a minimum of seven years from the vehicle's new-vehicle warranty start date; for a 2023 model that typically means service ends around 2030.",
        severity: "info",
      },
    ],
  },

  {
    id: "mache-2026-select-rwd",
    make: "FORD",
    model: "Mustang Mach-E",
    modelYears: [2026, 2026],
    trim: "Select",
    drive: "RWD",
    battery: { packUsableKwh: f(73, "agg", "medium", "Standard Range pack; Select is Standard-Range-only, no Extended option"), chemistry: f("LFP", "agg", "medium", "Standard Range pack has used LFP cells since the MY2023 running change") },
    range: { epaRangeMi: f(260, "mfr", "high", "MY2026 Standard Range RWD — EPA", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("CCS1", "agg", "medium", "Sources conflict on whether MY2025–26 switched to a native NACS port; the more specific ones (Ford's own adapter language, dedicated charging-guide writeups) describe an adapter still being required, consistent with CCS1 retained — treat as unresolved, not native NACS, until a Ford spec sheet is read directly"),
      superchargerAccess: f("adapter", "agg", "medium", "Ford-approved NACS adapter ($200) required for Supercharger access"),
      dcPeakKw: f(115, "agg", "medium", "Standard Range peak; Extended Range packs peak higher"),
    },
    thermal: { heatPump: f("standard", "agg", "high", "Heat pump standard across all Mach-E trims starting MY2025 (multiple independent outlets: Cars.com, Green Car Reports)") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(70, "mfr", "high", "“Less than 70 percent of…beginning of life capacity…is considered excessive” — Ford Warranty Guide"),
      batteryTransfers: f(true, "mfr", "high", "“If you bought a previously owned…electric vehicle, you are eligible for any remaining warranty coverages” — every Ford MY guide"),
    },
    buyerNotes: [
      {
        headline: "Two 2026 recalls — confirm the software fix has been applied",
        body: "25V863 (integrated park module may fail to lock into park, risking rollaway; 2024–2026 Mach-E): remedy is an OTA or dealer software update, owner notices mailed February 2026. 25V885 (Light Driver Control Module B can fail, killing turn signals and headlights; 2025–2026): remedy is an OTA or dealer software update, owner notices mailed January 2026.",
        severity: "warning",
      },
      {
        headline: "BlueCruise does not transfer to a new owner",
        body: "Ford's own FAQ states BlueCruise plans are VIN-specific and non-transferable; a used Mach-E's remaining BlueCruise time does not carry over from a prior owner.",
        severity: "info",
      },
      {
        headline: "Connected services run 7 years from the warranty start date",
        body: "Ford states connected services are available for a minimum of seven years from the vehicle's new-vehicle warranty start date; for a 2026 model that typically means service ends around 2033.",
        severity: "info",
      },
    ],
  },

  {
    id: "mache-2026-premium-rwd-standard",
    make: "FORD",
    model: "Mustang Mach-E",
    modelYears: [2026, 2026],
    trim: "Premium",
    drive: "RWD",
    battery: { packUsableKwh: f(73, "agg", "medium", "Standard Range pack — Premium is sold with buyer's choice of Standard or Extended Range; this row is the Standard-pack variant"), chemistry: f("LFP", "agg", "medium", "Standard Range pack has used LFP cells since the MY2023 running change") },
    range: { epaRangeMi: f(260, "mfr", "high", "MY2026 Premium RWD, Standard Range — EPA", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("CCS1", "agg", "medium", "Sources conflict on whether MY2025–26 switched to a native NACS port; treat as CCS1 + adapter until a Ford spec sheet is read directly"),
      superchargerAccess: f("adapter", "agg", "medium", "Ford-approved NACS adapter ($200) required for Supercharger access"),
      dcPeakKw: f(115, "agg", "medium", "Standard Range peak; Extended Range packs peak higher"),
    },
    thermal: { heatPump: f("standard", "agg", "high", "Heat pump standard across all Mach-E trims starting MY2025 (multiple independent outlets: Cars.com, Green Car Reports)") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(70, "mfr", "high", "“Less than 70 percent of…beginning of life capacity…is considered excessive” — Ford Warranty Guide"),
      batteryTransfers: f(true, "mfr", "high", "“If you bought a previously owned…electric vehicle, you are eligible for any remaining warranty coverages” — every Ford MY guide"),
    },
    buyerNotes: [
      {
        headline: "MY2026 Premium RWD comes with either battery — this listing doesn't say which",
        body: "Ford sells the 2026 Premium RWD with a buyer's choice of a 73 kWh Standard Range pack (260 mi EPA) or an Extended Range pack (320 mi EPA). This row assumes Standard Range; check the window sticker or door-jamb label for the actual EPA rating before trusting the range figure.",
        severity: "warning",
      },
      {
        headline: "Two 2026 recalls — confirm the software fix has been applied",
        body: "25V863 (integrated park module may fail to lock into park, risking rollaway; 2024–2026 Mach-E): remedy is an OTA or dealer software update, owner notices mailed February 2026. 25V885 (Light Driver Control Module B can fail, killing turn signals and headlights; 2025–2026): remedy is an OTA or dealer software update, owner notices mailed January 2026.",
        severity: "warning",
      },
      {
        headline: "Connected services run 7 years from the warranty start date",
        body: "Ford states connected services are available for a minimum of seven years from the vehicle's new-vehicle warranty start date; for a 2026 model that typically means service ends around 2033.",
        severity: "info",
      },
    ],
  },

  {
    id: "mache-2026-premium-rwd-extended",
    make: "FORD",
    model: "Mustang Mach-E",
    modelYears: [2026, 2026],
    trim: "Premium",
    drive: "RWD",
    battery: { packUsableKwh: f(91, "agg", "low", "Extended Range pack — some sources report 88 kWh, some 91; not resolved to a single mfr-published usable figure"), chemistry: f("NMC", "agg", "medium") },
    range: { epaRangeMi: f(320, "mfr", "high", "MY2026 Premium RWD, Extended Range — EPA", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("CCS1", "agg", "medium", "Sources conflict on whether MY2025–26 switched to a native NACS port; treat as CCS1 + adapter until a Ford spec sheet is read directly"),
      superchargerAccess: f("adapter", "agg", "medium", "Ford-approved NACS adapter ($200) required for Supercharger access"),
      dcPeakKw: f(150, "agg", "medium", "Extended Range peak"),
    },
    thermal: { heatPump: f("standard", "agg", "high", "Heat pump standard across all Mach-E trims starting MY2025 (multiple independent outlets: Cars.com, Green Car Reports)") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(70, "mfr", "high", "“Less than 70 percent of…beginning of life capacity…is considered excessive” — Ford Warranty Guide"),
      batteryTransfers: f(true, "mfr", "high", "“If you bought a previously owned…electric vehicle, you are eligible for any remaining warranty coverages” — every Ford MY guide"),
    },
    buyerNotes: [
      {
        headline: "MY2026 Premium RWD comes with either battery — this listing doesn't say which",
        body: "Ford sells the 2026 Premium RWD with a buyer's choice of a 73 kWh Standard Range pack (260 mi EPA) or an Extended Range pack (320 mi EPA). This row assumes Extended Range; check the window sticker or door-jamb label for the actual EPA rating before trusting the range figure.",
        severity: "warning",
      },
      {
        headline: "Two 2026 recalls — confirm the software fix has been applied",
        body: "25V863 (integrated park module may fail to lock into park, risking rollaway; 2024–2026 Mach-E): remedy is an OTA or dealer software update, owner notices mailed February 2026. 25V885 (Light Driver Control Module B can fail, killing turn signals and headlights; 2025–2026): remedy is an OTA or dealer software update, owner notices mailed January 2026.",
        severity: "warning",
      },
      {
        headline: "Connected services run 7 years from the warranty start date",
        body: "Ford states connected services are available for a minimum of seven years from the vehicle's new-vehicle warranty start date; for a 2026 model that typically means service ends around 2033.",
        severity: "info",
      },
    ],
  },

  {
    id: "mache-2026-premium-awd-standard",
    make: "FORD",
    model: "Mustang Mach-E",
    modelYears: [2026, 2026],
    trim: "Premium",
    drive: "AWD",
    battery: { packUsableKwh: f(73, "agg", "medium", "Standard Range pack — Premium is sold with buyer's choice of Standard or Extended Range; this row is the Standard-pack variant"), chemistry: f("LFP", "agg", "medium", "Standard Range pack has used LFP cells since the MY2023 running change") },
    range: { epaRangeMi: f(240, "mfr", "high", "MY2026 Premium AWD, Standard Range — EPA", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("CCS1", "agg", "medium", "Sources conflict on whether MY2025–26 switched to a native NACS port; treat as CCS1 + adapter until a Ford spec sheet is read directly"),
      superchargerAccess: f("adapter", "agg", "medium", "Ford-approved NACS adapter ($200) required for Supercharger access"),
      dcPeakKw: f(115, "agg", "medium", "Standard Range peak; Extended Range packs peak higher"),
    },
    thermal: { heatPump: f("standard", "agg", "high", "Heat pump standard across all Mach-E trims starting MY2025 (multiple independent outlets: Cars.com, Green Car Reports)") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(70, "mfr", "high", "“Less than 70 percent of…beginning of life capacity…is considered excessive” — Ford Warranty Guide"),
      batteryTransfers: f(true, "mfr", "high", "“If you bought a previously owned…electric vehicle, you are eligible for any remaining warranty coverages” — every Ford MY guide"),
    },
    buyerNotes: [
      {
        headline: "MY2026 Premium AWD comes with either battery — this listing doesn't say which",
        body: "Ford sells the 2026 Premium AWD with a buyer's choice of a 73 kWh Standard Range pack (240 mi EPA) or an Extended Range pack (300 mi EPA). This row assumes Standard Range; check the window sticker or door-jamb label for the actual EPA rating before trusting the range figure.",
        severity: "warning",
      },
      {
        headline: "Two 2026 recalls — confirm the software fix has been applied",
        body: "25V863 (integrated park module may fail to lock into park, risking rollaway; 2024–2026 Mach-E): remedy is an OTA or dealer software update, owner notices mailed February 2026. 25V885 (Light Driver Control Module B can fail, killing turn signals and headlights; 2025–2026): remedy is an OTA or dealer software update, owner notices mailed January 2026.",
        severity: "warning",
      },
      {
        headline: "Connected services run 7 years from the warranty start date",
        body: "Ford states connected services are available for a minimum of seven years from the vehicle's new-vehicle warranty start date; for a 2026 model that typically means service ends around 2033.",
        severity: "info",
      },
    ],
  },

  {
    id: "mache-2026-premium-awd-extended",
    make: "FORD",
    model: "Mustang Mach-E",
    modelYears: [2026, 2026],
    trim: "Premium",
    drive: "AWD",
    battery: { packUsableKwh: f(91, "agg", "low", "Extended Range pack — some sources report 88 kWh, some 91; not resolved to a single mfr-published usable figure"), chemistry: f("NMC", "agg", "medium") },
    range: { epaRangeMi: f(300, "mfr", "high", "MY2026 Premium AWD, Extended Range — EPA", "https://www.fueleconomy.gov") },
    charging: {
      portStandard: f("CCS1", "agg", "medium", "Sources conflict on whether MY2025–26 switched to a native NACS port; treat as CCS1 + adapter until a Ford spec sheet is read directly"),
      superchargerAccess: f("adapter", "agg", "medium", "Ford-approved NACS adapter ($200) required for Supercharger access"),
      dcPeakKw: f(150, "agg", "medium", "Extended Range peak"),
    },
    thermal: { heatPump: f("standard", "agg", "high", "Heat pump standard across all Mach-E trims starting MY2025 (multiple independent outlets: Cars.com, Green Car Reports)") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      sohFloorPct: f(70, "mfr", "high", "“Less than 70 percent of…beginning of life capacity…is considered excessive” — Ford Warranty Guide"),
      batteryTransfers: f(true, "mfr", "high", "“If you bought a previously owned…electric vehicle, you are eligible for any remaining warranty coverages” — every Ford MY guide"),
    },
    buyerNotes: [
      {
        headline: "MY2026 Premium AWD comes with either battery — this listing doesn't say which",
        body: "Ford sells the 2026 Premium AWD with a buyer's choice of a 73 kWh Standard Range pack (240 mi EPA) or an Extended Range pack (300 mi EPA). This row assumes Extended Range; check the window sticker or door-jamb label for the actual EPA rating before trusting the range figure.",
        severity: "warning",
      },
      {
        headline: "Two 2026 recalls — confirm the software fix has been applied",
        body: "25V863 (integrated park module may fail to lock into park, risking rollaway; 2024–2026 Mach-E): remedy is an OTA or dealer software update, owner notices mailed February 2026. 25V885 (Light Driver Control Module B can fail, killing turn signals and headlights; 2025–2026): remedy is an OTA or dealer software update, owner notices mailed January 2026.",
        severity: "warning",
      },
      {
        headline: "Connected services run 7 years from the warranty start date",
        body: "Ford states connected services are available for a minimum of seven years from the vehicle's new-vehicle warranty start date; for a 2026 model that typically means service ends around 2033.",
        severity: "info",
      },
    ],
  },
];
