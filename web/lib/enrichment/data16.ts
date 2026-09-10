import type { EnrichmentRow, Fact, Source } from "../types";

// Polestar 3 (MY2024–25), Volvo EX40 (MY2025–26), Fisker Ocean (MY2023) —
// 2026-09-10.
//
// Three battery-electric nameplates that were live on the site with no
// enrichment row at all: 121 Polestar 3s (2024: 9, 2025: 112), 39 Volvo EX40s
// (2025: 10, 2026: 29) and 37 Fisker Oceans (all 2023). 197 cars, every one
// of them showing an empty enrichment card. All three are nameplates the
// corpus already half-knew — it carries six Polestar 2 rows, four XC40
// Recharge rows and a 2012 Fisker Karma — and in each case the new name
// simply never reached a row: the matcher compares model strings by EQUALITY,
// so "XC40 Recharge Pure Electric" can never answer a feed that says "EX40".
//
// ── WHAT THE VIN SAYS, AND WHY NO ROW HERE CARRIES A TRIM ──────────────────
// Every row below is keyed on the vehicle descriptor (VIN positions 4–5) and
// none carries a trim list. The matcher applies a row's trim before its VIN
// keys, so a trim-keyed row would reject exactly the cars whose VIN answers
// the question completely — and on all three nameplates the dealer trim is
// the weakest field in the record. On the live Polestar 3s, 32 of 112 MY2025
// cars carry no trim at all and another 12 say only "Long range" on a
// Performance-pack car.
//
// POLESTAR 3 — positions 4–5: EA = Long range Dual motor, EE = Long range
// Dual motor with Performance pack, EJ = Long range Single motor. Position 8
// is "B" on all 121 live cars and separates nothing; vPIC returns no Trim and
// no Series for this nameplate, so the VIN descriptor is the only hard
// evidence there is. The control is clean and complete: the word
// "performance" appears in the listing text of all 35 live EE cars (7 of 7 in
// MY2024, 28 of 28 in MY2025) and in NONE of the 82 EA cars; all 4 EJ cars
// are RWD and say "Single motor". Two WMIs are live — YSR (Chengdu) and 7SY
// (Charleston, South Carolina) — carrying the same descriptors in the same
// year, so the rows deliberately do not filter on WMI.
//
// VOLVO EX40 — positions 4–5: EH = Single Motor Extended Range (RWD),
// ER = Twin Motor (AWD). This is not read off the feed: Volvo's own MY2026
// warranty booklet prints a component table headed "C40 and EX40 Models" with
// the columns "ENGINE VIN CODE NUMBER — ER/EY | EH", and "Front Electric
// Drive Axle" is checked under ER/EY and blank under EH. vPIC agrees on every
// live car (EH → RWD, ER → AWD). Position 8 is the GRADE, not the motor —
// J = Core, K = Plus, L = Ultra, D = Ultra Black Edition, per vPIC's Trim on
// the same VINs — which is why these rows key on the descriptor and not on
// vin8. Volvo names a third code, EY, alongside ER; no EY car is live, so no
// row claims one and an EY VIN matches nothing rather than borrowing the
// Twin's numbers.
//
// FISKER OCEAN — position 5 is the version, and vPIC's Series field (the
// maker's own Part 565 decode) reads it back verbatim on every live car:
// 1E→Extreme, 1U→Ultra, 1Z→Ocean One, 1S→Sport. Positions 6–7 corroborate
// ("BU" on the dual-motor versions, "AU" on the front-drive Sport).
//
// ── SOURCES ───────────────────────────────────────────────────────────────
// Polestar: the model-year-labelled US specification pages (the April 2024
// capture, which still lists only the two dual-motor versions, and the
// April 2025 capture headed "Polestar 3 | 2025"), plus the Polestar 3 2025
// US owner's manual for the connector and polestar.com/us for the NACS
// adapter. fueleconomy.gov has NO MY2024 Polestar 3 record — its 2024
// Polestar menu carries only Polestar 2 entries — so the MY2024 rows publish
// Polestar's own preliminary figure in `mfrRangeMi`, never as an EPA rating.
//
// Volvo: volvocars.com/us EX40 specifications (whose embedded field name for
// "Battery capacity" is `nominalEnergy`, which is why 82.0 is filed as gross),
// the US EX40 2025 owner's manual PDF, the NACS adapter support page, and the
// model-year warranty booklets — the MY2025 one is the exact PDF Volvo's own
// EX40 2025 support page offers as "2025 EX40 Warranty and Maintenance
// Records Information".
//
// Fisker: web.archive.org captures of Fisker's own pages (the company was
// liquidated in 2024 and fiskerinc.com no longer serves them) — the US
// "One / Extreme" specification sheet, the Ocean model page's per-version
// bullets and warranty table, and the charging FAQ for the connector.
//
// ── HEAT PUMP: ONE STANDARD, TWO ABSTENTIONS ───────────────────────────────
// Polestar prints "Heat pump" in the Polestar 3's standard Climate list on
// both model-year spec pages, unqualified, on a page where every optional
// item carries its pack in parentheses ("Advanced Air Cleaner … (with Plus
// pack)" sits two lines below it). That is the maker saying it, so the rows
// say standard.
//
// The EX40 rows abstain, and the reason is a Volvo-vs-Volvo conflict this
// project has been burned by before (the XC40/C40 rows carry the same
// abstention). volvocars.com/us lists "Heat pump" in the EX40's Climate
// feature catalogue — and the catalogue is not junk, because the same
// template omits it for the petrol XC60 and XC90 and includes it for the EX30
// and EX90 — but the list carries no per-trim status in the served page, and
// Volvo's own US EX40 2025 owner's manual contains the string "heat pump"
// ZERO times in 24,000 lines while describing a parking heater and an
// auxiliary heater, and the EX40 support "Heaters" article names those same
// two where the EX30 and EX90 articles carry a "Heat pump" section. A yes/no
// fact is never estimated; two Volvo surfaces disagree; the row says nothing.
//
// Fisker abstains because nothing Fisker published says either way: the US
// specification sheet has no climate section, and the archived spec and
// charging FAQs never use the words.
//
// ── WHAT WAS DELIBERATELY NOT WRITTEN ─────────────────────────────────────
// No MY2026 Polestar 3 rows: none is live, and EPA's MY2026 figures differ
// from MY2025's on every version (291/312/281 against 342/310/279), so the
// MY2025 rows are year-scoped and a 2026 car matches nothing rather than
// inheriting them.
// No pack figure for the Fisker Ocean Sport: Fisker named its battery
// "Touring Range" and published no capacity for it in any US document that
// survived the liquidation, so the row abstains rather than borrow a number.
// No `packUsableKwh` for the Polestar 3: Polestar publishes "111 kWh
// capacity" and never splits gross from usable.

const R: EnrichmentRow[] = [];

const epa = (id: number) => `https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=${id}`;

// ── Polestar 3, MY2024–2025 ───────────────────────────────────────────────
{
  const AS_OF = "2026-09-10";
  const f = <T,>(value: T, note?: string, sourceUrl?: string, confidence: Fact<T>["confidence"] = "high"): Fact<T> => ({
    value,
    source: "mfr" as Source,
    asOf: AS_OF,
    confidence,
    note,
    sourceUrl,
  });

  const SPECS_2024 = "https://web.archive.org/web/20240405215533/https://www.polestar.com/us/polestar-3/specifications/";
  const SPECS_2025 = "https://web.archive.org/web/20250404133510/https://www.polestar.com/us/polestar-3/specifications/";
  const MANUAL_CHARGING = "https://www.polestar.com/us/manual/polestar-3/2025/47d2c97fd33effd3c0a8cc3718c999b7-eec7a9259f5bd482c0a8b0c13b211ac8-8664b2fa77a7e089c0a8296870d1a409/";
  const MANUAL_CABLE = "https://www.polestar.com/us/manual/polestar-3/2025/article/0ed816eed33d98cac0a8cc377bc12bc7-663e525fd3355dadc0a8cc377cb86c78-8664b2fa77a7e089c0a8296870d1a409";
  const SUPERCHARGER = "https://www.polestar.com/us/charging/tesla-supercharger-network/";

  const NO_2024_EPA =
    "Polestar's own figure, footnoted “Preliminary data. Subject to final vehicle EPA certification”; fueleconomy.gov's 2024 Polestar menu carries no Polestar 3 at all as of 2026-09-10 — move to epaRangeMi with the EPA id if one is ever published";

  const charging = (specs: string) => ({
    portStandard: f<"CCS1">(
      "CCS1",
      "Polestar 3 owner's manual: “Charging stations with support for fast charging are usually clearly marked CCS or Combo”; the same manual's charging-cable page reads “Compliance: SAE J1772”",
      MANUAL_CHARGING
    ),
    superchargerAccess: f<"adapter">(
      "adapter",
      "“Polestar 2, Polestar 3 and Polestar 4 vehicles are compatible with the NACS adapter” — “Align the adapter head to your vehicle's charging port”",
      SUPERCHARGER
    ),
    dcFastCharging: f<"standard">("standard", undefined, specs),
    dcPeakKw: f(250, "“250 kW DC”", specs),
    chargeTime1080Min: f(30, "“10–80% in 30 min”, Polestar's own reference figure on a 250 kW DC charger", specs),
    acOnboardKw: f(11, "“11 kW AC — 0-100% in 11 hrs”", specs),
    architectureV: f(400, "“400 V lithium-ion battery, 111 kWh capacity, 17 modules”", specs),
  });

  const battery = (specs: string) => ({
    packGrossKwh: f(111, "“400 V lithium-ion battery, 111 kWh capacity, 17 modules”; Polestar does not publish a usable figure", specs),
  });

  const thermal = (specs: string) => ({
    heatPump: f<"standard">(
      "standard",
      "Listed under Climate with the 3-zone system, climate timers and parking climate and no pack qualifier, on a page where the Advanced Air Cleaner two lines below reads “(with Plus pack)”",
      specs
    ),
  });

  const warranty = (specs: string) => ({
    batteryYears: f(8, "“8-year battery warranty … First 8 years of ownership or 100,000 miles, whichever comes first”", specs),
    batteryMiles: f(100_000, "“First 8 years of ownership or 100,000 miles, whichever comes first”", specs),
    sohFloorPct: f(
      70,
      "“If the battery state of health (SoH) reduces below 70% of its original capacity within the first 8 years of ownership, we will replace your battery free of charge”",
      specs
    ),
  });

  const P3 = { make: "POLESTAR", model: "Polestar 3" };

  R.push(
    // There is no US-market MY2024 Polestar 3: vPIC's 2024 Polestar model list
    // is the Polestar 2 alone, EPA has no 2024 record, and every live and
    // cached Polestar 3 VIN carries year code S (2025). The nine feed rows
    // labelled 2024 are MY2025 cars, so these rows span [2024, 2025] and print
    // the certified MY2025 figures — never Polestar's preliminary 315/279 as a
    // 2024 rating (refuter, 2026-09-10).
    {
      id: "polestar3-2025-single",
      ...P3,
      modelYears: [2024, 2025],
      vds: ["EJ"],
      drive: "RWD",
      packVariant: "Long range Single motor",
      battery: battery(SPECS_2025),
      range: {
        epaRangeMi: f(
          342,
          "MY2025 Long Range Single Motor on the standard 20-inch Aero wheels, EPA; 350 on the 21s, 333 on the 22s",
          epa(48724)
        ),
      },
      charging: charging(SPECS_2025),
      thermal: thermal(SPECS_2025),
      warranty: warranty(SPECS_2025),
    },
    {
      id: "polestar3-2025-dual",
      ...P3,
      modelYears: [2024, 2025],
      vds: ["EA"],
      drive: "AWD",
      packVariant: "Long range Dual motor",
      battery: battery(SPECS_2025),
      range: {
        epaRangeMi: f(
          310,
          "MY2025 Long Range Dual Motor on the standard 20-inch Aero wheels, EPA; 315 on the 21s, 287 on the 22s",
          epa(48408)
        ),
      },
      charging: charging(SPECS_2025),
      thermal: thermal(SPECS_2025),
      warranty: warranty(SPECS_2025),
    },
    {
      id: "polestar3-2025-performance",
      ...P3,
      modelYears: [2024, 2025],
      vds: ["EE"],
      drive: "AWD",
      packVariant: "Long range Dual motor with Performance pack",
      battery: battery(SPECS_2025),
      range: {
        epaRangeMi: f(
          279,
          "MY2025 Long Range Dual Motor Performance Pack, EPA — its own certified entry; the pack replaces the 20-inch Aero wheels with 22-inch Performance wheels",
          epa(48411)
        ),
      },
      charging: charging(SPECS_2025),
      thermal: thermal(SPECS_2025),
      warranty: warranty(SPECS_2025),
    }
  );
}

// ── Volvo EX40, MY2025–2026 (the renamed XC40 Recharge) ───────────────────
{
  const AS_OF = "2026-09-10";
  const f = <T,>(value: T, note?: string, sourceUrl?: string, confidence: Fact<T>["confidence"] = "high"): Fact<T> => ({
    value,
    source: "mfr" as Source,
    asOf: AS_OF,
    confidence,
    note,
    sourceUrl,
  });

  const SPECS = "https://www.volvocars.com/us/cars/ex40-electric/specifications/";
  const MANUAL_2025 = "https://www.volvocars.com/static/support-content/pdfs/us_en-US_ex40_2025_UM_c7a006bfa7f26ba2fe51fb995fd5be3a.pdf";
  const NACS = "https://www.volvocars.com/us/support/topic/blt62870ecab912f410/";
  const WTY_2025 = "https://www.volvocars.com/images/cs/v3/assets/bltccbab8edae0354cd/blt25bc3c9dacdc12e9/68418a43ead0f6d3093536f7/Volvo_MY2025_Fully_Elec_Wty_Manual.pdf?branch=prod_alias";
  const MANUAL_2026 = "https://www.volvocars.com/static/support-content/pdfs/us_en-US_ex40_2026_UM_90f0c0ce6a290c4cf8faf8514b7d0fe9.pdf";
  const WTY_2026 = "https://www.volvocars.com/images/cs/v3/assets/bltccbab8edae0354cd/blt79f8a67d798c8d78/68befcffe94f786661a1f43a/MY2026_WTY572.06.25_Fully_Elec_Wty_Manual_Rev2_WEB_06-18-25.pdf?branch=prod_alias";

  const HP_ABSTAIN =
    "Volvo's own US surfaces disagree: the EX40 specification page marks the heat pump “Optional in Plus” (its Climate neighbours read “Included in Plus”), so on one grade it is an option, while the US EX40 owner's manual never uses the words and its Heaters section describes only a parking heater and an auxiliary heater; an option on one grade is not a yes or a no for the car, and the manual's silence is not a no";

  const charging = {
    portStandard: f<"CCS1">(
      "CCS1",
      "EX40 owner's manual: “Charging stations with support for fast charging are usually clearly marked CCS or Combo”",
      MANUAL_2025
    ),
    superchargerAccess: f<"adapter">(
      "adapter",
      "“Adapters will be included as standard equipment with MY2025 EX90, EX40 and EC40” — “Plug the adapter into your car's charging port”",
      NACS
    ),
    dcFastCharging: f<"standard">("standard", undefined, SPECS),
    chargeTime1080Min: f(28, "“Charge time (10-80%) (as fast as) 28.0 min”, Volvo's own preliminary figure", SPECS),
  };
  // The same inlet, cited to the MY2026 manual — a port is a per-year fact.
  const charging26 = {
    ...charging,
    portStandard: f<"CCS1">("CCS1", "EX40 owner's manual (MY2026): “Charging stations with support for fast charging are usually clearly marked CCS or Combo”", MANUAL_2026),
  };

  // The two booklets word the same term differently, and the MY2026 one puts
  // the "capacity" sentence on the 12-volt battery — so each year quotes its
  // own booklet, and the 2026 rows carry no transfer claim because that
  // sentence could not be found in the MY2026 booklet (refuter, 2026-09-10).
  const wty = (url: string, year: 2025 | 2026) =>
    year === 2025
      ? {
          batteryYears: f(
            8,
            "“the original equipment high voltage battery installed in your 2025 Volvo is covered against defects in parts and labor for eight (8) years or 100,000 miles/160,000 kilometers”",
            url
          ),
          batteryMiles: f(100_000, "“eight (8) years or 100,000 miles/160,000 kilometers, whichever occurs first”", url),
          sohFloorPct: f(
            70,
            "“If the battery capacity is lower than 70% of original status (according to specification) at 8 years or 100,000 miles/160,000 kilometers, whichever occurs first, the battery will be replaced free of charge”",
            url
          ),
          batteryTransfers: f(true, undefined, url),
        }
      : {
          batteryYears: f(
            8,
            "“High Voltage Battery System — The coverage under this warranty is for eight (8) years or 100,000 miles /160,000 kilometers, whichever occurs first, from the vehicle's original in-service date”",
            url
          ),
          batteryMiles: f(100_000, "“eight (8) years or 100,000 miles /160,000 kilometers, whichever occurs first”", url),
          sohFloorPct: f(
            70,
            "“If the battery State of Health is lower than 70% of original status (according to specification) at 8 years or 100,000 miles/160,000 kilometers, whichever occurs first, the battery will be replaced free of charge”",
            url
          ),
        };

  const EX40 = { make: "VOLVO", model: "EX40" };
  const PACK_NOTE =
    "Volvo's US EX40 specification page, “Battery capacity 82.0 kWh” — the page's own field name for it is `nominalEnergy`, so the figure is the nominal pack, not the usable one";
  const PACK_NOTE_2025 = `${PACK_NOTE}. The page now describes the MY2026/27 car; vPIC's Part 565 filing reads 82.00 for MY2025 EX40 VINs, single and twin (live decode 2026-09-10) and EPA's MY2025 and MY2026 records are identical figure for figure`;

  R.push(
    {
      id: "ex40-2025-single",
      ...EX40,
      modelYears: [2025, 2025],
      vds: ["EH"],
      drive: "RWD",
      packVariant: "Single Motor Extended Range",
      abstains: { heatPump: HP_ABSTAIN },
      battery: { packGrossKwh: f(82, PACK_NOTE_2025, SPECS) },
      range: { epaRangeMi: f(296, "MY2025 EX40 (single motor, RWD), EPA", epa(48451)) },
      charging,
      warranty: wty(WTY_2025, 2025),
    },
    {
      id: "ex40-2025-twin",
      ...EX40,
      modelYears: [2025, 2025],
      vds: ["ER"],
      drive: "AWD",
      packVariant: "Twin Motor",
      abstains: { heatPump: HP_ABSTAIN },
      battery: { packGrossKwh: f(82, PACK_NOTE_2025, SPECS) },
      range: { epaRangeMi: f(260, "MY2025 EX40 Twin, EPA", epa(48447)) },
      charging,
      warranty: wty(WTY_2025, 2025),
    },
    {
      id: "ex40-2026-single",
      ...EX40,
      modelYears: [2026, 2026],
      vds: ["EH"],
      drive: "RWD",
      packVariant: "Single Motor Extended Range",
      abstains: { heatPump: HP_ABSTAIN },
      battery: { packGrossKwh: f(82, `${PACK_NOTE}; vPIC's Part 565 filing reads 82.00 on every live MY2026 EX40 VIN, single and twin alike`, SPECS) },
      range: { epaRangeMi: f(296, "MY2026 EX40 (single motor, RWD), EPA", epa(49747)) },
      charging: charging26,
      warranty: wty(WTY_2026, 2026),
    },
    {
      id: "ex40-2026-twin",
      ...EX40,
      modelYears: [2026, 2026],
      vds: ["ER"],
      drive: "AWD",
      packVariant: "Twin Motor",
      abstains: { heatPump: HP_ABSTAIN },
      battery: { packGrossKwh: f(82, `${PACK_NOTE}; vPIC's Part 565 filing reads 82.00 on every live MY2026 EX40 VIN, single and twin alike`, SPECS) },
      range: { epaRangeMi: f(260, "MY2026 EX40 Twin, EPA", epa(49749)) },
      charging: charging26,
      warranty: wty(WTY_2026, 2026),
    }
  );
}

// ── Fisker Ocean, MY2023 ──────────────────────────────────────────────────
{
  const AS_OF = "2026-09-10";
  const f = <T,>(value: T, note?: string, sourceUrl?: string, confidence: Fact<T>["confidence"] = "high"): Fact<T> => ({
    value,
    source: "mfr" as Source,
    asOf: AS_OF,
    confidence,
    note,
    sourceUrl,
  });

  // Fisker's own US specification sheet for the One and the Extreme, and the
  // Ocean model page whose per-version bullets name each version's battery,
  // powertrain, range and the warranty table. Both are web.archive.org copies
  // of fiskerinc.com: the company filed for Chapter 11 on 2024-06-17 and its
  // site no longer serves them.
  const SPEC_SHEET = "https://web.archive.org/web/2024id_/https://img.fiskerinc.com/image/upload/v1688074996/web%203.0/CMS%20content/vdp/12.23%20Update/2023_Fisker_Ocean_Specifications_US_1_bl3ncu.pdf";
  const OCEAN_PAGE = "https://web.archive.org/web/20240701071251id_/https://www.fiskerinc.com/_next/data/0Sm-w73B8x2yBdLtc04TL/en-us/ocean.json?cmsPage=ocean";
  const FAQ_CHARGING = "https://web.archive.org/web/2023id_/https://www.fiskerinc.com/faq/charging";
  const CH11 =
    "Fisker's own Form 8-K of 2024-06-24 reports the Chapter 11 filing of 2024-06-17 in the District of Delaware; the term below is what Fisker published, and this row does not model who honours it";

  const HP_ABSTAIN =
    "Fisker published no climate-system detail for the Ocean in any US document that survived the company's liquidation — neither the US specification sheet nor the archived specification and charging FAQs use the words";

  const charging = {
    portStandard: f<"CCS1">(
      "CCS1",
      "“The Fisker Ocean is equipped with a CCS1(US) and (Europe) and GBT (China) CCS2 compatible charge port”",
      FAQ_CHARGING
    ),
    dcFastCharging: f<"standard">("standard", undefined, FAQ_CHARGING),
  };

  const warranty = {
    batteryYears: f(10, `Fisker's Ocean page warranty table, “Battery Warranty … Years / Miles or Kilometers / % State of Health: 10 / 100,000 / 75%”. ${CH11}`, OCEAN_PAGE),
    batteryMiles: f(100_000, "“Battery Warranty … 10 / 100,000 / 75%”", OCEAN_PAGE),
    sohFloorPct: f(75, "“Battery Warranty … Years / Miles or Kilometers / % State of Health: 10 / 100,000 / 75%”", OCEAN_PAGE),
  };

  const HYPER_RANGE = "Fisker's US specification sheet for the One and Extreme, “Battery Capacity 113 kWh (106 kWh usable)”";
  const OCEAN = { make: "FISKER", model: "Ocean" };

  R.push(
    {
      id: "fisker-ocean-2023-extreme-one",
      ...OCEAN,
      modelYears: [2023, 2023],
      vds: ["1E", "1Z"],
      drive: "AWD",
      packVariant: "Hyper Range",
      battery: {
        packGrossKwh: f(113, HYPER_RANGE, SPEC_SHEET),
        packUsableKwh: f(106, HYPER_RANGE, SPEC_SHEET),
      },
      range: {
        epaRangeMi: f(
          360,
          "MY2023, EPA's single certified entry for this car is filed as “Ocean Extreme One” and covers both versions; Fisker's own sheet quotes the same 360 on the standard 20-inch wheels",
          epa(46984)
        ),
      },
      charging: {
        ...charging,
        chargeTime1080Min: f(35, "“Charging Time (DCFC) (10–80%) 34 min 35 sec”", SPEC_SHEET),
      },
      abstains: { heatPump: HP_ABSTAIN },
      warranty,
    },
    {
      id: "fisker-ocean-2023-ultra",
      ...OCEAN,
      modelYears: [2023, 2023],
      vds: ["1U"],
      drive: "AWD",
      packVariant: "Hyper Range",
      battery: {
        packGrossKwh: f(113, `${HYPER_RANGE}. Applied to the Ultra because Fisker's own Ocean page gives the Ultra and the Extreme the same “Battery: Hyper Range” and the same “Powertrain: Dual Motor AWD w/ Rear Disconnect”; the sheet itself is headed “One / Extreme”`, SPEC_SHEET, "medium"),
        packUsableKwh: f(106, `${HYPER_RANGE}. Same two-document link as the gross figure`, SPEC_SHEET, "medium"),
      },
      range: {
        mfrRangeMi: f(
          350,
          "Fisker's own Ocean page, “Ultra — Range: 350 Miles”, footnoted “EPA estimated range”; fueleconomy.gov holds no MY2023 Ultra record, only the joint “Ocean Extreme One” entry, so this stays the maker's figure",
          OCEAN_PAGE
        ),
      },
      charging: {
        ...charging,
        chargeTime1080Min: f(35, "“Charging Time (DCFC) (10–80%) 34 min 35 sec”, the One/Extreme sheet's figure for the same Hyper Range pack", SPEC_SHEET, "medium"),
      },
      abstains: { heatPump: HP_ABSTAIN },
      warranty,
    },
    {
      id: "fisker-ocean-2023-sport",
      ...OCEAN,
      modelYears: [2023, 2023],
      vds: ["1S"],
      drive: "FWD",
      packVariant: "Touring Range",
      abstains: {
        packUsableKwh:
          "Fisker named the Sport's pack “Touring Range” and published no capacity for it in any US document that survived the liquidation; the only surviving specification sheet covers the One and Extreme",
        heatPump: HP_ABSTAIN,
      },
      range: {
        mfrRangeMi: f(
          231,
          "Fisker's own Ocean page, “Sport — Range: 231 Miles”, footnoted “Based on Fisker simulations utilizing EPA standards … Official EPA ratings forthcoming”; fueleconomy.gov's first Ocean Sport record is MY2024",
          OCEAN_PAGE
        ),
      },
      charging,
      warranty,
    }
  );
}

export const RESEARCH_ROWS_16: EnrichmentRow[] = R;
