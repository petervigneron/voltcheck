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
const BOLT27_PRESS = "https://pressroom.chevrolet.com/gmbx/us/en/chevrolet/pressroom/news.detail.html/Pages/news/us/en/2025/oct/1009-2027-Chevrolet-Bolt.html";
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
// ── Tesla shared facts (Model 3 / Model Y rows below) ───────────────────
const T3 = { make: "TESLA" };
const TES_CHARGING = {
  portStandard: f<"NACS">("NACS", "mfr"),
  superchargerAccess: f<"native">("native", "mfr"),
};
const TES_HP_STD = { heatPump: f<"standard">("standard", "mfr"), batteryPreconditioning: f(true, "mfr") };
const M3_NO_HP_EARLY = {
  heatPump: f<"none">("none", "mfr", "high", "Heat pump arrived with the 2021 refresh, built from ~14 Sept 2020 — every 2018–19 build has the resistive heater"),
  batteryPreconditioning: f(true, "mfr"),
};
const M3_NO_HP_2020 = {
  heatPump: f<"none">("none", "mfr", "high", "Heat pump arrived with the 2021 refresh, built from ~14 Sept 2020"),
  batteryPreconditioning: f(true, "mfr"),
};
// Tesla's battery warranty has two tiers: 8yr/100k for Standard/Mid Range and
// RWD cars, 8yr/120k for Long Range and Performance.
const TES_W120 = {
  batteryYears: f(8, "mfr" as Source),
  batteryMiles: f(120_000, "mfr" as Source),
  sohFloorPct: f(70, "mfr" as Source),
  batteryTransfers: f(true, "mfr" as Source),
};
const TES_W100 = {
  batteryYears: f(8, "mfr" as Source),
  batteryMiles: f(100_000, "mfr" as Source, "high", "Tesla's shorter battery-warranty tier for Standard/Mid Range and RWD cars"),
  sohFloorPct: f(70, "mfr" as Source),
  batteryTransfers: f(true, "mfr" as Source),
};
const NOTE_FSD = { headline: "FSD does not transfer with the car", severity: "warning" as const };
const NOTE_HP_VIN10 = {
  headline: "VIN pos. 10: L = MY2020 (no heat pump), M = MY2021 (heat pump)",
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


// ── Kia EV6 (same pass) ─────────────────────────────────────────────────
// VIN position 8 = motor config per Kia's Part 565 submissions (vPIC
// BatteryInfo): A/B = single motor RWD (160 kW rear), C = dual motor AWD
// (70+160 kW), E = GT (160+270 kW). The pack is NOT in the VIN — Kia's own
// submission says so explicitly ("Light (58.0 kWh), Wind (77.4 kWh)") — so
// trim splits it: Light = Standard Range, Wind/GT-Line/Light Long Range =
// Long Range. AWD Long Range carries two EPA ratings by wheel size: 19"
// (Wind, Light Long Range) vs 20" (GT-Line). 2025 refresh: packs grow to
// 63/84 kWh (cell change 111.2Ah → 120.6Ah in the Part 565 data), ranges
// rise, and the port becomes native NACS. Heat pump fitment, warranty, and
// the ICCU extension carry over from the retired data3-era EV6 row.
const K6 = { make: "KIA", model: "EV6" };
const EV6_WARRANTY = {
  batteryYears: f(10, "mfr" as Source),
  batteryMiles: f(100_000, "mfr" as Source),
  sohFloorPct: f(70, "mfr" as Source),
  batteryTransfers: f(true, "mfr" as Source, "high", "Kia manual: everything except the Power Train (Original Owner) warranty is fully transferable"),
  powertrainTransfers: f(false, "mfr" as Source),
  extendedCoverage: f("ICCU: 15 years / 180,000 miles (extended April 2026, up from 10/100)", "mfr" as Source),
};
const EV6_HP_NONE = { heatPump: f<"none">("none", "mfr", "high", "Heat pump unavailable on the Light trim") };
const EV6_HP_OPT = { heatPump: f<"optional">("optional", "mfr", "high", "Factory option on Wind/GT-Line — window sticker is the authority") };
const EV6_PORT_CCS = { portStandard: f<"CCS1">("CCS1", "mfr") };
const EV6_PORT_NACS = { portStandard: f<"NACS">("NACS", "agg", "high", "Native NACS port from the MY2025 refresh") };
const EV6_58 = { packGrossKwh: f(58, "vin", "high", "“Light (58.0 kWh)” — Kia's own Part 565 submission") };
const EV6_774 = { packGrossKwh: f(77.4, "vin", "high", "“Wind (77.4 kWh)” — Kia's own Part 565 submission") };
const EV6_63 = { packGrossKwh: f(63, "agg", "medium", "MY2025-refresh Standard Range pack") };
const EV6_84 = { packGrossKwh: f(84, "agg", "medium", "MY2025-refresh Long Range pack") };
const NOTE_EV6_HP = { headline: "Heat pump: factory option — on the window sticker", severity: "trap" as const, resolvedBy: "config_resolved" as const };


// ── Kia EV9 / Hyundai Ioniq 6 / IONIQ 9 / Kona Electric (same pass) ─────
// Same mechanism throughout. Codes per each maker's Part 565 submissions
// (vPIC BatteryInfo):
//   EV9:      1 = LR RWD (180.9Ah pack), 2 = SR RWD (120.6Ah), 5 = dual AWD.
//             AWD splits by trim wheels: GT-Line rides bigger wheels, rates
//             lower. The 2026 EV9 GT's code is unverified — no row, and a
//             "GT" key could never swallow "GT-Line" (short-trim exact rule).
//   Ioniq 6:  A = LR RWD (168 kW), B = Standard Range (111 kW motor),
//             C = dual AWD. Wheels by trim: SE 18" / SEL+Limited 20".
//   IONIQ 9:  1 = RWD, 3 = AWD (226 kW), 5 = AWD Performance (315 kW).
//   Kona:     G = gen1 (2019-23); gen2 6 = Long Range (150 kW),
//             7 = Standard Range (99 kW).
// EPA ranges per year/variant via the fueleconomy.gov REST API.
// Ports: Hyundai/Kia E-GMP cars are CCS1 until each model's NACS refresh —
// EV6 and EV9 got NACS for MY2025 (EV6 rows above), IONIQ 9 launched
// native-NACS; Ioniq 6 and Kona stay CCS1 through the years covered here.
const HK_WARRANTY = {
  batteryYears: f(10, "mfr" as Source),
  batteryMiles: f(100_000, "mfr" as Source),
  sohFloorPct: f(70, "mfr" as Source),
  batteryTransfers: f(true, "mfr" as Source),
  powertrainTransfers: f(false, "mfr" as Source, "high", "Hyundai/Kia powertrain 10yr/100k is original-owner-only; battery/EV-system coverage transfers"),
};
const PORT_CCS = { portStandard: f<"CCS1">("CCS1", "mfr") };
const K9 = { make: "KIA", model: "EV9" };
const H6 = { make: "HYUNDAI", model: "Ioniq 6" };
const H9 = { make: "HYUNDAI", model: "IONIQ 9" };
const KONA = { make: "HYUNDAI", model: "Kona Electric" };


// ── BMW i4 / i5 / i7 / iX (same pass) ───────────────────────────────────
// BMW certifies each trim per wheel size and the wheels aren't knowable from
// a listing, so every row carries the standard-wheel figure with the spread
// in the note (the convention the earlier i4/iX rows established). Trim
// names (eDrive35/40, xDrive40/45/50/60, M50/M60/M70) are distinctive
// enough that no VIN work is needed. "Gran Coupe"/"GC" are body-style noise,
// stripped at decode. Platform facts (CCS1 port, Supercharger via adapter
// after a software update, Gen5-eDrive integrated heat pump, 8yr/100k
// transferable battery warranty) mirror the researched i4/iX rows.
const BMW_CHARGING = {
  portStandard: f<"CCS1">("CCS1", "mfr"),
  superchargerAccess: f<"adapter">("adapter", "agg", "high", "Opened Dec 2025 via BMW-approved adapter; requires a Remote Software Upgrade first"),
};
const BMW_HP = { heatPump: f<"standard">("standard", "mfr", "high", "Integrated heat pump for cabin, battery and drive — BMW Gen5-eDrive platform (BMW press)") };
const BMW_WARRANTY = {
  batteryYears: f(8, "mfr" as Source),
  batteryMiles: f(100_000, "mfr" as Source),
  sohFloorPct: f(70, "mfr" as Source),
  batteryTransfers: f(true, "mfr" as Source, "high", "NVLW runs to “the first retail purchaser, and each subsequent purchaser”"),
};
const I4 = { make: "BMW", model: "i4" };
const I5 = { make: "BMW", model: "i5" };
const I7 = { make: "BMW", model: "i7" };
const IX = { make: "BMW", model: "iX" };


// ── Tesla Model S / X, refresh era (same pass) ──────────────────────────
// VIN position 8 per Tesla's Part 565 submissions: 5 = "P2 Dual Motor"
// (the base/Long Range), 6 = "P2 Tri Motor" (Plaid), and in 2021 the
// carryover codes 2 = dual standard (Raven Long Range Plus) and 4 = dual
// performance. This retires the floor-value rows (every 2022 Model X used
// to show 311 mi, the lowest trim, because the trim was unknowable — the
// motor code answers it). Plaid ranges carry the base-wheel figure with
// the bigger-wheel figure noted. Pre-2021 cars keep their floor rows; the
// 60/75/90/100 pack era needs its own pass.
const TSX_CHARGING = {
  portStandard: f<"NACS">("NACS", "mfr"),
  superchargerAccess: f<"native">("native", "mfr"),
  dcPeakKw: f(250, "agg", "low", "Tesla's design-studio material cites “up to 250 kW” for current-generation cars"),
};
const TSX_W = {
  batteryYears: f(8, "mfr" as Source),
  batteryMiles: f(150_000, "mfr" as Source, "high", "Model S/X carry Tesla's longest battery warranty tier"),
  sohFloorPct: f(70, "mfr" as Source),
  batteryTransfers: f(true, "mfr" as Source),
};
const TSX_PACK = { packGrossKwh: f(100, "vin", "medium", "Tesla's Part 565 submission reports a 100 kWh pack — shared across Long Range and Plaid") };
const MS = { make: "TESLA", model: "Model S" };
const MX = { make: "TESLA", model: "Model X" };


// ── Rivian R1S / R1T (same pass) ────────────────────────────────────────
// Rivian's VIN code and trims are feature tiers (Adventure/Launch/Ascend),
// so config comes from the pack/motor words when the feed includes them —
// cleanTrim strips the tier and keeps "Dual/Tri/Quad Motor" for Rivian.
// 2022 needs nothing: every truck is a quad-motor Large pack. 2023 adds
// Dual (Large-only), 2024 multiplies packs (Standard/Standard+/Large/Max),
// gen2 2025+ adds Large Plus/Tri/Quad. Bare tier-only listings present the
// year's honest candidate set. Rivian's Part 565 kWh figures are real
// per-config data (128.9 Large gen1, 106/141 gen2) and help the hint filter.
// Ranges carry the standard-wheel figure with the spread noted.
const R1S = { make: "RIVIAN", model: "R1S" };
const R1T = { make: "RIVIAN", model: "R1T" };
const RIV_W = {
  batteryYears: f(8, "mfr" as Source),
  batteryMiles: f(175_000, "mfr" as Source, "high", "Rivian's battery warranty runs to 175,000 miles — the longest mileage term in the segment"),
  sohFloorPct: f(70, "mfr" as Source),
  batteryTransfers: f(true, "mfr" as Source),
};
const RIV_PORT1 = { portStandard: f<"CCS1">("CCS1", "mfr") };
const RIV_128 = { packGrossKwh: f(128.9, "vin", "high", "Rivian's own Part 565 submission: 128.9 kWh (Large pack)") };
const RIV_106 = { packGrossKwh: f(106, "vin", "high", "Rivian's own Part 565 submission (gen-2 Standard pack)") };
const RIV_141 = { packGrossKwh: f(141, "vin", "high", "Rivian's own Part 565 submission (Max pack)") };


// ── Porsche Taycan / Macan Electric (same pass) ─────────────────────────
// Porsche's VIN code never varies, but its Part 565 kWh submissions are
// genuinely per-VIN: 79.2 = Performance Battery, 93.4 = Performance Battery
// Plus (gen 1). Rows carry packGrossKwh so the existing kWh-hint filter
// resolves the pack per car — the exact ambiguity the old compound-trim
// rows couldn't crack. GTS/Turbo/Turbo S ship the Plus pack only. Gen 2
// (2025+) packs are 82.3/97; the 2026 submissions read a flat 89, which
// sits within tolerance of both packs and therefore vetoes nothing.
// "Turbo" vs "Turbo S" and "Electric" vs "Electric Turbo" survive via the
// exact-trim-first rule and compound aliases. Cross Turismo appears both as
// a trim under model "Taycan" and as its own model string — rows cover both.
const TAY = { make: "PORSCHE", model: "Taycan" };
const TAYCT = { make: "PORSCHE", model: "Taycan Cross Turismo" };
const MAC = { make: "PORSCHE", model: "Macan Electric" };
const MACALT = { make: "PORSCHE", model: "Macan" };
const POR_W = {
  batteryYears: f(8, "mfr" as Source),
  batteryMiles: f(100_000, "mfr" as Source),
  sohFloorPct: f(70, "mfr" as Source),
  batteryTransfers: f(true, "mfr" as Source),
};
const PB1 = { packGrossKwh: f(79.2, "vin", "high", "Performance Battery — 79.2 kWh in Porsche's own Part 565 submission for this VIN pattern") };
const PB1P = { packGrossKwh: f(93.4, "vin", "high", "Performance Battery Plus — 93.4 kWh in Porsche's own Part 565 submission") };
const PB2 = { packGrossKwh: f(82.3, "agg", "medium", "Gen-2 Performance Battery") };
const PB2P = { packGrossKwh: f(97, "agg", "medium", "Gen-2 Performance Battery Plus") };
const MACB = { packGrossKwh: f(100, "vin", "high", "100 kWh gross (95 net) — Porsche's own Part 565 submission") };

// Audi Q4 e-tron (see the row-block comment below for the method).
const Q4 = { make: "AUDI", model: "Q4 e-tron" };
const Q4SBA = { make: "AUDI", model: "Q4 e-tron Sportback" };
const Q4SBB = { make: "AUDI", model: "Q4 Sportback e-tron" };
const Q4_SPEC22 = "https://media.audiusa.com/assets/documents/original/9155-2022Q4etronTechnicalSpecifications.pdf";
const Q4_R597 = "https://media.audiusa.com/releases/597";
const Q4_TIERS = ["Premium", "Premium Plus", "Prestige"];
const Q4_PACK82 = { packGrossKwh: f(82, "mfr", "high", "82 kWh gross, every US Q4 variant — Audi's 2022 Q4 e-tron technical specifications (pack unchanged through the MY2024 40/50)", Q4_SPEC22) };
const Q4_PACK82_77 = {
  packGrossKwh: f(82, "mfr", "high", "“82 kWh (gross) battery” — Audi USA, 2024 Q4 55 refresh release", Q4_R597),
  packUsableKwh: f(77, "mfr", "high", "“provides 77 kWh of net energy” — Audi USA, 2024 Q4 55 refresh release", Q4_R597),
};
// Pre-2021 Model S/X: Tesla's battery warranty for cars sold before ~Feb
// 2020 was 8 years / unlimited miles with no stated capacity floor — the
// 150k-mile cap and 70% floor arrived with the 2020 policy. The original
// warranty follows the car.
const MSX_OLD_W = {
  batteryYears: f(8, "agg" as Source, "medium", "8 years, UNLIMITED miles — Tesla's pre-2020 S/X battery & drive warranty (no mileage cap, no capacity floor); the newer 150k-mile/70% terms apply only to cars first sold after the early-2020 policy change"),
  batteryTransfers: f(true, "mfr" as Source, "high", "“the balance of original Battery and Drive Unit Limited warranty still applies for used vehicles” — Tesla warranty page"),
};
const MSX_OLD_CHARGING = {
  portStandard: f<"NACS">("NACS", "mfr"),
  superchargerAccess: f<"native">("native", "mfr"),
};
const MSX_NO_HP = {
  heatPump: f<"none">("none", "agg", "medium", "Octovalve heat pump arrived with the January 2021 Model S/X refresh; pre-refresh cars had resistive heat only — corroborated by NHTSA recall 22V050, which describes the heat-pump valve hardware as present only on 2021+ cars"),
};
const NOTE_MS_EMMC = {
  headline: "Center display can fail and take rearview camera/defrost with it",
  body: "21V035 (2012–2018 Model S): the center display's eMMC memory chip wears out over time, eventually causing display failure — taking the rearview camera image, defrost controls, and turn-signal chime with it. Free daughterboard replacement; check this VIN's recall status.",
  severity: "trap" as const,
};
const NOTE_MX_EMMC = {
  headline: "Center display can fail and take rearview camera/defrost with it",
  body: "21V035 (2016–2018 Model X): the center display's eMMC memory chip wears out over time, eventually causing display failure — taking the rearview camera image, defrost controls, and turn-signal chime with it. Free daughterboard replacement; check this VIN's recall status.",
  severity: "trap" as const,
};
const msPack = (kwh: number) => ({ packGrossKwh: f(kwh, "mfr", "medium", "Nameplate pack capacity — Tesla badged these cars by pack size") });

// ── Mercedes-Benz EQE / EQS consts (see the row-block comment below) ───
const EQE = { make: "MERCEDES-BENZ", model: "EQE" };
const EQS = { make: "MERCEDES-BENZ", model: "EQS" };
const MB_REL_EQE = "https://media.mbusa.com/releases/release-2f7d9b3c5c8916ac7e38443cec0023e3-all-new-fully-electric-eqe-sedan-to-start-from-74900";
const MB_REL_EQESUV = "https://media.mbusa.com/releases/release-aba56cd1404245f552982a75a0042334-mercedes-benz-usa-announces-pricing-and-packaging-structures-for-alabama-built-eqe-suv";
// Warranty verified against MY25/MY26 EQ booklets in docs/WARRANTY-RESEARCH.md
// (carried forward from the retired data3 EQE/EQS rows, not re-derived).
const MB_W = {
  batteryYears: f(10, "mfr" as Source, "high", "10 yr/155,000 mi applies to the whole EQE/EQS family including SUVs — verified against MY25/MY26 EQ booklets"),
  batteryMiles: f(155_000, "mfr" as Source, "high"),
  extendedCoverage: f("Floor is stated as a per-pack amp-hour number in Mercedes' own booklet (EQE: 204 Ah), not a percentage. Battery coverage is conditioned on completed scheduled maintenance — a skipped-service history can void it.", "mfr" as Source, "high"),
  batteryTransfers: f(true, "mfr" as Source, "high", "“To the original and each subsequent owner” — verified MY25/MY26 EQ booklets"),
};
const EQE_CHG = { portStandard: f<"CCS1">("CCS1", "mfr"), dcPeakKw: f(170, "mfr", "medium", "170 kW peak — Mercedes-Benz USA spec pages (read directly for MY2026; consistent across the EQE family)") };
const EQS_CHG = { portStandard: f<"CCS1">("CCS1", "mfr"), dcPeakKw: f(200, "mfr", "medium", "200 kW peak — Mercedes-Benz USA spec pages (read directly for MY2026; consistent across the EQS family)") };
const EQE_PACK_906 = { packUsableKwh: f(90.6, "mfr", "medium", "“Fitted standard with a 90.6 kWh battery” — MBUSA EQE Sedan pricing release; shared across the pre-refresh (2023–24) EQE family") };
const EQE_PACK_96 = { packUsableKwh: f(96, "mfr", "high", "96 kWh — MBUSA EQE320+ spec page (MY2026); Mercedes' per-VIN Part 565 submissions read 96.00 for MY2025 refresh cars too") };
const EQE_PACK_905 = { packUsableKwh: f(90.5, "mfr", "medium", "90.5 kWh — MBUSA EQE320 4MATIC spec page (MY2026); not separately confirmed for MY2025") };
const EQS_PACK_1078 = { packUsableKwh: f(107.8, "agg", "medium", "107.8 kWh usable — the pre-2025 EQS pack, consistently documented across Mercedes materials and press") };
const EQS_PACK_118 = { packUsableKwh: f(118, "mfr", "high", "118 kWh — MBUSA spec page (MY2026), matching Mercedes' per-VIN Part 565 submissions (vPIC reads 118.00) for 2025–26 cars") };
const MB_HP_SUV = { heatPump: f<"standard">("standard", "mfr", "high", "“Two all-new standard innovations launch with the EQE SUV… a heat pump” — MBUSA EQE SUV launch release; standard on the EQ SUVs from launch", MB_REL_EQESUV) };
const MB_HP_SED_EARLY = { heatPump: f<"optional">("optional", "agg", "medium", "Mercedes made the heat pump standard on EQE/EQS sedans starting MY2024 — an earlier sedan likely lacks it unless optioned") };
const MB_HP_SED = { heatPump: f<"standard">("standard", "agg", "medium", "Standard on EQE/EQS sedans from MY2024 (read directly on the MY2026 MBUSA spec pages)") };
const NOTE_MB_FUSE = {
  headline: "Fuse-box fire/power-loss recall — two rounds, check which repair this VIN got",
  body: "24V115 (MY2023 EQE/EQS: 80-Amp fuses manufactured incorrectly, can cause sudden loss of drive power or fire risk): free replacement fuse box. 25V255: some vehicles repaired under 24V115 received the WRONG replacement fuse box, which itself carries increased fire risk — a second free repair. Confirm this VIN got the correct part, not just “a” repair. (NHTSA's vehicle-level index scopes this to MY2023 only.)",
  severity: "trap" as const,
};
const NOTE_EQE_STEER = {
  headline: "Steering coupling bolt recall",
  body: "25V533 (2023–2026 EQE): a steering coupling bolt may be improperly tightened, risking loss of steering control. Owner notices mailed October 2025.",
  severity: "warning" as const,
};
const NOTE_EQE_ROOF = {
  headline: "Roof-frame absorbers may not be secured — check remedy status",
  body: "23V555 (2023 EQE 500/350, AMG EQE): roof frame absorbers may not be properly secured and can detach during side-curtain air bag deployment. Free dealer replacement; owner notices mailed September 2023.",
  severity: "warning" as const,
};
const NOTE_EQE_BMS24 = {
  headline: "Battery-management-system software recall — check remedy status",
  body: "24V372 (2024 AMG EQE 53 4MATIC and several other EQE/EQS variants): a BMS software fault may cause the high-voltage battery to shut down, a sudden loss of drive power. Free software update; owner notices mailed July 2024.",
  severity: "trap" as const,
};
const NOTE_EQS_NEXTGEN = {
  headline: "This is the current 400V EQS, not the newly-announced next-generation car",
  body: "Mercedes announced an upgraded EQS on an 800V architecture with up to 350 kW DC charging in April 2026 — as of this research it was orderable in Germany only, with no confirmed US on-sale date. This listing's EPA record predates that announcement and matches the existing 400V-architecture car's specs exactly (118 kWh, 200 kW). Don't assume this car has the newer, faster-charging hardware.",
  severity: "info" as const,
};
// The MY2023 EQE gap: fueleconomy.gov's public dataset (menu API and the
// full vehicles.csv download, both checked 2026-08-14) carries NO MY2023
// EQE records and only four of the MY2023 EQS entries. 2023 figures below
// that cite no fueleconomy id are the EPA estimates Mercedes announced,
// as documented by MBUSA releases and contemporary press reporting.
const mb = (
  id: string, base: { make: string; model: string }, years: [number, number], prefix: string,
  variant: string, drv: "AWD" | "RWD", rangeFact: Fact<number>, extra?: Partial<EnrichmentRow>
): EnrichmentRow => ({
  id, ...base, modelYears: years, vinPrefix: [prefix], drive: drv, packVariant: variant,
  range: { epaRangeMi: rangeFact }, warranty: MB_W, ...extra,
});

// Same caveat as the e-tron GT row in data3: the 8yr/100k HV-battery term is
// consistently reported but not confirmed in a readable Audi USA primary doc.
const AUDI_W = {
  batteryYears: f(8, "agg" as Source, "low", "Commonly reported across dealer/aggregator sources but not confirmed in a readable Audi USA primary document"),
  batteryMiles: f(100_000, "agg" as Source, "low", "Same caveat as batteryYears"),
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

  // ── Chevrolet Bolt (same pass) ─────────────────────────────────────────
  // Three gaps closed: MY2020 split out of the old 2017–2020 row (259 EPA,
  // not 238 — every 2020 car was being undershot by 21 miles), the Bolt EUV
  // (separate model string, zero coverage), and the relaunched 2027 Bolt —
  // 255 of the 260 unmatched "Bolt EV" listings. 2027 facts from GM's own
  // press/spec page; EPA range confirmed on fueleconomy.gov (id 50372).
  {
    id: "bolt-ev-2020",
    make: "CHEVROLET",
    model: "Bolt EV",
    modelYears: [2020, 2020],
    range: {
      epaRangeMi: f(259, "mfr", "high", "MY2020 — the pack grew to 66 kWh and EPA range rose to 259", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=42191"),
      testedRangeMi: f(226, "tested", "high", "70-mph (InsideEVs, 2020): 226 mi; 75-mph (C&D): 220"),
    },
    charging: {
      dcFastCharging: f("optional", "mfr", "high", "RPO code CBT, $750 standalone option — optional on BOTH trims through MY2020"),
      portStandard: f("CCS1", "mfr", "high", "Only when the CBT option is present; without it the car is AC-only"),
    },
    thermal: { heatPump: f("none", "mfr") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      batteryTransfers: f(true, "mfr", "high", "GM booklet: “transferable at no cost to any subsequent person(s)” (verified via extracted booklet text)"),
    },
    buyerNotes: [
      { headline: "DC fast charging: $750 factory option — not on every car", severity: "trap", resolvedBy: "photo_dcfc" },
      { headline: "Most 2020–22 cars kept their original packs (21V560)", severity: "info", resolvedBy: "campaign_check" },
      { headline: "No capacity floor on the battery warranty", severity: "warning" },
    ],
  },
  {
    id: "bolt-euv-2022-23",
    make: "CHEVROLET",
    model: "Bolt EUV",
    modelYears: [2022, 2023],
    range: { epaRangeMi: f(247, "mfr", "high", "Bolt EUV, both years — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=45750") },
    charging: { dcFastCharging: f("standard", "mfr"), portStandard: f("CCS1", "mfr") },
    thermal: { heatPump: f("none", "mfr") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      batteryTransfers: f(true, "mfr", "high", "GM booklet: “transferable at no cost to any subsequent person(s)” (verified via extracted booklet text)"),
    },
    buyerNotes: [
      { headline: "Most 2020–22 cars kept their original packs (21V560)", severity: "info", resolvedBy: "campaign_check" },
    ],
  },
  {
    id: "bolt-2027",
    make: "CHEVROLET",
    model: "Bolt EV",
    modelYears: [2027, 2027],
    packVariant: "65 kWh LFP",
    battery: {
      packGrossKwh: f(65, "mfr", "high", "“Battery Rated Energy: 65 kWh” — lithium iron phosphate in prismatic cells, per GM's own spec sheet", BOLT27_PRESS),
      chemistry: f("LFP", "mfr", "high", undefined, BOLT27_PRESS),
    },
    range: { epaRangeMi: f(262, "mfr", "high", "EPA-estimated 262 mi (GM's launch estimate was 255; the certified figure came in higher)", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50372") },
    charging: {
      portStandard: f("NACS", "mfr", "high", "“Chevrolet's first vehicle to offer a native NACS charging port”", BOLT27_PRESS),
      superchargerAccess: f("native", "mfr"),
      dcFastCharging: f("standard", "mfr"),
      dcPeakKw: f(150, "mfr", "high", "“Peak charging speed of 150 kW+” — 10–80% in about 25 minutes", BOLT27_PRESS),
    },
    thermal: {
      heatPump: f("standard", "mfr", "high", "“GM Energy Recovery (heat pump) for active cabin and battery heating and cooling”", BOLT27_PRESS),
      batteryPreconditioning: f(true, "mfr", "high", "Automatic battery preconditioning when DC fast charging is on the route"),
    },
    warranty: {
      batteryYears: f(8, "mfr", "high", undefined, BOLT27_PRESS),
      batteryMiles: f(100_000, "mfr", "high", undefined, BOLT27_PRESS),
      batteryTransfers: f(true, "mfr"),
    },
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

  // ── Tesla Model 3 / Model Y (same pass) ─────────────────────────────────
  //
  // VIN position 8 is Tesla's motor code, confirmed per-VIN by Tesla's own
  // Part 565 submissions (vPIC OtherEngineInfo): Model 3 A = "Single Motor",
  // B = "Dual Motor - Standard", C and T (2024+) = "Dual Motor – Performance";
  // Model Y D = "Single Motor", E = "Dual Motor - Standard", F = "Dual Motor
  // – Performance". The code pins the motor config; where one config carried
  // several packs in a year (2018–19 and 2024+ single-motor cars), the trim
  // splits it and an unlabeled listing honestly presents candidates.
  // EPA ranges per year/variant from fueleconomy.gov's REST API (ids in
  // sourceUrls). 2018–19 dual-motor cars: Long Range AWD and Performance are
  // both EPA 310, so a B code alone settles the range even where dealer trims
  // blur the two. 2019–20 rows deliberately omit the fleet-only software-locked
  // "Standard Range" (220 mi): a bare "Standard Range" trim resolves to the
  // SR+ row instead — rare mislabel risk accepted over guessing.
  // The existing Model Y 2022–24 rows in data.ts keep the Fremont/Austin plant
  // discriminator and gained vin8 E; rows here fill the remaining variants.

  {
    id: "m3-2018-lr-rwd", ...T3, model: "Model 3", modelYears: [2018, 2018], vin8: ["A"], trim: "Long Range", 
    packVariant: "Long Range RWD",
    range: { epaRangeMi: f(310, "mfr", "high", "MY2018 Long Range RWD (single-motor VIN code A + Long Range trim) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=39836") },
    charging: TES_CHARGING,
    thermal: M3_NO_HP_EARLY,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "m3-2018-mid", ...T3, model: "Model 3", modelYears: [2018, 2018], vin8: ["A"], trim: "Mid Range", 
    packVariant: "Mid Range",
    range: { epaRangeMi: f(260, "mfr", "high", "MY2018 Mid Range (single-motor VIN code A + Mid Range trim) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=41056") },
    charging: TES_CHARGING,
    thermal: M3_NO_HP_EARLY,
    warranty: TES_W100,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "m3-2018-dual", ...T3, model: "Model 3", modelYears: [2018, 2018], vin8: ["B"], 
    packVariant: "Dual motor",
    range: { epaRangeMi: f(310, "mfr", "high", "MY2018 dual-motor (VIN code B): Long Range AWD and Performance are both EPA-rated 310", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=40385") },
    charging: TES_CHARGING,
    thermal: M3_NO_HP_EARLY,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "m3-2019-srplus", ...T3, model: "Model 3", modelYears: [2019, 2019], vin8: ["A"], trim: "Standard Range Plus", 
    packVariant: "Standard Range Plus",
    range: { epaRangeMi: f(240, "mfr", "high", "MY2019 Standard Range Plus (single-motor VIN code A + trim) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=41416") },
    charging: TES_CHARGING,
    thermal: M3_NO_HP_EARLY,
    warranty: TES_W100,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "m3-2019-lr-rwd", ...T3, model: "Model 3", modelYears: [2019, 2019], vin8: ["A"], trim: "Long Range", 
    packVariant: "Long Range RWD",
    range: { epaRangeMi: f(310, "mfr", "high", "MY2019 Long Range RWD (single-motor VIN code A + Long Range trim) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=41189") },
    charging: TES_CHARGING,
    thermal: M3_NO_HP_EARLY,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "m3-2019-mid", ...T3, model: "Model 3", modelYears: [2019, 2019], vin8: ["A"], trim: "Mid Range", 
    packVariant: "Mid Range",
    range: { epaRangeMi: f(264, "mfr", "high", "MY2019 Mid Range (single-motor VIN code A + Mid Range trim) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=41188") },
    charging: TES_CHARGING,
    thermal: M3_NO_HP_EARLY,
    warranty: TES_W100,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "m3-2019-dual", ...T3, model: "Model 3", modelYears: [2019, 2019], vin8: ["B"], 
    packVariant: "Dual motor",
    range: { epaRangeMi: f(310, "mfr", "high", "MY2019 dual-motor (VIN code B): Long Range AWD and Performance are both EPA-rated 310", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=41190") },
    charging: TES_CHARGING,
    thermal: M3_NO_HP_EARLY,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "m3-2020-srplus", ...T3, model: "Model 3", modelYears: [2020, 2020], vin8: ["A"], 
    packVariant: "Standard Range Plus",
    range: { epaRangeMi: f(250, "mfr", "high", "MY2020 single-motor (VIN code A) — Standard Range Plus, the only single-motor Model 3 sold in the US that year — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=42278") },
    charging: TES_CHARGING,
    thermal: M3_NO_HP_2020,
    warranty: TES_W100,
    buyerNotes: [NOTE_HP_VIN10, NOTE_FSD],
  },
  {
    id: "m3-2020-lr-awd", ...T3, model: "Model 3", modelYears: [2020, 2020], vin8: ["B"], 
    packVariant: "Long Range AWD",
    range: { epaRangeMi: f(322, "mfr", "high", "MY2020 Long Range AWD (dual-motor VIN code B) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=42275") },
    charging: TES_CHARGING,
    thermal: M3_NO_HP_2020,
    warranty: TES_W120,
    buyerNotes: [NOTE_HP_VIN10, NOTE_FSD],
  },
  {
    id: "m3-2020-perf", ...T3, model: "Model 3", modelYears: [2020, 2020], vin8: ["C"], 
    packVariant: "Performance",
    range: { epaRangeMi: f(299, "mfr", "high", "MY2020 Performance (VIN code C) on its standard 20-inch wheels — EPA; EPA also lists 18/19-inch configurations at 322/304", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=42281") },
    charging: TES_CHARGING,
    thermal: M3_NO_HP_2020,
    warranty: TES_W120,
    buyerNotes: [NOTE_HP_VIN10, NOTE_FSD],
  },
  {
    id: "m3-2021-srplus", ...T3, model: "Model 3", modelYears: [2021, 2021], vin8: ["A"], 
    packVariant: "Standard Range Plus",
    range: { epaRangeMi: f(263, "mfr", "high", "MY2021 Standard Range Plus (single-motor VIN code A) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=43821") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W100,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "m3-2021-lr-awd", ...T3, model: "Model 3", modelYears: [2021, 2021], vin8: ["B"], 
    packVariant: "Long Range AWD",
    range: { epaRangeMi: f(353, "mfr", "high", "MY2021 Long Range AWD (dual-motor VIN code B) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=43401") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "m3-2021-perf", ...T3, model: "Model 3", modelYears: [2021, 2021], vin8: ["C"], 
    packVariant: "Performance",
    range: { epaRangeMi: f(315, "mfr", "high", "MY2021 Performance (VIN code C) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=43402") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "m3-2022-23-rwd", ...T3, model: "Model 3", modelYears: [2022, 2023], vin8: ["A"], 
    packVariant: "RWD (LFP)",
    range: { epaRangeMi: f(272, "mfr", "high", "MY2022–23 Model 3 RWD (single-motor VIN code A) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=45013") },
    battery: { chemistry: f("LFP", "agg", "high", "CATL LFP pack in every US 2022–23 Model 3 RWD") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W100,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "m3-2022-23-lr-awd", ...T3, model: "Model 3", modelYears: [2022, 2023], vin8: ["B"], 
    packVariant: "Long Range AWD",
    range: { epaRangeMi: f(358, "mfr", "high", "MY2022–23 Long Range AWD (dual-motor VIN code B) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=45011") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "m3-2022-23-perf", ...T3, model: "Model 3", modelYears: [2022, 2023], vin8: ["C"], 
    packVariant: "Performance",
    range: { epaRangeMi: f(315, "mfr", "high", "MY2022–23 Performance (VIN code C) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=45012") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "m3-2024-rwd", ...T3, model: "Model 3", modelYears: [2024, 2024], vin8: ["A"], 
    packVariant: "RWD (LFP)",
    range: { epaRangeMi: f(272, "mfr", "high", "MY2024 Model 3 RWD (single-motor VIN code A, non-Long-Range) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47909") },
    battery: { chemistry: f("LFP", "agg", "high", "CATL LFP pack in the US Model 3 RWD") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W100,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "m3-2024-lr-rwd", ...T3, model: "Model 3", modelYears: [2024, 2024], vin8: ["A"], trim: "Long Range", 
    packVariant: "Long Range RWD",
    range: { epaRangeMi: f(363, "mfr", "high", "MY2024 Long Range RWD (single-motor VIN code A + Long Range trim; new variant this year) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48795") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "m3-2024-lr-awd", ...T3, model: "Model 3", modelYears: [2024, 2024], vin8: ["B"], 
    packVariant: "Long Range AWD",
    range: { epaRangeMi: f(341, "mfr", "high", "MY2024 Long Range AWD (dual-motor VIN code B) — EPA lists 341/342 depending on motor variant", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48473") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "m3-2024-perf", ...T3, model: "Model 3", modelYears: [2024, 2024], vin8: ["T"], 
    packVariant: "Performance",
    range: { epaRangeMi: f(303, "mfr", "high", "MY2024 Performance (VIN code T — Tesla's Part 565 submission: Dual Motor – Performance) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48796") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "m3-2025-lr-rwd", ...T3, model: "Model 3", modelYears: [2025, 2025], vin8: ["A"], 
    packVariant: "Long Range RWD",
    range: { epaRangeMi: f(363, "mfr", "high", "MY2025 single-motor (VIN code A) — Long Range RWD, the only single-motor Model 3 EPA-certified for 2025; a 19-inch-wheel configuration is listed at 346", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48765") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "m3-2025-lr-awd", ...T3, model: "Model 3", modelYears: [2025, 2025], vin8: ["B"], 
    packVariant: "Long Range AWD",
    range: { epaRangeMi: f(346, "mfr", "high", "MY2025 Long Range AWD (dual-motor VIN code B) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48764") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "m3-2025-perf", ...T3, model: "Model 3", modelYears: [2025, 2025], vin8: ["T"], 
    packVariant: "Performance",
    range: { epaRangeMi: f(298, "mfr", "high", "MY2025 Performance (VIN code T) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48996") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "m3-2026-premium-rwd", ...T3, model: "Model 3", modelYears: [2026, 2026], vin8: ["A"], trim: ["Premium", "Long Range"], 
    packVariant: "Premium RWD",
    range: { epaRangeMi: f(363, "mfr", "high", "MY2026 Premium RWD (single-motor VIN code A + Premium trim — Tesla's new name for the Long Range) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50038") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "m3-2026-standard", ...T3, model: "Model 3", modelYears: [2026, 2026], vin8: ["A"], trim: "Standard", 
    packVariant: "Standard RWD",
    range: { epaRangeMi: f(321, "mfr", "high", "MY2026 Standard RWD (single-motor VIN code A + Standard trim) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50251") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "m3-2026-premium-awd", ...T3, model: "Model 3", modelYears: [2026, 2026], vin8: ["B"], 
    packVariant: "Premium AWD",
    range: { epaRangeMi: f(346, "mfr", "high", "MY2026 Premium AWD (dual-motor VIN code B) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50037") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "m3-2026-perf", ...T3, model: "Model 3", modelYears: [2026, 2026], vin8: ["T"], 
    packVariant: "Performance",
    range: { epaRangeMi: f(314, "mfr", "high", "MY2026 Performance AWD (VIN code T) — EPA; a second Performance certification is listed at 309", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50250") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "my-2020-lr-awd", ...T3, model: "Model Y", modelYears: [2020, 2020], vin8: ["E"], 
    packVariant: "Long Range AWD",
    range: { epaRangeMi: f(316, "mfr", "high", "MY2020 Long Range AWD (dual-motor VIN code E) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=42916") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "my-2020-perf", ...T3, model: "Model Y", modelYears: [2020, 2020], vin8: ["F"], 
    packVariant: "Performance",
    range: { epaRangeMi: f(315, "mfr", "high", "MY2020 Performance (VIN code F) — EPA; the 21-inch-wheel configuration is listed at 291", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=42474") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "my-2021-sr-rwd", ...T3, model: "Model Y", modelYears: [2021, 2021], vin8: ["D"], 
    packVariant: "Standard Range RWD",
    range: { epaRangeMi: f(244, "mfr", "high", "MY2021 Standard Range RWD (single-motor VIN code D) — sold January–February 2021 only — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=43880") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W100,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "my-2021-lr-awd", ...T3, model: "Model Y", modelYears: [2021, 2021], vin8: ["E"], 
    packVariant: "Long Range AWD",
    range: { epaRangeMi: f(326, "mfr", "high", "MY2021 Long Range AWD (dual-motor VIN code E) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=43406") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "my-2021-perf", ...T3, model: "Model Y", modelYears: [2021, 2021], vin8: ["F"], 
    packVariant: "Performance",
    range: { epaRangeMi: f(303, "mfr", "high", "MY2021 Performance (VIN code F) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=43407") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "my-2022-23-perf", ...T3, model: "Model Y", modelYears: [2022, 2023], vin8: ["F"], 
    packVariant: "Performance",
    range: { epaRangeMi: f(303, "mfr", "high", "MY2022–23 Performance (VIN code F) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=45019") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "my-2023-rwd", ...T3, model: "Model Y", modelYears: [2023, 2023], vin8: ["D"], 
    packVariant: "RWD",
    range: { epaRangeMi: f(260, "mfr", "medium", "Single-motor (VIN code D) MY2023 — the Model Y RWD launched October 2023; fueleconomy.gov files its 260-mi certification under MY2024 with no separate MY2023 entry", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48476") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W100,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "my-2024-lr-rwd", ...T3, model: "Model Y", modelYears: [2024, 2024], vin8: ["D"], trim: "Long Range", 
    packVariant: "Long Range RWD",
    range: { epaRangeMi: f(320, "mfr", "high", "MY2024 Long Range RWD (single-motor VIN code D + Long Range trim) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48475") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "my-2024-rwd", ...T3, model: "Model Y", modelYears: [2024, 2024], vin8: ["D"], 
    packVariant: "RWD",
    range: { epaRangeMi: f(260, "mfr", "high", "MY2024 Model Y RWD (single-motor VIN code D, non-Long-Range) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48476") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W100,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "my-2024-perf", ...T3, model: "Model Y", modelYears: [2024, 2024], vin8: ["F"], 
    packVariant: "Performance",
    range: { epaRangeMi: f(279, "mfr", "high", "MY2024 Performance (VIN code F) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47914") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "my-2025-lr-rwd", ...T3, model: "Model Y", modelYears: [2025, 2025], vin8: ["D"], 
    packVariant: "Long Range RWD",
    range: { epaRangeMi: f(337, "mfr", "high", "MY2025 Long Range RWD (single-motor VIN code D) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48771") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "my-2025-lr-awd", ...T3, model: "Model Y", modelYears: [2025, 2025], vin8: ["E"], 
    packVariant: "Long Range AWD",
    range: { epaRangeMi: f(311, "mfr", "high", "MY2025 Long Range AWD (dual-motor VIN code E) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48770") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "my-2025-perf", ...T3, model: "Model Y", modelYears: [2025, 2025], vin8: ["F"], 
    packVariant: "Performance",
    range: { epaRangeMi: f(277, "mfr", "high", "MY2025 Performance (VIN code F) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48772") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "my-2026-lr-rwd", ...T3, model: "Model Y", modelYears: [2026, 2026], vin8: ["D"], trim: ["Premium", "Long Range"], 
    packVariant: "Long Range RWD",
    range: { epaRangeMi: f(357, "mfr", "high", "MY2026 Premium RWD — Tesla's 2026 consumer name; EPA files it as Long Range RWD (single-motor VIN code D)", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49743") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "my-2026-standard-rwd", ...T3, model: "Model Y", modelYears: [2026, 2026], vin8: ["D"], trim: "Standard", 
    packVariant: "Standard RWD",
    range: { epaRangeMi: f(321, "mfr", "high", "MY2026 Standard RWD (single-motor VIN code D + Standard trim) on 18-inch wheels — EPA; 19-inch configuration listed at 303", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50040") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W100,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "my-2026-lr-awd", ...T3, model: "Model Y", modelYears: [2026, 2026], vin8: ["E"], trim: ["Premium", "Long Range"], 
    packVariant: "Long Range AWD",
    range: { epaRangeMi: f(327, "mfr", "high", "MY2026 Premium AWD — Tesla's 2026 consumer name; EPA files it as Long Range AWD (dual-motor VIN code E)", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49744") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "my-2026-standard-awd", ...T3, model: "Model Y", modelYears: [2026, 2026], vin8: ["E"], trim: "Standard", 
    packVariant: "Standard AWD",
    range: { epaRangeMi: f(294, "mfr", "high", "MY2026 Standard AWD (dual-motor VIN code E + Standard trim) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50304") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "my-2026-perf", ...T3, model: "Model Y", modelYears: [2026, 2026], vin8: ["F"], 
    packVariant: "Performance",
    range: { epaRangeMi: f(306, "mfr", "high", "MY2026 Performance (VIN code F) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50253") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },

  {
    id: "ev6-2022-sr-rwd", ...K6, modelYears: [2022, 2022], vin8: ["A", "B"], trim: "Light", packVariant: "Standard Range",
    battery: EV6_58,
    range: { epaRangeMi: f(232, "mfr", "high", "MY2022 Standard Range RWD (Light trim) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=44927") },
    charging: EV6_PORT_CCS,
    thermal: EV6_HP_NONE,
    warranty: EV6_WARRANTY,
  },
  {
    id: "ev6-2022-lr-rwd", ...K6, modelYears: [2022, 2022], vin8: ["A", "B"], trim: ["Wind", "GT-Line"], packVariant: "Long Range",
    battery: EV6_774,
    range: { epaRangeMi: f(310, "mfr", "high", "MY2022 Long Range RWD (Wind/GT-Line) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=44926") },
    charging: EV6_PORT_CCS,
    thermal: EV6_HP_OPT,
    warranty: EV6_WARRANTY, buyerNotes: [NOTE_EV6_HP],
  },
  {
    id: "ev6-2022-lr-awd", ...K6, modelYears: [2022, 2022], vin8: ["C"], packVariant: "Long Range",
    battery: EV6_774,
    range: { epaRangeMi: f(274, "mfr", "high", "MY2022 Long Range AWD (dual-motor VIN code C) — EPA, one rating for both trims this year", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=44925") },
    charging: EV6_PORT_CCS,
    thermal: EV6_HP_OPT,
    warranty: EV6_WARRANTY, buyerNotes: [NOTE_EV6_HP],
  },
  {
    id: "ev6-2023-24-sr-rwd", ...K6, modelYears: [2023, 2024], vin8: ["A", "B"], trim: "Light", ignoreKwhHint: true, packVariant: "Standard Range",
    battery: EV6_58,
    range: { epaRangeMi: f(232, "mfr", "high", "MY2023–24 Standard Range RWD (Light trim) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46007") },
    charging: EV6_PORT_CCS,
    thermal: EV6_HP_NONE,
    warranty: EV6_WARRANTY,
  },
  {
    id: "ev6-2023-24-lr-rwd", ...K6, modelYears: [2023, 2024], vin8: ["A", "B"], trim: ["Wind", "GT-Line", "Light Long Range"], ignoreKwhHint: true, packVariant: "Long Range",
    battery: EV6_774,
    range: { epaRangeMi: f(310, "mfr", "high", "MY2023–24 Long Range RWD — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46006") },
    charging: EV6_PORT_CCS,
    thermal: EV6_HP_OPT,
    warranty: EV6_WARRANTY, buyerNotes: [NOTE_EV6_HP],
  },
  {
    id: "ev6-2023-24-lr-awd-19", ...K6, modelYears: [2023, 2024], vin8: ["C"], trim: ["Wind", "Light Long Range", "Light"], packVariant: "Long Range",
    battery: EV6_774,
    range: { epaRangeMi: f(282, "mfr", "high", "MY2023–24 Long Range AWD on 19-inch wheels (Wind, Light Long Range) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46004") },
    charging: EV6_PORT_CCS,
    thermal: EV6_HP_OPT,
    warranty: EV6_WARRANTY, buyerNotes: [NOTE_EV6_HP],
  },
  {
    id: "ev6-2023-24-lr-awd-20", ...K6, modelYears: [2023, 2024], vin8: ["C"], trim: "GT-Line", packVariant: "Long Range",
    battery: EV6_774,
    range: { epaRangeMi: f(252, "mfr", "high", "MY2023–24 Long Range AWD on the GT-Line's 20-inch wheels — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46005") },
    charging: EV6_PORT_CCS,
    thermal: EV6_HP_OPT,
    warranty: EV6_WARRANTY, buyerNotes: [NOTE_EV6_HP],
  },
  {
    id: "ev6-2023-gt", ...K6, modelYears: [2023, 2023], vin8: ["E"], packVariant: "GT",
    battery: EV6_774,
    range: { epaRangeMi: f(206, "mfr", "high", "MY2023 EV6 GT (VIN code E) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46003") },
    charging: EV6_PORT_CCS,
    thermal: { heatPump: f<"standard">("standard", "mfr") },
    warranty: EV6_WARRANTY,
  },
  {
    id: "ev6-2024-gt", ...K6, modelYears: [2024, 2024], vin8: ["E"], packVariant: "GT",
    battery: EV6_774,
    range: { epaRangeMi: f(218, "mfr", "high", "MY2024 EV6 GT (VIN code E) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46968") },
    charging: EV6_PORT_CCS,
    thermal: { heatPump: f<"standard">("standard", "mfr") },
    warranty: EV6_WARRANTY,
  },
  {
    id: "ev6-2025-26-sr-rwd", ...K6, modelYears: [2025, 2026], vin8: ["A", "B"], trim: "Light", packVariant: "Standard Range",
    battery: EV6_63,
    range: { epaRangeMi: f(237, "mfr", "high", "MY2025–26 Standard Range RWD (Light trim, refreshed 63 kWh pack) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49098") },
    charging: EV6_PORT_NACS,
    thermal: EV6_HP_NONE,
    warranty: EV6_WARRANTY,
  },
  {
    id: "ev6-2025-26-lr-rwd", ...K6, modelYears: [2025, 2026], vin8: ["A", "B"], trim: ["Wind", "GT-Line", "Light Long Range"], packVariant: "Long Range",
    battery: EV6_84,
    range: { epaRangeMi: f(319, "mfr", "high", "MY2025–26 Long Range RWD (refreshed 84 kWh pack) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49097") },
    charging: EV6_PORT_NACS,
    thermal: EV6_HP_OPT,
    warranty: EV6_WARRANTY, buyerNotes: [NOTE_EV6_HP],
  },
  {
    id: "ev6-2025-26-lr-awd-19", ...K6, modelYears: [2025, 2026], vin8: ["C"], trim: ["Wind", "Light Long Range", "Light"], packVariant: "Long Range",
    battery: EV6_84,
    range: { epaRangeMi: f(295, "mfr", "high", "MY2025–26 Long Range AWD on 19-inch wheels — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49095") },
    charging: EV6_PORT_NACS,
    thermal: EV6_HP_OPT,
    warranty: EV6_WARRANTY, buyerNotes: [NOTE_EV6_HP],
  },
  {
    id: "ev6-2025-26-lr-awd-20", ...K6, modelYears: [2025, 2026], vin8: ["C"], trim: "GT-Line", packVariant: "Long Range",
    battery: EV6_84,
    range: { epaRangeMi: f(270, "mfr", "high", "MY2025–26 Long Range AWD on the GT-Line's 20-inch wheels — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49096") },
    charging: EV6_PORT_NACS,
    thermal: EV6_HP_OPT,
    warranty: EV6_WARRANTY, buyerNotes: [NOTE_EV6_HP],
  },
  {
    id: "ev6-2025-26-gt", ...K6, modelYears: [2025, 2026], vin8: ["E"], packVariant: "GT",
    battery: EV6_84,
    range: { epaRangeMi: f(231, "mfr", "high", "MY2025–26 EV6 GT (VIN code E) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49094") },
    charging: EV6_PORT_NACS,
    thermal: { heatPump: f<"standard">("standard", "mfr") },
    warranty: EV6_WARRANTY,
  },

  {
    id: "ev9-2024-lr-rwd", ...K9, modelYears: [2024, 2024], vin8: ["1"], drive: "RWD", packVariant: "Long Range",
    battery: { packGrossKwh: f(99.8, "agg", "medium", "Long Range pack (the 180.9Ah cells in Kia's Part 565 data)") },
    range: { epaRangeMi: f(304, "mfr", "high", "MY2024 Long Range RWD (VIN code 1) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47450") },
    charging: PORT_CCS,
    warranty: HK_WARRANTY,
  },
  {
    id: "ev9-2025-lr-rwd", ...K9, modelYears: [2025, 2025], vin8: ["1"], drive: "RWD", packVariant: "Long Range",
    battery: { packGrossKwh: f(99.8, "agg", "medium", "Long Range pack (the 180.9Ah cells in Kia's Part 565 data)") },
    range: { epaRangeMi: f(304, "mfr", "high", "MY2025 Long Range RWD (VIN code 1) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48366") },
    charging: { portStandard: f<"NACS">("NACS", "agg", "high", "Native NACS port from MY2025") },
    warranty: HK_WARRANTY,
  },
  {
    id: "ev9-2026-lr-rwd", ...K9, modelYears: [2026, 2026], vin8: ["1"], drive: "RWD", packVariant: "Long Range",
    battery: { packGrossKwh: f(99.8, "agg", "medium", "Long Range pack (the 180.9Ah cells in Kia's Part 565 data)") },
    range: { epaRangeMi: f(305, "mfr", "high", "MY2026 Long Range RWD (VIN code 1) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49666") },
    charging: { portStandard: f<"NACS">("NACS", "agg", "high", "Native NACS port from MY2025") },
    warranty: HK_WARRANTY,
  },
  {
    id: "ev9-2024-sr-rwd", ...K9, modelYears: [2024, 2024], vin8: ["2"], drive: "RWD", packVariant: "Standard Range",
    battery: { packGrossKwh: f(76.1, "agg", "medium", "Standard Range pack (the 120.6Ah cells in Kia's Part 565 data)") },
    range: { epaRangeMi: f(230, "mfr", "high", "MY2024 Standard Range RWD (VIN code 2) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47451") },
    charging: PORT_CCS,
    warranty: HK_WARRANTY,
  },
  {
    id: "ev9-2025-26-sr-rwd", ...K9, modelYears: [2025, 2026], vin8: ["2"], drive: "RWD", packVariant: "Standard Range",
    battery: { packGrossKwh: f(76.1, "agg", "medium", "Standard Range pack (the 120.6Ah cells in Kia's Part 565 data)") },
    range: { epaRangeMi: f(230, "mfr", "high", "MY2025–26 Standard Range RWD (VIN code 2) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48367") },
    charging: { portStandard: f<"NACS">("NACS", "agg", "high", "Native NACS port from MY2025") },
    warranty: HK_WARRANTY,
  },
  {
    id: "ev9-2024-awd", ...K9, modelYears: [2024, 2024], vin8: ["5"], trim: ["Wind", "Land", "Light"], drive: "AWD", packVariant: "Long Range",
    battery: { packGrossKwh: f(99.8, "agg", "medium", "Long Range pack (the 180.9Ah cells in Kia's Part 565 data)") },
    range: { epaRangeMi: f(280, "mfr", "high", "MY2024 Long Range AWD (VIN code 5), non-GT-Line — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47452") },
    charging: PORT_CCS,
    warranty: HK_WARRANTY,
  },
  {
    id: "ev9-2024-awd-gtline", ...K9, modelYears: [2024, 2024], vin8: ["5"], trim: "GT-Line", drive: "AWD", packVariant: "Long Range",
    battery: { packGrossKwh: f(99.8, "agg", "medium", "Long Range pack (the 180.9Ah cells in Kia's Part 565 data)") },
    range: { epaRangeMi: f(270, "mfr", "high", "MY2024 Long Range AWD on the GT-Line wheels — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47453") },
    charging: PORT_CCS,
    warranty: HK_WARRANTY,
  },
  {
    id: "ev9-2025-awd", ...K9, modelYears: [2025, 2025], vin8: ["5"], trim: ["Wind", "Land", "Light"], drive: "AWD", packVariant: "Long Range",
    battery: { packGrossKwh: f(99.8, "agg", "medium", "Long Range pack (the 180.9Ah cells in Kia's Part 565 data)") },
    range: { epaRangeMi: f(280, "mfr", "high", "MY2025 Long Range AWD (VIN code 5), non-GT-Line — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48368") },
    charging: { portStandard: f<"NACS">("NACS", "agg", "high", "Native NACS port from MY2025") },
    warranty: HK_WARRANTY,
  },
  {
    id: "ev9-2025-awd-gtline", ...K9, modelYears: [2025, 2025], vin8: ["5"], trim: "GT-Line", drive: "AWD", packVariant: "Long Range",
    battery: { packGrossKwh: f(99.8, "agg", "medium", "Long Range pack (the 180.9Ah cells in Kia's Part 565 data)") },
    range: { epaRangeMi: f(270, "mfr", "high", "MY2025 Long Range AWD, GT-Line — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48369") },
    charging: { portStandard: f<"NACS">("NACS", "agg", "high", "Native NACS port from MY2025") },
    warranty: HK_WARRANTY,
  },
  {
    id: "ev9-2026-awd", ...K9, modelYears: [2026, 2026], vin8: ["5"], trim: ["Wind", "Land", "Light"], drive: "AWD", packVariant: "Long Range",
    battery: { packGrossKwh: f(99.8, "agg", "medium", "Long Range pack (the 180.9Ah cells in Kia's Part 565 data)") },
    range: { epaRangeMi: f(283, "mfr", "high", "MY2026 Long Range AWD (VIN code 5), non-GT-Line — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49667") },
    charging: { portStandard: f<"NACS">("NACS", "agg", "high", "Native NACS port from MY2025") },
    warranty: HK_WARRANTY,
  },
  {
    id: "ev9-2026-awd-gtline", ...K9, modelYears: [2026, 2026], vin8: ["5"], trim: "GT-Line", drive: "AWD", packVariant: "Long Range",
    battery: { packGrossKwh: f(99.8, "agg", "medium", "Long Range pack (the 180.9Ah cells in Kia's Part 565 data)") },
    range: { epaRangeMi: f(280, "mfr", "high", "MY2026 Long Range AWD, GT-Line — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49668") },
    charging: { portStandard: f<"NACS">("NACS", "agg", "high", "Native NACS port from MY2025") },
    warranty: HK_WARRANTY,
  },
  {
    id: "i6-2023-24-lr-rwd-18", ...H6, modelYears: [2023, 2024], vin8: ["A"], trim: "SE", drive: "RWD", packVariant: "Long Range",
    range: { epaRangeMi: f(361, "mfr", "high", "MY2023–24 Long Range RWD on the SE 18-inch wheels — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46622") },
    charging: PORT_CCS,
    warranty: HK_WARRANTY,
  },
  {
    id: "i6-2023-24-lr-rwd-20", ...H6, modelYears: [2023, 2024], vin8: ["A"], trim: ["SEL", "Limited"], drive: "RWD", packVariant: "Long Range",
    range: { epaRangeMi: f(305, "mfr", "high", "MY2023–24 Long Range RWD on 20-inch wheels (SEL, Limited) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46623") },
    charging: PORT_CCS,
    warranty: HK_WARRANTY,
  },
  {
    id: "i6-2023-24-lr-awd-18", ...H6, modelYears: [2023, 2024], vin8: ["C"], trim: "SE", drive: "AWD", packVariant: "Long Range",
    range: { epaRangeMi: f(316, "mfr", "high", "MY2023–24 Long Range AWD on the SE 18-inch wheels — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46620") },
    charging: PORT_CCS,
    warranty: HK_WARRANTY,
  },
  {
    id: "i6-2023-24-lr-awd-20", ...H6, modelYears: [2023, 2024], vin8: ["C"], trim: ["SEL", "Limited"], drive: "AWD", packVariant: "Long Range",
    range: { epaRangeMi: f(270, "mfr", "high", "MY2023–24 Long Range AWD on 20-inch wheels (SEL, Limited) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46621") },
    charging: PORT_CCS,
    warranty: HK_WARRANTY,
  },
  {
    id: "i6-2023-25-sr", ...H6, modelYears: [2023, 2025], vin8: ["B"], trim: "SE Standard Range", drive: "RWD", packVariant: "Standard Range",
    range: { epaRangeMi: f(240, "mfr", "high", "SE Standard Range RWD (VIN code B, the 111 kW motor in Hyundai Part 565 data) — EPA, same 240-mi rating all three years", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46624") },
    charging: PORT_CCS,
    warranty: HK_WARRANTY,
  },
  {
    id: "i6-2025-lr-rwd-18", ...H6, modelYears: [2025, 2025], vin8: ["A"], trim: "SE", drive: "RWD", packVariant: "Long Range",
    range: { epaRangeMi: f(342, "mfr", "high", "MY2025 Long Range RWD on the SE 18-inch wheels — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48362") },
    charging: PORT_CCS,
    warranty: HK_WARRANTY,
  },
  {
    id: "i6-2025-lr-rwd-20", ...H6, modelYears: [2025, 2025], vin8: ["A"], trim: ["SEL", "Limited"], drive: "RWD", packVariant: "Long Range",
    range: { epaRangeMi: f(291, "mfr", "high", "MY2025 Long Range RWD on 20-inch wheels (SEL, Limited) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48363") },
    charging: PORT_CCS,
    warranty: HK_WARRANTY,
  },
  {
    id: "i6-2025-lr-awd-18", ...H6, modelYears: [2025, 2025], vin8: ["C"], trim: "SE", drive: "AWD", packVariant: "Long Range",
    range: { epaRangeMi: f(316, "mfr", "high", "MY2025 Long Range AWD on the SE 18-inch wheels — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48361") },
    charging: PORT_CCS,
    warranty: HK_WARRANTY,
  },
  {
    id: "i6-2025-lr-awd-20", ...H6, modelYears: [2025, 2025], vin8: ["C"], trim: ["SEL", "Limited"], drive: "AWD", packVariant: "Long Range",
    range: { epaRangeMi: f(270, "mfr", "high", "MY2025 Long Range AWD on 20-inch wheels (SEL, Limited) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48365") },
    charging: PORT_CCS,
    warranty: HK_WARRANTY,
  },
  {
    id: "i9-2026-rwd", ...H9, modelYears: [2026, 2026], vin8: ["1"], drive: "RWD", packVariant: "Long Range",
    battery: { packGrossKwh: f(110.3, "agg", "medium") },
    range: { epaRangeMi: f(335, "mfr", "high", "MY2026 IONIQ 9 RWD (VIN code 1) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49661") },
    charging: { portStandard: f<"NACS">("NACS", "agg", "high", "Native NACS port from launch") },
    warranty: HK_WARRANTY,
  },
  {
    id: "i9-2026-awd", ...H9, modelYears: [2026, 2026], vin8: ["3"], drive: "AWD", packVariant: "Long Range",
    battery: { packGrossKwh: f(110.3, "agg", "medium") },
    range: { epaRangeMi: f(320, "mfr", "high", "MY2026 IONIQ 9 AWD (VIN code 3) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49662") },
    charging: { portStandard: f<"NACS">("NACS", "agg", "high", "Native NACS port from launch") },
    warranty: HK_WARRANTY,
  },
  {
    id: "i9-2026-awd-perf", ...H9, modelYears: [2026, 2026], vin8: ["5"], drive: "AWD", packVariant: "Long Range",
    battery: { packGrossKwh: f(110.3, "agg", "medium") },
    range: { epaRangeMi: f(311, "mfr", "high", "MY2026 IONIQ 9 AWD Performance (VIN code 5, incl. Calligraphy) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49663") },
    charging: { portStandard: f<"NACS">("NACS", "agg", "high", "Native NACS port from launch") },
    warranty: HK_WARRANTY,
  },
  {
    id: "kona-2019-23", ...KONA, modelYears: [2019, 2023], vin8: ["G"], drive: "FWD", packVariant: "64 kWh",
    battery: { packGrossKwh: f(64, "mfr", "high") },
    range: { epaRangeMi: f(258, "mfr", "high", "Gen-1 Kona Electric (VIN code G), one rating across 2019–23 — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46000") },
    charging: PORT_CCS,
    warranty: HK_WARRANTY,
  },
  {
    id: "kona-2024-lr", ...KONA, modelYears: [2024, 2024], vin8: ["6"], drive: "FWD", packVariant: "Long Range",
    range: { epaRangeMi: f(261, "mfr", "high", "MY2024 Long Range (VIN code 6) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47449") },
    charging: PORT_CCS,
    warranty: HK_WARRANTY,
  },
  {
    id: "kona-2025-lr", ...KONA, modelYears: [2025, 2025], vin8: ["6"], drive: "FWD", packVariant: "Long Range",
    range: { epaRangeMi: f(261, "mfr", "high", "MY2025 Long Range (VIN code 6) on 17-inch wheels — EPA; the N Line 19-inch wheels rate 230", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48357") },
    charging: PORT_CCS,
    warranty: HK_WARRANTY,
  },
  {
    id: "kona-2025-lr-nline", ...KONA, modelYears: [2025, 2025], vin8: ["6"], trim: "N Line", drive: "FWD", packVariant: "Long Range",
    range: { epaRangeMi: f(230, "mfr", "high", "MY2025 Long Range, N Line (19-inch wheels) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48358") },
    charging: PORT_CCS,
    warranty: HK_WARRANTY,
  },
  {
    id: "kona-2024-25-sr", ...KONA, modelYears: [2024, 2025], vin8: ["7"], drive: "FWD", packVariant: "Standard Range",
    battery: { packGrossKwh: f(48.6, "agg", "medium") },
    range: { epaRangeMi: f(200, "mfr", "high", "Standard Range (VIN code 7, the 99 kW motor) — EPA, same rating both years", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47831") },
    charging: PORT_CCS,
    warranty: HK_WARRANTY,
  },
  {
    id: "prologue-2025-26-awd-elite", make: "HONDA", model: "Prologue", modelYears: [2025, 2026], trim: "Elite", drive: "AWD",
    range: { epaRangeMi: f(283, "mfr", "high", "AWD Elite — EPA certifies it separately from the other AWD trims (294 mi)", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49090") },
    charging: PORT_CCS,
  },

  {
    id: "i4-2024-edrive35", ...I4, modelYears: [2024, 2024], trim: "eDrive35", drive: "RWD",
    battery: { packUsableKwh: f(67.1, "mfr", "high", "70.2 gross / 67.1 net (BMW-published, eDrive35)") },
    range: { epaRangeMi: f(276, "mfr", "high", "MY2024 eDrive35 on 18-inch wheels — EPA; 252 on 19s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46919") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },
  {
    id: "i4-2025-edrive35", ...I4, modelYears: [2025, 2025], trim: "eDrive35", drive: "RWD",
    battery: { packUsableKwh: f(67.1, "mfr", "high", "70.2 gross / 67.1 net (BMW-published, eDrive35)") },
    range: { epaRangeMi: f(266, "mfr", "high", "MY2025 eDrive35 on 18-inch wheels — EPA; 244 on 19s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48308") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },
  {
    id: "i4-2025-edrive40", ...I4, modelYears: [2025, 2025], trim: "eDrive40", drive: "RWD",
    battery: { packUsableKwh: f(81.5, "mfr", "high", "83.9 gross / 81.5 net (BMW-published)") },
    range: { epaRangeMi: f(318, "mfr", "high", "MY2025 eDrive40 on 18-inch wheels — EPA; 295 on 19s. Up from 301 in 2022–24", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48310") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },
  {
    id: "i4-2024-xdrive40", ...I4, modelYears: [2024, 2024], trim: "xDrive40", drive: "AWD",
    battery: { packUsableKwh: f(81.5, "mfr", "high", "83.9 gross / 81.5 net (BMW-published)") },
    range: { epaRangeMi: f(307, "mfr", "high", "MY2024 xDrive40 on 18-inch wheels — EPA; 279 on 19s. 2025 dropped to 287", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46917") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },
  {
    id: "i4-2026-edrive35", ...I4, modelYears: [2026, 2026], trim: "eDrive35", drive: "RWD",
    battery: { packUsableKwh: f(67.1, "mfr", "high", "70.2 gross / 67.1 net (BMW-published, eDrive35)") },
    range: { epaRangeMi: f(251, "mfr", "high", "MY2026 eDrive35 (19-inch wheels, the only certified configuration) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50187") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },
  {
    id: "i4-2026-edrive40", ...I4, modelYears: [2026, 2026], trim: "eDrive40", drive: "RWD",
    battery: { packUsableKwh: f(81.5, "mfr", "high", "83.9 gross / 81.5 net (BMW-published)") },
    range: { epaRangeMi: f(333, "mfr", "high", "MY2026 eDrive40 on 18-inch wheels — EPA; 307 on 19s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50188") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },
  {
    id: "i4-2026-xdrive40", ...I4, modelYears: [2026, 2026], trim: "xDrive40", drive: "AWD",
    battery: { packUsableKwh: f(81.5, "mfr", "high", "83.9 gross / 81.5 net (BMW-published)") },
    range: { epaRangeMi: f(287, "mfr", "high", "MY2026 xDrive40 on 18-inch wheels — EPA; 268 on 19s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50192") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },
  {
    id: "i4-2026-m60", ...I4, modelYears: [2026, 2026], trim: "M60", drive: "AWD",
    battery: { packUsableKwh: f(81.5, "mfr", "high", "83.9 gross / 81.5 net (BMW-published)") },
    range: { epaRangeMi: f(278, "mfr", "high", "MY2026 M60 xDrive (replaces the M50) on 19-inch wheels — EPA; 232 on 20s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50190") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },
  {
    id: "i5-2024-25-edrive40", ...I5, modelYears: [2024, 2025], trim: "eDrive40", drive: "RWD",
    battery: { packUsableKwh: f(81.5, "mfr", "high", "83.9 gross / 81.5 net (BMW-published)") },
    range: { epaRangeMi: f(295, "mfr", "high", "MY2024–25 i5 eDrive40 on 19-inch wheels — EPA; 270–278 on 20/21s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46923") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },
  {
    id: "i5-2025-xdrive40", ...I5, modelYears: [2025, 2025], trim: "xDrive40", drive: "AWD",
    range: { epaRangeMi: f(266, "mfr", "high", "MY2025 i5 xDrive40 on 19-inch wheels — EPA; 248–262 on 20/21s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48322") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },
  {
    id: "i5-2024-m60", ...I5, modelYears: [2024, 2024], trim: "M60", drive: "AWD",
    range: { epaRangeMi: f(256, "mfr", "high", "MY2024 i5 M60 xDrive on 19-inch wheels — EPA; 240–248 on 20/21s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46926") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },
  {
    id: "i5-2025-m60", ...I5, modelYears: [2025, 2025], trim: "M60", drive: "AWD",
    range: { epaRangeMi: f(253, "mfr", "high", "MY2025 i5 M60 xDrive on 19-inch wheels — EPA; 239–250 on 20/21s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48319") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },
  {
    id: "i5-2026-edrive40", ...I5, modelYears: [2026, 2026], trim: "eDrive40", drive: "RWD",
    battery: { packUsableKwh: f(81.5, "mfr", "high", "83.9 gross / 81.5 net (BMW-published)") },
    range: { epaRangeMi: f(310, "mfr", "high", "MY2026 i5 eDrive40 on 19-inch wheels — EPA; 278–300 on 20/21s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49613") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },
  {
    id: "i5-2026-xdrive40", ...I5, modelYears: [2026, 2026], trim: "xDrive40", drive: "AWD",
    range: { epaRangeMi: f(278, "mfr", "high", "MY2026 i5 xDrive40 on 19-inch wheels — EPA; 259–272 on 20/21s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49616") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },
  {
    id: "i5-2026-m60", ...I5, modelYears: [2026, 2026], trim: "M60", drive: "AWD",
    range: { epaRangeMi: f(277, "mfr", "high", "MY2026 i5 M60 xDrive on 19-inch wheels — EPA; 259–266 on 20/21s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50194") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },
  {
    id: "i7-2023-xdrive60", ...I7, modelYears: [2023, 2023], trim: "xDrive60", drive: "AWD",
    range: { epaRangeMi: f(318, "mfr", "high", "MY2023 i7 xDrive60 on 19-inch wheels — EPA; 296–308 on 20/21s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=45993") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },
  {
    id: "i7-2024-edrive50", ...I7, modelYears: [2024, 2024], trim: "eDrive50", drive: "RWD",
    range: { epaRangeMi: f(321, "mfr", "high", "MY2024 i7 eDrive50 on 19-inch wheels — EPA; 301–311 on 20/21s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46929") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },
  {
    id: "i7-2024-xdrive60", ...I7, modelYears: [2024, 2024], trim: "xDrive60", drive: "AWD",
    range: { epaRangeMi: f(317, "mfr", "high", "MY2024 i7 xDrive60 on 19-inch wheels — EPA; 298–307 on 20/21s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46934") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },
  {
    id: "i7-2024-m70", ...I7, modelYears: [2024, 2024], trim: "M70", drive: "AWD",
    range: { epaRangeMi: f(274, "mfr", "high", "MY2024 i7 M70 xDrive on 20-inch wheels — EPA; 291 on 21s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46932") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },
  {
    id: "i7-2025-26-edrive50", ...I7, modelYears: [2025, 2026], trim: "eDrive50", drive: "RWD",
    range: { epaRangeMi: f(314, "mfr", "high", "MY2025–26 i7 eDrive50 on 19-inch wheels — EPA; 301–307 on 20/21s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48325") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },
  {
    id: "i7-2025-26-xdrive60", ...I7, modelYears: [2025, 2026], trim: "xDrive60", drive: "AWD",
    range: { epaRangeMi: f(311, "mfr", "high", "MY2025–26 i7 xDrive60 on 19-inch wheels — EPA; 296–308 on 20/21s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48330") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },
  {
    id: "i7-2025-26-m70", ...I7, modelYears: [2025, 2026], trim: "M70", drive: "AWD",
    range: { epaRangeMi: f(268, "mfr", "high", "MY2025–26 i7 M70 xDrive on 20-inch wheels — EPA (267 for 2026); 285 on 21s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48328") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },
  {
    id: "ix-2022-23-xdrive50", ...IX, modelYears: [2022, 2023], trim: "xDrive50", drive: "AWD",
    battery: { packGrossKwh: f(111.5, "mfr", "high", "111.5 gross / 106.3 net — BMW USA press"), packUsableKwh: f(106.3, "mfr", "high") },
    range: { epaRangeMi: f(324, "mfr", "high", "MY2022–23 iX xDrive50 on 20-inch wheels — EPA; 305–315 on 21/22s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=45135") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },
  {
    id: "ix-2024-25-xdrive40", ...IX, modelYears: [2024, 2025], trim: "xDrive40", drive: "AWD",
    range: { epaRangeMi: f(217, "mfr", "high", "iX xDrive40 — EPA rates every wheel size 211–219; the smaller pack", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46939") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },
  {
    id: "ix-2024-m60", ...IX, modelYears: [2024, 2024], trim: "M60", drive: "AWD",
    battery: { packGrossKwh: f(111.5, "mfr", "high", "111.5 gross / 106.3 net — BMW USA press"), packUsableKwh: f(106.3, "mfr", "high") },
    range: { epaRangeMi: f(296, "mfr", "high", "MY2024 iX M60 — EPA, both wheel sizes", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46937") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },
  {
    id: "ix-2025-m60", ...IX, modelYears: [2025, 2025], trim: "M60", drive: "AWD",
    battery: { packGrossKwh: f(111.5, "mfr", "high", "111.5 gross / 106.3 net — BMW USA press"), packUsableKwh: f(106.3, "mfr", "high") },
    range: { epaRangeMi: f(284, "mfr", "high", "MY2025 iX M60 — EPA; 285 on 22s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48333") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },
  {
    id: "ix-2026-xdrive45", ...IX, modelYears: [2026, 2026], trim: "xDrive45", drive: "AWD",
    range: { epaRangeMi: f(312, "mfr", "high", "MY2026 iX xDrive45 (facelift) on 20-inch wheels — EPA; 279–297 on larger wheels", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49619") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },
  {
    id: "ix-2026-xdrive60", ...IX, modelYears: [2026, 2026], trim: "xDrive60", drive: "AWD",
    range: { epaRangeMi: f(364, "mfr", "high", "MY2026 iX xDrive60 (facelift) on 20-inch wheels — EPA; 318–341 on larger wheels", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49623") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },

  {
    id: "i5-2027-edrive40", ...I5, modelYears: [2027, 2027], trim: "eDrive40", drive: "RWD",
    battery: { packUsableKwh: f(81.5, "mfr", "high", "83.9 gross / 81.5 net (BMW-published)") },
    range: { epaRangeMi: f(328, "mfr", "high", "MY2027 i5 eDrive40 on 19-inch wheels — EPA; 280–299 on 20/21s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50360") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },
  {
    id: "i5-2027-xdrive40", ...I5, modelYears: [2027, 2027], trim: "xDrive40", drive: "AWD",
    range: { epaRangeMi: f(283, "mfr", "high", "MY2027 i5 xDrive40 on 19-inch wheels — EPA; 262–273 on 20/21s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50603") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },
  {
    id: "i7-2027-xdrive50", ...I7, modelYears: [2027, 2027], trim: ["xDrive50", "50 xDrive"], drive: "AWD",
    range: { epaRangeMi: f(354, "mfr", "high", "MY2027 i7 xDrive50 — EPA; 364 on 21-inch summer tires", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50604") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },
  {
    id: "i7-2027-xdrive60", ...I7, modelYears: [2027, 2027], trim: ["xDrive60", "60 xDrive"], drive: "AWD",
    range: { epaRangeMi: f(344, "mfr", "high", "MY2027 i7 xDrive60 — EPA; 348–362 on summer tires", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50607") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },

  // ── Cadillac Vistiq / Optiq MY2025 + VW ID.4 2025–26 (same pass) ────────
  // Vistiq: AWD-only, one EPA rating (305; 300 with the 19 kW charger).
  // Optiq MY2025: fueleconomy.gov has no MY2025 Optiq entry at all (control:
  // MY2026 is present) — the launch-year figure is GM's own 302-mi estimate.
  // ID.4 2025–26: drive splits the rating (RWD 291 / AWD 263, plus the 62 kWh
  // "S"/Standard at 206 in 2025); VW's Part 565 kWh figure flips between 62
  // and 82 arbitrarily (a 2024 Pro S reads "62"), so these rows ignore it.
  {
    id: "cadillac-vistiq-2026-27", make: "CADILLAC", model: "Vistiq", modelYears: [2026, 2027], drive: "AWD",
    battery: { packGrossKwh: f(102, "mfr", "medium", "Cadillac's own Vistiq specs page") },
    range: { epaRangeMi: f(305, "mfr", "high", "Vistiq (AWD-only) — EPA, same rating 2026–27; 300 with the 19 kW onboard-charger option", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49636") },
    charging: { portStandard: f("CCS1", "mfr") },
    warranty: { batteryYears: f(8, "mfr" as Source), batteryMiles: f(100_000, "mfr" as Source), batteryTransfers: f(true, "mfr" as Source) },
  },
  {
    id: "cadillac-optiq-2025", make: "CADILLAC", model: "Optiq", modelYears: [2025, 2025], drive: "AWD",
    battery: { packGrossKwh: f(85, "mfr", "high", "Cadillac's own Optiq specs page (cadillac.com)") },
    range: { epaRangeMi: f(302, "mfr", "medium", "GM-estimated — fueleconomy.gov has no MY2025 Optiq entry under any spelling (control: the MY2026 records are present); every MY2025 Optiq is dual-motor AWD") },
    charging: { portStandard: f("CCS1", "mfr") },
    warranty: { batteryYears: f(8, "mfr" as Source), batteryMiles: f(100_000, "mfr" as Source), batteryTransfers: f(true, "mfr" as Source) },
  },
  {
    id: "id4-2025-rwd-pro", make: "VOLKSWAGEN", model: "ID.4", modelYears: [2025, 2025], trim: ["Pro", "Pro S", "Pro S Plus"], drive: "RWD", ignoreKwhHint: true,
    battery: { packUsableKwh: f(77, "mfr", "high", "82 kWh gross / 77 usable — the Pro pack") },
    range: { epaRangeMi: f(291, "mfr", "high", "MY2025 ID.4 Pro / Pro S RWD — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49156") },
    charging: { portStandard: f("CCS1", "mfr") },
    warranty: { batteryYears: f(8, "mfr" as Source), batteryMiles: f(100_000, "mfr" as Source), batteryTransfers: f(true, "mfr" as Source) },
  },
  {
    id: "id4-2025-awd-pro", make: "VOLKSWAGEN", model: "ID.4", modelYears: [2025, 2025], trim: ["Pro", "Pro S", "Pro S Plus", "1st Edition"], drive: "AWD", ignoreKwhHint: true,
    battery: { packUsableKwh: f(77, "mfr", "high", "82 kWh gross / 77 usable — the Pro pack") },
    range: { epaRangeMi: f(263, "mfr", "high", "MY2025 ID.4 AWD Pro / Pro S — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48773") },
    charging: { portStandard: f("CCS1", "mfr") },
    warranty: { batteryYears: f(8, "mfr" as Source), batteryMiles: f(100_000, "mfr" as Source), batteryTransfers: f(true, "mfr" as Source) },
  },
  {
    id: "id4-2025-standard", make: "VOLKSWAGEN", model: "ID.4", modelYears: [2025, 2025], trim: ["Standard", "S"], drive: "RWD", ignoreKwhHint: true,
    battery: { packUsableKwh: f(58, "mfr", "high", "62 kWh gross / 58 usable — the Standard pack") },
    range: { epaRangeMi: f(206, "mfr", "high", "MY2025 ID.4 / ID.4 S (62 kWh Standard pack) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49155") },
    charging: { portStandard: f("CCS1", "mfr") },
    warranty: { batteryYears: f(8, "mfr" as Source), batteryMiles: f(100_000, "mfr" as Source), batteryTransfers: f(true, "mfr" as Source) },
  },
  {
    id: "id4-2026-rwd", make: "VOLKSWAGEN", model: "ID.4", modelYears: [2026, 2026], drive: "RWD", ignoreKwhHint: true,
    battery: { packUsableKwh: f(77, "mfr", "high", "82 kWh gross / 77 usable — MY2026 dropped the Standard pack") },
    range: { epaRangeMi: f(291, "mfr", "high", "MY2026 ID.4 RWD — EPA (the Standard pack is gone; one RWD rating)", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49987") },
    charging: { portStandard: f("CCS1", "mfr") },
    warranty: { batteryYears: f(8, "mfr" as Source), batteryMiles: f(100_000, "mfr" as Source), batteryTransfers: f(true, "mfr" as Source) },
  },
  {
    id: "id4-2026-awd", make: "VOLKSWAGEN", model: "ID.4", modelYears: [2026, 2026], drive: "AWD", ignoreKwhHint: true,
    battery: { packUsableKwh: f(77, "mfr", "high", "82 kWh gross / 77 usable") },
    range: { epaRangeMi: f(263, "mfr", "high", "MY2026 ID.4 AWD — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49988") },
    charging: { portStandard: f("CCS1", "mfr") },
    warranty: { batteryYears: f(8, "mfr" as Source), batteryMiles: f(100_000, "mfr" as Source), batteryTransfers: f(true, "mfr" as Source) },
  },

  // ── Nissan LEAF fill-ins + gen-3 2026 / Volvo XC40-C40-EX30 / Toyota C-HR
  //    / Jeep Wagoneer S (same pass) ───────────────────────────────────────
  // 2026 LEAF codes per Nissan Part 565: A = 75 kWh S+/SV+ (S+ rides 18-inch
  // steel wheels and rates highest), B = Platinum+ (19-inch). First LEAF with
  // a native NACS port — the CHAdeMO era ends here. Volvo's Part 565 text
  // names the motor config per VIN ("(eRWD) Single Motor, Extended range" /
  // "(eAWD) Twin Motor"): 2024 K = single, M = twin; 2021–23 sold twin-only
  // so the code doesn't matter. EX30: K = Single Motor, L = Twin Performance.
  {
    id: "leaf-2011-12", make: "NISSAN", model: "Leaf", modelYears: [2011, 2012],
    battery: { packGrossKwh: f(24, "mfr", "high") },
    range: { epaRangeMi: f(73, "mfr", "high", "MY2011–12 (24 kWh) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=30979") },
    charging: { portStandard: f("CHAdeMO", "mfr", "high", "DC fast charging was optional on early cars; the port is CHAdeMO where fitted") },
    thermal: { heatPump: f("none", "mfr") },
  },
  {
    id: "leaf-2013", make: "NISSAN", model: "Leaf", modelYears: [2013, 2013],
    battery: { packGrossKwh: f(24, "mfr", "high") },
    range: { epaRangeMi: f(75, "mfr", "high", "MY2013 (24 kWh) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=33558") },
    charging: { portStandard: f("CHAdeMO", "mfr", "high", "DC fast charging optional (standard on SV/SL); CHAdeMO where fitted") },
    thermal: { heatPump: f("standard", "mfr", "high", "Hybrid heat pump system from MY2013 (SV/SL)") },
  },
  {
    id: "leaf-2016-s", make: "NISSAN", model: "Leaf", modelYears: [2016, 2016], trim: "S",
    battery: { packGrossKwh: f(24, "mfr", "high", "The S kept the 24 kWh pack in 2016; SV/SL moved to 30 kWh") },
    range: { epaRangeMi: f(84, "mfr", "high", "MY2016 S (24 kWh) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=37066") },
    charging: { portStandard: f("CHAdeMO", "mfr") },
  },
  {
    id: "leaf-2016-sv-sl", make: "NISSAN", model: "Leaf", modelYears: [2016, 2016], trim: ["SV", "SL"],
    battery: { packGrossKwh: f(30, "mfr", "high") },
    range: { epaRangeMi: f(107, "mfr", "high", "MY2016 SV/SL (30 kWh) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=37067") },
    charging: { portStandard: f("CHAdeMO", "mfr") },
  },
  {
    id: "leaf-2017", make: "NISSAN", model: "Leaf", modelYears: [2017, 2017],
    battery: { packGrossKwh: f(30, "mfr", "high") },
    range: { epaRangeMi: f(107, "mfr", "high", "MY2017 (30 kWh standard) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=38428") },
    charging: { portStandard: f("CHAdeMO", "mfr") },
  },
  {
    id: "leaf-2026-splus", make: "NISSAN", model: "Leaf", modelYears: [2026, 2026], vin8: ["A"], trim: ["S+", "S"],
    battery: { packGrossKwh: f(75, "mfr", "high") },
    range: { epaRangeMi: f(303, "mfr", "high", "MY2026 LEAF S+ (75 kWh, 18-inch steel wheels) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49975") },
    charging: { portStandard: f("NACS", "mfr", "high", "First LEAF with a native NACS port") },
    warranty: { batteryYears: f(8, "mfr" as Source), batteryMiles: f(100_000, "mfr" as Source) },
  },
  {
    id: "leaf-2026-svplus", make: "NISSAN", model: "Leaf", modelYears: [2026, 2026], vin8: ["A"], trim: ["SV+", "SV"],
    battery: { packGrossKwh: f(75, "mfr", "high") },
    range: { epaRangeMi: f(288, "mfr", "high", "MY2026 LEAF SV+ (75 kWh, 18-inch alloys) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49974") },
    charging: { portStandard: f("NACS", "mfr", "high", "First LEAF with a native NACS port") },
    warranty: { batteryYears: f(8, "mfr" as Source), batteryMiles: f(100_000, "mfr" as Source) },
  },
  {
    id: "leaf-2026-platinum", make: "NISSAN", model: "Leaf", modelYears: [2026, 2026], vin8: ["B"],
    battery: { packGrossKwh: f(75, "mfr", "high") },
    range: { epaRangeMi: f(259, "mfr", "high", "MY2026 LEAF Platinum+ (VIN code B; 19-inch wheels) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49976") },
    charging: { portStandard: f("NACS", "mfr", "high", "First LEAF with a native NACS port") },
    warranty: { batteryYears: f(8, "mfr" as Source), batteryMiles: f(100_000, "mfr" as Source) },
  },
  {
    id: "xc40-recharge-2021", make: "VOLVO", model: "XC40 Recharge Pure Electric", modelYears: [2021, 2021], drive: "AWD",
    range: { epaRangeMi: f(208, "mfr", "high", "MY2021 XC40 Recharge (twin motor, the only version) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=43295") },
    charging: { portStandard: f("CCS1", "mfr") },
  },
  {
    id: "xc40-recharge-2022-23", make: "VOLVO", model: "XC40 Recharge Pure Electric", modelYears: [2022, 2023], drive: "AWD",
    range: { epaRangeMi: f(223, "mfr", "high", "MY2022–23 XC40 Recharge Twin — EPA; every US 2022–23 car is the twin-motor", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=44450") },
    charging: { portStandard: f("CCS1", "mfr") },
  },
  {
    id: "xc40-recharge-2024-single", make: "VOLVO", model: "XC40 Recharge Pure Electric", modelYears: [2024, 2024], vin8: ["K"], drive: "RWD",
    range: { epaRangeMi: f(293, "mfr", "high", "MY2024 single-motor extended range (VIN code K — Volvo's Part 565 text names it eRWD Single Motor) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46981") },
    charging: { portStandard: f("CCS1", "mfr") },
  },
  {
    id: "xc40-recharge-2024-twin", make: "VOLVO", model: "XC40 Recharge Pure Electric", modelYears: [2024, 2024], vin8: ["M"], drive: "AWD",
    range: { epaRangeMi: f(254, "mfr", "high", "MY2024 Twin (VIN code M — eAWD Twin Motor in Volvo's Part 565 text) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46983") },
    charging: { portStandard: f("CCS1", "mfr") },
  },
  {
    id: "c40-recharge-2022-23", make: "VOLVO", model: "C40 Recharge Pure Electric", modelYears: [2022, 2023], drive: "AWD",
    range: { epaRangeMi: f(226, "mfr", "high", "MY2022–23 C40 Recharge Twin — EPA; every US 2022–23 car is the twin-motor", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=44929") },
    charging: { portStandard: f("CCS1", "mfr") },
  },
  {
    id: "c40-recharge-2024-single", make: "VOLVO", model: "C40 Recharge Pure Electric", modelYears: [2024, 2024], vin8: ["K"], drive: "RWD",
    range: { epaRangeMi: f(297, "mfr", "high", "MY2024 single-motor extended range (VIN code K) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46980") },
    charging: { portStandard: f("CCS1", "mfr") },
  },
  {
    id: "c40-recharge-2024-twin", make: "VOLVO", model: "C40 Recharge Pure Electric", modelYears: [2024, 2024], vin8: ["M"], drive: "AWD",
    range: { epaRangeMi: f(257, "mfr", "high", "MY2024 Twin (VIN code M) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46982") },
    charging: { portStandard: f("CCS1", "mfr") },
  },
  {
    id: "ex30-2025-single", make: "VOLVO", model: "EX30", modelYears: [2025, 2025], trim: ["Single Motor"], drive: "RWD",
    battery: { packGrossKwh: f(69, "vin", "high", "69 kWh NMC — Volvo's own Part 565 submission") },
    range: { epaRangeMi: f(257, "mfr", "high", "MY2025 EX30 Single Motor Extended Range on 18-inch wheels — EPA; 261 on 19/20s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48449") },
    charging: { portStandard: f("CCS1", "mfr") },
  },
  {
    id: "ex30-2026-single", make: "VOLVO", model: "EX30", modelYears: [2026, 2026], trim: ["Single Motor"], drive: "RWD",
    battery: { packGrossKwh: f(69, "vin", "high", "69 kWh NMC — Volvo's own Part 565 submission") },
    range: { epaRangeMi: f(261, "mfr", "high", "MY2026 EX30 Single Motor Extended Range — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49989") },
    charging: { portStandard: f("CCS1", "mfr") },
  },
  {
    id: "ex30-2025-26-twin", make: "VOLVO", model: "EX30", modelYears: [2025, 2026], trim: ["Twin", "Ultra"], drive: "AWD",
    battery: { packGrossKwh: f(69, "vin", "high", "69 kWh NMC — Volvo's own Part 565 submission") },
    range: { epaRangeMi: f(253, "mfr", "high", "EX30 Twin Performance — EPA, same rating both years; 250 on 20-inch wheels in 2025", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48775") },
    charging: { portStandard: f("CCS1", "mfr") },
  },
  {
    id: "ex30-cc-2026", make: "VOLVO", model: "EX30 Cross Country", modelYears: [2026, 2026], drive: "AWD",
    battery: { packGrossKwh: f(69, "vin", "high", "69 kWh NMC — Volvo's own Part 565 submission") },
    range: { epaRangeMi: f(227, "mfr", "high", "MY2026 EX30 Cross Country on its standard 19-inch wheels — EPA; 203 on 18s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49991") },
    charging: { portStandard: f("CCS1", "mfr") },
  },
  {
    id: "chr-bev-2026", make: "TOYOTA", model: "C-HR", modelYears: [2026, 2026], drive: "AWD",
    battery: { packGrossKwh: f(74.7, "agg", "medium") },
    range: { epaRangeMi: f(287, "mfr", "high", "MY2026 C-HR BEV (AWD-only) on 18-inch wheels — EPA; 273 on 20s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50307") },
    charging: { portStandard: f("NACS", "agg", "high", "Native NACS port from launch") },
  },
  {
    id: "wagoneer-s-2025-26", make: "JEEP", model: "Wagoneer S", modelYears: [2025, 2026], drive: "AWD",
    battery: { packGrossKwh: f(100, "agg", "medium") },
    range: { epaRangeMi: f(294, "mfr", "high", "Wagoneer S AWD — EPA (Falken-tire certification); the Pirelli-tire fitment rates 262–268", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49093") },
    charging: { portStandard: f("CCS1", "mfr") },
  },
  {
    id: "wagoneer-s-2024", make: "JEEP", model: "Wagoneer S", modelYears: [2024, 2024], drive: "AWD",
    battery: { packGrossKwh: f(100, "agg", "medium") },
    range: { epaRangeMi: f(303, "mfr", "high", "MY2024 Wagoneer S Launch Edition — EPA (Falken-tire certification); the Pirelli fitment rates 270", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48791") },
    charging: { portStandard: f("CCS1", "mfr") },
  },
  {
    id: "lyriq-v-2026-27", make: "CADILLAC", model: "Lyriq", modelYears: [2026, 2027], vin8: ["L"], trim: ["V-Series", "V Premium", "V Sport"], drive: "AWD",
    range: { epaRangeMi: f(285, "mfr", "high", "Lyriq-V (PAWD V-Series) — EPA, same rating 2026–27 and both charger configurations", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49633") },
    charging: { portStandard: f("CCS1", "mfr") },
    warranty: { batteryYears: f(8, "mfr" as Source), batteryMiles: f(100_000, "mfr" as Source), batteryTransfers: f(true, "mfr" as Source) },
  },

  {
    id: "ms-2021-23-lr", ...MS, modelYears: [2021, 2023], vin8: ["5"], drive: "AWD", packVariant: "Long Range",
    battery: TSX_PACK,
    range: { epaRangeMi: f(405, "mfr", "high", "MY2021–23 Model S (dual-motor VIN code 5) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=44051") },
    charging: TSX_CHARGING,
    thermal: { heatPump: f("standard", "mfr"), batteryPreconditioning: f(true, "mfr") },
    warranty: TSX_W,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "ms-2024-lr", ...MS, modelYears: [2024, 2024], vin8: ["5"], drive: "AWD", packVariant: "Long Range",
    battery: TSX_PACK,
    range: { epaRangeMi: f(402, "mfr", "high", "MY2024 Model S (dual-motor VIN code 5) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47910") },
    charging: TSX_CHARGING,
    thermal: { heatPump: f("standard", "mfr"), batteryPreconditioning: f(true, "mfr") },
    warranty: TSX_W,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "ms-2025-26-lr", ...MS, modelYears: [2025, 2026], vin8: ["5"], drive: "AWD", packVariant: "Long Range",
    battery: TSX_PACK,
    range: { epaRangeMi: f(410, "mfr", "high", "MY2025–26 Model S (dual-motor VIN code 5) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49124") },
    charging: TSX_CHARGING,
    thermal: { heatPump: f("standard", "mfr"), batteryPreconditioning: f(true, "mfr") },
    warranty: TSX_W,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "ms-2021-plaid", ...MS, modelYears: [2021, 2021], vin8: ["6"], drive: "AWD", packVariant: "Plaid",
    battery: TSX_PACK,
    range: { epaRangeMi: f(348, "mfr", "high", "MY2021 Plaid (tri-motor VIN code 6) on 21-inch wheels, the only 2021 Plaid certification — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=44069") },
    charging: TSX_CHARGING,
    thermal: { heatPump: f("standard", "mfr"), batteryPreconditioning: f(true, "mfr") },
    warranty: TSX_W,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "ms-2022-23-plaid", ...MS, modelYears: [2022, 2023], vin8: ["6"], drive: "AWD", packVariant: "Plaid",
    battery: TSX_PACK,
    range: { epaRangeMi: f(396, "mfr", "high", "MY2022–23 Plaid (tri-motor VIN code 6) on 19-inch wheels — EPA; 348 on 21s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=45015") },
    charging: TSX_CHARGING,
    thermal: { heatPump: f("standard", "mfr"), batteryPreconditioning: f(true, "mfr") },
    warranty: TSX_W,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "ms-2024-plaid", ...MS, modelYears: [2024, 2024], vin8: ["6"], drive: "AWD", packVariant: "Plaid",
    battery: TSX_PACK,
    range: { epaRangeMi: f(359, "mfr", "high", "MY2024 Plaid on 19-inch wheels — EPA; 320 on 21s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47911") },
    charging: TSX_CHARGING,
    thermal: { heatPump: f("standard", "mfr"), batteryPreconditioning: f(true, "mfr") },
    warranty: TSX_W,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "ms-2025-plaid", ...MS, modelYears: [2025, 2025], vin8: ["6"], drive: "AWD", packVariant: "Plaid",
    battery: TSX_PACK,
    range: { epaRangeMi: f(348, "mfr", "high", "MY2025 Plaid on 19-inch wheels — EPA; 312 on 21s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48766") },
    charging: TSX_CHARGING,
    thermal: { heatPump: f("standard", "mfr"), batteryPreconditioning: f(true, "mfr") },
    warranty: TSX_W,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "ms-2026-plaid", ...MS, modelYears: [2026, 2026], vin8: ["6"], drive: "AWD", packVariant: "Plaid",
    battery: TSX_PACK,
    range: { epaRangeMi: f(368, "mfr", "high", "MY2026 Plaid — EPA; 309 on 21-inch wheels", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49742") },
    charging: TSX_CHARGING,
    thermal: { heatPump: f("standard", "mfr"), batteryPreconditioning: f(true, "mfr") },
    warranty: TSX_W,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "ms-2021-perf", ...MS, modelYears: [2021, 2021], vin8: ["4"], drive: "AWD", packVariant: "Performance",
    battery: TSX_PACK,
    range: { epaRangeMi: f(387, "mfr", "high", "MY2021 Performance carryover (dual-performance VIN code 4) on 19-inch wheels — EPA; 334 on 21s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=43516") },
    charging: TSX_CHARGING,
    thermal: { heatPump: f("standard", "mfr"), batteryPreconditioning: f(true, "mfr") },
    warranty: TSX_W,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "mx-2021-lrplus", ...MX, modelYears: [2021, 2021], vin8: ["2"], drive: "AWD", packVariant: "Long Range Plus",
    battery: TSX_PACK,
    range: { epaRangeMi: f(371, "mfr", "high", "MY2021 Model X Long Range Plus carryover (dual-standard VIN code 2) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=43403") },
    charging: TSX_CHARGING,
    thermal: { heatPump: f("standard", "mfr"), batteryPreconditioning: f(true, "mfr") },
    warranty: TSX_W,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "mx-2021-perf", ...MX, modelYears: [2021, 2021], vin8: ["4"], drive: "AWD", packVariant: "Performance",
    battery: TSX_PACK,
    range: { epaRangeMi: f(341, "mfr", "high", "MY2021 Model X Performance carryover (VIN code 4) on 20-inch wheels — EPA; 300 on 22s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=43404") },
    charging: TSX_CHARGING,
    thermal: { heatPump: f("standard", "mfr"), batteryPreconditioning: f(true, "mfr") },
    warranty: TSX_W,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "mx-2022-23-lr", ...MX, modelYears: [2022, 2023], vin8: ["5"], drive: "AWD", packVariant: "Long Range",
    battery: TSX_PACK,
    range: { epaRangeMi: f(348, "mfr", "high", "MY2022–23 Model X (dual-motor VIN code 5) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=45020") },
    charging: TSX_CHARGING,
    thermal: { heatPump: f("standard", "mfr"), batteryPreconditioning: f(true, "mfr") },
    warranty: TSX_W,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "mx-2024-lr", ...MX, modelYears: [2024, 2024], vin8: ["5"], drive: "AWD", packVariant: "Long Range",
    battery: TSX_PACK,
    range: { epaRangeMi: f(335, "mfr", "high", "MY2024 Model X (dual-motor VIN code 5) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47915") },
    charging: TSX_CHARGING,
    thermal: { heatPump: f("standard", "mfr"), batteryPreconditioning: f(true, "mfr") },
    warranty: TSX_W,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "mx-2025-lr", ...MX, modelYears: [2025, 2025], vin8: ["5"], drive: "AWD", packVariant: "Long Range",
    battery: TSX_PACK,
    range: { epaRangeMi: f(329, "mfr", "high", "MY2025 Model X (dual-motor VIN code 5) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49125") },
    charging: TSX_CHARGING,
    thermal: { heatPump: f("standard", "mfr"), batteryPreconditioning: f(true, "mfr") },
    warranty: TSX_W,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "mx-2026-lr", ...MX, modelYears: [2026, 2026], vin8: ["5"], drive: "AWD", packVariant: "Long Range",
    battery: TSX_PACK,
    range: { epaRangeMi: f(352, "mfr", "high", "MY2026 Model X (dual-motor VIN code 5) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49745") },
    charging: TSX_CHARGING,
    thermal: { heatPump: f("standard", "mfr"), batteryPreconditioning: f(true, "mfr") },
    warranty: TSX_W,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "mx-2022-23-plaid", ...MX, modelYears: [2022, 2023], vin8: ["6"], drive: "AWD", packVariant: "Plaid",
    battery: TSX_PACK,
    range: { epaRangeMi: f(333, "mfr", "high", "MY2022–23 Model X Plaid (tri-motor VIN code 6) on 20-inch wheels — EPA; 311 on 22s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=45021") },
    charging: TSX_CHARGING,
    thermal: { heatPump: f("standard", "mfr"), batteryPreconditioning: f(true, "mfr") },
    warranty: TSX_W,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "mx-2024-plaid", ...MX, modelYears: [2024, 2024], vin8: ["6"], drive: "AWD", packVariant: "Plaid",
    battery: TSX_PACK,
    range: { epaRangeMi: f(326, "mfr", "high", "MY2024 Model X Plaid on 20-inch wheels — EPA; 300 on 22s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47916") },
    charging: TSX_CHARGING,
    thermal: { heatPump: f("standard", "mfr"), batteryPreconditioning: f(true, "mfr") },
    warranty: TSX_W,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "mx-2025-plaid", ...MX, modelYears: [2025, 2025], vin8: ["6"], drive: "AWD", packVariant: "Plaid",
    battery: TSX_PACK,
    range: { epaRangeMi: f(314, "mfr", "high", "MY2025 Model X Plaid on 20-inch wheels — EPA; 294 on 22s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48768") },
    charging: TSX_CHARGING,
    thermal: { heatPump: f("standard", "mfr"), batteryPreconditioning: f(true, "mfr") },
    warranty: TSX_W,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "mx-2026-plaid", ...MX, modelYears: [2026, 2026], vin8: ["6"], drive: "AWD", packVariant: "Plaid",
    battery: TSX_PACK,
    range: { epaRangeMi: f(335, "mfr", "high", "MY2026 Model X Plaid — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49746") },
    charging: TSX_CHARGING,
    thermal: { heatPump: f("standard", "mfr"), batteryPreconditioning: f(true, "mfr") },
    warranty: TSX_W,
    buyerNotes: [NOTE_FSD],
  },

  // ── Polestar 2 / Volvo EX90 (same pass) ─────────────────────────────────
  // Polestar's VIN code doesn't discriminate (every year reads "A"); trim
  // carries Single vs Dual Motor and the drive field settles unlabeled cars
  // (single = FWD through 2023, RWD from the 2024 facelift; dual = AWD).
  // Wheel spreads noted, 19" base figure carried. EX90 2025: Twin and Twin
  // Performance carry identical EPA ratings, so one row covers both codes;
  // 2026 K's meaning is unverified (a single-motor variant appeared) — only
  // the L = Twin row is claimed.
  {
    id: "polestar2-2022-single", make: "POLESTAR", model: "Polestar 2", modelYears: [2022, 2022], trim: ["Long Range Single Motor", "Single Motor", "Plus"], drive: "FWD",
    battery: { packGrossKwh: f(78, "vin", "high", "78 kWh — Polestar's own Part 565 submission") },
    range: { epaRangeMi: f(270, "mfr", "high", "MY2022 Single Motor (FWD) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=44928") },
    charging: { portStandard: f("CCS1", "mfr") },
    warranty: { batteryYears: f(8, "mfr" as Source), batteryMiles: f(100_000, "mfr" as Source), batteryTransfers: f(true, "mfr" as Source) },
  },
  {
    id: "polestar2-2022-dual", make: "POLESTAR", model: "Polestar 2", modelYears: [2022, 2022], trim: ["Long Range Dual Motor", "Dual Motor", "Performance", "Plus", "e-AWD"], drive: "AWD",
    battery: { packGrossKwh: f(78, "vin", "high", "78 kWh — Polestar's own Part 565 submission") },
    range: { epaRangeMi: f(249, "mfr", "high", "MY2022 Dual Motor (AWD) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=44449") },
    charging: { portStandard: f("CCS1", "mfr") },
    warranty: { batteryYears: f(8, "mfr" as Source), batteryMiles: f(100_000, "mfr" as Source), batteryTransfers: f(true, "mfr" as Source) },
  },
  {
    id: "polestar2-2023-single", make: "POLESTAR", model: "Polestar 2", modelYears: [2023, 2023], trim: ["Long Range Single Motor", "Single Motor", "Plus"], drive: "FWD",
    battery: { packGrossKwh: f(78, "vin", "high", "78 kWh — Polestar's own Part 565 submission") },
    range: { epaRangeMi: f(270, "mfr", "high", "MY2023 Single Motor (FWD) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=45755") },
    charging: { portStandard: f("CCS1", "mfr") },
    warranty: { batteryYears: f(8, "mfr" as Source), batteryMiles: f(100_000, "mfr" as Source), batteryTransfers: f(true, "mfr" as Source) },
  },
  {
    id: "polestar2-2023-dual", make: "POLESTAR", model: "Polestar 2", modelYears: [2023, 2023], trim: ["Long Range Dual Motor", "Dual Motor", "Performance", "Plus"], drive: "AWD",
    battery: { packGrossKwh: f(78, "vin", "high", "78 kWh — Polestar's own Part 565 submission") },
    range: { epaRangeMi: f(260, "mfr", "high", "MY2023 Dual Motor (AWD) — EPA; the Performance Pack rates the same, the BST edition 247", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=45753") },
    charging: { portStandard: f("CCS1", "mfr") },
    warranty: { batteryYears: f(8, "mfr" as Source), batteryMiles: f(100_000, "mfr" as Source), batteryTransfers: f(true, "mfr" as Source) },
  },
  {
    id: "polestar2-2024-25-single", make: "POLESTAR", model: "Polestar 2", modelYears: [2024, 2025], trim: ["Long Range Single Motor", "Single Motor", "Plus"], drive: "RWD",
    battery: { packGrossKwh: f(82, "agg", "medium", "The facelift's larger pack; RWD from MY2024") },
    range: { epaRangeMi: f(320, "mfr", "high", "MY2024 Single Motor (now RWD) on 19-inch wheels — EPA; 307 on 20s; MY2025: 314/300", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46978") },
    charging: { portStandard: f("CCS1", "mfr") },
    warranty: { batteryYears: f(8, "mfr" as Source), batteryMiles: f(100_000, "mfr" as Source), batteryTransfers: f(true, "mfr" as Source) },
  },
  {
    id: "polestar2-2024-25-dual", make: "POLESTAR", model: "Polestar 2", modelYears: [2024, 2025], trim: ["Long Range Dual Motor", "Dual Motor", "Performance", "Plus"], drive: "AWD",
    battery: { packGrossKwh: f(82, "agg", "medium") },
    range: { epaRangeMi: f(276, "mfr", "high", "MY2024 Dual Motor on 19-inch wheels — EPA; 266 on 20s, 247 with the Performance Pack; MY2025: 278/268/254", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46975") },
    charging: { portStandard: f("CCS1", "mfr") },
    warranty: { batteryYears: f(8, "mfr" as Source), batteryMiles: f(100_000, "mfr" as Source), batteryTransfers: f(true, "mfr" as Source) },
  },
  {
    id: "ex90-2025", make: "VOLVO", model: "EX90", modelYears: [2025, 2025], vin8: ["K", "L"], drive: "AWD",
    battery: { packGrossKwh: f(111, "vin", "high", "111 kWh — Volvo's own Part 565 submission") },
    range: { epaRangeMi: f(300, "mfr", "high", "MY2025 EX90 Twin Motor — EPA; Twin and Twin Performance rate identically (310 on 21-inch wheels)", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48777") },
    charging: { portStandard: f("CCS1", "mfr") },
    warranty: { batteryYears: f(8, "mfr" as Source), batteryMiles: f(100_000, "mfr" as Source), batteryTransfers: f(true, "mfr" as Source) },
  },
  {
    id: "ex90-2026-twin", make: "VOLVO", model: "EX90", modelYears: [2026, 2026], trim: ["Twin Motor", "Twin", "Ultra"], drive: "AWD",
    battery: { packGrossKwh: f(111, "vin", "high", "111 kWh — Volvo's own Part 565 submission") },
    range: { epaRangeMi: f(298, "mfr", "high", "MY2026 EX90 Twin Motor — EPA; 305 on 21-inch wheels; Performance rates the same. Keyed on trim: Volvo\u2019s VIN code is the trim level (K=Plus/L=Ultra), not the motor", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50256") },
    charging: { portStandard: f("CCS1", "mfr") },
    warranty: { batteryYears: f(8, "mfr" as Source), batteryMiles: f(100_000, "mfr" as Source), batteryTransfers: f(true, "mfr" as Source) },
  },
  {
    id: "ex90-2026-single", make: "VOLVO", model: "EX90", modelYears: [2026, 2026], trim: ["Single Motor"], drive: "RWD",
    battery: { packGrossKwh: f(104, "agg", "medium", "The single-motor EX90 uses the smaller pack") },
    range: { epaRangeMi: f(276, "mfr", "high", "MY2026 EX90 Single Motor — EPA; 291 on 21-inch wheels", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50254") },
    charging: { portStandard: f("CCS1", "mfr") },
    warranty: { batteryYears: f(8, "mfr" as Source), batteryMiles: f(100_000, "mfr" as Source), batteryTransfers: f(true, "mfr" as Source) },
  },

  {
    id: "r1s-2022", ...R1S, modelYears: [2022, 2022], drive: "AWD", packVariant: "Quad · Large pack",
    battery: RIV_128,
    range: { epaRangeMi: f(316, "mfr", "high", "MY2022 R1S — every 2022 build is the quad-motor Large pack — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=44461") },
    charging: RIV_PORT1,
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
  },
  {
    id: "r1t-2022", ...R1T, modelYears: [2022, 2022], drive: "AWD", packVariant: "Quad · Large pack",
    battery: RIV_128,
    range: { epaRangeMi: f(314, "mfr", "high", "MY2022 R1T — every 2022 build is the quad-motor Large pack — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=44462") },
    charging: RIV_PORT1,
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
  },
  {
    id: "r1s-2023-quad", ...R1S, modelYears: [2023, 2023], trim: ["Quad Motor", "Quad", "Quad Motor Large Pack"], drive: "AWD", packVariant: "Quad · Large pack",
    battery: RIV_128,
    range: { epaRangeMi: f(321, "mfr", "high", "MY2023 R1S quad-motor on 21-inch wheels — EPA; 274–303 on 20AT/22s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46316") },
    charging: RIV_PORT1,
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
  },
  {
    id: "r1t-2023-quad", ...R1T, modelYears: [2023, 2023], trim: ["Quad Motor", "Quad", "Quad Motor Large Pack"], drive: "AWD", packVariant: "Quad · Large pack",
    battery: RIV_128,
    range: { epaRangeMi: f(328, "mfr", "high", "MY2023 R1T quad-motor on 21-inch wheels — EPA; 289–303 on 20/22s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46313") },
    charging: RIV_PORT1,
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
  },
  {
    id: "r1s-2023-dual", ...R1S, modelYears: [2023, 2023], trim: ["Dual Motor", "Large Pack", "Large", "Performance"], drive: "AWD", packVariant: "Dual · Large pack",
    battery: RIV_128,
    range: { epaRangeMi: f(352, "mfr", "high", "MY2023 R1S Dual (Large pack, the only 2023 dual config) on 21-inch wheels — EPA; 307–341 on 20AT/22s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46996") },
    charging: RIV_PORT1,
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
  },
  {
    id: "r1t-2023-dual", ...R1T, modelYears: [2023, 2023], trim: ["Dual Motor", "Large Pack", "Large", "Performance"], drive: "AWD", packVariant: "Dual · Large pack",
    battery: RIV_128,
    range: { epaRangeMi: f(352, "mfr", "high", "MY2023 R1T Dual (Large pack) on 21-inch wheels — EPA; 341 on 22s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47000") },
    charging: RIV_PORT1,
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
  },
  {
    id: "r1s-2024-quad", ...R1S, modelYears: [2024, 2024], trim: ["Quad Motor", "Quad", "Quad Motor Large Pack"], drive: "AWD", packVariant: "Quad · Large pack",
    battery: RIV_128,
    range: { epaRangeMi: f(321, "mfr", "high", "MY2024 R1S quad on 21-inch wheels — EPA; 274–303 on 20AT/22s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47906") },
    charging: RIV_PORT1,
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
  },
  {
    id: "r1t-2024-quad", ...R1T, modelYears: [2024, 2024], trim: ["Quad Motor", "Quad", "Quad Motor Large Pack"], drive: "AWD", packVariant: "Quad · Large pack",
    battery: RIV_128,
    range: { epaRangeMi: f(328, "mfr", "high", "MY2024 R1T quad on 21-inch wheels — EPA; 289–303 on 20/22s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47883") },
    charging: RIV_PORT1,
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
  },
  {
    id: "r1s-2024-std", ...R1S, modelYears: [2024, 2024], trim: ["Standard Pack", "Standard", "Dual Motor"], drive: "AWD", packVariant: "Dual · Standard pack",
    range: { epaRangeMi: f(270, "mfr", "high", "MY2024 R1S Dual Standard on 21-inch wheels — EPA; 255 on 22s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47895") },
    charging: RIV_PORT1,
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
  },
  {
    id: "r1t-2024-std", ...R1T, modelYears: [2024, 2024], trim: ["Standard Pack", "Standard", "Dual Motor"], drive: "AWD", packVariant: "Dual · Standard pack",
    range: { epaRangeMi: f(270, "mfr", "high", "MY2024 R1T Dual Standard on 21-inch wheels — EPA; 255 on 22s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47872") },
    charging: RIV_PORT1,
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
  },
  {
    id: "r1s-2024-stdplus", ...R1S, modelYears: [2024, 2024], trim: ["Standard Plus Pack", "Standard Plus"], drive: "AWD", packVariant: "Dual · Standard+ pack",
    range: { epaRangeMi: f(315, "mfr", "high", "MY2024 R1S Dual Standard+ on 21-inch wheels — EPA; 277–300 on 20AT/22s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47897") },
    charging: RIV_PORT1,
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
  },
  {
    id: "r1t-2024-stdplus", ...R1T, modelYears: [2024, 2024], trim: ["Standard Plus Pack", "Standard Plus"], drive: "AWD", packVariant: "Dual · Standard+ pack",
    range: { epaRangeMi: f(315, "mfr", "high", "MY2024 R1T Dual Standard+ on 21-inch wheels — EPA; 277–300 on 20AT/22s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47874") },
    charging: RIV_PORT1,
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
  },
  {
    id: "r1s-2024-large", ...R1S, modelYears: [2024, 2024], trim: ["Large Pack", "Large", "Dual Motor"], drive: "AWD", packVariant: "Dual · Large pack",
    battery: RIV_128,
    range: { epaRangeMi: f(352, "mfr", "high", "MY2024 R1S Dual Large on 21-inch wheels — EPA; 307–341 on 20AT/22s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47891") },
    charging: RIV_PORT1,
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
  },
  {
    id: "r1t-2024-large", ...R1T, modelYears: [2024, 2024], trim: ["Large Pack", "Large", "Dual Motor"], drive: "AWD", packVariant: "Dual · Large pack",
    battery: RIV_128,
    range: { epaRangeMi: f(352, "mfr", "high", "MY2024 R1T Dual Large on 21-inch wheels — EPA; 307–341 on 20AT/22s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47868") },
    charging: RIV_PORT1,
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
  },
  {
    id: "r1s-2024-max", ...R1S, modelYears: [2024, 2024], trim: ["Max Pack", "Max", "Dual Motor"], drive: "AWD", packVariant: "Dual · Max pack",
    battery: RIV_141,
    range: { epaRangeMi: f(400, "mfr", "high", "MY2024 R1S Dual Max on 21-inch wheels — EPA; 355–380 on 20AT/22s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47893") },
    charging: RIV_PORT1,
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
  },
  {
    id: "r1t-2024-max", ...R1T, modelYears: [2024, 2024], trim: ["Max Pack", "Max", "Dual Motor"], drive: "AWD", packVariant: "Dual · Max pack",
    battery: RIV_141,
    range: { epaRangeMi: f(410, "mfr", "high", "MY2024 R1T Dual Max on 21-inch wheels — EPA; 355–380 on 20AT/22s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47870") },
    charging: RIV_PORT1,
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
  },
  {
    id: "r1s-2025-26-std", ...R1S, modelYears: [2025, 2026], trim: ["Standard Pack", "Standard", "Dual Motor"], drive: "AWD", packVariant: "Dual · Standard pack",
    battery: RIV_106,
    range: { epaRangeMi: f(258, "mfr", "high", "Gen-2 R1S Dual Standard on 20-inch wheels — EPA, 2025–26; 270 on 22s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48435") },
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
  },
  {
    id: "r1t-2025-26-std", ...R1T, modelYears: [2025, 2026], trim: ["Standard Pack", "Standard", "Dual Motor"], drive: "AWD", packVariant: "Dual · Standard pack",
    battery: RIV_106,
    range: { epaRangeMi: f(258, "mfr", "high", "Gen-2 R1T Dual Standard on 20-inch wheels — EPA, 2025–26; 270 on 22s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48423") },
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
  },
  {
    id: "r1s-2025-26-large", ...R1S, modelYears: [2025, 2026], trim: ["Large Pack", "Large", "Dual Motor"], drive: "AWD", packVariant: "Dual · Large pack",
    range: { epaRangeMi: f(300, "mfr", "high", "Gen-2 R1S Dual Large on 20-inch wheels — EPA, 2025–26; 289–329 on 20AT/22s. The Large Plus pack rates 317–330", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48745") },
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
  },
  {
    id: "r1t-2025-26-large", ...R1T, modelYears: [2025, 2026], trim: ["Large Pack", "Large", "Dual Motor"], drive: "AWD", packVariant: "Dual · Large pack",
    range: { epaRangeMi: f(300, "mfr", "high", "Gen-2 R1T Dual Large on 20-inch wheels — EPA, 2025–26; 329 on 22s. The Large Plus pack rates 317–330", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48755") },
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
  },
  {
    id: "r1s-2025-26-largeplus", ...R1S, modelYears: [2025, 2026], trim: ["Large Plus Pack", "Large Plus"], drive: "AWD", packVariant: "Dual · Large Plus pack",
    range: { epaRangeMi: f(317, "mfr", "high", "Gen-2 R1S Dual Large Plus on 20-inch wheels — EPA, 2025–26; 292–330 on 20AT/22s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48747") },
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
  },
  {
    id: "r1t-2025-26-largeplus", ...R1T, modelYears: [2025, 2026], trim: ["Large Plus Pack", "Large Plus"], drive: "AWD", packVariant: "Dual · Large Plus pack",
    range: { epaRangeMi: f(317, "mfr", "high", "Gen-2 R1T Dual Large Plus on 20-inch wheels — EPA, 2025–26; 330 on 22s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48757") },
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
  },
  {
    id: "r1s-2025-26-max", ...R1S, modelYears: [2025, 2026], trim: ["Max Pack", "Max", "Dual Motor"], drive: "AWD", packVariant: "Dual · Max pack",
    battery: RIV_141,
    range: { epaRangeMi: f(380, "mfr", "high", "Gen-2 R1S Dual Max on 20-inch wheels — EPA, 2025–26; 370–410 on 20AT/22s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48433") },
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
  },
  {
    id: "r1t-2025-26-max", ...R1T, modelYears: [2025, 2026], trim: ["Max Pack", "Max", "Dual Motor"], drive: "AWD", packVariant: "Dual · Max pack",
    battery: RIV_141,
    range: { epaRangeMi: f(380, "mfr", "high", "Gen-2 R1T Dual Max on 20-inch wheels — EPA, 2025–26; 420 on 22s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48421") },
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
  },
  {
    id: "r1s-2025-26-tri", ...R1S, modelYears: [2025, 2026], trim: ["Tri Motor", "Tri", "Tri Motor Max Pack"], drive: "AWD", packVariant: "Tri · Max pack",
    battery: RIV_141,
    range: { epaRangeMi: f(371, "mfr", "high", "Gen-2 R1S Tri Max on 22-inch wheels — EPA, 2025–26; 329 on 20AT", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48751") },
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
  },
  {
    id: "r1t-2025-26-tri", ...R1T, modelYears: [2025, 2026], trim: ["Tri Motor", "Tri", "Tri Motor Max Pack"], drive: "AWD", packVariant: "Tri · Max pack",
    battery: RIV_141,
    range: { epaRangeMi: f(371, "mfr", "high", "Gen-2 R1T Tri Max on 22-inch wheels — EPA, 2025–26", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48761") },
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
  },
  {
    id: "r1s-2026-quad", ...R1S, modelYears: [2026, 2026], trim: ["Quad Motor", "Quad", "Quad Motor Large Pack"], drive: "AWD", packVariant: "Quad · Max pack",
    battery: RIV_141,
    range: { epaRangeMi: f(374, "mfr", "high", "MY2026 gen-2 R1S Quad Max on 22-inch wheels — EPA; 325–338 on AT/UHP tires", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49740") },
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
  },

  // ── PHEVs: Wrangler 4xe / Grand Cherokee 4xe / X5 45e-50e / Rogue PHEV ──
  // The range shown is the EPA ALL-ELECTRIC figure (fueleconomy.gov rangeA) —
  // the honest number for an EV-shopping site — with the gas-assisted total
  // in the note. None of these DC-fast-charge (J1772 AC only), which the
  // cards already show as the "No fast charging" tile.
  {
    id: "wrangler-4xe-2021-25", make: "JEEP", model: "Wrangler 4xe", modelYears: [2021, 2025], packVariant: "PHEV",
    range: { epaRangeMi: f(22, "mfr", "high", "Electric-only EPA range; 370 mi total with the gas engine. Identical rating 2021–25", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47278") },
    charging: { portStandard: f("J1772", "mfr", "high", "AC charging only — no DC fast charge on any 4xe"), dcFastCharging: f("none", "mfr") },
  },
  {
    id: "wrangler-unl-4xe-2021-25", make: "JEEP", model: "Wrangler Unlimited 4xe", modelYears: [2021, 2025], packVariant: "PHEV",
    range: { epaRangeMi: f(22, "mfr", "high", "Electric-only EPA range; 370 mi total with the gas engine. Identical rating 2021–25", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47278") },
    charging: { portStandard: f("J1772", "mfr", "high", "AC charging only — no DC fast charge on any 4xe"), dcFastCharging: f("none", "mfr") },
  },
  {
    id: "gc-4xe-2022-25", make: "JEEP", model: "Grand Cherokee 4xe", modelYears: [2022, 2025], packVariant: "PHEV",
    range: { epaRangeMi: f(26, "mfr", "high", "Electric-only EPA range; 470 mi total with the gas engine. Identical rating 2022–25", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47277") },
    charging: { portStandard: f("J1772", "mfr", "high", "AC charging only — no DC fast charge"), dcFastCharging: f("none", "mfr") },
  },
  {
    id: "x5-45e-2021-23", make: "BMW", model: "X5 PHEV", modelYears: [2021, 2023], trim: "xDrive45e", packVariant: "PHEV",
    range: { epaRangeMi: f(31, "mfr", "high", "xDrive45e electric-only EPA range; 400 mi total with the gas engine", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=42807") },
    charging: { portStandard: f("J1772", "mfr", "high", "AC charging only"), dcFastCharging: f("none", "mfr") },
  },
  {
    id: "x5-50e-2024-26", make: "BMW", model: "X5 PHEV", modelYears: [2024, 2026], trim: "xDrive50e", packVariant: "PHEV",
    range: { epaRangeMi: f(39, "mfr", "high", "xDrive50e electric-only EPA range (40 for 2026); 440 mi total with the gas engine. MY2024 has no separate fueleconomy.gov entry (control: 2025–26 are present) — same xDrive50e", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49009") },
    charging: { portStandard: f("J1772", "mfr", "high", "AC charging only"), dcFastCharging: f("none", "mfr") },
  },
  {
    id: "x5-45e-2021-23-alt", make: "BMW", model: "X5", modelYears: [2021, 2023], trim: ["xDrive45e", "45e"], packVariant: "PHEV",
    range: { epaRangeMi: f(31, "mfr", "high", "xDrive45e electric-only EPA range; 400 mi total with the gas engine", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=42807") },
    charging: { portStandard: f("J1772", "mfr", "high", "AC charging only"), dcFastCharging: f("none", "mfr") },
  },
  {
    id: "x5-50e-2024-26-alt", make: "BMW", model: "X5", modelYears: [2024, 2026], trim: ["xDrive50e", "50e"], packVariant: "PHEV",
    range: { epaRangeMi: f(39, "mfr", "high", "xDrive50e electric-only EPA range (40 for 2026); 440 mi total with the gas engine", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49009") },
    charging: { portStandard: f("J1772", "mfr", "high", "AC charging only"), dcFastCharging: f("none", "mfr") },
  },
  {
    id: "rogue-phev-2025-26", make: "NISSAN", model: "Rogue Plug-In Hybrid", modelYears: [2025, 2026], packVariant: "PHEV",
    range: { epaRangeMi: f(38, "mfr", "medium", "Electric-only range, Nissan's EPA-estimate (420 mi total with the gas engine) — fueleconomy.gov has no Rogue PHEV entry yet (control: gas Rogues are present)", "https://usa.nissannews.com/en-US/releases/2026-nissan-rogue-plug-in-hybrid-press-kit") },
    charging: { portStandard: f("J1772", "mfr", "high", "AC charging only"), dcFastCharging: f("none", "mfr") },
  },

  {
    id: "taycan-2020-4s", ...TAY, modelYears: [2020, 2020], trim: ["4S", "4S with Performance Pack"], packVariant: "Performance Battery Plus",
    battery: PB1P,
    range: { epaRangeMi: f(203, "mfr", "high", "MY2020 4S — EPA certified only the Performance Battery Plus configuration", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=42590") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-2020-turbo", ...TAY, modelYears: [2020, 2020], trim: ["Turbo"], packVariant: "Performance Battery Plus",
    battery: PB1P,
    range: { epaRangeMi: f(201, "mfr", "high", "MY2020 Turbo — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=42383") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-2020-turbos", ...TAY, modelYears: [2020, 2020], trim: ["Turbo S"], packVariant: "Performance Battery Plus",
    battery: PB1P,
    range: { epaRangeMi: f(192, "mfr", "high", "MY2020 Turbo S — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=42427") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-2021-22-base-pb", ...TAY, modelYears: [2021, 2022], trim: ["Base", "Performance Battery"], packVariant: "Performance Battery",
    battery: PB1,
    range: { epaRangeMi: f(200, "mfr", "high", "MY2021–22 base Taycan, Performance Battery (79.2 kWh, resolved from this VIN) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=43802") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-2021-22-base-pbp", ...TAY, modelYears: [2021, 2022], trim: ["Base", "Performance Battery Plus"], packVariant: "Performance Battery Plus",
    battery: PB1P,
    range: { epaRangeMi: f(225, "mfr", "high", "MY2021–22 base Taycan, Performance Battery Plus (93.4 kWh, resolved from this VIN) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=43803") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-2021-22-4s-pb", ...TAY, modelYears: [2021, 2022], trim: ["4S"], packVariant: "Performance Battery",
    battery: PB1,
    range: { epaRangeMi: f(199, "mfr", "high", "MY2021–22 4S, Performance Battery (79.2 kWh, resolved from this VIN) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=43684") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-2021-22-4s-pbp", ...TAY, modelYears: [2021, 2022], trim: ["4S"], packVariant: "Performance Battery Plus",
    battery: PB1P,
    range: { epaRangeMi: f(227, "mfr", "high", "MY2021–22 4S, Performance Battery Plus (93.4 kWh, resolved from this VIN) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=43685") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-2022-gts", ...TAY, modelYears: [2022, 2022], trim: ["GTS"], packVariant: "Performance Battery Plus",
    battery: PB1P,
    range: { epaRangeMi: f(246, "mfr", "high", "MY2022 GTS — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=45715") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-2022-gts-st", ...TAY, modelYears: [2022, 2022], trim: ["GTS Sport Turismo", "GTS Sport Tourismo", "GTS ST", "GTS Wagon"], packVariant: "Performance Battery Plus",
    battery: PB1P,
    range: { epaRangeMi: f(233, "mfr", "high", "MY2022 GTS Sport Turismo — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=45716") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-2021-22-turbo", ...TAY, modelYears: [2021, 2022], trim: ["Turbo"], packVariant: "Performance Battery Plus",
    battery: PB1P,
    range: { epaRangeMi: f(212, "mfr", "high", "MY2021–22 Turbo — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=43910") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-2021-22-turbos", ...TAY, modelYears: [2021, 2022], trim: ["Turbo S"], packVariant: "Performance Battery Plus",
    battery: PB1P,
    range: { epaRangeMi: f(201, "mfr", "high", "MY2021–22 Turbo S — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=43911") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-2023-24-base-pb", ...TAY, modelYears: [2023, 2024], trim: ["Base", "Performance Battery"], packVariant: "Performance Battery",
    battery: PB1,
    range: { epaRangeMi: f(208, "mfr", "high", "MY2023–24 base Taycan, Performance Battery (79.2 kWh, resolved from this VIN) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46025") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-2023-24-base-pbp", ...TAY, modelYears: [2023, 2024], trim: ["Base", "Performance Battery Plus"], packVariant: "Performance Battery Plus",
    battery: PB1P,
    range: { epaRangeMi: f(242, "mfr", "high", "MY2023–24 base Taycan, Performance Battery Plus (93.4 kWh, resolved from this VIN) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46024") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-2023-24-4-pbp", ...TAY, modelYears: [2023, 2024], trim: ["4", "4 Black Edition"], packVariant: "Performance Battery Plus",
    battery: PB1P,
    range: { epaRangeMi: f(235, "mfr", "high", "MY2023–24 Taycan 4 — EPA (the 4 Cross Turismo carries the same 235 rating)", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46018") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-2023-24-4s-pb", ...TAY, modelYears: [2023, 2024], trim: ["4S", "4S Black Edition"], packVariant: "Performance Battery",
    battery: PB1,
    range: { epaRangeMi: f(206, "mfr", "high", "MY2023–24 4S, Performance Battery (79.2 kWh, resolved from this VIN) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46021") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-2023-24-4s-pbp", ...TAY, modelYears: [2023, 2024], trim: ["4S", "4S Black Edition"], packVariant: "Performance Battery Plus",
    battery: PB1P,
    range: { epaRangeMi: f(235, "mfr", "high", "MY2023–24 4S, Performance Battery Plus (93.4 kWh, resolved from this VIN) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46020") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-2023-24-gts", ...TAY, modelYears: [2023, 2024], trim: ["GTS"], packVariant: "Performance Battery Plus",
    battery: PB1P,
    range: { epaRangeMi: f(246, "mfr", "high", "MY2023–24 GTS — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46022") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-2023-24-gts-st", ...TAY, modelYears: [2023, 2024], trim: ["GTS Sport Turismo", "GTS Sport Tourismo", "GTS ST", "GTS Wagon"], packVariant: "Performance Battery Plus",
    battery: PB1P,
    range: { epaRangeMi: f(233, "mfr", "high", "MY2023–24 GTS Sport Turismo — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46023") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-2023-24-turbo", ...TAY, modelYears: [2023, 2024], trim: ["Turbo"], packVariant: "Performance Battery Plus",
    battery: PB1P,
    range: { epaRangeMi: f(238, "mfr", "high", "MY2023–24 Turbo — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46026") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-2023-24-turbos", ...TAY, modelYears: [2023, 2024], trim: ["Turbo S"], packVariant: "Performance Battery Plus",
    battery: PB1P,
    range: { epaRangeMi: f(222, "mfr", "high", "MY2023–24 Turbo S — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46028") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-2025-26-base-pb", ...TAY, modelYears: [2025, 2026], trim: ["Base", "Performance Battery"], packVariant: "Performance Battery",
    battery: PB2,
    range: { epaRangeMi: f(274, "mfr", "high", "MY2025–26 base Taycan (gen-2 facelift), Performance Battery — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48415") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-2025-base-pbp", ...TAY, modelYears: [2025, 2025], trim: ["Base", "Performance Battery Plus"], packVariant: "Performance Battery Plus",
    battery: PB2P,
    range: { epaRangeMi: f(318, "mfr", "high", "MY2025 base Taycan, Performance Battery Plus — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48414") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-2025-26-4-pbp", ...TAY, modelYears: [2025, 2026], trim: ["4", "4 Black Edition"], packVariant: "Performance Battery Plus",
    battery: PB2P,
    range: { epaRangeMi: f(294, "mfr", "high", "MY2025–26 Taycan 4, Performance Battery Plus — EPA; 315 on 19-inch all-seasons; the 2026 Performance Battery rates 251", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49120") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-2025-26-4s-pb", ...TAY, modelYears: [2025, 2026], trim: ["4S", "4S Black Edition"], packVariant: "Performance Battery",
    battery: PB2,
    range: { epaRangeMi: f(252, "mfr", "high", "MY2025–26 4S, Performance Battery — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48733") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-2025-26-4s-pbp", ...TAY, modelYears: [2025, 2026], trim: ["4S", "4S Black Edition"], packVariant: "Performance Battery Plus",
    battery: PB2P,
    range: { epaRangeMi: f(295, "mfr", "high", "MY2025–26 4S, Performance Battery Plus — EPA; 315 on 19-inch wheels", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48732") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-2025-26-gts", ...TAY, modelYears: [2025, 2026], trim: ["GTS"], packVariant: "Performance Battery Plus",
    battery: PB2P,
    range: { epaRangeMi: f(293, "mfr", "high", "MY2025–26 GTS — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49121") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-2025-26-gts-st", ...TAY, modelYears: [2025, 2026], trim: ["GTS Sport Turismo", "GTS Sport Tourismo", "GTS ST", "GTS Wagon"], packVariant: "Performance Battery Plus",
    battery: PB2P,
    range: { epaRangeMi: f(279, "mfr", "high", "MY2025–26 GTS Sport Turismo — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49122") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-2025-26-turbo", ...TAY, modelYears: [2025, 2026], trim: ["Turbo"], packVariant: "Performance Battery Plus",
    battery: PB2P,
    range: { epaRangeMi: f(292, "mfr", "high", "MY2025–26 Turbo — EPA; 317 on 21-inch Aero wheels", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48734") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-2025-26-turbogt", ...TAY, modelYears: [2025, 2026], trim: ["Turbo GT"], packVariant: "Performance Battery Plus",
    battery: PB2P,
    range: { epaRangeMi: f(276, "mfr", "high", "MY2025–26 Turbo GT — EPA; 269 with the Weissach Package", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48737") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-2025-26-turbos", ...TAY, modelYears: [2025, 2026], trim: ["Turbo S"], packVariant: "Performance Battery Plus",
    battery: PB2P,
    range: { epaRangeMi: f(266, "mfr", "high", "MY2025–26 Turbo S — EPA; 298 on 21-inch Aero wheels", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48739") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-ct-2021-22-4", ...TAY, modelYears: [2021, 2022], trim: ["4 Cross Turismo", "4 Cross Tourismo"], packVariant: "Cross Turismo",
    battery: PB1P,
    range: { epaRangeMi: f(215, "mfr", "high", "MY2021–22 4 Cross Turismo — EPA (4S CT rates the same 215)", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=44721") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-ct-2021-22-4s", ...TAY, modelYears: [2021, 2022], trim: ["4S Cross Turismo", "4S Cross Tourismo"], packVariant: "Cross Turismo",
    battery: PB1P,
    range: { epaRangeMi: f(215, "mfr", "high", "MY2021–22 4S Cross Turismo — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=44722") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-ct-2021-22-turbo", ...TAY, modelYears: [2021, 2022], trim: ["Turbo Cross Turismo", "Turbo Cross Tourismo"], packVariant: "Cross Turismo",
    battery: PB1P,
    range: { epaRangeMi: f(204, "mfr", "high", "MY2021–22 Turbo Cross Turismo — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=44724") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-ct-2021-22-turbos", ...TAY, modelYears: [2021, 2022], trim: ["Turbo S Cross Turismo", "Turbo S Cross Tourismo"], packVariant: "Cross Turismo",
    battery: PB1P,
    range: { epaRangeMi: f(202, "mfr", "high", "MY2021–22 Turbo S Cross Turismo — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=44723") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-ct-2023-24-4", ...TAY, modelYears: [2023, 2024], trim: ["4 Cross Turismo", "4 Cross Tourismo"], packVariant: "Cross Turismo",
    battery: PB1P,
    range: { epaRangeMi: f(235, "mfr", "high", "MY2023–24 4 Cross Turismo — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46018") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-ct-2023-24-4s", ...TAY, modelYears: [2023, 2024], trim: ["4S Cross Turismo", "4S Cross Tourismo"], packVariant: "Cross Turismo",
    battery: PB1P,
    range: { epaRangeMi: f(230, "mfr", "high", "MY2023–24 4S Cross Turismo — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46019") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-ct-2023-24-turbo", ...TAY, modelYears: [2023, 2024], trim: ["Turbo Cross Turismo", "Turbo Cross Tourismo"], packVariant: "Cross Turismo",
    battery: PB1P,
    range: { epaRangeMi: f(233, "mfr", "high", "MY2023–24 Turbo Cross Turismo — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46027") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-ct-2023-24-turbos", ...TAY, modelYears: [2023, 2024], trim: ["Turbo S Cross Turismo", "Turbo S Cross Tourismo"], packVariant: "Cross Turismo",
    battery: PB1P,
    range: { epaRangeMi: f(222, "mfr", "high", "MY2023–24 Turbo S Cross Turismo — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46029") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-ct-2025-26-4", ...TAY, modelYears: [2025, 2026], trim: ["4 Cross Turismo", "4 Cross Tourismo"], packVariant: "Cross Turismo",
    battery: PB2P,
    range: { epaRangeMi: f(277, "mfr", "high", "MY2025–26 4 Cross Turismo — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48730") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-ct-2025-26-4s", ...TAY, modelYears: [2025, 2026], trim: ["4S Cross Turismo", "4S Cross Tourismo"], packVariant: "Cross Turismo",
    battery: PB2P,
    range: { epaRangeMi: f(272, "mfr", "high", "MY2025–26 4S Cross Turismo — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48731") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-ct-2025-26-turbo", ...TAY, modelYears: [2025, 2026], trim: ["Turbo Cross Turismo", "Turbo Cross Tourismo"], packVariant: "Cross Turismo",
    battery: PB2P,
    range: { epaRangeMi: f(265, "mfr", "high", "MY2025–26 Turbo Cross Turismo — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48736") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-ct-2025-26-turbos", ...TAY, modelYears: [2025, 2026], trim: ["Turbo S Cross Turismo", "Turbo S Cross Tourismo"], packVariant: "Cross Turismo",
    battery: PB2P,
    range: { epaRangeMi: f(261, "mfr", "high", "MY2025–26 Turbo S Cross Turismo — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48741") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "tayct-2021-22", ...TAYCT, modelYears: [2021, 2022], trim: ["4", "4S", "4 Cross Turismo", "4S Cross Turismo", "4 Cross Tourismo", "4S Cross Tourismo"], packVariant: "Cross Turismo",
    battery: PB1P,
    range: { epaRangeMi: f(215, "mfr", "high", "MY2021–22 4/4S Cross Turismo — EPA, both rate 215", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=44721") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "tayct-2023-24-4", ...TAYCT, modelYears: [2023, 2024], trim: ["4", "4 Cross Turismo", "4 Cross Tourismo"], packVariant: "Cross Turismo",
    battery: PB1P,
    range: { epaRangeMi: f(235, "mfr", "high", "MY2023–24 4 Cross Turismo — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46018") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "tayct-2023-24-4s", ...TAYCT, modelYears: [2023, 2024], trim: ["4S", "4S Cross Turismo", "4S Cross Tourismo"], packVariant: "Cross Turismo",
    battery: PB1P,
    range: { epaRangeMi: f(230, "mfr", "high", "MY2023–24 4S Cross Turismo — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46019") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "tayct-2025-26-4", ...TAYCT, modelYears: [2025, 2026], trim: ["4", "4 Cross Turismo", "4 Cross Tourismo"], packVariant: "Cross Turismo",
    battery: PB2P,
    range: { epaRangeMi: f(277, "mfr", "high", "MY2025–26 4 Cross Turismo — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48730") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "tayct-2025-26-4s", ...TAYCT, modelYears: [2025, 2026], trim: ["4S", "4S Cross Turismo", "4S Cross Tourismo"], packVariant: "Cross Turismo",
    battery: PB2P,
    range: { epaRangeMi: f(272, "mfr", "high", "MY2025–26 4S Cross Turismo — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48731") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "macan-2024-25-4", ...MAC, modelYears: [2024, 2025], trim: ["4", "Macan 4", "4 Electric"], packVariant: "Macan 4",
    battery: MACB,
    range: { epaRangeMi: f(308, "mfr", "high", "MY2024–25 Macan 4 Electric — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48793") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "macan-2026-4", ...MAC, modelYears: [2026, 2026], trim: ["4", "Macan 4", "4 Electric"], packVariant: "Macan 4",
    battery: MACB,
    range: { epaRangeMi: f(304, "mfr", "high", "MY2026 Macan 4 Electric — EPA; 324 on 20-inch wheels", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50294") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "macan-2025-base", ...MAC, modelYears: [2025, 2025], trim: ["Electric", "Base"], packVariant: "Macan",
    battery: MACB,
    range: { epaRangeMi: f(315, "mfr", "high", "MY2025 base Macan Electric (RWD) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49119") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "macan-2026-base", ...MAC, modelYears: [2026, 2026], trim: ["Electric", "Base"], packVariant: "Macan",
    battery: MACB,
    range: { epaRangeMi: f(309, "mfr", "high", "MY2026 base Macan Electric (RWD) — EPA; 332 on 20-inch wheels", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50296") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "macan-2025-4s", ...MAC, modelYears: [2025, 2025], trim: ["4S", "4S Electric"], packVariant: "Macan 4S",
    battery: MACB,
    range: { epaRangeMi: f(288, "mfr", "high", "MY2025 Macan 4S Electric — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48728") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "macan-2026-4s", ...MAC, modelYears: [2026, 2026], trim: ["4S", "4S Electric"], packVariant: "Macan 4S",
    battery: MACB,
    range: { epaRangeMi: f(290, "mfr", "high", "MY2026 Macan 4S Electric — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50295") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "macan-2024-25-turbo", ...MAC, modelYears: [2024, 2025], trim: ["Turbo", "Electric Turbo", "Turbo Electric"], packVariant: "Macan Turbo",
    battery: MACB,
    range: { epaRangeMi: f(288, "mfr", "high", "MY2024–25 Macan Turbo Electric — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48794") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "macan-2026-turbo", ...MAC, modelYears: [2026, 2026], trim: ["Turbo", "Electric Turbo", "Turbo Electric"], packVariant: "Macan Turbo",
    battery: MACB,
    range: { epaRangeMi: f(293, "mfr", "high", "MY2026 Macan Turbo Electric — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50298") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "macan-2026-gts", ...MAC, modelYears: [2026, 2026], trim: ["GTS", "GTS Electric"], packVariant: "Macan GTS",
    battery: MACB,
    range: { epaRangeMi: f(294, "mfr", "high", "MY2026 Macan GTS Electric — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50297") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "macan-2024-25-4-alt", ...MACALT, modelYears: [2024, 2025], trim: ["4", "Macan 4", "4 Electric"], packVariant: "Macan 4",
    battery: MACB,
    range: { epaRangeMi: f(308, "mfr", "high", "MY2024–25 Macan 4 Electric — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48793") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "macan-2026-4-alt", ...MACALT, modelYears: [2026, 2026], trim: ["4", "Macan 4", "4 Electric"], packVariant: "Macan 4",
    battery: MACB,
    range: { epaRangeMi: f(304, "mfr", "high", "MY2026 Macan 4 Electric — EPA; 324 on 20-inch wheels", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50294") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "macan-2025-base-alt", ...MACALT, modelYears: [2025, 2025], trim: ["Electric", "Base"], packVariant: "Macan",
    battery: MACB,
    range: { epaRangeMi: f(315, "mfr", "high", "MY2025 base Macan Electric (RWD) — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49119") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "macan-2026-base-alt", ...MACALT, modelYears: [2026, 2026], trim: ["Electric", "Base"], packVariant: "Macan",
    battery: MACB,
    range: { epaRangeMi: f(309, "mfr", "high", "MY2026 base Macan Electric (RWD) — EPA; 332 on 20-inch wheels", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50296") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "macan-2025-4s-alt", ...MACALT, modelYears: [2025, 2025], trim: ["4S", "4S Electric"], packVariant: "Macan 4S",
    battery: MACB,
    range: { epaRangeMi: f(288, "mfr", "high", "MY2025 Macan 4S Electric — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48728") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "macan-2026-4s-alt", ...MACALT, modelYears: [2026, 2026], trim: ["4S", "4S Electric"], packVariant: "Macan 4S",
    battery: MACB,
    range: { epaRangeMi: f(290, "mfr", "high", "MY2026 Macan 4S Electric — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50295") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "macan-2024-25-turbo-alt", ...MACALT, modelYears: [2024, 2025], trim: ["Turbo", "Electric Turbo", "Turbo Electric"], packVariant: "Macan Turbo",
    battery: MACB,
    range: { epaRangeMi: f(288, "mfr", "high", "MY2024–25 Macan Turbo Electric — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48794") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "macan-2026-turbo-alt", ...MACALT, modelYears: [2026, 2026], trim: ["Turbo", "Electric Turbo", "Turbo Electric"], packVariant: "Macan Turbo",
    battery: MACB,
    range: { epaRangeMi: f(293, "mfr", "high", "MY2026 Macan Turbo Electric — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50298") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "macan-2026-gts-alt", ...MACALT, modelYears: [2026, 2026], trim: ["GTS", "GTS Electric"], packVariant: "Macan GTS",
    battery: MACB,
    range: { epaRangeMi: f(294, "mfr", "high", "MY2026 Macan GTS Electric — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50297") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "tayct-2021-22-turbo", ...TAYCT, modelYears: [2021, 2022], trim: ["Turbo", "Turbo Cross Turismo", "Turbo Cross Tourismo"], packVariant: "Cross Turismo",
    battery: PB1P,
    range: { epaRangeMi: f(204, "mfr", "high", "MY2021–22 Turbo Cross Turismo — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=44724") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "tayct-2021-22-turbos", ...TAYCT, modelYears: [2021, 2022], trim: ["Turbo S", "Turbo S Cross Turismo", "Turbo S Cross Tourismo"], packVariant: "Cross Turismo",
    battery: PB1P,
    range: { epaRangeMi: f(202, "mfr", "high", "MY2021–22 Turbo S Cross Turismo — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=44723") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "tayct-2023-24-turbo", ...TAYCT, modelYears: [2023, 2024], trim: ["Turbo", "Turbo Cross Turismo", "Turbo Cross Tourismo"], packVariant: "Cross Turismo",
    battery: PB1P,
    range: { epaRangeMi: f(233, "mfr", "high", "MY2023–24 Turbo Cross Turismo — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46027") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "tayct-2023-24-turbos", ...TAYCT, modelYears: [2023, 2024], trim: ["Turbo S", "Turbo S Cross Turismo", "Turbo S Cross Tourismo"], packVariant: "Cross Turismo",
    battery: PB1P,
    range: { epaRangeMi: f(222, "mfr", "high", "MY2023–24 Turbo S Cross Turismo — EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46029") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },

  // ── Audi Q4 e-tron / Q4 Sportback e-tron (same pass) ─────────────────
  //
  // VIN position 8 is no help here: every US Q4 in inventory decodes to a
  // flat "Z" across 40/50/55, RWD and quattro alike (control run 2026-08-14),
  // and vPIC carries no per-VIN battery figure — so these rows key on the
  // number Audi puts in the trim ("40"/"45"/"50"/"55") plus drivetrain.
  // The trim arrays deliberately include the bare tier names (Premium /
  // Premium Plus / Prestige): a 2024 listing that omits the number genuinely
  // can't be told apart (50 and 55 both sold that year, both quattro), and
  // presenting 236-vs-258 candidates is honest where guessing is not.
  //
  // Variant history (EPA certs, fueleconomy.gov ids in sourceUrls):
  //   2022: 50 quattro only — Audi's own 2022 spec sheet lists the 40 with
  //         range "TBD"; it reached the US for MY2023.
  //   2023: 40 (RWD, 265) · 50 quattro (SUV 236 / Sportback 242)
  //   2024: 40 + 50 carry over; mid-year the 50 becomes the 55 quattro
  //         (258, both bodies) — Audi USA release, March 2024
  //   2025: 45 (RWD, 288) · 55 quattro (258)
  // Pack: 82 kWh gross all years (2022 spec sheet); the MY2024.5 refresh
  // states 77 kWh net and 175 kW DC (up from 150 kW on the 50).
  {
    id: "q4-2022-50", ...Q4, modelYears: [2022, 2022], packVariant: "50 quattro",
    battery: Q4_PACK82,
    range: { epaRangeMi: f(241, "mfr", "high", "MY2022 Q4 50 e-tron quattro — EPA; the only US Q4 variant in 2022 (Audi's 2022 spec sheet lists the 40 as range-TBD, and EPA carries no 2022 40 cert)", epa(44781)) },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(400, "mfr") },
    warranty: AUDI_W,
  },
  {
    id: "q4-2023-24-40", ...Q4, modelYears: [2023, 2024], drive: "RWD", packVariant: "40 (RWD)",
    trim: ["40 Premium", "40 Premium Plus", "40 Prestige", ...Q4_TIERS],
    battery: Q4_PACK82,
    range: { epaRangeMi: f(265, "mfr", "high", "MY2023–24 Q4 40 e-tron (RWD) — EPA (ids 45983/46910 rate identically)", epa(45983)) },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(400, "mfr") },
    warranty: AUDI_W,
  },
  {
    id: "q4-2023-24-50", ...Q4, modelYears: [2023, 2024], drive: "AWD", packVariant: "50 quattro",
    trim: ["50 Premium", "50 Preminum Plus", "50 Premium Plus", "50 Prestige", ...Q4_TIERS],
    battery: Q4_PACK82,
    range: { epaRangeMi: f(236, "mfr", "high", "MY2023–24 Q4 50 e-tron quattro — EPA (ids 45988/46911 rate identically); replaced mid-MY2024 by the 55", epa(45988)) },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(400, "mfr"), dcPeakKw: f(150, "mfr", "high", "“up from 150 kW for the Q4 50 e-tron” — Audi USA, 2024 Q4 55 refresh release", Q4_R597) },
    warranty: AUDI_W,
  },
  {
    id: "q4-2024-25-55", ...Q4, modelYears: [2024, 2025], drive: "AWD", packVariant: "55 quattro",
    trim: ["55 Premium", "55 Premium Plus", "55 Prestige", ...Q4_TIERS],
    battery: Q4_PACK82_77,
    range: { epaRangeMi: f(258, "mfr", "high", "MY2024.5–25 Q4 55 e-tron quattro — EPA (ids 47810/48681 rate identically); the 55 replaced the 50 in spring 2024", epa(47810)) },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(400, "mfr"), dcPeakKw: f(175, "mfr", "high", "“a maximum DC charging power of 175 kW, up from 150 kW” — Audi USA, 2024 Q4 55 refresh release", Q4_R597) },
    thermal: { batteryPreconditioning: f(true, "mfr", "high", "“will thermally precondition the battery to ensure it charges as quickly as possible” (route-planner triggered) — Audi USA, 2024 Q4 55 refresh release", Q4_R597) },
    warranty: AUDI_W,
  },
  {
    id: "q4-2025-45", ...Q4, modelYears: [2025, 2025], drive: "RWD", packVariant: "45 (RWD)",
    trim: ["45 Premium", "45 Premium Plus", "45 Prestige", ...Q4_TIERS],
    battery: {
      packGrossKwh: f(82, "mfr", "high", "82 kWh gross — Audi Q4 e-tron line spec, unchanged since 2022", Q4_SPEC22),
      packUsableKwh: f(77, "mfr", "medium", "The 45 uses the updated pack introduced with the MY2024 55 refresh (82 gross / 77 net); the net figure is not separately restated for the 45 in a US primary document", Q4_R597),
    },
    range: { epaRangeMi: f(288, "mfr", "high", "MY2025 Q4 45 e-tron (RWD) — EPA; the longest-range US Q4", epa(48296)) },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(400, "mfr") },
    warranty: AUDI_W,
  },
  // Sportback — the feed spells the model both ways ("Q4 e-tron Sportback"
  // and "Q4 Sportback e-tron"), so each row exists under both strings.
  ...[Q4SBA, Q4SBB].flatMap((M, i): EnrichmentRow[] => {
    const s = i === 0 ? "a" : "b";
    return [
      {
        id: `q4sb-2022-50-${s}`, ...M, modelYears: [2022, 2022] as [number, number], packVariant: "50 quattro",
        battery: Q4_PACK82,
        range: { epaRangeMi: f(241, "mfr", "high", "MY2022 Q4 50 e-tron Sportback quattro — EPA; the only US Sportback variant in 2022", epa(44782)) },
        charging: { portStandard: f("CCS1", "mfr"), architectureV: f(400, "mfr") },
        warranty: AUDI_W,
      },
      {
        id: `q4sb-2023-50-${s}`, ...M, modelYears: [2023, 2023] as [number, number], packVariant: "50 quattro",
        battery: Q4_PACK82,
        range: { epaRangeMi: f(242, "mfr", "high", "MY2023 Q4 Sportback 50 e-tron quattro — EPA; the only US Sportback variant that year", epa(45989)) },
        charging: { portStandard: f("CCS1", "mfr"), architectureV: f(400, "mfr"), dcPeakKw: f(150, "mfr", "high", "“up from 150 kW for the Q4 50 e-tron” — Audi USA, 2024 Q4 55 refresh release", Q4_R597) },
        warranty: AUDI_W,
      },
      {
        id: `q4sb-2024-50-${s}`, ...M, modelYears: [2024, 2024] as [number, number], drive: "AWD" as const, packVariant: "50 quattro",
        trim: ["50 Premium", "50 Preminum Plus", "50 Premium Plus", "50 Prestige", ...Q4_TIERS],
        battery: Q4_PACK82,
        range: { epaRangeMi: f(242, "mfr", "high", "MY2024 Q4 Sportback 50 e-tron quattro — EPA; replaced mid-year by the 55", epa(46912)) },
        charging: { portStandard: f("CCS1", "mfr"), architectureV: f(400, "mfr"), dcPeakKw: f(150, "mfr", "high", "“up from 150 kW for the Q4 50 e-tron” — Audi USA, 2024 Q4 55 refresh release", Q4_R597) },
        warranty: AUDI_W,
      },
      {
        id: `q4sb-2024-25-55-${s}`, ...M, modelYears: [2024, 2025] as [number, number], drive: "AWD" as const, packVariant: "55 quattro",
        trim: ["55 Premium", "55 Premium Plus", "55 Prestige", ...Q4_TIERS],
        battery: Q4_PACK82_77,
        range: { epaRangeMi: f(258, "mfr", "high", "MY2024.5–25 Q4 Sportback 55 e-tron quattro — EPA (ids 47811/48682 rate identically)", epa(47811)) },
        charging: { portStandard: f("CCS1", "mfr"), architectureV: f(400, "mfr"), dcPeakKw: f(175, "mfr", "high", "“a maximum DC charging power of 175 kW” — Audi USA, 2024 Q4 55 refresh release", Q4_R597) },
        thermal: { batteryPreconditioning: f(true, "mfr", "high", "Route-planner triggered thermal preconditioning — Audi USA, 2024 Q4 55 refresh release", Q4_R597) },
        warranty: AUDI_W,
      },
    ];
  }),

  // ── Tesla Model S, pack era 2013–2021 (same pass) ─────────────────────
  //
  // VIN position 8 = Tesla's motor code, confirmed per-VIN by Tesla's own
  // Part 565 submissions (vPIC OtherEngineInfo): 1 = "Single Motor",
  // 2 = "Dual Motor - Standard", 4 = "Dual Motor - Performance"
  // (2014→2021 carryover). 2013 used letters: G / N / P, discriminated by
  // Tesla's submitted battery-energy figure (G → 51 kWh = the 60 pack,
  // N/P → 81 kWh = the 85 pack; P's inventory trim reads "Performance",
  // corroborating P = P85). The code pins the motor; within a code the
  // pack badge in the trim ("75D", "P100D") picks the row, and junk-trim
  // cars get honest candidates. This retires data3's 2019 floor row, which
  // had started swallowing trim-carrying cars (a 2019 code-4 "Performance"
  // showed the 259-mi 75D floor).
  //
  // EPA ranges per year/variant from fueleconomy.gov (ids in sourceUrls).
  // Warranty: pre-2020 first sale = 8yr/UNLIMITED miles, no SOH floor.
  {
    id: "ms-2013-60", ...MS, modelYears: [2013, 2013], vin8: ["G"], drive: "RWD", packVariant: "60",
    battery: msPack(60),
    range: { epaRangeMi: f(208, "mfr", "medium", "MY2013 Model S 60 — EPA. VIN code G decodes to Tesla's 51 kWh energy submission (the 60 pack). Rare software-locked '40' cars (139 mi) were built on this pack — if the car reports ~139 mi at full charge it's an unlocked-eligible 40", epa(33367)) },
    charging: MSX_OLD_CHARGING, thermal: MSX_NO_HP, warranty: MSX_OLD_W,
    buyerNotes: [NOTE_MS_EMMC],
  },
  {
    id: "ms-2013-85", ...MS, modelYears: [2013, 2013], vin8: ["N"], drive: "RWD", packVariant: "85",
    battery: msPack(85),
    range: { epaRangeMi: f(265, "mfr", "high", "MY2013 Model S 85 — EPA; VIN code N, Tesla's 81 kWh energy submission", epa(33368)) },
    charging: MSX_OLD_CHARGING, thermal: MSX_NO_HP, warranty: MSX_OLD_W,
    buyerNotes: [NOTE_MS_EMMC],
  },
  {
    id: "ms-2013-p85", ...MS, modelYears: [2013, 2013], vin8: ["P"], drive: "RWD", packVariant: "P85",
    battery: msPack(85),
    range: { epaRangeMi: f(265, "mfr", "high", "MY2013 P85 — same 85-pack EPA rating as the standard car; VIN code P = performance motor", epa(33368)) },
    charging: MSX_OLD_CHARGING, thermal: MSX_NO_HP, warranty: MSX_OLD_W,
    buyerNotes: [NOTE_MS_EMMC],
  },
  // Single motor (code 1), 2014–2018 — pack badge picks the row.
  {
    id: "ms-2014-15-s60", ...MS, modelYears: [2014, 2015], vin8: ["1"], drive: "RWD", packVariant: "60",
    trim: ["60", "60 DISC"], battery: msPack(60),
    range: { epaRangeMi: f(208, "mfr", "high", "MY2014–15 Model S 60 — EPA (ids 34776/36017 rate identically)", epa(34776)) },
    charging: MSX_OLD_CHARGING, thermal: MSX_NO_HP, warranty: MSX_OLD_W,
    buyerNotes: [NOTE_MS_EMMC],
  },
  {
    id: "ms-2016-17-s60", ...MS, modelYears: [2016, 2017], vin8: ["1"], drive: "RWD", packVariant: "60",
    trim: ["60", "60 DISC"], battery: msPack(60),
    range: { epaRangeMi: f(210, "mfr", "high", "MY2016–17 Model S 60 (software-limited 75 pack in this era) — EPA (38170/38557)", epa(38170)) },
    charging: MSX_OLD_CHARGING, thermal: MSX_NO_HP, warranty: MSX_OLD_W,
    buyerNotes: [NOTE_MS_EMMC],
  },
  {
    id: "ms-2016-s70", ...MS, modelYears: [2016, 2016], vin8: ["1"], drive: "RWD", packVariant: "70",
    trim: ["70"], battery: msPack(70),
    range: { epaRangeMi: f(234, "mfr", "high", "MY2016 Model S 70 (single motor) — EPA", epa(37233)) },
    charging: MSX_OLD_CHARGING, thermal: MSX_NO_HP, warranty: MSX_OLD_W,
    buyerNotes: [NOTE_MS_EMMC],
  },
  {
    id: "ms-2016-18-s75", ...MS, modelYears: [2016, 2018], vin8: ["1"], drive: "RWD", packVariant: "75",
    trim: ["75", "75kWh", "75 kWh"], battery: msPack(75),
    range: { epaRangeMi: f(249, "mfr", "high", "MY2016–18 Model S 75 (single motor) — EPA (37421/38558/39837 rate identically)", epa(37421)) },
    charging: MSX_OLD_CHARGING, thermal: MSX_NO_HP, warranty: MSX_OLD_W,
    buyerNotes: [NOTE_MS_EMMC],
  },
  {
    id: "ms-2014-16-s85", ...MS, modelYears: [2014, 2016], vin8: ["1"], drive: "RWD", packVariant: "85",
    trim: ["85", "85 kWh Battery", "85 kWh"], battery: msPack(85),
    range: { epaRangeMi: f(265, "mfr", "high", "MY2014–16 Model S 85 (single motor) — EPA (34775/35980/37234 rate identically)", epa(34775)) },
    charging: MSX_OLD_CHARGING, thermal: MSX_NO_HP, warranty: MSX_OLD_W,
    buyerNotes: [NOTE_MS_EMMC],
  },
  {
    id: "ms-2015-16-s90", ...MS, modelYears: [2015, 2016], vin8: ["1"], drive: "RWD", packVariant: "90",
    trim: ["90"], battery: msPack(90),
    range: { epaRangeMi: f(265, "mfr", "high", "MY2015–16 Model S 90 (single motor) — EPA (37236/37235 rate identically)", epa(37236)) },
    charging: MSX_OLD_CHARGING, thermal: MSX_NO_HP, warranty: MSX_OLD_W,
    buyerNotes: [NOTE_MS_EMMC],
  },
  // Dual motor, standard (code 2), 2014–2021.
  {
    id: "ms-2014-85d", ...MS, modelYears: [2014, 2014], vin8: ["2"], drive: "AWD", packVariant: "85D",
    battery: msPack(85),
    range: { epaRangeMi: f(242, "mfr", "high", "MY2014 85D — the only 2014 dual-motor-standard certification, so VIN code 2 settles it", epa(35994)) },
    charging: MSX_OLD_CHARGING, thermal: MSX_NO_HP, warranty: MSX_OLD_W,
    buyerNotes: [NOTE_MS_EMMC],
  },
  {
    id: "ms-2015-16-70d", ...MS, modelYears: [2015, 2016], vin8: ["2"], drive: "AWD", packVariant: "70D",
    trim: ["70D"], battery: msPack(70),
    range: { epaRangeMi: f(240, "mfr", "high", "MY2015–16 70D — EPA (36126/37238 rate identically)", epa(36126)) },
    charging: MSX_OLD_CHARGING, thermal: MSX_NO_HP, warranty: MSX_OLD_W,
    buyerNotes: [NOTE_MS_EMMC],
  },
  {
    id: "ms-2016-17-60d", ...MS, modelYears: [2016, 2017], vin8: ["2"], drive: "AWD", packVariant: "60D",
    trim: ["60D"], battery: msPack(60),
    range: { epaRangeMi: f(218, "mfr", "high", "MY2016–17 60D (software-limited 75 pack) — EPA (38171/38523)", epa(38171)) },
    charging: MSX_OLD_CHARGING, thermal: MSX_NO_HP, warranty: MSX_OLD_W,
    buyerNotes: [NOTE_MS_EMMC],
  },
  {
    id: "ms-2016-19-75d", ...MS, modelYears: [2016, 2019], vin8: ["2"], drive: "AWD", packVariant: "75D",
    trim: ["75D"], battery: msPack(75),
    range: { epaRangeMi: f(259, "mfr", "high", "MY2016–19 75D — EPA (37422/38524/39838/41192 all rate 259)", epa(37422)) },
    charging: MSX_OLD_CHARGING, thermal: MSX_NO_HP, warranty: MSX_OLD_W,
  },
  {
    id: "ms-2015-16-85d", ...MS, modelYears: [2015, 2016], vin8: ["2"], drive: "AWD", packVariant: "85D",
    trim: ["85D"], battery: msPack(85),
    range: { epaRangeMi: f(270, "mfr", "high", "MY2015–16 85D — EPA (36009/37239 rate identically)", epa(36009)) },
    charging: MSX_OLD_CHARGING, thermal: MSX_NO_HP, warranty: MSX_OLD_W,
    buyerNotes: [NOTE_MS_EMMC],
  },
  {
    id: "ms-2015-90d", ...MS, modelYears: [2015, 2015], vin8: ["2"], drive: "AWD", packVariant: "90D",
    trim: ["90D"], battery: msPack(90),
    range: { epaRangeMi: f(270, "mfr", "high", "MY2015 90D — EPA; the 2016–17 90D rates higher (294)", epa(36786)) },
    charging: MSX_OLD_CHARGING, thermal: MSX_NO_HP, warranty: MSX_OLD_W,
    buyerNotes: [NOTE_MS_EMMC],
  },
  {
    id: "ms-2016-17-90d", ...MS, modelYears: [2016, 2017], vin8: ["2"], drive: "AWD", packVariant: "90D",
    trim: ["90D"], battery: msPack(90),
    range: { epaRangeMi: f(294, "mfr", "high", "MY2016–17 90D — EPA (37240/38569 rate identically); the 2015 car rates 270", epa(37240)) },
    charging: MSX_OLD_CHARGING, thermal: MSX_NO_HP, warranty: MSX_OLD_W,
    buyerNotes: [NOTE_MS_EMMC],
  },
  {
    id: "ms-2017-19-100d", ...MS, modelYears: [2017, 2019], vin8: ["2"], drive: "AWD", packVariant: "100D",
    trim: ["100D"], battery: msPack(100),
    range: { epaRangeMi: f(335, "mfr", "high", "MY2017–19 100D — EPA (38640/39839/41193 all rate 335)", epa(38640)) },
    charging: MSX_OLD_CHARGING, thermal: MSX_NO_HP, warranty: MSX_OLD_W,
  },
  {
    id: "ms-2019-sr", ...MS, modelYears: [2019, 2019], vin8: ["2"], drive: "AWD", packVariant: "Standard Range",
    trim: ["Standard Range", "Standard"], battery: msPack(100),
    range: { epaRangeMi: f(285, "mfr", "high", "MY2019 Standard Range (Raven, software-limited 100 pack) — EPA", epa(41513)) },
    charging: MSX_OLD_CHARGING, thermal: MSX_NO_HP, warranty: MSX_OLD_W,
  },
  {
    id: "ms-2019-lr", ...MS, modelYears: [2019, 2019], vin8: ["2"], drive: "AWD", packVariant: "Long Range",
    trim: ["Long Range"], battery: msPack(100),
    range: { epaRangeMi: f(370, "mfr", "high", "MY2019 Long Range (Raven) — EPA", epa(41417)) },
    charging: MSX_OLD_CHARGING, thermal: MSX_NO_HP, warranty: MSX_OLD_W,
  },
  {
    id: "ms-2020-lr", ...MS, modelYears: [2020, 2020], vin8: ["2"], drive: "AWD", packVariant: "Long Range",
    trim: ["Long Range"], battery: msPack(100),
    range: { epaRangeMi: f(373, "mfr", "high", "MY2020 Long Range — EPA; the mid-year Long Range Plus rates 402", epa(42282)) },
    charging: MSX_OLD_CHARGING, thermal: MSX_NO_HP, warranty: TSX_W,
  },
  {
    id: "ms-2020-lrplus", ...MS, modelYears: [2020, 2020], vin8: ["2"], drive: "AWD", packVariant: "Long Range Plus",
    trim: ["Long Range Plus"], battery: msPack(100),
    range: { epaRangeMi: f(402, "mfr", "high", "MY2020 Long Range Plus — EPA", epa(42755)) },
    charging: MSX_OLD_CHARGING, thermal: MSX_NO_HP, warranty: TSX_W,
  },
  {
    id: "ms-2020-sr", ...MS, modelYears: [2020, 2020], vin8: ["2"], drive: "AWD", packVariant: "Standard Range",
    trim: ["Standard Range", "Standard"], battery: msPack(100),
    range: { epaRangeMi: f(287, "mfr", "high", "MY2020 Standard Range (software-limited) — EPA", epa(42285)) },
    charging: MSX_OLD_CHARGING, thermal: MSX_NO_HP, warranty: TSX_W,
  },
  {
    id: "ms-2021-lrplus", ...MS, modelYears: [2021, 2021], vin8: ["2"], drive: "AWD", packVariant: "Long Range Plus",
    battery: msPack(100),
    range: { epaRangeMi: f(402, "mfr", "medium", "Carryover Raven Long Range Plus built into early 2021 before the refresh (refresh cars carry VIN code 5, not 2). EPA's 2021 menu lists only refresh certs; this is the identical car's MY2020 certification", epa(42755)) },
    charging: MSX_OLD_CHARGING, thermal: MSX_NO_HP, warranty: TSX_W,
  },
  // Dual motor, performance (code 4), 2015–2020 (2021 carryover exists above).
  {
    id: "ms-2015-16-p85d", ...MS, modelYears: [2015, 2016], vin8: ["4"], drive: "AWD", packVariant: "P85D",
    trim: ["P85D"], battery: msPack(85),
    range: { epaRangeMi: f(253, "mfr", "high", "MY2015–16 P85D — EPA (36008/37241 rate identically)", epa(36008)) },
    charging: MSX_OLD_CHARGING, thermal: MSX_NO_HP, warranty: MSX_OLD_W,
    buyerNotes: [NOTE_MS_EMMC],
  },
  {
    id: "ms-2015-p90d", ...MS, modelYears: [2015, 2015], vin8: ["4"], drive: "AWD", packVariant: "P90D",
    trim: ["P90D"], battery: msPack(90),
    range: { epaRangeMi: f(253, "mfr", "high", "MY2015 P90D — EPA; the 2016–17 car rates 270", epa(36787)) },
    charging: MSX_OLD_CHARGING, thermal: MSX_NO_HP, warranty: MSX_OLD_W,
    buyerNotes: [NOTE_MS_EMMC],
  },
  {
    id: "ms-2016-17-p90d", ...MS, modelYears: [2016, 2017], vin8: ["4"], drive: "AWD", packVariant: "P90D",
    trim: ["P90D"], battery: msPack(90),
    range: { epaRangeMi: f(270, "mfr", "high", "MY2016–17 P90D — EPA (37242/38537 rate identically)", epa(37242)) },
    charging: MSX_OLD_CHARGING, thermal: MSX_NO_HP, warranty: MSX_OLD_W,
    buyerNotes: [NOTE_MS_EMMC],
  },
  {
    id: "ms-2016-19-p100d", ...MS, modelYears: [2016, 2019], vin8: ["4"], drive: "AWD", packVariant: "P100D",
    trim: ["P100D"], battery: msPack(100),
    range: { epaRangeMi: f(315, "mfr", "high", "MY2016–19 P100D — EPA (38172/38525/39840/41194 all rate 315)", epa(38172)) },
    charging: MSX_OLD_CHARGING, thermal: MSX_NO_HP, warranty: MSX_OLD_W,
  },
  {
    id: "ms-2019-perf", ...MS, modelYears: [2019, 2019], vin8: ["4"], drive: "AWD", packVariant: "Performance",
    trim: ["Performance"], battery: msPack(100),
    range: { epaRangeMi: f(345, "mfr", "high", "MY2019 Performance (Raven) on 19-inch wheels — EPA; 325 on 21s", epa(41418)) },
    charging: MSX_OLD_CHARGING, thermal: MSX_NO_HP, warranty: MSX_OLD_W,
  },
  {
    id: "ms-2020-perf", ...MS, modelYears: [2020, 2020], vin8: ["4"], drive: "AWD", packVariant: "Performance",
    trim: ["Performance"], battery: msPack(100),
    range: { epaRangeMi: f(348, "mfr", "high", "MY2020 Performance on 19-inch wheels — EPA; 326 on 21s", epa(42283)) },
    charging: MSX_OLD_CHARGING, thermal: MSX_NO_HP, warranty: TSX_W,
  },
  // Refresh-era Standard Range (Aug 2023 – early 2024): software-limited,
  // never separately EPA-certified — without this row those cars match the
  // 405-mi Long Range row, overstating range by 85 miles.
  {
    id: "ms-2023-24-sr", ...MS, modelYears: [2023, 2024], vin8: ["5"], drive: "AWD", packVariant: "Standard Range",
    trim: ["Standard Range", "Standard"], battery: TSX_PACK,
    range: { epaRangeMi: f(320, "mfr", "medium", "Standard Range (Aug 2023–early 2024): the Long Range car with range software-locked to a Tesla-advertised 320 mi EPA-est; fueleconomy.gov carries no separate certification for it") },
    charging: TSX_CHARGING,
    thermal: { heatPump: f("standard", "mfr"), batteryPreconditioning: f(true, "mfr") },
    warranty: TSX_W,
    buyerNotes: [NOTE_FSD],
  },

  // ── Mercedes-Benz EQE / EQS (same pass) ───────────────────────────────
  //
  // VIN positions 4–8 (Mercedes' Baumuster block) name the exact car:
  // sedans are Bremen-built (WMI W1K), the SUVs Alabama-built (4JG), and
  // the variant letter block is per-configuration — verified against 330
  // inventory VINs where every prefix mapped 1:1 onto one variant:
  //   EQE sedan: EG2BB=350+ · EG1CB=350 4MATIC · EG2CB=500 4MATIC · EG5DB=AMG
  //   EQE SUV:   GM2BB=350+ · GM1CB=350 4MATIC · GM2CB=500 4MATIC · GM5DB=AMG
  //   EQS sedan: CG2DB=450+ · CG2EB=450 4MATIC · CG4EB=580 4MATIC · CG5FB=AMG
  //   EQS SUV:   DM2DB=450+ · DM2EB=450 4MATIC · DM4EB=580 4MATIC · DX5FB=Maybach 680
  // Dealer trims here are uniquely unreliable — "EQS450+ 4MATIC" composites,
  // bare "4MATIC", and 2026 cars still badged 450/580 after Mercedes renamed
  // the SUVs 400/550 and the EQE line 320 — so rows key on vinPrefix alone
  // (a hard filter) and carry no trim keys at all. The model strings (a
  // dozen spellings) are collapsed to the family name in decodeFromListing.
  //
  // EQE sedan ─ 350+ (RWD)
  mb("eqe-sed-2023-350plus", EQE, [2023, 2023], "EG2BB", "EQE 350+ Sedan", "RWD",
    f(305, "mfr", "high", "“Up to 305 miles of range according to EPA estimates” (EQE 350+) — MBUSA EQE Sedan pricing release; no MY2023 EQE records exist in fueleconomy.gov's dataset", MB_REL_EQE),
    { battery: EQE_PACK_906, charging: EQE_CHG, thermal: MB_HP_SED_EARLY, buyerNotes: [NOTE_MB_FUSE, NOTE_EQE_STEER] }),
  mb("eqe-sed-2024-350plus", EQE, [2024, 2024], "EG2BB", "EQE 350+ Sedan", "RWD",
    f(298, "mfr", "high", "MY2024 EQE 350+ — EPA", epa(47459)),
    { battery: EQE_PACK_906, charging: EQE_CHG, thermal: MB_HP_SED, buyerNotes: [NOTE_EQE_STEER] }),
  mb("eqe-sed-2025-26-320plus", EQE, [2025, 2026], "EG2BB", "EQE 350+/320+ Sedan", "RWD",
    f(308, "mfr", "high", "Sold as EQE 350+ in MY2025, renamed EQE 320+ for 2026 — same 308-mi EPA rating (ids 48384/49679)", epa(48384)),
    { battery: EQE_PACK_96, charging: EQE_CHG, thermal: MB_HP_SED, buyerNotes: [NOTE_EQE_STEER] }),
  // EQE sedan ─ 350 4MATIC
  mb("eqe-sed-2023-350-4m", EQE, [2023, 2023], "EG1CB", "EQE 350 4MATIC Sedan", "AWD",
    f(260, "agg", "medium", "MY2023 EQE 350 4MATIC — the 260-mi EPA figure Mercedes announced, as documented by contemporary press; absent from fueleconomy.gov's dataset (the MY2024 car re-rated 280)"),
    { battery: EQE_PACK_906, charging: EQE_CHG, thermal: MB_HP_SED_EARLY, buyerNotes: [NOTE_MB_FUSE, NOTE_EQE_STEER, NOTE_EQE_ROOF] }),
  mb("eqe-sed-2024-350-4m", EQE, [2024, 2024], "EG1CB", "EQE 350 4MATIC Sedan", "AWD",
    f(280, "mfr", "high", "MY2024 EQE 350 4MATIC — EPA", epa(47458)),
    { battery: EQE_PACK_906, charging: EQE_CHG, thermal: MB_HP_SED, buyerNotes: [NOTE_EQE_STEER] }),
  mb("eqe-sed-2025-26-320-4m", EQE, [2025, 2026], "EG1CB", "EQE 350/320 4MATIC Sedan", "AWD",
    f(267, "mfr", "high", "Sold as EQE 350 4MATIC in MY2025, renamed EQE 320 4MATIC for 2026 — same 267-mi EPA rating (ids 48383/49680)", epa(48383)),
    { battery: EQE_PACK_905, charging: EQE_CHG, thermal: MB_HP_SED, buyerNotes: [NOTE_EQE_STEER] }),
  // EQE sedan ─ 500 4MATIC (2023–24 only)
  mb("eqe-sed-2023-500-4m", EQE, [2023, 2023], "EG2CB", "EQE 500 4MATIC Sedan", "AWD",
    f(260, "agg", "medium", "MY2023 EQE 500 4MATIC — the 260-mi EPA figure Mercedes announced, as documented by contemporary press; absent from fueleconomy.gov's dataset (the MY2024 car re-rated 298)"),
    { battery: EQE_PACK_906, charging: EQE_CHG, thermal: MB_HP_SED_EARLY, buyerNotes: [NOTE_MB_FUSE, NOTE_EQE_STEER, NOTE_EQE_ROOF] }),
  mb("eqe-sed-2024-500-4m", EQE, [2024, 2024], "EG2CB", "EQE 500 4MATIC Sedan", "AWD",
    f(298, "mfr", "high", "MY2024 EQE 500 4MATIC — EPA", epa(47460)),
    { battery: EQE_PACK_906, charging: EQE_CHG, thermal: MB_HP_SED, buyerNotes: [NOTE_EQE_STEER] }),
  // EQE sedan ─ AMG
  mb("eqe-sed-2023-amg", EQE, [2023, 2023], "EG5DB", "AMG EQE Sedan", "AWD",
    f(225, "agg", "medium", "MY2023 AMG EQE 4MATIC+ — the 225-mi EPA figure Mercedes announced, as documented by contemporary press; absent from fueleconomy.gov's dataset"),
    { battery: EQE_PACK_906, charging: EQE_CHG, thermal: MB_HP_SED_EARLY, buyerNotes: [NOTE_MB_FUSE, NOTE_EQE_STEER, NOTE_EQE_ROOF] }),
  mb("eqe-sed-2024-amg", EQE, [2024, 2024], "EG5DB", "AMG EQE Sedan", "AWD",
    f(230, "mfr", "high", "MY2024 AMG EQE (EPA model string “AMG EQE 4matic Plus”) — EPA", epa(47457)),
    { battery: EQE_PACK_906, charging: EQE_CHG, thermal: MB_HP_SED, buyerNotes: [NOTE_EQE_BMS24, NOTE_EQE_STEER] }),
  mb("eqe-sed-2025-26-amg", EQE, [2025, 2026], "EG5DB", "AMG EQE Sedan", "AWD",
    f(220, "mfr", "high", "MY2025–26 AMG EQE — EPA (ids 48382/49678 rate identically)", epa(48382)),
    { charging: EQE_CHG, thermal: MB_HP_SED, buyerNotes: [NOTE_EQE_STEER] }),
  // EQE SUV ─ 350+/320+ (RWD)
  mb("eqe-suv-2023-350plus", EQE, [2023, 2023], "GM2BB", "EQE 350+ SUV", "RWD",
    f(279, "mfr", "high", "“The EQE 350+ SUV delivers 279 miles of range according to EPA estimates” — MBUSA EQE SUV pricing release; no MY2023 EQE records exist in fueleconomy.gov's dataset", MB_REL_EQESUV),
    { battery: EQE_PACK_906, charging: EQE_CHG, thermal: MB_HP_SUV, buyerNotes: [NOTE_MB_FUSE, NOTE_EQE_STEER] }),
  mb("eqe-suv-2024-350plus", EQE, [2024, 2024], "GM2BB", "EQE 350+ SUV", "RWD",
    f(307, "mfr", "high", "MY2024 EQE 350+ SUV — EPA", epa(47846)),
    { battery: EQE_PACK_906, charging: EQE_CHG, thermal: MB_HP_SUV, buyerNotes: [NOTE_EQE_STEER] }),
  mb("eqe-suv-2025-27-320plus", EQE, [2025, 2027], "GM2BB", "EQE 350+/320+ SUV", "RWD",
    f(302, "mfr", "high", "Sold as EQE 350+ SUV in MY2025, renamed EQE 320+ SUV from 2026 — same 302-mi EPA rating (ids 48390/49684/50661)", epa(48390)),
    { battery: EQE_PACK_96, charging: EQE_CHG, thermal: MB_HP_SUV, buyerNotes: [NOTE_EQE_STEER] }),
  // EQE SUV ─ 350/320 4MATIC
  mb("eqe-suv-2023-350-4m", EQE, [2023, 2023], "GM1CB", "EQE 350 4MATIC SUV", "AWD",
    f(253, "agg", "medium", "MY2023 EQE 350 4MATIC SUV — the 253-mi EPA figure Mercedes announced, as documented by contemporary press; absent from fueleconomy.gov's dataset"),
    { battery: EQE_PACK_906, charging: EQE_CHG, thermal: MB_HP_SUV, buyerNotes: [NOTE_MB_FUSE, NOTE_EQE_STEER] }),
  mb("eqe-suv-2024-350-4m", EQE, [2024, 2024], "GM1CB", "EQE 350 4MATIC SUV", "AWD",
    f(265, "mfr", "high", "MY2024 EQE 350 4MATIC SUV — EPA", epa(47848)),
    { battery: EQE_PACK_906, charging: EQE_CHG, thermal: MB_HP_SUV, buyerNotes: [NOTE_EQE_STEER] }),
  mb("eqe-suv-2025-27-320-4m", EQE, [2025, 2027], "GM1CB", "EQE 350/320 4MATIC SUV", "AWD",
    f(253, "mfr", "high", "Sold as EQE 350 4MATIC SUV in MY2025, renamed EQE 320 4MATIC SUV from 2026 — 253-mi EPA rating (ids 48394/49685; the MY2027 cert is not yet published, MY2026 figure carried)", epa(48394)),
    { battery: EQE_PACK_905, charging: EQE_CHG, thermal: MB_HP_SUV, buyerNotes: [NOTE_EQE_STEER] }),
  // EQE SUV ─ 500 4MATIC (2023–24 only)
  mb("eqe-suv-2023-500-4m", EQE, [2023, 2023], "GM2CB", "EQE 500 4MATIC SUV", "AWD",
    f(269, "agg", "medium", "MY2023 EQE 500 4MATIC SUV — the 269-mi EPA figure Mercedes announced, as documented by contemporary press; absent from fueleconomy.gov's dataset"),
    { battery: EQE_PACK_906, charging: EQE_CHG, thermal: MB_HP_SUV, buyerNotes: [NOTE_MB_FUSE, NOTE_EQE_STEER] }),
  mb("eqe-suv-2024-500-4m", EQE, [2024, 2024], "GM2CB", "EQE 500 4MATIC SUV", "AWD",
    f(282, "mfr", "high", "MY2024 EQE 500 4MATIC SUV — EPA", epa(47849)),
    { battery: EQE_PACK_906, charging: EQE_CHG, thermal: MB_HP_SUV, buyerNotes: [NOTE_EQE_STEER] }),
  // EQE SUV ─ AMG (MY2024+)
  mb("eqe-suv-2024-amg", EQE, [2024, 2024], "GM5DB", "AMG EQE SUV", "AWD",
    f(235, "mfr", "high", "MY2024 AMG EQE SUV — EPA", epa(46971)),
    { battery: EQE_PACK_906, charging: EQE_CHG, thermal: MB_HP_SUV, buyerNotes: [NOTE_EQE_STEER] }),
  mb("eqe-suv-2025-26-amg", EQE, [2025, 2026], "GM5DB", "AMG EQE SUV", "AWD",
    f(230, "mfr", "high", "MY2025–26 AMG EQE SUV — EPA (ids 48393/49686 rate identically)", epa(48393)),
    { charging: EQE_CHG, thermal: MB_HP_SUV, buyerNotes: [NOTE_EQE_STEER] }),
  // EQS sedan ─ 450+ (RWD)
  mb("eqs-sed-2022-450plus", EQS, [2022, 2022], "CG2DB", "EQS 450+ Sedan", "RWD",
    f(350, "mfr", "high", "MY2022 EQS 450+ — EPA", epa(44785)),
    { battery: EQS_PACK_1078, charging: EQS_CHG, thermal: MB_HP_SED_EARLY }),
  mb("eqs-sed-2023-450plus", EQS, [2023, 2023], "CG2DB", "EQS 450+ Sedan", "RWD",
    f(350, "agg", "medium", "MY2023 carryover of the unchanged 2022 certification (350 mi, id 44785) — fueleconomy.gov's dataset lacks most MY2023 EQS sedan entries"),
    { battery: EQS_PACK_1078, charging: EQS_CHG, thermal: MB_HP_SED_EARLY, buyerNotes: [NOTE_MB_FUSE] }),
  mb("eqs-sed-2024-450plus", EQS, [2024, 2024], "CG2DB", "EQS 450+ Sedan", "RWD",
    f(352, "mfr", "high", "MY2024 EQS 450+ — EPA", epa(47463)),
    { battery: EQS_PACK_1078, charging: EQS_CHG, thermal: MB_HP_SED }),
  mb("eqs-sed-2025-26-450plus", EQS, [2025, 2026], "CG2DB", "EQS 450+ Sedan", "RWD",
    f(390, "mfr", "high", "MY2025–26 EQS 450+ (118 kWh pack) — EPA (ids 48388/49681 rate identically)", epa(48388)),
    { battery: EQS_PACK_118, charging: EQS_CHG, thermal: MB_HP_SED, buyerNotes: [NOTE_EQS_NEXTGEN] }),
  // EQS sedan ─ 450 4MATIC
  mb("eqs-sed-2023-450-4m", EQS, [2023, 2023], "CG2EB", "EQS 450 4MATIC Sedan", "AWD",
    f(340, "mfr", "high", "MY2023 EQS 450 4MATIC — EPA", epa(46009)),
    { battery: EQS_PACK_1078, charging: EQS_CHG, thermal: MB_HP_SED_EARLY, buyerNotes: [NOTE_MB_FUSE] }),
  mb("eqs-sed-2024-450-4m", EQS, [2024, 2024], "CG2EB", "EQS 450 4MATIC Sedan", "AWD",
    f(345, "mfr", "high", "MY2024 EQS 450 4MATIC — EPA", epa(47462)),
    { battery: EQS_PACK_1078, charging: EQS_CHG, thermal: MB_HP_SED }),
  mb("eqs-sed-2025-26-450-4m", EQS, [2025, 2026], "CG2EB", "EQS 450 4MATIC Sedan", "AWD",
    f(367, "mfr", "high", "MY2025–26 EQS 450 4MATIC (118 kWh pack) — EPA (ids 48387/49683 rate identically)", epa(48387)),
    { battery: EQS_PACK_118, charging: EQS_CHG, thermal: MB_HP_SED, buyerNotes: [NOTE_EQS_NEXTGEN] }),
  // EQS sedan ─ 580 4MATIC
  mb("eqs-sed-2022-580-4m", EQS, [2022, 2022], "CG4EB", "EQS 580 4MATIC Sedan", "AWD",
    f(340, "mfr", "high", "MY2022 EQS 580 4MATIC — EPA", epa(45023)),
    { battery: EQS_PACK_1078, charging: EQS_CHG, thermal: MB_HP_SED_EARLY }),
  mb("eqs-sed-2023-580-4m", EQS, [2023, 2023], "CG4EB", "EQS 580 4MATIC Sedan", "AWD",
    f(340, "agg", "medium", "MY2023 carryover of the unchanged 2022 certification (340 mi, id 45023) — fueleconomy.gov's dataset lacks most MY2023 EQS sedan entries"),
    { battery: EQS_PACK_1078, charging: EQS_CHG, thermal: MB_HP_SED_EARLY, buyerNotes: [NOTE_MB_FUSE] }),
  mb("eqs-sed-2024-580-4m", EQS, [2024, 2024], "CG4EB", "EQS 580 4MATIC Sedan", "AWD",
    f(345, "mfr", "high", "MY2024 EQS 580 4MATIC — EPA", epa(47464)),
    { battery: EQS_PACK_1078, charging: EQS_CHG, thermal: MB_HP_SED }),
  mb("eqs-sed-2025-26-580-4m", EQS, [2025, 2026], "CG4EB", "EQS 580 4MATIC Sedan", "AWD",
    f(371, "mfr", "high", "MY2025–26 EQS 580 4MATIC (118 kWh pack) — EPA (ids 48389/49682 rate identically)", epa(48389)),
    { battery: EQS_PACK_118, charging: EQS_CHG, thermal: MB_HP_SED, buyerNotes: [NOTE_EQS_NEXTGEN] }),
  // EQS sedan ─ AMG
  mb("eqs-sed-2022-amg", EQS, [2022, 2022], "CG5FB", "AMG EQS Sedan", "AWD",
    f(277, "mfr", "high", "MY2022 AMG EQS — EPA", epa(46330)),
    { battery: EQS_PACK_1078, charging: EQS_CHG, thermal: MB_HP_SED_EARLY }),
  mb("eqs-sed-2023-amg", EQS, [2023, 2023], "CG5FB", "AMG EQS Sedan", "AWD",
    f(277, "agg", "medium", "MY2023 carryover of the unchanged 2022 certification (277 mi, id 46330) — fueleconomy.gov's dataset lacks most MY2023 EQS sedan entries"),
    { battery: EQS_PACK_1078, charging: EQS_CHG, thermal: MB_HP_SED_EARLY, buyerNotes: [NOTE_MB_FUSE] }),
  mb("eqs-sed-2024-amg", EQS, [2024, 2024], "CG5FB", "AMG EQS Sedan", "AWD",
    f(305, "mfr", "high", "MY2024 AMG EQS — EPA", epa(47461)),
    { battery: EQS_PACK_1078, charging: EQS_CHG, thermal: MB_HP_SED }),
  mb("eqs-sed-2025-amg", EQS, [2025, 2025], "CG5FB", "AMG EQS Sedan", "AWD",
    f(315, "mfr", "high", "MY2025 AMG EQS — EPA", epa(48386)),
    { battery: EQS_PACK_118, charging: EQS_CHG, thermal: MB_HP_SED, buyerNotes: [NOTE_EQS_NEXTGEN] }),
  // EQS SUV ─ 450+ (RWD)
  mb("eqs-suv-2023-450plus", EQS, [2023, 2023], "DM2DB", "EQS 450+ SUV", "RWD",
    f(305, "mfr", "high", "MY2023 EQS 450+ SUV — EPA", epa(46011)),
    { battery: EQS_PACK_1078, charging: EQS_CHG, thermal: MB_HP_SUV, buyerNotes: [NOTE_MB_FUSE] }),
  mb("eqs-suv-2024-450plus", EQS, [2024, 2024], "DM2DB", "EQS 450+ SUV", "RWD",
    f(339, "mfr", "high", "MY2024 EQS 450+ SUV — EPA", epa(47847)),
    { battery: EQS_PACK_1078, charging: EQS_CHG, thermal: MB_HP_SUV }),
  mb("eqs-suv-2025-450plus", EQS, [2025, 2025], "DM2DB", "EQS 450+ SUV", "RWD",
    f(323, "mfr", "high", "MY2025 EQS 450+ SUV (118 kWh pack) — EPA", epa(48392)),
    { battery: EQS_PACK_118, charging: EQS_CHG, thermal: MB_HP_SUV, buyerNotes: [NOTE_EQS_NEXTGEN] }),
  // EQS SUV ─ 450/400 4MATIC
  mb("eqs-suv-2023-450-4m", EQS, [2023, 2023], "DM2EB", "EQS 450 4MATIC SUV", "AWD",
    f(285, "mfr", "high", "MY2023 EQS 450 4MATIC SUV — EPA", epa(46010)),
    { battery: EQS_PACK_1078, charging: EQS_CHG, thermal: MB_HP_SUV, buyerNotes: [NOTE_MB_FUSE] }),
  mb("eqs-suv-2024-450-4m", EQS, [2024, 2024], "DM2EB", "EQS 450 4MATIC SUV", "AWD",
    f(330, "mfr", "high", "MY2024 EQS 450 4MATIC SUV — EPA", epa(47850)),
    { battery: EQS_PACK_1078, charging: EQS_CHG, thermal: MB_HP_SUV }),
  mb("eqs-suv-2025-26-400-4m", EQS, [2025, 2026], "DM2EB", "EQS 450/400 4MATIC SUV", "AWD",
    f(312, "mfr", "high", "Sold as EQS 450 4MATIC SUV in MY2025, renamed EQS 400 4MATIC SUV for 2026 (dealer trims often still say 450) — same 312-mi EPA rating (ids 48395/49688)", epa(48395)),
    { battery: EQS_PACK_118, charging: EQS_CHG, thermal: MB_HP_SUV, buyerNotes: [NOTE_EQS_NEXTGEN] }),
  // EQS SUV ─ 580/550 4MATIC
  mb("eqs-suv-2023-580-4m", EQS, [2023, 2023], "DM4EB", "EQS 580 4MATIC SUV", "AWD",
    f(285, "mfr", "high", "MY2023 EQS 580 4MATIC SUV — EPA", epa(46012)),
    { battery: EQS_PACK_1078, charging: EQS_CHG, thermal: MB_HP_SUV, buyerNotes: [NOTE_MB_FUSE] }),
  mb("eqs-suv-2024-580-4m", EQS, [2024, 2024], "DM4EB", "EQS 580 4MATIC SUV", "AWD",
    f(330, "mfr", "high", "MY2024 EQS 580 4MATIC SUV — EPA", epa(47851)),
    { battery: EQS_PACK_1078, charging: EQS_CHG, thermal: MB_HP_SUV }),
  mb("eqs-suv-2025-26-550-4m", EQS, [2025, 2026], "DM4EB", "EQS 580/550 4MATIC SUV", "AWD",
    f(317, "mfr", "high", "Sold as EQS 580 4MATIC SUV in MY2025, renamed EQS 550 4MATIC SUV for 2026 (dealer trims often still say 580) — same 317-mi EPA rating (ids 48396/49689)", epa(48396)),
    { battery: EQS_PACK_118, charging: EQS_CHG, thermal: MB_HP_SUV, buyerNotes: [NOTE_EQS_NEXTGEN] }),
  // EQS SUV ─ Maybach 680
  mb("eqs-suv-2024-maybach", EQS, [2024, 2024], "DX5FB", "Maybach EQS 680 SUV", "AWD",
    f(280, "mfr", "high", "MY2024 Maybach EQS 680 SUV — EPA carries two 2024 certifications (280 and 321 mi, ids 47465/47852, a wheel/configuration split); the lower figure is used", epa(47465)),
    { battery: EQS_PACK_1078, charging: EQS_CHG, thermal: MB_HP_SUV }),

  // ── Tesla Model X, pack era 2016–2020 (same pass) ─────────────────────
  // Same motor-code scheme as the Model S rows above (2 = dual standard,
  // 4 = dual performance, per Tesla's Part 565 submissions); pack badge in
  // the trim picks the row. Retires data3's Model X 2017/2018 floor rows.
  {
    id: "mx-2016-17-60d", ...MX, modelYears: [2016, 2017], vin8: ["2"], drive: "AWD", packVariant: "60D",
    trim: ["60D"], battery: msPack(60),
    range: { epaRangeMi: f(200, "mfr", "high", "MY2016–17 Model X 60D (software-limited 75 pack) — EPA (38173/38526)", epa(38173)) },
    charging: MSX_OLD_CHARGING, thermal: MSX_NO_HP, warranty: MSX_OLD_W,
    buyerNotes: [NOTE_MX_EMMC],
  },
  {
    id: "mx-2016-19-75d", ...MX, modelYears: [2016, 2019], vin8: ["2"], drive: "AWD", packVariant: "75D",
    trim: ["75D"], battery: msPack(75),
    range: { epaRangeMi: f(238, "mfr", "high", "MY2016–19 Model X 75D — EPA (37423/38527/39841/41195 all rate 238)", epa(37423)) },
    charging: MSX_OLD_CHARGING, thermal: MSX_NO_HP, warranty: MSX_OLD_W,
  },
  {
    id: "mx-2016-17-90d", ...MX, modelYears: [2016, 2017], vin8: ["2"], drive: "AWD", packVariant: "90D",
    trim: ["90D"], battery: msPack(90),
    range: { epaRangeMi: f(257, "mfr", "high", "MY2016–17 Model X 90D — EPA (36979/38528 rate identically)", epa(36979)) },
    charging: MSX_OLD_CHARGING, thermal: MSX_NO_HP, warranty: MSX_OLD_W,
    buyerNotes: [NOTE_MX_EMMC],
  },
  {
    id: "mx-2017-19-100d", ...MX, modelYears: [2017, 2019], vin8: ["2"], drive: "AWD", packVariant: "100D",
    trim: ["100D"], battery: msPack(100),
    range: { epaRangeMi: f(295, "mfr", "high", "MY2017–19 Model X 100D — EPA (39831/39842/41196 all rate 295)", epa(39831)) },
    charging: MSX_OLD_CHARGING, thermal: MSX_NO_HP, warranty: MSX_OLD_W,
  },
  {
    id: "mx-2019-lr", ...MX, modelYears: [2019, 2019], vin8: ["2"], drive: "AWD", packVariant: "Long Range",
    trim: ["Long Range"], battery: msPack(100),
    range: { epaRangeMi: f(325, "mfr", "high", "MY2019 Model X Long Range (Raven) — EPA", epa(41514)) },
    charging: MSX_OLD_CHARGING, thermal: MSX_NO_HP, warranty: MSX_OLD_W,
  },
  {
    id: "mx-2020-lr", ...MX, modelYears: [2020, 2020], vin8: ["2"], drive: "AWD", packVariant: "Long Range",
    trim: ["Long Range"], battery: msPack(100),
    range: { epaRangeMi: f(328, "mfr", "high", "MY2020 Model X Long Range — EPA; the mid-year Long Range Plus rates 351", epa(42286)) },
    charging: MSX_OLD_CHARGING, thermal: MSX_NO_HP, warranty: TSX_W,
  },
  {
    id: "mx-2020-lrplus", ...MX, modelYears: [2020, 2020], vin8: ["2"], drive: "AWD", packVariant: "Long Range Plus",
    trim: ["Long Range Plus"], battery: msPack(100),
    range: { epaRangeMi: f(351, "mfr", "high", "MY2020 Model X Long Range Plus — EPA", epa(43413)) },
    charging: MSX_OLD_CHARGING, thermal: MSX_NO_HP, warranty: TSX_W,
  },
  {
    id: "mx-2020-sr", ...MX, modelYears: [2020, 2020], vin8: ["2"], drive: "AWD", packVariant: "Standard Range",
    trim: ["Standard Range", "Standard"], battery: msPack(100),
    range: { epaRangeMi: f(258, "mfr", "high", "MY2020 Model X Standard Range (software-limited) — EPA", epa(42289)) },
    charging: MSX_OLD_CHARGING, thermal: MSX_NO_HP, warranty: TSX_W,
  },
  {
    id: "mx-2016-17-p90d", ...MX, modelYears: [2016, 2017], vin8: ["4"], drive: "AWD", packVariant: "P90D",
    trim: ["P90D"], battery: msPack(90),
    range: { epaRangeMi: f(250, "mfr", "high", "MY2016–17 Model X P90D — EPA (36980/38529 rate identically)", epa(36980)) },
    charging: MSX_OLD_CHARGING, thermal: MSX_NO_HP, warranty: MSX_OLD_W,
    buyerNotes: [NOTE_MX_EMMC],
  },
  {
    id: "mx-2016-19-p100d", ...MX, modelYears: [2016, 2019], vin8: ["4"], drive: "AWD", packVariant: "P100D",
    trim: ["P100D"], battery: msPack(100),
    range: { epaRangeMi: f(289, "mfr", "high", "MY2016–19 Model X P100D — EPA (38500/38530/39843/41197 all rate 289)", epa(38500)) },
    charging: MSX_OLD_CHARGING, thermal: MSX_NO_HP, warranty: MSX_OLD_W,
  },
  {
    id: "mx-2019-perf", ...MX, modelYears: [2019, 2019], vin8: ["4"], drive: "AWD", packVariant: "Performance",
    trim: ["Performance"], battery: msPack(100),
    range: { epaRangeMi: f(270, "mfr", "high", "MY2019 Model X Performance (Raven) — EPA's only 2019 Performance certification (22-inch wheels)", epa(41515)) },
    charging: MSX_OLD_CHARGING, thermal: MSX_NO_HP, warranty: MSX_OLD_W,
  },
  {
    id: "mx-2020-perf", ...MX, modelYears: [2020, 2020], vin8: ["4"], drive: "AWD", packVariant: "Performance",
    trim: ["Performance"], battery: msPack(100),
    range: { epaRangeMi: f(305, "mfr", "high", "MY2020 Model X Performance on 20-inch wheels — EPA; 272 on 22s", epa(42287)) },
    charging: MSX_OLD_CHARGING, thermal: MSX_NO_HP, warranty: TSX_W,
  },

  // ── Hyundai Ioniq 5 N (same pass) ─────────────────────────────────────
  // Separate model string in the feed ("IONIQ 5 N"), VIN code 8 (dual
  // motor, N) per Hyundai's Part 565 submissions — the base Ioniq 5 rows in
  // data.ts key A/B/C. One EPA rating both years (221 mi). The port splits
  // by year: the Korea-built 2025 N kept CCS1 while the US-built base car
  // went NACS; the N followed for MY2026.
  {
    id: "ioniq5n-2025", make: "HYUNDAI", model: "IONIQ 5 N", modelYears: [2025, 2025], vin8: ["8"], drive: "AWD", packVariant: "N",
    battery: { packGrossKwh: f(84, "mfr", "medium", "N-specific 84 kWh pack (Hyundai publishes one figure, gross/usable unstated)") },
    range: { epaRangeMi: f(221, "mfr", "high", "MY2025 Ioniq 5 N — EPA", epa(48360)) },
    charging: {
      portStandard: f("CCS1", "mfr", "high", "The Korea-built 2025 N kept the CCS port while the US-built 2025 Ioniq 5 switched to native NACS; the N moved to NACS for MY2026"),
      architectureV: f(800, "mfr"),
    },
    thermal: { heatPump: f("standard", "mfr", "high", "The N feature sheet lists the heat pump as standard (“S”)"), batteryPreconditioning: f(true, "mfr", "high", "N Race/drag-strip preconditioning modes are a headline N feature") },
    warranty: {
      batteryYears: f(10, "mfr"), batteryMiles: f(100_000, "mfr"), sohFloorPct: f(70, "mfr"),
      batteryTransfers: f(true, "mfr", "high", "HV battery & EV system coverage transfers in full — Hyundai Owner's Handbook"),
      powertrainTransfers: f(false, "mfr", "high", "Powertrain 10yr/100k is original-owner-only; drops to 5yr/60k for a second owner"),
    },
  },
  {
    id: "ioniq5n-2026", make: "HYUNDAI", model: "IONIQ 5 N", modelYears: [2026, 2026], vin8: ["8"], drive: "AWD", packVariant: "N",
    battery: { packGrossKwh: f(84, "mfr", "medium", "N-specific 84 kWh pack (Hyundai publishes one figure, gross/usable unstated)") },
    range: { epaRangeMi: f(221, "mfr", "high", "MY2026 Ioniq 5 N — EPA (unchanged from 2025)", epa(49965)) },
    charging: {
      portStandard: f("NACS", "mfr", "high", "MY2026 N adopted the native NACS (J3400) port; a CCS1 adapter is standard equipment"),
      superchargerAccess: f("native", "mfr"),
      architectureV: f(800, "mfr"),
    },
    thermal: { heatPump: f("standard", "mfr", "high", "The N feature sheet lists the heat pump as standard (“S”)"), batteryPreconditioning: f(true, "mfr", "high", "N Race/drag-strip preconditioning modes are a headline N feature") },
    warranty: {
      batteryYears: f(10, "mfr"), batteryMiles: f(100_000, "mfr"), sohFloorPct: f(70, "mfr"),
      batteryTransfers: f(true, "mfr", "high", "HV battery & EV system coverage transfers in full — Hyundai Owner's Handbook"),
      powertrainTransfers: f(false, "mfr", "high", "Powertrain 10yr/100k is original-owner-only; drops to 5yr/60k for a second owner"),
    },
  },

  // ── Lucid Air (same pass) ─────────────────────────────────────────────
  // VIN pos-8 is a flat "A" — the trim carries the variant cleanly here
  // (Dream/Grand Touring/Touring/Pure/Sapphire), and wheel size is the big
  // EPA lever (up to 51 mi). Rows carry the 19-inch certification with the
  // larger-wheel figures in the note, per the Plaid/Taycan convention.
  ...(() => {
    const AIR = { make: "LUCID", model: "Air" };
    const LUCID_W = {
      batteryYears: f(8, "mfr" as Source, "high", "\u201cHigh-voltage battery: 8 Years / 100,000 miles (whichever comes first) retaining 70% capacity\u201d \u2014 Lucid's own warranty page (verified in the data3 pass)"),
      batteryMiles: f(100_000, "mfr" as Source, "high"),
      sohFloorPct: f(70, "mfr" as Source, "high", "Same Lucid warranty-page quote"),
      batteryTransfers: f(true, "mfr" as Source, "high", "\u201c\u2026and to subsequent owner(s) if the vehicle is within the applicable coverage period\u201d \u2014 Lucid's own warranty page"),
    };
    const LUCID_CHG = {
      portStandard: f<"CCS1">("CCS1", "mfr", "high", "Lucid's own site: \u201cYour Lucid Air has a J1772 (CCS1) charge port\u201d \u2014 no native NACS port as of the latest material found"),
      superchargerAccess: f<"adapter">("adapter", "mfr", "high", "All Air owners gained Supercharger access July 31, 2025 via a Lucid-sold NACS-to-CCS1 adapter (~$220); capped around 50 kW on that path \u2014 well below the car's native CCS1 DC peak"),
    };
    // Lucid IR press release: the heat pump \u201cfirst employed on Lucid Sapphire
    // now becomes standard across the lineup\u201d \u2014 MY2025 onward.
    const LUCID_NO_HP = { heatPump: f<"none">("none", "mfr", "high", "Heat pump became standard only from MY2025 (Lucid IR release); pre-2025 Airs other than Sapphire have none") };
    const LUCID_HP = { heatPump: f<"standard">("standard", "mfr", "high", "\u201cThe heat pump first employed on Lucid Sapphire now becomes standard across the lineup\u201d \u2014 Lucid IR release, MY2025 onward") };
    const NOTE_AIR_CAM = {
      headline: "Rearview-camera recalls apply across the Air lineup",
      body: "25V670 (2022\u20132025, all trims: camera image can fail, delay, or display inaccurately) and 26V017 (2022\u20132026, cars with the AD02 package: camera may not display in reverse). Both fixed via free OTA update.",
      severity: "warning" as const,
    };
    const NOTE_AIR_RWD = {
      headline: "Four RWD-only recalls \u2014 check this VIN's status",
      body: "24V836 (2024\u20132025 Pure RWD: rear subframe wiring harness too short, can cut power to the rear drive unit; free harness replacement). 25V669 and 26V193 (2024\u20132026 Pure RWD: half-shaft bolts may allow disconnection from the drive unit; free bolt inspection/replacement). 26V309 (2024\u20132025 RWD: Gen 4 inverter internal friction/damage can cause loss of drive power; OTA monitoring plus free replacement if a failure is detected). None apply to AWD Airs.",
      severity: "trap" as const,
    };
    const NOTE_WHEELS = {
      headline: "Wheel size sets this car's EPA rating — spreads up to 50 miles",
      body: "The figure shown is the 19-inch-wheel certification; 20- and 21-inch fitments rate meaningfully lower (see the range note). Check the fitted wheels before trusting the number.",
      severity: "info" as const,
    };
    const air = (id: string, years: [number, number], trim: string[], drv: "AWD" | "RWD", variant: string, rangeFact: Fact<number>, extra?: Partial<EnrichmentRow>): EnrichmentRow => ({
      id, ...AIR, modelYears: years, trim, drive: drv, packVariant: variant,
      range: { epaRangeMi: rangeFact }, charging: LUCID_CHG, warranty: LUCID_W, buyerNotes: [NOTE_WHEELS, NOTE_AIR_CAM], ...extra,
    });
    const PACK112 = { packGrossKwh: f(112, "vin", "high", "112 kWh in Lucid's Part 565 submission for this VIN pattern") };
    return [
      air("air-2022-dream-r", [2022, 2022], ["Dream Edition", "Dream", "Dream Edition Range", "Dream R"], "AWD", "Dream Edition Range",
        f(520, "mfr", "high", "MY2022 Dream Edition Range on 19-inch wheels — EPA; 481 on 21s. Feeds rarely say Range-vs-Performance: a bare “Dream Edition” presents both as candidates", epa(44493)), { battery: PACK112, thermal: LUCID_NO_HP }),
      air("air-2022-dream-p", [2022, 2022], ["Dream Edition", "Dream", "Dream Edition Performance", "Dream P"], "AWD", "Dream Edition Performance",
        f(471, "mfr", "high", "MY2022 Dream Edition Performance on 19-inch wheels — EPA; 451 on 21s", epa(44491)), { battery: PACK112, thermal: LUCID_NO_HP }),
      air("air-2022-gt", [2022, 2022], ["Grand Touring", "GT"], "AWD", "Grand Touring",
        f(516, "mfr", "high", "MY2022 Grand Touring on 19-inch wheels — EPA; 469 on 21s", epa(44495)), { battery: PACK112, thermal: LUCID_NO_HP }),
      air("air-2023-gt", [2023, 2023], ["Grand Touring", "GT"], "AWD", "Grand Touring",
        f(516, "mfr", "high", "MY2023 Grand Touring on 19-inch wheels — EPA; 469 on 20s/21s", epa(46303)), { thermal: LUCID_NO_HP }),
      air("air-2023-gtp", [2023, 2023], ["Grand Touring Performance", "GT Performance", "GTP"], "AWD", "Grand Touring Performance",
        f(446, "mfr", "high", "MY2023 Grand Touring Performance (21-inch wheels, the only cert) — EPA", epa(46306)), { thermal: LUCID_NO_HP }),
      air("air-2023-touring", [2023, 2023], ["Touring"], "AWD", "Touring",
        f(425, "mfr", "high", "MY2023 Touring on 19-inch wheels — EPA; 384 on 20s/21s", epa(46309)), { thermal: LUCID_NO_HP }),
      air("air-2023-pure", [2023, 2023], ["Pure"], "AWD", "Pure AWD",
        f(410, "mfr", "high", "MY2023 Pure AWD on 19-inch wheels — EPA; 384 on 20s. (The RWD Pure arrived MY2024)", epa(46307)), { thermal: LUCID_NO_HP }),
      air("air-2024-gt", [2024, 2024], ["Grand Touring", "GT"], "AWD", "Grand Touring",
        f(516, "mfr", "high", "MY2024 Grand Touring (XR drive units) on 19-inch wheels — EPA; 485 on 20s, 450 on 21s", epa(47836)), { thermal: LUCID_NO_HP }),
      air("air-2025-26-gt", [2025, 2026], ["Grand Touring", "GT"], "AWD", "Grand Touring",
        f(512, "mfr", "high", "MY2025–26 Grand Touring on 19-inch wheels — EPA (48371/49966 rate identically); 480 on 20s, 446 on 21s", epa(48371)), { thermal: LUCID_HP }),
      air("air-2024-touring", [2024, 2024], ["Touring"], "AWD", "Touring",
        f(411, "mfr", "high", "MY2024 Touring on 19-inch wheels — EPA; 382 on 20s, 365 on 21s", epa(47839)), { thermal: LUCID_NO_HP }),
      air("air-2026-touring", [2026, 2026], ["Touring"], "AWD", "Touring",
        f(431, "mfr", "high", "MY2026 Touring on 19-inch wheels — EPA; 396 on 20s", epa(49972)), { thermal: LUCID_HP }),
      air("air-2024-pure", [2024, 2024], ["Pure"], "RWD", "Pure RWD",
        f(419, "mfr", "high", "MY2024 Pure RWD on 19-inch wheels — EPA; 394 on 20s", epa(47454)), { thermal: LUCID_NO_HP, buyerNotes: [NOTE_WHEELS, NOTE_AIR_CAM, NOTE_AIR_RWD] }),
      // (MY2025 Pure RWD and Touring live in data3 with fuller per-trim
      // recall research; certs are identical.)
      air("air-2026-pure", [2026, 2026], ["Pure"], "RWD", "Pure RWD",
        f(420, "mfr", "high", "MY2026 Pure RWD on 19-inch wheels — EPA; 372 on 20s", epa(49969)),
        { thermal: LUCID_HP, buyerNotes: [NOTE_WHEELS, NOTE_AIR_CAM, NOTE_AIR_RWD] }),
      air("air-2024-26-sapphire", [2024, 2026], ["Sapphire"], "AWD", "Sapphire",
        f(427, "mfr", "high", "MY2024–26 Sapphire — EPA (47456/48376/49971 all rate 427, no wheel split)", epa(47456)), { thermal: LUCID_HP, buyerNotes: [NOTE_AIR_CAM] }),
    ];
  })(),

  // ── Genesis GV60 / Electrified G80 / Electrified GV70 (same pass) ─────
  // VIN pos-8 is Genesis' motor code per its Part 565 submissions: GV60
  // B = performance dual (boost 180+180 kW), C = standard dual (160+73.9);
  // the E-G80/E-GV70 carry 1 (160+160). Wheel packages split GV60 ratings
  // from MY2024 on — trim names pick them (Standard=19", Advanced=20" from
  // 2025; Prestige=20" for 2027).
  ...(() => {
    const GEN_W = {
      batteryYears: f(10, "agg" as Source, "medium", "10 yr/100,000 mi EV-battery coverage (Hyundai-group terms), consistently documented; not re-verified against a Genesis primary booklet this pass"),
      batteryMiles: f(100_000, "agg" as Source, "medium"),
    };
    const GEN_CHG = { portStandard: f<"CCS1">("CCS1", "mfr"), architectureV: f<800>(800, "mfr", "high", "E-GMP 800-volt platform") };
    const P774 = { packGrossKwh: f(77.4, "agg", "medium", "77.4 kWh E-GMP pack (111.2 Ah in Genesis' Part 565 submissions)") };
    const P84 = { packGrossKwh: f(84, "vin", "medium", "Genesis' Part 565 submissions read 120.6 Ah (~84 kWh refreshed E-GMP pack) for these VINs") };
    const gen = (id: string, model: string, years: [number, number], vin8: string[] | undefined, trim: string[] | undefined, variant: string, rangeFact: Fact<number>, extra?: Partial<EnrichmentRow>): EnrichmentRow => ({
      id, make: "GENESIS", model, modelYears: years, vin8, trim, drive: "AWD", packVariant: variant,
      range: { epaRangeMi: rangeFact }, battery: P774, charging: GEN_CHG, warranty: GEN_W, ...extra,
    });
    return [
      gen("gv60-2023-adv", "GV60", [2023, 2023], ["C"], undefined, "Advanced",
        f(248, "mfr", "high", "MY2023 GV60 Advanced — EPA; the only 2023 standard-dual config (code C)", epa(45328))),
      gen("gv60-2023-24-perf", "GV60", [2023, 2024], ["B"], undefined, "Performance",
        f(235, "mfr", "high", "MY2023–24 GV60 Performance (boost-motor code B) — EPA (45329/46950 rate identically)", epa(45329))),
      gen("gv60-2024-adv", "GV60", [2024, 2024], ["C"], undefined, "Advanced",
        f(264, "mfr", "high", "MY2024 GV60 Advanced on 19-inch wheels — EPA; 248 on the 20-inch wheel package", epa(46948))),
      gen("gv60-2025-std", "GV60", [2025, 2025], ["C"], ["Standard"], "Standard AWD",
        f(264, "mfr", "high", "MY2025 GV60 Standard AWD (19-inch wheels) — EPA", epa(48356))),
      gen("gv60-2025-adv", "GV60", [2025, 2025], ["C"], ["Advanced"], "Advanced",
        f(248, "mfr", "high", "MY2025 GV60 Advanced (20-inch wheels) — EPA", epa(48354))),
      gen("gv60-2026-std", "GV60", [2026, 2026], ["C"], ["Standard"], "Standard AWD",
        f(282, "mfr", "high", "MY2026 GV60 Standard AWD (19-inch wheels, refreshed pack) — EPA", epa(49653)), { battery: P84 }),
      gen("gv60-2026-adv", "GV60", [2026, 2026], ["C"], ["Advanced"], "Advanced",
        f(267, "mfr", "high", "MY2026 GV60 Advanced (20-inch wheels, refreshed pack) — EPA", epa(49654)), { battery: P84 }),
      gen("gv60-2026-perf", "GV60", [2026, 2026], ["B"], undefined, "Performance",
        f(252, "mfr", "high", "MY2026 GV60 Performance — EPA", epa(49655)), { battery: P84 }),
      gen("gv60-2027-std", "GV60", [2027, 2027], ["C"], ["Standard"], "Standard AWD",
        f(282, "mfr", "high", "MY2027 GV60 AWD (19-inch wheels) — EPA", epa(50636)), { battery: P84 }),
      gen("gv60-2027-prestige", "GV60", [2027, 2027], ["C"], ["Prestige"], "Prestige",
        f(267, "mfr", "high", "MY2027 GV60 Prestige (20-inch wheels) — EPA", epa(50635)), { battery: P84 }),
      gen("eg80-2023-25", "Electrified G80", [2023, 2025], ["1"], undefined, "Electrified G80",
        f(282, "mfr", "high", "MY2023–25 Electrified G80 — EPA (45999/47447/48351 all rate 282)", epa(45999)), { battery: { packGrossKwh: f(87.2, "agg", "medium", "87.2 kWh pack (pre-2026 Electrified G80)") } }),
      gen("egv70-2023-25", "Electrified GV70", [2023, 2025], ["1"], undefined, "Electrified GV70",
        f(236, "mfr", "high", "MY2024–25 Electrified GV70 — EPA (46947/48353 rate identically); fueleconomy.gov carries no MY2023 entry, but the 2023 car is hardware-identical", epa(46947))),
    ];
  })(),

  // ── GMC Sierra EV (same pass) ─────────────────────────────────────────
  // VIN pos-8 is GM's pack code, verified against inventory trims: L = Max
  // Range, D = Extended Range, H = Standard Range (new for 2026). vPIC's
  // per-VIN kWh is a flat 205 on Extended and Max Range trucks alike —
  // model-level junk, so no row carries a pack figure keyed from it.
  // fueleconomy.gov has no 2024 Sierra EV record and no 2025 Max Range
  // record (verified via the model menu — only the 390-mi 2025 ER cert
  // exists); those two figures are GM's announced EPA ratings.
  ...(() => {
    const SEV = { make: "GMC", model: "Sierra EV" };
    const GM_W = {
      batteryYears: f(8, "mfr" as Source), batteryMiles: f(100_000, "mfr" as Source),
      sohFloorPct: f(75, "mfr" as Source, "high", "GMC's current EV warranty booklet (read directly for the data3 Ultium rows) states the 75% floor"),
      batteryTransfers: f(true, "mfr" as Source, "high", "“Transferable at no cost” — GMC EV warranty booklet"),
    };
    const SEV_CHG = { portStandard: f<"CCS1">("CCS1", "mfr", "high", "CCS1-native like Silverado EV/Escalade IQ (a GM NACS adapter covers Superchargers) — the opposite of the NACS-native Optiq") };
    const sev = (id: string, years: [number, number], vin8: string[], variant: string, rangeFact: Fact<number>): EnrichmentRow => ({
      id, ...SEV, modelYears: years, vin8, drive: "AWD", packVariant: variant,
      range: { epaRangeMi: rangeFact }, charging: SEV_CHG, warranty: GM_W,
    });
    return [
      sev("sierraev-2024-denali-e1", [2024, 2024], ["L"], "Denali Edition 1 (Max Range)",
        f(440, "agg", "medium", "MY2024 Denali Edition 1, the only 2024 config — GM's announced EPA rating; absent from fueleconomy.gov's dataset")),
      sev("sierraev-2025-max", [2025, 2025], ["L"], "Max Range",
        f(460, "agg", "medium", "MY2025 Max Range pack (VIN code L) — GM's announced EPA rating; fueleconomy.gov carries only the Extended Range 2025 cert")),
      sev("sierraev-2025-er", [2025, 2025], ["D"], "Extended Range",
        f(390, "mfr", "high", "MY2025 Extended Range (VIN code D) — EPA", epa(48709))),
      sev("sierraev-2026-max", [2026, 2026], ["L"], "Max Range",
        f(460, "agg", "medium", "MY2026 Max Range pack (VIN code L) — GM quotes the same 460-mi rating as 2025; fueleconomy.gov has no 2026 Max Range cert yet")),
      // 2026 ER/SR rows live in data3 (richer facts + the 26V494 battery
      // recall note) — upgraded this pass with vin8 keys D/H.
    ];
  })(),

  // ── Subaru Solterra (same pass) ───────────────────────────────────────
  // VIN pos-8: A = gen-1 (2023–25, 72.8 kWh per Subaru's Part 565), C =
  // the MY2026 refresh (74.7 kWh, native NACS). Premium vs Limited/Touring
  // is a wheel split; the feed's fake "15/18 Series" trims are stripped in
  // cleanTrim so those cars present the two certs as candidates.
  ...(() => {
    const SOL = { make: "SUBARU", model: "Solterra" };
    // Warranty, gen-1 charging cap, heat pump, chemistry, tested range, and
    // the wheel-detachment recall carried forward from the retired data2
    // blanket row (whose single 227-mi figure the per-trim rows replace).
    const SOL_W = {
      batteryYears: f(8, "mfr" as Source), batteryMiles: f(100_000, "mfr" as Source),
      sohFloorPct: f(70, "mfr" as Source, "high", "\u201cRetention of 70% or more of the original battery capacity\u201d (MY2023 BEV booklet; later years reported same)"),
      batteryTransfers: f(true, "mfr" as Source, "high", "\u201cEvery owner of the vehicle during the warranty period shall be entitled to the benefits\u201d"),
    };
    const P728 = { packGrossKwh: f(72.8, "vin", "high", "72.8 kWh in Subaru's Part 565 submissions for gen-1 VINs (CATL pack shared with bZ4X AWD)"), chemistry: f<"NMC">("NMC", "agg", "medium") };
    const P747 = { packGrossKwh: f(74.7, "vin", "high", "74.7 kWh in Subaru's Part 565 submissions for MY2026 VINs") };
    const SOL_CHG_G1 = {
      portStandard: f<"CCS1">("CCS1", "mfr"),
      superchargerAccess: f<"adapter">("adapter", "agg", "medium", "Adapter program alongside Toyota, late 2025"),
      dcPeakKw: f(100, "agg", "medium", "100 kW cap through MY2025; weak cold-weather charging on 2023 cars"),
    };
    const SOL_CHG_G2 = { portStandard: f<"NACS">("NACS", "mfr", "high", "The MY2026 refresh adopted the native NACS (J3400) port"), superchargerAccess: f<"native">("native", "mfr") };
    const SOL_HP = { heatPump: f<"standard">("standard", "agg", "medium", "DENSO heat pump system (supplier announcement)") };
    const NOTE_SOL_WHEELS = {
      headline: "Same wheel-detachment recall as its Toyota twin",
      body: "Recall 22V-444 (wheel hub bolts can loosen; wheels can detach) plus Subaru's follow-up 23V-064 (bolts improperly tightened during the first remedy). Both remedies are free; check completion on this VIN. DC charging peaks at 100 kW; 2023 cars lack the improved cold-weather battery conditioning added for 2024.",
      severity: "warning" as const,
    };
    const SOL_TESTED = f(200, "tested", "low", "75-mph (Car and Driver): 200 mi \u2014 reported secondhand; no verified instrumented test found");
    const sol = (id: string, years: [number, number], vin8: string[], trim: string[] | undefined, variant: string, rangeFact: Fact<number>, extra?: Partial<EnrichmentRow>): EnrichmentRow => {
      const gen1 = vin8[0] === "A";
      return {
        id, ...SOL, modelYears: years, vin8, trim, drive: "AWD", packVariant: variant,
        range: gen1 ? { epaRangeMi: rangeFact, testedRangeMi: SOL_TESTED } : { epaRangeMi: rangeFact },
        battery: gen1 ? P728 : P747,
        charging: gen1 ? SOL_CHG_G1 : SOL_CHG_G2,
        thermal: SOL_HP, warranty: SOL_W,
        buyerNotes: gen1 ? [NOTE_SOL_WHEELS] : undefined,
        ...extra,
      };
    };
    return [
      sol("solterra-2023-premium", [2023, 2023], ["A"], ["Premium"], "Premium",
        f(228, "mfr", "high", "MY2023 Solterra Premium (18-inch wheels) — EPA", epa(46030))),
      sol("solterra-2023-limtour", [2023, 2023], ["A"], ["Limited", "Touring"], "Limited/Touring",
        f(222, "mfr", "high", "MY2023 Solterra Limited/Touring (20-inch wheels) — EPA", epa(46031))),
      sol("solterra-2024-25-premium", [2024, 2025], ["A"], ["Premium"], "Premium",
        f(227, "mfr", "high", "MY2024–25 Solterra Premium — EPA (47482/48762 rate identically)", epa(47482))),
      sol("solterra-2024-25-limtour", [2024, 2025], ["A"], ["Limited", "Touring"], "Limited/Touring",
        f(222, "mfr", "high", "MY2024–25 Solterra Limited/Touring — EPA (47483/48763 rate identically)", epa(47483))),
      sol("solterra-2026-base", [2026, 2026], ["C"], ["Premium", "Limited"], "Premium/Limited",
        f(288, "mfr", "high", "MY2026 Solterra (refresh) on 18-inch wheels — EPA; the 20-inch XT trims rate 278", epa(49982))),
      sol("solterra-2026-xt", [2026, 2026], ["C"], ["XT", "Touring XT", "Limited XT"], "XT",
        f(278, "mfr", "high", "MY2026 Solterra XT trims (20-inch wheels; EPA's “Solterra 20 AWD” cert) — EPA", epa(49981))),
    ];
  })(),

  // ── Audi e-tron family: e-tron/Q8 e-tron, e-tron GT, Q6, A6 (2026-08-15) ──
  //
  // Codes observed per-VIN across 250 inventory cars: E = e-tron/Q8 family,
  // W = e-tron GT, F = Q6/SQ6, H = A6/S6 — model-level letters, not variant
  // codes, so variants key on model string + trim/drive like the Q4. The S
  // models ("e-tron S", "SQ8", "SQ6", "S6", "RS e-tron GT") are their own
  // model strings in the feed — S LINE trims on regular cars are an
  // appearance package, never the S powertrain, and match the regular rows.
  // MY2025–26 A6 e-tron certs are absent from fueleconomy.gov (menu checked;
  // A6 appears only under MY2027) — those figures are Audi's announced EPA
  // estimates, marked agg/medium.
  ...(() => {
    const AUDI_CHG_400 = { portStandard: f<"CCS1">("CCS1", "mfr"), architectureV: f<400>(400, "mfr") };
    const AUDI_CHG_800 = { portStandard: f<"CCS1">("CCS1", "mfr"), architectureV: f<800>(800, "mfr", "high", "PPE/J1 800-volt platform") };
    const ETRON_HP = { heatPump: f<"standard">("standard", "agg", "medium", "The e-tron launched with a standard heat pump (widely documented); not re-verified against a per-year Audi US spec sheet this pass") };
    const P95 = { packGrossKwh: f(95, "mfr", "medium", "95 kWh gross — Audi e-tron/e-tron S pack, all years") };
    const P114 = { packGrossKwh: f(114, "mfr", "medium", "114 kWh gross — the Q8 e-tron's enlarged pack") };
    const P100 = { packGrossKwh: f(100, "mfr", "medium", "100 kWh gross / 94.4 net — PPE pack shared by Q6 and A6 e-tron"), packUsableKwh: f(94.4, "mfr", "medium") };
    const GT_PACK = {
      packGrossKwh: f(93, "mfr", "high", "Audi's own e-tron GT tech page: “93 kWh gross” (pre-2025-refresh car)"),
      packUsableKwh: f(84, "mfr", "high", "Audi: “84 kWh of energy net”"),
    };
    const au = (id: string, model: string, years: [number, number], vin8: string[], variant: string, rangeFact: Fact<number>, extra?: Partial<EnrichmentRow>): EnrichmentRow => ({
      id, make: "AUDI", model, modelYears: years, vin8, drive: "AWD", packVariant: variant,
      range: { epaRangeMi: rangeFact }, battery: P95, charging: AUDI_CHG_400, thermal: ETRON_HP, warranty: AUDI_W, ...extra,
    });
    return [
      // e-tron SUV / Sportback (2019–23) — one quattro variant per body/year.
      au("etron-2019-20", "e-tron", [2019, 2020], ["E"], "55 quattro",
        f(204, "mfr", "high", "MY2019 e-tron — EPA; MY2020 carried the same certification", epa(41393))),
      au("etron-2021-22", "e-tron", [2021, 2022], ["E"], "55 quattro",
        f(222, "mfr", "high", "MY2021–22 e-tron — EPA (43498/44920 rate identically; the 2021 battery-management update added 18 mi over 2019–20)", epa(43498))),
      au("etron-2023", "e-tron", [2023, 2023], ["E"], "55 quattro",
        f(226, "mfr", "high", "MY2023 e-tron (final year before the Q8 e-tron rename) — EPA", epa(45984))),
      au("etronsb-2020-22", "e-tron Sportback", [2020, 2022], ["E"], "55 quattro Sportback",
        f(218, "mfr", "high", "MY2020–22 e-tron Sportback — EPA (42674/43499/44921 all rate 218)", epa(42674))),
      au("etronsb-2023", "e-tron Sportback", [2023, 2023], ["E"], "55 quattro Sportback",
        f(225, "mfr", "high", "MY2023 e-tron Sportback — EPA", epa(45987))),
      // One feed writes the whole trim into the model field.
      au("etronsb-2020-22-junkmodel", "e-tron Sportback quattro Premium Plus", [2020, 2022], ["E"], "55 quattro Sportback",
        f(218, "mfr", "high", "MY2020–22 e-tron Sportback — EPA (see etronsb-2020-22; this row exists for a feed that puts the full trim in the model string)", epa(42674))),
      au("etron-s-2022-23", "e-tron S", [2022, 2023], ["E"], "S",
        f(208, "mfr", "high", "MY2022–23 e-tron S on 20-inch wheels — EPA; 181 on 21/22s (45985/46614)", epa(45985))),
      // Q8 e-tron rename year (2024) + SQ8.
      au("q8etron-2024", "Q8 e-tron", [2024, 2024], ["E"], "55 quattro",
        f(285, "mfr", "high", "MY2024 Q8 e-tron quattro — EPA", epa(46913)), { battery: P114 }),
      au("q8etronsb-2024-a", "Q8 Sportback e-tron", [2024, 2024], ["E"], "55 quattro Sportback",
        f(296, "mfr", "high", "MY2024 Q8 Sportback e-tron quattro — EPA; 300 in the ultra (aero) configuration", epa(47440)), { battery: P114 }),
      au("q8etronsb-2024-b", "Q8 e-tron Sportback", [2024, 2024], ["E"], "55 quattro Sportback",
        f(296, "mfr", "high", "MY2024 Q8 Sportback e-tron quattro — EPA; 300 in the ultra (aero) configuration", epa(47440)), { battery: P114 }),
      au("sq8etron-2024", "SQ8 e-tron", [2024, 2024], ["E"], "SQ8",
        f(253, "mfr", "high", "MY2024 SQ8 e-tron on 20-inch wheels — EPA; 218 on 21/22s", epa(47441)), { battery: P114 }),
      // e-tron GT (J1 platform) 2022–23; the 2024 row lives in data3.
      au("etrongt-2022-23", "e-tron GT", [2022, 2023], ["W"], "e-tron GT quattro",
        f(238, "mfr", "high", "MY2022–23 e-tron GT — EPA (44776/45981 rate identically)", epa(44776)),
        { battery: GT_PACK, charging: { ...AUDI_CHG_800, dcPeakKw: f(270, "mfr", "high", "Audi: “up to 270 kW”") }, thermal: { heatPump: f<"standard">("standard", "mfr", "high", "Audi: the e-tron GT's heat pump is standard") } }),
      au("rs-etrongt-2022-23", "RS e-tron GT", [2022, 2023], ["W"], "RS e-tron GT",
        f(232, "mfr", "high", "MY2022–23 RS e-tron GT — EPA (44783/45982 rate identically)", epa(44783)),
        { battery: GT_PACK, charging: { ...AUDI_CHG_800, dcPeakKw: f(270, "mfr", "high", "Audi: “up to 270 kW”") }, thermal: { heatPump: f<"standard">("standard", "mfr", "high", "Audi: the e-tron GT's heat pump is standard") } }),
      // Q6 e-tron (PPE) — quattro vs RWD splits on drive; SQ6 is its own
      // model string.
      au("q6etron-2025-quattro", "Q6 e-tron", [2025, 2025], ["F"], "quattro",
        f(307, "mfr", "high", "MY2025 Q6 e-tron quattro on 19-inch wheels — EPA; 295 on 20s", epa(48297)), { battery: P100, charging: AUDI_CHG_800, thermal: undefined }),
      au("q6etron-2025-rwd", "Q6 e-tron", [2025, 2025], ["F"], "RWD",
        f(310, "mfr", "high", "MY2025 Q6 e-tron (RWD) on 19-inch wheels — EPA; 298 on 20s, 321 as the ultra", epa(48683)), { drive: "RWD", battery: P100, charging: AUDI_CHG_800, thermal: undefined }),
      au("q6etron-2027-quattro", "Q6 e-tron", [2027, 2027], ["F"], "quattro",
        f(325, "mfr", "high", "MY2027 Q6 e-tron quattro on 19-inch tires — EPA; 301 on 20s (EPA lists no 2027 RWD cert)", epa(50376)), { battery: P100, charging: AUDI_CHG_800, thermal: undefined }),
      au("sq6etron-2025", "SQ6 e-tron", [2025, 2025], ["F"], "SQ6",
        f(275, "mfr", "high", "MY2025 SQ6 e-tron — EPA", epa(48303)), { battery: P100, charging: AUDI_CHG_800, thermal: undefined }),
      // A6 e-tron family (2025) — certs absent from fueleconomy.gov until
      // MY2027; Audi's announced EPA estimates, achieved with the no-cost
      // "ultra" aero configuration on 19-inch wheels.
      ...["A6 e-tron", "A6 Sportback e-tron"].flatMap((m, i): EnrichmentRow[] => [
        au(`a6etron-2025-rwd-${i ? "b" : "a"}`, m, [2025, 2026], ["H"], "RWD (performance)",
          f(392, "agg", "medium", "MY2025 A6 Sportback e-tron RWD, ultra configuration with 19-inch wheels — Audi's announced EPA estimate; larger wheels rate lower, and fueleconomy.gov carries no 2025–26 A6 e-tron cert (the MY2027 certs read 348 standard / 395 ultra)"),
          { drive: "RWD", battery: P100, charging: AUDI_CHG_800, thermal: undefined }),
        au(`a6etron-2025-quattro-${i ? "b" : "a"}`, m, [2025, 2026], ["H"], "quattro",
          f(377, "agg", "medium", "MY2025 A6 Sportback e-tron quattro, ultra configuration — Audi's announced EPA estimate; larger wheels rate lower (MY2027 certs: 327 standard / 360 ultra)"),
          { battery: P100, charging: AUDI_CHG_800, thermal: undefined }),
      ]),
      au("s6etron-2025", "S6 Sportback e-tron", [2025, 2026], ["H"], "S6",
        f(324, "agg", "medium", "MY2025 S6 Sportback e-tron — Audi's announced EPA estimate; fueleconomy.gov carries no 2025–26 cert (MY2027: 326/311 by wheel)"),
        { battery: P100, charging: AUDI_CHG_800, thermal: undefined }),
    ];
  })(),

  // ── Lexus RZ + electric ES (2026-08-15) ───────────────────────────────
  // VIN pos-8: B = RZ, 1 = the new electric ES — which safely fences the
  // electric rows away from gas/hybrid ES listings that share the bare "ES"
  // model string. Drive settles FWD-vs-AWD variants (300e/350e are FWD,
  // 450e/500e AWD); the 2026 RZ 550e exists only as the F SPORT, so tier
  // trims (Premium/Luxury) imply 450e. Feed model strings restate variants
  // ("RZ 450e", "ES 500e", "ESe") — rows are emitted per string.
  ...(() => {
    const LEX_W = {
      batteryYears: f(8, "agg" as Source, "medium", "8 yr/100,000 mi EV-battery coverage (Toyota-group terms), consistently documented; not re-verified against a Lexus primary booklet this pass"),
      batteryMiles: f(100_000, "agg" as Source, "medium"),
    };
    const LEX_HP = { heatPump: f<"standard">("standard", "agg", "medium", "Heat pump standard across the RZ/electric-ES line, consistently documented") };
    const CCS = { portStandard: f<"CCS1">("CCS1", "mfr") };
    const NACS26 = { portStandard: f<"NACS">("NACS", "mfr", "high", "MY2026 Lexus EVs adopted the native NACS (J3400) port"), superchargerAccess: f<"native">("native", "mfr") };
    const P747L = { packGrossKwh: f(74.7, "vin", "medium", "74.7 kWh in the Part 565 submissions for MY2026 VINs (RZ and electric ES share the pack family)") };
    const lex = (id: string, model: string, years: [number, number], vin8: string[], trim: string[] | undefined, drv: "AWD" | "FWD", variant: string, rangeFact: Fact<number>, extra?: Partial<EnrichmentRow>): EnrichmentRow => ({
      id, make: "LEXUS", model, modelYears: years, vin8, trim, drive: drv, packVariant: variant,
      range: { epaRangeMi: rangeFact }, charging: CCS, thermal: LEX_HP, warranty: LEX_W, ...extra,
    });
    const rz450e_2325 = f(220, "mfr", "high", "MY2023–25 RZ 450e on 18-inch wheels — EPA (46986/47834/49101 rate identically); 196 on 20s", epa(46986));
    const rz300e = f(266, "mfr", "high", "MY2024–25 RZ 300e (FWD) on 18-inch wheels — EPA (47832/49099 rate identically); 224 on 20s", epa(47832));
    const rz350e = f(301, "mfr", "high", "MY2026 RZ 350e (FWD) on 18-inch wheels — EPA; 284 on 20s", epa(50291));
    const rz450e_26 = f(264, "mfr", "high", "MY2026 RZ 450e on 18-inch wheels — EPA; 257 or 228 on the two 20-inch fitments", epa(50217));
    const P714 = { packGrossKwh: f(71.4, "agg", "medium", "71.4 kWh pack (2023–25 RZ)") };
    return [
      // RZ under its variant model strings and the bare "RZ".
      ...["RZ", "RZ 450e"].map((m, i) => lex(`rz-2023-25-450e-${i}`, m, [2023, 2025], ["B"], undefined, "AWD", "450e", rz450e_2325, { battery: P714 })),
      ...["RZ", "RZ 300e"].map((m, i) => lex(`rz-2024-25-300e-${i}`, m, [2024, 2025], ["B"], undefined, "FWD", "300e", rz300e, { battery: P714 })),
      // 2026 rows key on the VDS block — the feed contradicts itself (two
      // BDADB cars carry model "RZ 450e" but trim "RZ 350e"; the VDS matrix
      // is unanimous: BDADB = 350e FWD ×18, BCACB = 450e AWD ×12).
      ...["RZ", "RZ 350e", "RZ 450e"].map((m, i) => lex(`rz-2026-350e-${i}`, m, [2026, 2026], ["B"], undefined, "FWD", "350e", rz350e, { vinPrefix: ["BDADB"], battery: P747L, charging: NACS26 })),
      ...["RZ", "RZ 450e"].map((m, i) => lex(`rz-2026-450e-${i}`, m, [2026, 2026], ["B"], ["450e", "Premium", "Luxury"], "AWD", "450e", rz450e_26, { vinPrefix: ["BCACB"], battery: P747L, charging: NACS26 })),
      lex("rz-2026-550e", "RZ", [2026, 2026], ["B"], ["550e", "F Sport", "F SPORT"], "AWD", "550e F SPORT",
        f(229, "mfr", "high", "MY2026 RZ 550e F SPORT — EPA", epa(50220)), { battery: P747L, charging: NACS26 }),
      // Electric ES (2026) — code 1 fences these off the gas ES.
      ...["ESe", "ES", "ES 350e"].map((m, i) => lex(`es350e-2026-${i}`, m, [2026, 2026], ["1"], ["350e", "Premium", "Luxury"], "FWD", "ES 350e",
        f(307, "mfr", "high", "MY2026 ES 350e (FWD) on 19-inch wheels — EPA; 292 on 21s", epa(50450)), { battery: P747L, charging: NACS26 })),
      ...["ESe", "ES", "ES 500e"].map((m, i) => lex(`es500e-2026-${i}`, m, [2026, 2026], ["1"], ["500e", "Premium", "Luxury"], "AWD", "ES 500e",
        f(276, "mfr", "high", "MY2026 ES 500e AWD on 19-inch wheels — EPA; 272 on 21s", epa(50452)), { battery: P747L, charging: NACS26 })),
    ];
  })(),

  // ── Tesla Cybertruck (2026-08-15) ─────────────────────────────────────
  // VIN pos-8 per Tesla's Part 565: C = single motor ("Long Range" RWD),
  // D = dual ("Motor: Standard"), E = tri ("Motor: Performance", the
  // Cyberbeast). Part 565 reads 123 kWh on every variant — one physical
  // pack. fueleconomy.gov's dataset has NO MY2024 Cybertruck records and no
  // 2025 Cyberbeast (verified against the menu and vehicles.csv) — those
  // figures are the launch EPA ratings Tesla published, at agg/medium.
  ...(() => {
    const CT = { make: "TESLA", model: "Cybertruck" };
    const CT_PACK = { packGrossKwh: f(123, "vin", "medium", "123 kWh in Tesla's Part 565 submissions, every variant") };
    const CT_CHG = { portStandard: f<"NACS">("NACS", "mfr"), superchargerAccess: f<"native">("native", "mfr"), architectureV: f<800>(800, "mfr") };
    const ct = (id: string, years: [number, number], vin8: string[], drv: "AWD" | "RWD", variant: string, rangeFact: Fact<number>): EnrichmentRow => ({
      id, ...CT, modelYears: years, vin8, drive: drv, packVariant: variant,
      range: { epaRangeMi: rangeFact }, battery: CT_PACK, charging: CT_CHG,
      thermal: { heatPump: f("standard", "mfr"), batteryPreconditioning: f(true, "mfr") },
      warranty: TSX_W, buyerNotes: [NOTE_FSD],
    });
    return [
      ct("ct-2024-awd", [2024, 2024], ["D"], "AWD", "Dual Motor AWD",
        f(340, "agg", "medium", "MY2024 Cybertruck AWD — the launch EPA rating Tesla published; fueleconomy.gov's dataset carries no MY2024 Cybertruck records")),
      ct("ct-2024-beast", [2024, 2024], ["E"], "AWD", "Cyberbeast",
        f(320, "agg", "medium", "MY2024 Cyberbeast — the launch EPA rating Tesla published; fueleconomy.gov's dataset carries no MY2024 Cybertruck records")),
      ct("ct-2025-26-awd", [2025, 2026], ["D"], "AWD", "Dual Motor AWD",
        f(325, "mfr", "high", "MY2025–26 Cybertruck AWD — EPA (49123/50039 rate identically)", epa(49123))),
      ct("ct-2025-26-lr", [2025, 2026], ["C"], "RWD", "Long Range RWD",
        f(335, "mfr", "high", "MY2025–26 Cybertruck Long Range (single motor, VIN code C) — EPA", epa(49152))),
      ct("ct-2025-beast", [2025, 2026], ["E"], "AWD", "Cyberbeast",
        f(320, "agg", "medium", "Cyberbeast — fueleconomy.gov carries no 2025–26 tri-motor cert; the launch-spec figure is carried forward")),
    ];
  })(),

  // ── GMC Hummer EV pickup / SUV (2026-08-15) ───────────────────────────
  // Body comes from the model string; VIN pos-8 is GM's config code,
  // verified against 164 inventory trims: A/B = 3X pickup (A = the earlier
  // 24-module Edition-1-era code), C = 3X SUV, D = 2X pickup, E = 2X SUV.
  // EPA certification only began at MY2024 (the 2022–23 trucks are in the
  // >8,500-lb class EPA didn't yet require; vehicles.csv confirms zero
  // pre-2024 records) — the 2022–23 row is deliberately rangeless like the
  // Escalade IQ. No 2026 certs yet; MY2025 figures carried at agg/medium.
  ...(() => {
    const HUM_GM_W = {
      batteryYears: f(8, "mfr" as Source), batteryMiles: f(100_000, "mfr" as Source),
      sohFloorPct: f(75, "mfr" as Source, "high", "GM's current EV warranty booklet (read for the data3 Ultium rows) states the 75% floor"),
      batteryTransfers: f(true, "mfr" as Source, "high", "“Transferable at no cost” — GM EV warranty booklets"),
    };
    const HUM_W = HUM_GM_W;
    const HUM_CHG = {
      portStandard: f<"CCS1">("CCS1", "mfr", "high", "CCS1-native"),
      superchargerAccess: f<"adapter">("adapter", "agg", "high", "GM $225 NACS adapter"),
      dcPeakKw: f(350, "agg", "medium"),
    };
    const HUM_TH = { heatPump: f<"standard">("standard", "agg", "medium", "Ultium Energy Recovery") };
    const HUM_PACK_3X = { packGrossKwh: f(205, "est", "medium", "~205 kWh usable est (213.7 gross reported) — 24-module 3X pack; 2X pack capacity unpublished"), chemistry: f<"NMC">("NMC", "agg", "medium") };
    const hum = (id: string, model: string, years: [number, number], vin8: string[], variant: string, rangeFact: Fact<number> | undefined, extra?: Partial<EnrichmentRow>): EnrichmentRow => ({
      id, make: "GMC", model, modelYears: years, vin8, drive: "AWD", packVariant: variant,
      range: rangeFact ? { epaRangeMi: rangeFact } : undefined, charging: HUM_CHG, thermal: HUM_TH, warranty: HUM_W, ...extra,
    });
    const rows: EnrichmentRow[] = [
      hum("hummer-2022-23-pickup", "Hummer EV", [2022, 2023], ["A"], "EV Pickup (Edition 1 / 3X era)", undefined, {
        battery: HUM_PACK_3X,
        range: { testedRangeMi: f(343, "tested", "high", "70-mph (InsideEVs, 2022 Edition 1): 343 mi \u2014 beat its 329 GM estimate; 75-mph (C&D): 290") },
        buyerNotes: [{
          headline: "No EPA range exists for 2022–23 Hummer EVs — GM's own estimate was 329 mi",
          body: "EPA certification for this weight class began at MY2024. The 2022 Edition 1 carried a GM-estimated 329-mile range (24-module pack); GM estimates are not EPA tests and real-world results vary widely. The MY2024 EPA figures for the same hardware read 314 mi. Recalls: 22V-771 (water intrusion in the HV battery enclosure, 2022\u201323 pickups) and 23V-367 (HV battery pack connections).",
          severity: "info" as const,
        }],
      }),
      hum("hummer-2024-pickup-3x", "Hummer EV", [2024, 2024], ["A", "B"], "3X Pickup",
        f(314, "mfr", "high", "MY2024 Hummer EV Pickup (3-motor) — EPA; 298 on mud-terrain tires", epa(46951)), { battery: HUM_PACK_3X }),
      hum("hummer-2024-pickup-2x", "Hummer EV", [2024, 2024], ["D"], "2X Pickup",
        f(311, "mfr", "high", "MY2024 Hummer EV Pickup 2X (2-motor, “2M20”) — EPA; 279 on mud-terrain tires", epa(48787))),
      hum("hummer-2025-pickup-3x", "Hummer EV", [2025, 2025], ["A", "B"], "3X Pickup",
        f(312, "mfr", "high", "MY2025 Hummer EV Pickup 3X — EPA; 289 on mud-terrain tires", epa(48344)), { battery: HUM_PACK_3X }),
      hum("hummer-2025-pickup-2x", "Hummer EV", [2025, 2025], ["D"], "2X Pickup",
        f(318, "mfr", "high", "MY2025 Hummer EV Pickup 2X — EPA; 282 on mud-terrain tires", epa(48343))),
      hum("hummer-2026-pickup-3x", "Hummer EV", [2026, 2026], ["B"], "3X Pickup",
        f(312, "agg", "medium", "No MY2026 certs in fueleconomy.gov yet — the identical MY2025 3X figure is carried")),
      hum("hummer-2026-pickup-2x", "Hummer EV", [2026, 2026], ["D"], "2X Pickup",
        f(318, "agg", "medium", "No MY2026 certs in fueleconomy.gov yet — the identical MY2025 2X figure is carried")),
      // The SUV rows are emitted under both model strings — feeds list some
      // SUVs under "Hummer EV", and the C/E codes prove the body.
      ...["Hummer EV SUV", "Hummer EV"].flatMap((m, i): EnrichmentRow[] => {
        const sfx = i === 0 ? "" : "-pk";
        return [
          hum(`hummer-2024-suv-3x${sfx}`, m, [2024, 2024], ["C"], "3X SUV",
            f(314, "mfr", "high", "MY2024 Hummer EV SUV (3-motor) — EPA; 298 on mud-terrain tires", epa(46953)), { battery: HUM_PACK_3X }),
          hum(`hummer-2024-suv-2x${sfx}`, m, [2024, 2024], ["E"], "2X SUV",
            f(303, "mfr", "high", "MY2024 Hummer EV SUV 2X — EPA; 279 on mud-terrain tires", epa(48789))),
          hum(`hummer-2025-suv-3x${sfx}`, m, [2025, 2025], ["C"], "3X SUV",
            f(312, "mfr", "high", "MY2025 Hummer EV SUV 3X — EPA; 289 on mud-terrain tires", epa(48348)), { battery: HUM_PACK_3X }),
          hum(`hummer-2025-suv-2x${sfx}`, m, [2025, 2025], ["E"], "2X SUV",
            f(315, "mfr", "high", "MY2025 Hummer EV SUV 2X — EPA; 282 on mud-terrain tires", epa(48347))),
          hum(`hummer-2026-suv-3x${sfx}`, m, [2026, 2026], ["C"], "3X SUV",
            f(312, "agg", "medium", "No MY2026 certs in fueleconomy.gov yet — the identical MY2025 3X figure is carried")),
          hum(`hummer-2026-suv-2x${sfx}`, m, [2026, 2026], ["E"], "2X SUV",
            f(315, "agg", "medium", "No MY2026 certs in fueleconomy.gov yet — the identical MY2025 2X figure is carried")),
        ];
      }),
      // ── Chevrolet Silverado EV, rebuilt (2026-08-15) ─────────────────
      // Same GM pack codes as Sierra (H=Standard, D=Extended, L=Max),
      // verified against 65 inventory trims. EPA rates WT (fleet Work
      // Truck) and retail configurations separately on the same pack; the
      // retail Max Range has NO EPA cert in any year — only the WT (8WT)
      // configuration is certified, so retail-Max rows carry GM's quoted
      // 460 at agg/medium (the old trim-name rows were matching "RST -
      // Max Range" trucks to the 493-mi 8WT cert, a 30+ mi overstatement).
      ...(() => {
        const SIL = { make: "CHEVROLET", model: "Silverado EV" };
        const sil = (id: string, years: [number, number], vin8: string[], trim: string[] | undefined, variant: string, rangeFact: Fact<number>, extra?: Partial<EnrichmentRow>): EnrichmentRow => ({
          id, ...SIL, modelYears: years, vin8, trim, drive: "AWD", packVariant: variant,
          range: { epaRangeMi: rangeFact }, charging: HUM_CHG, thermal: HUM_TH, warranty: HUM_GM_W, ...extra,
        });
        return [
          sil("silverado-2024-er", [2024, 2024], ["D"], undefined, "Extended Range (3WT)",
            f(393, "mfr", "high", "MY2024 Silverado EV 3WT — the only 2024 Extended-pack (code D) configuration — EPA", epa(47446))),
          sil("silverado-2024-max", [2024, 2024], ["L"], undefined, "Max Range (4WT / RST First Edition)",
            f(450, "mfr", "high", "MY2024 Silverado EV Max pack (code L) — EPA; the 4WT and RST First Edition share this cert", epa(46946)),
            { range: { epaRangeMi: f(450, "mfr", "high", "MY2024 Silverado EV Max pack (code L) — EPA; the 4WT and RST First Edition share this cert", epa(46946)), testedRangeMi: f(442, "tested", "high", "70-mph (InsideEVs, 2024 RST First Edition): 442 mi; 75-mph (C&D): 400; Edmunds loop: 484") } }),
          sil("silverado-2025-sr-wt", [2025, 2025], ["H"], undefined, "Standard Range (2WT)",
            f(282, "mfr", "high", "MY2025 Silverado EV 2WT — EPA", epa(49071))),
          sil("silverado-2025-er-wt", [2025, 2025], ["D"], ["5WT", "WT", "Work Truck", "WT - Extended Range"], "Extended Range (WT)",
            f(422, "mfr", "high", "MY2025 Silverado EV 5WT — EPA (both charger options rate 422)", epa(48699))),
          sil("silverado-2025-er-retail", [2025, 2025], ["D"], ["RST", "LT", "3LT", "3LT LT", "LT - Extended Range", "LT Extended Range 4WD"], "Extended Range",
            f(408, "mfr", "high", "MY2025 Silverado EV retail Extended Range (RST/LT) with the 11.5 kW charger — EPA; 390 with the 19.2 kW charger", epa(48700))),
          sil("silverado-2025-max-wt", [2025, 2025], ["L"], ["8WT", "WT", "Work Truck"], "Max Range (WT)",
            f(492, "mfr", "high", "MY2025 Silverado EV 8WT — EPA", epa(48698)),
            { range: { epaRangeMi: f(492, "mfr", "high", "MY2025 Silverado EV 8WT — EPA", epa(48698)), testedRangeMi: f(539, "tested", "medium", "Edmunds mixed loop, 2025 WT Max Range: 539 mi — the longest Edmunds has recorded") } }),
          sil("silverado-2025-max-retail", [2025, 2025], ["L"], ["RST", "3SP RST", "3SP", "RST - Max Range", "Max Range"], "Max Range",
            f(460, "agg", "medium", "MY2025 RST with the optional Max pack — GM's quoted range; EPA certified only the WT configuration (492, id 48698)")),
          sil("silverado-2026-sr-wt", [2026, 2026], ["H"], ["WT", "Work Truck", "WT - Standard Range"], "Standard Range (WT)",
            f(286, "mfr", "high", "MY2026 Silverado EV Standard Range WT — EPA", epa(49642))),
          sil("silverado-2026-sr-retail", [2026, 2026], ["H"], ["LT", "LT - Standard Range", "Standard Range"], "Standard Range",
            f(283, "mfr", "high", "MY2026 Silverado EV Standard Range (retail) — EPA", epa(49643))),
          sil("silverado-2026-er-wt", [2026, 2026], ["D"], ["5WT", "WT", "Work Truck", "WT - Extended Range"], "Extended Range (WT)",
            f(424, "mfr", "high", "MY2026 Silverado EV Extended Range WT — EPA", epa(49638))),
          sil("silverado-2026-er-retail", [2026, 2026], ["D"], ["RST", "LT", "3LT", "Trail Boss", "Extended Range", "LT - Extended Range", "Trail Boss - Extended Range", "RST Stars and Steel Edition - Extended Range", "e4WD Crew Cab Extended Range LT"], "Extended Range",
            f(410, "mfr", "high", "MY2026 Silverado EV Extended Range (retail) with the standard 11.5 kW charger — EPA; 385 with the optional 19.2 kW charger", epa(49640))),
          sil("silverado-2026-max-wt", [2026, 2026], ["L"], ["8WT", "WT", "Work Truck"], "Max Range (WT)",
            f(493, "mfr", "high", "MY2026 Silverado EV Max Range WT — EPA", epa(49639))),
          sil("silverado-2026-max-retail", [2026, 2026], ["L"], ["LT", "Trail Boss", "LT - Max Range", "Max Range", "e4WD Crew Cab Max Range LT", "e4WD Crew Cab Max Range Trail Boss"], "Max Range",
            f(460, "agg", "medium", "MY2026 retail Max pack (LT/Trail Boss) — GM's quoted range; EPA certified only the WT configuration (493, id 49639)")),
        ];
      })(),
    ];
    return rows;
  })(),
];
