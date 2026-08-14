import type { EnrichmentRow, Fact, Source } from "../types";

// Fourth research tranche (2026-08-14): Ford F-150 Lightning — zero coverage
// before this pass despite ~50 in inventory.
//
// The pack, not the trim, sets the range, and dealer feeds routinely list the
// cab style ("SuperCrew") as the trim — so these rows key on VIN position 8,
// Ford's own motor/battery code, read from Ford's fleet VIN guides
// (content.fordpro.com …/vin-lookup-and-guides/2022-vin-guide.pdf and
// 2023-vin-guide.pdf; 2024 from the CA mirror, …/2024-vin-guide-Rev11.pdf):
//   2022–23 (fordpro US 2022/2023 VIN guides):  L = Standard Range, V = Extended Range
//   2024    (fordpro CA 2024 VIN guide Rev11):  K = SR, 7 = ER single charger,
//            M = ER dual chargers (also S = LFP — never certified by EPA, no row)
//   2025    (no F-150 section published): codes cross-checked via NHTSA vPIC
//            BatteryInfo, which carries Ford's Part 565 submission per VIN —
//            K = "Standard Range", 7 = "Extended Range Single Charger",
//            U = "5P90S Battery" = the 123 kWh Extended Range pack new for
//            2025 (Ford's 2025 order guide: order code 99U = 123 kWh ER,
//            99K = 98 kWh SR, matching the VIN letters).
//
// EPA ranges fetched live from fueleconomy.gov's REST API per year/variant
// (menu/model → menu/options → /vehicle/{id}); sourceUrls carry the id.
// Pack sizes (usable kWh) from Ford's own year spec sheets / order guides.
// vPIC's per-VIN battery-kWh figure is junk for this truck — every 2023
// Lightning decodes to a flat "98" including Extended Range Platinums — which
// is why the matcher applies vin8 before the kWh hint.
//
// Heat pump: Ford's 2024 order guide lists "Vapor Injection Heat Pump" under
// "MECHANICAL — New/Changed" for MY2024, and the 2025 guide carries it as
// standard equipment. That "New" marker is also the control test for the
// 2022–23 negative: same document lineage, feature explicitly introduced later.
const AS_OF = "2026-08-14";

function f<T>(
  value: T,
  source: Source,
  confidence: Fact<T>["confidence"] = "high",
  note?: string,
  sourceUrl?: string
): Fact<T> {
  return { value, source, asOf: AS_OF, confidence, note, sourceUrl };
}

// (The 2025 order guide, …/2025/order-guides/2025_F-150_Lightning_Order_Guide.pdf,
// documents the 99K/99U order codes and the heat pump as carried-over standard.)
const SPECS_23 = "https://www.fromtheroad.ford.com/content/dam/fordmediasite/us/en/library/2023/specs/2023-Ford-F-150-Lightning-Technical-Specifications.pdf";
const SPECS_25 = "https://www.fromtheroad.ford.com/content/dam/fordmediasite/us/en/library/2025/specs/2025-Ford-F-150-Lightning-Technical-Specifications.pdf";
const OG_24 = "https://www.fromtheroad.ford.com/content/dam/fordmediasite/us/en/library/2024/order-guides/2024_F-150_Lightning_Order_Guide.pdf";
const epa = (id: number) => `https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=${id}`;

// Ford EV warranty terms, printed identically on the Lightning spec sheets.
const WARRANTY = {
  batteryYears: f(8, "mfr" as Source, "high", undefined, SPECS_23),
  batteryMiles: f(100_000, "mfr" as Source, "high", undefined, SPECS_23),
  sohFloorPct: f(70, "mfr" as Source, "high", "“Retaining a minimum of 70 percent of its original capacity” — Ford spec sheet", SPECS_23),
  batteryTransfers: f(true, "mfr" as Source, "high", "“If you bought a previously owned…electric vehicle, you are eligible for any remaining warranty coverages” — every Ford MY guide"),
};

const NO_HEAT_PUMP = f<"none">(
  "none",
  "mfr",
  "high",
  "Resistive heater only — Ford's 2024 order guide introduces the heat pump as New/Changed for MY2024, so 2022–23 trucks have none",
  OG_24
);
const HEAT_PUMP_STD = f<"standard">("standard", "mfr", "high", "“Vapor Injection Heat Pump” — standard equipment in Ford's order guide", OG_24);

// ── Mustang Mach-E (same pass) ──────────────────────────────────────────
//
// Re-keyed from the trim-keyed data3 rows onto VIN position 8. Ford's VIN
// guides (2022, 2023, 2024 Rev11) and its per-VIN Part 565 submissions in
// NHTSA vPIC BatteryInfo agree on the same table for 2022–2026, and the 2021
// lineup maps 1:1 onto the same letters:
//   M = Standard Range, rear unit (RWD) · S = SR + smaller secondary (AWD)
//   7 = Extended Range, rear unit (RWD) · U = ER + smaller secondary (AWD)
//   X = ER + larger secondary          · E = ER, "Limited" drive units
//   4 = SR LFP (RWD) · 5 = SR LFP (AWD) — appear mid-MY2023 with the
//       chemistry switch; the printed 2023 guide predates them, Ford's Part
//       565 submissions mark them LFP explicitly
// E-vs-X is settled by Ford's own 2023 order guide: 99E is the GT's standard
// engine, 99X is "Secondary Electric Motor (Front) with Enhanced Performance",
// and the GT Performance Edition package states "there is no other way to get
// this package without the 99X motor" — so E = GT (EPA "GT"), X = GT
// Performance Edition. From 2024 the GT itself moves to the X hardware and E
// retires. Rally (2024+) is not in inventory and its VIN code is unverified —
// deliberately no row rather than a guess.
//
// The old data3 row for 2023 Premium AWD asserted 224 mi for every such car;
// the U-code cars among them are actually 290-mi Extended Range builds. That
// class of error is what this re-key removes.
//
// vPIC's BatteryKWh is untrustworthy here too: Ford's 2023 submission stamps
// "72" and an LFP suffix onto every 2023 Mach-E including NCM Extended Range
// cars. The structured pack description tracks the VIN code correctly; the
// kWh figure does not.
const OGM_23 = "https://dealerimages.dealereprocess.com/image/upload/v1680045275/1/ford/PDFs/2023_Mustang_Mach-E_Order_Guide.pdf";
const VIN_23 = "https://content.fordpro.com/content/dam/fordpro/us/en-us/pdf/fleet-vehicles/vin-lookup-and-guides/2023-vin-guide.pdf";
const ME = { make: "FORD", model: "Mustang Mach-E" };

const ME_WARRANTY = {
  batteryYears: f(8, "mfr" as Source),
  batteryMiles: f(100_000, "mfr" as Source),
  sohFloorPct: f(70, "mfr" as Source, "high", "“Less than 70 percent of…beginning of life capacity…is considered excessive” — Ford Warranty Guide"),
  batteryTransfers: f(true, "mfr" as Source, "high", "“If you bought a previously owned…electric vehicle, you are eligible for any remaining warranty coverages” — every Ford MY guide"),
};

const ME_KWH_SR_NMC = f(70, "mfr", "high", "“70kWh Usable Capacity Standard Range High-Voltage Battery” — Ford 2023 order guide", OGM_23);
const ME_KWH_ER = f(91, "mfr", "high", "“91kWh Usable Capacity Extended Range High-Voltage Battery” — Ford 2023 order guide", OGM_23);
const ME_KWH_ER_LATE = f(91, "agg", "low", "Extended Range pack — some sources report 88 kWh, some 91; not resolved to a single mfr-published usable figure");
const ME_KWH_SR_LATE = f(73, "agg", "medium", "Standard Range pack (LFP)");
const ME_NMC_EARLY = f<"NMC">("NMC", "mfr", "high", "Predates the mid-MY2023 chemistry switch — every 2021–22 Standard Range pack is NMC");
const ME_NMC_2023 = f<"NMC">("NMC", "mfr", "high", "The mid-MY2023 LFP switch came with new VIN codes (4/5); an M or S code is a pre-switch NMC build", VIN_23);
const ME_LFP = f<"LFP">("LFP", "mfr", "high", "Ford's Part 565 submission marks this VIN code LFP (lithium iron phosphate)");
const ME_NMC_ER = f<"NMC">("NMC", "agg", "medium");

const ME_PORT_EARLY = {
  portStandard: f<"CCS1">("CCS1", "mfr"),
  superchargerAccess: f<"adapter">("adapter", "agg", "medium", "Ford-approved NACS adapter ($200) required for Supercharger access"),
};
const ME_PORT_LATE = {
  portStandard: f<"CCS1">("CCS1", "agg", "medium", "Sources conflict on whether MY2025–26 switched to a native NACS port; treat as CCS1 + adapter until a Ford spec sheet is read directly"),
  superchargerAccess: f<"adapter">("adapter", "agg", "medium", "Ford-approved NACS adapter ($200) required for Supercharger access"),
};
const ME_DC_SR = f(115, "agg", "medium", "Standard Range peak; Extended Range packs peak higher");
const ME_DC_ER = f(150, "agg", "medium", "Extended Range peak");

const ME_NO_HP = f<"none">("none", "agg", "high", "No heat pump on any 2021–2024 Mach-E (resistive PTC heater only); heat pump became standard starting MY2025");
const ME_HP_STD = f<"standard">("standard", "agg", "high", "Heat pump standard across all Mach-E trims starting MY2025 (multiple independent outlets: Cars.com, Green Car Reports)");

const NOTE_BLUECRUISE = {
  headline: "BlueCruise does not transfer to a new owner",
  body: "Ford's own FAQ states BlueCruise plans are VIN-specific and non-transferable; a used Mach-E's remaining BlueCruise time does not carry over from a prior owner.",
  severity: "info" as const,
};
const noteConnected = (my: number) => ({
  headline: "Connected services run 7 years from the warranty start date",
  body: `Ford states connected services are available for a minimum of seven years from the vehicle's new-vehicle warranty start date; for a ${my} model that typically means service ends around ${my + 7}.`,
  severity: "info" as const,
});
// Recall combinations by model year, from the data3 research (affected-year
// ranges per NHTSA): 26V417 = 2021–23, 25V404 = 2021–25, 26V487 = 2023–25,
// 25V863 = 2024–26, 25V885 = 2025–26.
const NOTE_RECALLS_2122 = {
  headline: "Two unresolved recalls — check this VIN's status",
  body: "26V417 (rear differential pinion shaft may fracture, 2021–2023 Mach-E): Ford's remedy was not yet available as of the July 2026 interim notice, with a fix anticipated late December 2026. 25V404 (electronic door latches can stay locked on low battery charge, trapping an occupant, 2021–2025): this one has a free software fix; owner notices mailed September 2025.",
  severity: "trap" as const,
};
const NOTE_RECALLS_2023 = {
  headline: "Two unresolved 2023 recalls — check this VIN's status",
  body: "26V417 (rear differential pinion shaft may fracture, 2021–2023 Mach-E): Ford's remedy was not yet available as of the July 2026 interim notice, with a fix anticipated late December 2026. 26V487 (rear quarter-window trim may detach, 2023–2025): remedy not yet available as of the September 2026 interim notice. 25V404 (electronic door latches can stay locked on low battery charge, trapping an occupant, 2021–2025): this one has a free software fix; owner notices mailed September 2025.",
  severity: "trap" as const,
};
const NOTE_RECALLS_2024 = {
  headline: "Open recalls on 2024 cars — check this VIN's status",
  body: "26V487 (rear quarter-window trim may detach, 2023–2025): remedy not yet available as of the September 2026 interim notice. 25V404 (electronic door latches can stay locked on low battery charge, trapping an occupant, 2021–2025): free software fix; owner notices mailed September 2025. 25V863 (integrated park module may fail to lock into park, risking rollaway; 2024–2026): OTA or dealer software update, owner notices mailed February 2026.",
  severity: "trap" as const,
};
const NOTE_RECALLS_2526 = {
  headline: "Open recalls — check this VIN's status",
  body: "25V863 (integrated park module may fail to lock into park, risking rollaway; 2024–2026 Mach-E) and 25V885 (Light Driver Control Module B can fail, killing turn signals and headlights; 2025–2026) both have free OTA or dealer software fixes — confirm they've been applied. 2025 builds may additionally be under 26V487 (rear quarter-window trim may detach; remedy not yet available as of the September 2026 interim notice) and 25V404 (door latches; free software fix).",
  severity: "warning" as const,
};
const NOTE_CONNECTED_2526 = {
  headline: "Connected services run 7 years from the warranty start date",
  body: "Ford states connected services are available for a minimum of seven years from the vehicle's new-vehicle warranty start date; for a 2025–26 model that typically means service ends around 2032–2033.",
  severity: "info" as const,
};

export const RESEARCH_ROWS_4: EnrichmentRow[] = [
  // ── MY2022 ─────────────────────────────────────────────────────────────
  {
    id: "lightning-2022-sr",
    make: "FORD",
    model: "F-150 Lightning",
    modelYears: [2022, 2022],
    vin8: ["L"],
    packVariant: "Standard Range",
    range: { epaRangeMi: f(230, "mfr", "high", "EPA rating for the Standard Range pack (VIN engine code L)", epa(45318)) },
    thermal: { heatPump: NO_HEAT_PUMP },
    warranty: WARRANTY,
  },
  {
    id: "lightning-2022-er",
    make: "FORD",
    model: "F-150 Lightning",
    modelYears: [2022, 2022],
    vin8: ["V"],
    packVariant: "Extended Range",
    range: { epaRangeMi: f(320, "mfr", "high", "EPA rating for the Extended Range pack (VIN engine code V), non-Platinum trims", epa(45317)) },
    thermal: { heatPump: NO_HEAT_PUMP },
    warranty: WARRANTY,
  },
  {
    id: "lightning-2022-er-platinum",
    make: "FORD",
    model: "F-150 Lightning",
    modelYears: [2022, 2022],
    vin8: ["V"],
    trim: "Platinum",
    packVariant: "Extended Range",
    range: { epaRangeMi: f(300, "mfr", "high", "Platinum carries the same Extended Range pack but is EPA-rated 300 (heavier 22\" wheels)", epa(45316)) },
    thermal: { heatPump: NO_HEAT_PUMP },
    warranty: WARRANTY,
  },

  // ── MY2023 — SR bumped to 240; packs documented on Ford's 2023 sheet ───
  {
    id: "lightning-2023-sr",
    make: "FORD",
    model: "F-150 Lightning",
    modelYears: [2023, 2023],
    vin8: ["L"],
    packVariant: "Standard Range",
    battery: { packUsableKwh: f(98, "mfr", "high", "“98 kWh of usable energy” — Ford 2023 spec sheet", SPECS_23) },
    range: { epaRangeMi: f(240, "mfr", "high", "EPA rating for the Standard Range pack (VIN engine code L)", epa(46329)) },
    thermal: { heatPump: NO_HEAT_PUMP },
    warranty: WARRANTY,
  },
  {
    id: "lightning-2023-er",
    make: "FORD",
    model: "F-150 Lightning",
    modelYears: [2023, 2023],
    vin8: ["V"],
    packVariant: "Extended Range",
    battery: { packUsableKwh: f(131, "mfr", "high", "“131 kWh of usable energy” — Ford 2023 spec sheet", SPECS_23) },
    range: { epaRangeMi: f(320, "mfr", "high", "EPA rating for the Extended Range pack (VIN engine code V), non-Platinum trims", epa(46327)) },
    thermal: { heatPump: NO_HEAT_PUMP },
    warranty: WARRANTY,
  },
  {
    id: "lightning-2023-er-platinum",
    make: "FORD",
    model: "F-150 Lightning",
    modelYears: [2023, 2023],
    vin8: ["V"],
    trim: "Platinum",
    packVariant: "Extended Range",
    battery: { packUsableKwh: f(131, "mfr", "high", "“131 kWh of usable energy” — Ford 2023 spec sheet", SPECS_23) },
    range: { epaRangeMi: f(300, "mfr", "high", "Platinum carries the same Extended Range pack but is EPA-rated 300 (heavier 22\" wheels)", epa(46328)) },
    thermal: { heatPump: NO_HEAT_PUMP },
    warranty: WARRANTY,
  },

  // ── MY2024 — heat pump arrives; VIN codes change to K / 7 / M ──────────
  {
    id: "lightning-2024-sr",
    make: "FORD",
    model: "F-150 Lightning",
    modelYears: [2024, 2024],
    vin8: ["K"],
    packVariant: "Standard Range",
    battery: { packUsableKwh: f(98, "mfr", "high", "“98 kWh Usable Capacity Standard Range High-Voltage Battery” — Ford 2024 order guide", OG_24) },
    range: { epaRangeMi: f(240, "mfr", "high", "EPA rating for the Standard Range pack (VIN engine code K)", epa(47821)) },
    thermal: { heatPump: HEAT_PUMP_STD },
    warranty: WARRANTY,
  },
  {
    id: "lightning-2024-er",
    make: "FORD",
    model: "F-150 Lightning",
    modelYears: [2024, 2024],
    vin8: ["7", "M"],
    packVariant: "Extended Range",
    battery: { packUsableKwh: f(131, "mfr", "high", "“131 kWh Usable Capacity Extended Range High-Voltage Battery” — Ford 2024 order guide", OG_24) },
    range: { epaRangeMi: f(320, "mfr", "high", "EPA rating for the Extended Range pack (VIN engine code 7, or M with dual onboard chargers), non-Platinum trims", epa(47818)) },
    thermal: { heatPump: HEAT_PUMP_STD },
    warranty: WARRANTY,
  },
  {
    id: "lightning-2024-er-platinum",
    make: "FORD",
    model: "F-150 Lightning",
    modelYears: [2024, 2024],
    vin8: ["7", "M"],
    trim: "Platinum",
    packVariant: "Extended Range",
    battery: { packUsableKwh: f(131, "mfr", "high", "“131 kWh Usable Capacity Extended Range High-Voltage Battery” — Ford 2024 order guide", OG_24) },
    range: { epaRangeMi: f(300, "mfr", "high", "Platinum carries the same Extended Range pack but is EPA-rated 300 (heavier 22\" wheels)", epa(47819)) },
    thermal: { heatPump: HEAT_PUMP_STD },
    warranty: WARRANTY,
  },

  // ── MY2025 — a third pack appears: 123 kWh ER (VIN code U, "5P90S") ────
  {
    id: "lightning-2025-sr",
    make: "FORD",
    model: "F-150 Lightning",
    modelYears: [2025, 2025],
    vin8: ["K"],
    packVariant: "Standard Range",
    battery: { packUsableKwh: f(98, "mfr", "high", "“98 kWh of usable energy” — Ford 2025 spec sheet", SPECS_25) },
    range: { epaRangeMi: f(240, "mfr", "high", "EPA rating for the Standard Range pack (VIN engine code K)", epa(48707)) },
    thermal: { heatPump: HEAT_PUMP_STD },
    warranty: WARRANTY,
  },
  {
    id: "lightning-2025-er123",
    make: "FORD",
    model: "F-150 Lightning",
    modelYears: [2025, 2025],
    vin8: ["U"],
    packVariant: "Extended Range (123 kWh)",
    battery: { packUsableKwh: f(123, "mfr", "high", "“123 kWh of usable energy” — the smaller of two 2025 Extended Range packs, new this year (order code 99U)", SPECS_25) },
    range: { epaRangeMi: f(300, "mfr", "high", "EPA rating for the 123 kWh Extended Range pack (VIN engine code U; EPA lists it as “ER2”) — standard on Flash, optional on Pro/XLT", epa(49077)) },
    thermal: { heatPump: HEAT_PUMP_STD },
    warranty: WARRANTY,
  },
  {
    id: "lightning-2025-er131",
    make: "FORD",
    model: "F-150 Lightning",
    modelYears: [2025, 2025],
    vin8: ["7"],
    packVariant: "Extended Range (131 kWh)",
    battery: { packUsableKwh: f(131, "mfr", "high", "“131 kWh of usable energy” — Ford 2025 spec sheet", SPECS_25) },
    range: { epaRangeMi: f(320, "mfr", "high", "EPA rating for the 131 kWh Extended Range pack (VIN engine code 7; EPA lists it as “ER1”), non-Platinum trims", epa(48705)) },
    thermal: { heatPump: HEAT_PUMP_STD },
    warranty: WARRANTY,
  },
  {
    id: "lightning-2025-er131-platinum",
    make: "FORD",
    model: "F-150 Lightning",
    modelYears: [2025, 2025],
    vin8: ["7"],
    trim: "Platinum",
    packVariant: "Extended Range (131 kWh)",
    battery: { packUsableKwh: f(131, "mfr", "high", "“131 kWh of usable energy” — Ford 2025 spec sheet", SPECS_25) },
    range: { epaRangeMi: f(300, "mfr", "high", "Platinum carries the 131 kWh Extended Range pack but is EPA-rated 300 (heavier 22\" wheels)", epa(48708)) },
    thermal: { heatPump: HEAT_PUMP_STD },
    warranty: WARRANTY,
  },

  // ── Mustang Mach-E MY2021 ──────────────────────────────────────────────
  {
    id: "mache-2021-sr-rwd", ...ME, modelYears: [2021, 2021], vin8: ["M"], drive: "RWD",
    packVariant: "Standard Range",
    battery: { packUsableKwh: ME_KWH_SR_NMC, chemistry: ME_NMC_EARLY },
    range: { epaRangeMi: f(230, "mfr", "high", "MY2021 Standard Range RWD (VIN engine code M) — EPA", epa(43604)) },
    charging: { ...ME_PORT_EARLY, dcPeakKw: ME_DC_SR },
    thermal: { heatPump: ME_NO_HP },
    warranty: ME_WARRANTY,
    buyerNotes: [NOTE_RECALLS_2122, NOTE_BLUECRUISE, noteConnected(2021)],
  },
  {
    id: "mache-2021-sr-awd", ...ME, modelYears: [2021, 2021], vin8: ["S"], drive: "AWD",
    packVariant: "Standard Range",
    battery: { packUsableKwh: ME_KWH_SR_NMC, chemistry: ME_NMC_EARLY },
    range: { epaRangeMi: f(211, "mfr", "high", "MY2021 Standard Range AWD (VIN engine code S) — EPA", epa(43602)) },
    charging: { ...ME_PORT_EARLY, dcPeakKw: ME_DC_SR },
    thermal: { heatPump: ME_NO_HP },
    warranty: ME_WARRANTY,
    buyerNotes: [NOTE_RECALLS_2122, NOTE_BLUECRUISE, noteConnected(2021)],
  },
  {
    id: "mache-2021-er-rwd", ...ME, modelYears: [2021, 2021], vin8: ["7"], drive: "RWD",
    packVariant: "Extended Range",
    battery: { packUsableKwh: ME_KWH_ER, chemistry: ME_NMC_ER },
    range: { epaRangeMi: f(300, "mfr", "high", "MY2021 Extended Range RWD (VIN engine code 7), non-California-Route-1 — EPA", epa(43605)) },
    charging: { ...ME_PORT_EARLY, dcPeakKw: ME_DC_ER },
    thermal: { heatPump: ME_NO_HP },
    warranty: ME_WARRANTY,
    buyerNotes: [NOTE_RECALLS_2122, NOTE_BLUECRUISE, noteConnected(2021)],
  },
  {
    id: "mache-2021-er-rwd-cr1", ...ME, modelYears: [2021, 2021], vin8: ["7"], drive: "RWD", trim: "California Route 1",
    packVariant: "Extended Range",
    battery: { packUsableKwh: ME_KWH_ER, chemistry: ME_NMC_ER },
    range: { epaRangeMi: f(305, "mfr", "high", "MY2021 California Route 1 (Extended Range RWD with aero wheels) — EPA", epa(43683)) },
    charging: { ...ME_PORT_EARLY, dcPeakKw: ME_DC_ER },
    thermal: { heatPump: ME_NO_HP },
    warranty: ME_WARRANTY,
    buyerNotes: [NOTE_RECALLS_2122, NOTE_BLUECRUISE, noteConnected(2021)],
  },
  {
    id: "mache-2021-er-awd", ...ME, modelYears: [2021, 2021], vin8: ["U"], drive: "AWD",
    packVariant: "Extended Range",
    battery: { packUsableKwh: ME_KWH_ER, chemistry: ME_NMC_ER },
    range: { epaRangeMi: f(270, "mfr", "high", "MY2021 Extended Range AWD (VIN engine code U), incl. First Edition — EPA", epa(43603)) },
    charging: { ...ME_PORT_EARLY, dcPeakKw: ME_DC_ER },
    thermal: { heatPump: ME_NO_HP },
    warranty: ME_WARRANTY,
    buyerNotes: [NOTE_RECALLS_2122, NOTE_BLUECRUISE, noteConnected(2021)],
  },
  {
    id: "mache-2021-gt", ...ME, modelYears: [2021, 2021], vin8: ["E"], drive: "AWD",
    packVariant: "Extended Range · GT",
    battery: { packUsableKwh: ME_KWH_ER, chemistry: ME_NMC_ER },
    range: { epaRangeMi: f(270, "mfr", "high", "MY2021 GT (VIN engine code E = the GT's standard 99E motor per Ford's order guide) — EPA", epa(44797)) },
    charging: { ...ME_PORT_EARLY, dcPeakKw: ME_DC_ER },
    thermal: { heatPump: ME_NO_HP },
    warranty: ME_WARRANTY,
    buyerNotes: [NOTE_RECALLS_2122, NOTE_BLUECRUISE, noteConnected(2021)],
  },
  {
    id: "mache-2021-gt-pe", ...ME, modelYears: [2021, 2021], vin8: ["X"], drive: "AWD",
    packVariant: "Extended Range · GT Performance",
    battery: { packUsableKwh: ME_KWH_ER, chemistry: ME_NMC_ER },
    range: { epaRangeMi: f(260, "mfr", "high", "MY2021 GT Performance Edition — the 99X 'Enhanced Performance' motor is required for the PE package (Ford order guide), so an X code is a Performance Edition even when the listing just says 'GT' — EPA", epa(44798)) },
    charging: { ...ME_PORT_EARLY, dcPeakKw: ME_DC_ER },
    thermal: { heatPump: ME_NO_HP },
    warranty: ME_WARRANTY,
    buyerNotes: [NOTE_RECALLS_2122, NOTE_BLUECRUISE, noteConnected(2021)],
  },

  // ── Mustang Mach-E MY2022 ──────────────────────────────────────────────
  {
    id: "mache-2022-sr-rwd", ...ME, modelYears: [2022, 2022], vin8: ["M"], drive: "RWD",
    packVariant: "Standard Range",
    battery: { packUsableKwh: ME_KWH_SR_NMC, chemistry: ME_NMC_EARLY },
    range: { epaRangeMi: f(247, "mfr", "high", "MY2022 Standard Range RWD (VIN engine code M) — EPA", epa(45144)) },
    charging: { ...ME_PORT_EARLY, dcPeakKw: ME_DC_SR },
    thermal: { heatPump: ME_NO_HP },
    warranty: ME_WARRANTY,
    buyerNotes: [NOTE_RECALLS_2122, NOTE_BLUECRUISE, noteConnected(2022)],
  },
  {
    id: "mache-2022-sr-awd", ...ME, modelYears: [2022, 2022], vin8: ["S"], drive: "AWD",
    packVariant: "Standard Range",
    battery: { packUsableKwh: ME_KWH_SR_NMC, chemistry: ME_NMC_EARLY },
    range: { epaRangeMi: f(224, "mfr", "high", "MY2022 Standard Range AWD (VIN engine code S) — EPA", epa(45138)) },
    charging: { ...ME_PORT_EARLY, dcPeakKw: ME_DC_SR },
    thermal: { heatPump: ME_NO_HP },
    warranty: ME_WARRANTY,
    buyerNotes: [NOTE_RECALLS_2122, NOTE_BLUECRUISE, noteConnected(2022)],
  },
  {
    id: "mache-2022-er-rwd", ...ME, modelYears: [2022, 2022], vin8: ["7"], drive: "RWD",
    packVariant: "Extended Range",
    battery: { packUsableKwh: ME_KWH_ER, chemistry: ME_NMC_ER },
    range: { epaRangeMi: f(303, "mfr", "high", "MY2022 Extended Range RWD (VIN engine code 7), non-California-Route-1 — EPA", epa(45145)) },
    charging: { ...ME_PORT_EARLY, dcPeakKw: ME_DC_ER },
    thermal: { heatPump: ME_NO_HP },
    warranty: ME_WARRANTY,
    buyerNotes: [NOTE_RECALLS_2122, NOTE_BLUECRUISE, noteConnected(2022)],
  },
  {
    id: "mache-2022-er-rwd-cr1", ...ME, modelYears: [2022, 2022], vin8: ["7"], drive: "RWD", trim: "California Route 1",
    packVariant: "Extended Range",
    battery: { packUsableKwh: ME_KWH_ER, chemistry: ME_NMC_ER },
    range: { epaRangeMi: f(314, "mfr", "high", "MY2022 California Route 1 Extended Range RWD — EPA", epa(45141)) },
    charging: { ...ME_PORT_EARLY, dcPeakKw: ME_DC_ER },
    thermal: { heatPump: ME_NO_HP },
    warranty: ME_WARRANTY,
    buyerNotes: [NOTE_RECALLS_2122, NOTE_BLUECRUISE, noteConnected(2022)],
  },
  {
    id: "mache-2022-er-awd", ...ME, modelYears: [2022, 2022], vin8: ["U"], drive: "AWD",
    packVariant: "Extended Range",
    battery: { packUsableKwh: ME_KWH_ER, chemistry: ME_NMC_ER },
    range: { epaRangeMi: f(277, "mfr", "high", "MY2022 Extended Range AWD (VIN engine code U), non-California-Route-1 — EPA", epa(45139)) },
    charging: { ...ME_PORT_EARLY, dcPeakKw: ME_DC_ER },
    thermal: { heatPump: ME_NO_HP },
    warranty: ME_WARRANTY,
    buyerNotes: [NOTE_RECALLS_2122, NOTE_BLUECRUISE, noteConnected(2022)],
  },
  {
    id: "mache-2022-er-awd-cr1", ...ME, modelYears: [2022, 2022], vin8: ["U"], drive: "AWD", trim: "California Route 1",
    packVariant: "Extended Range",
    battery: { packUsableKwh: ME_KWH_ER, chemistry: ME_NMC_ER },
    range: { epaRangeMi: f(312, "mfr", "high", "MY2022 California Route 1 Extended Range AWD — EPA", epa(45140)) },
    charging: { ...ME_PORT_EARLY, dcPeakKw: ME_DC_ER },
    thermal: { heatPump: ME_NO_HP },
    warranty: ME_WARRANTY,
    buyerNotes: [NOTE_RECALLS_2122, NOTE_BLUECRUISE, noteConnected(2022)],
  },
  {
    id: "mache-2022-gt", ...ME, modelYears: [2022, 2022], vin8: ["E"], drive: "AWD",
    packVariant: "Extended Range · GT",
    battery: { packUsableKwh: ME_KWH_ER, chemistry: ME_NMC_ER },
    range: { epaRangeMi: f(270, "mfr", "high", "MY2022 GT (VIN engine code E = the GT's standard 99E motor per Ford's order guide) — EPA", epa(45142)) },
    charging: { ...ME_PORT_EARLY, dcPeakKw: ME_DC_ER },
    thermal: { heatPump: ME_NO_HP },
    warranty: ME_WARRANTY,
    buyerNotes: [NOTE_RECALLS_2122, NOTE_BLUECRUISE, noteConnected(2022)],
  },
  {
    id: "mache-2022-gt-pe", ...ME, modelYears: [2022, 2022], vin8: ["X"], drive: "AWD",
    packVariant: "Extended Range · GT Performance",
    battery: { packUsableKwh: ME_KWH_ER, chemistry: ME_NMC_ER },
    range: { epaRangeMi: f(260, "mfr", "high", "MY2022 GT Performance Edition — the 99X 'Enhanced Performance' motor is required for the PE package (Ford order guide), so an X code is a Performance Edition even when the listing just says 'GT' — EPA", epa(45143)) },
    charging: { ...ME_PORT_EARLY, dcPeakKw: ME_DC_ER },
    thermal: { heatPump: ME_NO_HP },
    warranty: ME_WARRANTY,
    buyerNotes: [NOTE_RECALLS_2122, NOTE_BLUECRUISE, noteConnected(2022)],
  },

  // ── Mustang Mach-E MY2023 — the chemistry-switch year, VIN-resolved ────
  {
    id: "mache-2023-sr-rwd-nmc", ...ME, modelYears: [2023, 2023], vin8: ["M"], drive: "RWD",
    packVariant: "Standard Range (NMC)",
    battery: { packUsableKwh: ME_KWH_SR_NMC, chemistry: ME_NMC_2023 },
    range: { epaRangeMi: f(247, "mfr", "high", "MY2023 Standard Range RWD, pre-switch NMC build (VIN engine code M) — EPA", epa(46517)) },
    charging: { ...ME_PORT_EARLY, dcPeakKw: ME_DC_SR },
    thermal: { heatPump: ME_NO_HP },
    warranty: ME_WARRANTY,
    buyerNotes: [NOTE_RECALLS_2023, NOTE_BLUECRUISE, noteConnected(2023)],
  },
  {
    id: "mache-2023-sr-awd-nmc", ...ME, modelYears: [2023, 2023], vin8: ["S"], drive: "AWD",
    packVariant: "Standard Range (NMC)",
    battery: { packUsableKwh: ME_KWH_SR_NMC, chemistry: ME_NMC_2023 },
    range: { epaRangeMi: f(224, "mfr", "high", "MY2023 Standard Range AWD, pre-switch NMC build (VIN engine code S) — EPA", epa(46512)) },
    charging: { ...ME_PORT_EARLY, dcPeakKw: ME_DC_SR },
    thermal: { heatPump: ME_NO_HP },
    warranty: ME_WARRANTY,
    buyerNotes: [NOTE_RECALLS_2023, NOTE_BLUECRUISE, noteConnected(2023)],
  },
  {
    id: "mache-2023-sr-rwd-lfp", ...ME, modelYears: [2023, 2023], vin8: ["4"], drive: "RWD",
    packVariant: "Standard Range (LFP)",
    battery: { chemistry: ME_LFP },
    range: { epaRangeMi: f(250, "mfr", "high", "MY2023 Standard Range RWD, post-switch LFP build (VIN engine code 4) — EPA's separate “RWD LFP” certification", epa(46985)) },
    charging: { ...ME_PORT_EARLY, dcPeakKw: ME_DC_SR },
    thermal: { heatPump: ME_NO_HP },
    warranty: ME_WARRANTY,
    buyerNotes: [NOTE_RECALLS_2023, NOTE_BLUECRUISE, noteConnected(2023)],
  },
  {
    id: "mache-2023-sr-awd-lfp", ...ME, modelYears: [2023, 2023], vin8: ["5"], drive: "AWD",
    packVariant: "Standard Range (LFP)",
    battery: { chemistry: ME_LFP },
    range: { epaRangeMi: f(224, "mfr", "medium", "MY2023 Standard Range AWD (VIN engine code 5, LFP) — EPA published one SR AWD rating for 2023; unlike the RWD pack, no separate LFP AWD figure exists", epa(46512)) },
    charging: { ...ME_PORT_EARLY, dcPeakKw: ME_DC_SR },
    thermal: { heatPump: ME_NO_HP },
    warranty: ME_WARRANTY,
    buyerNotes: [NOTE_RECALLS_2023, NOTE_BLUECRUISE, noteConnected(2023)],
  },
  {
    id: "mache-2023-er-rwd", ...ME, modelYears: [2023, 2023], vin8: ["7"], drive: "RWD",
    packVariant: "Extended Range",
    battery: { packUsableKwh: ME_KWH_ER, chemistry: ME_NMC_ER },
    range: { epaRangeMi: f(310, "mfr", "high", "MY2023 Extended Range RWD (VIN engine code 7) — EPA", epa(46518)) },
    charging: { ...ME_PORT_EARLY, dcPeakKw: ME_DC_ER },
    thermal: { heatPump: ME_NO_HP },
    warranty: ME_WARRANTY,
    buyerNotes: [NOTE_RECALLS_2023, NOTE_BLUECRUISE, noteConnected(2023)],
  },
  {
    id: "mache-2023-er-awd", ...ME, modelYears: [2023, 2023], vin8: ["U"], drive: "AWD",
    packVariant: "Extended Range",
    battery: { packUsableKwh: ME_KWH_ER, chemistry: ME_NMC_ER },
    range: { epaRangeMi: f(290, "mfr", "high", "MY2023 Extended Range AWD (VIN engine code U), non-California-Route-1 — EPA", epa(46513)) },
    charging: { ...ME_PORT_EARLY, dcPeakKw: ME_DC_ER },
    thermal: { heatPump: ME_NO_HP },
    warranty: ME_WARRANTY,
    buyerNotes: [NOTE_RECALLS_2023, NOTE_BLUECRUISE, noteConnected(2023)],
  },
  {
    id: "mache-2023-er-awd-cr1", ...ME, modelYears: [2023, 2023], vin8: ["U"], drive: "AWD", trim: "California Route 1",
    packVariant: "Extended Range",
    battery: { packUsableKwh: ME_KWH_ER, chemistry: ME_NMC_ER },
    range: {
      epaRangeMi: f(312, "mfr", "high", "MY2023 California Route 1 Extended Range AWD — EPA", epa(46514)),
      testedRangeMi: f(287, "tested", "medium", "70-mph (InsideEVs, 2021 CA Rt1 RWD, prior-gen same nameplate/pack family): 287 mi; Edmunds loop (2021): 305"),
    },
    charging: { ...ME_PORT_EARLY, dcPeakKw: ME_DC_ER },
    thermal: { heatPump: ME_NO_HP },
    warranty: ME_WARRANTY,
    buyerNotes: [NOTE_RECALLS_2023, NOTE_BLUECRUISE, noteConnected(2023)],
  },
  {
    id: "mache-2023-gt", ...ME, modelYears: [2023, 2023], vin8: ["E"], drive: "AWD",
    packVariant: "Extended Range · GT",
    battery: { packUsableKwh: ME_KWH_ER, chemistry: ME_NMC_ER },
    range: { epaRangeMi: f(270, "mfr", "high", "MY2023 GT (VIN engine code E = the GT's standard 99E motor per Ford's order guide) — EPA", epa(46515)) },
    charging: { ...ME_PORT_EARLY, dcPeakKw: ME_DC_ER },
    thermal: { heatPump: ME_NO_HP },
    warranty: ME_WARRANTY,
    buyerNotes: [NOTE_RECALLS_2023, NOTE_BLUECRUISE, noteConnected(2023)],
  },
  {
    id: "mache-2023-gt-pe", ...ME, modelYears: [2023, 2023], vin8: ["X"], drive: "AWD",
    packVariant: "Extended Range · GT Performance",
    battery: { packUsableKwh: ME_KWH_ER, chemistry: ME_NMC_ER },
    range: { epaRangeMi: f(260, "mfr", "high", "MY2023 GT Performance Edition — the 99X 'Enhanced Performance' motor is required for the PE package (Ford order guide), so an X code is a Performance Edition even when the listing just says 'GT' — EPA", epa(46516)) },
    charging: { ...ME_PORT_EARLY, dcPeakKw: ME_DC_ER },
    thermal: { heatPump: ME_NO_HP },
    warranty: ME_WARRANTY,
    buyerNotes: [NOTE_RECALLS_2023, NOTE_BLUECRUISE, noteConnected(2023)],
  },

  // ── Mustang Mach-E MY2024 — GT moves onto the X hardware; E retires ────
  {
    id: "mache-2024-sr-rwd", ...ME, modelYears: [2024, 2024], vin8: ["4"], drive: "RWD",
    packVariant: "Standard Range (LFP)",
    battery: { chemistry: ME_LFP },
    range: { epaRangeMi: f(250, "mfr", "high", "MY2024 Standard Range RWD (VIN engine code 4) — EPA", epa(47822)) },
    charging: { ...ME_PORT_EARLY, dcPeakKw: ME_DC_SR },
    thermal: { heatPump: ME_NO_HP },
    warranty: ME_WARRANTY,
    buyerNotes: [NOTE_RECALLS_2024, NOTE_BLUECRUISE, noteConnected(2024)],
  },
  {
    id: "mache-2024-sr-awd", ...ME, modelYears: [2024, 2024], vin8: ["5"], drive: "AWD",
    packVariant: "Standard Range (LFP)",
    battery: { chemistry: ME_LFP },
    range: { epaRangeMi: f(230, "mfr", "high", "MY2024 Standard Range AWD (VIN engine code 5) — EPA", epa(47824)) },
    charging: { ...ME_PORT_EARLY, dcPeakKw: ME_DC_SR },
    thermal: { heatPump: ME_NO_HP },
    warranty: ME_WARRANTY,
    buyerNotes: [NOTE_RECALLS_2024, NOTE_BLUECRUISE, noteConnected(2024)],
  },
  {
    id: "mache-2024-er-rwd", ...ME, modelYears: [2024, 2024], vin8: ["7"], drive: "RWD",
    packVariant: "Extended Range",
    battery: { packUsableKwh: ME_KWH_ER_LATE, chemistry: ME_NMC_ER },
    range: { epaRangeMi: f(320, "mfr", "high", "MY2024 Extended Range RWD (VIN engine code 7) — EPA", epa(47823)) },
    charging: { ...ME_PORT_EARLY, dcPeakKw: ME_DC_ER },
    thermal: { heatPump: ME_NO_HP },
    warranty: ME_WARRANTY,
    buyerNotes: [NOTE_RECALLS_2024, NOTE_BLUECRUISE, noteConnected(2024)],
  },
  {
    id: "mache-2024-er-awd", ...ME, modelYears: [2024, 2024], vin8: ["U"], drive: "AWD",
    packVariant: "Extended Range",
    battery: { packUsableKwh: ME_KWH_ER_LATE, chemistry: ME_NMC_ER },
    range: { epaRangeMi: f(300, "mfr", "high", "MY2024 Extended Range AWD (VIN engine code U) — EPA", epa(47825)) },
    charging: { ...ME_PORT_EARLY, dcPeakKw: ME_DC_ER },
    thermal: { heatPump: ME_NO_HP },
    warranty: ME_WARRANTY,
    buyerNotes: [NOTE_RECALLS_2024, NOTE_BLUECRUISE, noteConnected(2024)],
  },
  {
    id: "mache-2024-gt", ...ME, modelYears: [2024, 2024], vin8: ["X"], drive: "AWD",
    packVariant: "Extended Range · GT",
    battery: { packUsableKwh: ME_KWH_ER_LATE, chemistry: ME_NMC_ER },
    range: { epaRangeMi: f(280, "mfr", "high", "MY2024 GT (VIN engine code X — the GT adopts the former Performance Edition hardware from 2024; the Rally's code is unverified and gets no row) — EPA", epa(47826)) },
    charging: { ...ME_PORT_EARLY, dcPeakKw: ME_DC_ER },
    thermal: { heatPump: ME_NO_HP },
    warranty: ME_WARRANTY,
    buyerNotes: [NOTE_RECALLS_2024, NOTE_BLUECRUISE, noteConnected(2024)],
  },

  // ── Mustang Mach-E MY2025–26 — heat pump arrives; ratings identical ────
  {
    id: "mache-2025-26-sr-rwd", ...ME, modelYears: [2025, 2026], vin8: ["4"], drive: "RWD",
    packVariant: "Standard Range (LFP)",
    battery: { packUsableKwh: ME_KWH_SR_LATE, chemistry: ME_LFP },
    range: { epaRangeMi: f(260, "mfr", "high", "MY2025 Standard Range RWD (VIN engine code 4) — EPA; MY2026 carries the same 260-mi rating", epa(49082)) },
    charging: { ...ME_PORT_LATE, dcPeakKw: ME_DC_SR },
    thermal: { heatPump: ME_HP_STD },
    warranty: ME_WARRANTY,
    buyerNotes: [NOTE_RECALLS_2526, NOTE_BLUECRUISE, NOTE_CONNECTED_2526],
  },
  {
    id: "mache-2025-26-sr-awd", ...ME, modelYears: [2025, 2026], vin8: ["5"], drive: "AWD",
    packVariant: "Standard Range (LFP)",
    battery: { packUsableKwh: ME_KWH_SR_LATE, chemistry: ME_LFP },
    range: { epaRangeMi: f(240, "mfr", "high", "MY2025 Standard Range AWD (VIN engine code 5) — EPA; MY2026 carries the same 240-mi rating", epa(49078)) },
    charging: { ...ME_PORT_LATE, dcPeakKw: ME_DC_SR },
    thermal: { heatPump: ME_HP_STD },
    warranty: ME_WARRANTY,
    buyerNotes: [NOTE_RECALLS_2526, NOTE_BLUECRUISE, NOTE_CONNECTED_2526],
  },
  {
    id: "mache-2025-26-er-rwd", ...ME, modelYears: [2025, 2026], vin8: ["7"], drive: "RWD",
    packVariant: "Extended Range",
    battery: { packUsableKwh: ME_KWH_ER_LATE, chemistry: ME_NMC_ER },
    range: { epaRangeMi: f(320, "mfr", "high", "MY2025 Extended Range RWD (VIN engine code 7) — EPA; MY2026 carries the same 320-mi rating. Resolves the Premium either-battery question for this VIN", epa(49083)) },
    charging: { ...ME_PORT_LATE, dcPeakKw: ME_DC_ER },
    thermal: { heatPump: ME_HP_STD },
    warranty: ME_WARRANTY,
    buyerNotes: [NOTE_RECALLS_2526, NOTE_BLUECRUISE, NOTE_CONNECTED_2526],
  },
  {
    id: "mache-2025-26-er-awd", ...ME, modelYears: [2025, 2026], vin8: ["U"], drive: "AWD",
    packVariant: "Extended Range",
    battery: { packUsableKwh: ME_KWH_ER_LATE, chemistry: ME_NMC_ER },
    range: { epaRangeMi: f(300, "mfr", "high", "MY2025 Extended Range AWD (VIN engine code U) — EPA; MY2026 carries the same 300-mi rating. Resolves the Premium either-battery question for this VIN", epa(49079)) },
    charging: { ...ME_PORT_LATE, dcPeakKw: ME_DC_ER },
    thermal: { heatPump: ME_HP_STD },
    warranty: ME_WARRANTY,
    buyerNotes: [NOTE_RECALLS_2526, NOTE_BLUECRUISE, NOTE_CONNECTED_2526],
  },
  {
    id: "mache-2025-26-gt", ...ME, modelYears: [2025, 2026], vin8: ["X"], drive: "AWD",
    packVariant: "Extended Range · GT",
    battery: { packUsableKwh: ME_KWH_ER_LATE, chemistry: ME_NMC_ER },
    range: { epaRangeMi: f(280, "mfr", "high", "MY2025 GT (VIN engine code X) — EPA; MY2026 carries the same 280-mi rating. The Rally's code is unverified and gets no row", epa(49080)) },
    charging: { ...ME_PORT_LATE, dcPeakKw: ME_DC_ER },
    thermal: { heatPump: ME_HP_STD },
    warranty: ME_WARRANTY,
    buyerNotes: [NOTE_RECALLS_2526, NOTE_BLUECRUISE, NOTE_CONNECTED_2526],
  },
];
