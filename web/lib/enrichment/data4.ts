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
  sohFloorPct: f(70, "mfr" as Source, "high", undefined, SPECS_23),
  batteryTransfers: f(true, "mfr" as Source, "high"),
};

const NO_HEAT_PUMP = f<"none">(
  "none",
  "mfr",
  "high",
  "Resistive heater only, Ford's 2024 order guide introduces the heat pump as New/Changed for MY2024, so 2022–23 trucks have none",
  OG_24
);
const HEAT_PUMP_STD = f<"standard">("standard", "mfr", "high", undefined, OG_24);

// Charge port and Supercharger access, shared by every Lightning model year.
// Sourced to Ford's media newsroom rather than the fromtheroad spec CDN the
// rows above cite: that CDN refuses crawler fetches (connection reset), while
// the newsroom articles load, and both facts are stated there in prose.
//   Port — every Lightning ships the CCS1 (SAE J1772 Combo) DC inlet. Ford's
//   May 2023 announcement framed a built-in NACS port as a change for FUTURE
//   EVs, and the adapter program below hands these trucks a NACS adapter
//   precisely because their port is CCS.
//   Supercharger — F-150 Lightning retail customers gained access to 15,000+
//   Tesla Superchargers via a complimentary NACS Fast Charging Adapter,
//   reservations opening 29 Feb 2024.
// Both are the manufacturer's own claim; the note paraphrases the release
// (the article body isn't quotable from here) and links it, per the house
// rule that a surfaced fact carries its source.
const NACS_NEWS = "https://media.ford.com/content/fordmedia/fna/us/en/news/2024/01/31/ford-to-offer-complimentary-tesla-supercharger-adapter-to-eligib.html";
const PORT_NEWS = "https://media.ford.com/content/fordmedia/fna/us/en/news/2023/05/25/ford-ev-customers-to-gain-access-to-12-000-tesla-superchargers--.html";
const LIGHTNING_CHARGING = {
  portStandard: f<"CCS1">("CCS1", "mfr", "high", "CCS1 (SAE J1772 Combo) DC inlet on every Lightning; Ford announced a built-in NACS port only for future EVs, and its Supercharger program supplies these CCS trucks a NACS adapter", PORT_NEWS),
  superchargerAccess: f<"adapter">("adapter", "mfr", "high", "F-150 Lightning retail customers gained access to 15,000+ Tesla Superchargers through a complimentary NACS Fast Charging Adapter, reservations from 29 Feb 2024", NACS_NEWS),
};

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
  sohFloorPct: f(70, "mfr" as Source, "high"),
  batteryTransfers: f(true, "mfr" as Source, "high"),
  // powertrainTerms is filled centrally in backfill.ts (resolvePowertrain):
  // Ford's BEV Warranty Guide covers the electric drive unit WITH the battery
  // at 8yr/100k, so "Electric drive: 8 yr / 100,000 mi" is the honest figure —
  // the 5yr/60k "powertrain" term covers only non-EV driveline parts and would
  // understate the motor coverage a shopper cares about.
};

const ME_KWH_SR_NMC = f(70, "mfr", "high", undefined, OGM_23);
const ME_KWH_ER = f(91, "mfr", "high", undefined, OGM_23);
const ME_KWH_ER_LATE = f(91, "agg", "low", "Extended Range pack, some sources report 88 kWh, some 91; not resolved to a single mfr-published usable figure");
const ME_KWH_SR_LATE = f(73, "agg", "medium", "Standard Range pack (LFP)");
const ME_NMC_EARLY = f<"NMC">("NMC", "mfr", "high", "Predates the mid-MY2023 chemistry switch, every 2021–22 Standard Range pack is NMC");
const ME_NMC_2023 = f<"NMC">("NMC", "mfr", "high", "The mid-MY2023 LFP switch came with new VIN codes (4/5); an M or S code is a pre-switch NMC build", VIN_23);
const ME_LFP = f<"LFP">("LFP", "mfr", "high");
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
  headline: "Two open recalls; the differential one has no fix yet, the door-latch one does",
  body: "26V417 (rear differential pinion shaft may fracture, 2021–2023 Mach-E): Ford's remedy was not yet available as of the July 2026 interim notice, with a fix anticipated late December 2026. 25V404 (electronic door latches can stay locked on low battery charge, trapping an occupant, 2021–2025): this one has a free software fix; owner notices mailed September 2025.",
  severity: "trap" as const,
};
const NOTE_RECALLS_2023 = {
  headline: "Three open recalls; two still have no fix, the door-latch one does",
  body: "26V417 (rear differential pinion shaft may fracture, 2021–2023 Mach-E): Ford's remedy was not yet available as of the July 2026 interim notice, with a fix anticipated late December 2026. 26V487 (rear quarter-window trim may detach, 2023–2025): remedy not yet available as of the September 2026 interim notice. 25V404 (electronic door latches can stay locked on low battery charge, trapping an occupant, 2021–2025): this one has a free software fix; owner notices mailed September 2025.",
  severity: "trap" as const,
};
const NOTE_RECALLS_2024 = {
  headline: "Three recalls with free fixes; the quarter-window one has no remedy yet",
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
  heatPump: f<"none">("none", "mfr", "high", "Heat pump arrived with the 2021 refresh, built from ~14 Sept 2020, every 2018–19 build has the resistive heater"),
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
  headline: "Open recalls with free software fixes; confirm they were applied to this car",
  body: "25V863 (integrated park module may fail to lock into park, risking rollaway; 2024–2026 Mach-E) and 25V885 (Light Driver Control Module B can fail, killing turn signals and headlights; 2025–2026) both have free OTA or dealer software fixes, confirm they've been applied. 2025 builds may additionally be under 26V487 (rear quarter-window trim may detach; remedy not yet available as of the September 2026 interim notice) and 25V404 (door latches; free software fix).",
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
  batteryTransfers: f(true, "mfr" as Source, "high"),
  powertrainTerms: f("1st owner 10yr/100k; subsequent owners 5yr/60k", "mfr" as Source, "high"),
  extendedCoverage: f("ICCU: 15 years / 180,000 miles", "mfr" as Source),
};
const EV6_HP_NONE = { heatPump: f<"none">("none", "mfr", "high", "Heat pump unavailable on the Light trim") };
const EV6_HP_OPT = { heatPump: f<"optional">("optional", "mfr", "high", "Factory option on Wind/GT-Line, window sticker is the authority") };
const EV6_PORT_CCS = { portStandard: f<"CCS1">("CCS1", "mfr") };
const EV6_PORT_NACS = { portStandard: f<"NACS">("NACS", "agg", "high", "Native NACS port from the MY2025 refresh") };
const EV6_58 = { packGrossKwh: f(58, "vin", "high", "“Light (58.0 kWh)”, Kia's own Part 565 submission") };
const EV6_774 = { packGrossKwh: f(77.4, "vin", "high", "“Wind (77.4 kWh)”, Kia's own Part 565 submission") };
const EV6_63 = { packGrossKwh: f(63, "agg", "medium", "MY2025-refresh Standard Range pack") };
const EV6_84 = { packGrossKwh: f(84, "agg", "medium", "MY2025-refresh Long Range pack") };
const NOTE_EV6_HP = { headline: "Heat pump: factory option, on the window sticker", severity: "trap" as const, resolvedBy: "config_resolved" as const };


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
  powertrainTerms: f("1st owner 10yr/100k; subsequent owners 5yr/60k", "mfr" as Source, "high"),
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
const BMW_HP = { heatPump: f<"standard">("standard", "mfr", "high", "Cabin, battery and drive") };
const BMW_WARRANTY = {
  batteryYears: f(8, "mfr" as Source),
  batteryMiles: f(100_000, "mfr" as Source),
  sohFloorPct: f(70, "mfr" as Source),
  batteryTransfers: f(true, "mfr" as Source, "high"),
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
const TSX_PACK = { packGrossKwh: f(100, "vin", "medium", "Tesla's Part 565 submission reports a 100 kWh pack, shared across Long Range and Plaid") };
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
  batteryMiles: f(175_000, "mfr" as Source, "high", "Rivian's battery warranty runs to 175,000 miles, the longest mileage term in the segment"),
  sohFloorPct: f(70, "mfr" as Source),
  batteryTransfers: f(true, "mfr" as Source),
};
const RIV_PORT1 = { portStandard: f<"CCS1">("CCS1", "mfr") };
const RIV_128 = { packGrossKwh: f(128.9, "vin", "high", "Large pack") };
const RIV_106 = { packGrossKwh: f(106, "vin", "high", "Gen-2 Standard pack") };
const RIV_141 = { packGrossKwh: f(141, "vin", "high", "Max pack") };


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
const PB1 = { packGrossKwh: f(79.2, "vin", "high", "Performance Battery") };
const PB1P = { packGrossKwh: f(93.4, "vin", "high", "Performance Battery Plus") };
const PB2 = { packGrossKwh: f(82.3, "agg", "medium", "Gen-2 Performance Battery") };
const PB2P = { packGrossKwh: f(97, "agg", "medium", "Gen-2 Performance Battery Plus") };
const MACB = { packGrossKwh: f(100, "vin", "high", "95 kWh net") };

  // ── Sixth research tranche (2026-08-21): Chevrolet Volt, Toyota RAV4
  // Prime, Toyota Prius Prime, Chrysler Pacifica Hybrid, Ford Escape PHEV,
  // Honda Clarity Plug-In Hybrid — the fully-sourced models from
  // docs/agents/phev-enrichment-2026-08-21.md, added after the schema gained
  // epaRangeTotalMi/mpgeElectric/mpgeCombined/mpgGasoline (types.ts). Values,
  // source tags, confidence, and note text are the research doc's, not
  // re-derived. Volt is the owner's own trigger case (2014 Gen 1, VIN
  // 1G1RD6E45EU113896). Volvo XC90/XC60, Hyundai Tucson, and Mazda CX-90 were
  // only partially sourced (EPA yes, battery/charging/warranty no) and are
  // deliberately NOT here — see the doc's §5, a later pass.
  const AS_OF_PHEV = "2026-08-21";
  function fp<T>(
    value: T,
    source: Source,
    confidence: Fact<T>["confidence"] = "high",
    note?: string,
    sourceUrl?: string
  ): Fact<T> {
    return { value, source, asOf: AS_OF_PHEV, confidence, note, sourceUrl };
  }

  // Chevrolet Volt — three genuinely different eras. Battery split between
  // 2011–12 and 2013–15 comes from GM's own battery-comparison PDF, which
  // gives a Gen-1 range (16.0–17.1 kWh gross / 10.2–11.2 kWh usable) without a
  // clean per-era confirmation, hence "medium" rather than "high" for that
  // one split (not because the number is shaky). DC fast charging never
  // shipped on any Volt but wasn't control-tested against a primary GM
  // document this pass, so it's tagged "est" rather than "mfr" despite being
  // essentially uncontested.
  const VOLT_BATTERY_PDF = "https://media.gm.com/content/dam/Media/microsites/product/Volt_2016/doc/VOLT_BATTERY.pdf";
  const VOLT_NO_DCFC = fp<"none">("none", "est", "high", "Never shipped a CCS/CHAdeMO port, any generation; well-established but not control-tested against a primary GM document this pass");
  const VOLT_WARRANTY = { batteryYears: fp(8, "mfr", "high"), batteryMiles: fp(100_000, "mfr", "high") };
  const VOLT_ROWS: EnrichmentRow[] = [
    {
      id: "volt-2011-12", make: "CHEVROLET", model: "Volt", modelYears: [2011, 2012],
      battery: {
        packGrossKwh: fp(16.0, "mfr", "medium", "GM's own PDF gives 16.0–17.1 kWh across Gen 1 (2011–15) without a clean per-era split", VOLT_BATTERY_PDF),
        packUsableKwh: fp(10.2, "mfr", "medium", undefined, VOLT_BATTERY_PDF),
      },
      range: {
        epaRangeMi: fp(35, "mfr", "high", "Electric-only EPA range; Gen 1 required premium gas, Gen 2 (2016+) regular", epa(30980)),
        epaRangeTotalMi: fp(380, "mfr", "high", undefined, epa(30980)),
        mpgeElectric: fp(93, "mfr", "high", "94 for MY2012", epa(30980)),
        mpgeCombined: fp(60, "mfr", "high", undefined, epa(30980)),
        mpgGasoline: fp(37, "mfr", "high", "Premium gasoline required", epa(30980)),
      },
      charging: {
        acOnboardKw: fp(3.3, "est", "medium"),
        dcFastCharging: VOLT_NO_DCFC,
      },
      warranty: VOLT_WARRANTY,
    },
    {
      // The owner's own trigger case: 2014 is a Gen 1 Volt, in this bucket.
      id: "volt-2013-15", make: "CHEVROLET", model: "Volt", modelYears: [2013, 2015],
      battery: {
        packGrossKwh: fp(17.1, "mfr", "medium", "Same Gen-1 GM PDF; larger usable window vs. 2011–12 via a software update", VOLT_BATTERY_PDF),
        packUsableKwh: fp(11.2, "mfr", "medium", undefined, VOLT_BATTERY_PDF),
      },
      range: {
        epaRangeMi: fp(38, "mfr", "high", "Electric-only EPA range; Gen 1 required premium gas, Gen 2 (2016+) regular", epa(33900)),
        epaRangeTotalMi: fp(380, "mfr", "high", undefined, epa(33900)),
        mpgeElectric: fp(98, "mfr", "high", undefined, epa(33900)),
        mpgeCombined: fp(62, "mfr", "high", undefined, epa(33900)),
        mpgGasoline: fp(37, "mfr", "high", "Premium gasoline required", epa(33900)),
      },
      charging: {
        acOnboardKw: fp(3.3, "est", "medium"),
        dcFastCharging: VOLT_NO_DCFC,
      },
      warranty: VOLT_WARRANTY,
    },
    {
      id: "volt-2016-19", make: "CHEVROLET", model: "Volt", modelYears: [2016, 2019],
      battery: {
        packGrossKwh: fp(18.4, "mfr", "high", "Gen 2", VOLT_BATTERY_PDF),
        packUsableKwh: fp(14.0, "mfr", "high", undefined, VOLT_BATTERY_PDF),
      },
      range: {
        epaRangeMi: fp(53, "mfr", "high", "Electric-only EPA range; Gen 2 uses regular gasoline (Gen 1 required premium). Identical rating 2016–19", epa(36863)),
        epaRangeTotalMi: fp(420, "mfr", "high", undefined, epa(36863)),
        mpgeElectric: fp(106, "mfr", "high", undefined, epa(36863)),
        mpgeCombined: fp(77, "mfr", "high", "79 in some model years", epa(36863)),
        mpgGasoline: fp(42, "mfr", "high", "Regular gasoline", epa(36863)),
      },
      charging: {
        acOnboardKw: fp(3.6, "est", "medium", "DOE/INL bench test + GM supplier material corroborate 3.6 kW; not confirmed from a GM primary spec document this pass"),
        dcFastCharging: VOLT_NO_DCFC,
      },
      warranty: VOLT_WARRANTY,
    },
  ];

  // Toyota RAV4 Prime — one generation, stable ratings.
  const RAV4_PRIME_RELEASE = "https://pressroom.toyota.com/plug-and-play-with-the-2024-rav4-prime/";
  const TOYOTA_WARRANTY_EXT = "https://pressroom.toyota.com/toyota-extends-battery-warranty-for-model-year-2020-hybrid-plug-in-and-fuel-cell-electric-vehicles/";
  const TOYOTA_WARRANTY_2020PLUS = { batteryYears: fp(10, "mfr", "high", undefined, TOYOTA_WARRANTY_EXT), batteryMiles: fp(150_000, "mfr", "high", undefined, TOYOTA_WARRANTY_EXT) };
  const TOYOTA_WARRANTY_PRE2020 = { batteryYears: fp(8, "mfr", "high"), batteryMiles: fp(100_000, "mfr", "high") };
  const RAV4_PRIME_ROW: EnrichmentRow = {
    id: "rav4-prime-2021-25", make: "TOYOTA", model: "RAV4 Prime", modelYears: [2021, 2025],
    modelAliases: ["RAV4 PHEV", "RAV4 Plug-In Hybrid", "RAV4 PLUG-IN"],
    battery: { packGrossKwh: fp(18.1, "mfr", "high", undefined, RAV4_PRIME_RELEASE) },
    range: {
      epaRangeMi: fp(42, "mfr", "high", "Electric-only EPA range. Identical rating 2021–2025", epa(42793)),
      epaRangeTotalMi: fp(600, "mfr", "high", undefined, epa(42793)),
      mpgeElectric: fp(94, "mfr", "high", undefined, epa(42793)),
      mpgeCombined: fp(65, "mfr", "high", undefined, epa(42793)),
      mpgGasoline: fp(38, "mfr", "high", undefined, epa(42793)),
    },
    charging: {
      acOnboardKw: fp(6.6, "mfr", "medium", "SE-grade equipment line on the 2024 release; 2021–23 shipped 3.3 kW standard with 6.6 kW an SE/XSE Premium option on some trims — exact year/trim gating not resolved this pass", RAV4_PRIME_RELEASE),
      dcFastCharging: fp("none", "mfr", "high", "Control-tested against Toyota's own bZ4X press materials, which name DC fast charging explicitly; the RAV4 Prime release never does", RAV4_PRIME_RELEASE),
    },
    thermal: { heatPump: fp("standard", "mfr", "high", undefined, RAV4_PRIME_RELEASE) },
    warranty: TOYOTA_WARRANTY_2020PLUS,
  };

  // Toyota Prius Prime — Gen 2 (2017–2022) and Gen 3 (2023–2025) genuinely
  // differ, and Gen 3's SE trim differs from base/LE/XLE enough (45/600 vs
  // 40/550 mi) to need its own row — an undefined-trim row would otherwise
  // understate the SE. Gen 2's warranty crosses Toyota's own 2020 battery-
  // warranty-extension line (2017–19 vs 2020–22), which the research doc
  // flags as a real per-year fact, so Gen 2 is split for that reason even
  // though every other fact is identical across it.
  const PRIUS_ALIASES = ["Prius PHEV", "Prius PHEV SE", "Prius Plug-In Hybrid"];
  const PRIUS_GEN2_BATTERY = { packGrossKwh: fp(8.79, "est", "medium", "Secondary-sourced (PriusChat teardown cross-referencing Toyota parts data): 95s1p cells, 351.5V nominal") };
  const PRIUS_GEN2_RANGE = {
    epaRangeMi: fp(25, "mfr", "high", "Electric-only EPA range. Identical rating 2017–2022", epa(38531)),
    epaRangeTotalMi: fp(640, "mfr", "high", undefined, epa(38531)),
    mpgeElectric: fp(133, "mfr", "high", undefined, epa(38531)),
    mpgeCombined: fp(78, "mfr", "high", undefined, epa(38531)),
    mpgGasoline: fp(54, "mfr", "high", undefined, epa(38531)),
  };
  const PRIUS_GEN2_CHARGING = {
    acOnboardKw: fp(3.3, "est", "medium", "16A at 230V"),
    dcFastCharging: fp<"none">("none", "est", "medium", "Same PHEV architecture as RAV4 Prime, but not re-run against a Prius-specific control document this pass"),
  };
  const PRIUS_GEN3_BATTERY = { packGrossKwh: fp(13.6, "mfr", "high") };
  const PRIUS_GEN3_CHARGING = {
    // Onboard AC charger omitted: sources conflict 3.5 vs 6.6 kW and this
    // pass didn't resolve it to one number — omit rather than guess.
    dcFastCharging: fp<"none">("none", "est", "medium", "Same PHEV architecture as RAV4 Prime, but not re-run against a Prius-specific control document this pass"),
  };
  const PRIUS_GEN3_THERMAL = { heatPump: fp<"standard">("standard", "mfr", "high", "Same heat-pump system Toyota describes for the RAV4 Prime, quoted from that press release rather than a Prius-specific one", RAV4_PRIME_RELEASE) };
  const PRIUS_PRIME_ROWS: EnrichmentRow[] = [
    {
      id: "prius-prime-2017-19", make: "TOYOTA", model: "Prius Prime", modelYears: [2017, 2019],
      modelAliases: PRIUS_ALIASES,
      battery: PRIUS_GEN2_BATTERY,
      range: PRIUS_GEN2_RANGE,
      charging: PRIUS_GEN2_CHARGING,
      warranty: TOYOTA_WARRANTY_PRE2020,
    },
    {
      id: "prius-prime-2020-22", make: "TOYOTA", model: "Prius Prime", modelYears: [2020, 2022],
      modelAliases: PRIUS_ALIASES,
      battery: PRIUS_GEN2_BATTERY,
      range: PRIUS_GEN2_RANGE,
      charging: PRIUS_GEN2_CHARGING,
      warranty: TOYOTA_WARRANTY_2020PLUS,
    },
    {
      id: "prius-prime-2023-25-base", make: "TOYOTA", model: "Prius Prime", modelYears: [2023, 2025],
      modelAliases: PRIUS_ALIASES,
      battery: PRIUS_GEN3_BATTERY,
      range: {
        epaRangeMi: fp(40, "mfr", "high", 'Electric-only EPA range, base/LE/XLE trims. Identical rating 2023–2025; EPA renamed the model string to "Prius PHEV" for MY2025', epa(47228)),
        epaRangeTotalMi: fp(550, "mfr", "high", undefined, epa(47228)),
        mpgeElectric: fp(114, "mfr", "high", undefined, epa(47228)),
        mpgeCombined: fp(79, "mfr", "high", undefined, epa(47228)),
        mpgGasoline: fp(48, "mfr", "high", undefined, epa(47228)),
      },
      charging: PRIUS_GEN3_CHARGING,
      thermal: PRIUS_GEN3_THERMAL,
      warranty: TOYOTA_WARRANTY_2020PLUS,
    },
    {
      id: "prius-prime-2023-25-se", make: "TOYOTA", model: "Prius Prime", modelYears: [2023, 2025], trim: "SE",
      modelAliases: PRIUS_ALIASES,
      battery: PRIUS_GEN3_BATTERY,
      range: {
        epaRangeMi: fp(45, "mfr", "high", "Electric-only EPA range, SE trim. Identical rating 2023–2025", epa(47229)),
        epaRangeTotalMi: fp(600, "mfr", "high", undefined, epa(47229)),
        mpgeElectric: fp(127, "mfr", "high", undefined, epa(47229)),
        mpgeCombined: fp(89, "mfr", "high", undefined, epa(47229)),
        mpgGasoline: fp(52, "mfr", "high", undefined, epa(47229)),
      },
      charging: PRIUS_GEN3_CHARGING,
      thermal: PRIUS_GEN3_THERMAL,
      warranty: TOYOTA_WARRANTY_2020PLUS,
    },
  ];

  // Chrysler Pacifica Hybrid — one generation, EPA rating stepped down in
  // MY2020. modelAliases includes bare "Pacifica": confirmed by VIN sample in
  // the research doc to be the Hybrid every time, and safe by construction —
  // scraper/lib/ev.mjs's classifyEv only admits a listing at evConfidence
  // "high" when the feed's own fuel-type text says "electric" and "plug"; a
  // gas Pacifica's fuel-type text never does, so it never reaches this
  // database under any name, bare or not.
  const PACIFICA_2024_SPEC = "https://chryslermedia.iconicweb.com/mediasite/specs/2024_CH_Pacifica_Plug-in_Hybrid_SP.pdf";
  const PACIFICA_ALIASES = ["Pacifica Plug-In Hybrid", "Pacifica"];
  const PACIFICA_BATTERY = { packGrossKwh: fp(16, "mfr", "high", "96-cell Li-ion, 360V nominal", PACIFICA_2024_SPEC) };
  const PACIFICA_CHARGING = {
    acOnboardKw: fp(6.6, "est", "medium", "Recurs across independent sources; not itemized as a line item in Stellantis's own spec sheets"),
    dcFastCharging: fp<"none">("none", "mfr", "high", "Control-tested: the same Stellantis spec-sheet family names DC fast charging for the Wagoneer S; neither the 2020 nor the 2024 Pacifica sheet does", PACIFICA_2024_SPEC),
  };
  const PACIFICA_THERMAL = { heatPump: fp<"none">("none", "est", "medium", "Resistive electric heater plus engine coolant; the engine is required for heat and defrost") };
  const PACIFICA_WARRANTY = { batteryYears: fp(8, "mfr", "high", "10 yr / 150,000 mi in California and other ZEV-adopting states"), batteryMiles: fp(100_000, "mfr", "high") };
  const PACIFICA_ROWS: EnrichmentRow[] = [
    {
      id: "pacifica-hybrid-2017-19", make: "CHRYSLER", model: "Pacifica Hybrid", modelYears: [2017, 2019],
      modelAliases: PACIFICA_ALIASES,
      battery: PACIFICA_BATTERY,
      range: {
        epaRangeMi: fp(33, "mfr", "high", "Electric-only EPA range", epa(38491)),
        epaRangeTotalMi: fp(570, "mfr", "high", undefined, epa(38491)),
        mpgeElectric: fp(84, "mfr", "high", undefined, epa(38491)),
        mpgeCombined: fp(52, "mfr", "high", undefined, epa(38491)),
        mpgGasoline: fp(32, "mfr", "high", undefined, epa(38491)),
      },
      charging: PACIFICA_CHARGING,
      thermal: PACIFICA_THERMAL,
      warranty: PACIFICA_WARRANTY,
    },
    {
      id: "pacifica-hybrid-2020-25", make: "CHRYSLER", model: "Pacifica Hybrid", modelYears: [2020, 2025],
      modelAliases: PACIFICA_ALIASES,
      battery: PACIFICA_BATTERY,
      range: {
        epaRangeMi: fp(32, "mfr", "high", "Electric-only EPA range. Identical rating 2020–2025", epa(41943)),
        epaRangeTotalMi: fp(520, "mfr", "high", undefined, epa(41943)),
        mpgeElectric: fp(82, "mfr", "high", undefined, epa(41943)),
        mpgeCombined: fp(48, "mfr", "high", undefined, epa(41943)),
        mpgGasoline: fp(30, "mfr", "high", undefined, epa(41943)),
      },
      charging: PACIFICA_CHARGING,
      thermal: PACIFICA_THERMAL,
      warranty: PACIFICA_WARRANTY,
    },
  ];

  // Ford Escape PHEV — one generation, minor year-to-year updates. Bare
  // "Escape" is the larger alias bucket (confirmed by VIN sample to be PHEV)
  // and is safe by the same classifyEv reasoning as Pacifica above: a gas
  // Escape's fuel-type text never says "electric", so it never reaches this
  // database.
  const FORD_ESCAPE_WARRANTY_URL = "https://www.ford.com/support/how-tos/warranty/warranties-and-coverage/what-is-the-warranty-on-my-ford-hybrid-or-electric-vehicle-battery/";
  const ESCAPE_ALIASES = ["Escape", "Escape Plug-In Hybrid"];
  const ESCAPE_BATTERY = { packGrossKwh: fp(14.4, "est", "medium") };
  const ESCAPE_CHARGING = {
    acOnboardKw: fp(3.3, "est", "medium"),
    dcFastCharging: fp<"none">("none", "est", "high"),
  };
  // Ford's own page states no CARB-state extension, unlike Toyota/Stellantis.
  const ESCAPE_WARRANTY = { batteryYears: fp(8, "mfr", "high", undefined, FORD_ESCAPE_WARRANTY_URL), batteryMiles: fp(100_000, "mfr", "high", undefined, FORD_ESCAPE_WARRANTY_URL) };
  const ESCAPE_ROWS: EnrichmentRow[] = [
    {
      id: "escape-phev-2020-22", make: "FORD", model: "Escape PHEV", modelYears: [2020, 2022],
      modelAliases: ESCAPE_ALIASES,
      battery: ESCAPE_BATTERY,
      range: {
        epaRangeMi: fp(37, "mfr", "high", "Electric-only EPA range", epa(42743)),
        epaRangeTotalMi: fp(530, "mfr", "high", undefined, epa(42743)),
        mpgeElectric: fp(102, "mfr", "high", undefined, epa(42743)),
        mpgeCombined: fp(66, "mfr", "high", undefined, epa(42743)),
        mpgGasoline: fp(41, "mfr", "high", undefined, epa(42743)),
      },
      charging: ESCAPE_CHARGING,
      warranty: ESCAPE_WARRANTY,
    },
    {
      id: "escape-phev-2023", make: "FORD", model: "Escape PHEV", modelYears: [2023, 2023],
      modelAliases: ESCAPE_ALIASES,
      battery: ESCAPE_BATTERY,
      range: {
        epaRangeMi: fp(37, "mfr", "high", "Electric-only EPA range", epa(47220)),
        epaRangeTotalMi: fp(520, "mfr", "high", undefined, epa(47220)),
        mpgeElectric: fp(101, "mfr", "high", undefined, epa(47220)),
        mpgeCombined: fp(65, "mfr", "high", undefined, epa(47220)),
        mpgGasoline: fp(40, "mfr", "high", undefined, epa(47220)),
      },
      charging: ESCAPE_CHARGING,
      warranty: ESCAPE_WARRANTY,
    },
    {
      id: "escape-phev-2024-25", make: "FORD", model: "Escape PHEV", modelYears: [2024, 2025],
      modelAliases: ESCAPE_ALIASES,
      battery: ESCAPE_BATTERY,
      range: {
        epaRangeMi: fp(37, "mfr", "high", "Electric-only EPA range. Identical rating 2024–2025", epa(48663)),
        epaRangeTotalMi: fp(560, "mfr", "high", undefined, epa(48663)),
        mpgeElectric: fp(101, "mfr", "high", undefined, epa(48663)),
        mpgeCombined: fp(65, "mfr", "high", undefined, epa(48663)),
        mpgGasoline: fp(40, "mfr", "high", undefined, epa(48663)),
      },
      charging: ESCAPE_CHARGING,
      warranty: ESCAPE_WARRANTY,
    },
  ];

  // Honda Clarity Plug-In Hybrid — single generation, ratings never changed.
  // No modelAliases, deliberately: 13 of 14 live Clarity listings are bare-
  // named per the research doc, but unlike Escape/Pacifica above, a bare
  // "Clarity" is NOT safe to alias. Honda also sold a Clarity EV (BEV) and a
  // Clarity FCV under the same bare name, and classifyEv admits a real
  // Clarity EV at the same "high" confidence a Clarity PHEV gets — the
  // gas-car protection Escape/Pacifica get doesn't apply, because a Clarity
  // EV genuinely is an EV. match.ts has no field that tells them apart once
  // both are aliased to "Clarity", so aliasing it would risk stamping a BEV's
  // listing with this row's PHEV battery/range/charging facts. No Clarity EV
  // has been observed in the live feed to make that collision real yet — if
  // one appears, this decision should be revisited, but the safe move today
  // is fewer matches, not a wrong one.
  const CLARITY_PHEV_ROW: EnrichmentRow = {
    id: "clarity-phev-2018-21", make: "HONDA", model: "Clarity Plug-In Hybrid", modelYears: [2018, 2021],
    battery: { packGrossKwh: fp(17, "est", "medium", "Secondary-sourced (Honda Owners site vehicle-specs pages, 2020/2021)") },
    range: {
      epaRangeMi: fp(48, "mfr", "high", "Electric-only EPA range. Identical rating 2018–2021", epa(39782)),
      epaRangeTotalMi: fp(340, "mfr", "high", undefined, epa(39782)),
      mpgeElectric: fp(110, "mfr", "high", undefined, epa(39782)),
      mpgeCombined: fp(76, "mfr", "high", undefined, epa(39782)),
      mpgGasoline: fp(42, "mfr", "high", undefined, epa(39782)),
    },
    charging: {
      acOnboardKw: fp(6.6, "est", "medium", "32A"),
      dcFastCharging: fp("none", "est", "high"),
    },
    warranty: {
      batteryYears: fp(8, "est", "medium", "Possibly 10 yr / 150,000 mi in CARB states, matching the Toyota/Stellantis pattern, but not confirmed against a Honda primary document or exact state list this pass"),
      batteryMiles: fp(100_000, "est", "medium"),
    },
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
    charging: LIGHTNING_CHARGING,
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
    charging: LIGHTNING_CHARGING,
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
    charging: LIGHTNING_CHARGING,
  },

  // ── MY2023 — SR bumped to 240; packs documented on Ford's 2023 sheet ───
  {
    id: "lightning-2023-sr",
    make: "FORD",
    model: "F-150 Lightning",
    modelYears: [2023, 2023],
    vin8: ["L"],
    packVariant: "Standard Range",
    battery: { packUsableKwh: f(98, "mfr", "high", undefined, SPECS_23) },
    range: { epaRangeMi: f(240, "mfr", "high", "EPA rating for the Standard Range pack (VIN engine code L)", epa(46329)) },
    thermal: { heatPump: NO_HEAT_PUMP },
    warranty: WARRANTY,
    charging: LIGHTNING_CHARGING,
  },
  {
    id: "lightning-2023-er",
    make: "FORD",
    model: "F-150 Lightning",
    modelYears: [2023, 2023],
    vin8: ["V"],
    packVariant: "Extended Range",
    battery: { packUsableKwh: f(131, "mfr", "high", undefined, SPECS_23) },
    range: { epaRangeMi: f(320, "mfr", "high", "EPA rating for the Extended Range pack (VIN engine code V), non-Platinum trims", epa(46327)) },
    thermal: { heatPump: NO_HEAT_PUMP },
    warranty: WARRANTY,
    charging: LIGHTNING_CHARGING,
  },
  {
    id: "lightning-2023-er-platinum",
    make: "FORD",
    model: "F-150 Lightning",
    modelYears: [2023, 2023],
    vin8: ["V"],
    trim: "Platinum",
    packVariant: "Extended Range",
    battery: { packUsableKwh: f(131, "mfr", "high", undefined, SPECS_23) },
    range: { epaRangeMi: f(300, "mfr", "high", "Platinum carries the same Extended Range pack but is EPA-rated 300 (heavier 22\" wheels)", epa(46328)) },
    thermal: { heatPump: NO_HEAT_PUMP },
    warranty: WARRANTY,
    charging: LIGHTNING_CHARGING,
  },

  // ── MY2024 — heat pump arrives; VIN codes change to K / 7 / M ──────────
  {
    id: "lightning-2024-sr",
    make: "FORD",
    model: "F-150 Lightning",
    modelYears: [2024, 2024],
    vin8: ["K"],
    packVariant: "Standard Range",
    battery: { packUsableKwh: f(98, "mfr", "high", undefined, OG_24) },
    range: { epaRangeMi: f(240, "mfr", "high", "EPA rating for the Standard Range pack (VIN engine code K)", epa(47821)) },
    thermal: { heatPump: HEAT_PUMP_STD },
    warranty: WARRANTY,
    charging: LIGHTNING_CHARGING,
  },
  {
    id: "lightning-2024-er",
    make: "FORD",
    model: "F-150 Lightning",
    modelYears: [2024, 2024],
    vin8: ["7", "M"],
    packVariant: "Extended Range",
    battery: { packUsableKwh: f(131, "mfr", "high", undefined, OG_24) },
    range: { epaRangeMi: f(320, "mfr", "high", "EPA rating for the Extended Range pack (VIN engine code 7, or M with dual onboard chargers), non-Platinum trims", epa(47818)) },
    thermal: { heatPump: HEAT_PUMP_STD },
    warranty: WARRANTY,
    charging: LIGHTNING_CHARGING,
  },
  {
    id: "lightning-2024-er-platinum",
    make: "FORD",
    model: "F-150 Lightning",
    modelYears: [2024, 2024],
    vin8: ["7", "M"],
    trim: "Platinum",
    packVariant: "Extended Range",
    battery: { packUsableKwh: f(131, "mfr", "high", undefined, OG_24) },
    range: { epaRangeMi: f(300, "mfr", "high", "Platinum carries the same Extended Range pack but is EPA-rated 300 (heavier 22\" wheels)", epa(47819)) },
    thermal: { heatPump: HEAT_PUMP_STD },
    warranty: WARRANTY,
    charging: LIGHTNING_CHARGING,
  },

  // ── MY2025 — a third pack appears: 123 kWh ER (VIN code U, "5P90S") ────
  {
    id: "lightning-2025-sr",
    make: "FORD",
    model: "F-150 Lightning",
    modelYears: [2025, 2025],
    vin8: ["K"],
    packVariant: "Standard Range",
    battery: { packUsableKwh: f(98, "mfr", "high", undefined, SPECS_25) },
    range: { epaRangeMi: f(240, "mfr", "high", "EPA rating for the Standard Range pack (VIN engine code K)", epa(48707)) },
    thermal: { heatPump: HEAT_PUMP_STD },
    warranty: WARRANTY,
    charging: LIGHTNING_CHARGING,
  },
  {
    id: "lightning-2025-er123",
    make: "FORD",
    model: "F-150 Lightning",
    modelYears: [2025, 2025],
    vin8: ["U"],
    packVariant: "Extended Range (123 kWh)",
    battery: { packUsableKwh: f(123, "mfr", "high", "The smaller of two 2025 Extended Range packs, new this year (order code 99U)", SPECS_25) },
    range: { epaRangeMi: f(300, "mfr", "high", "EPA rating for the 123 kWh Extended Range pack (VIN engine code U; EPA lists it as “ER2”), standard on Flash, optional on Pro/XLT", epa(49077)) },
    thermal: { heatPump: HEAT_PUMP_STD },
    warranty: WARRANTY,
    charging: LIGHTNING_CHARGING,
  },
  {
    id: "lightning-2025-er131",
    make: "FORD",
    model: "F-150 Lightning",
    modelYears: [2025, 2025],
    vin8: ["7"],
    packVariant: "Extended Range (131 kWh)",
    battery: { packUsableKwh: f(131, "mfr", "high", undefined, SPECS_25) },
    range: { epaRangeMi: f(320, "mfr", "high", "EPA rating for the 131 kWh Extended Range pack (VIN engine code 7; EPA lists it as “ER1”), non-Platinum trims", epa(48705)) },
    thermal: { heatPump: HEAT_PUMP_STD },
    warranty: WARRANTY,
    charging: LIGHTNING_CHARGING,
  },
  {
    id: "lightning-2025-er131-platinum",
    make: "FORD",
    model: "F-150 Lightning",
    modelYears: [2025, 2025],
    vin8: ["7"],
    trim: "Platinum",
    packVariant: "Extended Range (131 kWh)",
    battery: { packUsableKwh: f(131, "mfr", "high", undefined, SPECS_25) },
    range: { epaRangeMi: f(300, "mfr", "high", "Platinum carries the 131 kWh Extended Range pack but is EPA-rated 300 (heavier 22\" wheels)", epa(48708)) },
    thermal: { heatPump: HEAT_PUMP_STD },
    warranty: WARRANTY,
    charging: LIGHTNING_CHARGING,
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
      epaRangeMi: f(259, "mfr", "high", "MY2020, the pack grew to 66 kWh and EPA range rose to 259", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=42191"),
      testedRangeMi: f(226, "tested", "high", "70-mph (InsideEVs, 2020): 226 mi; 75-mph (C&D): 220"),
    },
    charging: {
      dcFastCharging: f("optional", "mfr", "high", "$750 factory option; fitted cars have two extra pins under the J1772 socket"),
      portStandard: f("CCS1", "mfr", "high", "Only when the CBT option is present; without it the car is AC-only"),
    },
    thermal: { heatPump: f("none", "mfr") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      batteryTransfers: f(true, "mfr", "high"),
    },
    buyerNotes: [
      { headline: "DC fast charging: $750 factory option, not on every car", severity: "trap", resolvedBy: "photo_dcfc" },
      { headline: "Most 2020–22 cars kept their original packs (21V560)", severity: "info", resolvedBy: "campaign_check" },
      { headline: "No capacity floor on the battery warranty", severity: "warning" },
    ],
  },
  {
    id: "bolt-euv-2022-23",
    make: "CHEVROLET",
    model: "Bolt EUV",
    modelYears: [2022, 2023],
    range: { epaRangeMi: f(247, "mfr", "high", "Bolt EUV, both years, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=45750") },
    charging: { dcFastCharging: f("standard", "mfr"), portStandard: f("CCS1", "mfr") },
    thermal: { heatPump: f("none", "mfr") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      batteryTransfers: f(true, "mfr", "high"),
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
      packGrossKwh: f(65, "mfr", "high", undefined, BOLT27_PRESS),
      chemistry: f("LFP", "mfr", "high", undefined, BOLT27_PRESS),
    },
    range: { epaRangeMi: f(262, "mfr", "high", "EPA-estimated 262 mi (GM's launch estimate was 255; the certified figure came in higher)", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50372") },
    charging: {
      portStandard: f("NACS", "mfr", "high", undefined, BOLT27_PRESS),
      superchargerAccess: f("native", "mfr"),
      dcFastCharging: f("standard", "mfr"),
      dcPeakKw: f(150, "mfr", "high", undefined, BOLT27_PRESS),
      chargeTime1080Min: f(25, "mfr", "high", undefined, BOLT27_PRESS),
    },
    thermal: {
      heatPump: f("standard", "mfr", "high", undefined, BOLT27_PRESS),
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
    range: { epaRangeMi: f(230, "mfr", "high", "MY2021 Standard Range RWD (VIN engine code M), EPA", epa(43604)) },
    charging: { ...ME_PORT_EARLY, dcPeakKw: ME_DC_SR },
    thermal: { heatPump: ME_NO_HP },
    warranty: ME_WARRANTY,
    buyerNotes: [NOTE_RECALLS_2122, NOTE_BLUECRUISE, noteConnected(2021)],
  },
  {
    id: "mache-2021-sr-awd", ...ME, modelYears: [2021, 2021], vin8: ["S"], drive: "AWD",
    packVariant: "Standard Range",
    battery: { packUsableKwh: ME_KWH_SR_NMC, chemistry: ME_NMC_EARLY },
    range: { epaRangeMi: f(211, "mfr", "high", "MY2021 Standard Range AWD (VIN engine code S), EPA", epa(43602)) },
    charging: { ...ME_PORT_EARLY, dcPeakKw: ME_DC_SR },
    thermal: { heatPump: ME_NO_HP },
    warranty: ME_WARRANTY,
    buyerNotes: [NOTE_RECALLS_2122, NOTE_BLUECRUISE, noteConnected(2021)],
  },
  {
    id: "mache-2021-er-rwd", ...ME, modelYears: [2021, 2021], vin8: ["7"], drive: "RWD",
    packVariant: "Extended Range",
    battery: { packUsableKwh: ME_KWH_ER, chemistry: ME_NMC_ER },
    range: { epaRangeMi: f(300, "mfr", "high", "MY2021 Extended Range RWD (VIN engine code 7), non-California-Route-1, EPA", epa(43605)) },
    charging: { ...ME_PORT_EARLY, dcPeakKw: ME_DC_ER },
    thermal: { heatPump: ME_NO_HP },
    warranty: ME_WARRANTY,
    buyerNotes: [NOTE_RECALLS_2122, NOTE_BLUECRUISE, noteConnected(2021)],
  },
  {
    id: "mache-2021-er-rwd-cr1", ...ME, modelYears: [2021, 2021], vin8: ["7"], drive: "RWD", trim: "California Route 1",
    packVariant: "Extended Range",
    battery: { packUsableKwh: ME_KWH_ER, chemistry: ME_NMC_ER },
    range: {
      epaRangeMi: f(305, "mfr", "high", "MY2021 California Route 1 (Extended Range RWD with aero wheels), EPA", epa(43683)),
      testedRangeMi: f(287, "tested", "high", "70-mph steady-state highway (InsideEVs)", "https://insideevs.com/reviews/527004/mustang-mache-route1-range-test/"),
    },
    charging: { ...ME_PORT_EARLY, dcPeakKw: ME_DC_ER },
    thermal: { heatPump: ME_NO_HP },
    warranty: ME_WARRANTY,
    buyerNotes: [NOTE_RECALLS_2122, NOTE_BLUECRUISE, noteConnected(2021)],
  },
  {
    id: "mache-2021-er-awd", ...ME, modelYears: [2021, 2021], vin8: ["U"], drive: "AWD",
    packVariant: "Extended Range",
    battery: { packUsableKwh: ME_KWH_ER, chemistry: ME_NMC_ER },
    range: {
      epaRangeMi: f(270, "mfr", "high", "MY2021 Extended Range AWD (VIN engine code U), incl. First Edition, EPA", epa(43603)),
      testedRangeMi: f(285, "tested", "high", "70-mph steady-state highway (InsideEVs)", "https://insideevs.com/reviews/502506/mustang-mach-e-70mph-range-test/"),
    },
    charging: { ...ME_PORT_EARLY, dcPeakKw: ME_DC_ER },
    thermal: { heatPump: ME_NO_HP },
    warranty: ME_WARRANTY,
    buyerNotes: [NOTE_RECALLS_2122, NOTE_BLUECRUISE, noteConnected(2021)],
  },
  {
    id: "mache-2021-gt", ...ME, modelYears: [2021, 2021], vin8: ["E"], drive: "AWD",
    packVariant: "Extended Range · GT",
    battery: { packUsableKwh: ME_KWH_ER, chemistry: ME_NMC_ER },
    range: { epaRangeMi: f(270, "mfr", "high", "MY2021 GT (VIN engine code E = the GT's standard 99E motor per Ford's order guide), EPA", epa(44797)) },
    charging: { ...ME_PORT_EARLY, dcPeakKw: ME_DC_ER },
    thermal: { heatPump: ME_NO_HP },
    warranty: ME_WARRANTY,
    buyerNotes: [NOTE_RECALLS_2122, NOTE_BLUECRUISE, noteConnected(2021)],
  },
  {
    id: "mache-2021-gt-pe", ...ME, modelYears: [2021, 2021], vin8: ["X"], drive: "AWD",
    packVariant: "Extended Range · GT Performance",
    battery: { packUsableKwh: ME_KWH_ER, chemistry: ME_NMC_ER },
    range: { epaRangeMi: f(260, "mfr", "high", "MY2021 GT Performance Edition, the 99X 'Enhanced Performance' motor is required for the PE package (Ford order guide), so an X code is a Performance Edition even when the listing just says 'GT', EPA", epa(44798)) },
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
    range: { epaRangeMi: f(247, "mfr", "high", "MY2022 Standard Range RWD (VIN engine code M), EPA", epa(45144)) },
    charging: { ...ME_PORT_EARLY, dcPeakKw: ME_DC_SR },
    thermal: { heatPump: ME_NO_HP },
    warranty: ME_WARRANTY,
    buyerNotes: [NOTE_RECALLS_2122, NOTE_BLUECRUISE, noteConnected(2022)],
  },
  {
    id: "mache-2022-sr-awd", ...ME, modelYears: [2022, 2022], vin8: ["S"], drive: "AWD",
    packVariant: "Standard Range",
    battery: { packUsableKwh: ME_KWH_SR_NMC, chemistry: ME_NMC_EARLY },
    range: { epaRangeMi: f(224, "mfr", "high", "MY2022 Standard Range AWD (VIN engine code S), EPA", epa(45138)) },
    charging: { ...ME_PORT_EARLY, dcPeakKw: ME_DC_SR },
    thermal: { heatPump: ME_NO_HP },
    warranty: ME_WARRANTY,
    buyerNotes: [NOTE_RECALLS_2122, NOTE_BLUECRUISE, noteConnected(2022)],
  },
  {
    id: "mache-2022-er-rwd", ...ME, modelYears: [2022, 2022], vin8: ["7"], drive: "RWD",
    packVariant: "Extended Range",
    battery: { packUsableKwh: ME_KWH_ER, chemistry: ME_NMC_ER },
    range: { epaRangeMi: f(303, "mfr", "high", "MY2022 Extended Range RWD (VIN engine code 7), non-California-Route-1, EPA", epa(45145)) },
    charging: { ...ME_PORT_EARLY, dcPeakKw: ME_DC_ER },
    thermal: { heatPump: ME_NO_HP },
    warranty: ME_WARRANTY,
    buyerNotes: [NOTE_RECALLS_2122, NOTE_BLUECRUISE, noteConnected(2022)],
  },
  {
    id: "mache-2022-er-rwd-cr1", ...ME, modelYears: [2022, 2022], vin8: ["7"], drive: "RWD", trim: "California Route 1",
    packVariant: "Extended Range",
    battery: { packUsableKwh: ME_KWH_ER, chemistry: ME_NMC_ER },
    range: {
      epaRangeMi: f(314, "mfr", "high", "MY2022 California Route 1 Extended Range RWD, EPA", epa(45141)),
      testedRangeMi: f(287, "tested", "medium", "70-mph test of the identical 2021 pack (InsideEVs)", "https://insideevs.com/reviews/527004/mustang-mache-route1-range-test/"),
    },
    charging: { ...ME_PORT_EARLY, dcPeakKw: ME_DC_ER },
    thermal: { heatPump: ME_NO_HP },
    warranty: ME_WARRANTY,
    buyerNotes: [NOTE_RECALLS_2122, NOTE_BLUECRUISE, noteConnected(2022)],
  },
  {
    id: "mache-2022-er-awd", ...ME, modelYears: [2022, 2022], vin8: ["U"], drive: "AWD",
    packVariant: "Extended Range",
    battery: { packUsableKwh: ME_KWH_ER, chemistry: ME_NMC_ER },
    range: {
      epaRangeMi: f(277, "mfr", "high", "MY2022 Extended Range AWD (VIN engine code U), non-California-Route-1, EPA", epa(45139)),
      testedRangeMi: f(285, "tested", "medium", "70-mph test of the identical 2021 pack (InsideEVs)", "https://insideevs.com/reviews/502506/mustang-mach-e-70mph-range-test/"),
    },
    charging: { ...ME_PORT_EARLY, dcPeakKw: ME_DC_ER },
    thermal: { heatPump: ME_NO_HP },
    warranty: ME_WARRANTY,
    buyerNotes: [NOTE_RECALLS_2122, NOTE_BLUECRUISE, noteConnected(2022)],
  },
  {
    id: "mache-2022-er-awd-cr1", ...ME, modelYears: [2022, 2022], vin8: ["U"], drive: "AWD", trim: "California Route 1",
    packVariant: "Extended Range",
    battery: { packUsableKwh: ME_KWH_ER, chemistry: ME_NMC_ER },
    range: { epaRangeMi: f(312, "mfr", "high", "MY2022 California Route 1 Extended Range AWD, EPA", epa(45140)) },
    charging: { ...ME_PORT_EARLY, dcPeakKw: ME_DC_ER },
    thermal: { heatPump: ME_NO_HP },
    warranty: ME_WARRANTY,
    buyerNotes: [NOTE_RECALLS_2122, NOTE_BLUECRUISE, noteConnected(2022)],
  },
  {
    id: "mache-2022-gt", ...ME, modelYears: [2022, 2022], vin8: ["E"], drive: "AWD",
    packVariant: "Extended Range · GT",
    battery: { packUsableKwh: ME_KWH_ER, chemistry: ME_NMC_ER },
    range: { epaRangeMi: f(270, "mfr", "high", "MY2022 GT (VIN engine code E = the GT's standard 99E motor per Ford's order guide), EPA", epa(45142)) },
    charging: { ...ME_PORT_EARLY, dcPeakKw: ME_DC_ER },
    thermal: { heatPump: ME_NO_HP },
    warranty: ME_WARRANTY,
    buyerNotes: [NOTE_RECALLS_2122, NOTE_BLUECRUISE, noteConnected(2022)],
  },
  {
    id: "mache-2022-gt-pe", ...ME, modelYears: [2022, 2022], vin8: ["X"], drive: "AWD",
    packVariant: "Extended Range · GT Performance",
    battery: { packUsableKwh: ME_KWH_ER, chemistry: ME_NMC_ER },
    range: { epaRangeMi: f(260, "mfr", "high", "MY2022 GT Performance Edition, the 99X 'Enhanced Performance' motor is required for the PE package (Ford order guide), so an X code is a Performance Edition even when the listing just says 'GT', EPA", epa(45143)) },
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
    range: { epaRangeMi: f(247, "mfr", "high", "MY2023 Standard Range RWD, pre-switch NMC build (VIN engine code M), EPA", epa(46517)) },
    charging: { ...ME_PORT_EARLY, dcPeakKw: ME_DC_SR },
    thermal: { heatPump: ME_NO_HP },
    warranty: ME_WARRANTY,
    buyerNotes: [NOTE_RECALLS_2023, NOTE_BLUECRUISE, noteConnected(2023)],
  },
  {
    id: "mache-2023-sr-awd-nmc", ...ME, modelYears: [2023, 2023], vin8: ["S"], drive: "AWD",
    packVariant: "Standard Range (NMC)",
    battery: { packUsableKwh: ME_KWH_SR_NMC, chemistry: ME_NMC_2023 },
    range: { epaRangeMi: f(224, "mfr", "high", "MY2023 Standard Range AWD, pre-switch NMC build (VIN engine code S), EPA", epa(46512)) },
    charging: { ...ME_PORT_EARLY, dcPeakKw: ME_DC_SR },
    thermal: { heatPump: ME_NO_HP },
    warranty: ME_WARRANTY,
    buyerNotes: [NOTE_RECALLS_2023, NOTE_BLUECRUISE, noteConnected(2023)],
  },
  {
    id: "mache-2023-sr-rwd-lfp", ...ME, modelYears: [2023, 2023], vin8: ["4"], drive: "RWD",
    packVariant: "Standard Range (LFP)",
    battery: { chemistry: ME_LFP },
    range: { epaRangeMi: f(250, "mfr", "high", "MY2023 Standard Range RWD, post-switch LFP build (VIN engine code 4), EPA's separate “RWD LFP” certification", epa(46985)) },
    charging: { ...ME_PORT_EARLY, dcPeakKw: ME_DC_SR },
    thermal: { heatPump: ME_NO_HP },
    warranty: ME_WARRANTY,
    buyerNotes: [NOTE_RECALLS_2023, NOTE_BLUECRUISE, noteConnected(2023)],
  },
  {
    id: "mache-2023-sr-awd-lfp", ...ME, modelYears: [2023, 2023], vin8: ["5"], drive: "AWD",
    packVariant: "Standard Range (LFP)",
    battery: { chemistry: ME_LFP },
    range: { epaRangeMi: f(224, "mfr", "medium", "MY2023 Standard Range AWD (VIN engine code 5, LFP), EPA published one SR AWD rating for 2023; unlike the RWD pack, no separate LFP AWD figure exists", epa(46512)) },
    charging: { ...ME_PORT_EARLY, dcPeakKw: ME_DC_SR },
    thermal: { heatPump: ME_NO_HP },
    warranty: ME_WARRANTY,
    buyerNotes: [NOTE_RECALLS_2023, NOTE_BLUECRUISE, noteConnected(2023)],
  },
  {
    id: "mache-2023-er-rwd", ...ME, modelYears: [2023, 2023], vin8: ["7"], drive: "RWD",
    packVariant: "Extended Range",
    battery: { packUsableKwh: ME_KWH_ER, chemistry: ME_NMC_ER },
    range: { epaRangeMi: f(310, "mfr", "high", "MY2023 Extended Range RWD (VIN engine code 7), EPA", epa(46518)) },
    charging: { ...ME_PORT_EARLY, dcPeakKw: ME_DC_ER },
    thermal: { heatPump: ME_NO_HP },
    warranty: ME_WARRANTY,
    buyerNotes: [NOTE_RECALLS_2023, NOTE_BLUECRUISE, noteConnected(2023)],
  },
  {
    id: "mache-2023-er-awd", ...ME, modelYears: [2023, 2023], vin8: ["U"], drive: "AWD",
    packVariant: "Extended Range",
    battery: { packUsableKwh: ME_KWH_ER, chemistry: ME_NMC_ER },
    range: {
      epaRangeMi: f(290, "mfr", "high", "MY2023 Extended Range AWD (VIN engine code U), non-California-Route-1, EPA", epa(46513)),
      testedRangeMi: f(285, "tested", "high", "70-mph steady-state highway (InsideEVs)", "https://insideevs.com/reviews/663649/ford-mustang-mache-range-test/"),
    },
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
      epaRangeMi: f(312, "mfr", "high", "MY2023 California Route 1 Extended Range AWD, EPA", epa(46514)),
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
    range: { epaRangeMi: f(270, "mfr", "high", "MY2023 GT (VIN engine code E = the GT's standard 99E motor per Ford's order guide), EPA", epa(46515)) },
    charging: { ...ME_PORT_EARLY, dcPeakKw: ME_DC_ER },
    thermal: { heatPump: ME_NO_HP },
    warranty: ME_WARRANTY,
    buyerNotes: [NOTE_RECALLS_2023, NOTE_BLUECRUISE, noteConnected(2023)],
  },
  {
    id: "mache-2023-gt-pe", ...ME, modelYears: [2023, 2023], vin8: ["X"], drive: "AWD",
    packVariant: "Extended Range · GT Performance",
    battery: { packUsableKwh: ME_KWH_ER, chemistry: ME_NMC_ER },
    range: { epaRangeMi: f(260, "mfr", "high", "MY2023 GT Performance Edition, the 99X 'Enhanced Performance' motor is required for the PE package (Ford order guide), so an X code is a Performance Edition even when the listing just says 'GT', EPA", epa(46516)) },
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
    range: { epaRangeMi: f(250, "mfr", "high", "MY2024 Standard Range RWD (VIN engine code 4), EPA", epa(47822)) },
    charging: { ...ME_PORT_EARLY, dcPeakKw: ME_DC_SR },
    thermal: { heatPump: ME_NO_HP },
    warranty: ME_WARRANTY,
    buyerNotes: [NOTE_RECALLS_2024, NOTE_BLUECRUISE, noteConnected(2024)],
  },
  {
    id: "mache-2024-sr-awd", ...ME, modelYears: [2024, 2024], vin8: ["5"], drive: "AWD",
    packVariant: "Standard Range (LFP)",
    battery: { chemistry: ME_LFP },
    range: { epaRangeMi: f(230, "mfr", "high", "MY2024 Standard Range AWD (VIN engine code 5), EPA", epa(47824)) },
    charging: { ...ME_PORT_EARLY, dcPeakKw: ME_DC_SR },
    thermal: { heatPump: ME_NO_HP },
    warranty: ME_WARRANTY,
    buyerNotes: [NOTE_RECALLS_2024, NOTE_BLUECRUISE, noteConnected(2024)],
  },
  {
    id: "mache-2024-er-rwd", ...ME, modelYears: [2024, 2024], vin8: ["7"], drive: "RWD",
    packVariant: "Extended Range",
    battery: { packUsableKwh: ME_KWH_ER_LATE, chemistry: ME_NMC_ER },
    range: { epaRangeMi: f(320, "mfr", "high", "MY2024 Extended Range RWD (VIN engine code 7), EPA", epa(47823)) },
    charging: { ...ME_PORT_EARLY, dcPeakKw: ME_DC_ER },
    thermal: { heatPump: ME_NO_HP },
    warranty: ME_WARRANTY,
    buyerNotes: [NOTE_RECALLS_2024, NOTE_BLUECRUISE, noteConnected(2024)],
  },
  {
    id: "mache-2024-er-awd", ...ME, modelYears: [2024, 2024], vin8: ["U"], drive: "AWD",
    packVariant: "Extended Range",
    battery: { packUsableKwh: ME_KWH_ER_LATE, chemistry: ME_NMC_ER },
    range: { epaRangeMi: f(300, "mfr", "high", "MY2024 Extended Range AWD (VIN engine code U), EPA", epa(47825)) },
    charging: { ...ME_PORT_EARLY, dcPeakKw: ME_DC_ER },
    thermal: { heatPump: ME_NO_HP },
    warranty: ME_WARRANTY,
    buyerNotes: [NOTE_RECALLS_2024, NOTE_BLUECRUISE, noteConnected(2024)],
  },
  {
    id: "mache-2024-gt", ...ME, modelYears: [2024, 2024], vin8: ["X"], drive: "AWD",
    packVariant: "Extended Range · GT",
    battery: { packUsableKwh: ME_KWH_ER_LATE, chemistry: ME_NMC_ER },
    range: { epaRangeMi: f(280, "mfr", "high", "MY2024 GT (VIN engine code X, the GT adopts the former Performance Edition hardware from 2024; the Rally's code is unverified and gets no row), EPA", epa(47826)) },
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
    range: { epaRangeMi: f(260, "mfr", "high", "MY2025 Standard Range RWD (VIN engine code 4), EPA; MY2026 carries the same 260-mi rating", epa(49082)) },
    charging: { ...ME_PORT_LATE, dcPeakKw: ME_DC_SR },
    thermal: { heatPump: ME_HP_STD },
    warranty: ME_WARRANTY,
    buyerNotes: [NOTE_RECALLS_2526, NOTE_BLUECRUISE, NOTE_CONNECTED_2526],
  },
  {
    id: "mache-2025-26-sr-awd", ...ME, modelYears: [2025, 2026], vin8: ["5"], drive: "AWD",
    packVariant: "Standard Range (LFP)",
    battery: { packUsableKwh: ME_KWH_SR_LATE, chemistry: ME_LFP },
    range: { epaRangeMi: f(240, "mfr", "high", "MY2025 Standard Range AWD (VIN engine code 5), EPA; MY2026 carries the same 240-mi rating", epa(49078)) },
    charging: { ...ME_PORT_LATE, dcPeakKw: ME_DC_SR },
    thermal: { heatPump: ME_HP_STD },
    warranty: ME_WARRANTY,
    buyerNotes: [NOTE_RECALLS_2526, NOTE_BLUECRUISE, NOTE_CONNECTED_2526],
  },
  {
    id: "mache-2025-26-er-rwd", ...ME, modelYears: [2025, 2026], vin8: ["7"], drive: "RWD",
    packVariant: "Extended Range",
    battery: { packUsableKwh: ME_KWH_ER_LATE, chemistry: ME_NMC_ER },
    range: { epaRangeMi: f(320, "mfr", "high", "MY2025 Extended Range RWD (VIN engine code 7), EPA; MY2026 carries the same 320-mi rating. Resolves the Premium either-battery question for this VIN", epa(49083)) },
    charging: { ...ME_PORT_LATE, dcPeakKw: ME_DC_ER },
    thermal: { heatPump: ME_HP_STD },
    warranty: ME_WARRANTY,
    buyerNotes: [NOTE_RECALLS_2526, NOTE_BLUECRUISE, NOTE_CONNECTED_2526],
  },
  {
    id: "mache-2025-26-er-awd", ...ME, modelYears: [2025, 2026], vin8: ["U"], drive: "AWD",
    packVariant: "Extended Range",
    battery: { packUsableKwh: ME_KWH_ER_LATE, chemistry: ME_NMC_ER },
    range: { epaRangeMi: f(300, "mfr", "high", "MY2025 Extended Range AWD (VIN engine code U), EPA; MY2026 carries the same 300-mi rating. Resolves the Premium either-battery question for this VIN", epa(49079)) },
    charging: { ...ME_PORT_LATE, dcPeakKw: ME_DC_ER },
    thermal: { heatPump: ME_HP_STD },
    warranty: ME_WARRANTY,
    buyerNotes: [NOTE_RECALLS_2526, NOTE_BLUECRUISE, NOTE_CONNECTED_2526],
  },
  {
    id: "mache-2025-26-gt", ...ME, modelYears: [2025, 2026], vin8: ["X"], drive: "AWD",
    packVariant: "Extended Range · GT",
    battery: { packUsableKwh: ME_KWH_ER_LATE, chemistry: ME_NMC_ER },
    range: { epaRangeMi: f(280, "mfr", "high", "MY2025 GT (VIN engine code X), EPA; MY2026 carries the same 280-mi rating. The Rally's code is unverified and gets no row", epa(49080)) },
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
    range: { epaRangeMi: f(310, "mfr", "high", "MY2018 Long Range RWD (single-motor VIN code A + Long Range trim), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=39836") },
    charging: TES_CHARGING,
    thermal: M3_NO_HP_EARLY,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "m3-2018-mid", ...T3, model: "Model 3", modelYears: [2018, 2018], vin8: ["A"], trim: "Mid Range", 
    packVariant: "Mid Range",
    range: { epaRangeMi: f(260, "mfr", "high", "MY2018 Mid Range (single-motor VIN code A + Mid Range trim), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=41056") },
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
    range: { epaRangeMi: f(240, "mfr", "high", "MY2019 Standard Range Plus (single-motor VIN code A + trim), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=41416") },
    charging: TES_CHARGING,
    thermal: M3_NO_HP_EARLY,
    warranty: TES_W100,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "m3-2019-lr-rwd", ...T3, model: "Model 3", modelYears: [2019, 2019], vin8: ["A"], trim: "Long Range", 
    packVariant: "Long Range RWD",
    range: { epaRangeMi: f(310, "mfr", "high", "MY2019 Long Range RWD (single-motor VIN code A + Long Range trim), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=41189") },
    charging: TES_CHARGING,
    thermal: M3_NO_HP_EARLY,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "m3-2019-mid", ...T3, model: "Model 3", modelYears: [2019, 2019], vin8: ["A"], trim: "Mid Range", 
    packVariant: "Mid Range",
    range: { epaRangeMi: f(264, "mfr", "high", "MY2019 Mid Range (single-motor VIN code A + Mid Range trim), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=41188") },
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
    range: { epaRangeMi: f(250, "mfr", "high", "MY2020 single-motor (VIN code A), Standard Range Plus, the only single-motor Model 3 sold in the US that year, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=42278") },
    charging: TES_CHARGING,
    thermal: M3_NO_HP_2020,
    warranty: TES_W100,
    buyerNotes: [NOTE_HP_VIN10, NOTE_FSD],
  },
  {
    id: "m3-2020-lr-awd", ...T3, model: "Model 3", modelYears: [2020, 2020], vin8: ["B"], 
    packVariant: "Long Range AWD",
    range: { epaRangeMi: f(322, "mfr", "high", "MY2020 Long Range AWD (dual-motor VIN code B), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=42275") },
    charging: TES_CHARGING,
    thermal: M3_NO_HP_2020,
    warranty: TES_W120,
    buyerNotes: [NOTE_HP_VIN10, NOTE_FSD],
  },
  {
    id: "m3-2020-perf", ...T3, model: "Model 3", modelYears: [2020, 2020], vin8: ["C"], 
    packVariant: "Performance",
    range: { epaRangeMi: f(299, "mfr", "high", "MY2020 Performance (VIN code C) on its standard 20-inch wheels, EPA; EPA also lists 18/19-inch configurations at 322/304", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=42281") },
    charging: TES_CHARGING,
    thermal: M3_NO_HP_2020,
    warranty: TES_W120,
    buyerNotes: [NOTE_HP_VIN10, NOTE_FSD],
  },
  {
    id: "m3-2021-srplus", ...T3, model: "Model 3", modelYears: [2021, 2021], vin8: ["A"], 
    packVariant: "Standard Range Plus",
    range: { epaRangeMi: f(263, "mfr", "high", "MY2021 Standard Range Plus (single-motor VIN code A), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=43821") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W100,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "m3-2021-lr-awd", ...T3, model: "Model 3", modelYears: [2021, 2021], vin8: ["B"], 
    packVariant: "Long Range AWD",
    range: { epaRangeMi: f(353, "mfr", "high", "MY2021 Long Range AWD (dual-motor VIN code B), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=43401") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "m3-2021-perf", ...T3, model: "Model 3", modelYears: [2021, 2021], vin8: ["C"], 
    packVariant: "Performance",
    range: { epaRangeMi: f(315, "mfr", "high", "MY2021 Performance (VIN code C), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=43402") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "m3-2022-23-rwd", ...T3, model: "Model 3", modelYears: [2022, 2023], vin8: ["A"], 
    packVariant: "RWD (LFP)",
    range: { epaRangeMi: f(272, "mfr", "high", "MY2022–23 Model 3 RWD (single-motor VIN code A), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=45013") },
    battery: { chemistry: f("LFP", "agg", "high", "CATL LFP pack in every US 2022–23 Model 3 RWD") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W100,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "m3-2022-23-lr-awd", ...T3, model: "Model 3", modelYears: [2022, 2023], vin8: ["B"], 
    packVariant: "Long Range AWD",
    range: { epaRangeMi: f(358, "mfr", "high", "MY2022–23 Long Range AWD (dual-motor VIN code B), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=45011") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "m3-2022-23-perf", ...T3, model: "Model 3", modelYears: [2022, 2023], vin8: ["C"], 
    packVariant: "Performance",
    range: { epaRangeMi: f(315, "mfr", "high", "MY2022–23 Performance (VIN code C), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=45012") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "m3-2024-rwd", ...T3, model: "Model 3", modelYears: [2024, 2024], vin8: ["A"], 
    packVariant: "RWD (LFP)",
    range: { epaRangeMi: f(272, "mfr", "high", "MY2024 Model 3 RWD (single-motor VIN code A, non-Long-Range), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47909") },
    battery: { chemistry: f("LFP", "agg", "high", "CATL LFP pack in the US Model 3 RWD") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W100,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "m3-2024-lr-rwd", ...T3, model: "Model 3", modelYears: [2024, 2024], vin8: ["A"], trim: "Long Range", 
    packVariant: "Long Range RWD",
    range: { epaRangeMi: f(363, "mfr", "high", "MY2024 Long Range RWD (single-motor VIN code A + Long Range trim; new variant this year), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48795") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "m3-2024-lr-awd", ...T3, model: "Model 3", modelYears: [2024, 2024], vin8: ["B"], 
    packVariant: "Long Range AWD",
    range: { epaRangeMi: f(341, "mfr", "high", "MY2024 Long Range AWD (dual-motor VIN code B), EPA lists 341/342 depending on motor variant", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48473") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "m3-2024-perf", ...T3, model: "Model 3", modelYears: [2024, 2024], vin8: ["T"], 
    packVariant: "Performance",
    range: { epaRangeMi: f(303, "mfr", "high", "MY2024 Performance, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48796") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "m3-2025-lr-rwd", ...T3, model: "Model 3", modelYears: [2025, 2025], vin8: ["A"], 
    packVariant: "Long Range RWD",
    range: { epaRangeMi: f(363, "mfr", "high", "MY2025 single-motor (VIN code A), Long Range RWD, the only single-motor Model 3 EPA-certified for 2025; a 19-inch-wheel configuration is listed at 346", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48765") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "m3-2025-lr-awd", ...T3, model: "Model 3", modelYears: [2025, 2025], vin8: ["B"], 
    packVariant: "Long Range AWD",
    range: { epaRangeMi: f(346, "mfr", "high", "MY2025 Long Range AWD (dual-motor VIN code B), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48764") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "m3-2025-perf", ...T3, model: "Model 3", modelYears: [2025, 2025], vin8: ["T"], 
    packVariant: "Performance",
    range: { epaRangeMi: f(298, "mfr", "high", "MY2025 Performance (VIN code T), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48996") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "m3-2026-premium-rwd", ...T3, model: "Model 3", modelYears: [2026, 2026], vin8: ["A"], trim: ["Premium", "Long Range"], 
    packVariant: "Premium RWD",
    range: { epaRangeMi: f(363, "mfr", "high", "MY2026 Premium RWD (single-motor VIN code A + Premium trim, Tesla's new name for the Long Range), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50038") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "m3-2026-standard", ...T3, model: "Model 3", modelYears: [2026, 2026], vin8: ["A"], trim: "Standard", 
    packVariant: "Standard RWD",
    range: { epaRangeMi: f(321, "mfr", "high", "MY2026 Standard RWD (single-motor VIN code A + Standard trim), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50251") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "m3-2026-premium-awd", ...T3, model: "Model 3", modelYears: [2026, 2026], vin8: ["B"], 
    packVariant: "Premium AWD",
    range: { epaRangeMi: f(346, "mfr", "high", "MY2026 Premium AWD (dual-motor VIN code B), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50037") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "m3-2026-perf", ...T3, model: "Model 3", modelYears: [2026, 2026], vin8: ["T"], 
    packVariant: "Performance",
    range: { epaRangeMi: f(314, "mfr", "high", "MY2026 Performance AWD (VIN code T), EPA; a second Performance certification is listed at 309", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50250") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "my-2020-lr-awd", ...T3, model: "Model Y", modelYears: [2020, 2020], vin8: ["E"], 
    packVariant: "Long Range AWD",
    range: { epaRangeMi: f(316, "mfr", "high", "MY2020 Long Range AWD (dual-motor VIN code E), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=42916") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "my-2020-perf", ...T3, model: "Model Y", modelYears: [2020, 2020], vin8: ["F"], 
    packVariant: "Performance",
    range: { epaRangeMi: f(315, "mfr", "high", "MY2020 Performance (VIN code F), EPA; the 21-inch-wheel configuration is listed at 291", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=42474") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "my-2021-sr-rwd", ...T3, model: "Model Y", modelYears: [2021, 2021], vin8: ["D"], 
    packVariant: "Standard Range RWD",
    range: { epaRangeMi: f(244, "mfr", "high", "MY2021 Standard Range RWD (single-motor VIN code D), sold January–February 2021 only, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=43880") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W100,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "my-2021-lr-awd", ...T3, model: "Model Y", modelYears: [2021, 2021], vin8: ["E"], 
    packVariant: "Long Range AWD",
    range: { epaRangeMi: f(326, "mfr", "high", "MY2021 Long Range AWD (dual-motor VIN code E), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=43406") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "my-2021-perf", ...T3, model: "Model Y", modelYears: [2021, 2021], vin8: ["F"], 
    packVariant: "Performance",
    range: { epaRangeMi: f(303, "mfr", "high", "MY2021 Performance (VIN code F), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=43407") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "my-2022-23-perf", ...T3, model: "Model Y", modelYears: [2022, 2023], vin8: ["F"], 
    packVariant: "Performance",
    range: { epaRangeMi: f(303, "mfr", "high", "MY2022–23 Performance (VIN code F), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=45019") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "my-2023-rwd", ...T3, model: "Model Y", modelYears: [2023, 2023], vin8: ["D"], 
    packVariant: "RWD",
    range: { epaRangeMi: f(260, "mfr", "medium", "Single-motor (VIN code D) MY2023, the Model Y RWD launched October 2023; fueleconomy.gov files its 260-mi certification under MY2024 with no separate MY2023 entry", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48476") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W100,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "my-2024-lr-rwd", ...T3, model: "Model Y", modelYears: [2024, 2024], vin8: ["D"], trim: "Long Range", 
    packVariant: "Long Range RWD",
    range: { epaRangeMi: f(320, "mfr", "high", "MY2024 Long Range RWD (single-motor VIN code D + Long Range trim), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48475") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "my-2024-rwd", ...T3, model: "Model Y", modelYears: [2024, 2024], vin8: ["D"], 
    packVariant: "RWD",
    range: { epaRangeMi: f(260, "mfr", "high", "MY2024 Model Y RWD (single-motor VIN code D, non-Long-Range), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48476") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W100,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "my-2024-perf", ...T3, model: "Model Y", modelYears: [2024, 2024], vin8: ["F"], 
    packVariant: "Performance",
    range: { epaRangeMi: f(279, "mfr", "high", "MY2024 Performance (VIN code F), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47914") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "my-2025-lr-rwd", ...T3, model: "Model Y", modelYears: [2025, 2025], vin8: ["D"], 
    packVariant: "Long Range RWD",
    range: { epaRangeMi: f(337, "mfr", "high", "MY2025 Long Range RWD (single-motor VIN code D), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48771") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "my-2025-lr-awd", ...T3, model: "Model Y", modelYears: [2025, 2025], vin8: ["E"], 
    packVariant: "Long Range AWD",
    range: { epaRangeMi: f(311, "mfr", "high", "MY2025 Long Range AWD (dual-motor VIN code E), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48770") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "my-2025-perf", ...T3, model: "Model Y", modelYears: [2025, 2025], vin8: ["F"], 
    packVariant: "Performance",
    range: { epaRangeMi: f(277, "mfr", "high", "MY2025 Performance (VIN code F), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48772") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "my-2026-lr-rwd", ...T3, model: "Model Y", modelYears: [2026, 2026], vin8: ["D"], trim: ["Premium", "Long Range"], 
    packVariant: "Long Range RWD",
    range: { epaRangeMi: f(357, "mfr", "high", "MY2026 Premium RWD, Tesla's 2026 consumer name; EPA files it as Long Range RWD (single-motor VIN code D)", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49743") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "my-2026-standard-rwd", ...T3, model: "Model Y", modelYears: [2026, 2026], vin8: ["D"], trim: "Standard", 
    packVariant: "Standard RWD",
    range: { epaRangeMi: f(321, "mfr", "high", "MY2026 Standard RWD (single-motor VIN code D + Standard trim) on 18-inch wheels, EPA; 19-inch configuration listed at 303", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50040") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W100,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "my-2026-lr-awd", ...T3, model: "Model Y", modelYears: [2026, 2026], vin8: ["E"], trim: ["Premium", "Long Range"], 
    packVariant: "Long Range AWD",
    range: { epaRangeMi: f(327, "mfr", "high", "MY2026 Premium AWD, Tesla's 2026 consumer name; EPA files it as Long Range AWD (dual-motor VIN code E)", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49744") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "my-2026-standard-awd", ...T3, model: "Model Y", modelYears: [2026, 2026], vin8: ["E"], trim: "Standard", 
    packVariant: "Standard AWD",
    range: { epaRangeMi: f(294, "mfr", "high", "MY2026 Standard AWD (dual-motor VIN code E + Standard trim), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50304") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "my-2026-perf", ...T3, model: "Model Y", modelYears: [2026, 2026], vin8: ["F"], 
    packVariant: "Performance",
    range: { epaRangeMi: f(306, "mfr", "high", "MY2026 Performance (VIN code F), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50253") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },

  {
    id: "ev6-2022-sr-rwd", ...K6, modelYears: [2022, 2022], vin8: ["A", "B"], trim: "Light", packVariant: "Standard Range",
    battery: EV6_58,
    range: { epaRangeMi: f(232, "mfr", "high", "MY2022 Standard Range RWD (Light trim), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=44927") },
    charging: EV6_PORT_CCS,
    thermal: EV6_HP_NONE,
    warranty: EV6_WARRANTY,
  },
  {
    id: "ev6-2022-lr-rwd", ...K6, modelYears: [2022, 2022], vin8: ["A", "B"], trim: ["Wind", "GT-Line"], packVariant: "Long Range",
    battery: EV6_774,
    range: { epaRangeMi: f(310, "mfr", "high", "MY2022 Long Range RWD (Wind/GT-Line), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=44926") },
    charging: EV6_PORT_CCS,
    thermal: EV6_HP_OPT,
    warranty: EV6_WARRANTY, buyerNotes: [NOTE_EV6_HP],
  },
  {
    id: "ev6-2022-lr-awd", ...K6, modelYears: [2022, 2022], vin8: ["C"], packVariant: "Long Range",
    battery: EV6_774,
    range: { epaRangeMi: f(274, "mfr", "high", "MY2022 Long Range AWD (dual-motor VIN code C), EPA, one rating for both trims this year", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=44925") },
    charging: EV6_PORT_CCS,
    thermal: EV6_HP_OPT,
    warranty: EV6_WARRANTY, buyerNotes: [NOTE_EV6_HP],
  },
  {
    id: "ev6-2023-24-sr-rwd", ...K6, modelYears: [2023, 2024], vin8: ["A", "B"], trim: "Light", ignoreKwhHint: true, packVariant: "Standard Range",
    battery: EV6_58,
    range: { epaRangeMi: f(232, "mfr", "high", "MY2023–24 Standard Range RWD (Light trim), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46007") },
    charging: EV6_PORT_CCS,
    thermal: EV6_HP_NONE,
    warranty: EV6_WARRANTY,
  },
  {
    id: "ev6-2023-24-lr-rwd", ...K6, modelYears: [2023, 2024], vin8: ["A", "B"], trim: ["Wind", "GT-Line", "Light Long Range"], ignoreKwhHint: true, packVariant: "Long Range",
    battery: EV6_774,
    range: { epaRangeMi: f(310, "mfr", "high", "MY2023–24 Long Range RWD, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46006") },
    charging: EV6_PORT_CCS,
    thermal: EV6_HP_OPT,
    warranty: EV6_WARRANTY, buyerNotes: [NOTE_EV6_HP],
  },
  {
    id: "ev6-2023-24-lr-awd-19", ...K6, modelYears: [2023, 2024], vin8: ["C"], trim: ["Wind", "Light Long Range", "Light"], packVariant: "Long Range",
    battery: EV6_774,
    range: { epaRangeMi: f(282, "mfr", "high", "MY2023–24 Long Range AWD on 19-inch wheels (Wind, Light Long Range), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46004") },
    charging: EV6_PORT_CCS,
    thermal: EV6_HP_OPT,
    warranty: EV6_WARRANTY, buyerNotes: [NOTE_EV6_HP],
  },
  {
    id: "ev6-2023-24-lr-awd-20", ...K6, modelYears: [2023, 2024], vin8: ["C"], trim: "GT-Line", packVariant: "Long Range",
    battery: EV6_774,
    range: { epaRangeMi: f(252, "mfr", "high", "MY2023–24 Long Range AWD on the GT-Line's 20-inch wheels, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46005") },
    charging: EV6_PORT_CCS,
    thermal: EV6_HP_OPT,
    warranty: EV6_WARRANTY, buyerNotes: [NOTE_EV6_HP],
  },
  {
    id: "ev6-2023-gt", ...K6, modelYears: [2023, 2023], vin8: ["E"], packVariant: "GT",
    battery: EV6_774,
    range: { epaRangeMi: f(206, "mfr", "high", "MY2023 EV6 GT (VIN code E), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46003") },
    charging: EV6_PORT_CCS,
    thermal: { heatPump: f<"standard">("standard", "mfr") },
    warranty: EV6_WARRANTY,
  },
  {
    id: "ev6-2024-gt", ...K6, modelYears: [2024, 2024], vin8: ["E"], packVariant: "GT",
    battery: EV6_774,
    range: { epaRangeMi: f(218, "mfr", "high", "MY2024 EV6 GT (VIN code E), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46968") },
    charging: EV6_PORT_CCS,
    thermal: { heatPump: f<"standard">("standard", "mfr") },
    warranty: EV6_WARRANTY,
  },
  {
    id: "ev6-2025-26-sr-rwd", ...K6, modelYears: [2025, 2026], vin8: ["A", "B"], trim: "Light", packVariant: "Standard Range",
    battery: EV6_63,
    range: { epaRangeMi: f(237, "mfr", "high", "MY2025–26 Standard Range RWD (Light trim, refreshed 63 kWh pack), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49098") },
    charging: EV6_PORT_NACS,
    thermal: EV6_HP_NONE,
    warranty: EV6_WARRANTY,
  },
  {
    id: "ev6-2025-26-lr-rwd", ...K6, modelYears: [2025, 2026], vin8: ["A", "B"], trim: ["Wind", "GT-Line", "Light Long Range"], packVariant: "Long Range",
    battery: EV6_84,
    range: { epaRangeMi: f(319, "mfr", "high", "MY2025–26 Long Range RWD (refreshed 84 kWh pack), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49097") },
    charging: EV6_PORT_NACS,
    thermal: EV6_HP_OPT,
    warranty: EV6_WARRANTY, buyerNotes: [NOTE_EV6_HP],
  },
  {
    id: "ev6-2025-26-lr-awd-19", ...K6, modelYears: [2025, 2026], vin8: ["C"], trim: ["Wind", "Light Long Range", "Light"], packVariant: "Long Range",
    battery: EV6_84,
    range: { epaRangeMi: f(295, "mfr", "high", "MY2025–26 Long Range AWD on 19-inch wheels, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49095") },
    charging: EV6_PORT_NACS,
    thermal: EV6_HP_OPT,
    warranty: EV6_WARRANTY, buyerNotes: [NOTE_EV6_HP],
  },
  {
    id: "ev6-2025-26-lr-awd-20", ...K6, modelYears: [2025, 2026], vin8: ["C"], trim: "GT-Line", packVariant: "Long Range",
    battery: EV6_84,
    range: { epaRangeMi: f(270, "mfr", "high", "MY2025–26 Long Range AWD on the GT-Line's 20-inch wheels, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49096") },
    charging: EV6_PORT_NACS,
    thermal: EV6_HP_OPT,
    warranty: EV6_WARRANTY, buyerNotes: [NOTE_EV6_HP],
  },
  {
    id: "ev6-2025-26-gt", ...K6, modelYears: [2025, 2026], vin8: ["E"], packVariant: "GT",
    battery: EV6_84,
    range: { epaRangeMi: f(231, "mfr", "high", "MY2025–26 EV6 GT (VIN code E), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49094") },
    charging: EV6_PORT_NACS,
    thermal: { heatPump: f<"standard">("standard", "mfr") },
    warranty: EV6_WARRANTY,
  },

  {
    id: "ev9-2024-lr-rwd", ...K9, modelYears: [2024, 2024], vin8: ["1"], drive: "RWD", packVariant: "Long Range",
    battery: { packGrossKwh: f(99.8, "agg", "medium", "Long Range pack") },
    range: { epaRangeMi: f(304, "mfr", "high", "MY2024 Long Range RWD (VIN code 1), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47450") },
    charging: PORT_CCS,
    warranty: HK_WARRANTY,
  },
  {
    id: "ev9-2025-lr-rwd", ...K9, modelYears: [2025, 2025], vin8: ["1"], drive: "RWD", packVariant: "Long Range",
    battery: { packGrossKwh: f(99.8, "agg", "medium", "Long Range pack") },
    range: { epaRangeMi: f(304, "mfr", "high", "MY2025 Long Range RWD (VIN code 1), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48366") },
    charging: { portStandard: f<"NACS">("NACS", "agg", "high", "Native NACS port from MY2025") },
    warranty: HK_WARRANTY,
  },
  {
    id: "ev9-2026-lr-rwd", ...K9, modelYears: [2026, 2026], vin8: ["1"], drive: "RWD", packVariant: "Long Range",
    battery: { packGrossKwh: f(99.8, "agg", "medium", "Long Range pack") },
    range: { epaRangeMi: f(305, "mfr", "high", "MY2026 Long Range RWD (VIN code 1), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49666") },
    charging: { portStandard: f<"NACS">("NACS", "agg", "high", "Native NACS port from MY2025") },
    warranty: HK_WARRANTY,
  },
  {
    id: "ev9-2024-sr-rwd", ...K9, modelYears: [2024, 2024], vin8: ["2"], drive: "RWD", packVariant: "Standard Range",
    battery: { packGrossKwh: f(76.1, "agg", "medium", "Standard Range pack") },
    range: { epaRangeMi: f(230, "mfr", "high", "MY2024 Standard Range RWD (VIN code 2), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47451") },
    charging: PORT_CCS,
    warranty: HK_WARRANTY,
  },
  {
    id: "ev9-2025-26-sr-rwd", ...K9, modelYears: [2025, 2026], vin8: ["2"], drive: "RWD", packVariant: "Standard Range",
    battery: { packGrossKwh: f(76.1, "agg", "medium", "Standard Range pack") },
    range: { epaRangeMi: f(230, "mfr", "high", "MY2025–26 Standard Range RWD (VIN code 2), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48367") },
    charging: { portStandard: f<"NACS">("NACS", "agg", "high", "Native NACS port from MY2025") },
    warranty: HK_WARRANTY,
  },
  {
    id: "ev9-2024-awd", ...K9, modelYears: [2024, 2024], vin8: ["5"], trim: ["Wind", "Land", "Light"], drive: "AWD", packVariant: "Long Range",
    battery: { packGrossKwh: f(99.8, "agg", "medium", "Long Range pack") },
    range: { epaRangeMi: f(280, "mfr", "high", "MY2024 Long Range AWD (VIN code 5), non-GT-Line, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47452") },
    charging: PORT_CCS,
    warranty: HK_WARRANTY,
  },
  {
    id: "ev9-2024-awd-gtline", ...K9, modelYears: [2024, 2024], vin8: ["5"], trim: "GT-Line", drive: "AWD", packVariant: "Long Range",
    battery: { packGrossKwh: f(99.8, "agg", "medium", "Long Range pack") },
    range: { epaRangeMi: f(270, "mfr", "high", "MY2024 Long Range AWD on the GT-Line wheels, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47453") },
    charging: PORT_CCS,
    warranty: HK_WARRANTY,
  },
  {
    id: "ev9-2025-awd", ...K9, modelYears: [2025, 2025], vin8: ["5"], trim: ["Wind", "Land", "Light"], drive: "AWD", packVariant: "Long Range",
    battery: { packGrossKwh: f(99.8, "agg", "medium", "Long Range pack") },
    range: { epaRangeMi: f(280, "mfr", "high", "MY2025 Long Range AWD (VIN code 5), non-GT-Line, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48368") },
    charging: { portStandard: f<"NACS">("NACS", "agg", "high", "Native NACS port from MY2025") },
    warranty: HK_WARRANTY,
  },
  {
    id: "ev9-2025-awd-gtline", ...K9, modelYears: [2025, 2025], vin8: ["5"], trim: "GT-Line", drive: "AWD", packVariant: "Long Range",
    battery: { packGrossKwh: f(99.8, "agg", "medium", "Long Range pack") },
    range: { epaRangeMi: f(270, "mfr", "high", "MY2025 Long Range AWD, GT-Line, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48369") },
    charging: { portStandard: f<"NACS">("NACS", "agg", "high", "Native NACS port from MY2025") },
    warranty: HK_WARRANTY,
  },
  {
    id: "ev9-2026-awd", ...K9, modelYears: [2026, 2026], vin8: ["5"], trim: ["Wind", "Land", "Light"], drive: "AWD", packVariant: "Long Range",
    battery: { packGrossKwh: f(99.8, "agg", "medium", "Long Range pack") },
    range: { epaRangeMi: f(283, "mfr", "high", "MY2026 Long Range AWD (VIN code 5), non-GT-Line, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49667") },
    charging: { portStandard: f<"NACS">("NACS", "agg", "high", "Native NACS port from MY2025") },
    warranty: HK_WARRANTY,
  },
  {
    id: "ev9-2026-awd-gtline", ...K9, modelYears: [2026, 2026], vin8: ["5"], trim: "GT-Line", drive: "AWD", packVariant: "Long Range",
    battery: { packGrossKwh: f(99.8, "agg", "medium", "Long Range pack") },
    range: { epaRangeMi: f(280, "mfr", "high", "MY2026 Long Range AWD, GT-Line, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49668") },
    charging: { portStandard: f<"NACS">("NACS", "agg", "high", "Native NACS port from MY2025") },
    warranty: HK_WARRANTY,
  },
  {
    id: "i6-2023-24-lr-rwd-18", ...H6, modelYears: [2023, 2024], vin8: ["A"], trim: "SE", drive: "RWD", packVariant: "Long Range",
    range: { epaRangeMi: f(361, "mfr", "high", "MY2023–24 Long Range RWD on the SE 18-inch wheels, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46622") },
    charging: PORT_CCS,
    warranty: HK_WARRANTY,
  },
  {
    id: "i6-2023-24-lr-rwd-20", ...H6, modelYears: [2023, 2024], vin8: ["A"], trim: ["SEL", "Limited"], drive: "RWD", packVariant: "Long Range",
    range: { epaRangeMi: f(305, "mfr", "high", "MY2023–24 Long Range RWD on 20-inch wheels (SEL, Limited), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46623") },
    charging: PORT_CCS,
    warranty: HK_WARRANTY,
  },
  {
    id: "i6-2023-24-lr-awd-18", ...H6, modelYears: [2023, 2024], vin8: ["C"], trim: "SE", drive: "AWD", packVariant: "Long Range",
    range: { epaRangeMi: f(316, "mfr", "high", "MY2023–24 Long Range AWD on the SE 18-inch wheels, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46620") },
    charging: PORT_CCS,
    warranty: HK_WARRANTY,
  },
  {
    id: "i6-2023-24-lr-awd-20", ...H6, modelYears: [2023, 2024], vin8: ["C"], trim: ["SEL", "Limited"], drive: "AWD", packVariant: "Long Range",
    range: { epaRangeMi: f(270, "mfr", "high", "MY2023–24 Long Range AWD on 20-inch wheels (SEL, Limited), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46621") },
    charging: PORT_CCS,
    warranty: HK_WARRANTY,
  },
  {
    id: "i6-2023-25-sr", ...H6, modelYears: [2023, 2025], vin8: ["B"], trim: "SE Standard Range", drive: "RWD", packVariant: "Standard Range",
    range: { epaRangeMi: f(240, "mfr", "high", "SE Standard Range RWD (VIN code B, the 111 kW motor in Hyundai Part 565 data), EPA, same 240-mi rating all three years", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46624") },
    charging: PORT_CCS,
    warranty: HK_WARRANTY,
  },
  {
    id: "i6-2025-lr-rwd-18", ...H6, modelYears: [2025, 2025], vin8: ["A"], trim: "SE", drive: "RWD", packVariant: "Long Range",
    range: { epaRangeMi: f(342, "mfr", "high", "MY2025 Long Range RWD on the SE 18-inch wheels, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48362") },
    charging: PORT_CCS,
    warranty: HK_WARRANTY,
  },
  {
    id: "i6-2025-lr-rwd-20", ...H6, modelYears: [2025, 2025], vin8: ["A"], trim: ["SEL", "Limited"], drive: "RWD", packVariant: "Long Range",
    range: { epaRangeMi: f(291, "mfr", "high", "MY2025 Long Range RWD on 20-inch wheels (SEL, Limited), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48363") },
    charging: PORT_CCS,
    warranty: HK_WARRANTY,
  },
  {
    id: "i6-2025-lr-awd-18", ...H6, modelYears: [2025, 2025], vin8: ["C"], trim: "SE", drive: "AWD", packVariant: "Long Range",
    range: { epaRangeMi: f(316, "mfr", "high", "MY2025 Long Range AWD on the SE 18-inch wheels, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48361") },
    charging: PORT_CCS,
    warranty: HK_WARRANTY,
  },
  {
    id: "i6-2025-lr-awd-20", ...H6, modelYears: [2025, 2025], vin8: ["C"], trim: ["SEL", "Limited"], drive: "AWD", packVariant: "Long Range",
    range: { epaRangeMi: f(270, "mfr", "high", "MY2025 Long Range AWD on 20-inch wheels (SEL, Limited), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48365") },
    charging: PORT_CCS,
    warranty: HK_WARRANTY,
  },
  {
    id: "i9-2026-rwd", ...H9, modelYears: [2026, 2026], vin8: ["1"], drive: "RWD", packVariant: "Long Range",
    battery: { packGrossKwh: f(110.3, "mfr", "high", undefined, "https://www.hyundainews.com/assets/documents/original/65341-2026IONIQ9SpecsFeatures20250305.pdf") },
    range: { epaRangeMi: f(335, "mfr", "high", "MY2026 IONIQ 9 RWD (VIN code 1), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49661") },
    charging: { portStandard: f<"NACS">("NACS", "agg", "high", "Native NACS port from launch") },
    warranty: HK_WARRANTY,
  },
  {
    id: "i9-2026-awd", ...H9, modelYears: [2026, 2026], vin8: ["3"], drive: "AWD", packVariant: "Long Range",
    battery: { packGrossKwh: f(110.3, "mfr", "high", undefined, "https://www.hyundainews.com/assets/documents/original/65341-2026IONIQ9SpecsFeatures20250305.pdf") },
    range: { epaRangeMi: f(320, "mfr", "high", "MY2026 IONIQ 9 AWD (VIN code 3), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49662") },
    charging: { portStandard: f<"NACS">("NACS", "agg", "high", "Native NACS port from launch") },
    warranty: HK_WARRANTY,
  },
  {
    id: "i9-2026-awd-perf", ...H9, modelYears: [2026, 2026], vin8: ["5"], drive: "AWD", packVariant: "Long Range",
    battery: { packGrossKwh: f(110.3, "mfr", "high", undefined, "https://www.hyundainews.com/assets/documents/original/65341-2026IONIQ9SpecsFeatures20250305.pdf") },
    range: { epaRangeMi: f(311, "mfr", "high", "MY2026 IONIQ 9 AWD Performance (VIN code 5, incl. Calligraphy), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49663") },
    charging: { portStandard: f<"NACS">("NACS", "agg", "high", "Native NACS port from launch") },
    warranty: HK_WARRANTY,
  },
  {
    id: "kona-2019-23", ...KONA, modelYears: [2019, 2023], vin8: ["G"], drive: "FWD", packVariant: "64 kWh",
    battery: { packGrossKwh: f(64, "mfr", "high") },
    range: { epaRangeMi: f(258, "mfr", "high", "Gen-1 Kona Electric (VIN code G), one rating across 2019–23, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46000") },
    charging: PORT_CCS,
    warranty: HK_WARRANTY,
  },
  {
    id: "kona-2024-lr", ...KONA, modelYears: [2024, 2024], vin8: ["6"], drive: "FWD", packVariant: "Long Range",
    range: { epaRangeMi: f(261, "mfr", "high", "MY2024 Long Range (VIN code 6), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47449") },
    charging: PORT_CCS,
    warranty: HK_WARRANTY,
  },
  {
    id: "kona-2025-lr", ...KONA, modelYears: [2025, 2025], vin8: ["6"], drive: "FWD", packVariant: "Long Range",
    range: { epaRangeMi: f(261, "mfr", "high", "MY2025 Long Range (VIN code 6) on 17-inch wheels, EPA; the N Line 19-inch wheels rate 230", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48357") },
    charging: PORT_CCS,
    warranty: HK_WARRANTY,
  },
  {
    id: "kona-2025-lr-nline", ...KONA, modelYears: [2025, 2025], vin8: ["6"], trim: "N Line", drive: "FWD", packVariant: "Long Range",
    range: { epaRangeMi: f(230, "mfr", "high", "MY2025 Long Range, N Line (19-inch wheels), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48358") },
    charging: PORT_CCS,
    warranty: HK_WARRANTY,
  },
  {
    id: "kona-2024-25-sr", ...KONA, modelYears: [2024, 2025], vin8: ["7"], drive: "FWD", packVariant: "Standard Range",
    battery: { packGrossKwh: f(48.6, "agg", "medium") },
    range: { epaRangeMi: f(200, "mfr", "high", "Standard Range (VIN code 7, the 99 kW motor), EPA, same rating both years", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47831") },
    charging: PORT_CCS,
    warranty: HK_WARRANTY,
  },
  {
    id: "prologue-2025-26-awd-elite", make: "HONDA", model: "Prologue", modelYears: [2025, 2026], trim: "Elite", drive: "AWD",
    range: { epaRangeMi: f(283, "mfr", "high", "AWD Elite, EPA certifies it separately from the other AWD trims (294 mi)", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49090") },
    charging: PORT_CCS,
  },

  {
    id: "i4-2024-edrive35", ...I4, modelYears: [2024, 2024], trim: "eDrive35", drive: "RWD",
    battery: { packUsableKwh: f(67.1, "mfr", "high", "70.2 kWh gross") },
    range: { epaRangeMi: f(276, "mfr", "high", "MY2024 eDrive35 on 18-inch wheels, EPA; 252 on 19s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46919") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },
  {
    id: "i4-2025-edrive35", ...I4, modelYears: [2025, 2025], trim: "eDrive35", drive: "RWD",
    battery: { packUsableKwh: f(67.1, "mfr", "high", "70.2 kWh gross") },
    range: { epaRangeMi: f(266, "mfr", "high", "MY2025 eDrive35 on 18-inch wheels, EPA; 244 on 19s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48308") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },
  {
    id: "i4-2025-edrive40", ...I4, modelYears: [2025, 2025], trim: "eDrive40", drive: "RWD",
    battery: { packUsableKwh: f(81.5, "mfr", "high", "83.9 kWh gross") },
    range: { epaRangeMi: f(318, "mfr", "high", "MY2025 eDrive40 on 18-inch wheels, EPA; 295 on 19s. Up from 301 in 2022–24", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48310") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },
  {
    id: "i4-2024-xdrive40", ...I4, modelYears: [2024, 2024], trim: "xDrive40", drive: "AWD",
    battery: { packUsableKwh: f(81.5, "mfr", "high", "83.9 kWh gross") },
    range: { epaRangeMi: f(307, "mfr", "high", "MY2024 xDrive40 on 18-inch wheels, EPA; 279 on 19s. 2025 dropped to 287", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46917") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },
  {
    id: "i4-2026-edrive35", ...I4, modelYears: [2026, 2026], trim: "eDrive35", drive: "RWD",
    battery: { packUsableKwh: f(67.1, "mfr", "high", "70.2 kWh gross") },
    range: { epaRangeMi: f(251, "mfr", "high", "MY2026 eDrive35 (19-inch wheels, the only certified configuration), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50187") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },
  {
    id: "i4-2026-edrive40", ...I4, modelYears: [2026, 2026], trim: "eDrive40", drive: "RWD",
    battery: { packUsableKwh: f(81.5, "mfr", "high", "83.9 kWh gross") },
    range: { epaRangeMi: f(333, "mfr", "high", "MY2026 eDrive40 on 18-inch wheels, EPA; 307 on 19s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50188") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },
  {
    id: "i4-2026-xdrive40", ...I4, modelYears: [2026, 2026], trim: "xDrive40", drive: "AWD",
    battery: { packUsableKwh: f(81.5, "mfr", "high", "83.9 kWh gross") },
    range: { epaRangeMi: f(287, "mfr", "high", "MY2026 xDrive40 on 18-inch wheels, EPA; 268 on 19s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50192") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },
  {
    id: "i4-2026-m60", ...I4, modelYears: [2026, 2026], trim: "M60", drive: "AWD",
    battery: { packUsableKwh: f(81.5, "mfr", "high", "83.9 kWh gross") },
    range: { epaRangeMi: f(278, "mfr", "high", "MY2026 M60 xDrive (replaces the M50) on 19-inch wheels, EPA; 232 on 20s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50190") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },
  {
    id: "i5-2024-25-edrive40", ...I5, modelYears: [2024, 2025], trim: "eDrive40", drive: "RWD",
    battery: { packUsableKwh: f(81.5, "mfr", "high", "83.9 kWh gross") },
    range: { epaRangeMi: f(295, "mfr", "high", "MY2024–25 i5 eDrive40 on 19-inch wheels, EPA; 270–278 on 20/21s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46923") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },
  {
    id: "i5-2025-xdrive40", ...I5, modelYears: [2025, 2025], trim: "xDrive40", drive: "AWD",
    range: { epaRangeMi: f(266, "mfr", "high", "MY2025 i5 xDrive40 on 19-inch wheels, EPA; 248–262 on 20/21s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48322") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },
  {
    id: "i5-2024-m60", ...I5, modelYears: [2024, 2024], trim: "M60", drive: "AWD",
    range: { epaRangeMi: f(256, "mfr", "high", "MY2024 i5 M60 xDrive on 19-inch wheels, EPA; 240–248 on 20/21s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46926") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },
  {
    id: "i5-2025-m60", ...I5, modelYears: [2025, 2025], trim: "M60", drive: "AWD",
    range: { epaRangeMi: f(253, "mfr", "high", "MY2025 i5 M60 xDrive on 19-inch wheels, EPA; 239–250 on 20/21s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48319") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },
  {
    id: "i5-2026-edrive40", ...I5, modelYears: [2026, 2026], trim: "eDrive40", drive: "RWD",
    battery: { packUsableKwh: f(81.5, "mfr", "high", "83.9 kWh gross") },
    range: { epaRangeMi: f(310, "mfr", "high", "MY2026 i5 eDrive40 on 19-inch wheels, EPA; 278–300 on 20/21s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49613") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },
  {
    id: "i5-2026-xdrive40", ...I5, modelYears: [2026, 2026], trim: "xDrive40", drive: "AWD",
    range: { epaRangeMi: f(278, "mfr", "high", "MY2026 i5 xDrive40 on 19-inch wheels, EPA; 259–272 on 20/21s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49616") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },
  {
    id: "i5-2026-m60", ...I5, modelYears: [2026, 2026], trim: "M60", drive: "AWD",
    range: { epaRangeMi: f(277, "mfr", "high", "MY2026 i5 M60 xDrive on 19-inch wheels, EPA; 259–266 on 20/21s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50194") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },
  {
    id: "i7-2023-xdrive60", ...I7, modelYears: [2023, 2023], trim: "xDrive60", drive: "AWD",
    range: { epaRangeMi: f(318, "mfr", "high", "MY2023 i7 xDrive60 on 19-inch wheels, EPA; 296–308 on 20/21s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=45993") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },
  {
    id: "i7-2024-edrive50", ...I7, modelYears: [2024, 2024], trim: "eDrive50", drive: "RWD",
    range: { epaRangeMi: f(321, "mfr", "high", "MY2024 i7 eDrive50 on 19-inch wheels, EPA; 301–311 on 20/21s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46929") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },
  {
    id: "i7-2024-xdrive60", ...I7, modelYears: [2024, 2024], trim: "xDrive60", drive: "AWD",
    range: { epaRangeMi: f(317, "mfr", "high", "MY2024 i7 xDrive60 on 19-inch wheels, EPA; 298–307 on 20/21s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46934") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },
  {
    id: "i7-2024-m70", ...I7, modelYears: [2024, 2024], trim: "M70", drive: "AWD",
    range: { epaRangeMi: f(274, "mfr", "high", "MY2024 i7 M70 xDrive on 20-inch wheels, EPA; 291 on 21s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46932") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },
  {
    id: "i7-2025-26-edrive50", ...I7, modelYears: [2025, 2026], trim: "eDrive50", drive: "RWD",
    range: { epaRangeMi: f(314, "mfr", "high", "MY2025–26 i7 eDrive50 on 19-inch wheels, EPA; 301–307 on 20/21s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48325") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },
  {
    id: "i7-2025-26-xdrive60", ...I7, modelYears: [2025, 2026], trim: "xDrive60", drive: "AWD",
    range: { epaRangeMi: f(311, "mfr", "high", "MY2025–26 i7 xDrive60 on 19-inch wheels, EPA; 296–308 on 20/21s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48330") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },
  {
    id: "i7-2025-26-m70", ...I7, modelYears: [2025, 2026], trim: "M70", drive: "AWD",
    range: { epaRangeMi: f(268, "mfr", "high", "MY2025–26 i7 M70 xDrive on 20-inch wheels, EPA (267 for 2026); 285 on 21s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48328") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },
  {
    id: "ix-2022-23-xdrive50", ...IX, modelYears: [2022, 2023], trim: "xDrive50", drive: "AWD",
    battery: { packGrossKwh: f(111.5, "mfr", "high"), packUsableKwh: f(106.3, "mfr", "high") },
    range: { epaRangeMi: f(324, "mfr", "high", "MY2022–23 iX xDrive50 on 20-inch wheels, EPA; 305–315 on 21/22s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=45135") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },
  {
    id: "ix-2024-25-xdrive40", ...IX, modelYears: [2024, 2025], trim: "xDrive40", drive: "AWD",
    range: { epaRangeMi: f(217, "mfr", "high", "20-inch wheels, standard", epa(46939)) },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },
  {
    id: "ix-2024-m60", ...IX, modelYears: [2024, 2024], trim: "M60", drive: "AWD",
    battery: { packGrossKwh: f(111.5, "mfr", "high"), packUsableKwh: f(106.3, "mfr", "high") },
    range: { epaRangeMi: f(296, "mfr", "high", "MY2024 iX M60, EPA, both wheel sizes", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46937") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },
  {
    id: "ix-2025-m60", ...IX, modelYears: [2025, 2025], trim: "M60", drive: "AWD",
    battery: { packGrossKwh: f(111.5, "mfr", "high"), packUsableKwh: f(106.3, "mfr", "high") },
    range: { epaRangeMi: f(284, "mfr", "high", "MY2025 iX M60, EPA; 285 on 22s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48333") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },
  {
    id: "ix-2026-xdrive45", ...IX, modelYears: [2026, 2026], trim: "xDrive45", drive: "AWD",
    range: { epaRangeMi: f(312, "mfr", "high", "MY2026 iX xDrive45 (facelift) on 20-inch wheels, EPA; 279–297 on larger wheels", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49619") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },
  {
    id: "ix-2026-xdrive60", ...IX, modelYears: [2026, 2026], trim: "xDrive60", drive: "AWD",
    range: { epaRangeMi: f(364, "mfr", "high", "MY2026 iX xDrive60 (facelift) on 20-inch wheels, EPA; 318–341 on larger wheels", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49623") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },

  {
    id: "i5-2027-edrive40", ...I5, modelYears: [2027, 2027], trim: "eDrive40", drive: "RWD",
    battery: { packUsableKwh: f(81.5, "mfr", "high", "83.9 kWh gross") },
    range: { epaRangeMi: f(328, "mfr", "high", "MY2027 i5 eDrive40 on 19-inch wheels, EPA; 280–299 on 20/21s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50360") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },
  {
    id: "i5-2027-xdrive40", ...I5, modelYears: [2027, 2027], trim: "xDrive40", drive: "AWD",
    range: { epaRangeMi: f(283, "mfr", "high", "MY2027 i5 xDrive40 on 19-inch wheels, EPA; 262–273 on 20/21s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50603") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },
  {
    id: "i7-2027-xdrive50", ...I7, modelYears: [2027, 2027], trim: ["xDrive50", "50 xDrive"], drive: "AWD",
    range: { epaRangeMi: f(354, "mfr", "high", "MY2027 i7 xDrive50, EPA; 364 on 21-inch summer tires", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50604") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },
  {
    id: "i7-2027-xdrive60", ...I7, modelYears: [2027, 2027], trim: ["xDrive60", "60 xDrive"], drive: "AWD",
    range: { epaRangeMi: f(344, "mfr", "high", "MY2027 i7 xDrive60, EPA; 348–362 on summer tires", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50607") },
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
    battery: { packGrossKwh: f(102, "mfr", "medium") },
    range: { epaRangeMi: f(305, "mfr", "high", "Vistiq (AWD-only), EPA, same rating 2026–27; 300 with the 19 kW onboard-charger option", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49636") },
    charging: { portStandard: f("CCS1", "mfr") },
    warranty: { batteryYears: f(8, "mfr" as Source), batteryMiles: f(100_000, "mfr" as Source), batteryTransfers: f(true, "mfr" as Source) },
  },
  {
    id: "cadillac-optiq-2025", make: "CADILLAC", model: "Optiq", modelYears: [2025, 2025], drive: "AWD",
    battery: { packGrossKwh: f(85, "mfr", "high") },
    range: { epaRangeMi: f(302, "mfr", "medium", "GM-estimated, fueleconomy.gov has no MY2025 Optiq entry under any spelling (control: the MY2026 records are present); every MY2025 Optiq is dual-motor AWD") },
    charging: { portStandard: f("CCS1", "mfr") },
    warranty: { batteryYears: f(8, "mfr" as Source), batteryMiles: f(100_000, "mfr" as Source), batteryTransfers: f(true, "mfr" as Source) },
  },
  {
    id: "id4-2025-rwd-pro", make: "VOLKSWAGEN", model: "ID.4", modelYears: [2025, 2025], trim: ["Pro", "Pro S", "Pro S Plus"], drive: "RWD", ignoreKwhHint: true,
    battery: { packUsableKwh: f(77, "mfr", "high", "82 kWh gross / 77 usable, the Pro pack") },
    range: { epaRangeMi: f(291, "mfr", "high", "MY2025 ID.4 Pro / Pro S RWD, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49156") },
    charging: { portStandard: f("CCS1", "mfr") },
    warranty: { batteryYears: f(8, "mfr" as Source), batteryMiles: f(100_000, "mfr" as Source), batteryTransfers: f(true, "mfr" as Source) },
  },
  {
    id: "id4-2025-awd-pro", make: "VOLKSWAGEN", model: "ID.4", modelYears: [2025, 2025], trim: ["Pro", "Pro S", "Pro S Plus", "1st Edition"], drive: "AWD", ignoreKwhHint: true,
    battery: { packUsableKwh: f(77, "mfr", "high", "82 kWh gross / 77 usable, the Pro pack") },
    range: { epaRangeMi: f(263, "mfr", "high", "MY2025 ID.4 AWD Pro / Pro S, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48773") },
    charging: { portStandard: f("CCS1", "mfr") },
    warranty: { batteryYears: f(8, "mfr" as Source), batteryMiles: f(100_000, "mfr" as Source), batteryTransfers: f(true, "mfr" as Source) },
  },
  {
    id: "id4-2025-standard", make: "VOLKSWAGEN", model: "ID.4", modelYears: [2025, 2025], trim: ["Standard", "S"], drive: "RWD", ignoreKwhHint: true,
    battery: { packUsableKwh: f(58, "mfr", "high", "62 kWh gross / 58 usable, the Standard pack") },
    range: { epaRangeMi: f(206, "mfr", "high", "MY2025 ID.4 / ID.4 S (62 kWh Standard pack), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49155") },
    charging: { portStandard: f("CCS1", "mfr") },
    warranty: { batteryYears: f(8, "mfr" as Source), batteryMiles: f(100_000, "mfr" as Source), batteryTransfers: f(true, "mfr" as Source) },
  },
  {
    id: "id4-2026-rwd", make: "VOLKSWAGEN", model: "ID.4", modelYears: [2026, 2026], drive: "RWD", ignoreKwhHint: true,
    battery: { packUsableKwh: f(77, "mfr", "high", "82 kWh gross / 77 usable, MY2026 dropped the Standard pack") },
    range: { epaRangeMi: f(291, "mfr", "high", "MY2026 ID.4 RWD, EPA (the Standard pack is gone; one RWD rating)", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49987") },
    charging: { portStandard: f("CCS1", "mfr") },
    warranty: { batteryYears: f(8, "mfr" as Source), batteryMiles: f(100_000, "mfr" as Source), batteryTransfers: f(true, "mfr" as Source) },
  },
  {
    id: "id4-2026-awd", make: "VOLKSWAGEN", model: "ID.4", modelYears: [2026, 2026], drive: "AWD", ignoreKwhHint: true,
    battery: { packUsableKwh: f(77, "mfr", "high", "82 kWh gross / 77 usable") },
    range: { epaRangeMi: f(263, "mfr", "high", "MY2026 ID.4 AWD, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49988") },
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
    range: { epaRangeMi: f(73, "mfr", "high", "MY2011–12 (24 kWh), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=30979") },
    charging: { portStandard: f("CHAdeMO", "mfr", "high", "DC fast charging was optional on early cars; the port is CHAdeMO where fitted") },
    thermal: { heatPump: f("none", "mfr") },
  },
  {
    id: "leaf-2013", make: "NISSAN", model: "Leaf", modelYears: [2013, 2013],
    battery: { packGrossKwh: f(24, "mfr", "high") },
    range: { epaRangeMi: f(75, "mfr", "high", "MY2013 (24 kWh), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=33558") },
    charging: { portStandard: f("CHAdeMO", "mfr", "high", "DC fast charging optional (standard on SV/SL); CHAdeMO where fitted") },
    thermal: { heatPump: f("standard", "mfr", "high", "Hybrid heat pump system from MY2013 (SV/SL)") },
  },
  {
    id: "leaf-2016-s", make: "NISSAN", model: "Leaf", modelYears: [2016, 2016], trim: "S",
    battery: { packGrossKwh: f(24, "mfr", "high", "The S kept the 24 kWh pack in 2016; SV/SL moved to 30 kWh") },
    range: { epaRangeMi: f(84, "mfr", "high", "MY2016 S (24 kWh), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=37066") },
    charging: { portStandard: f("CHAdeMO", "mfr") },
  },
  {
    id: "leaf-2016-sv-sl", make: "NISSAN", model: "Leaf", modelYears: [2016, 2016], trim: ["SV", "SL"],
    battery: { packGrossKwh: f(30, "mfr", "high") },
    range: { epaRangeMi: f(107, "mfr", "high", "MY2016 SV/SL (30 kWh), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=37067") },
    charging: { portStandard: f("CHAdeMO", "mfr") },
  },
  {
    id: "leaf-2017", make: "NISSAN", model: "Leaf", modelYears: [2017, 2017],
    battery: { packGrossKwh: f(30, "mfr", "high") },
    range: { epaRangeMi: f(107, "mfr", "high", "MY2017 (30 kWh standard), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=38428") },
    charging: { portStandard: f("CHAdeMO", "mfr") },
  },
  {
    id: "leaf-2026-splus", make: "NISSAN", model: "Leaf", modelYears: [2026, 2026], vin8: ["A"], trim: ["S+", "S"],
    battery: { packGrossKwh: f(75, "mfr", "high") },
    range: { epaRangeMi: f(303, "mfr", "high", "MY2026 LEAF S+ (75 kWh, 18-inch steel wheels), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49975") },
    charging: { portStandard: f("NACS", "mfr", "high", "First LEAF with a native NACS port") },
    warranty: { batteryYears: f(8, "mfr" as Source), batteryMiles: f(100_000, "mfr" as Source) },
  },
  {
    id: "leaf-2026-svplus", make: "NISSAN", model: "Leaf", modelYears: [2026, 2026], vin8: ["A"], trim: ["SV+", "SV"],
    battery: { packGrossKwh: f(75, "mfr", "high") },
    range: { epaRangeMi: f(288, "mfr", "high", "MY2026 LEAF SV+ (75 kWh, 18-inch alloys), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49974") },
    charging: { portStandard: f("NACS", "mfr", "high", "First LEAF with a native NACS port") },
    warranty: { batteryYears: f(8, "mfr" as Source), batteryMiles: f(100_000, "mfr" as Source) },
  },
  {
    id: "leaf-2026-platinum", make: "NISSAN", model: "Leaf", modelYears: [2026, 2026], vin8: ["B"],
    battery: { packGrossKwh: f(75, "mfr", "high") },
    range: { epaRangeMi: f(259, "mfr", "high", "MY2026 LEAF Platinum+ (VIN code B; 19-inch wheels), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49976") },
    charging: { portStandard: f("NACS", "mfr", "high", "First LEAF with a native NACS port") },
    warranty: { batteryYears: f(8, "mfr" as Source), batteryMiles: f(100_000, "mfr" as Source) },
  },
  {
    id: "xc40-recharge-2021", make: "VOLVO", model: "XC40 Recharge Pure Electric", modelYears: [2021, 2021], drive: "AWD",
    range: { epaRangeMi: f(208, "mfr", "high", "MY2021 XC40 Recharge (twin motor, the only version), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=43295") },
    charging: { portStandard: f("CCS1", "mfr") },
  },
  {
    id: "xc40-recharge-2022-23", make: "VOLVO", model: "XC40 Recharge Pure Electric", modelYears: [2022, 2023], drive: "AWD",
    range: { epaRangeMi: f(223, "mfr", "high", "MY2022–23 XC40 Recharge Twin, EPA; every US 2022–23 car is the twin-motor", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=44450") },
    charging: { portStandard: f("CCS1", "mfr") },
  },
  {
    id: "xc40-recharge-2024-single", make: "VOLVO", model: "XC40 Recharge Pure Electric", modelYears: [2024, 2024], vin8: ["K"], drive: "RWD",
    range: { epaRangeMi: f(293, "mfr", "high", "MY2024 single-motor extended range (VIN code K, Volvo's Part 565 text names it eRWD Single Motor), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46981") },
    charging: { portStandard: f("CCS1", "mfr") },
  },
  {
    id: "xc40-recharge-2024-twin", make: "VOLVO", model: "XC40 Recharge Pure Electric", modelYears: [2024, 2024], vin8: ["M"], drive: "AWD",
    range: { epaRangeMi: f(254, "mfr", "high", "MY2024 Twin Motor, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46983") },
    charging: { portStandard: f("CCS1", "mfr") },
  },
  {
    id: "c40-recharge-2022-23", make: "VOLVO", model: "C40 Recharge Pure Electric", modelYears: [2022, 2023], drive: "AWD",
    range: { epaRangeMi: f(226, "mfr", "high", "MY2022–23 C40 Recharge Twin, EPA; every US 2022–23 car is the twin-motor", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=44929") },
    charging: { portStandard: f("CCS1", "mfr") },
  },
  {
    id: "c40-recharge-2024-single", make: "VOLVO", model: "C40 Recharge Pure Electric", modelYears: [2024, 2024], vin8: ["K"], drive: "RWD",
    range: { epaRangeMi: f(297, "mfr", "high", "MY2024 single-motor extended range (VIN code K), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46980") },
    charging: { portStandard: f("CCS1", "mfr") },
  },
  {
    id: "c40-recharge-2024-twin", make: "VOLVO", model: "C40 Recharge Pure Electric", modelYears: [2024, 2024], vin8: ["M"], drive: "AWD",
    range: { epaRangeMi: f(257, "mfr", "high", "MY2024 Twin (VIN code M), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46982") },
    charging: { portStandard: f("CCS1", "mfr") },
  },
  {
    id: "ex30-2025-single", make: "VOLVO", model: "EX30", modelYears: [2025, 2025], trim: ["Single Motor"], drive: "RWD",
    battery: { packGrossKwh: f(69, "vin", "high"), chemistry: f("NMC", "vin", "high") },
    range: { epaRangeMi: f(257, "mfr", "high", "MY2025 EX30 Single Motor Extended Range on 18-inch wheels, EPA; 261 on 19/20s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48449") },
    charging: { portStandard: f("CCS1", "mfr") },
  },
  {
    id: "ex30-2026-single", make: "VOLVO", model: "EX30", modelYears: [2026, 2026], trim: ["Single Motor"], drive: "RWD",
    battery: { packGrossKwh: f(69, "vin", "high"), chemistry: f("NMC", "vin", "high") },
    range: { epaRangeMi: f(261, "mfr", "high", "MY2026 EX30 Single Motor Extended Range, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49989") },
    charging: { portStandard: f("CCS1", "mfr") },
  },
  {
    id: "ex30-2025-26-twin", make: "VOLVO", model: "EX30", modelYears: [2025, 2026], trim: ["Twin", "Ultra"], drive: "AWD",
    battery: { packGrossKwh: f(69, "vin", "high"), chemistry: f("NMC", "vin", "high") },
    range: { epaRangeMi: f(253, "mfr", "high", "19-inch wheels, standard", epa(48775)) },
    charging: { portStandard: f("CCS1", "mfr") },
  },
  {
    id: "ex30-cc-2026", make: "VOLVO", model: "EX30 Cross Country", modelYears: [2026, 2026], drive: "AWD",
    battery: { packGrossKwh: f(69, "vin", "high"), chemistry: f("NMC", "vin", "high") },
    range: { epaRangeMi: f(227, "mfr", "high", "MY2026 EX30 Cross Country on its standard 19-inch wheels, EPA; 203 on 18s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49991") },
    charging: { portStandard: f("CCS1", "mfr") },
  },
  {
    id: "chr-bev-2026", make: "TOYOTA", model: "C-HR", modelYears: [2026, 2026], drive: "AWD",
    battery: { packGrossKwh: f(74.7, "agg", "medium") },
    range: { epaRangeMi: f(287, "mfr", "high", "MY2026 C-HR BEV (AWD-only) on 18-inch wheels, EPA; 273 on 20s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50307") },
    charging: { portStandard: f("NACS", "agg", "high", "Native NACS port from launch") },
  },
  {
    id: "wagoneer-s-2025-26", make: "JEEP", model: "Wagoneer S", modelYears: [2025, 2026], drive: "AWD",
    battery: { packGrossKwh: f(100, "agg", "medium") },
    // No epaRangeMi. EPA certifies the Wagoneer S twice and separates the two
    // only by TIRE SUPPLIER — "Wagoneer S AWD (Falken tire)" against
    // "(Pirelli tire)" — 294 against 262 in MY2025 and 268 in MY2026, and 303
    // against 270 in MY2024. That is not an option a buyer picks, it is not in
    // the trim (the feed says Limited or Launch Edition), it is not in the VIN,
    // and vPIC carries no tire field, so nothing on a listing can tell the two
    // apart. Jeep's own "up to 294 miles" is a best case, not a standard
    // configuration. Printing 294 risks overstating by 32 on an unknown share
    // of 304 live cars, which is the direction that costs a shopper money;
    // printing the lower understates by as much, and the printed figure is the
    // browse filter's minRange. Same call as the bZ Woodland, where 21 miles
    // of unknowable spread also went silent.
    charging: { portStandard: f("CCS1", "mfr") },
  },
  {
    id: "wagoneer-s-2024", make: "JEEP", model: "Wagoneer S", modelYears: [2024, 2024], drive: "AWD",
    battery: { packGrossKwh: f(100, "agg", "medium") },
    // No epaRangeMi. EPA certifies the Wagoneer S twice and separates the two
    // only by TIRE SUPPLIER — "Wagoneer S AWD (Falken tire)" against
    // "(Pirelli tire)" — 294 against 262 in MY2025 and 268 in MY2026, and 303
    // against 270 in MY2024. That is not an option a buyer picks, it is not in
    // the trim (the feed says Limited or Launch Edition), it is not in the VIN,
    // and vPIC carries no tire field, so nothing on a listing can tell the two
    // apart. Jeep's own "up to 294 miles" is a best case, not a standard
    // configuration. Printing 294 risks overstating by 32 on an unknown share
    // of 304 live cars, which is the direction that costs a shopper money;
    // printing the lower understates by as much, and the printed figure is the
    // browse filter's minRange. Same call as the bZ Woodland, where 21 miles
    // of unknowable spread also went silent.
    charging: { portStandard: f("CCS1", "mfr") },
  },
  {
    // Keyed on the V's own descriptor (1GYXP against an ordinary Lyriq's
    // 1GYKP), not on its trim. "V Sport" was in this row's trim array, and
    // trimStringsOverlap is substring-tolerant both ways, so it swallowed
    // every listing whose trim read only "Sport" — 878 ordinary AWD Lyriqs
    // (520 MY2026, 358 MY2027) were printing the V-Series' 285 mi and no pack
    // size at all. The trim key is gone rather than curated: all 327 live V
    // listings are 1GYXP and all 5,283 ordinary ones are 1GYKP, so the
    // descriptor settles it outright — and a trim key would have gone on
    // refusing the 21 real V cars whose trim field reads "-V" or a bare "V",
    // both below trimStringsOverlap's three-character floor.
    id: "lyriq-v-2026-27", make: "CADILLAC", model: "Lyriq", modelYears: [2026, 2027], vin8: ["L"], vds: ["XP"], drive: "AWD",
    range: { epaRangeMi: f(285, "mfr", "high", undefined, "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49633") },
    charging: { portStandard: f("CCS1", "mfr") },
    warranty: { batteryYears: f(8, "mfr" as Source), batteryMiles: f(100_000, "mfr" as Source), batteryTransfers: f(true, "mfr" as Source) },
  },

  {
    id: "ms-2021-23-lr", ...MS, modelYears: [2021, 2023], vin8: ["5"], drive: "AWD", packVariant: "Long Range",
    battery: TSX_PACK,
    range: { epaRangeMi: f(405, "mfr", "high", "MY2021–23 Model S (dual-motor VIN code 5), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=44051") },
    charging: TSX_CHARGING,
    thermal: { heatPump: f("standard", "mfr"), batteryPreconditioning: f(true, "mfr") },
    warranty: TSX_W,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "ms-2024-lr", ...MS, modelYears: [2024, 2024], vin8: ["5"], drive: "AWD", packVariant: "Long Range",
    battery: TSX_PACK,
    range: { epaRangeMi: f(402, "mfr", "high", "MY2024 Model S (dual-motor VIN code 5), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47910") },
    charging: TSX_CHARGING,
    thermal: { heatPump: f("standard", "mfr"), batteryPreconditioning: f(true, "mfr") },
    warranty: TSX_W,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "ms-2025-26-lr", ...MS, modelYears: [2025, 2026], vin8: ["5"], drive: "AWD", packVariant: "Long Range",
    battery: TSX_PACK,
    range: { epaRangeMi: f(410, "mfr", "high", "MY2025–26 Model S (dual-motor VIN code 5), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49124") },
    charging: TSX_CHARGING,
    thermal: { heatPump: f("standard", "mfr"), batteryPreconditioning: f(true, "mfr") },
    warranty: TSX_W,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "ms-2021-plaid", ...MS, modelYears: [2021, 2021], vin8: ["6"], drive: "AWD", packVariant: "Plaid",
    battery: TSX_PACK,
    range: { epaRangeMi: f(348, "mfr", "high", "MY2021 Plaid (tri-motor VIN code 6) on 21-inch wheels, the only 2021 Plaid certification, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=44069") },
    charging: TSX_CHARGING,
    thermal: { heatPump: f("standard", "mfr"), batteryPreconditioning: f(true, "mfr") },
    warranty: TSX_W,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "ms-2022-23-plaid", ...MS, modelYears: [2022, 2023], vin8: ["6"], drive: "AWD", packVariant: "Plaid",
    battery: TSX_PACK,
    range: { epaRangeMi: f(396, "mfr", "high", "MY2022–23 Plaid (tri-motor VIN code 6) on 19-inch wheels, EPA; 348 on 21s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=45015") },
    charging: TSX_CHARGING,
    thermal: { heatPump: f("standard", "mfr"), batteryPreconditioning: f(true, "mfr") },
    warranty: TSX_W,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "ms-2024-plaid", ...MS, modelYears: [2024, 2024], vin8: ["6"], drive: "AWD", packVariant: "Plaid",
    battery: TSX_PACK,
    range: { epaRangeMi: f(359, "mfr", "high", "MY2024 Plaid on 19-inch wheels, EPA; 320 on 21s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47911") },
    charging: TSX_CHARGING,
    thermal: { heatPump: f("standard", "mfr"), batteryPreconditioning: f(true, "mfr") },
    warranty: TSX_W,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "ms-2025-plaid", ...MS, modelYears: [2025, 2025], vin8: ["6"], drive: "AWD", packVariant: "Plaid",
    battery: TSX_PACK,
    range: { epaRangeMi: f(348, "mfr", "high", "MY2025 Plaid on 19-inch wheels, EPA; 312 on 21s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48766") },
    charging: TSX_CHARGING,
    thermal: { heatPump: f("standard", "mfr"), batteryPreconditioning: f(true, "mfr") },
    warranty: TSX_W,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "ms-2026-plaid", ...MS, modelYears: [2026, 2026], vin8: ["6"], drive: "AWD", packVariant: "Plaid",
    battery: TSX_PACK,
    range: { epaRangeMi: f(368, "mfr", "high", "MY2026 Plaid, EPA; 309 on 21-inch wheels", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49742") },
    charging: TSX_CHARGING,
    thermal: { heatPump: f("standard", "mfr"), batteryPreconditioning: f(true, "mfr") },
    warranty: TSX_W,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "ms-2021-perf", ...MS, modelYears: [2021, 2021], vin8: ["4"], drive: "AWD", packVariant: "Performance",
    battery: TSX_PACK,
    range: { epaRangeMi: f(387, "mfr", "high", "MY2021 Performance carryover (dual-performance VIN code 4) on 19-inch wheels, EPA; 334 on 21s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=43516") },
    charging: TSX_CHARGING,
    thermal: { heatPump: f("standard", "mfr"), batteryPreconditioning: f(true, "mfr") },
    warranty: TSX_W,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "mx-2021-lrplus", ...MX, modelYears: [2021, 2021], vin8: ["2"], drive: "AWD", packVariant: "Long Range Plus",
    battery: TSX_PACK,
    range: { epaRangeMi: f(371, "mfr", "high", "MY2021 Model X Long Range Plus carryover (dual-standard VIN code 2), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=43403") },
    charging: TSX_CHARGING,
    thermal: { heatPump: f("standard", "mfr"), batteryPreconditioning: f(true, "mfr") },
    warranty: TSX_W,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "mx-2021-perf", ...MX, modelYears: [2021, 2021], vin8: ["4"], drive: "AWD", packVariant: "Performance",
    battery: TSX_PACK,
    range: { epaRangeMi: f(341, "mfr", "high", "MY2021 Model X Performance carryover (VIN code 4) on 20-inch wheels, EPA; 300 on 22s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=43404") },
    charging: TSX_CHARGING,
    thermal: { heatPump: f("standard", "mfr"), batteryPreconditioning: f(true, "mfr") },
    warranty: TSX_W,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "mx-2022-23-lr", ...MX, modelYears: [2022, 2023], vin8: ["5"], drive: "AWD", packVariant: "Long Range",
    battery: TSX_PACK,
    range: { epaRangeMi: f(348, "mfr", "high", "MY2022–23 Model X (dual-motor VIN code 5), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=45020") },
    charging: TSX_CHARGING,
    thermal: { heatPump: f("standard", "mfr"), batteryPreconditioning: f(true, "mfr") },
    warranty: TSX_W,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "mx-2024-lr", ...MX, modelYears: [2024, 2024], vin8: ["5"], drive: "AWD", packVariant: "Long Range",
    battery: TSX_PACK,
    range: { epaRangeMi: f(335, "mfr", "high", "MY2024 Model X (dual-motor VIN code 5), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47915") },
    charging: TSX_CHARGING,
    thermal: { heatPump: f("standard", "mfr"), batteryPreconditioning: f(true, "mfr") },
    warranty: TSX_W,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "mx-2025-lr", ...MX, modelYears: [2025, 2025], vin8: ["5"], drive: "AWD", packVariant: "Long Range",
    battery: TSX_PACK,
    range: { epaRangeMi: f(329, "mfr", "high", "MY2025 Model X (dual-motor VIN code 5), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49125") },
    charging: TSX_CHARGING,
    thermal: { heatPump: f("standard", "mfr"), batteryPreconditioning: f(true, "mfr") },
    warranty: TSX_W,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "mx-2026-lr", ...MX, modelYears: [2026, 2026], vin8: ["5"], drive: "AWD", packVariant: "Long Range",
    battery: TSX_PACK,
    range: { epaRangeMi: f(352, "mfr", "high", "MY2026 Model X (dual-motor VIN code 5), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49745") },
    charging: TSX_CHARGING,
    thermal: { heatPump: f("standard", "mfr"), batteryPreconditioning: f(true, "mfr") },
    warranty: TSX_W,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "mx-2022-23-plaid", ...MX, modelYears: [2022, 2023], vin8: ["6"], drive: "AWD", packVariant: "Plaid",
    battery: TSX_PACK,
    range: { epaRangeMi: f(333, "mfr", "high", "MY2022–23 Model X Plaid (tri-motor VIN code 6) on 20-inch wheels, EPA; 311 on 22s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=45021") },
    charging: TSX_CHARGING,
    thermal: { heatPump: f("standard", "mfr"), batteryPreconditioning: f(true, "mfr") },
    warranty: TSX_W,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "mx-2024-plaid", ...MX, modelYears: [2024, 2024], vin8: ["6"], drive: "AWD", packVariant: "Plaid",
    battery: TSX_PACK,
    range: { epaRangeMi: f(326, "mfr", "high", "MY2024 Model X Plaid on 20-inch wheels, EPA; 300 on 22s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47916") },
    charging: TSX_CHARGING,
    thermal: { heatPump: f("standard", "mfr"), batteryPreconditioning: f(true, "mfr") },
    warranty: TSX_W,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "mx-2025-plaid", ...MX, modelYears: [2025, 2025], vin8: ["6"], drive: "AWD", packVariant: "Plaid",
    battery: TSX_PACK,
    range: { epaRangeMi: f(314, "mfr", "high", "MY2025 Model X Plaid on 20-inch wheels, EPA; 294 on 22s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48768") },
    charging: TSX_CHARGING,
    thermal: { heatPump: f("standard", "mfr"), batteryPreconditioning: f(true, "mfr") },
    warranty: TSX_W,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "mx-2026-plaid", ...MX, modelYears: [2026, 2026], vin8: ["6"], drive: "AWD", packVariant: "Plaid",
    battery: TSX_PACK,
    range: { epaRangeMi: f(335, "mfr", "high", "MY2026 Model X Plaid, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49746") },
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
    battery: { packGrossKwh: f(78, "vin", "high") },
    range: { epaRangeMi: f(270, "mfr", "high", "MY2022 Single Motor (FWD), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=44928") },
    charging: { portStandard: f("CCS1", "mfr") },
    warranty: { batteryYears: f(8, "mfr" as Source), batteryMiles: f(100_000, "mfr" as Source), batteryTransfers: f(true, "mfr" as Source) },
  },
  {
    id: "polestar2-2022-dual", make: "POLESTAR", model: "Polestar 2", modelYears: [2022, 2022], trim: ["Long Range Dual Motor", "Dual Motor", "Performance", "Plus", "e-AWD"], drive: "AWD",
    battery: { packGrossKwh: f(78, "vin", "high") },
    range: { epaRangeMi: f(249, "mfr", "high", "MY2022 Dual Motor (AWD), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=44449") },
    charging: { portStandard: f("CCS1", "mfr") },
    warranty: { batteryYears: f(8, "mfr" as Source), batteryMiles: f(100_000, "mfr" as Source), batteryTransfers: f(true, "mfr" as Source) },
  },
  {
    id: "polestar2-2023-single", make: "POLESTAR", model: "Polestar 2", modelYears: [2023, 2023], trim: ["Long Range Single Motor", "Single Motor", "Plus"], drive: "FWD",
    battery: { packGrossKwh: f(78, "vin", "high") },
    range: { epaRangeMi: f(270, "mfr", "high", "MY2023 Single Motor (FWD), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=45755") },
    charging: { portStandard: f("CCS1", "mfr") },
    warranty: { batteryYears: f(8, "mfr" as Source), batteryMiles: f(100_000, "mfr" as Source), batteryTransfers: f(true, "mfr" as Source) },
  },
  {
    id: "polestar2-2023-dual", make: "POLESTAR", model: "Polestar 2", modelYears: [2023, 2023], trim: ["Long Range Dual Motor", "Dual Motor", "Performance", "Plus"], drive: "AWD",
    battery: { packGrossKwh: f(78, "vin", "high") },
    range: { epaRangeMi: f(260, "mfr", "high", "MY2023 Dual Motor (AWD), EPA; the Performance Pack rates the same, the BST edition 247", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=45753") },
    charging: { portStandard: f("CCS1", "mfr") },
    warranty: { batteryYears: f(8, "mfr" as Source), batteryMiles: f(100_000, "mfr" as Source), batteryTransfers: f(true, "mfr" as Source) },
  },
  {
    id: "polestar2-2024-25-single", make: "POLESTAR", model: "Polestar 2", modelYears: [2024, 2025], trim: ["Long Range Single Motor", "Single Motor", "Plus"], drive: "RWD",
    battery: { packGrossKwh: f(82, "agg", "medium", "The facelift's larger pack; RWD from MY2024") },
    range: { epaRangeMi: f(320, "mfr", "high", "MY2024 Single Motor (now RWD) on 19-inch wheels, EPA; 307 on 20s; MY2025: 314/300", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46978") },
    charging: { portStandard: f("CCS1", "mfr") },
    warranty: { batteryYears: f(8, "mfr" as Source), batteryMiles: f(100_000, "mfr" as Source), batteryTransfers: f(true, "mfr" as Source) },
  },
  {
    id: "polestar2-2024-25-dual", make: "POLESTAR", model: "Polestar 2", modelYears: [2024, 2025], trim: ["Long Range Dual Motor", "Dual Motor", "Performance", "Plus"], drive: "AWD",
    battery: { packGrossKwh: f(82, "agg", "medium") },
    range: { epaRangeMi: f(276, "mfr", "high", "MY2024 Dual Motor on 19-inch wheels, EPA; 266 on 20s, 247 with the Performance Pack; MY2025: 278/268/254", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46975") },
    charging: { portStandard: f("CCS1", "mfr") },
    warranty: { batteryYears: f(8, "mfr" as Source), batteryMiles: f(100_000, "mfr" as Source), batteryTransfers: f(true, "mfr" as Source) },
  },
  {
    id: "ex90-2025", make: "VOLVO", model: "EX90", modelYears: [2025, 2025], vin8: ["K", "L"], drive: "AWD",
    battery: { packGrossKwh: f(111, "vin", "high") },
    range: { epaRangeMi: f(300, "mfr", "high", "MY2025 EX90 Twin Motor, EPA; Twin and Twin Performance rate identically (310 on 21-inch wheels)", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48777") },
    charging: { portStandard: f("CCS1", "mfr") },
    warranty: { batteryYears: f(8, "mfr" as Source), batteryMiles: f(100_000, "mfr" as Source), batteryTransfers: f(true, "mfr" as Source) },
  },
  {
    id: "ex90-2026-twin", make: "VOLVO", model: "EX90", modelYears: [2026, 2026], trim: ["Twin Motor", "Twin", "Ultra"], drive: "AWD",
    battery: { packGrossKwh: f(111, "vin", "high") },
    range: { epaRangeMi: f(298, "mfr", "high", "MY2026 EX90 Twin Motor, EPA; 305 on 21-inch wheels; Performance rates the same. Keyed on trim: Volvo\u2019s VIN code is the trim level (K=Plus/L=Ultra), not the motor", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50256") },
    charging: { portStandard: f("CCS1", "mfr") },
    warranty: { batteryYears: f(8, "mfr" as Source), batteryMiles: f(100_000, "mfr" as Source), batteryTransfers: f(true, "mfr" as Source) },
  },
  {
    id: "ex90-2026-single", make: "VOLVO", model: "EX90", modelYears: [2026, 2026], trim: ["Single Motor"], drive: "RWD",
    battery: { packGrossKwh: f(104, "agg", "medium", "The single-motor EX90 uses the smaller pack") },
    range: { epaRangeMi: f(276, "mfr", "high", "MY2026 EX90 Single Motor, EPA; 291 on 21-inch wheels", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50254") },
    charging: { portStandard: f("CCS1", "mfr") },
    warranty: { batteryYears: f(8, "mfr" as Source), batteryMiles: f(100_000, "mfr" as Source), batteryTransfers: f(true, "mfr" as Source) },
  },

  {
    id: "r1s-2022", ...R1S, modelYears: [2022, 2022], drive: "AWD", packVariant: "Quad · Large pack",
    battery: RIV_128,
    range: { epaRangeMi: f(316, "mfr", "high", "MY2022 R1S, every 2022 build is the quad-motor Large pack, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=44461") },
    charging: RIV_PORT1,
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
  },
  {
    id: "r1t-2022", ...R1T, modelYears: [2022, 2022], drive: "AWD", packVariant: "Quad · Large pack",
    battery: RIV_128,
    range: { epaRangeMi: f(314, "mfr", "high", "MY2022 R1T, every 2022 build is the quad-motor Large pack, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=44462") },
    charging: RIV_PORT1,
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
  },
  {
    id: "r1s-2023-quad", ...R1S, modelYears: [2023, 2023], trim: ["Quad Motor", "Quad", "Quad Motor Large Pack"], drive: "AWD", packVariant: "Quad · Large pack",
    battery: RIV_128,
    range: { epaRangeMi: f(321, "mfr", "high", "MY2023 R1S quad-motor on 21-inch wheels, EPA; 274–303 on 20AT/22s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46316") },
    charging: RIV_PORT1,
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
  },
  {
    id: "r1t-2023-quad", ...R1T, modelYears: [2023, 2023], trim: ["Quad Motor", "Quad", "Quad Motor Large Pack"], drive: "AWD", packVariant: "Quad · Large pack",
    battery: RIV_128,
    range: { epaRangeMi: f(328, "mfr", "high", "MY2023 R1T quad-motor on 21-inch wheels, EPA; 289–303 on 20/22s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46313") },
    charging: RIV_PORT1,
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
  },
  {
    id: "r1s-2023-dual", ...R1S, modelYears: [2023, 2023], trim: ["Dual Motor", "Large Pack", "Large", "Performance"], drive: "AWD", packVariant: "Dual · Large pack",
    battery: RIV_128,
    range: { epaRangeMi: f(352, "mfr", "high", "MY2023 R1S Dual (Large pack, the only 2023 dual config) on 21-inch wheels, EPA; 307–341 on 20AT/22s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46996") },
    charging: RIV_PORT1,
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
  },
  {
    id: "r1t-2023-dual", ...R1T, modelYears: [2023, 2023], trim: ["Dual Motor", "Large Pack", "Large", "Performance"], drive: "AWD", packVariant: "Dual · Large pack",
    battery: RIV_128,
    range: { epaRangeMi: f(352, "mfr", "high", "MY2023 R1T Dual (Large pack) on 21-inch wheels, EPA; 341 on 22s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47000") },
    charging: RIV_PORT1,
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
  },
  {
    id: "r1s-2024-quad", ...R1S, modelYears: [2024, 2024], trim: ["Quad Motor", "Quad", "Quad Motor Large Pack"], drive: "AWD", packVariant: "Quad · Large pack",
    battery: RIV_128,
    range: { epaRangeMi: f(321, "mfr", "high", "MY2024 R1S quad on 21-inch wheels, EPA; 274–303 on 20AT/22s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47906") },
    charging: RIV_PORT1,
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
  },
  {
    id: "r1t-2024-quad", ...R1T, modelYears: [2024, 2024], trim: ["Quad Motor", "Quad", "Quad Motor Large Pack"], drive: "AWD", packVariant: "Quad · Large pack",
    battery: RIV_128,
    range: { epaRangeMi: f(328, "mfr", "high", "MY2024 R1T quad on 21-inch wheels, EPA; 289–303 on 20/22s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47883") },
    charging: RIV_PORT1,
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
  },
  {
    id: "r1s-2024-std", ...R1S, modelYears: [2024, 2024], trim: ["Standard Pack", "Standard", "Dual Motor"], drive: "AWD", packVariant: "Dual · Standard pack",
    range: { epaRangeMi: f(270, "mfr", "high", "MY2024 R1S Dual Standard on 21-inch wheels, EPA; 255 on 22s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47895") },
    charging: RIV_PORT1,
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
  },
  {
    id: "r1t-2024-std", ...R1T, modelYears: [2024, 2024], trim: ["Standard Pack", "Standard", "Dual Motor"], drive: "AWD", packVariant: "Dual · Standard pack",
    range: { epaRangeMi: f(270, "mfr", "high", "MY2024 R1T Dual Standard on 21-inch wheels, EPA; 255 on 22s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47872") },
    charging: RIV_PORT1,
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
  },
  {
    id: "r1s-2024-stdplus", ...R1S, modelYears: [2024, 2024], trim: ["Standard Plus Pack", "Standard Plus"], drive: "AWD", packVariant: "Dual · Standard+ pack",
    range: { epaRangeMi: f(315, "mfr", "high", "MY2024 R1S Dual Standard+ on 21-inch wheels, EPA; 277–300 on 20AT/22s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47897") },
    charging: RIV_PORT1,
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
  },
  {
    id: "r1t-2024-stdplus", ...R1T, modelYears: [2024, 2024], trim: ["Standard Plus Pack", "Standard Plus"], drive: "AWD", packVariant: "Dual · Standard+ pack",
    range: { epaRangeMi: f(315, "mfr", "high", "MY2024 R1T Dual Standard+ on 21-inch wheels, EPA; 277–300 on 20AT/22s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47874") },
    charging: RIV_PORT1,
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
  },
  {
    id: "r1s-2024-large", ...R1S, modelYears: [2024, 2024], trim: ["Large Pack", "Large", "Dual Motor"], drive: "AWD", packVariant: "Dual · Large pack",
    battery: RIV_128,
    range: { epaRangeMi: f(352, "mfr", "high", "MY2024 R1S Dual Large on 21-inch wheels, EPA; 307–341 on 20AT/22s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47891") },
    charging: RIV_PORT1,
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
  },
  {
    id: "r1t-2024-large", ...R1T, modelYears: [2024, 2024], trim: ["Large Pack", "Large", "Dual Motor"], drive: "AWD", packVariant: "Dual · Large pack",
    battery: RIV_128,
    range: { epaRangeMi: f(352, "mfr", "high", "MY2024 R1T Dual Large on 21-inch wheels, EPA; 307–341 on 20AT/22s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47868") },
    charging: RIV_PORT1,
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
  },
  {
    id: "r1s-2024-max", ...R1S, modelYears: [2024, 2024], trim: ["Max Pack", "Max", "Dual Motor"], drive: "AWD", packVariant: "Dual · Max pack",
    battery: RIV_141,
    range: { epaRangeMi: f(400, "mfr", "high", "MY2024 R1S Dual Max on 21-inch wheels, EPA; 355–380 on 20AT/22s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47893") },
    charging: RIV_PORT1,
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
  },
  {
    id: "r1t-2024-max", ...R1T, modelYears: [2024, 2024], trim: ["Max Pack", "Max", "Dual Motor"], drive: "AWD", packVariant: "Dual · Max pack",
    battery: RIV_141,
    range: { epaRangeMi: f(410, "mfr", "high", "MY2024 R1T Dual Max on 21-inch wheels, EPA; 355–380 on 20AT/22s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47870") },
    charging: RIV_PORT1,
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
  },
  {
    id: "r1s-2025-26-std", ...R1S, modelYears: [2025, 2026], trim: ["Standard Pack", "Standard", "Dual Motor"], drive: "AWD", packVariant: "Dual · Standard pack",
    battery: RIV_106,
    range: { epaRangeMi: f(258, "mfr", "high", "Gen-2 R1S Dual Standard on 20-inch wheels, EPA, 2025–26; 270 on 22s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48435") },
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
  },
  {
    id: "r1t-2025-26-std", ...R1T, modelYears: [2025, 2026], trim: ["Standard Pack", "Standard", "Dual Motor"], drive: "AWD", packVariant: "Dual · Standard pack",
    battery: RIV_106,
    range: { epaRangeMi: f(258, "mfr", "high", "Gen-2 R1T Dual Standard on 20-inch wheels, EPA, 2025–26; 270 on 22s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48423") },
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
  },
  {
    id: "r1s-2025-26-large", ...R1S, modelYears: [2025, 2026], trim: ["Large Pack", "Large", "Dual Motor"], drive: "AWD", packVariant: "Dual · Large pack",
    range: { epaRangeMi: f(300, "mfr", "high", "Gen-2 R1S Dual Large on 20-inch wheels, EPA, 2025–26; 289–329 on 20AT/22s. The Large Plus pack rates 317–330", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48745") },
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
  },
  {
    id: "r1t-2025-26-large", ...R1T, modelYears: [2025, 2026], trim: ["Large Pack", "Large", "Dual Motor"], drive: "AWD", packVariant: "Dual · Large pack",
    range: { epaRangeMi: f(300, "mfr", "high", "Gen-2 R1T Dual Large on 20-inch wheels, EPA, 2025–26; 329 on 22s. The Large Plus pack rates 317–330", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48755") },
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
  },
  {
    id: "r1s-2025-26-largeplus", ...R1S, modelYears: [2025, 2026], trim: ["Large Plus Pack", "Large Plus"], drive: "AWD", packVariant: "Dual · Large Plus pack",
    range: { epaRangeMi: f(317, "mfr", "high", "Gen-2 R1S Dual Large Plus on 20-inch wheels, EPA, 2025–26; 292–330 on 20AT/22s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48747") },
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
  },
  {
    id: "r1t-2025-26-largeplus", ...R1T, modelYears: [2025, 2026], trim: ["Large Plus Pack", "Large Plus"], drive: "AWD", packVariant: "Dual · Large Plus pack",
    range: { epaRangeMi: f(317, "mfr", "high", "Gen-2 R1T Dual Large Plus on 20-inch wheels, EPA, 2025–26; 330 on 22s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48757") },
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
  },
  {
    id: "r1s-2025-26-max", ...R1S, modelYears: [2025, 2026], trim: ["Max Pack", "Max", "Dual Motor"], drive: "AWD", packVariant: "Dual · Max pack",
    battery: RIV_141,
    range: { epaRangeMi: f(380, "mfr", "high", "Gen-2 R1S Dual Max on 20-inch wheels, EPA, 2025–26; 370–410 on 20AT/22s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48433") },
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
  },
  {
    id: "r1t-2025-26-max", ...R1T, modelYears: [2025, 2026], trim: ["Max Pack", "Max", "Dual Motor"], drive: "AWD", packVariant: "Dual · Max pack",
    battery: RIV_141,
    range: { epaRangeMi: f(380, "mfr", "high", "Gen-2 R1T Dual Max on 20-inch wheels, EPA, 2025–26; 420 on 22s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48421") },
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
  },
  {
    id: "r1s-2025-26-tri", ...R1S, modelYears: [2025, 2026], trim: ["Tri Motor", "Tri", "Tri Motor Max Pack"], drive: "AWD", packVariant: "Tri · Max pack",
    battery: RIV_141,
    range: { epaRangeMi: f(371, "mfr", "high", "Gen-2 R1S Tri Max on 22-inch wheels, EPA, 2025–26; 329 on 20AT", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48751") },
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
  },
  {
    id: "r1t-2025-26-tri", ...R1T, modelYears: [2025, 2026], trim: ["Tri Motor", "Tri", "Tri Motor Max Pack"], drive: "AWD", packVariant: "Tri · Max pack",
    battery: RIV_141,
    range: { epaRangeMi: f(371, "mfr", "high", "Gen-2 R1T Tri Max on 22-inch wheels, EPA, 2025–26", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48761") },
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
  },
  {
    id: "r1s-2026-quad", ...R1S, modelYears: [2026, 2026], trim: ["Quad Motor", "Quad", "Quad Motor Large Pack"], drive: "AWD", packVariant: "Quad · Max pack",
    battery: RIV_141,
    range: { epaRangeMi: f(374, "mfr", "high", "MY2026 gen-2 R1S Quad Max on 22-inch wheels, EPA; 325–338 on AT/UHP tires", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49740") },
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
  },

  // ── PHEVs: Wrangler 4xe / Grand Cherokee 4xe / X5 45e-50e / Rogue PHEV ──
  // epaRangeMi is the EPA ALL-ELECTRIC figure (fueleconomy.gov rangeA) — the
  // honest headline for an EV-shopping site — and epaRangeTotalMi is the
  // separate gas-assisted total (types.ts, added 2026-08-21). Both used to
  // live as one epaRangeMi plus a note stating the total in prose; that
  // dropped the total range out of anything a card or a future feature could
  // read as data. Migrated here, not re-researched — see
  // docs/agents/phev-enrichment-2026-08-21.md §2. MPGe/gas-MPG were never
  // sourced for these six rows in the original pass, so they stay absent
  // rather than guessed. None of these DC-fast-charge (J1772 AC only), which
  // the cards already show as the "No fast charging" tile.
  {
    id: "wrangler-4xe-2021-25", make: "JEEP", model: "Wrangler 4xe", modelYears: [2021, 2025], packVariant: "PHEV",
    range: {
      epaRangeMi: f(22, "mfr", "high", "Electric-only EPA range. Identical rating 2021–25", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47278"),
      epaRangeTotalMi: f(370, "mfr", "high", undefined, "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47278"),
    },
    charging: { portStandard: f("J1772", "mfr", "high", "AC charging only, no DC fast charge on any 4xe"), dcFastCharging: f("none", "mfr") },
  },
  {
    id: "wrangler-unl-4xe-2021-25", make: "JEEP", model: "Wrangler Unlimited 4xe", modelYears: [2021, 2025], packVariant: "PHEV",
    range: {
      epaRangeMi: f(22, "mfr", "high", "Electric-only EPA range. Identical rating 2021–25", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47278"),
      epaRangeTotalMi: f(370, "mfr", "high", undefined, "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47278"),
    },
    charging: { portStandard: f("J1772", "mfr", "high", "AC charging only, no DC fast charge on any 4xe"), dcFastCharging: f("none", "mfr") },
  },
  {
    // modelAliases added 2026-08-21: the bare "Grand Cherokee" bucket (~56
    // listings, more than half this model's volume) was falling through with
    // no row at all — every sampled bare-model VIN decodes to a 4xe, and a
    // gas Grand Cherokee never reaches this database in the first place
    // (scraper/lib/ev.mjs's classifyEv only admits it at evConfidence "high"
    // when the feed's own fuel-type text says "electric" and "plug" — a gas
    // SUV's fuelType never does). See docs/agents/phev-enrichment-2026-08-21.md §6.
    id: "gc-4xe-2022-25", make: "JEEP", model: "Grand Cherokee 4xe", modelYears: [2022, 2025], packVariant: "PHEV",
    modelAliases: ["Grand Cherokee"],
    range: {
      epaRangeMi: f(26, "mfr", "high", "Electric-only EPA range. Identical rating 2022–25", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47277"),
      epaRangeTotalMi: f(470, "mfr", "high", undefined, "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47277"),
    },
    charging: { portStandard: f("J1772", "mfr", "high", "AC charging only, no DC fast charge"), dcFastCharging: f("none", "mfr") },
  },
  {
    id: "x5-45e-2021-23", make: "BMW", model: "X5 PHEV", modelYears: [2021, 2023], trim: "xDrive45e", packVariant: "PHEV",
    range: {
      epaRangeMi: f(31, "mfr", "high", "xDrive45e electric-only EPA range", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=42807"),
      epaRangeTotalMi: f(400, "mfr", "high", undefined, "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=42807"),
    },
    charging: { portStandard: f("J1772", "mfr", "high", "AC charging only"), dcFastCharging: f("none", "mfr") },
  },
  {
    id: "x5-50e-2024-26", make: "BMW", model: "X5 PHEV", modelYears: [2024, 2026], trim: "xDrive50e", packVariant: "PHEV",
    range: {
      epaRangeMi: f(39, "mfr", "high", "xDrive50e electric-only EPA range (40 for 2026). MY2024 has no separate fueleconomy.gov entry (control: 2025–26 are present), same xDrive50e", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49009"),
      epaRangeTotalMi: f(440, "mfr", "high", undefined, "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49009"),
    },
    charging: { portStandard: f("J1772", "mfr", "high", "AC charging only"), dcFastCharging: f("none", "mfr") },
  },
  {
    id: "x5-45e-2021-23-alt", make: "BMW", model: "X5", modelYears: [2021, 2023], trim: ["xDrive45e", "45e"], packVariant: "PHEV",
    range: {
      epaRangeMi: f(31, "mfr", "high", "xDrive45e electric-only EPA range", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=42807"),
      epaRangeTotalMi: f(400, "mfr", "high", undefined, "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=42807"),
    },
    charging: { portStandard: f("J1772", "mfr", "high", "AC charging only"), dcFastCharging: f("none", "mfr") },
  },
  {
    id: "x5-50e-2024-26-alt", make: "BMW", model: "X5", modelYears: [2024, 2026], trim: ["xDrive50e", "50e"], packVariant: "PHEV",
    range: {
      epaRangeMi: f(39, "mfr", "high", "xDrive50e electric-only EPA range (40 for 2026)", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49009"),
      epaRangeTotalMi: f(440, "mfr", "high", undefined, "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49009"),
    },
    charging: { portStandard: f("J1772", "mfr", "high", "AC charging only"), dcFastCharging: f("none", "mfr") },
  },
  {
    id: "rogue-phev-2025-26", make: "NISSAN", model: "Rogue Plug-In Hybrid", modelYears: [2025, 2026], packVariant: "PHEV",
    range: {
      epaRangeMi: f(38, "mfr", "medium", "Electric-only range, Nissan's EPA-estimate; fueleconomy.gov has no Rogue PHEV entry yet (control: gas Rogues are present)", "https://usa.nissannews.com/en-US/releases/2026-nissan-rogue-plug-in-hybrid-press-kit"),
      epaRangeTotalMi: f(420, "mfr", "medium", undefined, "https://usa.nissannews.com/en-US/releases/2026-nissan-rogue-plug-in-hybrid-press-kit"),
    },
    charging: { portStandard: f("J1772", "mfr", "high", "AC charging only"), dcFastCharging: f("none", "mfr") },
  },

  ...VOLT_ROWS,
  RAV4_PRIME_ROW,
  ...PRIUS_PRIME_ROWS,
  ...PACIFICA_ROWS,
  ...ESCAPE_ROWS,
  CLARITY_PHEV_ROW,

  {
    id: "taycan-2020-4s", ...TAY, modelYears: [2020, 2020], trim: ["4S", "4S with Performance Pack"], packVariant: "Performance Battery Plus",
    battery: PB1P,
    range: { epaRangeMi: f(203, "mfr", "high", "MY2020 4S, EPA certified only the Performance Battery Plus configuration", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=42590") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-2020-turbo", ...TAY, modelYears: [2020, 2020], trim: ["Turbo"], packVariant: "Performance Battery Plus",
    battery: PB1P,
    range: { epaRangeMi: f(201, "mfr", "high", "MY2020 Turbo, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=42383") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-2020-turbos", ...TAY, modelYears: [2020, 2020], trim: ["Turbo S"], packVariant: "Performance Battery Plus",
    battery: PB1P,
    range: { epaRangeMi: f(192, "mfr", "high", "MY2020 Turbo S, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=42427") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-2021-22-base-pb", ...TAY, modelYears: [2021, 2022], trim: ["Base", "Performance Battery"], packVariant: "Performance Battery",
    battery: PB1,
    range: { epaRangeMi: f(200, "mfr", "high", "MY2021–22 base Taycan, Performance Battery (79.2 kWh, resolved from this VIN), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=43802") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-2021-22-base-pbp", ...TAY, modelYears: [2021, 2022], trim: ["Base", "Performance Battery Plus"], packVariant: "Performance Battery Plus",
    battery: PB1P,
    range: { epaRangeMi: f(225, "mfr", "high", "MY2021–22 base Taycan, Performance Battery Plus (93.4 kWh, resolved from this VIN), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=43803") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-2021-22-4s-pb", ...TAY, modelYears: [2021, 2022], trim: ["4S"], packVariant: "Performance Battery",
    battery: PB1,
    range: { epaRangeMi: f(199, "mfr", "high", "MY2021–22 4S, Performance Battery (79.2 kWh, resolved from this VIN), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=43684") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-2021-22-4s-pbp", ...TAY, modelYears: [2021, 2022], trim: ["4S"], packVariant: "Performance Battery Plus",
    battery: PB1P,
    range: { epaRangeMi: f(227, "mfr", "high", "MY2021–22 4S, Performance Battery Plus (93.4 kWh, resolved from this VIN), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=43685") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-2022-gts", ...TAY, modelYears: [2022, 2022], trim: ["GTS"], packVariant: "Performance Battery Plus",
    battery: PB1P,
    range: { epaRangeMi: f(246, "mfr", "high", "MY2022 GTS, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=45715") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-2022-gts-st", ...TAY, modelYears: [2022, 2022], trim: ["GTS Sport Turismo", "GTS Sport Tourismo", "GTS ST", "GTS Wagon"], packVariant: "Performance Battery Plus",
    battery: PB1P,
    range: { epaRangeMi: f(233, "mfr", "high", "MY2022 GTS Sport Turismo, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=45716") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-2021-22-turbo", ...TAY, modelYears: [2021, 2022], trim: ["Turbo"], packVariant: "Performance Battery Plus",
    battery: PB1P,
    range: { epaRangeMi: f(212, "mfr", "high", "MY2021–22 Turbo, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=43910") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-2021-22-turbos", ...TAY, modelYears: [2021, 2022], trim: ["Turbo S"], packVariant: "Performance Battery Plus",
    battery: PB1P,
    range: { epaRangeMi: f(201, "mfr", "high", "MY2021–22 Turbo S, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=43911") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-2023-24-base-pb", ...TAY, modelYears: [2023, 2024], trim: ["Base", "Performance Battery"], packVariant: "Performance Battery",
    battery: PB1,
    range: { epaRangeMi: f(208, "mfr", "high", "MY2023–24 base Taycan, Performance Battery (79.2 kWh, resolved from this VIN), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46025") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-2023-24-base-pbp", ...TAY, modelYears: [2023, 2024], trim: ["Base", "Performance Battery Plus"], packVariant: "Performance Battery Plus",
    battery: PB1P,
    range: { epaRangeMi: f(242, "mfr", "high", "MY2023–24 base Taycan, Performance Battery Plus (93.4 kWh, resolved from this VIN), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46024") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-2023-24-4-pbp", ...TAY, modelYears: [2023, 2024], trim: ["4", "4 Black Edition"], packVariant: "Performance Battery Plus",
    battery: PB1P,
    range: { epaRangeMi: f(235, "mfr", "high", "MY2023–24 Taycan 4, EPA (the 4 Cross Turismo carries the same 235 rating)", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46018") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-2023-24-4s-pb", ...TAY, modelYears: [2023, 2024], trim: ["4S", "4S Black Edition"], packVariant: "Performance Battery",
    battery: PB1,
    range: { epaRangeMi: f(206, "mfr", "high", "MY2023–24 4S, Performance Battery (79.2 kWh, resolved from this VIN), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46021") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-2023-24-4s-pbp", ...TAY, modelYears: [2023, 2024], trim: ["4S", "4S Black Edition"], packVariant: "Performance Battery Plus",
    battery: PB1P,
    range: { epaRangeMi: f(235, "mfr", "high", "MY2023–24 4S, Performance Battery Plus (93.4 kWh, resolved from this VIN), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46020") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-2023-24-gts", ...TAY, modelYears: [2023, 2024], trim: ["GTS"], packVariant: "Performance Battery Plus",
    battery: PB1P,
    range: { epaRangeMi: f(246, "mfr", "high", "MY2023–24 GTS, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46022") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-2023-24-gts-st", ...TAY, modelYears: [2023, 2024], trim: ["GTS Sport Turismo", "GTS Sport Tourismo", "GTS ST", "GTS Wagon"], packVariant: "Performance Battery Plus",
    battery: PB1P,
    range: { epaRangeMi: f(233, "mfr", "high", "MY2023–24 GTS Sport Turismo, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46023") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-2023-24-turbo", ...TAY, modelYears: [2023, 2024], trim: ["Turbo"], packVariant: "Performance Battery Plus",
    battery: PB1P,
    range: { epaRangeMi: f(238, "mfr", "high", "MY2023–24 Turbo, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46026") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-2023-24-turbos", ...TAY, modelYears: [2023, 2024], trim: ["Turbo S"], packVariant: "Performance Battery Plus",
    battery: PB1P,
    range: { epaRangeMi: f(222, "mfr", "high", "MY2023–24 Turbo S, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46028") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-2025-26-base-pb", ...TAY, modelYears: [2025, 2026], trim: ["Base", "Performance Battery"], packVariant: "Performance Battery",
    battery: PB2,
    range: { epaRangeMi: f(274, "mfr", "high", "MY2025–26 base Taycan (gen-2 facelift), Performance Battery, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48415") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-2025-base-pbp", ...TAY, modelYears: [2025, 2025], trim: ["Base", "Performance Battery Plus"], packVariant: "Performance Battery Plus",
    battery: PB2P,
    range: { epaRangeMi: f(318, "mfr", "high", "MY2025 base Taycan, Performance Battery Plus, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48414") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-2025-26-4-pbp", ...TAY, modelYears: [2025, 2026], trim: ["4", "4 Black Edition"], packVariant: "Performance Battery Plus",
    battery: PB2P,
    range: { epaRangeMi: f(294, "mfr", "high", "MY2025–26 Taycan 4, Performance Battery Plus, EPA; 315 on 19-inch all-seasons; the 2026 Performance Battery rates 251", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49120") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-2025-26-4s-pb", ...TAY, modelYears: [2025, 2026], trim: ["4S", "4S Black Edition"], packVariant: "Performance Battery",
    battery: PB2,
    range: { epaRangeMi: f(252, "mfr", "high", "MY2025–26 4S, Performance Battery, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48733") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-2025-26-4s-pbp", ...TAY, modelYears: [2025, 2026], trim: ["4S", "4S Black Edition"], packVariant: "Performance Battery Plus",
    battery: PB2P,
    range: { epaRangeMi: f(295, "mfr", "high", "MY2025–26 4S, Performance Battery Plus, EPA; 315 on 19-inch wheels", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48732") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-2025-26-gts", ...TAY, modelYears: [2025, 2026], trim: ["GTS"], packVariant: "Performance Battery Plus",
    battery: PB2P,
    range: { epaRangeMi: f(293, "mfr", "high", "MY2025–26 GTS, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49121") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-2025-26-gts-st", ...TAY, modelYears: [2025, 2026], trim: ["GTS Sport Turismo", "GTS Sport Tourismo", "GTS ST", "GTS Wagon"], packVariant: "Performance Battery Plus",
    battery: PB2P,
    range: { epaRangeMi: f(279, "mfr", "high", "MY2025–26 GTS Sport Turismo, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49122") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-2025-26-turbo", ...TAY, modelYears: [2025, 2026], trim: ["Turbo"], packVariant: "Performance Battery Plus",
    battery: PB2P,
    range: { epaRangeMi: f(292, "mfr", "high", "MY2025–26 Turbo, EPA; 317 on 21-inch Aero wheels", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48734") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-2025-26-turbogt", ...TAY, modelYears: [2025, 2026], trim: ["Turbo GT"], packVariant: "Performance Battery Plus",
    battery: PB2P,
    range: { epaRangeMi: f(276, "mfr", "high", "MY2025–26 Turbo GT, EPA; 269 with the Weissach Package", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48737") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-2025-26-turbos", ...TAY, modelYears: [2025, 2026], trim: ["Turbo S"], packVariant: "Performance Battery Plus",
    battery: PB2P,
    range: { epaRangeMi: f(266, "mfr", "high", "MY2025–26 Turbo S, EPA; 298 on 21-inch Aero wheels", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48739") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-ct-2021-22-4", ...TAY, modelYears: [2021, 2022], trim: ["4 Cross Turismo", "4 Cross Tourismo"], packVariant: "Cross Turismo",
    battery: PB1P,
    range: { epaRangeMi: f(215, "mfr", "high", "MY2021–22 4 Cross Turismo, EPA (4S CT rates the same 215)", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=44721") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-ct-2021-22-4s", ...TAY, modelYears: [2021, 2022], trim: ["4S Cross Turismo", "4S Cross Tourismo"], packVariant: "Cross Turismo",
    battery: PB1P,
    range: { epaRangeMi: f(215, "mfr", "high", "MY2021–22 4S Cross Turismo, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=44722") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-ct-2021-22-turbo", ...TAY, modelYears: [2021, 2022], trim: ["Turbo Cross Turismo", "Turbo Cross Tourismo"], packVariant: "Cross Turismo",
    battery: PB1P,
    range: { epaRangeMi: f(204, "mfr", "high", "MY2021–22 Turbo Cross Turismo, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=44724") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-ct-2021-22-turbos", ...TAY, modelYears: [2021, 2022], trim: ["Turbo S Cross Turismo", "Turbo S Cross Tourismo"], packVariant: "Cross Turismo",
    battery: PB1P,
    range: { epaRangeMi: f(202, "mfr", "high", "MY2021–22 Turbo S Cross Turismo, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=44723") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-ct-2023-24-4", ...TAY, modelYears: [2023, 2024], trim: ["4 Cross Turismo", "4 Cross Tourismo"], packVariant: "Cross Turismo",
    battery: PB1P,
    range: { epaRangeMi: f(235, "mfr", "high", "MY2023–24 4 Cross Turismo, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46018") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-ct-2023-24-4s", ...TAY, modelYears: [2023, 2024], trim: ["4S Cross Turismo", "4S Cross Tourismo"], packVariant: "Cross Turismo",
    battery: PB1P,
    range: { epaRangeMi: f(230, "mfr", "high", "MY2023–24 4S Cross Turismo, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46019") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-ct-2023-24-turbo", ...TAY, modelYears: [2023, 2024], trim: ["Turbo Cross Turismo", "Turbo Cross Tourismo"], packVariant: "Cross Turismo",
    battery: PB1P,
    range: { epaRangeMi: f(233, "mfr", "high", "MY2023–24 Turbo Cross Turismo, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46027") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-ct-2023-24-turbos", ...TAY, modelYears: [2023, 2024], trim: ["Turbo S Cross Turismo", "Turbo S Cross Tourismo"], packVariant: "Cross Turismo",
    battery: PB1P,
    range: { epaRangeMi: f(222, "mfr", "high", "MY2023–24 Turbo S Cross Turismo, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46029") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-ct-2025-26-4", ...TAY, modelYears: [2025, 2026], trim: ["4 Cross Turismo", "4 Cross Tourismo"], packVariant: "Cross Turismo",
    battery: PB2P,
    range: { epaRangeMi: f(277, "mfr", "high", "MY2025–26 4 Cross Turismo, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48730") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-ct-2025-26-4s", ...TAY, modelYears: [2025, 2026], trim: ["4S Cross Turismo", "4S Cross Tourismo"], packVariant: "Cross Turismo",
    battery: PB2P,
    range: { epaRangeMi: f(272, "mfr", "high", "MY2025–26 4S Cross Turismo, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48731") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-ct-2025-26-turbo", ...TAY, modelYears: [2025, 2026], trim: ["Turbo Cross Turismo", "Turbo Cross Tourismo"], packVariant: "Cross Turismo",
    battery: PB2P,
    range: { epaRangeMi: f(265, "mfr", "high", "MY2025–26 Turbo Cross Turismo, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48736") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "taycan-ct-2025-26-turbos", ...TAY, modelYears: [2025, 2026], trim: ["Turbo S Cross Turismo", "Turbo S Cross Tourismo"], packVariant: "Cross Turismo",
    battery: PB2P,
    range: { epaRangeMi: f(261, "mfr", "high", "MY2025–26 Turbo S Cross Turismo, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48741") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "tayct-2021-22", ...TAYCT, modelYears: [2021, 2022], trim: ["4", "4S", "4 Cross Turismo", "4S Cross Turismo", "4 Cross Tourismo", "4S Cross Tourismo"], packVariant: "Cross Turismo",
    battery: PB1P,
    range: { epaRangeMi: f(215, "mfr", "high", "MY2021–22 4/4S Cross Turismo, EPA, both rate 215", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=44721") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "tayct-2023-24-4", ...TAYCT, modelYears: [2023, 2024], trim: ["4", "4 Cross Turismo", "4 Cross Tourismo"], packVariant: "Cross Turismo",
    battery: PB1P,
    range: { epaRangeMi: f(235, "mfr", "high", "MY2023–24 4 Cross Turismo, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46018") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "tayct-2023-24-4s", ...TAYCT, modelYears: [2023, 2024], trim: ["4S", "4S Cross Turismo", "4S Cross Tourismo"], packVariant: "Cross Turismo",
    battery: PB1P,
    range: { epaRangeMi: f(230, "mfr", "high", "MY2023–24 4S Cross Turismo, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46019") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "tayct-2025-26-4", ...TAYCT, modelYears: [2025, 2026], trim: ["4", "4 Cross Turismo", "4 Cross Tourismo"], packVariant: "Cross Turismo",
    battery: PB2P,
    range: { epaRangeMi: f(277, "mfr", "high", "MY2025–26 4 Cross Turismo, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48730") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "tayct-2025-26-4s", ...TAYCT, modelYears: [2025, 2026], trim: ["4S", "4S Cross Turismo", "4S Cross Tourismo"], packVariant: "Cross Turismo",
    battery: PB2P,
    range: { epaRangeMi: f(272, "mfr", "high", "MY2025–26 4S Cross Turismo, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48731") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "macan-2024-25-4", ...MAC, modelYears: [2024, 2025], trim: ["4", "Macan 4", "4 Electric"], packVariant: "Macan 4",
    battery: MACB,
    range: { epaRangeMi: f(308, "mfr", "high", "MY2024–25 Macan 4 Electric, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48793") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "macan-2026-4", ...MAC, modelYears: [2026, 2026], trim: ["4", "Macan 4", "4 Electric"], packVariant: "Macan 4",
    battery: MACB,
    range: { epaRangeMi: f(304, "mfr", "high", "MY2026 Macan 4 Electric, EPA; 324 on 20-inch wheels", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50294") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "macan-2025-base", ...MAC, modelYears: [2025, 2025], trim: ["Electric", "Base"], packVariant: "Macan",
    battery: MACB,
    range: { epaRangeMi: f(315, "mfr", "high", "MY2025 base Macan Electric (RWD), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49119") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "macan-2026-base", ...MAC, modelYears: [2026, 2026], trim: ["Electric", "Base"], packVariant: "Macan",
    battery: MACB,
    range: { epaRangeMi: f(309, "mfr", "high", "MY2026 base Macan Electric (RWD), EPA; 332 on 20-inch wheels", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50296") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "macan-2025-4s", ...MAC, modelYears: [2025, 2025], trim: ["4S", "4S Electric"], packVariant: "Macan 4S",
    battery: MACB,
    range: { epaRangeMi: f(288, "mfr", "high", "MY2025 Macan 4S Electric, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48728") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "macan-2026-4s", ...MAC, modelYears: [2026, 2026], trim: ["4S", "4S Electric"], packVariant: "Macan 4S",
    battery: MACB,
    range: { epaRangeMi: f(290, "mfr", "high", "MY2026 Macan 4S Electric, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50295") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "macan-2024-25-turbo", ...MAC, modelYears: [2024, 2025], trim: ["Turbo", "Electric Turbo", "Turbo Electric"], packVariant: "Macan Turbo",
    battery: MACB,
    range: { epaRangeMi: f(288, "mfr", "high", "MY2024–25 Macan Turbo Electric, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48794") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "macan-2026-turbo", ...MAC, modelYears: [2026, 2026], trim: ["Turbo", "Electric Turbo", "Turbo Electric"], packVariant: "Macan Turbo",
    battery: MACB,
    range: { epaRangeMi: f(293, "mfr", "high", "MY2026 Macan Turbo Electric, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50298") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "macan-2026-gts", ...MAC, modelYears: [2026, 2026], trim: ["GTS", "GTS Electric"], packVariant: "Macan GTS",
    battery: MACB,
    range: { epaRangeMi: f(294, "mfr", "high", "MY2026 Macan GTS Electric, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50297") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "macan-2024-25-4-alt", ...MACALT, modelYears: [2024, 2025], trim: ["4", "Macan 4", "4 Electric"], packVariant: "Macan 4",
    battery: MACB,
    range: { epaRangeMi: f(308, "mfr", "high", "MY2024–25 Macan 4 Electric, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48793") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "macan-2026-4-alt", ...MACALT, modelYears: [2026, 2026], trim: ["4", "Macan 4", "4 Electric"], packVariant: "Macan 4",
    battery: MACB,
    range: { epaRangeMi: f(304, "mfr", "high", "MY2026 Macan 4 Electric, EPA; 324 on 20-inch wheels", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50294") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "macan-2025-base-alt", ...MACALT, modelYears: [2025, 2025], trim: ["Electric", "Base"], packVariant: "Macan",
    battery: MACB,
    range: { epaRangeMi: f(315, "mfr", "high", "MY2025 base Macan Electric (RWD), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49119") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "macan-2026-base-alt", ...MACALT, modelYears: [2026, 2026], trim: ["Electric", "Base"], packVariant: "Macan",
    battery: MACB,
    range: { epaRangeMi: f(309, "mfr", "high", "MY2026 base Macan Electric (RWD), EPA; 332 on 20-inch wheels", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50296") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "macan-2025-4s-alt", ...MACALT, modelYears: [2025, 2025], trim: ["4S", "4S Electric"], packVariant: "Macan 4S",
    battery: MACB,
    range: { epaRangeMi: f(288, "mfr", "high", "MY2025 Macan 4S Electric, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48728") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "macan-2026-4s-alt", ...MACALT, modelYears: [2026, 2026], trim: ["4S", "4S Electric"], packVariant: "Macan 4S",
    battery: MACB,
    range: { epaRangeMi: f(290, "mfr", "high", "MY2026 Macan 4S Electric, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50295") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "macan-2024-25-turbo-alt", ...MACALT, modelYears: [2024, 2025], trim: ["Turbo", "Electric Turbo", "Turbo Electric"], packVariant: "Macan Turbo",
    battery: MACB,
    range: { epaRangeMi: f(288, "mfr", "high", "MY2024–25 Macan Turbo Electric, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48794") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "macan-2026-turbo-alt", ...MACALT, modelYears: [2026, 2026], trim: ["Turbo", "Electric Turbo", "Turbo Electric"], packVariant: "Macan Turbo",
    battery: MACB,
    range: { epaRangeMi: f(293, "mfr", "high", "MY2026 Macan Turbo Electric, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50298") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "macan-2026-gts-alt", ...MACALT, modelYears: [2026, 2026], trim: ["GTS", "GTS Electric"], packVariant: "Macan GTS",
    battery: MACB,
    range: { epaRangeMi: f(294, "mfr", "high", "MY2026 Macan GTS Electric, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50297") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "tayct-2021-22-turbo", ...TAYCT, modelYears: [2021, 2022], trim: ["Turbo", "Turbo Cross Turismo", "Turbo Cross Tourismo"], packVariant: "Cross Turismo",
    battery: PB1P,
    range: { epaRangeMi: f(204, "mfr", "high", "MY2021–22 Turbo Cross Turismo, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=44724") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "tayct-2021-22-turbos", ...TAYCT, modelYears: [2021, 2022], trim: ["Turbo S", "Turbo S Cross Turismo", "Turbo S Cross Tourismo"], packVariant: "Cross Turismo",
    battery: PB1P,
    range: { epaRangeMi: f(202, "mfr", "high", "MY2021–22 Turbo S Cross Turismo, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=44723") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "tayct-2023-24-turbo", ...TAYCT, modelYears: [2023, 2024], trim: ["Turbo", "Turbo Cross Turismo", "Turbo Cross Tourismo"], packVariant: "Cross Turismo",
    battery: PB1P,
    range: { epaRangeMi: f(233, "mfr", "high", "MY2023–24 Turbo Cross Turismo, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46027") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
  {
    id: "tayct-2023-24-turbos", ...TAYCT, modelYears: [2023, 2024], trim: ["Turbo S", "Turbo S Cross Turismo", "Turbo S Cross Tourismo"], packVariant: "Cross Turismo",
    battery: PB1P,
    range: { epaRangeMi: f(222, "mfr", "high", "MY2023–24 Turbo S Cross Turismo, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46029") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    warranty: POR_W,
  },
];
