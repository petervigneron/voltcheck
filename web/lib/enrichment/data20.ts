import type { EnrichmentRow, Fact, Source } from "../types";

// MINI Cooper SE hardtop, MINI Countryman SE ALL4, and the 2027 Toyota C-HR
// (2026-09-10).
//
// WHAT WAS LIVE. 102 MINI Cooper SE hardtops (2021: 3, 2022: 9, 2023: 19,
// 2024: 71) and 40 electric Countrymen (2025: 20, 2026: 11, 2027: 9) matched
// no row at all, and neither did the 96 MY2027 Toyota C-HRs — a model year
// that arrived after data4's `chr-bev-2026` was written and fell straight
// through it. The MINI hardtop is the harder half: its listings arrive under
// ten different model strings ("Hardtop 2 Door" 25, "Electric Hardtop 2 Door"
// 30, "Cooper SE Electric" 28, "Cooper" 8, "Hardtop" 3, "HARDTOP 2 DOOR" 3,
// "Cooper SE" 2, "Cooper SE Hardtop 2 Door" 1, "…Signature" 1, "Electric
// hatch" 1), four of which a petrol MINI also wears.
//
// ── THE VIN IS THE GUARD, AND MINI FILED IT CLEANLY ───────────────────────
// Every MINI row here is keyed on the vehicle descriptor, never on a trim
// string, because the model strings above are shared with petrol cars and the
// trim field is worthless on this nameplate (24 live hardtops say "Cooper",
// 32 say nothing at all, one says "."). Across the vPIC decode cache
// (scraper/registry/vpic-cache.json, 163 MINI VINs, checked 2026-09-10) the
// descriptors separate the cars completely:
//
//   WMW XP3C0  MY2020-21  Series "Cooper SE"  BEV   5 VINs   -> hardtop rows
//   WMW 13DJ0  MY2022-24  Series "Cooper SE"  BEV 135 VINs   -> hardtop rows
//   WMZ 53GA0  MY2025-26  Series "SE ALL4"    BEV  33 VINs   -> Countryman
//   WMZ 13HP0  MY2027     Series "SE ALL4"    BEV  12 VINs   -> Countryman
//
// CONTROL TEST, the reason the petrol-shared aliases are safe: petrol MINIs
// in the same cache decode under different descriptors and with an EMPTY
// ElectrificationLevel — WMWZB3C5 Series "Cooper", Gasoline; WMWSV3C5 Series
// "Cooper S", Gasoline; WMZ53BR0 (MY2024 Countryman) Series "Cooper S",
// Gasoline. `vds` is a hard filter in match.ts, so a row keyed "13DJ0" can
// never reach a WMWZB3C5 VIN no matter what the dealer typed in `model`.
// The known limit is a listing with no usable VIN: none exists today (all 163
// live MINI ids are 17-character VINs), and the one live car that decodes to
// nothing — WMW12DJ0802R21839, filed by its dealer as a 2021 "Electric hatch",
// which vPIC answers with an empty record — matches no row here rather than
// borrowing another car's figures.
//
// The PHEV Countryman rows in data6 (`mini-countryman-phev-2018-19` and
// `-2020-23`, model "Cooper SE Countryman ALL4") are untouched: they are
// WMZYU7C4/C5 and WMZ23BS0 VINs, MY2018-23, and vPIC calls all of them PHEV.
// Nothing below reaches a model year they cover.
//
// ── WHERE THE ROWS ARE CUT ────────────────────────────────────────────────
// The hardtop splits at MY2022, where the descriptor changes AND the EPA
// rating moves 110 -> 114 mi. The Countryman splits at MY2027, where the
// descriptor changes AND the rating moves 212 -> 216 mi. Each split is a real
// change in MINI's own filings, not a convenience.
//
// ── THE HEAT PUMP, AND WHY HALF OF IT IS SILENT ───────────────────────────
// MINI's MY2020 US media information lists, under the Cooper SE's "100%
// Standard Features", an "Energy Efficient Heat pump (allows for excess heat
// from motor to be utilized to heat cabin space to maximize efficiency)", and
// the same document's engineering section names "a new, more efficient HVAC
// heat pump to maximize range during colder weather". That is a MY2020
// document, so it is quoted on the MY2020-21 row and nowhere else. For
// MY2022-24 no MINI US document consulted this pass states the hardware: the
// MY2022 US technical specification (which does carry the battery and
// charging rows below) has no HVAC line at all, the MY2022/23/24 lineup
// updates describe only trim, color and infotainment changes, and the MY2024
// owner's manual never uses the words. So those rows abstain. Same for every
// Countryman row — MINI's own 2025 US technical specification itemizes the
// battery, both charging standards and the trailer ratings, and says nothing
// about a heat pump. Carrying the 2020 sentence forward five model years is
// the shape that got the Volvo heat-pump claim falsified; it is not repeated.
//
// ── TOYOTA C-HR MY2027 ────────────────────────────────────────────────────
// Toyota's own 2027 specification page (toyota.com/c-hr/features) carries the
// whole car: "Total battery capacity (kWh)" 74.7, "North American Charging
// Standard (NACS) charging port", "DC Fast Charging time (from 10% to 80%, in
// ideal conditions)" "~30 MIN (WITH 150 KW OR ABOVE DCFC)", "Onboard AC
// charger (kW)" 11, and an "Electric Vehicle Drive Components Warranty
// (Transaxle, Traction Battery, Inverter with Converter)" of "96 months/
// 100,000 miles". Range is stated per GRADE, not per car — "an EPA-estimated
// 287-mile range rating for SE and an EPA-estimated 273-mile range rating for
// XSE" — so this is the base-row-plus-grade-rows shape data3 uses for the
// 2026 bZ: a trimless 2027 C-HR (4 of the 96 live) shows no range rather than
// the better grade's. fueleconomy.gov has no 2027 C-HR record as of
// 2026-09-10; its MY2026 record (id 50307) rates the identical 287/273 pair,
// split by wheel size (18-inch vs 20-inch), which is what the two grades
// wear.
//
// The 2027 C-HR abstains on the heat pump where data4's 2026 row prints
// "none", and the difference is a control test rather than a mood. The 2026
// row reads the silence of Toyota's C-HR press release against the 2026 bZ
// release, which does name a heat pump. That control does not survive onto
// the spec pages: toyota.com/bz/features — the same surface, for the car that
// HAS the hardware — has no heat-pump line either. A silence that the control
// car shares says nothing, so this row says nothing.
//
// ── WHAT IS DELIBERATELY NOT HERE ─────────────────────────────────────────
// No 2027 Range Rover Sport plug-in row and no 2026 McLaren Artura row. Both
// nameplates are live in volume (73 and 49 cars) and both were researched
// this pass; neither maker has published anything for that model year.
// Land Rover: fueleconomy.gov's 2027 Land Rover menu holds nine records and
// every one is an MHEV, media.landrover.com/media.jlr.com serves an
// article-less shell to every fetch, and landroverusa.com/rangerover.com
// still footnote their Sport PHEV figures "2026 Range Rover Sport". McLaren:
// the newest Artura press kit on cars.mclaren.press is the MY25 one ("The
// cars introduced for the 2025 model Yyar (MY25)", one attached document,
// "25-my-new-mclaren-artura-…-us-final-91124.pdf"), the two Artura releases
// dated 2026 are the 1000GP and MCL39 special editions and state no
// powertrain figures, and EPA holds no 2026 McLaren record of any kind. A row
// for either would be last year's numbers wearing this year's badge.

const AS_OF = "2026-09-10";

function f<T>(
  value: T,
  source: Source,
  confidence: Fact<T>["confidence"] = "high",
  note?: string,
  sourceUrl?: string
): Fact<T> {
  return { value, source, asOf: AS_OF, confidence, note, sourceUrl };
}

const epa = (id: number) => `https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=${id}`;

const R: EnrichmentRow[] = [];

// ───────────────────────── MINI COOPER SE HARDTOP (F56) ───────────────────
{
  // MY2020 US media information, "MINI Cooper SE 12/2019" (6 pages, PDF
  // md5 933f26438996efcdfa10856f7d69e1e5).
  const MEDIA_2020 = "https://www.press.bmwgroup.com/usa/article/attachment/T0303912EN_US/443760";
  // "U.S. Technical Specifications for all MY 2022 MINI Hardtop 2 Door
  // variants", MINI Cooper SE Electric column (16 pages, PDF md5
  // 08e62bb3789ddf29452769106a793687).
  const SPECS_2022 = "https://www.press.bmwgroup.com/usa/article/attachment/T0324990EN_US/471010";
  const WTY_2020 = "https://www.miniusa.com/content/dam/mini/PDF/warranties/2020_MINI_Warranty.pdf";
  const WTY_2022 = "https://www.miniusa.com/content/dam/mini/PDF/warranties/2022_MINI_Warranty.pdf";

  const HARDTOP_ALIASES = [
    "Cooper SE Electric",
    "Cooper SE Hardtop 2 Door",
    "Cooper SE Hardtop 2 Door Signature",
    "Electric Hardtop 2 Door",
    "Hardtop 2 Door",
    "Hardtop",
    "Cooper",
    "Electric hatch",
  ];

  const WARRANTY_NOTE =
    "“MINI Electric Vehicle (all-electric power): The high-voltage lithium-ion battery assembly coverage period is 8 years/100,000 miles”";
  const HP_ABSTAIN_LATE =
    "MINI's MY2022 US technical specification carries no HVAC line and no MINI document for these model years names the hardware, so the MY2020 heat-pump sentence is not carried forward";

  R.push(
    {
      id: "mini-cooper-se-2020",
      make: "MINI",
      model: "Cooper SE",
      modelAliases: HARDTOP_ALIASES,
      modelYears: [2020, 2020],
      drive: "FWD",
      vds: ["XP3C0"],
      battery: {
        packGrossKwh: f(32.6, "mfr", "high", "MINI's “Gross Battery Content”", MEDIA_2020),
        packUsableKwh: f(28.9, "mfr", "high", "MINI's “Net Battery Content”", MEDIA_2020),
      },
      range: {
        epaRangeMi: f(110, "mfr", "high", "EPA's MY2020 record; MY2021 carries the identical rating", epa(42508)),
        epaKwhPer100Mi: f(31.3, "mfr", "high", undefined, epa(42508)),
      },
      charging: {
        portStandard: f<"CCS1">("CCS1", "mfr", "high", "“utilizes the SAE Combo fast charging standard”", MEDIA_2020),
        dcPeakKw: f(50, "mfr", "high", "“DC Charging at up to 50 kW”", MEDIA_2020),
        acOnboardKw: f(7.4, "mfr", "high", "“AC Charging at up to 7.4 kW”", MEDIA_2020),
        dcFastCharging: f<"standard">("standard", "mfr", "high", undefined, MEDIA_2020),
        chargeTimeTo80Min: f(40, "mfr", "high", "“as little as 40 minutes to achieve an 80% charge”; MINI does not state the starting state of charge", MEDIA_2020),
      },
      thermal: {
        heatPump: f<"standard">("standard", "mfr", "high", "Listed under the Cooper SE's “100% Standard Features”: “Energy Efficient Heat pump”", MEDIA_2020),
      },
      warranty: {
        batteryYears: f(8, "mfr", "high", WARRANTY_NOTE, WTY_2020),
        batteryMiles: f(100_000, "mfr", "high", WARRANTY_NOTE, WTY_2020),
        sohFloorPct: f(70, "mfr", "high", "Capacity coverage runs the same 8 years/100,000 miles: “less than 70 percent of its original nominal value … is considered excessive”", WTY_2020),
      },
    },
    {
      id: "mini-cooper-se-2021",
      make: "MINI",
      model: "Cooper SE",
      modelAliases: HARDTOP_ALIASES,
      modelYears: [2021, 2021],
      drive: "FWD",
      vds: ["XP3C0"],
      battery: {
        packGrossKwh: f(32.6, "mfr", "high", "MINI's “Gross Battery Content”", MEDIA_2020),
        packUsableKwh: f(28.9, "mfr", "high", "MINI's “Net Battery Content”", MEDIA_2020),
      },
      range: {
        epaRangeMi: f(110, "mfr", "high", "EPA's MY2021 record, identical to MY2020's", epa(42634)),
        epaKwhPer100Mi: f(31.3, "mfr", "high", undefined, epa(42634)),
      },
      charging: {
        portStandard: f<"CCS1">("CCS1", "mfr", "high", "“utilizes the SAE Combo fast charging standard”", MEDIA_2020),
        dcPeakKw: f(50, "mfr", "high", "“DC Charging at up to 50 kW”", MEDIA_2020),
        acOnboardKw: f(7.4, "mfr", "high", "“AC Charging at up to 7.4 kW”", MEDIA_2020),
        dcFastCharging: f<"standard">("standard", "mfr", "high", undefined, MEDIA_2020),
        chargeTimeTo80Min: f(40, "mfr", "high", "“as little as 40 minutes to achieve an 80% charge”; MINI does not state the starting state of charge", MEDIA_2020),
      },
      // MINI's "100% Standard Features" list naming the heat pump is the
      // 12/2019 MY2020 media information; no MY2021 MINI document reachable
      // names the HVAC hardware, and a yes/no fact does not carry a year
      // forward (refuter, 2026-09-10 — the same rule the 2022-24 row applies).
      abstains: { heatPump: "MINI published no MY2021 Cooper SE document naming the HVAC hardware, and the MY2020 launch media information is a different model year's statement" },
      warranty: {
        batteryYears: f(8, "mfr", "high", WARRANTY_NOTE, WTY_2020),
        batteryMiles: f(100_000, "mfr", "high", WARRANTY_NOTE, WTY_2020),
        sohFloorPct: f(70, "mfr", "high", "Capacity coverage runs the same 8 years/100,000 miles: “less than 70 percent of its original nominal value … is considered excessive”", WTY_2020),
      },
    },
    {
      id: "mini-cooper-se-2022-24",
      make: "MINI",
      model: "Cooper SE",
      modelAliases: HARDTOP_ALIASES,
      modelYears: [2022, 2024],
      drive: "FWD",
      vds: ["13DJ0"],
      battery: {
        packGrossKwh: f(32.64, "mfr", "high", "MINI's “Gross battery content high voltage, kWh”", SPECS_2022),
        packUsableKwh: f(28.9, "mfr", "high", "MINI's “Net battery content high voltage, kWh”", SPECS_2022),
      },
      range: {
        epaRangeMi: f(114, "mfr", "high", "MY2022, MY2023 and MY2024 carry the identical rating; the later records are ids 45330 and 46972", epa(43953)),
        epaKwhPer100Mi: f(30.7, "mfr", "high", undefined, epa(43953)),
      },
      charging: {
        portStandard: f<"CCS1">("CCS1", "mfr", "high", "MINI's charging row reads “DC CCS1 50 kW”", SPECS_2022),
        dcPeakKw: f(50, "mfr", "high", "“DC CCS1 50 kW”", SPECS_2022),
        acOnboardKw: f(7.4, "mfr", "high", "“AC Typ 1; 7,4 kW Mode3 Wallbox 1ph”", SPECS_2022),
        dcFastCharging: f<"standard">("standard", "mfr", "high", undefined, SPECS_2022),
        chargeTimeTo80Min: f(36, "mfr", "high", "MINI's DC “charging time 2 (0-80% SoC)” of 0.6 h — from empty, not from 10%", SPECS_2022),
        architectureV: f(350.4, "mfr", "high", "MINI's “System voltage (high voltage), V”", SPECS_2022),
      },
      warranty: {
        batteryYears: f(8, "mfr", "high", WARRANTY_NOTE, WTY_2022),
        batteryMiles: f(100_000, "mfr", "high", WARRANTY_NOTE, WTY_2022),
      },
      abstains: { heatPump: HP_ABSTAIN_LATE },
    }
  );
}

// ─────────────────── MINI COUNTRYMAN SE ALL4 (J05, all-electric) ──────────
{
  // "2025 MINI Countryman SE ALL4 - US Technical Specifications" (2 pages,
  // PDF md5 a13d1e51d0a514986cd4df393c154469).
  const SPECS_2025 = "https://www.press.bmwgroup.com/usa/article/attachment/T0444675EN_US/621479";
  // Which wheel is standard is a per-year fact, and both years are sourced.
  // MY2025: MINI USA's product guide (attachment T0444675EN_US/621480, md5
  // e6ce95a76c8dbc5bbd618e1fabeae7ab) opens the SE ALL4's standard equipment
  // with "1K3 18\" Asteroid with All-Season Tires", and MINI's own technical
  // specification marks the 19-inch tire size "opt.". MY2027: MINI USA's
  // pricing guide (attachment T0456795EN_US/646417, md5
  // 06a4d5cf61425a09fa9a67dca8ca9e70) lists the 18-inch wheel at no cost on
  // the SE ALL4 and the 19-inch Kaleido Spoke at $750.
  const MINI_EV = "https://www.miniusa.com/model/electric-vehicles.html";
  const MINI_CTY = "https://www.miniusa.com/model/electric-vehicles/countryman.html";
  const WTY_2025 = "https://www.miniusa.com/content/dam/mini/PDF/warranties/2025_Model_Warranty_Book.pdf";

  const CTY_ALIASES = [
    "Countryman",
    "Cooper Countryman",
    "Cooper Countryman SE",
    "Cooper SE Countryman",
    "SE Countryman",
  ];

  // MINI's own site is the only US document that names the connector: it
  // tells owners that NACS Superchargers "Require a compatible NACS adapter
  // for MINIs with CCS ports" and that "MINI has approved the use of the
  // Lectron Vortex Plus adapter". Supercharger access is quoted from the same
  // page's answer for this specific car.
  const PORT = f<"CCS1">("CCS1", "mfr", "high", "“Require a compatible NACS adapter for MINIs with CCS ports”", MINI_EV);
  const SUPERCHARGER = f<"adapter">("adapter", "mfr", "high", "“The MINI Countryman SE is compatible with NACS Partner Tesla Superchargers”, with the adapter above", MINI_EV);
  const CTY_HP_ABSTAIN =
    "MINI's US technical specification for this car itemizes the battery and both charging standards and states no heat-pump hardware";

  R.push(
    {
      id: "mini-countryman-se-2025-26",
      make: "MINI",
      model: "Countryman SE ALL4",
      modelAliases: CTY_ALIASES,
      modelYears: [2025, 2026],
      drive: "AWD",
      vds: ["53GA0"],
      battery: {
        packGrossKwh: f(66.5, "mfr", "high", "MINI's “Battery capacity (gross), kWh”", SPECS_2025),
        packUsableKwh: f(64.7, "mfr", "high", "MINI's “Battery capacity (net), kWh”", SPECS_2025),
      },
      range: {
        epaRangeMi: f(212, "mfr", "high", "On the standard 18-inch wheels (MINI's product guide lists them as standard equipment); 204 mi on the optional 19s. MY2026 rates the same 212", epa(48398)),
        epaKwhPer100Mi: f(35, "mfr", "high", "MINI's own “KW-hrs per 100 miles”", SPECS_2025),
      },
      charging: {
        portStandard: PORT,
        superchargerAccess: SUPERCHARGER,
        dcPeakKw: f(130, "mfr", "high", "MINI's “Maximum charging power - DC, kW”", SPECS_2025),
        chargeTime1080Min: f(29, "mfr", "high", "MINI's “Charging time - DC Fast Charging (10-80%)” of 0:29, at its own 130 kW peak", SPECS_2025),
        acOnboardKw: f(9.6, "mfr", "high", "MINI's “maximum charging Level 2 - AC standard, kW”", SPECS_2025),
        architectureV: f(286.3, "mfr", "high", "MINI's “Rated voltage, V”", SPECS_2025),
        dcFastCharging: f<"standard">("standard", "mfr", "high", undefined, SPECS_2025),
      },
      warranty: {
        batteryYears: f(8, "mfr", "high", "The MY2025 warranty booklet covers “Countryman — Cooper SE BEV” at “8 years/100,000 miles”", WTY_2025),
        batteryMiles: f(100_000, "mfr", "high", "The MY2025 warranty booklet covers “Countryman — Cooper SE BEV” at “8 years/100,000 miles”", WTY_2025),
      },
      abstains: { heatPump: CTY_HP_ABSTAIN },
    },
    {
      id: "mini-countryman-se-2027",
      make: "MINI",
      model: "Countryman SE ALL4",
      modelAliases: CTY_ALIASES,
      modelYears: [2027, 2027],
      drive: "AWD",
      vds: ["13HP0"],
      battery: {
        packUsableKwh: f(64.7, "mfr", "high", "MINI's 2027 Countryman SE ALL4 page, “64.7 kWh / Battery Capacity”; MINI's MY2025 technical specification is what identifies 64.7 as the net figure", MINI_CTY),
      },
      range: {
        epaRangeMi: f(216, "mfr", "high", "On the standard 18-inch wheels (MINI's MY2027 pricing guide prices the 19s at $750); 214 mi on those 19s. MINI's own page says “Up to 216 miles / EPA Range”", epa(50374)),
        epaKwhPer100Mi: f(34.6, "mfr", "high", undefined, epa(50374)),
      },
      charging: {
        portStandard: f<"CCS1">("CCS1", "mfr", "high", "MINI's own MY2027 Countryman page: “a Remote Software Upgrade (RSU) and a compatible NACS DC adapter are required to make the MINI EV charge port (CCS) compatible with North American Charging Standard (NACS) stations”", MINI_CTY),
        superchargerAccess: SUPERCHARGER,
        dcPeakKw: f(130, "mfr", "high", "MINI's 2027 Countryman SE ALL4 page, “130 kW / DC Fast Charging”", MINI_CTY),
        dcFastCharging: f<"standard">("standard", "mfr", "high", undefined, MINI_CTY),
      },
      warranty: {
        batteryYears: f(8, "mfr", "high", "“Every MINI electric vehicle comes with … an 8-year/100,000-mile battery warranty”", MINI_CTY),
        batteryMiles: f(100_000, "mfr", "high", "“Every MINI electric vehicle comes with … an 8-year/100,000-mile battery warranty”", MINI_CTY),
      },
      abstains: { heatPump: CTY_HP_ABSTAIN },
    }
  );
}

// ─────────────────────────── TOYOTA C-HR (BEV), MY2027 ────────────────────
{
  const SPECS_2027 = "https://www.toyota.com/c-hr/features/";
  const PAGE_2027 = "https://www.toyota.com/chr/";
  const NOT_YET_EPA =
    "Toyota's own 2027 figure, which it publishes as an EPA-estimated rating; fueleconomy.gov carries no 2027 C-HR record as of 2026-09-10, and its MY2026 record (id 50307) rates the identical 287/273 pair";
  const CHR_HP_ABSTAIN =
    "Toyota's 2027 specification page names no heat pump, and neither does the same page for the 2027 bZ, a car whose release does name one — so the silence carries no information";

  const CHR_2027 = {
    make: "TOYOTA",
    model: "C-HR",
    modelAliases: ["C-HR AWD"],
    modelYears: [2027, 2027] as [number, number],
    drive: "AWD" as const,
    battery: { packGrossKwh: f(74.7, "mfr" as Source, "high", "Toyota's “Total battery capacity (kWh)”", SPECS_2027) },
    charging: {
      portStandard: f<"NACS">("NACS", "mfr", "high", "“North American Charging Standard (NACS) charging port”", SPECS_2027),
      superchargerAccess: f<"native">("native", "mfr", "high", "“gives you access to thousands of charging stations nationwide—including the Tesla Supercharger Network”", PAGE_2027),
      chargeTime1080Min: f(30, "mfr" as Source, "high", "“~30 MIN (WITH 150 KW OR ABOVE DCFC)”, from 10% to 80% in ideal conditions — Toyota's own qualifiers", SPECS_2027),
      acOnboardKw: f(11, "mfr" as Source, "high", "Toyota's “Onboard AC charger (kW)”", SPECS_2027),
      dcFastCharging: f<"standard">("standard", "mfr", "high", undefined, SPECS_2027),
    },
    thermal: {
      batteryPreconditioning: f(true, "mfr" as Source, "high", "“C-HR's battery preconditioning system helps optimize its battery temperature for DC Fast Charging out in the cold”", PAGE_2027),
    },
    warranty: {
      batteryYears: f(8, "mfr" as Source, "high", "“Electric Vehicle Drive Components Warranty (Transaxle, Traction Battery, Inverter with Converter) — 96 months/100,000 miles”", SPECS_2027),
      batteryMiles: f(100_000, "mfr" as Source, "high", "“Electric Vehicle Drive Components Warranty (Transaxle, Traction Battery, Inverter with Converter) — 96 months/100,000 miles”", SPECS_2027),
    },
  };

  R.push(
    {
      id: "chr-bev-2027",
      ...CHR_2027,
      abstains: {
        epaRangeMi:
          "Toyota rates the SE at 287 miles and the XSE at 273 on their different wheels, and a listing that states no grade cannot be told apart — the two grade rows below carry the figures",
        heatPump: CHR_HP_ABSTAIN,
      },
    },
    {
      id: "chr-bev-2027-se",
      ...CHR_2027,
      trim: ["SE"],
      range: { epaRangeMi: f(287, "mfr", "high", `SE, on its 18-inch wheels. ${NOT_YET_EPA}`, SPECS_2027) },
      abstains: { heatPump: CHR_HP_ABSTAIN },
    },
    {
      id: "chr-bev-2027-xse",
      ...CHR_2027,
      trim: ["XSE"],
      range: { epaRangeMi: f(273, "mfr", "high", `XSE, on its 20-inch wheels. ${NOT_YET_EPA}`, SPECS_2027) },
      abstains: { heatPump: CHR_HP_ABSTAIN },
    }
  );
}

export const RESEARCH_ROWS_20: EnrichmentRow[] = R;
