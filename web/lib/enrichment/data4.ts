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
];
