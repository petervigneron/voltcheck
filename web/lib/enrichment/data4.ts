import type { Chemistry, EnrichmentRow, Fact, Source } from "../types";

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

// Core-field backfill pass (2026-08-24): the coverage backlog this file's
// rows dominated — heat pumps, pack sizes, warranties researched against
// maker documents this pass. Facts added then carry their own asOf rather
// than borrowing the tranche date above.
const AS_OF_BACKFILL = "2026-08-24";
function fb<T>(
  value: T,
  source: Source,
  confidence: Fact<T>["confidence"] = "high",
  note?: string,
  sourceUrl?: string
): Fact<T> {
  return { value, source, asOf: AS_OF_BACKFILL, confidence, note, sourceUrl };
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
// TRIMS, corrected 2026-08-26. The two Long Range AWD rows keyed "Light"
// alongside "Wind"/"Light Long Range", but Kia's Drive type row marks Light
// RWD-only in all five years while Light Long Range, Wind and GT-Line offer
// AWD. Because match.ts resolves an exact trim name before it filters
// drivetrain, all 276 live cars listed plainly as "Light" took a Long Range
// AWD row and were shown its bigger pack and longer range — overstating the
// car, the direction that costs a shopper money. "Light L" (2 live cars) is
// the feed truncating "Light Long Range"; no other EV6 trim begins that way,
// and without keying it the string overlaps bare "Light" and lands on the
// Standard Range row instead. Same pair of faults found on the EV9.
const EV6_HP_NONE = { heatPump: f<"none">("none", "mfr", "high", "Heat pump unavailable on the Light trim") };
const EV6_HP_OPT = { heatPump: f<"optional">("optional", "mfr", "high", "Factory option on Wind/GT-Line, window sticker is the authority") };
const EV6_PORT_CCS = { portStandard: f<"CCS1">("CCS1", "mfr") };
const EV6_PORT_NACS = { portStandard: f<"NACS">("NACS", "agg", "high", "Native NACS port from the MY2025 refresh") };
const EV6_PR_NACS = "https://www.kiamedia.com/us/en/media/pressreleases/23210/kia-ev6-ev9-and-niro-owners-gain-access-to-over-21500-tesla-superchargers";
const EV6_PR_ADAPTER = "https://www.kiamedia.com/us/en/media/pressreleases/22573/kia-america-to-offer-north-american-charging-standard-nacs-in-early-2025";
const EV6_SPECS = (yr: number) => `https://www.kiamedia.com/us/en/models/ev6/${yr}/specifications`;
const EV6_PR_2021 = "https://www.kiamedia.com/us/en/media/pressreleases/17267/kia-ev6-redefines-boundaries-of-electric-mobility-with-inspiring-design-exhilarating-performance-and";
const EV6_PAGE = "https://www.kia.com/us/en/ev6";
const EV6_58 = { packGrossKwh: fb(58, "mfr" as Source, "high", "Standard Range pack", EV6_SPECS(2024)) };
const EV6_774 = { packGrossKwh: fb(77.4, "mfr" as Source, "high", "Long Range pack", EV6_SPECS(2024)) };
const EV6_63 = { packGrossKwh: fb(63, "mfr" as Source, "high", "Standard Range pack", EV6_SPECS(2026)) };
const EV6_84 = { packGrossKwh: fb(84, "mfr" as Source, "high", "Long Range pack", EV6_SPECS(2026)) };
// EV6 charging, filled 2026-08-26 from Kia's per-year specifications tables
// (kiamedia.com/us/en/models/ev6/<year>/specifications), same document series
// the EV9 rows above use. Kia's own figures, all five years:
//
//          Battery Voltage      Battery Energy    350 kW EVSE   OBC
//   2022   522.7 V / 697 V      58 / 77.4 kWh     18 min        10.9 kW
//   2023   697 V                77.4 kWh          18 min        10.9 kW
//   2024   522.7 V / 697 V      58 / 77.4 kWh     18 min        10.9 kW
//   2025   523 V / 697 V        63 / 84 kWh       20 min (GT 18) 10.9 kW
//   2026   523 V / 697 V        63 / 84 kWh       20 min        10.9 kW
//
// As on the EV9, the tables never state a state-of-charge window, so they
// cannot fill chargeTime1080Min alone. Kia states it in two places, one per
// era, and each is cited on the rows it actually covers:
//
//   pre-refresh: "The EV6 offers 800V and 400V charging capabilities, without
//   the need for additional components or adapters. The car is capable of a
//   high-speed charge from 10 to 80 percent in just 18 minutes on all
//   variations" (2021 launch release) — matches the table's 18 min.
//
//   refresh: "Can charge from 10%-80% w/ DC Fast Chargers in 20 min."
//   (kia.com/us/en/ev6, the current car) — matches the table's 20 min. The
//   MY2025 LA-show release says only "ultra-fast 800-volt DC charging system"
//   with no time, so the 18-minute sentence is NOT carried across the refresh;
//   the pack changed (77.4 -> 84 kWh) and so did the figure.
//
// dcPeakKw stays absent on every EV6 row: unlike the EV9 tables, these carry
// no "Peak Power (kW)" line, and neither release states a peak rate. Kia does
// not publish it, so neither do we.
//
// architectureV carries 800 with the nominal voltage in the note, the
// convention set by the Ioniq 5 rows and named in CLAUDE.md's copy rule.

// `v` is the pack's nominal voltage from the table; `min` the 10-80% figure.
const EV6_CHG = (yr: number, v: number, min: number, nacs: boolean) => ({
  ...(nacs
    ? {
        // "Standard NACS charging port located on driver's side rear corner",
        // Kia's own EV6 page — this was an uncited `agg` guess, which is what
        // printed "NACS est" on an EV6 card.
        portStandard: fb<"NACS">("NACS", "mfr", "high", undefined, EV6_PAGE),
        superchargerAccess: fb<"native">("native", "mfr", "high", undefined, EV6_PR_NACS),
      }
    : {
        portStandard: fb<"CCS1">("CCS1", "mfr", "high", undefined, EV6_SPECS(yr)),
        superchargerAccess: fb<"adapter">("adapter", "mfr", "high", "Kia supplied a NACS adapter free to 2024 EV6 buyers who took delivery from September 4, 2024", EV6_PR_ADAPTER),
      }),
  architectureV: fb(800, "mfr" as Source, "high", `${v}V nominal`, EV6_PR_2021),
  chargeTime1080Min: fb(min, "mfr" as Source, "high", "10-80% on a 350 kW EVSE", nacs ? EV6_PAGE : EV6_PR_2021),
  acOnboardKw: fb(10.9, "mfr" as Source, "high", undefined, EV6_SPECS(yr)),
  dcFastCharging: fb<"standard">("standard", "mfr", "high", undefined, EV6_SPECS(yr)),
});
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
// Ioniq 6 and IONIQ 9 charging, filled 2026-08-26 from Hyundai's own spec
// sheets (hyundainews.com) read as rendered pages, not as extracted text —
// these are tables, and the note-to-self in the earlier tranches about
// pdftotext mangling tables applies here too.
//
// IONIQ 6, identical figures on the 2024 and 2025 sheets:
//   Battery Type   Lithium-ion        Voltage  480V (SR) / 697V (RWD, AWD)
//   Capacity       53.0 / 77.4 kWh    OBC max capacity 10.9 kW
//   Rapid Charging: 350kW             18 min      Battery preconditioning: S
//   On-Board Charger row: "Ultra-Fast Charger (up to 800V / 350 kW)  S"
//
// IONIQ 9, 2026 sheet:
//   Voltage 610        Capacity 110.3 kWh      Battery preconditioning: S
//   DC Fast Charging (10-80%):  NACS V3 Supercharger 38 min
//                               w/ CCS Adapter 350 kW 24 min
//                               w/ CCS Adapter 50 kW  109 min
//   AC Level 2 (10-80%): 240V / 48A (11 kW), 9 hr 40 min
//   Charge Port: NACS - Rear Quarter / Passenger Side
//
// TWO THINGS THESE SHEETS DO NOT SAY, and which therefore stay absent:
//
// dcPeakKw. "Rapid Charging: 350kW" and "w/ CCS Adapter 350 kW" name the
// CHARGER, not what the car will draw. Reading either as the vehicle's peak
// rate would put a 350 kW acceptance figure on a car that takes roughly two
// thirds of that. Hyundai publishes no vehicle peak for either model.
//
// The IONIQ 6 sheet's own window. Its charge-time rows read "(Up to 80%
// charge)" with no starting point, unlike the IONIQ 9 sheet, which says
// "DC Fast Charging (10-80%)" in the row header. So the 6's 18 minutes comes
// from Hyundai's launch release instead, which states both the window and the
// condition: "With a 350-kW charger, IONIQ 6's charge can go from 10 percent
// to 80 percent in just 18 minutes" and "When the battery pack is at the
// optimal temperature, IONIQ 6 can be charged from 10 percent to 80 percent
// in 18 minutes."
//
// architectureV carries 800 with the nominal voltage in the note, the
// convention the Ioniq 5 rows set. For the 6 that is the sheet's own
// "up to 800V" line; for the 9 the sheet never says 800 anywhere (only
// "Voltage 610"), so it is sourced instead to Hyundai's MY2026 IONIQ 9
// equipment document, which lists "800V DC Ultra-Fast Charging" as standard.
const I6_SPECS_2024 = "https://www.hyundainews.com/assets/documents/original/56235-2024IONIQ6Specs20230502.pdf";
const I6_SPECS_2025 = "https://www.hyundainews.com/assets/documents/original/64772-2025IONIQ6SpecsFeatures011525.pdf";
const I6_PR_LAUNCH = "https://www.hyundainews.com/assets/documents/original/53096-LosAngelesIONIQ6pressrelease11152022final.pdf";
const I9_SPECS = "https://www.hyundainews.com/assets/documents/original/65341-2026IONIQ9SpecsFeatures20250305.pdf";
const I9_MY2026 = "https://www.hyundainews.com/assets/documents/original/65977-2026MYIONIQ930APR20251.pdf";

const I6_CHARGING = (specs: string, nominalV: number) => ({
  portStandard: fb<"CCS1">("CCS1", "mfr", "high", undefined, specs),
  architectureV: fb(800, "mfr" as Source, "high", `${nominalV}V nominal`, specs),
  chargeTime1080Min: fb(18, "mfr" as Source, "high", "10-80% on a 350 kW charger, with the pack at its optimal temperature", I6_PR_LAUNCH),
  acOnboardKw: fb(10.9, "mfr" as Source, "high", undefined, specs),
  dcFastCharging: fb<"standard">("standard", "mfr", "high", undefined, specs),
});
const I6_THERMAL_PRECON = { batteryPreconditioning: fb(true, "mfr" as Source, "high", undefined, I6_SPECS_2025) };

const I9_CHARGING = {
  portStandard: fb<"NACS">("NACS", "mfr", "high", undefined, I9_SPECS),
  superchargerAccess: fb<"native">("native", "mfr", "high", undefined, I9_SPECS),
  architectureV: fb(800, "mfr" as Source, "high", "610V nominal", I9_MY2026),
  chargeTime1080Min: fb(24, "mfr" as Source, "high", "10-80% on a 350 kW DC charger via the CCS adapter; 38 minutes on a NACS V3 Supercharger", I9_SPECS),
  acOnboardKw: fb(11, "mfr" as Source, "high", "240V / 48A", I9_SPECS),
  dcFastCharging: fb<"standard">("standard", "mfr", "high", undefined, I9_SPECS),
};
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

// EV9 heat pump — Kia's per-year Features & Options tables (kiamedia.com,
// HTML and XLSX cross-checked 2026-08-24) carry an explicit "Heat Pump
// system" row: S on every AWD trim (Wind, Land, GT-Line) for 2024–26, Not
// Available on the RWD Lights — except a lone "O" on the 2025 Light Long
// Range that no Kia pricing sheet prices, so that one stays optional/medium.
// The absence claims pass an in-table control: the PTC resistive-heater row
// reads S on every trim, so a "–" under Heat Pump is a stated absence, not a
// blank. (An InsideEVs-derived claim that the 2024 Light Long Range could
// option the heat pump appears in no Kia document — checked and rejected.)
const EV9_FEATURES = (yr: number) => `https://www.kiamedia.com/us/en/models/ev9/${yr}/features`;
const EV9_HP_STD = {
  heatPump: fb<"standard">("standard", "mfr", "high", "Standard on every AWD trim (Wind, Land, GT-Line)", EV9_FEATURES(2024)),
};
const EV9_HP_NONE = (yr: number) => ({
  heatPump: fb<"none">("none", "mfr", "high", "PTC resistive heater only on the RWD Light trims; Kia's Features & Options table marks the heat pump Not Available", EV9_FEATURES(yr)),
});
const EV9_HP_OPT_2025 = {
  heatPump: fb<"optional">("optional", "mfr", "medium", "Kia's 2025 Features & Options table marks it optional on the Light Long Range, but no Kia pricing sheet prices the option — the window sticker is the authority", EV9_FEATURES(2025)),
};
const NOTE_EV9_HP = { headline: "Heat pump: factory option, on the window sticker", severity: "trap" as const, resolvedBy: "config_resolved" as const };

// EV9 charging, rebuilt 2026-08-26 from Kia's own material after the owner
// opened a 2026 EV9 and found a card reading "NACS est · 100 kWh est" with no
// architecture and no 10-80% time. Every figure below is off Kia's per-year
// specifications table (kiamedia.com/us/en/models/ev9/<year>/specifications),
// which is identical across 2024, 2025 and 2026:
//
//   Battery Energy      76.1 kWh (SR)   99.8 kWh (LR)
//   Battery Voltage     632 V (SR)      552 V (LR)
//   Battery Capacity    120.6 Ah        180.9 Ah      (632x120.6 and 552x180.9
//                                                      reproduce both kWh figures)
//   DC Fast Charge, 350 kW EVSE (max 310 A)   20 min (SR)   24 min (LR)
//   Peak Power          235 kW (SR)     210 kW (LR)   (last row of the charging
//                                                      block, before "Dynamic
//                                                      Performance" begins)
//   On-board charger    10.9 kW
//
// Those 99.8/76.1 figures were already in these rows, tagged `agg`/medium,
// which is what printed "est" on the card. They are Kia's own published
// numbers and are now `mfr` with the table cited — the badge was a mis-tag,
// not a real uncertainty.
//
// THE SPEC TABLE DOES NOT STATE A STATE-OF-CHARGE WINDOW for its 20/24
// minutes — no footnote on any of the three years gives one, so the table
// alone could not fill chargeTime1080Min without inventing the window (the
// context-free "18 minutes!" claim the schema comment warns about). Kia's
// own launch release supplies it: "The EV9's standard 800V electrical
// architecture enables ultrafast charging on high-speed DC chargers,
// designed to go from a 10 to 80 percent state of charge in under 25
// minutes" — which is the table's 24 min, same condition. Both are cited.
//
// architectureV carries 800, not the 552/632 V the table reports, because
// that is this field's established convention: the Ioniq 5 rows read 800
// with "697V, long-range pack" in the note, and CLAUDE.md's copy rule names
// this exact pair ("800V does not need 697 V nominal"). The nominal figure
// rides in the note, where the rule puts it.
const EV9_SPECS = (yr: number) => `https://www.kiamedia.com/us/en/models/ev9/${yr}/specifications`;
// "The EV9's standard 800V electrical architecture ... 10 to 80 percent state
// of charge in under 25 minutes" — 2024 launch release, powertrain section.
const EV9_PR_LAUNCH = "https://www.kiamedia.com/us/en/media/pressreleases/21059/the-2024-kia-ev9-modern-refinement-and-all-electric-capability";
// PORT BY YEAR, corrected 2026-08-26. These rows previously carried native
// NACS on every MY2025 EV9, sourced to nothing ("Native NACS port from
// MY2025", tagged agg). Kia says otherwise, twice and unambiguously:
//
//   "2025 model year Kia EV6 and 2026 model year EV9 come standard with NACS
//    charging ports" (2026-04-24 Supercharger-access release)
//   "Customers who take delivery of a new 2024 or 2025 Kia EV9 or 2024 Kia
//    EV6 from September 4, 2024, and later, will receive an adapter free of
//    charge" (NACS adapter release)
//
// A MY2025 EV9 is a CCS1 car that Kia hands an adapter to. The EV6 rows above
// are unaffected and stay NACS from MY2025 — the first release says so
// explicitly, and the two models genuinely differ by a year. Publishing the
// wrong socket is worse than publishing nothing (CLAUDE.md: matching the
// wrong thing is not honest), and it is the kind of error a shopper only
// finds in a parking lot.
const EV9_PR_NACS = "https://www.kiamedia.com/us/en/media/pressreleases/23210/kia-ev6-ev9-and-niro-owners-gain-access-to-over-21500-tesla-superchargers";
const EV9_PR_ADAPTER = "https://www.kiamedia.com/us/en/media/pressreleases/22573/kia-america-to-offer-north-american-charging-standard-nacs-in-early-2025";

// TRIMS, corrected 2026-08-26 from the same tables' "Compare Trims" header and
// their Drivetrain row, which agree across 2024, 2025 and 2026:
//
//   Light | Light Long Range | Wind | Land | GT-Line
//   RWD   | RWD              | AWD  | AWD  | AWD
//
// The AWD rows carried trim: ["Wind", "Land", "Light"]. "Light" is an RWD-only
// trim in every year, and match.ts resolves an exact trim name BEFORE it
// filters on drivetrain (deliberately — an exact name is the strongest
// listing-side signal, and that ordering is what stops a junk kWh hint
// vetoing it). So a 2026 EV9 listed "Light, RWD" matched the AWD row and
// would have shown its 283-mile AWD rating instead of the RWD car's. Removing
// "Light" fixes it in the data, where the error actually is; match.ts is
// behaving as designed and is not touched.
//
// The dealer feed's own spellings are keyed alongside Kia's names, because
// overlap is substring-tolerant and the abbreviations resolve the WRONG WAY
// without them: "Light LR" (4 live cars) and "Light Long" (1) contain "Light"
// but not "Light Long Range", so they overlapped only the Standard Range row
// and would have shown 76.1 kWh / 230 mi on a 99.8 kWh / 305 mi car. That is
// understating a pack, the expensive direction. Live trim strings on this
// nameplate, measured 2026-08-26: GT-Line 1361, Land 846, Wind 818, Light
// Long Range 519, Light 76, Light Short Range 22, Light LR 4, GT-Line Long
// Range 3, Light Long 1, Wind Long Range 1.
// The RWD rows in turn had no trim key at all, so "Light" and "Light Long
// Range" — which ARE the Standard Range and Long Range cars, per the header
// above — could only ever come back as candidates. They are keyed now, and
// the substring hazard the matcher warns about (a longer grade swallowing a
// shorter one) does not bite: the early pass matches on exact trim strings,
// so "Light" takes the Standard Range row and "Light Long Range" the Long
// Range row, each alone.
const EV9_PACK_LR = (yr: number) => ({ packGrossKwh: fb(99.8, "mfr" as Source, "high", "Long Range pack", EV9_SPECS(yr)) });
const EV9_PACK_SR = (yr: number) => ({ packGrossKwh: fb(76.1, "mfr" as Source, "high", "Standard Range pack", EV9_SPECS(yr)) });

// `sr` picks the Standard Range column of the same table; `nacs` is MY2026+,
// where the car has the socket rather than an adapter for it.
const EV9_CHARGING = (yr: number, opts: { sr?: boolean; nacs?: boolean } = {}) => {
  const { sr = false, nacs = false } = opts;
  return {
    portStandard: nacs
      ? fb<"NACS">("NACS", "mfr", "high", undefined, EV9_PR_NACS)
      : fb<"CCS1">("CCS1", "mfr", "high", undefined, EV9_PR_ADAPTER),
    superchargerAccess: nacs
      ? fb<"native">("native", "mfr", "high", undefined, EV9_PR_NACS)
      : fb<"adapter">("adapter", "mfr", "high", "Kia supplied a NACS adapter free to 2024-25 EV9 buyers who took delivery from September 4, 2024", EV9_PR_ADAPTER),
    architectureV: fb(800, "mfr" as Source, "high", sr ? "632V nominal, Standard Range pack" : "552V nominal, Long Range pack", EV9_PR_LAUNCH),
    dcPeakKw: fb(sr ? 235 : 210, "mfr" as Source, "high", "On a 350 kW EVSE (max 310 A), Kia's specifications table", EV9_SPECS(yr)),
    // MY2025 splits from the other years (2026-09-01 fact-sheet audit): Kia's
    // own 2025 owner's manual states 27/34 min at 10-80% on a 350 kW charger
    // (printed p. 1-19, read as a page render) where the 2025 spec table says
    // 20/24 — both Kia's, and the 2024 and 2026 manuals agree with their spec
    // tables at 20/24. The slower figure is carried for 2025 (a faster-than-
    // real charge time is the false-bargain direction).
    chargeTime1080Min:
      yr === 2025
        ? fb(sr ? 27 : 34, "mfr" as Source, "high", "10-80% on a 350 kW charger, Kia's 2025 owner's manual; Kia's 2025 specification table states 20/24 min for the same cars", "https://cdn.dealereprocess.org/cdn/servicemanuals/kia/2025-ev9.pdf")
        : fb(sr ? 20 : 24, "mfr" as Source, "high", "10-80% on a 350 kW EVSE (max 310 A)", EV9_SPECS(yr)),
    acOnboardKw: fb(10.9, "mfr" as Source, "high", undefined, EV9_SPECS(yr)),
    dcFastCharging: fb<"standard">("standard", "mfr", "high", undefined, EV9_SPECS(yr)),
  };
};


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
// year's honest candidate set. Ranges carry the standard-wheel figure with
// the spread noted.
//
// Rivian's Part 565 kWh figures are NOT usable as gen-2 pack facts, corrected
// 2026-08-25. vPIC files no kWh at all for MY2025, and for MY2026 it files
// exactly Rivian's GEN-1 usable column against gen-2 pack names:
//
//   vPIC MY2026 "Standard Pack" 106  = gen-1 Dual Standard usable (real: 92.5)
//   vPIC MY2026 "Large Pack"    131  = gen-1 Dual Large    usable (real: 108)
//   vPIC MY2026 "Max Pack"      141  = gen-1 Dual Max      usable (real: 140)
//
// All three land on the gen-1 row of the same support table, which is what a
// carried-over spec sheet looks like, not three independent measurements. The
// control test is EPA: if MY2026 packs had really grown ~14%, range would have
// moved, and it did not — R1S Dual Standard (20in) is 258 mi in both MY2025
// (id 48435) and MY2026 (id 49717), same 277/235 city/highway, same 208 kW
// motor. Large is 300 mi in both. The packs did not change; the filing did.
// So gen-2 rows carry Rivian's own published figures and cite them, and the
// kWh hint is left to do only what it can still do honestly — see below.
//
// The gen-1 rows carry the same table for the same reason, corrected in a
// second pass the same day: their 128.9 was below the maker's own published
// usable, which a gross figure cannot be. The four gen-1 packs and their
// chemistry are settled at RIV_G1_LARGE / RIV_G1_MAX below.
//
// The hint filter (match.ts) is unharmed by this and gets better: its
// tolerance is 20%, so a 106 hint still admits the 92.5 Standard row (12.7%
// off) alongside Large, exactly as it admitted the old 106 row. What changes
// is the 131 hint, which used to keep the Standard row as a false candidate
// at 19.1% and now correctly drops it at 29.4%. No ignoreKwhHint needed.
const R1S = { make: "RIVIAN", model: "R1S" };
const R1T = { make: "RIVIAN", model: "R1T" };
const RIV_W = {
  batteryYears: f(8, "mfr" as Source),
  batteryMiles: f(175_000, "mfr" as Source, "high", "Rivian's battery warranty runs to 175,000 miles, the longest mileage term in the segment"),
  sohFloorPct: f(70, "mfr" as Source),
  batteryTransfers: f(true, "mfr" as Source),
};
const RIV_PORT1 = { portStandard: f<"CCS1">("CCS1", "mfr") };


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

// Taycan heat pump (backfill pass): gen 1 (MY2020–24) lists it as
// "optionally available" in the world-premiere, technology and Cross Turismo
// press kits — no trim exception, and no document moves it to standard
// mid-generation; gen 2 (MY2025+) puts "heat pump with a new cooling
// concept" on the expanded standard-equipment list for every trim. Macan
// Electric: Porsche's owner-support page attributes the heat pump to "Macan
// Electric starting from model year 2024" with no trim or option qualifier,
// but nothing Porsche publishes says standard/optional outright (the press
// kit describes the thermal system without the words — and the Cayenne
// Electric kit does too, so PPE-kit silence is a writing convention, not
// absence), hence standard at medium. Two search snippets misattributing
// these quotes were caught and rejected; the cited pages were fetched.
const TAY1_HP = { heatPump: fb<"optional">("optional", "mfr", "high", "\"A heat pump is optionally available\" on every gen-1 trim — the window sticker is the authority", "https://newsroom.porsche.com/dam/jcr:dc7ab9f5-5115-40d7-8b77-22c8c486c094/PAG-TaycanTurbo-WP-PM-EN.pdf") };
const TAY2_HP = { heatPump: fb<"standard">("standard", "mfr", "high", "On the gen-2 kit's expanded standard-equipment list, no trim excepted", "https://newsroom.porsche.com/en/press-kits/taycan/Die-Ausstattung.html") };
const MACAN_HP = { heatPump: fb<"standard">("standard", "mfr", "medium", "Porsche's support pages attribute the heat pump to every Macan Electric from MY2024; no Porsche document carries an explicit standard/optional marker", "https://ask.porsche.com/gb/en-GB/charging-capacity-macan-electric/") };
const NOTE_TAY_HP = { headline: "Heat pump: factory option, on the window sticker", severity: "trap" as const, resolvedBy: "config_resolved" as const };

// ── 2026-08-24 backfill shared facts ─────────────────────────────────────
// BMW packs: BMW's engineering spec sheets carry an explicitly-labelled
// "Net" figure that BMW USA's own press copy contradicts with a higher
// "net usable" number for the same car (i5: 81.2 vs 84.3; 2026 iX:
// 94.8/109.1/108.9 vs 100.1/113.4/112.8). The EU-to-US ratios sit exactly in
// BMW's own published gross-to-net band, so the US copy very likely relabels
// gross — but no BMW document says so, and the conservative call is the
// spec-sheet net figure at medium with the US number in the note.
const I5_PACK = { packUsableKwh: fb(81.2, "mfr", "medium", "BMW's spec-sheet net figure; BMW USA press copy prints 84.3 kWh net usable for the same pack", "https://www.press.bmwgroup.com/global/article/attachment/T0439978EN/612522") };
const I7_PACK = { packUsableKwh: fb(101.7, "mfr", "high", "105.7 kWh gross", "https://www.press.bmwgroup.com/usa/article/detail/T0382613EN_US/the-new-bmw-7-series") };
const I7_PACK_E50 = { packUsableKwh: fb(101.7, "est", "medium", "BMW states 101.7 kWh net for the xDrive60 and M70 sharing the platform; no BMW document publishes a figure for the eDrive50 itself") };
const IX26_SPECS = "https://www.press.bmwgroup.com/global/article/attachment/T0447642EN/630684";
// X5 PHEV: one 8yr/100k HV-battery term for BEV and PHEV alike in BMW's own
// MY2025-26 booklets (the 8/80k sometimes quoted is the federal
// emissions-devices line two rows below in the same chart). MY2025 TZEV-state
// cars got 10yr/150k; BMW withdrew that for MY2026. No booklet for the
// 45e's years (2021-23) is published anywhere BMW-hosted, so the 45e
// abstains rather than inheriting.
const X5_50E_WARRANTY = {
  batteryYears: fb(8, "mfr", "high", "8 years/100,000 miles in BMW's own booklets; MY2025 cars registered in California-TZEV states carry 10 years/150,000 miles, a term BMW withdrew for MY2026", "https://www.bmwusa.com/content/dam/bmw/marketUS/common/warranty-books/2026/BMW_MY26_NWLW%20Post_2025-09-11_ADA.pdf"),
  batteryMiles: fb(100_000, "mfr", "high", undefined, "https://www.bmwusa.com/content/dam/bmw/marketUS/common/warranty-books/2026/BMW_MY26_NWLW%20Post_2025-09-11_ADA.pdf"),
};
const X5_45E_WARRANTY_ABSTAIN = "BMW's MY2021-23 warranty booklets are not published anywhere BMW-hosted and the MY2025-26 booklets do not list the xDrive45e, so its term is not stated";
const X5_HP_ABSTAIN = "BMW attributes a heat pump to the battery-electric iX5 in the same release that describes the PHEV's climate system without one, but no BMW document states the PHEV's hardware either way";
// Stellantis: the press kits say 17 kWh unqualified, but the Wrangler 4xe
// SPECIFICATION sheets (2021, 2023, 2023 Rubicon 20th, 2024, 2025 — all on
// media.stellantisnorthamerica.com view-spec.do) print "Gross Capacity
// 17.3 kWh" in their HIGH VOLTAGE BATTERY table. An earlier version of this
// comment said 17.3 "appears in no Stellantis document" — that was
// generalized from press kits without opening a spec sheet, and was
// falsified 2026-09-01 by two independent 250-dpi page reads with matching
// md5s. The Grand Cherokee 4xe keeps the press-kit 17 because its spec
// sheets have not been re-verified the same way. Stellantis's US press kits
// and owner's manuals (15 checked, including the Wagoneer S manuals) never
// use the term "heat pump" for any model, so no heat-pump claim can be made
// in either direction for any Stellantis car.
const WRANGLER_4XE_KWH_NOTE = "Stellantis's specification sheets print Gross Capacity 17.3 kWh; its press kits state 17 kWh unqualified";
const JEEP_17KWH_NOTE = "Stellantis's press kits state 17 kWh with no gross or usable qualifier";
const STELLANTIS_HP_ABSTAIN = "Stellantis's US press kits and owner's manuals never use the term heat pump for any model, so neither presence nor absence can be stated";
const MOPAR_W_25 = "https://vehicleinfo.mopar.com/assets/publications/en-us/Jeep/2025/103465_25_J_GW_EN_US_DIGITAL_E1_V2.pdf";
const MOPAR_W_21 = "https://vehicleinfo.mopar.com/assets/publications/en-us/Jeep/2021/Wrangler_4xe/P140475_21_JL_H_GW_EN_US_DIGITAL.pdf";
// Facts verified against Mopar's own booklets on 2026-09-01, after the
// 2026-08-24 backfill pass they correct.
const AS_OF_W4XE = "2026-09-01";
function fw<T>(value: T, source: Source, confidence: Fact<T>["confidence"], note: string | undefined, sourceUrl: string): Fact<T> {
  return { value, source, asOf: AS_OF_W4XE, confidence, note, sourceUrl };
}
// The 4xe's battery term is not one term across its years, and the single
// 2021-2025 row that used to sit here understated a 2021 truck by two full
// years. The 2021 booklet has no 8-year figure anywhere in it: its coverage
// chart runs the high voltage battery bar to 10 years/150,000 miles in ZEV
// states and 10 years/100,000 miles in non-ZEV states. The 8/100k term starts
// with MY2022. Split at that boundary 2026-09-01 on two independent reads of
// all five Mopar booklets, with matching md5s and 220-dpi page renders of the
// chart — pdftotext flattens that bar matrix to a list of row labels with the
// bars lost, so the image is the only honest read of it.
// docs/agents/factsheet-wrangler-4xe-battery-warranty-AUDIT.md is the record.
//
// The trap that audit names, and the reason 2023 is inside the 8/100k span
// rather than getting a ZEV split of its own: the 10/150k line on the 2023
// chart belongs to the GRAND CHEROKEE 4xe, printed in a physically separate
// cell from the Wrangler 4xe's flat 8/100k. Reading the neighbouring cell is
// the obvious way to get this year wrong.
//
// batteryMiles stays the non-ZEV figure in both spans — the term every truck
// carries wherever it is registered — and the longer state-conditional term
// rides in the note. warranty.ts reads these values to decide whether THIS
// car's coverage has run out, and a 150,000-mile ceiling would call a
// 120,000-mile truck outside a ZEV state covered when it is not.
const WRANGLER_4XE_WARRANTY_21 = {
  batteryYears: fw(10, "mfr", "high", "10 years/150,000 miles in California-ZEV states and 10 years/100,000 miles elsewhere, per the 2021 Mopar booklet, which carries no 8-year term", MOPAR_W_21),
  batteryMiles: fw(100_000, "mfr", "high", undefined, MOPAR_W_21),
};
const WRANGLER_4XE_WARRANTY_22_25 = {
  batteryYears: fw(8, "mfr", "high", "8 years/100,000 miles in the 2022, 2023, 2024 and 2025 Mopar booklets; the 2024-25 booklets add 10 years/150,000 miles in California-TZEV states", MOPAR_W_25),
  batteryMiles: fw(100_000, "mfr", "high", undefined, MOPAR_W_25),
};
// Everything all six Wrangler 4xe rows share. Extracted when the warranty
// split doubled the three: the pack, the EPA pair and the inlet are one set
// of facts, and six copies of a figure is six places for the next correction
// to miss one.
const WRANGLER_4XE_FACTS = {
  abstains: { heatPump: STELLANTIS_HP_ABSTAIN },
  battery: { packGrossKwh: fb(17.3, "mfr" as Source, "high", WRANGLER_4XE_KWH_NOTE, "https://media.stellantisnorthamerica.com/view-spec.do?id=26156") },
  range: {
    epaRangeMi: f(22, "mfr" as Source, "high", "Electric-only EPA range. Identical rating 2021–25", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47278"),
    epaRangeTotalMi: f(370, "mfr" as Source, "high", undefined, "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47278"),
  },
  charging: {
    portStandard: f<"J1772">("J1772", "mfr", "high", "AC charging only, no DC fast charge on any 4xe"),
    dcFastCharging: f<"none">("none", "mfr"),
  },
};
const GC_4XE_WARRANTY = {
  batteryYears: fb(8, "mfr", "high", "10 years/150,000 miles in California-ZEV/TZEV states and 8 years/100,000 miles elsewhere, per the 2022-2025 Mopar booklets", MOPAR_W_25),
  batteryMiles: fb(100_000, "mfr", "high", undefined, MOPAR_W_25),
};
const WAGONEER_S_WARRANTY = {
  batteryYears: fb(8, "mfr", "high", "The Electric Vehicles Only clause of Stellantis's brand-wide booklet; the 10-year TZEV term is PHEV-only and does not apply", MOPAR_W_25),
  batteryMiles: fb(100_000, "mfr", "high", undefined, MOPAR_W_25),
};
// Nissan Leaf warranty booklets, one per model year, all Nissan-hosted.
const LEAF_WB = (yr: number) => `https://owners.nissanusa.com/content/techpub/ManualsAndGuides/LEAF/${yr}/${yr}-LEAF-warranty-booklet.pdf`;
const LEAF_CAPACITY_LETTER = "https://static.nhtsa.gov/odi/tsbs/2013/CSC-10052321-8586.pdf";
const LEAF_PK_2016 = "https://usa.nissannews.com/en-US/releases/us-2016-nissan-leaf-press-kit";
const LEAF_PK_2017 = "https://usa.nissannews.com/en-US/releases/us-2017-nissan-leaf-press-kit";
const LEAF_PK_2026 = "https://usa.nissannews.com/en-US/releases/2026-nissan-leaf-press-kit";
const ROGUE_PHEV_KIT = "https://usa.nissannews.com/en-US/releases/2026-nissan-rogue-plug-in-hybrid-press-kit";
const ROGUE_PHEV_WB = "https://www.nissanusa.com/content/dam/Nissan/us/manuals-and-guides/rogue-plug-in-hybrid/2026/2026-nissan-rogue-plug-in-hybrid-warranty-booklet.pdf";
// Hyundai: spec sheets state "Battery System Capacity" with no gross/usable
// qualifier anywhere; feature tables carry an explicit per-trim Heat Pump
// row (the same table family that proves Kona absences — it lists the PTC
// heater and, on Ioniq 5, a separate heat-pump row).
const HY_UNQUAL = "Stated as Battery System Capacity, with no gross or usable split";
const I6_SPECS_23 = "https://www.hyundainews.com/assets/documents/original/53942-2023IONIQ6ProductSpecs022223.pdf";
const I6_FEAT_23 = "https://www.hyundainews.com/assets/documents/original/53941-2023IONIQ6ProductFeatures022223.pdf";
const I6_SPECSFEAT_25 = "https://www.hyundainews.com/assets/documents/original/64772-2025IONIQ6SpecsFeatures011525.pdf";
const I6_PACK_LR = { packGrossKwh: fb(77.4, "mfr", "high", HY_UNQUAL + "; same figure on the 2023-25 sheets", I6_SPECS_23) };
const I6_PACK_SR = { packGrossKwh: fb(53, "mfr", "high", HY_UNQUAL + "; same figure on the 2023-25 sheets", I6_SPECS_23) };
const I6_HP_STD = { heatPump: fb<"standard">("standard", "mfr", "high", "Standard on SE Long Range, SEL and Limited; only the SE Standard Range lacks it", I6_FEAT_23) };
const I6_HP_NONE = { heatPump: fb<"none">("none", "mfr", "high", "Hyundai's feature tables mark the heat pump long-range-only; the SE Standard Range carries a PTC heater", I6_SPECSFEAT_25) };
const I9_HP = { heatPump: fb<"standard">("standard", "mfr", "high", "Standard on every trim, S through Calligraphy", "https://www.hyundainews.com/assets/documents/original/65341-2026IONIQ9SpecsFeatures20250305.pdf") };
const KONA24_SPECS = "https://www.hyundainews.com/assets/documents/original/57132-2024KonaElectricSpecs0505232.pdf";
const KONA24_FEAT = "https://www.hyundainews.com/assets/documents/original/57131-2024KonaElectricFeatures0505232.pdf";
const KONA25_PRICE = "https://www.hyundainews.com/assets/documents/original/64645-2025MYKonaEVPriceSheet20Dec2024.pdf";
const KONA_CARRYOVER = "https://www.hyundainews.com/assets/documents/original/63005-Hyundai2025ModelYearChanges20240815v12.pdf";
const KONA_HP_NONE_24 = { heatPump: fb<"none">("none", "mfr", "high", "Hyundai's 2024 feature table lists a PTC heater and no heat pump; the Ioniq 5's same-family table names one, so the absence is stated", KONA24_FEAT) };
const KONA_HP_NONE_25 = { heatPump: fb<"none">("none", "mfr", "medium", "Hyundai declares MY2025 a carry-over of the 2024 car, whose feature table lists only a PTC heater", KONA_CARRYOVER) };
// Honda: no Honda US document names climate-system technology for any model
// — spec sheets, press kits, and 591-page owner's manuals are all silent,
// and the Prologue manual calls its control "the automatic heater" — so no
// control test is possible and no heat-pump claim can be made either way.
const HONDA_HP_ABSTAIN = "Honda's US documentation never names climate-system technology for any model, so nothing can be stated either way";
const PROLOGUE_SPECS = "https://hondanews.com/en-US/honda-automobiles/releases/release-28556cec8c60d45354dbdd1404019b30-2025-honda-prologue-specifications-features";
const HONDA_BEV_WB = "https://owners.honda.com/Documentum/Warranty/Handbooks/2025_Honda_BEV_Warranty_Basebook.pdf";
const CHR_PRESS = "https://pressroom.toyota.com/2026-toyota-c-hr-puts-sporty-stylish-spin-on-the-compact-electric-suv/";
const ID4_HP_NONE = { heatPump: fb<"none">("none", "mfr", "high", "VW's ID.4 releases state an electric resistance heater as the cabin heater and the per-trim feature sheets list no heat pump; VW's e-Golf sheets carried one as a line item", "https://media.vw.com/assets/applications/original/19461-2025-id4-release-final.pdf") };
// Rivian: the adapter guide splits the charge inlet at the model year —
// native CCS1 through MY2025 (gen 2 included), native NACS from MY2026 —
// so rows spanning 2025-26 abstain and carry the split as a buyer note.
const RIV_USABLE = "https://rivian.com/support/article/what-is-the-usable-kwh-capacity-of-your-batteries";
// The spec table is the second Rivian article, and it is a different document
// from the usable-capacity one: it publishes rated capacity, chemistry, part
// number and cell count per configuration. Facts that quote a RATED figure
// must cite this one — the usable table never states a rated number.
const RIV_SPECS = "https://rivian.com/support/article/what-are-the-battery-specifications-on-rivian-vehicles";
// Gen-2 (MY2025+) packs, from those two tables rather than from Part 565.
// Standard is the LFP pack (95.6 kWh rated, 252 cells) — vPIC agrees on the
// chemistry for MY2026 and only its kWh is stale. Max/Tri/Quad share one pack
// (part PT00668219-H), rated and usable both 140.
// Notes stay inside inlineNote()'s 14 words and state the fact rather than
// naming the document — the sourceUrl citation already names Rivian. The Max
// note omits the rated figure on purpose: rated and usable are both 140, so
// saying "140 rated" under a 140 would imply a distinction that isn't there.
//
// Chemistry (2026-08-25): the spec table publishes it per configuration, and
// it is the one column vPIC corroborates rather than contradicts — the MY2026
// Standard VIN 7PDSGGBA0TN077423 decodes to "Lithium iron phosphate (LFP)" in
// both Battery Type and Other Engine Info, against a table that had already
// said "Li Fe (LFP)". Two independent sources, same answer, so the LFP row is
// a fact and not a reading of one document. Everything else on that table is
// NCA ("Li MM (NCA)"), including the Large Plus, which shares the Max's part
// number PT00668219-H. NCA is carried as NCA, never folded into the NMC entry
// in chemistry-info.ts: that tooltip makes cold-weather and daily-charge-
// ceiling claims, and the two chemistries do not behave the same way.
const RIV_G2_STD = {
  packUsableKwh: fb(92.5, "mfr", "high", "Gen-2 Dual Standard pack, LFP; 95.6 kWh rated", RIV_USABLE),
  chemistry: fb<Chemistry>("LFP", "mfr", "high", "Gen-2 Dual Standard pack", RIV_SPECS),
};
const RIV_G2_LARGE = {
  packUsableKwh: fb(108, "mfr", "high", "Gen-2 Dual Large pack; 109.8 kWh rated", RIV_USABLE),
  chemistry: fb<Chemistry>("NCA", "mfr", "high", "Gen-2 Dual Large pack", RIV_SPECS),
};
const RIV_G2_LARGEPLUS = {
  packGrossKwh: fb(140, "mfr", "medium", "Rivian's battery-spec table rates the Dual Large+ at the Max-class 140 kWh; its usable-capacity table omits this pack", RIV_SPECS),
  chemistry: fb<Chemistry>("NCA", "mfr", "high", "Gen-2 Large Plus pack, the same pack as Max", RIV_SPECS),
};
const RIV_G2_MAX = {
  packUsableKwh: fb(140, "mfr", "high", "Gen-2 Max pack, shared by Dual, Tri and Quad", RIV_USABLE),
  chemistry: fb<Chemistry>("NCA", "mfr", "high", "Gen-2 Max pack, shared by Dual, Tri and Quad", RIV_SPECS),
};

// Gen-1 (2022-2024) kWh, corrected 2026-08-25. These rows carried
// packGrossKwh 128.9 (Large) and 141 (Max) sourced "vin", and both labels
// were wrong:
//
//   * 128.9 is below Rivian's PUBLISHED USABLE 131 for the same gen-1 Large
//     pack, and a gross figure cannot sit under the usable one it contains.
//     It is also a MY2022-only number — vPIC files 128.90 for the 110 cached
//     'N' VINs and nothing at all for MY2023 ('P') or MY2024 ('R') — so on
//     two of the three years it was labelled "vin" while no VIN said it.
//   * 141 IS Rivian's gen-1 Dual Max usable figure, carried under the gross
//     label. No gen-1 VIN in the cache returns it; the only 141s are MY2026
//     'T' VINs, which is the stale-generation filing documented above.
//
// So the maker's own usable table wins on both, which is also what the
// neighbouring gen-1 Standard (106) and Standard+ (121) rows already cite —
// the four gen-1 packs now come from one table instead of two sources. The
// kWh hint is unaffected: it reads packUsableKwh ?? packGrossKwh at 20%
// tolerance (match.ts), and 131 is 1.6% off the 128.9 a MY2022 VIN hints.
//
// Gen-1 chemistry is NOT set. The spec table above is gen-2 only — it lists
// no 2022-2024 configuration at all — and no other Rivian document was found
// stating it, so these rows stay silent rather than assume the gen-2 answer
// carries back. No `abstains` entry: that mechanism is scoped to the five
// core fields (types.ts AbstainableField), and chemistry is not one.
const RIV_G1_LARGE = {
  packUsableKwh: fb(131, "mfr", "high", "Gen-1 Large pack, shared by Dual and Quad", RIV_USABLE),
};
const RIV_G1_MAX = {
  packUsableKwh: fb(141, "mfr", "high", "Gen-1 Dual Max pack", RIV_USABLE),
};
const RIV_ADAPTER = "https://rivian.com/support/article/do-i-need-an-adapter";
const RIV_PORT_ABSTAIN = "Rivian's adapter guide gives MY2022-25 cars a native CCS1 inlet and MY2026 a native NACS port, and this row spans both years";
const NOTE_RIV_PORT = { headline: "Charge port: CCS1 through 2025, native NACS from 2026", severity: "info" as const };
const FORD_L22_SPECS = "https://www.fromtheroad.ford.com/content/dam/fordmediasite/us/en/library/2022/specs/F-150_Lightning_Tech_Specs.pdf";
const MACHE_SPECS_23 = "https://media.ford.com/content/dam/fordmedia/North%20America/US/2023/05/02/2023%20Mustang%20Mach-E%20Tech%20Specs.pdf";
const MACHE_SPECS_24 = "https://media.ford.com/content/dam/fordmedia/North%20America/US/2024/04/09/2024%20Mustang%20Mach-E%20Tech%20Specs.pdf";
const ESCAPE_HP_ABSTAIN = "Ford has published no heat-pump claim for the Escape PHEV in either direction: six owner's manuals name none where the Transit's manual lists heat-pump fuses, but silence is all there is";
// Tesla packs: Tesla publishes no capacity itself, but its EPA certification
// filings declare Usable Battery Energy (SAE J1634 MCT) per carline — the
// maker's own federally-filed figure, superseding the older teardown-consensus
// estimates. Where EPA labels two carlines with different packs under one
// name (-E/-I/-B variants a listing can't separate), the LOWER figure is
// carried at medium with the spread in the note; where the spread is
// material (2026 Premium RWD: 62.4 vs 80.4) the row abstains. UBE is
// measured to shutdown, so it runs a little above the owner-visible figure.
const TESLA_UBE = "EPA-certified usable battery energy (SAE J1634 multi-cycle test)";
const epaCert = (docid: number) => `https://dis.epa.gov/otaqpub/display_file.jsp?docid=${docid}&flag=1`;
const tUBE = (kwh: number, docid: number, extra?: string, conf: Fact<number>["confidence"] = "high") =>
  fb(kwh, "mfr", conf, extra ? `${TESLA_UBE}; ${extra}` : TESLA_UBE, epaCert(docid));
const tPack = (kwh: number, docid: number, extra?: string, conf: Fact<number>["confidence"] = "high") => ({
  packUsableKwh: tUBE(kwh, docid, extra, conf),
});
// Volvo: nominal AND usable pairs live in its technical-specification
// documents (293983/321762/321752 and the Sep-2020 XC40 sheet). The MY2024
// Twin is a Volvo-vs-Volvo conflict: the launch announcement said it kept
// the 78 kWh pack, both Nov-2023 engineering sheets say 82/79. Heat pump:
// the support-page template names one for EX30/EX90 and none for XC40/C40
// (a clean in-template control), and the MY2021 XC40 sold it as a $350
// option — so EX30/EX90 are standard, MY2021 XC40 optional, and the other
// XC40/C40 years abstain because fitment is per-car and undocumented.
const VOLVO_WTY_RECHARGE = "https://www.volvocars.com/images/cs/v3/assets/bltccbab8edae0354cd/blt4f19a914b40839f4/68418a38c0bac2e8c68bb704/WTY572.04.23_Volvo_MY2024_Recharge_PE_Wty_Manual_CC_02-07-23.pdf";
const VOLVO_WTY_FULLY = "https://www.volvocars.com/images/cs/v3/assets/bltccbab8edae0354cd/blt79f8a67d798c8d78/68befcffe94f786661a1f43a/MY2026_WTY572.06.25_Fully_Elec_Wty_Manual_Rev2_WEB_06-18-25.pdf";
const volvoWty = (url: string) => ({
  batteryYears: fb(8, "mfr", "high", undefined, url),
  batteryMiles: fb(100_000, "mfr", "high", undefined, url),
  sohFloorPct: fb(70, "mfr", "high", "Replaced free of charge if State of Health falls below 70% within the term", url),
  batteryTransfers: fb(true, "mfr", "high", undefined, url),
});
const VOLVO_HP_ABSTAIN = "Volvo documented a heat pump only as a MY2021 XC40 option, and its support pages name none for the XC40/C40 while the EX30 and EX90 pages do, so per-car fitment cannot be stated";
const EX30_HP = { heatPump: fb<"standard">("standard", "mfr", "high", "Works primarily as a range extender, heating the cabin and conditioning the battery", "https://www.volvocars.com/us/support/car/ex30/article/47d2c97fd33effd3c0a8cc3718c999b7-e30030ab6001809cc0a8cc5329b8a9a9-8664b2fa77a7e089c0a8296870d1a409/") };
const EX90_HP = { heatPump: fb<"standard">("standard", "mfr", "high", "Works primarily as a range extender, heating the cabin and conditioning the battery", "https://www.volvocars.com/us/support/car/ex90/article/47d2c97fd33effd3c0a8cc3718c999b7-e30030ab6001809cc0a8cc5329b8a9a9-8664b2fa77a7e089c0a8296870d1a409/") };
const NOTE_HP_OPTION = { headline: "Heat pump: factory option, on the window sticker", severity: "trap" as const, resolvedBy: "config_resolved" as const };
const VOLVO_SPECS_23 = "https://media-downloads.volvocars.com/21edb0df-acb9-4519-9b4d-b33e001c8978/293983_1_5.xlsx";
const VOLVO_SPECS_24_XC40 = "https://media-downloads.volvocars.com/0c21ae4a-05de-46a4-88ad-b33e001ce965/321762_1_5.pdf";
const VOLVO_SPECS_24_C40 = "https://media-downloads.volvocars.com/f493003e-541b-4ba6-8dc5-b33e001ce7e1/321752_1_5.pdf";
const PS2_PLUS_PACK = "https://web.archive.org/web/20220520094320/https://www.polestar.com/us/polestar-2/plus-pack/feature-comparison/";

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

  // The AC inlet. All fourteen rows below carry it, because without it the
  // detail page printed "Port: Unknown" on every one of them — a car whose
  // plug we supposedly hadn't researched, sitting directly under a row
  // already reading "DC fast charging: Not available". That is exactly the
  // half-stocked render scripts/enrichment-coverage.mjs was built to catch,
  // and it caught it: the port was the field it named on all fourteen.
  //
  // "No DC port" and "J1772 AC inlet" are two different facts and only the
  // first is what `dcFastCharging: none` records, so this is stated rather
  // than derived from it.
  //
  // Tagged `est`, not `mfr`, and that is the deliberate half of this. No
  // manufacturer document consulted this pass names the connector: the 2024
  // Pacifica spec sheet already cited below has no charging section at all,
  // and Toyota's RAV4 Prime release says "level II charger" without saying
  // which standard that is. J1772 is the only Level 2 AC inlet any US-market
  // plug-in has been fitted with across these model years, which is why the
  // confidence is high — but uncontested is not the same as sourced, and the
  // house rule is that anything short of the maker's own figure carries the
  // est marker. NOTE: the eight PHEV rows already in this file (Wrangler and
  // Grand Cherokee 4xe, X5 45e/50e, Rogue PHEV) tag the same fact `mfr` with
  // no sourceUrl. They are not changed here — demoting a figure another pass
  // may have verified, on nothing but the absence of a URL, would be its own
  // unevidenced claim — but the two tags cannot both be right, and whichever
  // pass next opens a maker's manual should settle all twenty-two together.
  const PHEV_J1772 = fp<"J1772">("J1772", "est", "high", "AC charging only, no DC fast charge");

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
      abstains: { heatPump: "GM documents never name cabin-heating hardware - even the Blazer EV's manual, whose press release touts the Ultium heat pump, never says the words - so no control test is possible" },
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
        portStandard: PHEV_J1772,
        dcFastCharging: VOLT_NO_DCFC,
      },
      warranty: VOLT_WARRANTY,
    },
    {
      // The owner's own trigger case: 2014 is a Gen 1 Volt, in this bucket.
      id: "volt-2013-15", make: "CHEVROLET", model: "Volt", modelYears: [2013, 2015],
      abstains: { heatPump: "GM documents never name cabin-heating hardware - even the Blazer EV's manual, whose press release touts the Ultium heat pump, never says the words - so no control test is possible" },
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
        portStandard: PHEV_J1772,
        dcFastCharging: VOLT_NO_DCFC,
      },
      warranty: VOLT_WARRANTY,
    },
    {
      id: "volt-2016-19", make: "CHEVROLET", model: "Volt", modelYears: [2016, 2019],
      abstains: { heatPump: "GM documents never name cabin-heating hardware - even the Blazer EV's manual, whose press release touts the Ultium heat pump, never says the words - so no control test is possible" },
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
        portStandard: PHEV_J1772,
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
    // "RAV4 Prime (PHEV)" is vPIC's own model string, not a dealer's. The
    // /vin/ lookup page matches on what vPIC returns rather than on a feed's
    // model field, and vPIC suffixes Toyota's two Prime nameplates — every
    // other PHEV in this file decodes to a bare name ("Volt", "Escape",
    // "Clarity", "Pacifica", checked by VIN 2026-08-22). Without it the VIN
    // check answered "No researched row for this model yet" on a car this
    // file has thirteen sourced facts about.
    modelAliases: ["RAV4 PHEV", "RAV4 Plug-In Hybrid", "RAV4 PLUG-IN", "RAV4 Prime (PHEV)"],
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
      portStandard: PHEV_J1772,
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
  // "Prius Prime (PHEV)" is vPIC's string for every Prime model year, the
  // same /vin/-page gap described on the RAV4 Prime row above.
  const PRIUS_ALIASES = ["Prius PHEV", "Prius PHEV SE", "Prius Plug-In Hybrid", "Prius Prime (PHEV)"];
  const PRIUS_PRIME_2017_RELEASE = "https://pressroom.toyota.com/prime-mover-toyota-creates-2017-prius-prime/";
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
    portStandard: PHEV_J1772,
    dcFastCharging: fp<"none">("none", "est", "medium", "Same PHEV architecture as RAV4 Prime, but not re-run against a Prius-specific control document this pass"),
  };
  const PRIUS_GEN3_BATTERY = { packGrossKwh: fp(13.6, "mfr", "high") };
  const PRIUS_GEN3_CHARGING = {
    portStandard: PHEV_J1772,
    // Onboard AC charger omitted: sources conflict 3.5 vs 6.6 kW and this
    // pass didn't resolve it to one number — omit rather than guess.
    dcFastCharging: fp<"none">("none", "est", "medium", "Same PHEV architecture as RAV4 Prime, but not re-run against a Prius-specific control document this pass"),
  };
  // Gen 2's own source, found 2026-08-22 and closing one of the four heat-pump
  // gaps docs/agents/phev-enrichment-2026-08-21.md left open (its §5: "Prius
  // Prime: ... Gen 2 heat pump status"). Toyota's MY2017 launch release
  // describes it directly: "The climate control system can also operate
  // without the engine running, with a heat pump that allows the system to
  // cool or heat the cabin while driving in EV mode", and "The heat pump can
  // function without the engine running in weather down to 14 degrees F,
  // where a conventional heat pump system could only function with the
  // temperature above 32 F."
  //
  // Worth knowing for the Gen 3 row below: it carries the heat pump on the
  // RAV4 Prime release's "based on Prius Prime's" line, but the RAV4 Prime
  // launched for MY2021 and the only Prius Prime in production then was
  // THIS one. So that borrowed citation was always pointing at Gen 2. Gen 3
  // is left as it stands — the system did carry forward — but a Gen-3
  // -specific source is still the thing that would settle it.
  const PRIUS_GEN2_THERMAL = { heatPump: fp<"standard">("standard", "mfr", "high", "Heats the cabin in EV mode down to 14°F", PRIUS_PRIME_2017_RELEASE) };
  const PRIUS_GEN3_THERMAL = { heatPump: fp<"standard">("standard", "mfr", "high", "Same heat-pump system Toyota describes for the RAV4 Prime, quoted from that press release rather than a Prius-specific one", RAV4_PRIME_RELEASE) };
  const PRIUS_PRIME_ROWS: EnrichmentRow[] = [
    {
      id: "prius-prime-2017-19", make: "TOYOTA", model: "Prius Prime", modelYears: [2017, 2019],
      modelAliases: PRIUS_ALIASES,
      battery: PRIUS_GEN2_BATTERY,
      range: PRIUS_GEN2_RANGE,
      charging: PRIUS_GEN2_CHARGING,
      thermal: PRIUS_GEN2_THERMAL,
      warranty: TOYOTA_WARRANTY_PRE2020,
    },
    {
      id: "prius-prime-2020-22", make: "TOYOTA", model: "Prius Prime", modelYears: [2020, 2022],
      modelAliases: PRIUS_ALIASES,
      battery: PRIUS_GEN2_BATTERY,
      range: PRIUS_GEN2_RANGE,
      charging: PRIUS_GEN2_CHARGING,
      thermal: PRIUS_GEN2_THERMAL,
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
  // MY2026 carryover, checked 2026-08-25 before extending the second row's
  // window from 2025 to 2026 (the row id keeps its launch-year name, the way
  // data3's escalade-iq-2026 does, because tests and backfill.ts key on it):
  //   - EPA published a MY2026 record, id 49762, and every figure on it is the
  //     2020 record's figure to the digit — 32 electric miles, 520 total, 82
  //     MPGe electric, 48 blended, 30 on gasoline, 2.0 hr at 240 V, the same
  //     89 kW AC induction motor. Not "close": identical, and 2024 (47276) and
  //     2025 (48656) are identical too, so the span is one rating throughout.
  //   - Stellantis' own MY2026 spec sheet — media.stellantisnorthamerica.com/
  //     view-spec.do?id=27042, read as a RENDERED PAGE rather than extracted
  //     text, because the pack figure sits in a two-column table — repeats the
  //     2024 sheet's pack wording verbatim: "High-voltage, 96 cell Li-ion,
  //     16 kWh total energy, 360-volt nominal". It stays in this comment
  //     rather than on the facts because the facts below are shared with the
  //     2017-19 row, which that sheet says nothing about.
  //   - That sheet has no charging section at all and never says "heat pump",
  //     which is the same silence the DC-fast-charging and heat-pump facts
  //     below were already written against, one model year further on.
  const PACIFICA_ALIASES = ["Pacifica Plug-In Hybrid", "Pacifica"];
  const PACIFICA_BATTERY = { packGrossKwh: fp(16, "mfr", "high", "96-cell Li-ion, 360V nominal", PACIFICA_2024_SPEC) };
  const PACIFICA_CHARGING = {
    acOnboardKw: fp(6.6, "est", "medium", "Recurs across independent sources; not itemized as a line item in Stellantis's own spec sheets"),
    portStandard: PHEV_J1772,
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
      id: "pacifica-hybrid-2020-25", make: "CHRYSLER", model: "Pacifica Hybrid", modelYears: [2020, 2026],
      modelAliases: PACIFICA_ALIASES,
      battery: PACIFICA_BATTERY,
      range: {
        epaRangeMi: fp(32, "mfr", "high", "Electric-only EPA range. Identical rating 2020–2026", epa(41943)),
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
    portStandard: PHEV_J1772,
    dcFastCharging: fp<"none">("none", "est", "high"),
  };
  // Ford's own page states no CARB-state extension, unlike Toyota/Stellantis.
  const ESCAPE_WARRANTY = { batteryYears: fp(8, "mfr", "high", undefined, FORD_ESCAPE_WARRANTY_URL), batteryMiles: fp(100_000, "mfr", "high", undefined, FORD_ESCAPE_WARRANTY_URL) };
  const ESCAPE_ROWS: EnrichmentRow[] = [
    {
      id: "escape-phev-2020-22", make: "FORD", model: "Escape PHEV", modelYears: [2020, 2022],
      abstains: { heatPump: ESCAPE_HP_ABSTAIN },
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
      abstains: { heatPump: ESCAPE_HP_ABSTAIN },
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
      abstains: { heatPump: ESCAPE_HP_ABSTAIN },
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
    abstains: { heatPump: "Honda documents it neither way: the Clarity materials list only dual-zone climate control and even Honda's BEV manuals never use the term heat pump, so no control test is possible" },
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
      portStandard: PHEV_J1772,
      dcFastCharging: fp("none", "est", "high"),
    },
    warranty: {
      batteryYears: fp(8, "est", "medium", "Possibly 10 yr / 150,000 mi in CARB states, matching the Toyota/Stellantis pattern, but not confirmed against a Honda primary document or exact state list this pass"),
      batteryMiles: fp(100_000, "est", "medium"),
    },
  };

// The Audi Q4 constants went with the Q4 rows to data10 (2026-08-25); see
// the moved-block note further down for what data10 carries that this file
// did not. The MY2024 refresh release (media.audiusa.com/releases/597) and
// the heat-pump abstention both live there now.

// Same caveat as the e-tron GT row in data3: the 8yr/100k HV-battery term is
// consistently reported but not confirmed in a readable Audi USA primary doc.
const AUDI_W = {
  batteryYears: f(8, "agg" as Source, "low", "Commonly reported across dealer/aggregator sources but not confirmed in a readable Audi USA primary document"),
  batteryMiles: f(100_000, "agg" as Source, "low", "Same caveat as batteryYears"),
};

const GM_NACS_TABLE_2026 = "https://news.gm.com/home.detail.html/Pages/topic/us/en/2026/aug/0813-electric-vehicle-nacs-charging.html";
export const RESEARCH_ROWS_4: EnrichmentRow[] = [
  // ── MY2022 ─────────────────────────────────────────────────────────────
  {
    id: "lightning-2022-sr",
    make: "FORD",
    model: "F-150 Lightning",
    modelYears: [2022, 2022],
    vin8: ["L"],
    packVariant: "Standard Range",
    battery: { packUsableKwh: fb(98, "mfr", "high", "Stated as usable energy; a preproduction figure", FORD_L22_SPECS) },
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
    battery: { packUsableKwh: fb(131, "mfr", "high", "Stated as usable energy; a preproduction figure", FORD_L22_SPECS) },
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
    battery: { packUsableKwh: fb(131, "mfr", "high", "Stated as usable energy; a preproduction figure", FORD_L22_SPECS) },
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
    battery: { packGrossKwh: { value: 66, source: "mfr", asOf: "2026-08-24", confidence: "high", note: "GM states one unqualified kWh figure, never split gross and usable", sourceUrl: "https://web.archive.org/web/20220119021035id_/https://media.chevrolet.com/content/dam/Media/documents/US/PDF/fastfacts/chevrolet/2020/20_FF_Chevrolet%20Bolt%20EV.pdf" } },
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
      { headline: "Most 2020–22 cars kept their original packs", severity: "info", resolvedBy: "campaign_check" },
      { headline: "No capacity floor on the battery warranty", severity: "warning" },
    ],
  },
  {
    id: "bolt-euv-2022-23",
    make: "CHEVROLET",
    model: "Bolt EUV",
    // Same vPIC stripping as the Bolt EV rows, same reason it is safe.
    modelAliases: ["Bolt"],
    modelYears: [2022, 2023],
    battery: { packGrossKwh: { value: 65, source: "mfr", asOf: "2026-08-24", confidence: "high", note: "GM states one unqualified kWh figure, never split gross and usable", sourceUrl: "https://web.archive.org/web/20230126153221/https://media.chevrolet.com/content/media/us/en/chevrolet/2022-bolt-euv-bolt-ev.detail.print.html/content/Pages/news/us/en/2021/feb/0214-boltev-bolteuv-specifications.html" } },
    range: { epaRangeMi: f(247, "mfr", "high", "Bolt EUV, both years, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=45750") },
    charging: { dcFastCharging: f("standard", "mfr"), portStandard: f("CCS1", "mfr") },
    thermal: { heatPump: f("none", "mfr") },
    warranty: {
      batteryYears: f(8, "mfr"),
      batteryMiles: f(100_000, "mfr"),
      batteryTransfers: f(true, "mfr", "high"),
    },
    buyerNotes: [
      { headline: "Most 2020–22 cars kept their original packs", severity: "info", resolvedBy: "campaign_check" },
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
    battery: { chemistry: ME_LFP, packUsableKwh: fb(72, "mfr", "high", "The Standard Range pack's stated usable capacity", MACHE_SPECS_23) },
    range: { epaRangeMi: f(250, "mfr", "high", "MY2023 Standard Range RWD, post-switch LFP build (VIN engine code 4), EPA's separate “RWD LFP” certification", epa(46985)) },
    charging: { ...ME_PORT_EARLY, dcPeakKw: ME_DC_SR },
    thermal: { heatPump: ME_NO_HP },
    warranty: ME_WARRANTY,
    buyerNotes: [NOTE_RECALLS_2023, NOTE_BLUECRUISE, noteConnected(2023)],
  },
  {
    id: "mache-2023-sr-awd-lfp", ...ME, modelYears: [2023, 2023], vin8: ["5"], drive: "AWD",
    packVariant: "Standard Range (LFP)",
    battery: { chemistry: ME_LFP, packUsableKwh: fb(72, "mfr", "high", "The Standard Range pack's stated usable capacity", MACHE_SPECS_23) },
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
    battery: { chemistry: ME_LFP, packUsableKwh: fb(72, "mfr", "high", "The Standard Range pack's stated usable capacity", MACHE_SPECS_24) },
    range: { epaRangeMi: f(250, "mfr", "high", "MY2024 Standard Range RWD (VIN engine code 4), EPA", epa(47822)) },
    charging: { ...ME_PORT_EARLY, dcPeakKw: ME_DC_SR },
    thermal: { heatPump: ME_NO_HP },
    warranty: ME_WARRANTY,
    buyerNotes: [NOTE_RECALLS_2024, NOTE_BLUECRUISE, noteConnected(2024)],
  },
  {
    id: "mache-2024-sr-awd", ...ME, modelYears: [2024, 2024], vin8: ["5"], drive: "AWD",
    packVariant: "Standard Range (LFP)",
    battery: { chemistry: ME_LFP, packUsableKwh: fb(72, "mfr", "high", "The Standard Range pack's stated usable capacity", MACHE_SPECS_24) },
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
    battery: tPack(78.2, 42148),
    range: { epaRangeMi: f(310, "mfr", "high", "MY2018 Long Range RWD (single-motor VIN code A + Long Range trim), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=39836") },
    charging: TES_CHARGING,
    thermal: M3_NO_HP_EARLY,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "m3-2018-mid", ...T3, model: "Model 3", modelYears: [2018, 2018], vin8: ["A"], trim: "Mid Range", 
    packVariant: "Mid Range",
    battery: tPack(63.8, 46966),
    range: { epaRangeMi: f(260, "mfr", "high", "MY2018 Mid Range (single-motor VIN code A + Mid Range trim), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=41056") },
    charging: TES_CHARGING,
    thermal: M3_NO_HP_EARLY,
    warranty: TES_W100,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "m3-2018-dual", ...T3, model: "Model 3", modelYears: [2018, 2018], vin8: ["B"], 
    packVariant: "Dual motor",
    battery: tPack(79.2, 46275),
    range: { epaRangeMi: f(310, "mfr", "high", "MY2018 dual-motor (VIN code B): Long Range AWD and Performance are both EPA-rated 310", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=40385") },
    charging: TES_CHARGING,
    thermal: M3_NO_HP_EARLY,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "m3-2019-srplus", ...T3, model: "Model 3", modelYears: [2019, 2019], vin8: ["A"], trim: "Standard Range Plus", 
    packVariant: "Standard Range Plus",
    battery: tPack(54.5, 46968),
    range: { epaRangeMi: f(240, "mfr", "high", "MY2019 Standard Range Plus (single-motor VIN code A + trim), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=41416") },
    charging: TES_CHARGING,
    thermal: M3_NO_HP_EARLY,
    warranty: TES_W100,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "m3-2019-lr-rwd", ...T3, model: "Model 3", modelYears: [2019, 2019], vin8: ["A"], trim: "Long Range", 
    packVariant: "Long Range RWD",
    battery: tPack(78.2, 46966),
    range: { epaRangeMi: f(310, "mfr", "high", "MY2019 Long Range RWD (single-motor VIN code A + Long Range trim), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=41189") },
    charging: TES_CHARGING,
    thermal: M3_NO_HP_EARLY,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "m3-2019-mid", ...T3, model: "Model 3", modelYears: [2019, 2019], vin8: ["A"], trim: "Mid Range", 
    packVariant: "Mid Range",
    battery: tPack(63.8, 46966),
    range: { epaRangeMi: f(264, "mfr", "high", "MY2019 Mid Range (single-motor VIN code A + Mid Range trim), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=41188") },
    charging: TES_CHARGING,
    thermal: M3_NO_HP_EARLY,
    warranty: TES_W100,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "m3-2019-dual", ...T3, model: "Model 3", modelYears: [2019, 2019], vin8: ["B"], 
    packVariant: "Dual motor",
    battery: tPack(79.2, 46969),
    range: { epaRangeMi: f(310, "mfr", "high", "MY2019 dual-motor (VIN code B): Long Range AWD and Performance are both EPA-rated 310", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=41190") },
    charging: TES_CHARGING,
    thermal: M3_NO_HP_EARLY,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "m3-2020-srplus", ...T3, model: "Model 3", modelYears: [2020, 2020], vin8: ["A"], 
    packVariant: "Standard Range Plus",
    battery: tPack(52.7, 49217),
    range: { epaRangeMi: f(250, "mfr", "high", "MY2020 single-motor (VIN code A), Standard Range Plus, the only single-motor Model 3 sold in the US that year, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=42278") },
    charging: TES_CHARGING,
    thermal: M3_NO_HP_2020,
    warranty: TES_W100,
    buyerNotes: [NOTE_HP_VIN10, NOTE_FSD],
  },
  {
    id: "m3-2020-lr-awd", ...T3, model: "Model 3", modelYears: [2020, 2020], vin8: ["B"], 
    packVariant: "Long Range AWD",
    battery: tPack(79.2, 49220, "certified 79.2-79.8 across tests"),
    range: { epaRangeMi: f(322, "mfr", "high", "MY2020 Long Range AWD (dual-motor VIN code B), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=42275") },
    charging: TES_CHARGING,
    thermal: M3_NO_HP_2020,
    warranty: TES_W120,
    buyerNotes: [NOTE_HP_VIN10, NOTE_FSD],
  },
  {
    id: "m3-2020-perf", ...T3, model: "Model 3", modelYears: [2020, 2020], vin8: ["C"], 
    packVariant: "Performance",
    battery: tPack(77.5, 49220, "certified 77.5-79.5 depending on wheels", "medium"),
    range: { epaRangeMi: f(299, "mfr", "high", "MY2020 Performance (VIN code C) on its standard 20-inch wheels, EPA; EPA also lists 18/19-inch configurations at 322/304", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=42281") },
    charging: TES_CHARGING,
    thermal: M3_NO_HP_2020,
    warranty: TES_W120,
    buyerNotes: [NOTE_HP_VIN10, NOTE_FSD],
  },
  {
    id: "m3-2021-srplus", ...T3, model: "Model 3", modelYears: [2021, 2021], vin8: ["A"], 
    packVariant: "Standard Range Plus",
    battery: tPack(54.7, 51590),
    range: { epaRangeMi: f(263, "mfr", "high", "MY2021 Standard Range Plus (single-motor VIN code A), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=43821") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W100,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "m3-2021-lr-awd", ...T3, model: "Model 3", modelYears: [2021, 2021], vin8: ["B"], 
    packVariant: "Long Range AWD",
    battery: tPack(78.6, 51301),
    range: { epaRangeMi: f(353, "mfr", "high", "MY2021 Long Range AWD (dual-motor VIN code B), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=43401") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "m3-2021-perf", ...T3, model: "Model 3", modelYears: [2021, 2021], vin8: ["C"], 
    packVariant: "Performance",
    battery: tPack(80.8, 51301),
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
    battery: { packUsableKwh: tUBE(62, 54389, "the 60 kWh often quoted is the nominal marketing figure"), chemistry: f("LFP", "agg", "high", "CATL LFP pack in every US 2022–23 Model 3 RWD") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W100,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "m3-2022-23-lr-awd", ...T3, model: "Model 3", modelYears: [2022, 2023], vin8: ["B"], 
    packVariant: "Long Range AWD",
    battery: tPack(82.1, 54391),
    range: { epaRangeMi: f(358, "mfr", "high", "MY2022–23 Long Range AWD (dual-motor VIN code B), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=45011") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "m3-2022-23-perf", ...T3, model: "Model 3", modelYears: [2022, 2023], vin8: ["C"], 
    packVariant: "Performance",
    battery: tPack(80.8, 54391),
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
    battery: { packUsableKwh: tUBE(61, 59856), chemistry: f("LFP", "agg", "high", "CATL LFP pack in the US Model 3 RWD") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W100,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "m3-2024-lr-rwd", ...T3, model: "Model 3", modelYears: [2024, 2024], vin8: ["A"], trim: "Long Range", 
    packVariant: "Long Range RWD",
    battery: tPack(80.4, 60741),
    range: { epaRangeMi: f(363, "mfr", "high", "MY2024 Long Range RWD (single-motor VIN code A + Long Range trim; new variant this year), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48795") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "m3-2024-lr-awd", ...T3, model: "Model 3", modelYears: [2024, 2024], vin8: ["B"], 
    packVariant: "Long Range AWD",
    battery: tPack(78.6, 59857, "two certified carlines, 78.6 and 80.1, share the Long Range AWD label", "medium"),
    range: { epaRangeMi: f(341, "mfr", "high", "MY2024 Long Range AWD (dual-motor VIN code B), EPA lists 341/342 depending on motor variant", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48473") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "m3-2024-perf", ...T3, model: "Model 3", modelYears: [2024, 2024], vin8: ["T"], 
    packVariant: "Performance",
    battery: tPack(80.1, 60490),
    range: { epaRangeMi: f(303, "mfr", "high", "MY2024 Performance, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48796") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "m3-2025-lr-rwd", ...T3, model: "Model 3", modelYears: [2025, 2025], vin8: ["A"], 
    packVariant: "Long Range RWD",
    battery: tPack(78.9, 61694, "certified 78.9-80.4 across carlines", "medium"),
    range: { epaRangeMi: f(363, "mfr", "high", "MY2025 single-motor (VIN code A), Long Range RWD, the only single-motor Model 3 EPA-certified for 2025; a 19-inch-wheel configuration is listed at 346", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48765") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "m3-2025-lr-awd", ...T3, model: "Model 3", modelYears: [2025, 2025], vin8: ["B"], 
    packVariant: "Long Range AWD",
    battery: tPack(78.6, 61696, "certified 78.6-80.1 across carlines", "medium"),
    range: { epaRangeMi: f(346, "mfr", "high", "MY2025 Long Range AWD (dual-motor VIN code B), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48764") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "m3-2025-perf", ...T3, model: "Model 3", modelYears: [2025, 2025], vin8: ["T"], 
    packVariant: "Performance",
    battery: tPack(80.1, 62092),
    range: { epaRangeMi: f(298, "mfr", "high", "MY2025 Performance (VIN code T), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48996") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "m3-2026-premium-rwd", ...T3, model: "Model 3", modelYears: [2026, 2026], vin8: ["A"], trim: ["Premium", "Long Range"], 
    abstains: { packUsableKwh: "Two certified 2026 Premium RWD carlines sit 18 kWh apart (62.4 and 80.4 usable) and nothing on a listing separates them" },
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
    battery: tPack(68.7, 64151, "68.6-68.8 by wheel size"),
    range: { epaRangeMi: f(321, "mfr", "high", "MY2026 Standard RWD (single-motor VIN code A + Standard trim), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50251") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "m3-2026-premium-awd", ...T3, model: "Model 3", modelYears: [2026, 2026], vin8: ["B"], 
    packVariant: "Premium AWD",
    battery: tPack(80.1, 65379, "certified 80.1-82.8 across carlines", "medium"),
    range: { epaRangeMi: f(346, "mfr", "high", "MY2026 Premium AWD (dual-motor VIN code B), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50037") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "m3-2026-perf", ...T3, model: "Model 3", modelYears: [2026, 2026], vin8: ["T"], 
    packVariant: "Performance",
    battery: tPack(79.8, 64393, "certified 79.8-83.4 across carlines", "medium"),
    range: { epaRangeMi: f(314, "mfr", "high", "MY2026 Performance AWD (VIN code T), EPA; a second Performance certification is listed at 309", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50250") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "my-2020-lr-awd", ...T3, model: "Model Y", modelYears: [2020, 2020], vin8: ["E"], 
    packVariant: "Long Range AWD",
    battery: tPack(78.5, 49397),
    range: { epaRangeMi: f(316, "mfr", "high", "MY2020 Long Range AWD (dual-motor VIN code E), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=42916") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "my-2020-perf", ...T3, model: "Model Y", modelYears: [2020, 2020], vin8: ["F"], 
    packVariant: "Performance",
    battery: tPack(78.6, 49876, "certified 78.4-78.6; an EPA confirmatory run measured 74.4", "medium"),
    range: { epaRangeMi: f(315, "mfr", "high", "MY2020 Performance (VIN code F), EPA; the 21-inch-wheel configuration is listed at 291", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=42474") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "my-2021-sr-rwd", ...T3, model: "Model Y", modelYears: [2021, 2021], vin8: ["D"], 
    packVariant: "Standard Range RWD",
    battery: tPack(54.8, 52125),
    range: { epaRangeMi: f(244, "mfr", "high", "MY2021 Standard Range RWD (single-motor VIN code D), sold January–February 2021 only, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=43880") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W100,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "my-2021-lr-awd", ...T3, model: "Model Y", modelYears: [2021, 2021], vin8: ["E"], 
    packVariant: "Long Range AWD",
    battery: tPack(77.7, 51303),
    range: { epaRangeMi: f(326, "mfr", "high", "MY2021 Long Range AWD (dual-motor VIN code E), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=43406") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "my-2021-perf", ...T3, model: "Model Y", modelYears: [2021, 2021], vin8: ["F"], 
    packVariant: "Performance",
    battery: tPack(81.1, 51303),
    range: { epaRangeMi: f(303, "mfr", "high", "MY2021 Performance (VIN code F), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=43407") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "my-2022-23-perf", ...T3, model: "Model Y", modelYears: [2022, 2023], vin8: ["F"], 
    packVariant: "Performance",
    battery: tPack(81.1, 54394),
    range: { epaRangeMi: f(303, "mfr", "high", "MY2022–23 Performance (VIN code F), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=45019") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "my-2023-rwd", ...T3, model: "Model Y", modelYears: [2023, 2023], vin8: ["D"], 
    packVariant: "RWD",
    battery: tPack(60.2, 58050),
    range: { epaRangeMi: f(260, "mfr", "medium", "Single-motor (VIN code D) MY2023, the Model Y RWD launched October 2023; fueleconomy.gov files its 260-mi certification under MY2024 with no separate MY2023 entry", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48476") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W100,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "my-2024-lr-rwd", ...T3, model: "Model Y", modelYears: [2024, 2024], vin8: ["D"], trim: "Long Range", 
    packVariant: "Long Range RWD",
    battery: tPack(80.1, 60563),
    range: { epaRangeMi: f(320, "mfr", "high", "MY2024 Long Range RWD (single-motor VIN code D + Long Range trim), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48475") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "my-2024-rwd", ...T3, model: "Model Y", modelYears: [2024, 2024], vin8: ["D"], 
    packVariant: "RWD",
    battery: tPack(66.5, 59784, "a second SR RWD carline certifies at 60.2", "medium"),
    range: { epaRangeMi: f(260, "mfr", "high", "MY2024 Model Y RWD (single-motor VIN code D, non-Long-Range), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48476") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W100,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "my-2024-perf", ...T3, model: "Model Y", modelYears: [2024, 2024], vin8: ["F"], 
    packVariant: "Performance",
    battery: tPack(78.9, 60568),
    range: { epaRangeMi: f(279, "mfr", "high", "MY2024 Performance (VIN code F), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47914") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "my-2025-lr-rwd", ...T3, model: "Model Y", modelYears: [2025, 2025], vin8: ["D"], 
    packVariant: "Long Range RWD",
    battery: tPack(79.5, 61695),
    range: { epaRangeMi: f(337, "mfr", "high", "MY2025 Long Range RWD (single-motor VIN code D), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48771") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "my-2025-lr-awd", ...T3, model: "Model Y", modelYears: [2025, 2025], vin8: ["E"], 
    packVariant: "Long Range AWD",
    battery: tPack(78.7, 61697, "certified 78.7-80.0 across carlines", "medium"),
    range: { epaRangeMi: f(311, "mfr", "high", "MY2025 Long Range AWD (dual-motor VIN code E), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48770") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "my-2025-perf", ...T3, model: "Model Y", modelYears: [2025, 2025], vin8: ["F"], 
    packVariant: "Performance",
    battery: tPack(78.9, 61697),
    range: { epaRangeMi: f(277, "mfr", "high", "MY2025 Performance (VIN code F), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48772") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "my-2026-lr-rwd", ...T3, model: "Model Y", modelYears: [2026, 2026], vin8: ["D"], trim: ["Premium", "Long Range"], 
    packVariant: "Long Range RWD",
    battery: tPack(80, 64882),
    range: { epaRangeMi: f(357, "mfr", "high", "MY2026 Premium RWD, Tesla's 2026 consumer name; EPA files it as Long Range RWD (single-motor VIN code D)", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49743") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "my-2026-standard-rwd", ...T3, model: "Model Y", modelYears: [2026, 2026], vin8: ["D"], trim: "Standard", 
    packVariant: "Standard RWD",
    battery: tPack(68.8, 63917, "68.5-69.2 by wheel size"),
    range: { epaRangeMi: f(321, "mfr", "high", "MY2026 Standard RWD (single-motor VIN code D + Standard trim) on 18-inch wheels, EPA; 19-inch configuration listed at 303", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50040") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W100,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "my-2026-lr-awd", ...T3, model: "Model Y", modelYears: [2026, 2026], vin8: ["E"], trim: ["Premium", "Long Range"], 
    packVariant: "Long Range AWD",
    battery: tPack(79.2, 63813, "certified 79.2-82.1, two carlines share the label", "medium"),
    range: { epaRangeMi: f(327, "mfr", "high", "MY2026 Premium AWD, Tesla's 2026 consumer name; EPA files it as Long Range AWD (dual-motor VIN code E)", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49744") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "my-2026-standard-awd", ...T3, model: "Model Y", modelYears: [2026, 2026], vin8: ["E"], trim: "Standard", 
    packVariant: "Standard AWD",
    battery: tPack(69, 64884),
    range: { epaRangeMi: f(294, "mfr", "high", "MY2026 Standard AWD (dual-motor VIN code E + Standard trim), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50304") },
    charging: TES_CHARGING,
    thermal: TES_HP_STD,
    warranty: TES_W120,
    buyerNotes: [NOTE_FSD],
  },
  {
    id: "my-2026-perf", ...T3, model: "Model Y", modelYears: [2026, 2026], vin8: ["F"], 
    packVariant: "Performance",
    battery: tPack(81.5, 64884, "certified 81.5-82.5 across carlines", "medium"),
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
    charging: EV6_CHG(2022, 522.7, 18, false),
    thermal: EV6_HP_NONE,
    warranty: EV6_WARRANTY,
  },
  {
    id: "ev6-2022-lr-rwd", ...K6, modelYears: [2022, 2022], vin8: ["A", "B"], trim: ["Wind", "GT-Line"], packVariant: "Long Range",
    battery: EV6_774,
    range: { epaRangeMi: f(310, "mfr", "high", "MY2022 Long Range RWD (Wind/GT-Line), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=44926") },
    charging: EV6_CHG(2022, 697, 18, false),
    thermal: EV6_HP_OPT,
    warranty: EV6_WARRANTY, buyerNotes: [NOTE_EV6_HP],
  },
  {
    id: "ev6-2022-lr-awd", ...K6, modelYears: [2022, 2022], vin8: ["C"], packVariant: "Long Range",
    battery: EV6_774,
    range: { epaRangeMi: f(274, "mfr", "high", "MY2022 Long Range AWD (dual-motor VIN code C), EPA, one rating for both trims this year", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=44925") },
    charging: EV6_CHG(2022, 697, 18, false),
    thermal: EV6_HP_OPT,
    warranty: EV6_WARRANTY, buyerNotes: [NOTE_EV6_HP],
  },
  {
    id: "ev6-2023-24-sr-rwd", ...K6, modelYears: [2023, 2024], vin8: ["A", "B"], trim: "Light", ignoreKwhHint: true, packVariant: "Standard Range",
    battery: EV6_58,
    range: { epaRangeMi: f(232, "mfr", "high", "MY2023–24 Standard Range RWD (Light trim), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46007") },
    charging: EV6_CHG(2024, 522.7, 18, false),
    thermal: EV6_HP_NONE,
    warranty: EV6_WARRANTY,
  },
  {
    id: "ev6-2023-24-lr-rwd", ...K6, modelYears: [2023, 2024], vin8: ["A", "B"], trim: ["Wind", "GT-Line", "Light Long Range", "Light L"], ignoreKwhHint: true, packVariant: "Long Range",
    battery: EV6_774,
    range: { epaRangeMi: f(310, "mfr", "high", "MY2023–24 Long Range RWD, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46006") },
    charging: EV6_CHG(2024, 697, 18, false),
    thermal: EV6_HP_OPT,
    warranty: EV6_WARRANTY, buyerNotes: [NOTE_EV6_HP],
  },
  {
    id: "ev6-2023-24-lr-awd-19", ...K6, modelYears: [2023, 2024], vin8: ["C"], trim: ["Wind", "Light Long Range", "Light L"], packVariant: "Long Range",
    battery: EV6_774,
    range: { epaRangeMi: f(282, "mfr", "high", "MY2023–24 Long Range AWD on 19-inch wheels (Wind, Light Long Range), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46004") },
    charging: EV6_CHG(2024, 697, 18, false),
    thermal: EV6_HP_OPT,
    warranty: EV6_WARRANTY, buyerNotes: [NOTE_EV6_HP],
  },
  {
    id: "ev6-2023-24-lr-awd-20", ...K6, modelYears: [2023, 2024], vin8: ["C"], trim: "GT-Line", packVariant: "Long Range",
    battery: EV6_774,
    range: { epaRangeMi: f(252, "mfr", "high", "MY2023–24 Long Range AWD on the GT-Line's 20-inch wheels, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46005") },
    charging: EV6_CHG(2024, 697, 18, false),
    thermal: EV6_HP_OPT,
    warranty: EV6_WARRANTY, buyerNotes: [NOTE_EV6_HP],
  },
  {
    id: "ev6-2023-gt", ...K6, modelYears: [2023, 2023], vin8: ["E"], packVariant: "GT",
    battery: EV6_774,
    range: { epaRangeMi: f(206, "mfr", "high", "MY2023 EV6 GT (VIN code E), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46003") },
    charging: EV6_CHG(2023, 697, 18, false),
    thermal: { heatPump: f<"standard">("standard", "mfr") },
    warranty: EV6_WARRANTY,
  },
  {
    id: "ev6-2024-gt", ...K6, modelYears: [2024, 2024], vin8: ["E"], packVariant: "GT",
    battery: EV6_774,
    range: { epaRangeMi: f(218, "mfr", "high", "MY2024 EV6 GT (VIN code E), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46968") },
    charging: EV6_CHG(2024, 697, 18, false),
    thermal: { heatPump: f<"standard">("standard", "mfr") },
    warranty: EV6_WARRANTY,
  },
  {
    id: "ev6-2025-26-sr-rwd", ...K6, modelYears: [2025, 2026], vin8: ["A", "B"], trim: "Light", packVariant: "Standard Range",
    battery: EV6_63,
    range: { epaRangeMi: f(237, "mfr", "high", "MY2025–26 Standard Range RWD (Light trim, refreshed 63 kWh pack), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49098") },
    charging: EV6_CHG(2026, 523, 20, true),
    thermal: EV6_HP_NONE,
    warranty: EV6_WARRANTY,
  },
  {
    id: "ev6-2025-26-lr-rwd", ...K6, modelYears: [2025, 2026], vin8: ["A", "B"], trim: ["Wind", "GT-Line", "Light Long Range", "Light L"], packVariant: "Long Range",
    battery: EV6_84,
    range: { epaRangeMi: f(319, "mfr", "high", "MY2025–26 Long Range RWD (refreshed 84 kWh pack), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49097") },
    charging: EV6_CHG(2026, 697, 20, true),
    thermal: EV6_HP_OPT,
    warranty: EV6_WARRANTY, buyerNotes: [NOTE_EV6_HP],
  },
  {
    id: "ev6-2025-26-lr-awd-19", ...K6, modelYears: [2025, 2026], vin8: ["C"], trim: ["Wind", "Light Long Range", "Light L"], packVariant: "Long Range",
    battery: EV6_84,
    range: { epaRangeMi: f(295, "mfr", "high", "MY2025–26 Long Range AWD on 19-inch wheels, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49095") },
    charging: EV6_CHG(2026, 697, 20, true),
    thermal: EV6_HP_OPT,
    warranty: EV6_WARRANTY, buyerNotes: [NOTE_EV6_HP],
  },
  {
    id: "ev6-2025-26-lr-awd-20", ...K6, modelYears: [2025, 2026], vin8: ["C"], trim: "GT-Line", packVariant: "Long Range",
    battery: EV6_84,
    range: { epaRangeMi: f(270, "mfr", "high", "MY2025–26 Long Range AWD on the GT-Line's 20-inch wheels, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49096") },
    charging: EV6_CHG(2026, 697, 20, true),
    thermal: EV6_HP_OPT,
    warranty: EV6_WARRANTY, buyerNotes: [NOTE_EV6_HP],
  },
  {
    id: "ev6-2025-26-gt", ...K6, modelYears: [2025, 2026], vin8: ["E"], packVariant: "GT",
    battery: EV6_84,
    range: { epaRangeMi: f(231, "mfr", "high", "MY2025–26 EV6 GT (VIN code E), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49094") },
    charging: EV6_CHG(2026, 697, 18, true),
    thermal: { heatPump: f<"standard">("standard", "mfr") },
    warranty: EV6_WARRANTY,
  },

  {
    id: "ev9-2024-lr-rwd", ...K9, modelYears: [2024, 2024], vin8: ["1"], trim: ["Light Long Range", "Light LR", "Light Long"], drive: "RWD", packVariant: "Long Range",
    battery: EV9_PACK_LR(2024),
    range: { epaRangeMi: f(304, "mfr", "high", "MY2024 Long Range RWD (VIN code 1), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47450") },
    charging: EV9_CHARGING(2024),
    thermal: EV9_HP_NONE(2024),
    warranty: HK_WARRANTY,
  },
  {
    id: "ev9-2025-lr-rwd", ...K9, modelYears: [2025, 2025], vin8: ["1"], trim: ["Light Long Range", "Light LR", "Light Long"], drive: "RWD", packVariant: "Long Range",
    battery: EV9_PACK_LR(2025),
    range: { epaRangeMi: f(304, "mfr", "high", "MY2025 Long Range RWD (VIN code 1), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48366") },
    charging: EV9_CHARGING(2025),
    thermal: EV9_HP_OPT_2025,
    warranty: HK_WARRANTY, buyerNotes: [NOTE_EV9_HP],
  },
  {
    id: "ev9-2026-lr-rwd", ...K9, modelYears: [2026, 2026], vin8: ["1"], trim: ["Light Long Range", "Light LR", "Light Long"], drive: "RWD", packVariant: "Long Range",
    battery: EV9_PACK_LR(2026),
    range: { epaRangeMi: f(305, "mfr", "high", "MY2026 Long Range RWD (VIN code 1), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49666") },
    charging: EV9_CHARGING(2026, { nacs: true }),
    thermal: EV9_HP_NONE(2026),
    warranty: HK_WARRANTY,
  },
  {
    id: "ev9-2024-sr-rwd", ...K9, modelYears: [2024, 2024], vin8: ["2"], trim: ["Light", "Light Short Range"], drive: "RWD", packVariant: "Standard Range",
    battery: EV9_PACK_SR(2024),
    range: { epaRangeMi: f(230, "mfr", "high", "MY2024 Standard Range RWD (VIN code 2), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47451") },
    charging: EV9_CHARGING(2024, { sr: true }),
    thermal: EV9_HP_NONE(2024),
    warranty: HK_WARRANTY,
  },
  {
    // Split from one 2025–26 row 2026-08-26: the port differs by year (CCS1
    // in 2025, native NACS in 2026), so one row could only ever have been
    // right for one of them. Everything else about the two is identical.
    id: "ev9-2025-sr-rwd", ...K9, modelYears: [2025, 2025], vin8: ["2"], trim: ["Light", "Light Short Range"], drive: "RWD", packVariant: "Standard Range",
    battery: EV9_PACK_SR(2025),
    range: { epaRangeMi: f(230, "mfr", "high", "MY2025–26 Standard Range RWD (VIN code 2), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48367") },
    charging: EV9_CHARGING(2025, { sr: true }),
    thermal: EV9_HP_NONE(2025),
    warranty: HK_WARRANTY,
  },
  {
    id: "ev9-2026-sr-rwd", ...K9, modelYears: [2026, 2026], vin8: ["2"], trim: ["Light", "Light Short Range"], drive: "RWD", packVariant: "Standard Range",
    battery: EV9_PACK_SR(2026),
    range: { epaRangeMi: f(230, "mfr", "high", "MY2025–26 Standard Range RWD (VIN code 2), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48367") },
    charging: EV9_CHARGING(2026, { sr: true, nacs: true }),
    thermal: EV9_HP_NONE(2025),
    warranty: HK_WARRANTY,
  },
  {
    id: "ev9-2024-awd", ...K9, modelYears: [2024, 2024], vin8: ["5"], trim: ["Wind", "Land"], drive: "AWD", packVariant: "Long Range",
    battery: EV9_PACK_LR(2024),
    range: { epaRangeMi: f(280, "mfr", "high", "MY2024 Long Range AWD (VIN code 5), non-GT-Line, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47452") },
    charging: EV9_CHARGING(2024),
    thermal: EV9_HP_STD,
    warranty: HK_WARRANTY,
  },
  {
    id: "ev9-2024-awd-gtline", ...K9, modelYears: [2024, 2024], vin8: ["5"], trim: "GT-Line", drive: "AWD", packVariant: "Long Range",
    battery: EV9_PACK_LR(2024),
    range: { epaRangeMi: f(270, "mfr", "high", "MY2024 Long Range AWD on the GT-Line wheels, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47453") },
    charging: EV9_CHARGING(2024),
    thermal: EV9_HP_STD,
    warranty: HK_WARRANTY,
  },
  {
    id: "ev9-2025-awd", ...K9, modelYears: [2025, 2025], vin8: ["5"], trim: ["Wind", "Land"], drive: "AWD", packVariant: "Long Range",
    battery: EV9_PACK_LR(2025),
    range: { epaRangeMi: f(280, "mfr", "high", "MY2025 Long Range AWD (VIN code 5), non-GT-Line, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48368") },
    charging: EV9_CHARGING(2025),
    thermal: EV9_HP_STD,
    warranty: HK_WARRANTY,
  },
  {
    id: "ev9-2025-awd-gtline", ...K9, modelYears: [2025, 2025], vin8: ["5"], trim: "GT-Line", drive: "AWD", packVariant: "Long Range",
    battery: EV9_PACK_LR(2025),
    range: { epaRangeMi: f(270, "mfr", "high", "MY2025 Long Range AWD, GT-Line, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48369") },
    charging: EV9_CHARGING(2025),
    thermal: EV9_HP_STD,
    warranty: HK_WARRANTY,
  },
  {
    id: "ev9-2026-awd", ...K9, modelYears: [2026, 2026], vin8: ["5"], trim: ["Wind", "Land"], drive: "AWD", packVariant: "Long Range",
    battery: EV9_PACK_LR(2026),
    range: { epaRangeMi: f(283, "mfr", "high", "MY2026 Long Range AWD (VIN code 5), non-GT-Line, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49667") },
    charging: EV9_CHARGING(2026, { nacs: true }),
    thermal: EV9_HP_STD,
    warranty: HK_WARRANTY,
  },
  {
    id: "ev9-2026-awd-gtline", ...K9, modelYears: [2026, 2026], vin8: ["5"], trim: "GT-Line", drive: "AWD", packVariant: "Long Range",
    battery: EV9_PACK_LR(2026),
    range: { epaRangeMi: f(280, "mfr", "high", "MY2026 Long Range AWD, GT-Line, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49668") },
    charging: EV9_CHARGING(2026, { nacs: true }),
    thermal: EV9_HP_STD,
    warranty: HK_WARRANTY,
  },
  {
    id: "i6-2023-24-lr-rwd-18", ...H6, modelYears: [2023, 2024], vin8: ["A"], trim: "SE", drive: "RWD", packVariant: "Long Range",
    battery: I6_PACK_LR,
    range: { epaRangeMi: f(361, "mfr", "high", "MY2023–24 Long Range RWD on the SE 18-inch wheels, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46622") },
    charging: I6_CHARGING(I6_SPECS_2024, 697),
    thermal: I6_HP_STD,
    warranty: HK_WARRANTY,
  },
  {
    id: "i6-2023-24-lr-rwd-20", ...H6, modelYears: [2023, 2024], vin8: ["A"], trim: ["SEL", "Limited"], drive: "RWD", packVariant: "Long Range",
    battery: I6_PACK_LR,
    range: { epaRangeMi: f(305, "mfr", "high", "MY2023–24 Long Range RWD on 20-inch wheels (SEL, Limited), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46623") },
    charging: I6_CHARGING(I6_SPECS_2024, 697),
    thermal: I6_HP_STD,
    warranty: HK_WARRANTY,
  },
  {
    id: "i6-2023-24-lr-awd-18", ...H6, modelYears: [2023, 2024], vin8: ["C"], trim: "SE", drive: "AWD", packVariant: "Long Range",
    battery: I6_PACK_LR,
    range: { epaRangeMi: f(316, "mfr", "high", "MY2023–24 Long Range AWD on the SE 18-inch wheels, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46620") },
    charging: I6_CHARGING(I6_SPECS_2024, 697),
    thermal: I6_HP_STD,
    warranty: HK_WARRANTY,
  },
  {
    id: "i6-2023-24-lr-awd-20", ...H6, modelYears: [2023, 2024], vin8: ["C"], trim: ["SEL", "Limited"], drive: "AWD", packVariant: "Long Range",
    battery: I6_PACK_LR,
    range: { epaRangeMi: f(270, "mfr", "high", "MY2023–24 Long Range AWD on 20-inch wheels (SEL, Limited), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46621") },
    charging: I6_CHARGING(I6_SPECS_2024, 697),
    thermal: I6_HP_STD,
    warranty: HK_WARRANTY,
  },
  {
    id: "i6-2023-25-sr", ...H6, modelYears: [2023, 2025], vin8: ["B"], trim: "SE Standard Range", drive: "RWD", packVariant: "Standard Range",
    battery: I6_PACK_SR,
    range: { epaRangeMi: f(240, "mfr", "high", "SE Standard Range RWD (VIN code B, the 111 kW motor in Hyundai Part 565 data), EPA, same 240-mi rating all three years", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46624") },
    charging: I6_CHARGING(I6_SPECS_2025, 480),
    thermal: I6_HP_NONE,
    warranty: HK_WARRANTY,
  },
  {
    id: "i6-2025-lr-rwd-18", ...H6, modelYears: [2025, 2025], vin8: ["A"], trim: "SE", drive: "RWD", packVariant: "Long Range",
    battery: I6_PACK_LR,
    range: { epaRangeMi: f(342, "mfr", "high", "MY2025 Long Range RWD on the SE 18-inch wheels, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48362") },
    charging: I6_CHARGING(I6_SPECS_2025, 697),
    thermal: I6_HP_STD,
    warranty: HK_WARRANTY,
  },
  {
    id: "i6-2025-lr-rwd-20", ...H6, modelYears: [2025, 2025], vin8: ["A"], trim: ["SEL", "Limited"], drive: "RWD", packVariant: "Long Range",
    battery: I6_PACK_LR,
    range: { epaRangeMi: f(291, "mfr", "high", "MY2025 Long Range RWD on 20-inch wheels (SEL, Limited), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48363") },
    charging: I6_CHARGING(I6_SPECS_2025, 697),
    thermal: I6_HP_STD,
    warranty: HK_WARRANTY,
  },
  {
    id: "i6-2025-lr-awd-18", ...H6, modelYears: [2025, 2025], vin8: ["C"], trim: "SE", drive: "AWD", packVariant: "Long Range",
    battery: I6_PACK_LR,
    range: { epaRangeMi: f(316, "mfr", "high", "MY2025 Long Range AWD on the SE 18-inch wheels, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48361") },
    charging: I6_CHARGING(I6_SPECS_2025, 697),
    thermal: I6_HP_STD,
    warranty: HK_WARRANTY,
  },
  {
    id: "i6-2025-lr-awd-20", ...H6, modelYears: [2025, 2025], vin8: ["C"], trim: ["SEL", "Limited"], drive: "AWD", packVariant: "Long Range",
    battery: I6_PACK_LR,
    range: { epaRangeMi: f(270, "mfr", "high", "MY2025 Long Range AWD on 20-inch wheels (SEL, Limited), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48365") },
    charging: I6_CHARGING(I6_SPECS_2025, 697),
    thermal: I6_HP_STD,
    warranty: HK_WARRANTY,
  },
  {
    id: "i9-2026-rwd", ...H9, modelYears: [2026, 2026], vin8: ["1"], drive: "RWD", packVariant: "Long Range",
    battery: { packGrossKwh: f(110.3, "mfr", "high", undefined, "https://www.hyundainews.com/assets/documents/original/65341-2026IONIQ9SpecsFeatures20250305.pdf") },
    range: { epaRangeMi: f(335, "mfr", "high", "MY2026 IONIQ 9 RWD (VIN code 1), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49661") },
    charging: I9_CHARGING,
    thermal: I9_HP,
    warranty: HK_WARRANTY,
  },
  {
    id: "i9-2026-awd", ...H9, modelYears: [2026, 2026], vin8: ["3"], drive: "AWD", packVariant: "Long Range",
    battery: { packGrossKwh: f(110.3, "mfr", "high", undefined, "https://www.hyundainews.com/assets/documents/original/65341-2026IONIQ9SpecsFeatures20250305.pdf") },
    range: { epaRangeMi: f(320, "mfr", "high", "MY2026 IONIQ 9 AWD (VIN code 3), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49662") },
    charging: I9_CHARGING,
    thermal: I9_HP,
    warranty: HK_WARRANTY,
  },
  {
    id: "i9-2026-awd-perf", ...H9, modelYears: [2026, 2026], vin8: ["5"], drive: "AWD", packVariant: "Long Range",
    battery: { packGrossKwh: f(110.3, "mfr", "high", undefined, "https://www.hyundainews.com/assets/documents/original/65341-2026IONIQ9SpecsFeatures20250305.pdf") },
    range: { epaRangeMi: f(311, "mfr", "high", "MY2026 IONIQ 9 AWD Performance (VIN code 5, incl. Calligraphy), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49663") },
    charging: I9_CHARGING,
    thermal: I9_HP,
    warranty: HK_WARRANTY,
  },
  {
    id: "kona-2019-23", ...KONA, modelYears: [2019, 2023], vin8: ["G"], drive: "FWD", packVariant: "64 kWh",
    battery: { packGrossKwh: f(64, "mfr", "high") },
    range: { epaRangeMi: f(258, "mfr", "high", "Gen-1 Kona Electric (VIN code G), one rating across 2019–23, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46000") },
    charging: PORT_CCS,
    thermal: { heatPump: fb("none", "mfr", "medium", "No heat-pump line in Hyundai's 2020-23 US feature tables, which list a PTC heater (the Ioniq 5's same-family table carries a heat-pump row); the thinner 2019 sheet does not itemize HVAC", "https://www.hyundainews.com/assets/documents/original/50314-2023KonaElectricProductFeatures20220628.pdf") },
    warranty: HK_WARRANTY,
  },
  {
    id: "kona-2024-lr", ...KONA, modelYears: [2024, 2024], vin8: ["6"], drive: "FWD", packVariant: "Long Range",
    battery: { packGrossKwh: fb(64.8, "mfr", "high", HY_UNQUAL, KONA24_SPECS) },
    range: { epaRangeMi: f(261, "mfr", "high", "MY2024 Long Range (VIN code 6), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47449") },
    charging: PORT_CCS,
    thermal: KONA_HP_NONE_24,
    warranty: HK_WARRANTY,
  },
  {
    id: "kona-2025-lr", ...KONA, modelYears: [2025, 2025], vin8: ["6"], drive: "FWD", packVariant: "Long Range",
    battery: { packGrossKwh: fb(64.8, "mfr", "high", "Hyundai's 2025 price sheet; MY2025 is a declared carry-over of the 2024 car", KONA25_PRICE) },
    range: { epaRangeMi: f(261, "mfr", "high", "MY2025 Long Range (VIN code 6) on 17-inch wheels, EPA; the N Line 19-inch wheels rate 230", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48357") },
    charging: PORT_CCS,
    thermal: KONA_HP_NONE_25,
    warranty: HK_WARRANTY,
  },
  {
    id: "kona-2025-lr-nline", ...KONA, modelYears: [2025, 2025], vin8: ["6"], trim: "N Line", drive: "FWD", packVariant: "Long Range",
    abstains: { heatPump: "The N Line is new for 2025 and appears in no Hyundai US feature table; the price sheet says nothing about HVAC either way" },
    battery: { packGrossKwh: fb(64.8, "mfr", "high", "Hyundai's 2025 price sheet states the N Line's 64.8 kWh battery", KONA25_PRICE) },
    range: { epaRangeMi: f(230, "mfr", "high", "MY2025 Long Range, N Line (19-inch wheels), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48358") },
    charging: PORT_CCS,
    warranty: HK_WARRANTY,
  },
  {
    id: "kona-2024-25-sr", ...KONA, modelYears: [2024, 2025], vin8: ["7"], drive: "FWD", packVariant: "Standard Range",
    battery: { packGrossKwh: fb(48.6, "mfr", "high", HY_UNQUAL, KONA24_SPECS) },
    range: { epaRangeMi: f(200, "mfr", "high", "Standard Range (VIN code 7, the 99 kW motor), EPA, same rating both years", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47831") },
    charging: PORT_CCS,
    thermal: { heatPump: fb("none", "mfr", "medium", "Hyundai's 2024 feature table lists a PTC heater and no heat pump; MY2025 is a declared carry-over", KONA_CARRYOVER) },
    warranty: HK_WARRANTY,
  },
  {
    id: "prologue-2025-26-awd-elite", make: "HONDA", model: "Prologue", modelYears: [2025, 2026], trim: "Elite", drive: "AWD",
    abstains: { heatPump: HONDA_HP_ABSTAIN },
    battery: { packGrossKwh: fb(85, "mfr", "high", "Honda states 85 kWh without a gross or usable qualifier", PROLOGUE_SPECS) },
    range: { epaRangeMi: f(283, "mfr", "high", "AWD Elite, EPA certifies it separately from the other AWD trims (294 mi)", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49090") },
    charging: PORT_CCS,
    warranty: { batteryYears: fb(8, "mfr", "high", "From the 2025 Honda BEV warranty basebook; no 2026 basebook is published yet", HONDA_BEV_WB), batteryMiles: fb(100_000, "mfr", "high", undefined, HONDA_BEV_WB), sohFloorPct: fb(75, "mfr", "high", "Replaced or repaired if capacity falls below 75% within the warranty period", HONDA_BEV_WB) },
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
    battery: I5_PACK,
    range: { epaRangeMi: f(266, "mfr", "high", "MY2025 i5 xDrive40 on 19-inch wheels, EPA; 248–262 on 20/21s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48322") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },
  {
    id: "i5-2024-m60", ...I5, modelYears: [2024, 2024], trim: "M60", drive: "AWD",
    battery: I5_PACK,
    range: { epaRangeMi: f(256, "mfr", "high", "MY2024 i5 M60 xDrive on 19-inch wheels, EPA; 240–248 on 20/21s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46926") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },
  {
    id: "i5-2025-m60", ...I5, modelYears: [2025, 2025], trim: "M60", drive: "AWD",
    battery: I5_PACK,
    range: { epaRangeMi: f(253, "mfr", "high", "MY2025 i5 M60 xDrive on 19-inch wheels, EPA; 239–250 on 20/21s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48319") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },
  {
    id: "i5-2026-edrive40", ...I5, modelYears: [2026, 2026], trim: "eDrive40", drive: "RWD",
    battery: I5_PACK,
    range: { epaRangeMi: f(310, "mfr", "high", "MY2026 i5 eDrive40 on 19-inch wheels, EPA; 278–300 on 20/21s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49613") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },
  {
    id: "i5-2026-xdrive40", ...I5, modelYears: [2026, 2026], trim: "xDrive40", drive: "AWD",
    battery: I5_PACK,
    range: { epaRangeMi: f(278, "mfr", "high", "MY2026 i5 xDrive40 on 19-inch wheels, EPA; 259–272 on 20/21s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49616") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },
  {
    id: "i5-2026-m60", ...I5, modelYears: [2026, 2026], trim: "M60", drive: "AWD",
    battery: I5_PACK,
    range: { epaRangeMi: f(277, "mfr", "high", "MY2026 i5 M60 xDrive on 19-inch wheels, EPA; 259–266 on 20/21s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50194") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },
  {
    id: "i7-2023-xdrive60", ...I7, modelYears: [2023, 2023], trim: "xDrive60", drive: "AWD",
    battery: I7_PACK,
    range: { epaRangeMi: f(318, "mfr", "high", "MY2023 i7 xDrive60 on 19-inch wheels, EPA; 296–308 on 20/21s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=45993") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },
  {
    id: "i7-2024-edrive50", ...I7, modelYears: [2024, 2024], trim: "eDrive50", drive: "RWD",
    battery: I7_PACK_E50,
    range: { epaRangeMi: f(321, "mfr", "high", "MY2024 i7 eDrive50 on 19-inch wheels, EPA; 301–311 on 20/21s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46929") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },
  {
    id: "i7-2024-xdrive60", ...I7, modelYears: [2024, 2024], trim: "xDrive60", drive: "AWD",
    battery: I7_PACK,
    range: { epaRangeMi: f(317, "mfr", "high", "MY2024 i7 xDrive60 on 19-inch wheels, EPA; 298–307 on 20/21s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46934") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },
  {
    id: "i7-2024-m70", ...I7, modelYears: [2024, 2024], trim: "M70", drive: "AWD",
    battery: I7_PACK,
    range: { epaRangeMi: f(274, "mfr", "high", "MY2024 i7 M70 xDrive on 20-inch wheels, EPA; 291 on 21s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46932") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },
  {
    id: "i7-2025-26-edrive50", ...I7, modelYears: [2025, 2026], trim: "eDrive50", drive: "RWD",
    battery: I7_PACK_E50,
    range: { epaRangeMi: f(314, "mfr", "high", "MY2025–26 i7 eDrive50 on 19-inch wheels, EPA; 301–307 on 20/21s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48325") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },
  {
    id: "i7-2025-26-xdrive60", ...I7, modelYears: [2025, 2026], trim: "xDrive60", drive: "AWD",
    battery: I7_PACK,
    range: { epaRangeMi: f(311, "mfr", "high", "MY2025–26 i7 xDrive60 on 19-inch wheels, EPA; 296–308 on 20/21s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48330") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },
  {
    id: "i7-2025-26-m70", ...I7, modelYears: [2025, 2026], trim: "M70", drive: "AWD",
    battery: I7_PACK,
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
    battery: { packUsableKwh: fb(71, "mfr", "medium", "76.6 kWh gross, BMW's European spec sheet; BMW USA never marketed the xDrive40 though EPA carries a rating for it", "https://www.press.bmwgroup.com/global/article/attachment/T0327077EN/633486") },
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
    battery: { packUsableKwh: fb(94.8, "mfr", "medium", "BMW's spec-sheet net figure; BMW USA press copy prints 100.1 kWh net usable for the same variant", IX26_SPECS) },
    range: { epaRangeMi: f(312, "mfr", "high", "MY2026 iX xDrive45 (facelift) on 20-inch wheels, EPA; 279–297 on larger wheels", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49619") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },
  {
    id: "ix-2026-xdrive60", ...IX, modelYears: [2026, 2026], trim: "xDrive60", drive: "AWD",
    battery: { packUsableKwh: fb(109.1, "mfr", "medium", "BMW's spec-sheet net figure; BMW USA press copy prints 113.4 kWh net usable for the same variant", IX26_SPECS) },
    range: { epaRangeMi: f(364, "mfr", "high", "MY2026 iX xDrive60 (facelift) on 20-inch wheels, EPA; 318–341 on larger wheels", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49623") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },

  {
    id: "i5-2027-edrive40", ...I5, modelYears: [2027, 2027], trim: "eDrive40", drive: "RWD",
    battery: I5_PACK,
    range: { epaRangeMi: f(328, "mfr", "high", "MY2027 i5 eDrive40 on 19-inch wheels, EPA; 280–299 on 20/21s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50360") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },
  {
    id: "i5-2027-xdrive40", ...I5, modelYears: [2027, 2027], trim: "xDrive40", drive: "AWD",
    battery: I5_PACK,
    range: { epaRangeMi: f(283, "mfr", "high", "MY2027 i5 xDrive40 on 19-inch wheels, EPA; 262–273 on 20/21s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50603") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },
  {
    id: "i7-2027-xdrive50", ...I7, modelYears: [2027, 2027], trim: ["xDrive50", "50 xDrive"], drive: "AWD",
    abstains: { packUsableKwh: "BMW states only a lineup maximum of 112.5 kWh net for the 2027 7 Series and publishes no per-variant figure yet" },
    range: { epaRangeMi: f(354, "mfr", "high", "MY2027 i7 xDrive50, EPA; 364 on 21-inch summer tires", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50604") },
    charging: BMW_CHARGING,
    thermal: BMW_HP,
    warranty: BMW_WARRANTY,
  },
  {
    id: "i7-2027-xdrive60", ...I7, modelYears: [2027, 2027], trim: ["xDrive60", "60 xDrive"], drive: "AWD",
    abstains: { packUsableKwh: "BMW states only a lineup maximum of 112.5 kWh net for the 2027 7 Series and publishes no per-variant figure yet" },
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
// Split at the 2027 boundary 2026-08-26 — GM's own table (news.gm.com
// 2026-08-13, "GM vehicles with NACS-native charging for the 2026 and 2027
// model years") marks every GM EV NACS-native for MY2027 and says 2026 cars
// other than the Optiq "still require an adapter as they come from the factory
// with a CCS port". One row cannot hold two plugs.
    id: "cadillac-vistiq-2026", make: "CADILLAC", model: "Vistiq", modelYears: [2026, 2026], drive: "AWD",
    abstains: { heatPump: "GM's 2022 Ultium release calls its patented heat pump standard on Ultium EVs, but no Optiq, Vistiq or Lyriq-V document names it and GM has retired the Ultium branding, so the link would be an inference" },
    battery: { packUsableKwh: fb(102, "mfr", "high", "Stated as 102 kWh Useable Battery Energy") },
    range: { epaRangeMi: f(305, "mfr", "high", "Vistiq (AWD-only), EPA, same rating 2026–27; 300 with the 19 kW onboard-charger option", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49636") },
    charging: { portStandard: f<"CCS1">("CCS1", "mfr", "high", undefined, GM_NACS_TABLE_2026), superchargerAccess: f<"adapter">("adapter", "mfr", "high", "GM NACS DC adapter", GM_NACS_TABLE_2026) },
    warranty: { batteryYears: f(8, "mfr" as Source), batteryMiles: f(100_000, "mfr" as Source), batteryTransfers: f(true, "mfr" as Source) },
  },
  {
    id: "cadillac-vistiq-2027", make: "CADILLAC", model: "Vistiq", modelYears: [2027, 2027], drive: "AWD",
    abstains: { heatPump: "GM's 2022 Ultium release calls its patented heat pump standard on Ultium EVs, but no Optiq, Vistiq or Lyriq-V document names it and GM has retired the Ultium branding, so the link would be an inference" },
    battery: { packUsableKwh: fb(102, "mfr", "high", "Stated as 102 kWh Useable Battery Energy") },
    range: { epaRangeMi: f(305, "mfr", "high", "Vistiq (AWD-only), EPA, same rating 2026–27; 300 with the 19 kW onboard-charger option", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49636") },
    charging: { portStandard: f<"NACS">("NACS", "mfr", "high", undefined, GM_NACS_TABLE_2026), superchargerAccess: f<"native">("native", "mfr", "high", "A GM-approved adapter is needed for CCS/J1772 stations instead", GM_NACS_TABLE_2026) },
    warranty: { batteryYears: f(8, "mfr" as Source), batteryMiles: f(100_000, "mfr" as Source), batteryTransfers: f(true, "mfr" as Source) },
  },
  {
    id: "cadillac-optiq-2025", make: "CADILLAC", model: "Optiq", modelYears: [2025, 2025], drive: "AWD",
    abstains: { heatPump: "GM's 2022 Ultium release calls its patented heat pump standard on Ultium EVs, but no Optiq, Vistiq or Lyriq-V document names it and GM has retired the Ultium branding, so the link would be an inference" },
    battery: { packUsableKwh: fb(85, "mfr", "high", "Stated as 85 kWh Useable Battery Energy") },
    range: { epaRangeMi: f(302, "mfr", "medium", "GM-estimated, fueleconomy.gov has no MY2025 Optiq entry under any spelling (control: the MY2026 records are present); every MY2025 Optiq is dual-motor AWD") },
    charging: { portStandard: f("CCS1", "mfr") },
    warranty: { batteryYears: f(8, "mfr" as Source), batteryMiles: f(100_000, "mfr" as Source), batteryTransfers: f(true, "mfr" as Source) },
  },
  {
    id: "id4-2025-rwd-pro", make: "VOLKSWAGEN", model: "ID.4", modelYears: [2025, 2025], trim: ["Pro", "Pro S", "Pro S Plus"], drive: "RWD", ignoreKwhHint: true,
    battery: { packUsableKwh: f(77, "mfr", "high", "82 kWh gross / 77 usable, the Pro pack") },
    range: { epaRangeMi: f(291, "mfr", "high", "MY2025 ID.4 Pro / Pro S RWD, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49156") },
    charging: { portStandard: f("CCS1", "mfr") },
    thermal: ID4_HP_NONE,
    warranty: { batteryYears: f(8, "mfr" as Source), batteryMiles: f(100_000, "mfr" as Source), batteryTransfers: f(true, "mfr" as Source) },
  },
  {
    id: "id4-2025-awd-pro", make: "VOLKSWAGEN", model: "ID.4", modelYears: [2025, 2025], trim: ["Pro", "Pro S", "Pro S Plus", "1st Edition"], drive: "AWD", ignoreKwhHint: true,
    battery: { packUsableKwh: f(77, "mfr", "high", "82 kWh gross / 77 usable, the Pro pack") },
    range: { epaRangeMi: f(263, "mfr", "high", "MY2025 ID.4 AWD Pro / Pro S, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48773") },
    charging: { portStandard: f("CCS1", "mfr") },
    thermal: ID4_HP_NONE,
    warranty: { batteryYears: f(8, "mfr" as Source), batteryMiles: f(100_000, "mfr" as Source), batteryTransfers: f(true, "mfr" as Source) },
  },
  {
    id: "id4-2025-standard", make: "VOLKSWAGEN", model: "ID.4", modelYears: [2025, 2025], trim: ["Standard", "S"], drive: "RWD", ignoreKwhHint: true,
    battery: { packUsableKwh: f(58, "mfr", "high", "62 kWh gross / 58 usable, the Standard pack") },
    range: { epaRangeMi: f(206, "mfr", "high", "MY2025 ID.4 / ID.4 S (62 kWh Standard pack), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49155") },
    charging: { portStandard: f("CCS1", "mfr") },
    thermal: ID4_HP_NONE,
    warranty: { batteryYears: f(8, "mfr" as Source), batteryMiles: f(100_000, "mfr" as Source), batteryTransfers: f(true, "mfr" as Source) },
  },
  {
    id: "id4-2026-rwd", make: "VOLKSWAGEN", model: "ID.4", modelYears: [2026, 2026], drive: "RWD", ignoreKwhHint: true,
    battery: { packUsableKwh: f(77, "mfr", "high", "82 kWh gross / 77 usable, MY2026 dropped the Standard pack") },
    range: { epaRangeMi: f(291, "mfr", "high", "MY2026 ID.4 RWD, EPA (the Standard pack is gone; one RWD rating)", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49987") },
    charging: { portStandard: f("CCS1", "mfr") },
    thermal: ID4_HP_NONE,
    warranty: { batteryYears: f(8, "mfr" as Source), batteryMiles: f(100_000, "mfr" as Source), batteryTransfers: f(true, "mfr" as Source) },
  },
  {
    id: "id4-2026-awd", make: "VOLKSWAGEN", model: "ID.4", modelYears: [2026, 2026], drive: "AWD", ignoreKwhHint: true,
    battery: { packUsableKwh: f(77, "mfr", "high", "82 kWh gross / 77 usable") },
    range: { epaRangeMi: f(263, "mfr", "high", "MY2026 ID.4 AWD, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49988") },
    charging: { portStandard: f("CCS1", "mfr") },
    thermal: ID4_HP_NONE,
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
    warranty: { batteryYears: fb(8, "mfr", "high", undefined, LEAF_WB(2011)), batteryMiles: fb(100_000, "mfr", "high", undefined, LEAF_WB(2011)), sohFloorPct: fb(70, "mfr", "high", "Capacity coverage below nine bars (about 70%) was added retroactively to 2011-12 cars in December 2012, for 60 months or 60,000 miles", LEAF_CAPACITY_LETTER) },
  },
  {
    id: "leaf-2013", make: "NISSAN", model: "Leaf", modelYears: [2013, 2013],
    battery: { packGrossKwh: f(24, "mfr", "high") },
    range: { epaRangeMi: f(75, "mfr", "high", "MY2013 (24 kWh), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=33558") },
    charging: { portStandard: f("CHAdeMO", "mfr", "high", "DC fast charging optional (standard on SV/SL); CHAdeMO where fitted") },
    thermal: { heatPump: f("standard", "mfr", "high", "Hybrid heat pump system from MY2013 (SV/SL)") },
    warranty: { batteryYears: fb(8, "mfr", "high", undefined, LEAF_WB(2013)), batteryMiles: fb(100_000, "mfr", "high", undefined, LEAF_WB(2013)), sohFloorPct: fb(70, "mfr", "high", "Below nine bars, capacity coverage runs 60 months or 60,000 miles", LEAF_WB(2013)) },
  },
  {
    id: "leaf-2016-s", make: "NISSAN", model: "Leaf", modelYears: [2016, 2016], trim: "S",
    battery: { packGrossKwh: f(24, "mfr", "high", "The S kept the 24 kWh pack in 2016; SV/SL moved to 30 kWh") },
    range: { epaRangeMi: f(84, "mfr", "high", "MY2016 S (24 kWh), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=37066") },
    charging: { portStandard: f("CHAdeMO", "mfr") },
    thermal: { heatPump: fb("none", "mfr", "high", "Nissan's 2016 spec table marks the hybrid heater system (heat pump) unavailable on the S; SV and SL carry it standard", LEAF_PK_2016) },
    warranty: { batteryYears: fb(8, "mfr", "high", undefined, LEAF_WB(2016)), batteryMiles: fb(100_000, "mfr", "high", undefined, LEAF_WB(2016)), sohFloorPct: fb(70, "mfr", "high", "Capacity coverage on the S's 24 kWh pack runs 60 months or 60,000 miles", LEAF_WB(2016)) },
  },
  {
    id: "leaf-2016-sv-sl", make: "NISSAN", model: "Leaf", modelYears: [2016, 2016], trim: ["SV", "SL"],
    battery: { packGrossKwh: f(30, "mfr", "high") },
    range: { epaRangeMi: f(107, "mfr", "high", "MY2016 SV/SL (30 kWh), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=37067") },
    charging: { portStandard: f("CHAdeMO", "mfr") },
    thermal: { heatPump: fb("standard", "mfr", "high", "Hybrid heater system (heat pump), standard on SV and SL", LEAF_PK_2016) },
    warranty: { batteryYears: fb(8, "mfr", "high", undefined, LEAF_WB(2016)), batteryMiles: fb(100_000, "mfr", "high", undefined, LEAF_WB(2016)), sohFloorPct: fb(70, "mfr", "high", "Capacity coverage on the 30 kWh pack runs the full 96 months or 100,000 miles", LEAF_WB(2016)) },
  },
  {
    id: "leaf-2017", make: "NISSAN", model: "Leaf", modelYears: [2017, 2017],
    abstains: { heatPump: "Varies by grade: Nissan's 2017 spec table gives SV and SL the hybrid heater system and the S none, and this row spans all grades" },
    battery: { packGrossKwh: f(30, "mfr", "high") },
    range: { epaRangeMi: f(107, "mfr", "high", "MY2017 (30 kWh standard), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=38428") },
    charging: { portStandard: f("CHAdeMO", "mfr") },
    thermal: { heatPumpByTrim: { S: "none", SV: "standard", SL: "standard" } },
    warranty: { batteryYears: fb(8, "mfr", "high", undefined, LEAF_WB(2017)), batteryMiles: fb(100_000, "mfr", "high", undefined, LEAF_WB(2017)), sohFloorPct: fb(70, "mfr", "high", "Capacity coverage on the 30 kWh pack runs the full 96 months or 100,000 miles", LEAF_WB(2017)) },
  },
  {
    id: "leaf-2026-splus", make: "NISSAN", model: "Leaf", modelYears: [2026, 2026], vin8: ["A"], trim: ["S+", "S"],
    battery: { packGrossKwh: f(75, "mfr", "high") },
    range: { epaRangeMi: f(303, "mfr", "high", "MY2026 LEAF S+ (75 kWh, 18-inch steel wheels), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49975") },
    charging: { portStandard: f("NACS", "mfr", "high", "First LEAF with a native NACS port") },
    thermal: { heatPump: fb("none", "mfr", "medium", "Nissan's trim table marks the hybrid heater system unavailable on S+ while SV+ and Platinum+ carry it standard; the release's untrimmed prose says standard, so the trim-resolved table is followed", LEAF_PK_2026) },
    warranty: { batteryYears: f(8, "mfr" as Source), batteryMiles: f(100_000, "mfr" as Source) },
  },
  {
    id: "leaf-2026-svplus", make: "NISSAN", model: "Leaf", modelYears: [2026, 2026], vin8: ["A"], trim: ["SV+", "SV"],
    battery: { packGrossKwh: f(75, "mfr", "high") },
    range: { epaRangeMi: f(288, "mfr", "high", "MY2026 LEAF SV+ (75 kWh, 18-inch alloys), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49974") },
    charging: { portStandard: f("NACS", "mfr", "high", "First LEAF with a native NACS port") },
    thermal: { heatPump: fb("standard", "mfr", "high", "Hybrid heater system (heat pump), standard on SV+", LEAF_PK_2026) },
    warranty: { batteryYears: f(8, "mfr" as Source), batteryMiles: f(100_000, "mfr" as Source) },
  },
  {
    id: "leaf-2026-platinum", make: "NISSAN", model: "Leaf", modelYears: [2026, 2026], vin8: ["B"],
    battery: { packGrossKwh: f(75, "mfr", "high") },
    range: { epaRangeMi: f(259, "mfr", "high", "MY2026 LEAF Platinum+ (VIN code B; 19-inch wheels), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49976") },
    charging: { portStandard: f("NACS", "mfr", "high", "First LEAF with a native NACS port") },
    thermal: { heatPump: fb("standard", "mfr", "high", "Hybrid heater system (heat pump), standard on Platinum+", LEAF_PK_2026) },
    warranty: { batteryYears: f(8, "mfr" as Source), batteryMiles: f(100_000, "mfr" as Source) },
  },
  {
    id: "xc40-recharge-2021", make: "VOLVO", model: "XC40 Recharge Pure Electric", modelYears: [2021, 2021], drive: "AWD",
    battery: { packUsableKwh: fb(75, "mfr", "high", "78 kWh nominal", "https://web.archive.org/web/20251017072816id_/https://www.media.volvocars.com/global/en-gb/download/271590/file/pdf") },
    range: { epaRangeMi: f(208, "mfr", "high", "MY2021 XC40 Recharge (twin motor, the only version), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=43295") },
    charging: { portStandard: f("CCS1", "mfr") },
    thermal: { heatPump: fb("optional", "mfr", "high", "A $350 factory option this year - the window sticker is the authority", "https://web.archive.org/web/20201029205608/https://www.media.volvocars.com/us/en-us/media/pressreleases/272936/volvo-car-usa-announces-pricing-and-access-to-nationwide-charging-network-for-its-first-pure-electri") },
    warranty: volvoWty(VOLVO_WTY_RECHARGE), buyerNotes: [NOTE_HP_OPTION],
  },
  {
    id: "xc40-recharge-2022-23", make: "VOLVO", model: "XC40 Recharge Pure Electric", modelYears: [2022, 2023], drive: "AWD",
    abstains: { heatPump: VOLVO_HP_ABSTAIN },
    battery: { packUsableKwh: fb(75, "mfr", "high", "78 kWh nominal", VOLVO_SPECS_23) },
    range: { epaRangeMi: f(223, "mfr", "high", "MY2022–23 XC40 Recharge Twin, EPA; every US 2022–23 car is the twin-motor", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=44450") },
    charging: { portStandard: f("CCS1", "mfr") },
    warranty: volvoWty(VOLVO_WTY_RECHARGE),
  },
  {
    id: "xc40-recharge-2024-single", make: "VOLVO", model: "XC40 Recharge Pure Electric", modelYears: [2024, 2024], vin8: ["K"], drive: "RWD",
    abstains: { heatPump: VOLVO_HP_ABSTAIN },
    battery: { packUsableKwh: fb(79, "mfr", "high", "82 kWh nominal, the Single Motor Extended Range pack", VOLVO_SPECS_24_XC40) },
    range: { epaRangeMi: f(293, "mfr", "high", "MY2024 single-motor extended range (VIN code K, Volvo's Part 565 text names it eRWD Single Motor), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46981") },
    charging: { portStandard: f("CCS1", "mfr") },
    warranty: volvoWty(VOLVO_WTY_RECHARGE),
  },
  {
    id: "xc40-recharge-2024-twin", make: "VOLVO", model: "XC40 Recharge Pure Electric", modelYears: [2024, 2024], vin8: ["M"], drive: "AWD",
    abstains: { heatPump: VOLVO_HP_ABSTAIN },
    battery: { packUsableKwh: fb(79, "mfr", "medium", "82 kWh nominal on the engineering sheets; Volvo's launch announcement said the Twin kept the 78 kWh pack, an unresolved conflict", VOLVO_SPECS_24_XC40) },
    range: { epaRangeMi: f(254, "mfr", "high", "MY2024 Twin Motor, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46983") },
    charging: { portStandard: f("CCS1", "mfr") },
    warranty: volvoWty(VOLVO_WTY_RECHARGE),
  },
  {
    id: "c40-recharge-2022-23", make: "VOLVO", model: "C40 Recharge Pure Electric", modelYears: [2022, 2023], drive: "AWD",
    abstains: { heatPump: VOLVO_HP_ABSTAIN },
    // vPIC decodes these as plain "C40"; the C40 was electric-only in the US.
    // "C40 Recharge" is how dealers actually file it — 320 live listings on
    // 2026-08-25 against 64 under the full "…Pure Electric" spelling — and the
    // matcher compares model strings by EQUALITY, not substring, so the longer
    // row name could never reach them. No trim guard is needed on any C40
    // spelling for the reason the line above gives: unlike the XC90/XC60 T8,
    // no petrol or mild-hybrid C40 was ever sold here to poach.
    modelAliases: ["C40", "C40 Recharge"],
    battery: { packUsableKwh: fb(75, "mfr", "high", "78 kWh nominal", "https://media-downloads.volvocars.com/f42ad91a-f5c1-4e3a-9f20-b33e001c4cf3/277710_1_5.pdf") },
    range: { epaRangeMi: f(226, "mfr", "high", "MY2022–23 C40 Recharge Twin, EPA; every US 2022–23 car is the twin-motor", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=44929") },
    charging: { portStandard: f("CCS1", "mfr") },
    warranty: volvoWty(VOLVO_WTY_RECHARGE),
  },
  {
    id: "c40-recharge-2024-single", make: "VOLVO", model: "C40 Recharge Pure Electric", modelYears: [2024, 2024], vin8: ["K"], drive: "RWD",
    abstains: { heatPump: VOLVO_HP_ABSTAIN },
    // vPIC decodes these as plain "C40"; the C40 was electric-only in the US.
    modelAliases: ["C40", "C40 Recharge"],
    battery: { packUsableKwh: fb(79, "mfr", "high", "82 kWh nominal, the Single Motor Extended Range pack", VOLVO_SPECS_24_C40) },
    range: { epaRangeMi: f(297, "mfr", "high", "MY2024 single-motor extended range (VIN code K), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46980") },
    charging: { portStandard: f("CCS1", "mfr") },
    warranty: volvoWty(VOLVO_WTY_RECHARGE),
  },
  {
    id: "c40-recharge-2024-twin", make: "VOLVO", model: "C40 Recharge Pure Electric", modelYears: [2024, 2024], vin8: ["M"], drive: "AWD",
    abstains: { heatPump: VOLVO_HP_ABSTAIN },
    // vPIC decodes these as plain "C40"; the C40 was electric-only in the US.
    modelAliases: ["C40", "C40 Recharge"],
    battery: { packUsableKwh: fb(79, "mfr", "medium", "82 kWh nominal on the engineering sheets; Volvo's launch announcement said the Twin kept the 78 kWh pack, an unresolved conflict", VOLVO_SPECS_24_C40) },
    range: { epaRangeMi: f(257, "mfr", "high", "MY2024 Twin (VIN code M), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46982") },
    charging: { portStandard: f("CCS1", "mfr") },
    warranty: volvoWty(VOLVO_WTY_RECHARGE),
  },
  {
    id: "ex30-2025-single", make: "VOLVO", model: "EX30", modelYears: [2025, 2025], trim: ["Single Motor"], drive: "RWD",
    battery: { packGrossKwh: f(69, "vin", "high"), chemistry: f("NMC", "vin", "high") },
    range: { epaRangeMi: f(257, "mfr", "high", "MY2025 EX30 Single Motor Extended Range on 18-inch wheels, EPA; 261 on 19/20s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48449") },
    charging: { portStandard: f("CCS1", "mfr") },
    thermal: EX30_HP,
    warranty: volvoWty(VOLVO_WTY_FULLY),
  },
  {
    id: "ex30-2026-single", make: "VOLVO", model: "EX30", modelYears: [2026, 2026], trim: ["Single Motor"], drive: "RWD",
    battery: { packGrossKwh: f(69, "vin", "high"), chemistry: f("NMC", "vin", "high") },
    range: { epaRangeMi: f(261, "mfr", "high", "MY2026 EX30 Single Motor Extended Range, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49989") },
    charging: { portStandard: f("CCS1", "mfr") },
    thermal: EX30_HP,
    warranty: volvoWty(VOLVO_WTY_FULLY),
  },
  {
    id: "ex30-2025-26-twin", make: "VOLVO", model: "EX30", modelYears: [2025, 2026], trim: ["Twin", "Ultra"], drive: "AWD",
    battery: { packGrossKwh: f(69, "vin", "high"), chemistry: f("NMC", "vin", "high") },
    range: { epaRangeMi: f(253, "mfr", "high", "19-inch wheels, standard", epa(48775)) },
    charging: { portStandard: f("CCS1", "mfr") },
    thermal: EX30_HP,
    warranty: volvoWty(VOLVO_WTY_FULLY),
  },
  {
    id: "ex30-cc-2026", make: "VOLVO", model: "EX30 Cross Country", modelYears: [2026, 2026], drive: "AWD",
    // vPIC abbreviates this one: "EX30 CC".
    modelAliases: ["EX30 CC"],
    battery: { packGrossKwh: f(69, "vin", "high"), chemistry: f("NMC", "vin", "high") },
    range: { epaRangeMi: f(227, "mfr", "high", "MY2026 EX30 Cross Country on its standard 19-inch wheels, EPA; 203 on 18s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49991") },
    charging: { portStandard: f("CCS1", "mfr") },
    thermal: EX30_HP,
    warranty: volvoWty(VOLVO_WTY_FULLY),
  },
  {
    id: "chr-bev-2026", make: "TOYOTA", model: "C-HR", modelYears: [2026, 2026], drive: "AWD",
    battery: { packGrossKwh: f(74.7, "agg", "medium") },
    range: { epaRangeMi: f(287, "mfr", "high", "MY2026 C-HR BEV (AWD-only) on 18-inch wheels, EPA; 273 on 20s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50307") },
    // Was NACS tagged `agg` with an uncited "Native NACS port from launch" —
    // the same uncited shape that turned out WRONG on the MY2025 EV9. Here it
    // is right, and Toyota says so itself: "It will come equipped with a North
    // American Charging System (NACS) port". Toyota's vehicle page for this
    // car names no connector at all, so the release is the citation. The same
    // release carries the other two figures, both new: "recharging from 10% to
    // 80% battery capacity in around 30 minutes under ideal conditions" (that
    // condition is Toyota's own wording and rides in the note), and an "11-kW
    // onboard AC charger".
    charging: {
      portStandard: fb<"NACS">("NACS", "mfr", "high", undefined, CHR_PRESS),
      superchargerAccess: fb<"native">("native", "mfr", "high", undefined, CHR_PRESS),
      chargeTime1080Min: fb(30, "mfr" as Source, "high", "10-80% under ideal conditions, Toyota's own qualifier", CHR_PRESS),
      acOnboardKw: fb(11, "mfr" as Source, "high", undefined, CHR_PRESS),
      dcFastCharging: fb<"standard">("standard", "mfr", "high", undefined, CHR_PRESS),
    },
    thermal: { heatPump: fb("none", "mfr", "medium", "Toyota's 2026 bZ release names its heat pump in the cold-weather equipment list; the C-HR's release has no such item and its climate line is dual-zone automatic control", CHR_PRESS) },
    warranty: { batteryYears: fb(8, "mfr", "high", undefined, CHR_PRESS), batteryMiles: fb(100_000, "mfr", "high", undefined, CHR_PRESS) },
  },
  {
    id: "wagoneer-s-2025-26", make: "JEEP", model: "Wagoneer S", modelYears: [2025, 2026], drive: "AWD",
    abstains: { epaRangeMi: "EPA rates it twice per year, split only by tire supplier (294 miles on the Falken, 262-268 on the Pirelli) - a split no listing field can resolve, so the spread stays silent", heatPump: STELLANTIS_HP_ABSTAIN },
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
    warranty: WAGONEER_S_WARRANTY,
  },
  {
    id: "wagoneer-s-2024", make: "JEEP", model: "Wagoneer S", modelYears: [2024, 2024], drive: "AWD",
    abstains: { epaRangeMi: "EPA rates it twice, split only by tire supplier (303 miles on the Falken, 270 on the Pirelli) - a split no listing field can resolve, so the spread stays silent like the bZ Woodland's", heatPump: STELLANTIS_HP_ABSTAIN },
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
    warranty: WAGONEER_S_WARRANTY,
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
// Split at the 2027 boundary 2026-08-26 — GM's own table (news.gm.com
// 2026-08-13, "GM vehicles with NACS-native charging for the 2026 and 2027
// model years") marks every GM EV NACS-native for MY2027 and says 2026 cars
// other than the Optiq "still require an adapter as they come from the factory
// with a CCS port". One row cannot hold two plugs.
    id: "lyriq-v-2026", make: "CADILLAC", model: "Lyriq", modelYears: [2026, 2026], vin8: ["L"], vds: ["XP"], drive: "AWD",
    abstains: { heatPump: "GM's 2022 Ultium release calls its patented heat pump standard on Ultium EVs, but no Optiq, Vistiq or Lyriq-V document names it and GM has retired the Ultium branding, so the link would be an inference" },
    battery: { packUsableKwh: fb(102, "mfr", "high", "Stated as 102 kWh Useable Battery Energy", "https://web.archive.org/web/20250903021838/https://news.gm.com/home.detail.html/Pages/news/us/en/2025/jan/0123-lyriq-v.html") },
    range: { epaRangeMi: f(285, "mfr", "high", undefined, "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49633") },
    charging: { portStandard: f<"CCS1">("CCS1", "mfr", "high", undefined, GM_NACS_TABLE_2026), superchargerAccess: f<"adapter">("adapter", "mfr", "high", "GM NACS DC adapter", GM_NACS_TABLE_2026) },
    warranty: { batteryYears: f(8, "mfr" as Source), batteryMiles: f(100_000, "mfr" as Source), batteryTransfers: f(true, "mfr" as Source) },
  },
  {
    id: "lyriq-v-2027", make: "CADILLAC", model: "Lyriq", modelYears: [2027, 2027], vin8: ["L"], vds: ["XP"], drive: "AWD",
    abstains: { heatPump: "GM's 2022 Ultium release calls its patented heat pump standard on Ultium EVs, but no Optiq, Vistiq or Lyriq-V document names it and GM has retired the Ultium branding, so the link would be an inference" },
    battery: { packUsableKwh: fb(102, "mfr", "high", "Stated as 102 kWh Useable Battery Energy", "https://web.archive.org/web/20250903021838/https://news.gm.com/home.detail.html/Pages/news/us/en/2025/jan/0123-lyriq-v.html") },
    range: { epaRangeMi: f(285, "mfr", "high", undefined, "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49633") },
    charging: { portStandard: f<"NACS">("NACS", "mfr", "high", undefined, GM_NACS_TABLE_2026), superchargerAccess: f<"native">("native", "mfr", "high", "A GM-approved adapter is needed for CCS/J1772 stations instead", GM_NACS_TABLE_2026) },
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
    thermal: { heatPump: fb("optional", "mfr", "high", "Inside the $4,200 Plus pack - the window sticker is the authority", PS2_PLUS_PACK) },
    warranty: { batteryYears: f(8, "mfr" as Source), batteryMiles: f(100_000, "mfr" as Source), batteryTransfers: f(true, "mfr" as Source) },
    buyerNotes: [NOTE_HP_OPTION],
  },
  {
    id: "polestar2-2022-dual", make: "POLESTAR", model: "Polestar 2", modelYears: [2022, 2022], trim: ["Long Range Dual Motor", "Dual Motor", "Performance", "Plus", "e-AWD"], drive: "AWD",
    battery: { packGrossKwh: f(78, "vin", "high") },
    range: { epaRangeMi: f(249, "mfr", "high", "MY2022 Dual Motor (AWD), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=44449") },
    charging: { portStandard: f("CCS1", "mfr") },
    thermal: { heatPump: fb("optional", "mfr", "high", "Inside the $4,200 Plus pack - the window sticker is the authority", PS2_PLUS_PACK) },
    warranty: { batteryYears: f(8, "mfr" as Source), batteryMiles: f(100_000, "mfr" as Source), batteryTransfers: f(true, "mfr" as Source) },
    buyerNotes: [NOTE_HP_OPTION],
  },
  {
    id: "polestar2-2023-single", make: "POLESTAR", model: "Polestar 2", modelYears: [2023, 2023], trim: ["Long Range Single Motor", "Single Motor", "Plus"], drive: "FWD",
    battery: { packGrossKwh: f(78, "vin", "high") },
    range: { epaRangeMi: f(270, "mfr", "high", "MY2023 Single Motor (FWD), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=45755") },
    charging: { portStandard: f("CCS1", "mfr") },
    thermal: { heatPump: fb("optional", "mfr", "high", "Inside the $4,200 Plus pack - the window sticker is the authority", PS2_PLUS_PACK) },
    warranty: { batteryYears: f(8, "mfr" as Source), batteryMiles: f(100_000, "mfr" as Source), batteryTransfers: f(true, "mfr" as Source) },
    buyerNotes: [NOTE_HP_OPTION],
  },
  {
    id: "polestar2-2023-dual", make: "POLESTAR", model: "Polestar 2", modelYears: [2023, 2023], trim: ["Long Range Dual Motor", "Dual Motor", "Performance", "Plus"], drive: "AWD",
    battery: { packGrossKwh: f(78, "vin", "high") },
    range: { epaRangeMi: f(260, "mfr", "high", "MY2023 Dual Motor (AWD), EPA; the Performance Pack rates the same, the BST edition 247", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=45753") },
    charging: { portStandard: f("CCS1", "mfr") },
    thermal: { heatPump: fb("optional", "mfr", "high", "Inside the $4,200 Plus pack - the window sticker is the authority", PS2_PLUS_PACK) },
    warranty: { batteryYears: f(8, "mfr" as Source), batteryMiles: f(100_000, "mfr" as Source), batteryTransfers: f(true, "mfr" as Source) },
    buyerNotes: [NOTE_HP_OPTION],
  },
  {
    id: "polestar2-2024-25-single", make: "POLESTAR", model: "Polestar 2", modelYears: [2024, 2025], trim: ["Long Range Single Motor", "Single Motor", "Plus"], drive: "RWD",
    battery: { packGrossKwh: f(82, "agg", "medium", "The facelift's larger pack; RWD from MY2024") },
    range: { epaRangeMi: f(320, "mfr", "high", "MY2024 Single Motor (now RWD) on 19-inch wheels, EPA; 307 on 20s; MY2025: 314/300", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46978") },
    charging: { portStandard: f("CCS1", "mfr") },
    thermal: { heatPump: fb("optional", "mfr", "high", "Inside the Plus pack for MY2024; the US lineup dropped the Single Motor for 2025 - the window sticker is the authority", PS2_PLUS_PACK) },
    warranty: { batteryYears: f(8, "mfr" as Source), batteryMiles: f(100_000, "mfr" as Source), batteryTransfers: f(true, "mfr" as Source) },
    buyerNotes: [NOTE_HP_OPTION],
  },
  {
    id: "polestar2-2024-25-dual", make: "POLESTAR", model: "Polestar 2", modelYears: [2024, 2025], trim: ["Long Range Dual Motor", "Dual Motor", "Performance", "Plus"], drive: "AWD",
    battery: { packGrossKwh: f(82, "agg", "medium") },
    range: { epaRangeMi: f(276, "mfr", "high", "MY2024 Dual Motor on 19-inch wheels, EPA; 266 on 20s, 247 with the Performance Pack; MY2025: 278/268/254", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46975") },
    charging: { portStandard: f("CCS1", "mfr") },
    thermal: { heatPump: fb("optional", "mfr", "high", "Inside the Plus pack for MY2024 and included with the Performance pack; the MY2025 car's Climate pack made it standard - the window sticker is the authority", PS2_PLUS_PACK) },
    warranty: { batteryYears: f(8, "mfr" as Source), batteryMiles: f(100_000, "mfr" as Source), batteryTransfers: f(true, "mfr" as Source) },
    buyerNotes: [NOTE_HP_OPTION],
  },
  {
    id: "ex90-2025", make: "VOLVO", model: "EX90", modelYears: [2025, 2025], vin8: ["K", "L"], drive: "AWD",
    battery: { packGrossKwh: f(111, "vin", "high") },
    range: { epaRangeMi: f(300, "mfr", "high", "MY2025 EX90 Twin Motor, EPA; Twin and Twin Performance rate identically (310 on 21-inch wheels)", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48777") },
    charging: { portStandard: f("CCS1", "mfr") },
    thermal: EX90_HP,
    warranty: { batteryYears: f(8, "mfr" as Source), batteryMiles: f(100_000, "mfr" as Source), batteryTransfers: f(true, "mfr" as Source) },
  },
  {
    id: "ex90-2026-twin", make: "VOLVO", model: "EX90", modelYears: [2026, 2026], trim: ["Twin Motor", "Twin", "Ultra"], drive: "AWD",
    battery: { packGrossKwh: f(111, "vin", "high") },
    range: { epaRangeMi: f(298, "mfr", "high", "MY2026 EX90 Twin Motor, EPA; 305 on 21-inch wheels; Performance rates the same. Keyed on trim: Volvo\u2019s VIN code is the trim level (K=Plus/L=Ultra), not the motor", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50256") },
    charging: { portStandard: f("CCS1", "mfr") },
    thermal: EX90_HP,
    warranty: { batteryYears: f(8, "mfr" as Source), batteryMiles: f(100_000, "mfr" as Source), batteryTransfers: f(true, "mfr" as Source) },
  },
  {
    id: "ex90-2026-single", make: "VOLVO", model: "EX90", modelYears: [2026, 2026], trim: ["Single Motor"], drive: "RWD",
    battery: { packGrossKwh: f(104, "agg", "medium", "The single-motor EX90 uses the smaller pack") },
    range: { epaRangeMi: f(276, "mfr", "high", "MY2026 EX90 Single Motor, EPA; 291 on 21-inch wheels", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50254") },
    charging: { portStandard: f("CCS1", "mfr") },
    thermal: EX90_HP,
    warranty: { batteryYears: f(8, "mfr" as Source), batteryMiles: f(100_000, "mfr" as Source), batteryTransfers: f(true, "mfr" as Source) },
  },

  {
    id: "r1s-2022", ...R1S, modelYears: [2022, 2022], drive: "AWD", packVariant: "Quad · Large pack",
    battery: RIV_G1_LARGE,
    range: { epaRangeMi: f(316, "mfr", "high", "MY2022 R1S, every 2022 build is the quad-motor Large pack, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=44461") },
    charging: RIV_PORT1,
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
  },
  {
    id: "r1t-2022", ...R1T, modelYears: [2022, 2022], drive: "AWD", packVariant: "Quad · Large pack",
    battery: RIV_G1_LARGE,
    range: { epaRangeMi: f(314, "mfr", "high", "MY2022 R1T, every 2022 build is the quad-motor Large pack, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=44462") },
    charging: RIV_PORT1,
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
  },
  {
    id: "r1s-2023-quad", ...R1S, modelYears: [2023, 2023], trim: ["Quad Motor", "Quad", "Quad Motor Large Pack"], drive: "AWD", packVariant: "Quad · Large pack",
    battery: RIV_G1_LARGE,
    range: { epaRangeMi: f(321, "mfr", "high", "MY2023 R1S quad-motor on 21-inch wheels, EPA; 274–303 on 20AT/22s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46316") },
    charging: RIV_PORT1,
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
  },
  {
    id: "r1t-2023-quad", ...R1T, modelYears: [2023, 2023], trim: ["Quad Motor", "Quad", "Quad Motor Large Pack"], drive: "AWD", packVariant: "Quad · Large pack",
    battery: RIV_G1_LARGE,
    range: { epaRangeMi: f(328, "mfr", "high", "MY2023 R1T quad-motor on 21-inch wheels, EPA; 289–303 on 20/22s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46313") },
    charging: RIV_PORT1,
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
  },
  {
    id: "r1s-2023-dual", ...R1S, modelYears: [2023, 2023], trim: ["Dual Motor", "Large Pack", "Large", "Performance"], drive: "AWD", packVariant: "Dual · Large pack",
    battery: RIV_G1_LARGE,
    range: { epaRangeMi: f(352, "mfr", "high", "MY2023 R1S Dual (Large pack, the only 2023 dual config) on 21-inch wheels, EPA; 307–341 on 20AT/22s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46996") },
    charging: RIV_PORT1,
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
  },
  {
    id: "r1t-2023-dual", ...R1T, modelYears: [2023, 2023], trim: ["Dual Motor", "Large Pack", "Large", "Performance"], drive: "AWD", packVariant: "Dual · Large pack",
    battery: RIV_G1_LARGE,
    range: { epaRangeMi: f(352, "mfr", "high", "MY2023 R1T Dual (Large pack) on 21-inch wheels, EPA; 341 on 22s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47000") },
    charging: RIV_PORT1,
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
  },
  {
    id: "r1s-2024-quad", ...R1S, modelYears: [2024, 2024], trim: ["Quad Motor", "Quad", "Quad Motor Large Pack"], drive: "AWD", packVariant: "Quad · Large pack",
    battery: RIV_G1_LARGE,
    range: { epaRangeMi: f(321, "mfr", "high", "MY2024 R1S quad on 21-inch wheels, EPA; 274–303 on 20AT/22s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47906") },
    charging: RIV_PORT1,
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
  },
  {
    id: "r1t-2024-quad", ...R1T, modelYears: [2024, 2024], trim: ["Quad Motor", "Quad", "Quad Motor Large Pack"], drive: "AWD", packVariant: "Quad · Large pack",
    battery: RIV_G1_LARGE,
    range: { epaRangeMi: f(328, "mfr", "high", "MY2024 R1T quad on 21-inch wheels, EPA; 289–303 on 20/22s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47883") },
    charging: RIV_PORT1,
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
  },
  {
    id: "r1s-2024-std", ...R1S, modelYears: [2024, 2024], trim: ["Standard Pack", "Standard", "Dual Motor"], drive: "AWD", packVariant: "Dual · Standard pack",
    battery: { packUsableKwh: fb(106, "mfr", "high", "Gen-1 Dual Standard pack", RIV_USABLE) },
    range: { epaRangeMi: f(270, "mfr", "high", "MY2024 R1S Dual Standard on 21-inch wheels, EPA; 255 on 22s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47895") },
    charging: RIV_PORT1,
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
  },
  {
    id: "r1t-2024-std", ...R1T, modelYears: [2024, 2024], trim: ["Standard Pack", "Standard", "Dual Motor"], drive: "AWD", packVariant: "Dual · Standard pack",
    battery: { packUsableKwh: fb(106, "mfr", "high", "Gen-1 Dual Standard pack", RIV_USABLE) },
    range: { epaRangeMi: f(270, "mfr", "high", "MY2024 R1T Dual Standard on 21-inch wheels, EPA; 255 on 22s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47872") },
    charging: RIV_PORT1,
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
  },
  {
    id: "r1s-2024-stdplus", ...R1S, modelYears: [2024, 2024], trim: ["Standard Plus Pack", "Standard Plus"], drive: "AWD", packVariant: "Dual · Standard+ pack",
    battery: { packUsableKwh: fb(121, "mfr", "high", "Gen-1 Dual Standard+ pack", RIV_USABLE) },
    range: { epaRangeMi: f(315, "mfr", "high", "MY2024 R1S Dual Standard+ on 21-inch wheels, EPA; 277–300 on 20AT/22s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47897") },
    charging: RIV_PORT1,
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
  },
  {
    id: "r1t-2024-stdplus", ...R1T, modelYears: [2024, 2024], trim: ["Standard Plus Pack", "Standard Plus"], drive: "AWD", packVariant: "Dual · Standard+ pack",
    battery: { packUsableKwh: fb(121, "mfr", "high", "Gen-1 Dual Standard+ pack", RIV_USABLE) },
    range: { epaRangeMi: f(315, "mfr", "high", "MY2024 R1T Dual Standard+ on 21-inch wheels, EPA; 277–300 on 20AT/22s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47874") },
    charging: RIV_PORT1,
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
  },
  {
    id: "r1s-2024-large", ...R1S, modelYears: [2024, 2024], trim: ["Large Pack", "Large", "Dual Motor"], drive: "AWD", packVariant: "Dual · Large pack",
    battery: RIV_G1_LARGE,
    range: { epaRangeMi: f(352, "mfr", "high", "MY2024 R1S Dual Large on 21-inch wheels, EPA; 307–341 on 20AT/22s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47891") },
    charging: RIV_PORT1,
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
  },
  {
    id: "r1t-2024-large", ...R1T, modelYears: [2024, 2024], trim: ["Large Pack", "Large", "Dual Motor"], drive: "AWD", packVariant: "Dual · Large pack",
    battery: RIV_G1_LARGE,
    range: { epaRangeMi: f(352, "mfr", "high", "MY2024 R1T Dual Large on 21-inch wheels, EPA; 307–341 on 20AT/22s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47868") },
    charging: RIV_PORT1,
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
  },
  {
    id: "r1s-2024-max", ...R1S, modelYears: [2024, 2024], trim: ["Max Pack", "Max", "Dual Motor"], drive: "AWD", packVariant: "Dual · Max pack",
    battery: RIV_G1_MAX,
    range: { epaRangeMi: f(400, "mfr", "high", "MY2024 R1S Dual Max on 21-inch wheels, EPA; 355–380 on 20AT/22s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47893") },
    charging: RIV_PORT1,
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
  },
  {
    id: "r1t-2024-max", ...R1T, modelYears: [2024, 2024], trim: ["Max Pack", "Max", "Dual Motor"], drive: "AWD", packVariant: "Dual · Max pack",
    battery: RIV_G1_MAX,
    range: { epaRangeMi: f(410, "mfr", "high", "MY2024 R1T Dual Max on 21-inch wheels, EPA; 355–380 on 20AT/22s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47870") },
    charging: RIV_PORT1,
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
  },
  {
    id: "r1s-2025-26-std", ...R1S, modelYears: [2025, 2026], trim: ["Standard Pack", "Standard", "Dual Motor"], drive: "AWD", packVariant: "Dual · Standard pack",
    abstains: { portStandard: RIV_PORT_ABSTAIN },
    battery: RIV_G2_STD,
    range: { epaRangeMi: f(258, "mfr", "high", "Gen-2 R1S Dual Standard on 20-inch wheels, EPA, 2025–26; 270 on 22s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48435") },
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
    buyerNotes: [NOTE_RIV_PORT],
  },
  {
    id: "r1t-2025-26-std", ...R1T, modelYears: [2025, 2026], trim: ["Standard Pack", "Standard", "Dual Motor"], drive: "AWD", packVariant: "Dual · Standard pack",
    abstains: { portStandard: RIV_PORT_ABSTAIN },
    battery: RIV_G2_STD,
    range: { epaRangeMi: f(258, "mfr", "high", "Gen-2 R1T Dual Standard on 20-inch wheels, EPA, 2025–26; 270 on 22s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48423") },
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
    buyerNotes: [NOTE_RIV_PORT],
  },
  {
    id: "r1s-2025-26-large", ...R1S, modelYears: [2025, 2026], trim: ["Large Pack", "Large", "Dual Motor"], drive: "AWD", packVariant: "Dual · Large pack",
    abstains: { portStandard: RIV_PORT_ABSTAIN },
    battery: RIV_G2_LARGE,
    range: { epaRangeMi: f(300, "mfr", "high", "Gen-2 R1S Dual Large on 20-inch wheels, EPA, 2025–26; 289–329 on 20AT/22s. The Large Plus pack rates 317–330", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48745") },
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
    buyerNotes: [NOTE_RIV_PORT],
  },
  {
    id: "r1t-2025-26-large", ...R1T, modelYears: [2025, 2026], trim: ["Large Pack", "Large", "Dual Motor"], drive: "AWD", packVariant: "Dual · Large pack",
    abstains: { portStandard: RIV_PORT_ABSTAIN },
    battery: RIV_G2_LARGE,
    range: { epaRangeMi: f(300, "mfr", "high", "Gen-2 R1T Dual Large on 20-inch wheels, EPA, 2025–26; 329 on 22s. The Large Plus pack rates 317–330", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48755") },
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
    buyerNotes: [NOTE_RIV_PORT],
  },
  {
    id: "r1s-2025-26-largeplus", ...R1S, modelYears: [2025, 2026], trim: ["Large Plus Pack", "Large Plus"], drive: "AWD", packVariant: "Dual · Large Plus pack",
    abstains: { portStandard: RIV_PORT_ABSTAIN },
    battery: RIV_G2_LARGEPLUS,
    range: { epaRangeMi: f(317, "mfr", "high", "Gen-2 R1S Dual Large Plus on 20-inch wheels, EPA, 2025–26; 292–330 on 20AT/22s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48747") },
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
    buyerNotes: [NOTE_RIV_PORT],
  },
  {
    id: "r1t-2025-26-largeplus", ...R1T, modelYears: [2025, 2026], trim: ["Large Plus Pack", "Large Plus"], drive: "AWD", packVariant: "Dual · Large Plus pack",
    abstains: { portStandard: RIV_PORT_ABSTAIN },
    battery: RIV_G2_LARGEPLUS,
    range: { epaRangeMi: f(317, "mfr", "high", "Gen-2 R1T Dual Large Plus on 20-inch wheels, EPA, 2025–26; 330 on 22s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48757") },
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
    buyerNotes: [NOTE_RIV_PORT],
  },
  {
    id: "r1s-2025-26-max", ...R1S, modelYears: [2025, 2026], trim: ["Max Pack", "Max", "Dual Motor"], drive: "AWD", packVariant: "Dual · Max pack",
    abstains: { portStandard: RIV_PORT_ABSTAIN },
    battery: RIV_G2_MAX,
    range: { epaRangeMi: f(380, "mfr", "high", "Gen-2 R1S Dual Max on 20-inch wheels, EPA, 2025–26; 370–410 on 20AT/22s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48433") },
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
    buyerNotes: [NOTE_RIV_PORT],
  },
  {
    id: "r1t-2025-26-max", ...R1T, modelYears: [2025, 2026], trim: ["Max Pack", "Max", "Dual Motor"], drive: "AWD", packVariant: "Dual · Max pack",
    abstains: { portStandard: RIV_PORT_ABSTAIN },
    battery: RIV_G2_MAX,
    range: { epaRangeMi: f(380, "mfr", "high", "Gen-2 R1T Dual Max on 20-inch wheels, EPA, 2025–26; 420 on 22s", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48421") },
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
    buyerNotes: [NOTE_RIV_PORT],
  },
  {
    id: "r1s-2025-26-tri", ...R1S, modelYears: [2025, 2026], trim: ["Tri Motor", "Tri", "Tri Motor Max Pack"], drive: "AWD", packVariant: "Tri · Max pack",
    abstains: { portStandard: RIV_PORT_ABSTAIN },
    battery: RIV_G2_MAX,
    range: { epaRangeMi: f(371, "mfr", "high", "Gen-2 R1S Tri Max on 22-inch wheels, EPA, 2025–26; 329 on 20AT", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48751") },
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
    buyerNotes: [NOTE_RIV_PORT],
  },
  {
    id: "r1t-2025-26-tri", ...R1T, modelYears: [2025, 2026], trim: ["Tri Motor", "Tri", "Tri Motor Max Pack"], drive: "AWD", packVariant: "Tri · Max pack",
    abstains: { portStandard: RIV_PORT_ABSTAIN },
    battery: RIV_G2_MAX,
    range: { epaRangeMi: f(371, "mfr", "high", "Gen-2 R1T Tri Max on 22-inch wheels, EPA, 2025–26", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48761") },
    thermal: { heatPump: f("standard", "agg", "medium", "R1 platform heat pump") },
    warranty: RIV_W,
    buyerNotes: [NOTE_RIV_PORT],
  },
  {
    id: "r1s-2026-quad", ...R1S, modelYears: [2026, 2026], trim: ["Quad Motor", "Quad", "Quad Motor Large Pack"], drive: "AWD", packVariant: "Quad · Max pack",
    battery: RIV_G2_MAX,
    range: { epaRangeMi: f(374, "mfr", "high", "MY2026 gen-2 R1S Quad Max on 22-inch wheels, EPA; 325–338 on AT/UHP tires", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49740") },
    charging: { portStandard: fb<"NACS">("NACS", "mfr", "high", "Native NACS port from MY2026", RIV_ADAPTER) },
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
  //
  // The three Wrangler 4xe rows became six on 2026-09-01: every fact but the
  // warranty is identical across 2021-2025, so each pair shares
  // WRANGLER_4XE_FACTS and differs only in which warranty constant it carries.
  // Splitting rows rather than the field is what the schema allows — a Fact
  // holds one value, and 2021's term is a different number.
  {
    id: "wrangler-4xe-2021", make: "JEEP", model: "Wrangler 4xe", modelYears: [2021, 2021], packVariant: "PHEV",
    ...WRANGLER_4XE_FACTS,
    warranty: WRANGLER_4XE_WARRANTY_21,
  },
  {
    id: "wrangler-4xe-2022-25", make: "JEEP", model: "Wrangler 4xe", modelYears: [2022, 2025], packVariant: "PHEV",
    ...WRANGLER_4XE_FACTS,
    warranty: WRANGLER_4XE_WARRANTY_22_25,
  },
  {
    id: "wrangler-unl-4xe-2021", make: "JEEP", model: "Wrangler Unlimited 4xe", modelYears: [2021, 2021], packVariant: "PHEV",
    ...WRANGLER_4XE_FACTS,
    warranty: WRANGLER_4XE_WARRANTY_21,
  },
  {
    id: "wrangler-unl-4xe-2022-25", make: "JEEP", model: "Wrangler Unlimited 4xe", modelYears: [2022, 2025], packVariant: "PHEV",
    ...WRANGLER_4XE_FACTS,
    warranty: WRANGLER_4XE_WARRANTY_22_25,
  },
  {
    // The bare model string ("Wrangler", "Wrangler Unlimited") carries the same
    // facts as the two rows above — the 4xe was 4-door only, and both rows
    // print the identical 22/370/J1772 anyway — so this is one alt row rather
    // than a 2-door/4-door pair, which would only have manufactured an
    // ambiguity between two identical answers.
    //
    // The `trim` key is what makes the bare model string safe, and it is not
    // decoration. `modelAliases: ["Wrangler"]` on a trim-less row would claim
    // 22 electric miles for every petrol Wrangler VIN typed into /vin/, which
    // decodes to make JEEP, model "Wrangler" and nothing that says 4xe. The
    // feed can't produce that car (classifyEv never admits a gas Wrangler),
    // but /vin/ takes any VIN a shopper pastes in, and a false range there is
    // the same false claim. Requiring the listing's own trim to say "4xe"
    // costs nothing: all 139 live bare-model 4xe listings on 2026-08-23 carry
    // it ("Unlimited Sahara 4XE", "Unltd Rubicon 4XE", "Sport S 4xe", "Sport
    // 4XE", "Willys 4xe", "High Altitude 4xe", or bare "4XE"), and not one of
    // them is trim-less. scripts/phev-enrichment-gap.mjs is the check that
    // says so, and it will say so again if a feed ever starts sending the
    // model without the trim.
    id: "wrangler-4xe-2021-alt", make: "JEEP", model: "Wrangler", modelAliases: ["Wrangler Unlimited"],
    modelYears: [2021, 2021], trim: ["4xe"], packVariant: "PHEV",
    ...WRANGLER_4XE_FACTS,
    warranty: WRANGLER_4XE_WARRANTY_21,
  },
  {
    // The 2022-25 half of the row above, split for the warranty the same way
    // the full-name rows are. The trim guard is the whole point of both, so
    // it has to be repeated here rather than shared: a bare "Wrangler" row
    // without it hands a petrol Wrangler the 4xe's 22 electric miles.
    id: "wrangler-4xe-2022-25-alt", make: "JEEP", model: "Wrangler", modelAliases: ["Wrangler Unlimited"],
    modelYears: [2022, 2025], trim: ["4xe"], packVariant: "PHEV",
    ...WRANGLER_4XE_FACTS,
    warranty: WRANGLER_4XE_WARRANTY_22_25,
  },
  {
    // "GR Cherokee 4XE" is one dealer's abbreviation, and the string names the
    // plug-in itself, so it needs no trim guard the way the bare name does.
    id: "gc-4xe-2022-25", make: "JEEP", model: "Grand Cherokee 4xe", modelAliases: ["GR Cherokee 4XE"],
    abstains: { heatPump: STELLANTIS_HP_ABSTAIN },
    modelYears: [2022, 2025], packVariant: "PHEV",
    battery: { packGrossKwh: fb(17, "mfr", "high", JEEP_17KWH_NOTE, "https://media.stellantisnorthamerica.com/newsrelease.do?id=23153&mid=") },
    range: {
      epaRangeMi: f(26, "mfr", "high", "Electric-only EPA range. Identical rating 2022–25", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47277"),
      epaRangeTotalMi: f(470, "mfr", "high", undefined, "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47277"),
    },
    charging: { portStandard: f("J1772", "mfr", "high", "AC charging only, no DC fast charge"), dcFastCharging: f("none", "mfr") },
    warranty: GC_4XE_WARRANTY,
  },
  {
    // The bare "Grand Cherokee" bucket, split out of the row above 2026-08-23
    // and given the same `trim` guard the Wrangler alt row explains at length.
    // It arrived on 2026-08-21 as a trim-less `modelAliases: ["Grand Cherokee"]`
    // on that row, reasoning that a gas Grand Cherokee never reaches this
    // database — true of the feed, and not true of /vin/, which decodes
    // whatever VIN a shopper pastes in and would have printed 26 electric
    // miles for a petrol Limited. Measured before moving it: all 64 live
    // bare-model listings on 2026-08-23 say 4XE in their trim and none is
    // trim-less, so the guard costs no coverage at all.
    id: "gc-4xe-2022-25-alt", make: "JEEP", model: "Grand Cherokee", modelYears: [2022, 2025], trim: ["4xe"], packVariant: "PHEV",
    abstains: { heatPump: STELLANTIS_HP_ABSTAIN },
    battery: { packGrossKwh: fb(17, "mfr", "high", JEEP_17KWH_NOTE, "https://media.stellantisnorthamerica.com/newsrelease.do?id=23153&mid=") },
    range: {
      epaRangeMi: f(26, "mfr", "high", "Electric-only EPA range. Identical rating 2022–25", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47277"),
      epaRangeTotalMi: f(470, "mfr", "high", undefined, "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=47277"),
    },
    charging: { portStandard: f("J1772", "mfr", "high", "AC charging only, no DC fast charge"), dcFastCharging: f("none", "mfr") },
    warranty: GC_4XE_WARRANTY,
  },
  {
    // No `trim` on the "X5 PHEV" rows, unlike their "X5" siblings below. The
    // model string has already said plug-in, and BMW sold exactly one X5
    // plug-in in each of these windows — the xDrive45e through 2023, the
    // xDrive50e from 2024 — so the trim narrows nothing here and only ever
    // refused cars. It refused 23 live 2026 listings that arrive as model
    // "X5 PHEV" with no trim at all (trimMatches declines a trim-specific row
    // when the listing names no trim, deliberately). The guard stays on the
    // bare-"X5" rows, which is where it is load-bearing: those must not match
    // a petrol xDrive40i.
    id: "x5-45e-2021-23", make: "BMW", model: "X5 PHEV", modelYears: [2021, 2023], packVariant: "PHEV",
    abstains: { heatPump: X5_HP_ABSTAIN, batteryWarranty: X5_45E_WARRANTY_ABSTAIN },
    // "X5 xDrive45e" as a MODEL string surfaced in the 2026-08-24 gap run (7
    // live listings) — the badge in the model names the plug-in itself, so it
    // aliases here the same way "X5 xDrive50e" already does on the 50e row.
    modelAliases: ["X5 xDrive45e"],
    battery: { packUsableKwh: fb(17.06, "mfr", "high", "24 kWh gross, BMW USA's spec row; BMW's European sheet nets 20.9 for the same car", "https://www.press.bmwgroup.com/usa/article/detail/T0309345EN_US/the-2021-bmw-x5-xdrive45e-phev-sports-activity-vehicle") },
    range: {
      epaRangeMi: f(31, "mfr", "high", "xDrive45e electric-only EPA range", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=42807"),
      epaRangeTotalMi: f(400, "mfr", "high", undefined, "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=42807"),
    },
    charging: { portStandard: f("J1772", "mfr", "high", "AC charging only"), dcFastCharging: f("none", "mfr") },
  },
  {
    id: "x5-50e-2024-26", make: "BMW", model: "X5 PHEV", modelAliases: ["X5 xDrive50e"], modelYears: [2024, 2026], packVariant: "PHEV",
    abstains: { heatPump: X5_HP_ABSTAIN },
    battery: { packUsableKwh: fb(19.2, "mfr", "high", "29.5 kWh gross, BMW USA's spec row; BMW's European sheet nets 25.7", "https://www.press.bmwgroup.com/usa/article/detail/T0408460EN_US/the-2024-bmw-x5-and-x6") },
    range: {
      epaRangeMi: f(39, "mfr", "high", "xDrive50e electric-only EPA range (40 for 2026). MY2024 has no separate fueleconomy.gov entry (control: 2025–26 are present), same xDrive50e", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49009"),
      epaRangeTotalMi: f(440, "mfr", "high", undefined, "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49009"),
    },
    charging: { portStandard: f("J1772", "mfr", "high", "AC charging only"), dcFastCharging: f("none", "mfr") },
    warranty: X5_50E_WARRANTY,
  },
  {
    id: "x5-45e-2021-23-alt", make: "BMW", model: "X5", modelYears: [2021, 2023], trim: ["xDrive45e", "45e"], packVariant: "PHEV",
    abstains: { heatPump: X5_HP_ABSTAIN, batteryWarranty: X5_45E_WARRANTY_ABSTAIN },
    battery: { packUsableKwh: fb(17.06, "mfr", "high", "24 kWh gross, BMW USA's spec row; BMW's European sheet nets 20.9 for the same car", "https://www.press.bmwgroup.com/usa/article/detail/T0309345EN_US/the-2021-bmw-x5-xdrive45e-phev-sports-activity-vehicle") },
    range: {
      epaRangeMi: f(31, "mfr", "high", "xDrive45e electric-only EPA range", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=42807"),
      epaRangeTotalMi: f(400, "mfr", "high", undefined, "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=42807"),
    },
    charging: { portStandard: f("J1772", "mfr", "high", "AC charging only"), dcFastCharging: f("none", "mfr") },
  },
  {
    id: "x5-50e-2024-26-alt", make: "BMW", model: "X5", modelYears: [2024, 2026], trim: ["xDrive50e", "50e"], packVariant: "PHEV",
    abstains: { heatPump: X5_HP_ABSTAIN },
    battery: { packUsableKwh: fb(19.2, "mfr", "high", "29.5 kWh gross, BMW USA's spec row; BMW's European sheet nets 25.7", "https://www.press.bmwgroup.com/usa/article/detail/T0408460EN_US/the-2024-bmw-x5-and-x6") },
    range: {
      epaRangeMi: f(39, "mfr", "high", "xDrive50e electric-only EPA range (40 for 2026)", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49009"),
      epaRangeTotalMi: f(440, "mfr", "high", undefined, "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49009"),
    },
    charging: { portStandard: f("J1772", "mfr", "high", "AC charging only"), dcFastCharging: f("none", "mfr") },
    warranty: X5_50E_WARRANTY,
  },
  {
    id: "rogue-phev-2025-26", make: "NISSAN", model: "Rogue Plug-In Hybrid", modelYears: [2025, 2026], packVariant: "PHEV",
    battery: { packGrossKwh: fb(20, "mfr", "high", "Nissan states 20 kWh without a gross or usable qualifier", ROGUE_PHEV_KIT) },
    range: {
      epaRangeMi: f(38, "mfr", "medium", "Electric-only range, Nissan's EPA-estimate; fueleconomy.gov has no Rogue PHEV entry yet (control: gas Rogues are present)", "https://usa.nissannews.com/en-US/releases/2026-nissan-rogue-plug-in-hybrid-press-kit"),
      epaRangeTotalMi: f(420, "mfr", "medium", undefined, "https://usa.nissannews.com/en-US/releases/2026-nissan-rogue-plug-in-hybrid-press-kit"),
    },
    charging: { portStandard: f("J1772", "mfr", "high", "AC charging only"), dcFastCharging: f("none", "mfr") },
    thermal: { heatPump: fb("standard", "mfr", "high", "Standard on both grades, SL and Platinum", ROGUE_PHEV_KIT) },
    warranty: { batteryYears: fb(8, "mfr", "high", "Covered as a PHEV System component; unlike the Leaf and Ariya there is no capacity-retention warranty", ROGUE_PHEV_WB), batteryMiles: fb(100_000, "mfr", "high", undefined, ROGUE_PHEV_WB) },
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
    thermal: TAY1_HP,
    warranty: POR_W, buyerNotes: [NOTE_TAY_HP],
  },
  {
    id: "taycan-2020-turbo", ...TAY, modelYears: [2020, 2020], trim: ["Turbo"], packVariant: "Performance Battery Plus",
    battery: PB1P,
    range: { epaRangeMi: f(201, "mfr", "high", "MY2020 Turbo, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=42383") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    thermal: TAY1_HP,
    warranty: POR_W, buyerNotes: [NOTE_TAY_HP],
  },
  {
    id: "taycan-2020-turbos", ...TAY, modelYears: [2020, 2020], trim: ["Turbo S"], packVariant: "Performance Battery Plus",
    battery: PB1P,
    range: { epaRangeMi: f(192, "mfr", "high", "MY2020 Turbo S, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=42427") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    thermal: TAY1_HP,
    warranty: POR_W, buyerNotes: [NOTE_TAY_HP],
  },
  {
    id: "taycan-2021-22-base-pb", ...TAY, modelYears: [2021, 2022], trim: ["Base", "Performance Battery"], packVariant: "Performance Battery",
    battery: PB1,
    range: { epaRangeMi: f(200, "mfr", "high", "MY2021–22 base Taycan, Performance Battery (79.2 kWh, resolved from this VIN), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=43802") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    thermal: TAY1_HP,
    warranty: POR_W, buyerNotes: [NOTE_TAY_HP],
  },
  {
    id: "taycan-2021-22-base-pbp", ...TAY, modelYears: [2021, 2022], trim: ["Base", "Performance Battery Plus"], packVariant: "Performance Battery Plus",
    battery: PB1P,
    range: { epaRangeMi: f(225, "mfr", "high", "MY2021–22 base Taycan, Performance Battery Plus (93.4 kWh, resolved from this VIN), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=43803") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    thermal: TAY1_HP,
    warranty: POR_W, buyerNotes: [NOTE_TAY_HP],
  },
  {
    id: "taycan-2021-22-4s-pb", ...TAY, modelYears: [2021, 2022], trim: ["4S"], packVariant: "Performance Battery",
    battery: PB1,
    range: { epaRangeMi: f(199, "mfr", "high", "MY2021–22 4S, Performance Battery (79.2 kWh, resolved from this VIN), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=43684") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    thermal: TAY1_HP,
    warranty: POR_W, buyerNotes: [NOTE_TAY_HP],
  },
  {
    id: "taycan-2021-22-4s-pbp", ...TAY, modelYears: [2021, 2022], trim: ["4S"], packVariant: "Performance Battery Plus",
    battery: PB1P,
    range: { epaRangeMi: f(227, "mfr", "high", "MY2021–22 4S, Performance Battery Plus (93.4 kWh, resolved from this VIN), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=43685") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    thermal: TAY1_HP,
    warranty: POR_W, buyerNotes: [NOTE_TAY_HP],
  },
  {
    id: "taycan-2022-gts", ...TAY, modelYears: [2022, 2022], trim: ["GTS"], packVariant: "Performance Battery Plus",
    battery: PB1P,
    range: { epaRangeMi: f(246, "mfr", "high", "MY2022 GTS, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=45715") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    thermal: TAY1_HP,
    warranty: POR_W, buyerNotes: [NOTE_TAY_HP],
  },
  {
    id: "taycan-2022-gts-st", ...TAY, modelYears: [2022, 2022], trim: ["GTS Sport Turismo", "GTS Sport Tourismo", "GTS ST", "GTS Wagon"], packVariant: "Performance Battery Plus",
    battery: PB1P,
    range: { epaRangeMi: f(233, "mfr", "high", "MY2022 GTS Sport Turismo, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=45716") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    thermal: TAY1_HP,
    warranty: POR_W, buyerNotes: [NOTE_TAY_HP],
  },
  {
    id: "taycan-2021-22-turbo", ...TAY, modelYears: [2021, 2022], trim: ["Turbo"], packVariant: "Performance Battery Plus",
    battery: PB1P,
    range: { epaRangeMi: f(212, "mfr", "high", "MY2021–22 Turbo, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=43910") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    thermal: TAY1_HP,
    warranty: POR_W, buyerNotes: [NOTE_TAY_HP],
  },
  {
    id: "taycan-2021-22-turbos", ...TAY, modelYears: [2021, 2022], trim: ["Turbo S"], packVariant: "Performance Battery Plus",
    battery: PB1P,
    range: { epaRangeMi: f(201, "mfr", "high", "MY2021–22 Turbo S, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=43911") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    thermal: TAY1_HP,
    warranty: POR_W, buyerNotes: [NOTE_TAY_HP],
  },
  {
    id: "taycan-2023-24-base-pb", ...TAY, modelYears: [2023, 2024], trim: ["Base", "Performance Battery"], packVariant: "Performance Battery",
    battery: PB1,
    range: { epaRangeMi: f(208, "mfr", "high", "MY2023–24 base Taycan, Performance Battery (79.2 kWh, resolved from this VIN), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46025") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    thermal: TAY1_HP,
    warranty: POR_W, buyerNotes: [NOTE_TAY_HP],
  },
  {
    id: "taycan-2023-24-base-pbp", ...TAY, modelYears: [2023, 2024], trim: ["Base", "Performance Battery Plus"], packVariant: "Performance Battery Plus",
    battery: PB1P,
    range: { epaRangeMi: f(242, "mfr", "high", "MY2023–24 base Taycan, Performance Battery Plus (93.4 kWh, resolved from this VIN), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46024") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    thermal: TAY1_HP,
    warranty: POR_W, buyerNotes: [NOTE_TAY_HP],
  },
  {
    id: "taycan-2023-24-4-pbp", ...TAY, modelYears: [2023, 2024], trim: ["4", "4 Black Edition"], packVariant: "Performance Battery Plus",
    battery: PB1P,
    range: { epaRangeMi: f(235, "mfr", "high", "MY2023–24 Taycan 4, EPA (the 4 Cross Turismo carries the same 235 rating)", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46018") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    thermal: TAY1_HP,
    warranty: POR_W, buyerNotes: [NOTE_TAY_HP],
  },
  {
    id: "taycan-2023-24-4s-pb", ...TAY, modelYears: [2023, 2024], trim: ["4S", "4S Black Edition"], packVariant: "Performance Battery",
    battery: PB1,
    range: { epaRangeMi: f(206, "mfr", "high", "MY2023–24 4S, Performance Battery (79.2 kWh, resolved from this VIN), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46021") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    thermal: TAY1_HP,
    warranty: POR_W, buyerNotes: [NOTE_TAY_HP],
  },
  {
    id: "taycan-2023-24-4s-pbp", ...TAY, modelYears: [2023, 2024], trim: ["4S", "4S Black Edition"], packVariant: "Performance Battery Plus",
    battery: PB1P,
    range: { epaRangeMi: f(235, "mfr", "high", "MY2023–24 4S, Performance Battery Plus (93.4 kWh, resolved from this VIN), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46020") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    thermal: TAY1_HP,
    warranty: POR_W, buyerNotes: [NOTE_TAY_HP],
  },
  {
    id: "taycan-2023-24-gts", ...TAY, modelYears: [2023, 2024], trim: ["GTS"], packVariant: "Performance Battery Plus",
    battery: PB1P,
    range: { epaRangeMi: f(246, "mfr", "high", "MY2023–24 GTS, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46022") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    thermal: TAY1_HP,
    warranty: POR_W, buyerNotes: [NOTE_TAY_HP],
  },
  {
    id: "taycan-2023-24-gts-st", ...TAY, modelYears: [2023, 2024], trim: ["GTS Sport Turismo", "GTS Sport Tourismo", "GTS ST", "GTS Wagon"], packVariant: "Performance Battery Plus",
    battery: PB1P,
    range: { epaRangeMi: f(233, "mfr", "high", "MY2023–24 GTS Sport Turismo, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46023") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    thermal: TAY1_HP,
    warranty: POR_W, buyerNotes: [NOTE_TAY_HP],
  },
  {
    id: "taycan-2023-24-turbo", ...TAY, modelYears: [2023, 2024], trim: ["Turbo"], packVariant: "Performance Battery Plus",
    battery: PB1P,
    range: { epaRangeMi: f(238, "mfr", "high", "MY2023–24 Turbo, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46026") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    thermal: TAY1_HP,
    warranty: POR_W, buyerNotes: [NOTE_TAY_HP],
  },
  {
    id: "taycan-2023-24-turbos", ...TAY, modelYears: [2023, 2024], trim: ["Turbo S"], packVariant: "Performance Battery Plus",
    battery: PB1P,
    range: { epaRangeMi: f(222, "mfr", "high", "MY2023–24 Turbo S, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46028") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    thermal: TAY1_HP,
    warranty: POR_W, buyerNotes: [NOTE_TAY_HP],
  },
  {
    id: "taycan-2025-26-base-pb", ...TAY, modelYears: [2025, 2026], trim: ["Base", "Performance Battery"], packVariant: "Performance Battery",
    battery: PB2,
    range: { epaRangeMi: f(274, "mfr", "high", "MY2025–26 base Taycan (gen-2 facelift), Performance Battery, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48415") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    thermal: TAY2_HP,
    warranty: POR_W,
  },
  {
    id: "taycan-2025-base-pbp", ...TAY, modelYears: [2025, 2025], trim: ["Base", "Performance Battery Plus"], packVariant: "Performance Battery Plus",
    battery: PB2P,
    range: { epaRangeMi: f(318, "mfr", "high", "MY2025 base Taycan, Performance Battery Plus, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48414") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    thermal: TAY2_HP,
    warranty: POR_W,
  },
  {
    id: "taycan-2025-26-4-pbp", ...TAY, modelYears: [2025, 2026], trim: ["4", "4 Black Edition"], packVariant: "Performance Battery Plus",
    battery: PB2P,
    range: { epaRangeMi: f(294, "mfr", "high", "MY2025–26 Taycan 4, Performance Battery Plus, EPA; 315 on 19-inch all-seasons; the 2026 Performance Battery rates 251", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49120") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    thermal: TAY2_HP,
    warranty: POR_W,
  },
  {
    id: "taycan-2025-26-4s-pb", ...TAY, modelYears: [2025, 2026], trim: ["4S", "4S Black Edition"], packVariant: "Performance Battery",
    battery: PB2,
    range: { epaRangeMi: f(252, "mfr", "high", "MY2025–26 4S, Performance Battery, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48733") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    thermal: TAY2_HP,
    warranty: POR_W,
  },
  {
    id: "taycan-2025-26-4s-pbp", ...TAY, modelYears: [2025, 2026], trim: ["4S", "4S Black Edition"], packVariant: "Performance Battery Plus",
    battery: PB2P,
    range: { epaRangeMi: f(295, "mfr", "high", "MY2025–26 4S, Performance Battery Plus, EPA; 315 on 19-inch wheels", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48732") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    thermal: TAY2_HP,
    warranty: POR_W,
  },
  {
    id: "taycan-2025-26-gts", ...TAY, modelYears: [2025, 2026], trim: ["GTS"], packVariant: "Performance Battery Plus",
    battery: PB2P,
    range: { epaRangeMi: f(293, "mfr", "high", "MY2025–26 GTS, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49121") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    thermal: TAY2_HP,
    warranty: POR_W,
  },
  {
    id: "taycan-2025-26-gts-st", ...TAY, modelYears: [2025, 2026], trim: ["GTS Sport Turismo", "GTS Sport Tourismo", "GTS ST", "GTS Wagon"], packVariant: "Performance Battery Plus",
    battery: PB2P,
    range: { epaRangeMi: f(279, "mfr", "high", "MY2025–26 GTS Sport Turismo, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49122") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    thermal: TAY2_HP,
    warranty: POR_W,
  },
  {
    id: "taycan-2025-26-turbo", ...TAY, modelYears: [2025, 2026], trim: ["Turbo"], packVariant: "Performance Battery Plus",
    battery: PB2P,
    range: { epaRangeMi: f(292, "mfr", "high", "MY2025–26 Turbo, EPA; 317 on 21-inch Aero wheels", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48734") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    thermal: TAY2_HP,
    warranty: POR_W,
  },
  {
    id: "taycan-2025-26-turbogt", ...TAY, modelYears: [2025, 2026], trim: ["Turbo GT"], packVariant: "Performance Battery Plus",
    battery: PB2P,
    range: { epaRangeMi: f(276, "mfr", "high", "MY2025–26 Turbo GT, EPA; 269 with the Weissach Package", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48737") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    thermal: TAY2_HP,
    warranty: POR_W,
  },
  {
    id: "taycan-2025-26-turbos", ...TAY, modelYears: [2025, 2026], trim: ["Turbo S"], packVariant: "Performance Battery Plus",
    battery: PB2P,
    range: { epaRangeMi: f(266, "mfr", "high", "MY2025–26 Turbo S, EPA; 298 on 21-inch Aero wheels", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48739") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    thermal: TAY2_HP,
    warranty: POR_W,
  },
  {
    id: "taycan-ct-2021-22-4", ...TAY, modelYears: [2021, 2022], trim: ["4 Cross Turismo", "4 Cross Tourismo"], packVariant: "Cross Turismo",
    battery: PB1P,
    range: { epaRangeMi: f(215, "mfr", "high", "MY2021–22 4 Cross Turismo, EPA (4S CT rates the same 215)", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=44721") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    thermal: TAY1_HP,
    warranty: POR_W, buyerNotes: [NOTE_TAY_HP],
  },
  {
    id: "taycan-ct-2021-22-4s", ...TAY, modelYears: [2021, 2022], trim: ["4S Cross Turismo", "4S Cross Tourismo"], packVariant: "Cross Turismo",
    battery: PB1P,
    range: { epaRangeMi: f(215, "mfr", "high", "MY2021–22 4S Cross Turismo, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=44722") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    thermal: TAY1_HP,
    warranty: POR_W, buyerNotes: [NOTE_TAY_HP],
  },
  {
    id: "taycan-ct-2021-22-turbo", ...TAY, modelYears: [2021, 2022], trim: ["Turbo Cross Turismo", "Turbo Cross Tourismo"], packVariant: "Cross Turismo",
    battery: PB1P,
    range: { epaRangeMi: f(204, "mfr", "high", "MY2021–22 Turbo Cross Turismo, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=44724") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    thermal: TAY1_HP,
    warranty: POR_W, buyerNotes: [NOTE_TAY_HP],
  },
  {
    id: "taycan-ct-2021-22-turbos", ...TAY, modelYears: [2021, 2022], trim: ["Turbo S Cross Turismo", "Turbo S Cross Tourismo"], packVariant: "Cross Turismo",
    battery: PB1P,
    range: { epaRangeMi: f(202, "mfr", "high", "MY2021–22 Turbo S Cross Turismo, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=44723") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    thermal: TAY1_HP,
    warranty: POR_W, buyerNotes: [NOTE_TAY_HP],
  },
  {
    id: "taycan-ct-2023-24-4", ...TAY, modelYears: [2023, 2024], trim: ["4 Cross Turismo", "4 Cross Tourismo"], packVariant: "Cross Turismo",
    battery: PB1P,
    range: { epaRangeMi: f(235, "mfr", "high", "MY2023–24 4 Cross Turismo, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46018") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    thermal: TAY1_HP,
    warranty: POR_W, buyerNotes: [NOTE_TAY_HP],
  },
  {
    id: "taycan-ct-2023-24-4s", ...TAY, modelYears: [2023, 2024], trim: ["4S Cross Turismo", "4S Cross Tourismo"], packVariant: "Cross Turismo",
    battery: PB1P,
    range: { epaRangeMi: f(230, "mfr", "high", "MY2023–24 4S Cross Turismo, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46019") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    thermal: TAY1_HP,
    warranty: POR_W, buyerNotes: [NOTE_TAY_HP],
  },
  {
    id: "taycan-ct-2023-24-turbo", ...TAY, modelYears: [2023, 2024], trim: ["Turbo Cross Turismo", "Turbo Cross Tourismo"], packVariant: "Cross Turismo",
    battery: PB1P,
    range: { epaRangeMi: f(233, "mfr", "high", "MY2023–24 Turbo Cross Turismo, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46027") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    thermal: TAY1_HP,
    warranty: POR_W, buyerNotes: [NOTE_TAY_HP],
  },
  {
    id: "taycan-ct-2023-24-turbos", ...TAY, modelYears: [2023, 2024], trim: ["Turbo S Cross Turismo", "Turbo S Cross Tourismo"], packVariant: "Cross Turismo",
    battery: PB1P,
    range: { epaRangeMi: f(222, "mfr", "high", "MY2023–24 Turbo S Cross Turismo, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46029") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    thermal: TAY1_HP,
    warranty: POR_W, buyerNotes: [NOTE_TAY_HP],
  },
  {
    id: "taycan-ct-2025-26-4", ...TAY, modelYears: [2025, 2026], trim: ["4 Cross Turismo", "4 Cross Tourismo"], packVariant: "Cross Turismo",
    battery: PB2P,
    range: { epaRangeMi: f(277, "mfr", "high", "MY2025–26 4 Cross Turismo, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48730") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    thermal: TAY2_HP,
    warranty: POR_W,
  },
  {
    id: "taycan-ct-2025-26-4s", ...TAY, modelYears: [2025, 2026], trim: ["4S Cross Turismo", "4S Cross Tourismo"], packVariant: "Cross Turismo",
    battery: PB2P,
    range: { epaRangeMi: f(272, "mfr", "high", "MY2025–26 4S Cross Turismo, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48731") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    thermal: TAY2_HP,
    warranty: POR_W,
  },
  {
    id: "taycan-ct-2025-26-turbo", ...TAY, modelYears: [2025, 2026], trim: ["Turbo Cross Turismo", "Turbo Cross Tourismo"], packVariant: "Cross Turismo",
    battery: PB2P,
    range: { epaRangeMi: f(265, "mfr", "high", "MY2025–26 Turbo Cross Turismo, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48736") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    thermal: TAY2_HP,
    warranty: POR_W,
  },
  {
    id: "taycan-ct-2025-26-turbos", ...TAY, modelYears: [2025, 2026], trim: ["Turbo S Cross Turismo", "Turbo S Cross Tourismo"], packVariant: "Cross Turismo",
    battery: PB2P,
    range: { epaRangeMi: f(261, "mfr", "high", "MY2025–26 Turbo S Cross Turismo, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48741") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    thermal: TAY2_HP,
    warranty: POR_W,
  },
  {
    id: "tayct-2021-22", ...TAYCT, modelYears: [2021, 2022], trim: ["4", "4S", "4 Cross Turismo", "4S Cross Turismo", "4 Cross Tourismo", "4S Cross Tourismo"], packVariant: "Cross Turismo",
    battery: PB1P,
    range: { epaRangeMi: f(215, "mfr", "high", "MY2021–22 4/4S Cross Turismo, EPA, both rate 215", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=44721") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    thermal: TAY1_HP,
    warranty: POR_W, buyerNotes: [NOTE_TAY_HP],
  },
  {
    id: "tayct-2023-24-4", ...TAYCT, modelYears: [2023, 2024], trim: ["4", "4 Cross Turismo", "4 Cross Tourismo"], packVariant: "Cross Turismo",
    battery: PB1P,
    range: { epaRangeMi: f(235, "mfr", "high", "MY2023–24 4 Cross Turismo, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46018") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    thermal: TAY1_HP,
    warranty: POR_W, buyerNotes: [NOTE_TAY_HP],
  },
  {
    id: "tayct-2023-24-4s", ...TAYCT, modelYears: [2023, 2024], trim: ["4S", "4S Cross Turismo", "4S Cross Tourismo"], packVariant: "Cross Turismo",
    battery: PB1P,
    range: { epaRangeMi: f(230, "mfr", "high", "MY2023–24 4S Cross Turismo, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46019") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    thermal: TAY1_HP,
    warranty: POR_W, buyerNotes: [NOTE_TAY_HP],
  },
  {
    id: "tayct-2025-26-4", ...TAYCT, modelYears: [2025, 2026], trim: ["4", "4 Cross Turismo", "4 Cross Tourismo"], packVariant: "Cross Turismo",
    battery: PB2P,
    range: { epaRangeMi: f(277, "mfr", "high", "MY2025–26 4 Cross Turismo, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48730") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    thermal: TAY2_HP,
    warranty: POR_W,
  },
  {
    id: "tayct-2025-26-4s", ...TAYCT, modelYears: [2025, 2026], trim: ["4S", "4S Cross Turismo", "4S Cross Tourismo"], packVariant: "Cross Turismo",
    battery: PB2P,
    range: { epaRangeMi: f(272, "mfr", "high", "MY2025–26 4S Cross Turismo, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48731") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    thermal: TAY2_HP,
    warranty: POR_W,
  },
  {
    id: "macan-2024-25-4", ...MAC, modelYears: [2024, 2025], trim: ["4", "Macan 4", "4 Electric"], packVariant: "Macan 4",
    battery: MACB,
    range: { epaRangeMi: f(308, "mfr", "high", "MY2024–25 Macan 4 Electric, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48793") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    thermal: MACAN_HP,
    warranty: POR_W,
  },
  {
    id: "macan-2026-4", ...MAC, modelYears: [2026, 2026], trim: ["4", "Macan 4", "4 Electric"], packVariant: "Macan 4",
    battery: MACB,
    range: { epaRangeMi: f(304, "mfr", "high", "MY2026 Macan 4 Electric, EPA; 324 on 20-inch wheels", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50294") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    thermal: MACAN_HP,
    warranty: POR_W,
  },
  {
    id: "macan-2025-base", ...MAC, modelYears: [2025, 2025], trim: ["Electric", "Base"], packVariant: "Macan",
    battery: MACB,
    range: { epaRangeMi: f(315, "mfr", "high", "MY2025 base Macan Electric (RWD), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49119") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    thermal: MACAN_HP,
    warranty: POR_W,
  },
  {
    id: "macan-2026-base", ...MAC, modelYears: [2026, 2026], trim: ["Electric", "Base"], packVariant: "Macan",
    battery: MACB,
    range: { epaRangeMi: f(309, "mfr", "high", "MY2026 base Macan Electric (RWD), EPA; 332 on 20-inch wheels", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50296") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    thermal: MACAN_HP,
    warranty: POR_W,
  },
  {
    id: "macan-2025-4s", ...MAC, modelYears: [2025, 2025], trim: ["4S", "4S Electric"], packVariant: "Macan 4S",
    battery: MACB,
    range: { epaRangeMi: f(288, "mfr", "high", "MY2025 Macan 4S Electric, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48728") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    thermal: MACAN_HP,
    warranty: POR_W,
  },
  {
    id: "macan-2026-4s", ...MAC, modelYears: [2026, 2026], trim: ["4S", "4S Electric"], packVariant: "Macan 4S",
    battery: MACB,
    range: { epaRangeMi: f(290, "mfr", "high", "MY2026 Macan 4S Electric, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50295") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    thermal: MACAN_HP,
    warranty: POR_W,
  },
  {
    id: "macan-2024-25-turbo", ...MAC, modelYears: [2024, 2025], trim: ["Turbo", "Electric Turbo", "Turbo Electric"], packVariant: "Macan Turbo",
    battery: MACB,
    range: { epaRangeMi: f(288, "mfr", "high", "MY2024–25 Macan Turbo Electric, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48794") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    thermal: MACAN_HP,
    warranty: POR_W,
  },
  {
    id: "macan-2026-turbo", ...MAC, modelYears: [2026, 2026], trim: ["Turbo", "Electric Turbo", "Turbo Electric"], packVariant: "Macan Turbo",
    battery: MACB,
    range: { epaRangeMi: f(293, "mfr", "high", "MY2026 Macan Turbo Electric, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50298") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    thermal: MACAN_HP,
    warranty: POR_W,
  },
  {
    id: "macan-2026-gts", ...MAC, modelYears: [2026, 2026], trim: ["GTS", "GTS Electric"], packVariant: "Macan GTS",
    battery: MACB,
    range: { epaRangeMi: f(294, "mfr", "high", "MY2026 Macan GTS Electric, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50297") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    thermal: MACAN_HP,
    warranty: POR_W,
  },
  {
    id: "macan-2024-25-4-alt", ...MACALT, modelYears: [2024, 2025], trim: ["4", "Macan 4", "4 Electric"], packVariant: "Macan 4",
    battery: MACB,
    range: { epaRangeMi: f(308, "mfr", "high", "MY2024–25 Macan 4 Electric, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48793") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    thermal: MACAN_HP,
    warranty: POR_W,
  },
  {
    id: "macan-2026-4-alt", ...MACALT, modelYears: [2026, 2026], trim: ["4", "Macan 4", "4 Electric"], packVariant: "Macan 4",
    battery: MACB,
    range: { epaRangeMi: f(304, "mfr", "high", "MY2026 Macan 4 Electric, EPA; 324 on 20-inch wheels", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50294") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    thermal: MACAN_HP,
    warranty: POR_W,
  },
  {
    id: "macan-2025-base-alt", ...MACALT, modelYears: [2025, 2025], trim: ["Electric", "Base"], packVariant: "Macan",
    battery: MACB,
    range: { epaRangeMi: f(315, "mfr", "high", "MY2025 base Macan Electric (RWD), EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=49119") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    thermal: MACAN_HP,
    warranty: POR_W,
  },
  {
    id: "macan-2026-base-alt", ...MACALT, modelYears: [2026, 2026], trim: ["Electric", "Base"], packVariant: "Macan",
    battery: MACB,
    range: { epaRangeMi: f(309, "mfr", "high", "MY2026 base Macan Electric (RWD), EPA; 332 on 20-inch wheels", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50296") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    thermal: MACAN_HP,
    warranty: POR_W,
  },
  {
    id: "macan-2025-4s-alt", ...MACALT, modelYears: [2025, 2025], trim: ["4S", "4S Electric"], packVariant: "Macan 4S",
    battery: MACB,
    range: { epaRangeMi: f(288, "mfr", "high", "MY2025 Macan 4S Electric, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48728") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    thermal: MACAN_HP,
    warranty: POR_W,
  },
  {
    id: "macan-2026-4s-alt", ...MACALT, modelYears: [2026, 2026], trim: ["4S", "4S Electric"], packVariant: "Macan 4S",
    battery: MACB,
    range: { epaRangeMi: f(290, "mfr", "high", "MY2026 Macan 4S Electric, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50295") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    thermal: MACAN_HP,
    warranty: POR_W,
  },
  {
    id: "macan-2024-25-turbo-alt", ...MACALT, modelYears: [2024, 2025], trim: ["Turbo", "Electric Turbo", "Turbo Electric"], packVariant: "Macan Turbo",
    battery: MACB,
    range: { epaRangeMi: f(288, "mfr", "high", "MY2024–25 Macan Turbo Electric, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=48794") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    thermal: MACAN_HP,
    warranty: POR_W,
  },
  {
    id: "macan-2026-turbo-alt", ...MACALT, modelYears: [2026, 2026], trim: ["Turbo", "Electric Turbo", "Turbo Electric"], packVariant: "Macan Turbo",
    battery: MACB,
    range: { epaRangeMi: f(293, "mfr", "high", "MY2026 Macan Turbo Electric, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50298") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    thermal: MACAN_HP,
    warranty: POR_W,
  },
  {
    id: "macan-2026-gts-alt", ...MACALT, modelYears: [2026, 2026], trim: ["GTS", "GTS Electric"], packVariant: "Macan GTS",
    battery: MACB,
    range: { epaRangeMi: f(294, "mfr", "high", "MY2026 Macan GTS Electric, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=50297") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    thermal: MACAN_HP,
    warranty: POR_W,
  },
  {
    id: "tayct-2021-22-turbo", ...TAYCT, modelYears: [2021, 2022], trim: ["Turbo", "Turbo Cross Turismo", "Turbo Cross Tourismo"], packVariant: "Cross Turismo",
    battery: PB1P,
    range: { epaRangeMi: f(204, "mfr", "high", "MY2021–22 Turbo Cross Turismo, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=44724") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    thermal: TAY1_HP,
    warranty: POR_W, buyerNotes: [NOTE_TAY_HP],
  },
  {
    id: "tayct-2021-22-turbos", ...TAYCT, modelYears: [2021, 2022], trim: ["Turbo S", "Turbo S Cross Turismo", "Turbo S Cross Tourismo"], packVariant: "Cross Turismo",
    battery: PB1P,
    range: { epaRangeMi: f(202, "mfr", "high", "MY2021–22 Turbo S Cross Turismo, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=44723") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    thermal: TAY1_HP,
    warranty: POR_W, buyerNotes: [NOTE_TAY_HP],
  },
  {
    id: "tayct-2023-24-turbo", ...TAYCT, modelYears: [2023, 2024], trim: ["Turbo", "Turbo Cross Turismo", "Turbo Cross Tourismo"], packVariant: "Cross Turismo",
    battery: PB1P,
    range: { epaRangeMi: f(233, "mfr", "high", "MY2023–24 Turbo Cross Turismo, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46027") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    thermal: TAY1_HP,
    warranty: POR_W, buyerNotes: [NOTE_TAY_HP],
  },
  {
    id: "tayct-2023-24-turbos", ...TAYCT, modelYears: [2023, 2024], trim: ["Turbo S", "Turbo S Cross Turismo", "Turbo S Cross Tourismo"], packVariant: "Cross Turismo",
    battery: PB1P,
    range: { epaRangeMi: f(222, "mfr", "high", "MY2023–24 Turbo S Cross Turismo, EPA", "https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=46029") },
    charging: { portStandard: f("CCS1", "mfr"), architectureV: f(800, "mfr") },
    thermal: TAY1_HP,
    warranty: POR_W, buyerNotes: [NOTE_TAY_HP],
  },

  // ── Audi Q4 e-tron / Q4 Sportback e-tron — MOVED to data10 (2026-08-25) ──
  // Both files had a full Q4 line and the figures agreed, so this is the
  // duplicate coming out, not a disagreement being settled. data10's rows
  // are the ones kept because they say more from the same evidence: a DC
  // peak rate on every year, the 9.6 kW onboard AC figure, and Audi's own
  // NACS FAQ sentence that the Q4 "is not currently able to utilize the Audi
  // NACS DC adapter or any other NACS adapter" — superchargerAccess "none"
  // with a citation, on the one Audi EV with no route onto the Supercharger
  // network at all. They also key the grade rows on the number Audi puts in
  // the trim and hand everything else to a trimless base row that abstains
  // on range, where these rows keyed the bare tier names (Premium / Premium
  // Plus / Prestige) as well and so answered a gradeless listing with
  // 236-vs-258 candidates. MY2026 is covered there too, which this file
  // never reached.

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
    
      acOnboardKw: fb(10.9, "mfr" as Source, "high", undefined, "https://www.hyundainews.com/assets/documents/original/59548-IONIQ5NSpecs040424.pdf"),
      chargeTime1080Min: fb(18, "mfr" as Source, "high", "With a >250 kW 800V charger, Hyundai's own condition", "https://www.hyundainews.com/assets/documents/original/59548-IONIQ5NSpecs040424.pdf"),
    },
    thermal: { heatPump: f("standard", "mfr", "high", "Standard on the N"), batteryPreconditioning: f(true, "mfr", "high", "N Race/drag-strip preconditioning modes are a headline N feature") },
    warranty: {
      batteryYears: f(10, "mfr"), batteryMiles: f(100_000, "mfr"), sohFloorPct: f(70, "mfr"),
      batteryTransfers: f(true, "mfr", "high", "HV battery & EV system coverage transfers in full — Hyundai Owner's Handbook"),
      powertrainTerms: f("1st owner 10yr/100k; subsequent owners 5yr/60k", "mfr", "high"),
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
    
      acOnboardKw: fb(10.9, "mfr" as Source, "high", undefined, "https://www.hyundainews.com/assets/documents/original/68164-2026IONIQ5NSpecsFeatures20250722A.pdf"),
    },
    thermal: { heatPump: f("standard", "mfr", "high", "Standard on the N"), batteryPreconditioning: f(true, "mfr", "high", "N Race/drag-strip preconditioning modes are a headline N feature") },
    warranty: {
      batteryYears: f(10, "mfr"), batteryMiles: f(100_000, "mfr"), sohFloorPct: f(70, "mfr"),
      batteryTransfers: f(true, "mfr", "high", "HV battery & EV system coverage transfers in full — Hyundai Owner's Handbook"),
      powertrainTerms: f("1st owner 10yr/100k; subsequent owners 5yr/60k", "mfr", "high"),
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
      batteryYears: f(8, "mfr" as Source, "high", "\u201cHigh-voltage battery: 8 Years / 100,000 miles (whichever comes first) retaining 70% capacity\u201d — Lucid's own warranty page (verified in the data3 pass)"),
      batteryMiles: f(100_000, "mfr" as Source, "high"),
      sohFloorPct: f(70, "mfr" as Source, "high", "Capacity floor over the battery term"),
      batteryTransfers: f(true, "mfr" as Source, "high", "\u201c\u2026and to subsequent owner(s) if the vehicle is within the applicable coverage period\u201d — Lucid's own warranty page"),
    };
    const LUCID_CHG = {
      portStandard: f<"CCS1">("CCS1", "mfr", "high", "Lucid's own site: \u201cYour Lucid Air has a J1772 (CCS1) charge port\u201d — no native NACS port as of the latest material found"),
      superchargerAccess: f<"adapter">("adapter", "mfr", "high", "All Air owners gained Supercharger access July 31, 2025 via a Lucid-sold NACS-to-CCS1 adapter (~$220); capped around 50 kW on that path — well below the car's native CCS1 DC peak"),
    };
    // Lucid IR press release: the heat pump \u201cfirst employed on Lucid Sapphire
    // now becomes standard across the lineup\u201d — MY2025 onward.
    const LUCID_NO_HP = { heatPump: f<"none">("none", "mfr", "high", "Heat pump became standard only from MY2025 (Lucid IR release); pre-2025 Airs other than Sapphire have none") };
    const LUCID_HP = { heatPump: f<"standard">("standard", "mfr", "high", "\u201cThe heat pump first employed on Lucid Sapphire now becomes standard across the lineup\u201d — Lucid IR release, MY2025 onward") };
    const NOTE_AIR_CAM = {
      headline: "Rearview-camera recalls apply across the Air lineup",
      body: "25V670 (2022–2025, all trims: camera image can fail, delay, or display inaccurately) and 26V017 (2022–2026, cars with the AD02 package: camera may not display in reverse). Both fixed via free OTA update.",
      severity: "warning" as const,
    };
    const NOTE_AIR_RWD = {
      headline: "Four RWD-only recalls — check this VIN's status",
      body: "24V836 (2024–2025 Pure RWD: rear subframe wiring harness too short, can cut power to the rear drive unit; free harness replacement). 25V669 and 26V193 (2024–2026 Pure RWD: half-shaft bolts may allow disconnection from the drive unit; free bolt inspection/replacement). 26V309 (2024–2025 RWD: Gen 4 inverter internal friction/damage can cause loss of drive power; OTA monitoring plus free replacement if a failure is detected). None apply to AWD Airs.",
      severity: "trap" as const,
    };
    const NOTE_WHEELS = {
      headline: "Wheel size sets this car's EPA rating — spreads up to 50 miles",
      body: "The figure shown is the 19-inch-wheel certification; 20- and 21-inch fitments rate meaningfully lower (see the range note). Check the fitted wheels before trusting the number.",
      severity: "info" as const,
    };
    // Lucid's Part 565 submission gives a pack figure per VIN pattern, and
    // the 112 kWh read there covers the MY2022 patterns only — the rows that
    // carry it say so. Everything else says nothing rather than carrying a
    // MY2022 figure forward across two pack revisions and four trims.
    const LUCID_PACK_ABSTAIN = "Lucid publishes no pack size for this configuration in any US document consulted this pass, and the 112 kWh read in its Part 565 submission is for the MY2022 VIN patterns";
    const air = (id: string, years: [number, number], trim: string[], drv: "AWD" | "RWD", variant: string, rangeFact: Fact<number>, extra?: Partial<EnrichmentRow>): EnrichmentRow => {
      const row: EnrichmentRow = {
        id, ...AIR, modelYears: years, trim, drive: drv, packVariant: variant,
        range: { epaRangeMi: rangeFact }, charging: LUCID_CHG, warranty: LUCID_W, buyerNotes: [NOTE_WHEELS, NOTE_AIR_CAM], ...extra,
      };
      if (!row.battery) row.abstains = { ...(row.abstains ?? {}), packUsableKwh: LUCID_PACK_ABSTAIN };
      return row;
    };
    const PACK112 = { packGrossKwh: f(112, "vin", "high", "112 kWh gross, the MY2022 pack") };
    return [
      // The non-Sapphire, non-GTP Air rows this block used to carry (Dream
      // R/P, GT, Touring, Pure across 2022-24 and 2026) were superseded on
      // 2026-08-25 by data12's VIN-descriptor-keyed rows, which separate the
      // two Dream Editions (identical feed trim, 49 EPA mi apart) and carry
      // the twice-verified heat-pump timeline — this block's 2024 GT row
      // wrongly asserted no heat pump against Lucid's own April 2024 release.
      // Kept here: the two cohorts data12 doesn't cover.
      air("air-2023-gtp", [2023, 2023], ["Grand Touring Performance", "GT Performance", "GTP"], "AWD", "Grand Touring Performance",
        f(446, "mfr", "high", "MY2023 Grand Touring Performance (21-inch wheels, the only cert) — EPA", epa(46306)), { thermal: LUCID_NO_HP }),
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
    // PORT BY MODEL YEAR, corrected 2026-08-26. Every Genesis row here read
    // CCS1, including the MY2026 and MY2027 cars. Genesis says otherwise on
    // its own US site: "Beginning with 2026 models, every Genesis Electrified
    // vehicle will feature a North American Charging Standard (NACS) port,
    // providing seamless access to 36,000 Tesla Superchargers"
    // (genesis.com/us/en/genesis-electric), and its US newsroom says it again
    // per car: the 2026 GV60 "is equipped with a native North American
    // Charging Standard (NACS) port". 169 live cars (97 MY2026 GV60, 72
    // MY2027) were being shown the wrong socket. Fourth model this week with
    // the same fault, after the EV9, the Lyriq and the Vistiq.
    //
    // The pre-2026 cars really are CCS1, and Genesis' owner site names them:
    // "If you own a Genesis EV with a CCS port, you can request a
    // complimentary NACS adapter... GV60 EV, GV70 EV, GV80 Electrified".
    // That is also the source for superchargerAccess on those rows, which
    // they did not carry at all. Genesis states the rate a shopper actually
    // gets there, so it rides in the note.
    const GEN_NACS_US = "https://www.genesis.com/us/en/genesis-electric";
    const GEN_ADAPTER = "https://owners.genesis.com/us/en/resources/general-information/genesis-nacs-information.html";
    const GEN_GV60_2026_PR = "https://newsroom.genesis.com/genesis-gv60-named-best-compact-electric-suv-by-us-news--world-report-in-2026-best-hybrid-and-electric-car-awards/";
    const GEN_ARCH = f<800>(800, "mfr", "high", "E-GMP 800-volt platform");
    const GEN_CHG = {
      portStandard: f<"CCS1">("CCS1", "mfr"),
      superchargerAccess: f<"adapter">("adapter", "mfr", "high", "Genesis supplied a complimentary NACS adapter to CCS-port owners from March 2025; Genesis states these cars draw 95-125 kW at a V3 Supercharger", GEN_ADAPTER),
      architectureV: GEN_ARCH,
    };
    // MY2026+ GV60. Genesis' newsroom gives the pack, the architecture and the
    // charge window in one sentence each: "an upgraded 84.0 kWh long-range
    // battery paired with an advanced 800 volt architecture" and "GV60 can
    // charge from 10% to 80% in approximately 18 minutes using a 350 kW DC
    // fast charger". The pack was tagged `vin` off Genesis' Part 565 Ah
    // figure, which printed "84 kWh est"; Genesis publishes 84.0 itself.
    const GEN_CHG_NACS = {
      portStandard: f<"NACS">("NACS", "mfr", "high", undefined, GEN_NACS_US),
      superchargerAccess: f<"native">("native", "mfr", "high", "Genesis states these cars draw 95-125 kW at a V3 Supercharger", GEN_ADAPTER),
      architectureV: GEN_ARCH,
      chargeTime1080Min: f(18, "mfr", "high", "10-80% on a 350 kW DC fast charger", GEN_GV60_2026_PR),
    };
    const EGV70_US = "https://www.genesis.com/us/en/electrified-gv70";
    const EGV70_PACK = { packGrossKwh: f(84, "mfr", "high", "Refreshed long-range pack", EGV70_US) };
    const EGV70_CHG = {
      portStandard: f<"NACS">("NACS", "mfr", "high", undefined, EGV70_US),
      superchargerAccess: f<"native">("native", "mfr", "high", "Genesis states these cars draw 95-125 kW at a V3 Supercharger", GEN_ADAPTER),
      architectureV: GEN_ARCH,
      chargeTime1080Min: f(19, "mfr", "high", "10-80% on an 800V DC ultra-fast charger", EGV70_US),
    };
    const P84_MFR = { packGrossKwh: f(84, "mfr", "high", "Refreshed long-range pack", GEN_GV60_2026_PR) };
    const P774 = { packGrossKwh: f(77.4, "agg", "medium", "77.4 kWh E-GMP pack, 111.2 Ah") };
    const P84 = { packGrossKwh: f(84, "vin", "medium", "Genesis' Part 565 submissions read 120.6 Ah (~84 kWh refreshed E-GMP pack) for these VINs") };
    // Genesis' US materials describe the E-GMP battery conditioning system
    // and never name cabin heat-pump hardware, so these rows say nothing
    // rather than inheriting the Ioniq 5's fact from a shared platform.
    const GEN_HP_ABSTAIN = { heatPump: "No Genesis document consulted this pass states heat-pump hardware, and a claim carried over from another E-GMP car would be a different vehicle's fact" };
    const gen = (id: string, model: string, years: [number, number], vin8: string[] | undefined, trim: string[] | undefined, variant: string, rangeFact: Fact<number>, extra?: Partial<EnrichmentRow>): EnrichmentRow => ({
      id, make: "GENESIS", model, modelYears: years, vin8, trim, drive: "AWD", packVariant: variant,
      abstains: GEN_HP_ABSTAIN,
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
        f(282, "mfr", "high", "MY2026 GV60 Standard AWD (19-inch wheels, refreshed pack) — EPA", epa(49653)), { battery: P84_MFR, charging: GEN_CHG_NACS }),
      gen("gv60-2026-adv", "GV60", [2026, 2026], ["C"], ["Advanced"], "Advanced",
        f(267, "mfr", "high", "MY2026 GV60 Advanced (20-inch wheels, refreshed pack) — EPA", epa(49654)), { battery: P84_MFR, charging: GEN_CHG_NACS }),
      gen("gv60-2026-perf", "GV60", [2026, 2026], ["B"], undefined, "Performance",
        f(252, "mfr", "high", "MY2026 GV60 Performance — EPA", epa(49655)), { battery: P84_MFR, charging: GEN_CHG_NACS }),
      gen("gv60-2027-std", "GV60", [2027, 2027], ["C"], ["Standard"], "Standard AWD",
        f(282, "mfr", "high", "MY2027 GV60 AWD (19-inch wheels) — EPA", epa(50636)), { battery: P84_MFR, charging: GEN_CHG_NACS }),
      gen("gv60-2027-prestige", "GV60", [2027, 2027], ["C"], ["Prestige"], "Prestige",
        f(267, "mfr", "high", "MY2027 GV60 Prestige (20-inch wheels) — EPA", epa(50635)), { battery: P84_MFR, charging: GEN_CHG_NACS }),
      gen("eg80-2023-25", "Electrified G80", [2023, 2025], ["1"], undefined, "Electrified G80",
        f(282, "mfr", "high", "MY2023–25 Electrified G80 — EPA (45999/47447/48351 all rate 282)", epa(45999)), { battery: { packGrossKwh: f(87.2, "agg", "medium", "87.2 kWh pack (pre-2026 Electrified G80)") } }),
      gen("egv70-2023-25", "Electrified GV70", [2023, 2025], ["1"], undefined, "Electrified GV70",
        f(236, "mfr", "high", "MY2024–25 Electrified GV70 — EPA (46947/48353 rate identically); fueleconomy.gov carries no MY2023 entry, but the 2023 car is hardware-identical", epa(46947))),

      // MY2026–27 Electrified GV70, new rows 2026-08-26. The block above
      // stopped at 2025, so 159 live cars (28 MY2026, 131 MY2027) matched no
      // row at all and showed an empty card. The refreshed car is a different
      // vehicle on three counts, which is why it could not simply extend the
      // 2023–25 row: the NACS port (Genesis, "beginning with 2026 models"),
      // the bigger pack, and a different EPA rating.
      //
      // Genesis' own US page carries the pack and the charge window: "The
      // Electrified GV70's 84-kWh battery", "Power up from 10% to 80% in as
      // few as 19 minutes, using an 800V DC Ultra-Fast Charger", and "The
      // North American Charging Standard (NACS) port is heated against
      // cold-weather frost". Note 19 minutes here against the GV60's 18 —
      // Genesis publishes them separately and they are not interchangeable.
      //
      // MY2026 is EPA-certified twice, by wheel: 263 mi on 19-inch (49656)
      // and 243 on 20-inch (49657), and nothing in a listing states the wheel.
      // The row carries the standard 19-inch figure with the 20-inch one in
      // the note, the convention these rows already use for the GV60. MY2027
      // is certified once, at 250 (50634) — the same number Genesis prints.
      gen("egv70-2026", "Electrified GV70", [2026, 2026], ["1"], undefined, "Electrified GV70",
        f(263, "mfr", "high", "MY2026 Electrified GV70 on the standard 19-inch wheels — EPA; 243 mi on the 20-inch package", epa(49656)),
        { battery: EGV70_PACK, charging: EGV70_CHG }),
      gen("egv70-2027", "Electrified GV70", [2027, 2027], ["1"], undefined, "Electrified GV70",
        f(250, "mfr", "high", "MY2027 Electrified GV70 — EPA, one rating for the model year", epa(50634)),
        { battery: EGV70_PACK, charging: EGV70_CHG }),
    ];
  })(),

  // ── GMC Sierra EV, MY2024-2025 ────────────────────────────────────────
  //
  // The MY2026 rows are in data3.ts, keyed on VIN positions 4-8; its block
  // comment carries the nameplate's full VIN map. These two model years stay
  // here, and they now carry the same kind of key.
  //
  // A CORRECTION TO THIS BLOCK'S OWN CONTROL TEST (2026-08-28). It used to
  // say position 8 could not be trusted, on this evidence: "MY2024 Denali
  // reads L, but MY2025 Denali reads D — the same code the row called
  // Extended Range." Both observations are true and they are not a
  // contradiction: "Denali" is a TRIM, and it ships with more than one pack.
  // Re-decoded this pass, one real VIN per descriptor —
  //
  //   1GT401EL1RU401931  MY2024 Denali  pos8=L  XRJ + ETN  24-MOD
  //   1GT10MED2SU412715  MY2025 Denali  pos8=D  XRJ + ETI  20-MOD
  //   1GT40LEL3SU408686  MY2025 Denali  pos8=L  XRJ + ETN  24-MOD
  //
  // — position 8 is perfectly stable across all three model years: H is the
  // 14-module pack, D the 20-module, L the 24-module, each carrying GM's own
  // pack RPO (EWX / ETI / ETN) alongside it. What varies is the trim name, so
  // the old test was measuring the trim rather than the code. The MY2025
  // Denali really does come as both an Extended Range and a Max Range truck,
  // which is exactly why the trim string "Denali" cannot settle it.
  //
  // The block's other two objections still stand and are why these rows key
  // on a FIVE-character `vds` (positions 4-8) rather than on `vin8`: position
  // 8 alone collides with the Hummer, and vPIC's per-VIN kWh is the flat 205
  // constant this block already refuses to read. A vds prefix pins the
  // nameplate, the trim family and the pack in one field.
  //
  // The trim keys are GONE rather than kept alongside, which is the opposite
  // of what it looks like it should be. A trim key on a vds-keyed row is a
  // veto: trimMatches() refuses a listing whose own trim field is blank, and
  // it runs before the vds filter, so the row becomes unreachable for exactly
  // the trucks the VIN was added to rescue — the ones whose trim says only
  // "Denali" or says nothing. The data3 block carries the measurement.
  //
  // fueleconomy.gov (model menu re-read 2026-08-28) has no 2024 Sierra EV
  // record at all and exactly one 2025 record, the 390-mi Extended Range. The
  // two Max/Edition-1 figures below are GM's own announced ratings and are
  // marked agg accordingly. GMC's live site now quotes 478 miles for the
  // MY2026 Max Range truck where this block had 460 for 2025-26; the MY2026
  // rows in data3 carry 478 with a gmc.com citation, and the MY2025 figure is
  // left at 460 because nothing found this pass restates it for that year.
  ...(() => {
    const SEV = { make: "GMC", model: "Sierra EV" };
    const GM_W = {
      batteryYears: f(8, "mfr" as Source), batteryMiles: f(100_000, "mfr" as Source),
      sohFloorPct: f(75, "mfr" as Source, "high", "GMC's current EV warranty booklet (read directly for the data3 Ultium rows) states the 75% floor"),
      batteryTransfers: f(true, "mfr" as Source, "high", "“Transferable at no cost” — GMC EV warranty booklet"),
    };
    const SEV_CHG = { portStandard: f<"CCS1">("CCS1", "mfr", "high", "CCS1-native like Silverado EV/Escalade IQ (a GM NACS adapter covers Superchargers) — the opposite of the NACS-native Optiq") };
    // No `trim` key: on a vds-keyed row it is a veto rather than a second
    // opinion, because trimMatches() refuses a listing with no trim at all
    // and runs before the vds filter. See the data3 block for the measurement.
    const sev = (id: string, years: [number, number], _trim: string[], variant: string, rangeFact: Fact<number>, vds?: string[]): EnrichmentRow => ({
      id, ...SEV, modelYears: years, vds, drive: "AWD", packVariant: variant,
      // Two deliberate silences, both for the reason the block comment gives.
      // The pack: vPIC reads a flat 205 kWh on Extended and Max Range trucks
      // alike, which is the model-level-constant failure this corpus has been
      // caught by before, and GMC's own /specs page for the Sierra EV 404s.
      // The heat pump: GM's Ultium marketing names an "Energy Recovery"
      // system platform-wide and no GMC document consulted this pass says
      // this truck has one.
      abstains: {
        packUsableKwh: "vPIC reads a flat 205 kWh for the Extended and Max Range trucks alike, a model-level constant rather than a per-VIN fact, and GMC publishes no pack figure for the Sierra EV",
        heatPump: "No GMC document consulted this pass states heat-pump hardware for the Sierra EV; GM's platform-wide Ultium claim is not a statement about this truck",
      },
      range: { epaRangeMi: rangeFact }, charging: SEV_CHG, warranty: GM_W,
    });
    return [
      sev("sierraev-2024-denali-e1", [2024, 2024], ["Denali Edition 1", "Edition 1"], "Denali Edition 1 (Max Range)",
        f(440, "agg", "medium", "MY2024 Denali Edition 1, the only 2024 config — GM's announced EPA rating; absent from fueleconomy.gov's dataset"),
        ["401EL"]),
      sev("sierraev-2025-max", [2025, 2025], ["Max Range"], "Max Range",
        f(460, "agg", "medium", "MY2025 Max Range pack — GM's announced EPA rating; fueleconomy.gov carries only the Extended Range 2025 cert"),
        ["40LEL"]),
      sev("sierraev-2025-er", [2025, 2025], ["Extended Range"], "Extended Range",
        f(390, "mfr", "high", "MY2025 Extended Range, EPA", epa(48709)),
        ["10MED"]),
      // `sierraev-2026-max` used to sit here, carrying every MY2026 Max Range
      // truck on the trim string. It is gone: data3 now holds SEVEN MY2026
      // rows keyed on positions 4-8, and two of them are Max Range trucks —
      // the AT4 and the Denali, which this row could not tell apart and which
      // GMC rates identically at 478 miles but equips differently. Keeping
      // both would have made every Max Range truck an ambiguous two-candidate
      // match, which is what it was doing when this was written.
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
    const P747 = { packGrossKwh: f(74.7, "vin", "high", "74.7 kWh gross, the MY2026 refresh pack") };
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
    const SOL_TESTED = f(200, "tested", "low", "75-mph (Car and Driver): 200 mi — reported secondhand; no verified instrumented test found");
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
    // The PPE cars (Q6/SQ6/A6/S6 e-tron) get an abstention rather than the
    // e-tron's own heat-pump fact: no Audi USA document consulted this pass
    // states the hardware for them, and a claim carried across from a
    // different platform is exactly the kind of aggregator inheritance that
    // has been falsified on this corpus before.
    const PPE_HP_ABSTAIN = "No Audi USA document consulted this pass states heat-pump hardware for the PPE cars, and the older e-tron's standard heat pump is a different platform's fact";
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
      au("etron-2019", "e-tron", [2019, 2019], ["E"], "55 quattro",
        f(204, "mfr", "high", "MY2019 e-tron — EPA", epa(41393))),
      // MY2020 is its own row because EPA has no MY2020 e-tron SUV record to
      // cite: its 2020 Audi model menu lists e-tron Sportback and nothing
      // else (control-tested 2026-08-25 against 2019 and 2021, which both
      // carry the SUV). The MY2019 figure is carried forward rather than the
      // MY2021 one — 2021 is where the battery-management update added 18
      // miles, so carrying it back would overstate this car.
      au("etron-2020", "e-tron", [2020, 2020], ["E"], "55 quattro",
        f(204, "agg", "medium", "MY2020 e-tron carries the unchanged MY2019 certification (204 mi, id 41393); fueleconomy.gov's own model menu lists no MY2020 e-tron SUV record, and the MY2021 car re-rated to 222", epa(41393))),
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
      // Q8 e-tron rename year (2024) + SQ8. The Q8 and Q8 Sportback rows
      // MOVED to data10 (2026-08-25): same 285 / 296 figures from the same
      // EPA certs, and data10's carry the DC peak rate, the onboard AC rate,
      // Audi's adapter answer and a wheel-split note the Sportback needs.
      // The SQ8 stays — data10 has no SQ8 row, so this is the only one.
      au("sq8etron-2024", "SQ8 e-tron", [2024, 2024], ["E"], "SQ8",
        f(253, "mfr", "high", "MY2024 SQ8 e-tron on 20-inch wheels — EPA; 218 on 21/22s", epa(47441)), { battery: P114 }),
      // e-tron GT (J1 platform) 2022–23; the 2024 row lives in data3.
      au("etrongt-2022-23", "e-tron GT", [2022, 2023], ["W"], "e-tron GT quattro",
        f(238, "mfr", "high", "MY2022–23 e-tron GT — EPA (44776/45981 rate identically)", epa(44776)),
        { battery: GT_PACK, charging: { ...AUDI_CHG_800, dcPeakKw: f(270, "mfr", "high", "Audi: “up to 270 kW”") }, thermal: { heatPump: f<"standard">("standard", "mfr", "high", "Audi: the e-tron GT's heat pump is standard") } }),
      au("rs-etrongt-2022-23", "RS e-tron GT", [2022, 2023], ["W"], "RS e-tron GT",
        f(232, "mfr", "high", "MY2022–23 RS e-tron GT — EPA (44783/45982 rate identically)", epa(44783)),
        { battery: GT_PACK, charging: { ...AUDI_CHG_800, dcPeakKw: f(270, "mfr", "high", "Audi: “up to 270 kW”") }, thermal: { heatPump: f<"standard">("standard", "mfr", "high", "Audi: the e-tron GT's heat pump is standard") } }),
      // Q6 e-tron / SQ6 e-tron MOVED to data10 (2026-08-25). Same EPA certs
      // and the same 307 / 310 / 325 / 275, and data10 adds the 100 kWh
      // gross / 94.4 net pair, the 8:1:1 chemistry, 270 kW (260 on RWD), the
      // 21-minute 10→80 figure and the Sportback bodies — plus MY2026 rows
      // that abstain on range, because EPA's 2026 Audi list has no Q6 at all
      // and the neighbouring years differ by 18 miles. The A6/S6 rows below
      // are the PPE cars data10 does not carry, so they stay here.
      // A6 e-tron family (2025) — certs absent from fueleconomy.gov until
      // MY2027; Audi's announced EPA estimates, achieved with the no-cost
      // "ultra" aero configuration on 19-inch wheels.
      ...["A6 e-tron", "A6 Sportback e-tron"].flatMap((m, i): EnrichmentRow[] => [
        au(`a6etron-2025-rwd-${i ? "b" : "a"}`, m, [2025, 2026], ["H"], "RWD (performance)",
          f(392, "agg", "medium", "MY2025 A6 Sportback e-tron RWD, ultra configuration with 19-inch wheels — Audi's announced EPA estimate; larger wheels rate lower, and fueleconomy.gov carries no 2025–26 A6 e-tron cert (the MY2027 certs read 348 standard / 395 ultra)"),
          { drive: "RWD", battery: P100, charging: AUDI_CHG_800, thermal: undefined, abstains: { heatPump: PPE_HP_ABSTAIN } }),
        au(`a6etron-2025-quattro-${i ? "b" : "a"}`, m, [2025, 2026], ["H"], "quattro",
          f(377, "agg", "medium", "MY2025 A6 Sportback e-tron quattro, ultra configuration — Audi's announced EPA estimate; larger wheels rate lower (MY2027 certs: 327 standard / 360 ultra)"),
          { battery: P100, charging: AUDI_CHG_800, thermal: undefined, abstains: { heatPump: PPE_HP_ABSTAIN } }),
      ]),
      au("s6etron-2025", "S6 Sportback e-tron", [2025, 2026], ["H"], "S6",
        f(324, "agg", "medium", "MY2025 S6 Sportback e-tron — Audi's announced EPA estimate; fueleconomy.gov carries no 2025–26 cert (MY2027: 326/311 by wheel)"),
        { battery: P100, charging: AUDI_CHG_800, thermal: undefined, abstains: { heatPump: PPE_HP_ABSTAIN } }),
    ];
  })(),

  // ── Lexus electric ES under the BARE "ES" nameplate (2026-08-15) ──────
  // VIN pos-8 1 = the new electric ES, which is what makes a row under the
  // bare "ES" model string safe at all: it fences these off the gas and
  // hybrid ES listings filed under the same word. Drive settles FWD-vs-AWD
  // (350e FWD, 500e AWD).
  //
  // The "ESe", "ES 350e" and "ES 500e" spellings MOVED to data10
  // (2026-08-25). Same 307 and 276 from the same EPA certs; data10's rows
  // carry the pack figure from Lexus's own release rather than from Part 565,
  // plus the 150 kW peak, the 28-minute 10→80, the 11 kW onboard charger,
  // battery preconditioning, and an mfr-cited 8 yr / 100,000 mi / 70% /
  // transferable warranty read out of the 2026 ES BEV Warranty and Services
  // Guide. Only the bare "ES" spelling stays here, because it is the one
  // that needs the pos-8 fence and data10 does not carry it.
  //
  // THE HEAT PUMP IS NOW AN ABSTENTION, and it was a claim (2026-08-25).
  // These rows said "standard", sourced `agg` with no URL and the reason
  // "consistently documented across the RZ/electric-ES line". The corpus
  // already disagreed with itself about the RZ half of that sentence —
  // data9's RZ rows abstain, "No Lexus document consulted this pass states
  // heat-pump hardware for the RZ" — and the ES half does not survive a
  // control test either: Lexus's own launch release for these cars uses the
  // term zero times in 30,000 characters of text that says "battery" twelve
  // times and describes the climate system and the battery preconditioning
  // at length. A document that would have said so, and did not. That is the
  // Volvo XC40/C40 and Nissan Ariya shape exactly (data6): an aggregator
  // heat-pump claim with no manufacturer sentence under it, believed until
  // someone control-tested the US corpus.
  ...(() => {
    const LEX_W = {
      batteryYears: f(8, "agg" as Source, "medium", "8 yr/100,000 mi EV-battery coverage (Toyota-group terms), consistently documented; not re-verified against a Lexus primary booklet this pass"),
      batteryMiles: f(100_000, "agg" as Source, "medium"),
    };
    const ES_HP_ABSTAIN = "No Lexus document consulted this pass states heat-pump hardware for the electric ES";
    const NACS26 = { portStandard: f<"NACS">("NACS", "mfr", "high", "MY2026 Lexus EVs adopted the native NACS (J3400) port"), superchargerAccess: f<"native">("native", "mfr") };
    const P747L = { packGrossKwh: f(74.7, "vin", "medium", "74.7 kWh in the Part 565 submissions for MY2026 VINs (RZ and electric ES share the pack family)") };
    const lex = (id: string, trim: string[], drv: "AWD" | "FWD", variant: string, rangeFact: Fact<number>): EnrichmentRow => ({
      id, make: "LEXUS", model: "ES", modelYears: [2026, 2026], vin8: ["1"], trim, drive: drv, packVariant: variant,
      range: { epaRangeMi: rangeFact }, battery: P747L, charging: NACS26, warranty: LEX_W,
      abstains: { heatPump: ES_HP_ABSTAIN },
    });
    return [
      lex("es350e-2026-bare", ["350e", "Premium", "Luxury"], "FWD", "ES 350e",
        f(307, "mfr", "high", "MY2026 ES 350e (FWD) on 19-inch wheels — EPA; 292 on 21s", epa(50450))),
      lex("es500e-2026-bare", ["500e", "Premium", "Luxury"], "AWD", "ES 500e",
        f(276, "mfr", "high", "MY2026 ES 500e AWD on 19-inch wheels — EPA; 272 on 21s", epa(50452))),
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
    const CT_PACK = { packGrossKwh: f(123, "vin", "medium", "123 kWh gross, the same pack in every variant") };
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

  // ── Mercedes-Benz EQB (2026-08-15) ────────────────────────────────────
  // Same Baumuster mechanism as EQE/EQS: 9M0CB = EQB 250+, 9M0KB = 300
  // 4MATIC, 9M1DB = 350 4MATIC (verified per-VIN against Mercedes' own
  // Part 565 trims). fueleconomy.gov skips MY2023 EQB entirely — the same
  // dataset gap as the 2023 EQE — so 2023 rows carry the adjacent-year
  // cert for identical hardware at agg/medium. Note the MY2024 re-rating:
  // the 4MATIC cars fell from 243/227 to 205/207.
  ...(() => {
    const EQB = { make: "MERCEDES-BENZ", model: "EQB" };
    const EQB_W = {
      batteryYears: f(10, "agg" as Source, "medium", "10 yr/100,000 mi — the EQB carries a lower mileage cap than the EQE/EQS family's 155k; consistently documented, not re-verified against the booklet this pass"),
      batteryMiles: f(100_000, "agg" as Source, "medium"),
    };
    const EQB_BASE = {
      // Mercedes states a heat pump for the EQE/EQS in its own words and
      // never for the EQB, which is a different platform built in a different
      // plant (W1N, Kecskemét). Carrying the EQ family's fact across would be
      // a guess dressed as one.
      abstains: { heatPump: "No Mercedes document consulted this pass states heat-pump hardware for the EQB, and the EQE/EQS claim belongs to a different platform" },
      battery: { packUsableKwh: f(66.5, "agg", "medium", "66.5 kWh usable (70.5 gross) — all EQB variants") },
      charging: { portStandard: f<"CCS1">("CCS1", "mfr") },
      warranty: EQB_W,
    };
    const eqb = (id: string, years: [number, number], prefix: string, variant: string, drv: "AWD" | "FWD", rangeFact: Fact<number>): EnrichmentRow => ({
      id, ...EQB, modelYears: years, vds: [prefix], drive: drv, packVariant: variant,
      range: { epaRangeMi: rangeFact }, ...EQB_BASE,
    });
    return [
      eqb("eqb-2022-300", [2022, 2022], "9M0KB", "EQB 300 4MATIC", "AWD",
        f(243, "mfr", "high", "MY2022 EQB 300 4MATIC — EPA", epa(46331))),
      eqb("eqb-2022-350", [2022, 2022], "9M1DB", "EQB 350 4MATIC", "AWD",
        f(227, "mfr", "high", "MY2022 EQB 350 4MATIC — EPA", epa(46332))),
      eqb("eqb-2023-250plus", [2023, 2023], "9M0CB", "EQB 250+", "FWD",
        f(251, "agg", "medium", "MY2023 EQB 250+ — fueleconomy.gov skips MY2023 EQB; the identical car's MY2024 cert (id 47844) is carried")),
      eqb("eqb-2023-300", [2023, 2023], "9M0KB", "EQB 300 4MATIC", "AWD",
        f(243, "agg", "medium", "MY2023 EQB 300 4MATIC — fueleconomy.gov skips MY2023 EQB; the identical car's MY2022 cert (id 46331) is carried. The MY2024 re-rating reads 205")),
      eqb("eqb-2023-350", [2023, 2023], "9M1DB", "EQB 350 4MATIC", "AWD",
        f(227, "agg", "medium", "MY2023 EQB 350 4MATIC — fueleconomy.gov skips MY2023 EQB; the identical car's MY2022 cert (id 46332) is carried. The MY2024 re-rating reads 207")),
      eqb("eqb-2024-25-250plus", [2024, 2025], "9M0CB", "EQB 250+", "FWD",
        f(251, "mfr", "high", "MY2024–25 EQB 250+ — EPA (47844/49116 rate identically)", epa(47844))),
      eqb("eqb-2024-25-300", [2024, 2025], "9M0KB", "EQB 300 4MATIC", "AWD",
        f(205, "mfr", "high", "MY2024–25 EQB 300 4MATIC — EPA (48472/49117 rate identically); note the sharp re-rating from 2022–23's 243", epa(48472))),
      eqb("eqb-2024-25-350", [2024, 2025], "9M1DB", "EQB 350 4MATIC", "AWD",
        f(207, "mfr", "high", "MY2024–25 EQB 350 4MATIC — EPA (47845/49118 rate identically)", epa(47845))),
    ];
  })(),

  // ── Dodge Charger Daytona — MOVED to data10 (2026-08-25) ──────────────
  // These rows were the ported half of a pair. data10's Charger Daytona
  // block covers the same cars from a fuller reading of the same Stellantis
  // release: it adds the NCA chemistry and the dcFastCharging flag, splits
  // the tire-spread buyer note per year-span instead of quoting one span's
  // numbers under three, keys the R/T on the bare "R" spelling 220 live
  // listings actually use, carries a trimless "Charger Daytona" base row and
  // an MY2027 Scat Pack row, and states the same MY2026 bare-nameplate rule
  // this file had to be corrected into. Two matching rows are not twice as
  // good as one — they turn a settled EXACT into an ambiguous pair, which is
  // what 336 live Daytona listings were reduced to while both sets stood.
  //
  // The one thing data4 carried that data10 did not is the "Charger Daytona
  // EV" model spelling, now a modelAlias on data10's rows.

  // ── Subaru Trailseeker — MOVED to data10 (2026-08-25) ─────────────────
  // Same story and the same two figures (281 on 18-inch Premium, 274 on the
  // 20-inch grades, EPA 50300/50299 and the identical MY2027 50692/50691).
  // data10's rows add the DC peak rate, the onboard AC rate, battery
  // preconditioning, the tow rating and a trimless base row that abstains on
  // range rather than guessing a grade — and its heat-pump abstention is
  // control-tested against two Subaru feature tables rather than resting on
  // one release's silence. The MY2027 span is carried over to data10 here.
];
