import type { EnrichmentRow, Fact, Source } from "../types";

// BMW iX3 (2027), i3 (2014–2021) and X5 xDrive40e (2016–2018) — 2026-09-10.
//
// Three nameplates that were live on the site with no enrichment row at all,
// found by scripts/live-enrichment-gap.mjs. 123 iX3s, 59 i3-family cars and
// 49 X5 xDrive40e plug-ins — 231 listings whose cards rendered empty. A
// fourth was assigned and is deliberately NOT written: see the XM note at
// the bottom of this comment.
//
// ── WHAT EACH FACT CAME FROM ──────────────────────────────────────────────
// Every range figure is fueleconomy.gov's REST API, cited to the Find.do
// page for the id it came from. Every pack, port, charging and warranty fact
// is a BMW document fetched and read this pass: US press releases on
// press.bmwgroup.com/usa, the technical-data PDF attached to the X5
// xDrive40e release, and — the find that made this batch worth doing —
// BMW's own per-model-year warranty booklets, which are served from
// bmwusa.com's /bin/services/warranty-books endpoint (year -> series -> PDF)
// and cover the i3 for every year 2014–2021 and the X5 for 2016–2018.
//
// Those booklets settle a question the corpus has been abstaining on. data6's
// BMW_WARRANTY_ABSTAIN says "BMW's own pages state both 8-year/80,000 and
// 8-year/100,000 for plug-in hybrids", and data4's X5_45E_WARRANTY_ABSTAIN
// says the MY2021–23 booklets aren't published anywhere BMW-hosted. Both are
// still true of the years they name. They are NOT true of these years, where
// the booklet exists and names a term:
//
//   i3   MY2014–2019   8 years/100,000 miles (defect)
//   i3   MY2020–2021   8 years/80,000 miles (defect)
//   X5 xDrive40e MY2016–2018  8 years/80,000 miles (defect)
//
// The i3's change at MY2020 is real and is why the 120 Ah rows split at 2019
// even though every EPA figure is identical across 2019–2021: the 2019
// booklet says 100,000 and the 2020 and 2021 booklets say 80,000. Reading one
// booklet and carrying it across the span would have printed a 20,000-mile
// overclaim on the newest i3s on the site. Battery CAPACITY coverage stayed
// 8 years/100,000 miles at a 70% floor in every i3 booklet including 2021 —
// two different terms in the same document, so the capacity term rides in the
// note rather than in batteryMiles.
//
// ── THE iX3'S RANGE IS NOT THE NUMBER BMW LEADS WITH ──────────────────────
// BMW's pricing release headlines "up to 434 miles". Its own table in the
// same release says which configuration that is:
//
//   20" Summer Tires (No-cost option)   118 MPGe   434 mi
//   20" All-Season Tires (Standard)     102 MPGe   383 mi
//   21" Summer Tires                    105        398
//   21" All-Season Tires                105        399
//   22" Summer Tires                    104        392
//
// EPA carries all five as separate 2027 records and they match BMW's table to
// the mile. The house rule on wheel-size splits is to publish the
// standard-equipment configuration, so the row carries 383 — the car a
// shopper gets if they tick nothing — with the spread in the note. BMW's
// standard-equipment list names the same wheel ("20" Aero Bicolor 1046
// Wheels with All Season Tires"), so which one is standard is BMW's own
// statement, not an inference from price.
//
// The row is keyed to VIN positions 4-8 ("33HR0", every one of the 123 live
// cars) rather than left open on the nameplate, because BMW has already
// announced a second iX3: its summer-2026 model-update release adds a "BMW
// iX3 40". A 40 will not rate 383 miles, and a nameplate-level row would
// hand it the 50 xDrive's figure the day the first one lands.
//
// ── THE i3 VIN ENCODES REx AND PACK, AND POSITION 6 CHANGES MEANING ───────
// Read off all 59 live i3-family VINs and confirmed against vPIC decodes of
// one VIN per pattern (2026-09-10). Positions 4-5 are the generation and
// position 6 the version:
//
//   1Z2  60 Ah BEV        1Z4  60 Ah REx      (2014–2016)
//   1Z6  94 Ah BEV        1Z8  94 Ah REx      (2017)
//        (1Z8 is proven — EPA carries no 2017 60 Ah REx; 1Z6 is an inference:
//        it does not decode in MY2016 while 1Z2 does, and 1Z2 continues into 2017)
//   7Z2  94 Ah BEV        7Z4  94 Ah REx      (2018, i3)
//   7Z6  94 Ah BEV        7Z8  94 Ah REx      (2018, i3s)
//   8P2  120 Ah BEV       8P4  120 Ah REx     (2019–2021, i3)
//   8P6  120 Ah BEV       8P8  120 Ah REx     (2019–2021, i3s)
//
// vPIC decodes every "4" and "8" pattern as ElectrificationLevel "PHEV
// (Plug-in Hybrid Electric Vehicle)" with a 0.6 L two-cylinder, and every "2"
// and "6" pattern as "BEV" with no engine — so the range extender is in the
// VIN, unambiguously, and no dealer trim string is needed to find it. That
// matters here more than on most nameplates: the feed's own labelling is
// wrong in both directions. WBY7Z4C5XJVD96916 is filed under model "i3 with
// Range Extender" and WBY7Z4C58JVD96526 under plain "i3" with trim "94 Ah" —
// same VIN pattern, same car, and only one of the two dealers noticed the
// engine. A REx reading a BEV row would print 153 miles of range on a car
// EPA rates at 126 electric.
//
// Note the trap in that table: position 6 does NOT mean the same thing across
// generations. In the 1Z era 6 and 8 are the BIGGER PACK; in the 7Z and 8P
// eras they are the SPORT model. Every row below is therefore year-scoped as
// well as VIN-scoped, and none of them spans a generation boundary.
//
// No `trim` on any i3 row, deliberately, because the matcher applies a row's
// trim list before its VIN keys and the feed's i3 trims are noise: "HB",
// "3-Series", "Used 2014 BMW i3", "94Ah 120 Ah", "Base". A trim key would
// have refused the cars whose VIN answers the question completely.
//
// ── THE X5 xDrive40e IS KEYED TO ITS DESCRIPTOR, NOT TO "X5" ──────────────
// "X5" is a petrol-shared name, so it can never be aliased on its own. Every
// one of the 49 live 40e cars is 5UXKT0C — a descriptor BMW used for nothing
// else — and `vds` is a hard filter, so the row can carry the bare model
// string safely: a petrol xDrive35i (5UXKR0C) can never reach it. That is
// what lets the row answer for the seven live cars whose dealer wrote only
// "X5" with no trim at all, which a trim-keyed row (data4's
// x5-45e-2021-23-alt shape) refuses by design. The four badge spellings the
// feed uses — "X5 xDrive40e", "X5 xDrive40e iPerformance", "X5 eDrive" and
// bare "X5" — are all covered by one row.
//
// data4's x5-45e-2021-23 and x5-50e-2024-26 rows are the later plug-in X5s
// and are untouched; their year spans do not overlap this one.
//
// ── WHAT IS NOT HERE ──────────────────────────────────────────────────────
// HEAT PUMP, every row. Not one BMW US document consulted this pass mentions
// one for these cars: six iX3 documents (both US press releases, the release
// PDF attachment, the CES release, and two bmwusa.com iX3 pages), four i3
// press releases including the 2019 release's full technical-data table, and
// the X5 xDrive40e release plus its technical-data PDF. The control test says
// that silence is not just BMW never saying it — BMW's own iX release says
// "Integrated Heating and Cooling System with Heat Pump Function" in so many
// words (quoted on data3's ix-2023-m60 row). BMW says it when it is there;
// it does not say it here. That is still not a "none", so every row abstains.
//
// THE 2027 BMW XM. 33 are live and no row is written. BMW has published a
// 2027 XM range figure — bmwusa.com's XM page says "The 2027 BMW XM Label
// provides a purely electric range of up to 30 miles" — and that is all: the
// same page carries no pack, no port and no warranty, fueleconomy.gov's 2027
// BMW menu has no XM at all (48 models, control: the 2026 XM is id 49761),
// press.bmwgroup.com/usa has published nothing about a 2027 XM, and BMW's
// warranty-books service lists model years 2005–2026 with no 2027 at all. The
// figure BMW does publish is explicitly not an EPA rating ("Ranges of
// recently released, new model year electric vehicles may not yet be fully
// certified by EPA"). Extending data6's xm-2026 row on one uncertified number
// would be asserting three unpublished facts to carry a fourth, so the 2027
// XM stays unmatched until BMW publishes for it.

const f = <T,>(
  value: T,
  source: Source,
  confidence: Fact<T>["confidence"] = "high",
  note?: string,
  sourceUrl?: string
): Fact<T> => ({ value, source, asOf: "2026-09-10", confidence, note, sourceUrl });

const epa = (id: number) => `https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=${id}`;

const R: EnrichmentRow[] = [];

// ── BMW iX3 50 xDrive, MY2027 ─────────────────────────────────────────────
{
  const PR = "https://www.press.bmwgroup.com/usa/article/detail/T0452316EN_US/the-all-new-bmw-ix3?language=en_US";
  const PRICE =
    "https://www.press.bmwgroup.com/usa/article/detail/T0457571EN_US/bmw-officially-announces-pricing-and-range-for-2027-bmw-ix3-50-xdrive?language=en_US";
  // The MY2026 New Vehicle Limited Warranty booklet (md5 81157bde42a2fd1f4fbf71d25c870acc).
  // Not BMW's CPO all-electric page: that page states a 75% floor and scopes
  // itself to 2022-2025 Certified cars (refuter, 2026-09-10).
  const MY26_BOOK = "https://www.bmwusa.com/content/dam/bmw/marketUS/common/warranty-books/2026/BMW_MY26_NWLW%20Post_2025-09-11_ADA.pdf";
  const NO_MY27_BOOK =
    "BMW's warranty-books service publishes no MY2027 booklet yet (model years 2005-2026 only, checked 2026-09-10); this is BMW's own current statement of the term and the MY2026 booklet states the same 8 years/100,000 miles";

  R.push({
    id: "ix3-2027-50-xdrive",
    make: "BMW",
    model: "iX3",
    modelYears: [2027, 2027],
    drive: "AWD",
    // Every one of the 123 live cars. Keyed tight because BMW has announced a
    // second iX3 (the "40") that will not share this car's range.
    vds: ["33HR0"],
    abstains: {
      heatPump:
        "No BMW US iX3 document mentions a heat pump at all — neither press release, the release PDF, the CES release, nor bmwusa.com's iX3 pages — while BMW's own iX release names one explicitly, so the silence is not a maker that never says it",
    },
    battery: {
      packUsableKwh: f(112.2, "mfr", "high", "BMW's US technical-data table: “Net usable energy content kWh 112.2”", PR),
    },
    range: {
      epaRangeMi: f(
        383,
        "mfr",
        "high",
        "20-inch all-season tires, BMW's standard equipment. BMW's own table in the same release: 434 on the no-cost 20-inch summer tires, 399 on 21-inch all-season, 398 on 21-inch summer, 392 on 22-inch summer",
        epa(50384)
      ),
      epaKwhPer100Mi: f(33, "mfr", "high", "20-inch all-season tires; 102 MPGe combined", epa(50384)),
    },
    charging: {
      portStandard: f(
        "NACS",
        "mfr",
        "high",
        "“the new BMW iX3 will be fitted as standard with an NACS (North American Charging Standard) compatible charging port”, with a standard CCS adapter",
        PR
      ),
      superchargerAccess: f("native", "mfr", "high", "“This will provide iX3 owners access to the vast Supercharger network”", PR),
      dcFastCharging: f("standard", "mfr", "high", undefined, PR),
      dcPeakKw: f(400, "mfr", "high", "BMW's technical-data table: “Maximum charging, DC kW 400”, on an 800V station", PR),
      chargeTime1080Min: f(21, "mfr", "high", "“charge from 10 to 80% capacity in just 21 minutes at an 800V DC charging station”", PRICE),
      architectureV: f(800, "mfr", "high", "BMW's “800V architecture”; its technical-data table gives the pack's nominal 698.9 V", PRICE),
      acOnboardKw: f(15.4, "mfr", "high", "“can charge at up to 15.4 kW via the standard AC Charging Professional”", PR),
    },
    warranty: {
      batteryYears: f(
        8,
        "mfr",
        "medium",
        `8 years/100,000 miles in BMW's MY2026 booklet. ${NO_MY27_BOOK}`,
        MY26_BOOK
      ),
      batteryMiles: f(100_000, "mfr", "medium", NO_MY27_BOOK, MY26_BOOK),
      sohFloorPct: f(70, "mfr", "medium", "BMW's MY2026 booklet covers a BEV pack for capacity loss below 70% State of Health for 8 years/100,000 miles", MY26_BOOK),
    },
  });
}

// ── BMW i3, MY2014–2021 ───────────────────────────────────────────────────
{
  const PR_2014 = "https://www.press.bmwgroup.com/usa/article/detail/T0149790EN_US/the-all-new-bmw-i3?language=en_US";
  const PR_2017 = "https://www.press.bmwgroup.com/usa/article/detail/T0259560EN_US/the-new-2017-bmw-i3-94-ah-?language=en_US";
  const PR_2019 = "https://www.press.bmwgroup.com/usa/article/detail/T0285420EN_US/the-new-2019-bmw-i3-120ah-and-i3s-120ah?language=en_US";
  const WB = (year: number, file: string) =>
    `https://www.bmwusa.com/content/dam/bmw/marketUS/common/warranty-books/${year}/${file}`;
  const WB_2014 = WB(2014, "2014-BMW-i3-Service-Warranty-Information.pdf");
  const WB_2016 = WB(2016, "2016_BMW_i3_SW.pdf");
  const WB_2017 = WB(2017, "2017-BMW-i3-i8-NewVehicle-Limited-Warranty%20(BF08-2149193).pdf");
  const WB_2018 = WB(2018, "3161592-01-00-2-344-126-covered-NVLW.pdf");
  const WB_2019 = WB(2019, "2019-BMW-i3-NewVehicle-Limited-Warranty.pdf");
  const WB_2021 = WB(2021, "5A1BC94_21MY_BMW_i3_Warranty_FINAL_Print_withCover_111120.pdf");

  const HP_ABSTAIN =
    "No BMW US i3 document consulted states heat-pump hardware — not the 2013, 2014, 2017, 2018 or 2019 releases, and not the 2019 release's full technical-data table, which itemizes the pack and every charging rate";

  const I3 = {
    make: "BMW",
    model: "i3",
    // Every model string the feed files these cars under. All of them name
    // the electric car itself — the i3 nameplate has never been anything but
    // electric in the US — and each row's `vds` keeps it inside its own
    // generation regardless.
    modelAliases: ["i3s", "i3 with Range Extender", "I3-S REX", "i3 REx", "i3 Range Extender", "i3s with Range Extender"],
    drive: "RWD" as const,
  };

  // The defect term and the capacity term are two different numbers in the
  // same booklet from MY2020 on, so the capacity term rides in the note.
  const CAPACITY_NOTE =
    "Battery capacity is separately covered to 8 years/100,000 miles if net capacity falls below 70% of its original value";
  const warranty100k = (url: string) => ({
    batteryYears: f(8, "mfr", "high", "“for a period of 8 years/100,000 miles, whichever occurs first”", url),
    batteryMiles: f(100_000, "mfr", "high", CAPACITY_NOTE, url),
    sohFloorPct: f(70, "mfr", "high", "“net battery capacity is less than 70 percent of its original nominal value when it was new”", url),
    batteryTransfers: f(true, "mfr", "high", "BMW warrants “to the first retail purchaser, and each subsequent purchaser”", url),
  });
  const warranty80k = (url: string) => ({
    batteryYears: f(8, "mfr", "high", "“for a period of 8 years/80,000 miles, whichever occurs first” — down from 100,000 in the MY2019 booklet", url),
    batteryMiles: f(80_000, "mfr", "high", CAPACITY_NOTE, url),
    sohFloorPct: f(70, "mfr", "high", "“net battery capacity is less than 70 percent of its original nominal value when it was new”", url),
    batteryTransfers: f(true, "mfr", "high", "BMW warrants “to the first retail purchaser, and each subsequent purchaser”", url),
  });

  // 60 Ah cars: DC fast charging was a factory option, so the CCS1 inlet is
  // not on every car. Same shape as the 2017-19 Bolt EV row in data.ts.
  const CHARGING_60AH = {
    portStandard: f<"CCS1">(
      "CCS1",
      "mfr",
      "high",
      "Only on cars ordered with the DC fast-charge option; without it the inlet is the J1772 half alone, “a 220V Level 2, 32-amp J1772 charger”",
      PR_2014
    ),
    dcFastCharging: f<"optional">("optional", "mfr", "high", "“The SAE DC Combo Fast Charging … can be had as an option”", PR_2014),
  };
  const DCFC_TRAP = [
    {
      headline: "DC fast charging was a factory option on this car, not standard",
      severity: "trap" as const,
      resolvedBy: "photo_dcfc" as const,
    },
  ];
  const CHARGING_94AH = {
    portStandard: f<"CCS1">("CCS1", "mfr", "high", undefined, PR_2017),
    dcFastCharging: f<"standard">("standard", "mfr", "high", "“The BMW i3 is equipped with the future-proof 50 kW direct current (DC) fast charging technology”", PR_2017),
    dcPeakKw: f(50, "mfr", "high", "80% in under 40 minutes, BMW's figure for the 94 Ah pack", PR_2017),
    acOnboardKw: f(7.4, "mfr", "high", "“The 7.4 kW charging electronics … approximately 4.5 hours using a Level 2 charger”", PR_2017),
  };
  const CHARGING_120AH = {
    portStandard: f<"CCS1">("CCS1", "mfr", "high", undefined, PR_2019),
    dcFastCharging: f<"standard">("standard", "mfr", "high", "BMW's technical-data table prints “DC Charging Combo kW 50” for all four 120 Ah versions with no optional qualifier", PR_2019),
    dcPeakKw: f(50, "mfr", "high", "0-80% in 0.7 hours, BMW's technical-data table", PR_2019),
    acOnboardKw: f(7.4, "mfr", "high", "BMW's technical-data table; 0-100% in 6.5 hours on Level 2", PR_2019),
  };

  const PACK_60AH = {
    packGrossKwh: f(22, "mfr", "high", "“The previous battery of the BMW i3 (60 Ah) produced 22 kWh (gross)/19 kWh (net)”", PR_2017),
    packUsableKwh: f(19, "mfr", "high", "“22 kWh (gross)/19 kWh (net)”", PR_2017),
  };
  const PACK_94AH = {
    packGrossKwh: f(33, "mfr", "high", "“overall battery energy to 33 kWh of which 27.2 kWh can be effectively used”", PR_2017),
    packUsableKwh: f(27.2, "mfr", "high", "“33 kWh of which 27.2 kWh can be effectively used”", PR_2017),
  };
  const PACK_120AH = {
    packGrossKwh: f(42.2, "mfr", "high", "BMW's technical-data table: “Gross battery content, high voltage kWh 42.2”", PR_2019),
    packUsableKwh: f(37.9, "mfr", "high", "BMW's technical-data table: “Net battery content, high voltage kWh 37.9”", PR_2019),
  };

  R.push(
    {
      id: "i3-60ah-bev-2014-16",
      ...I3,
      modelYears: [2014, 2016],
      vds: ["1Z2"],
      packVariant: "60 Ah",
      abstains: { heatPump: HP_ABSTAIN },
      battery: PACK_60AH,
      range: {
        epaRangeMi: f(81, "mfr", "high", "Identical rating 2014-2016 (ids 35207, 36016, 37216) and again for the 60 Ah car in 2017", epa(35207)),
        epaKwhPer100Mi: f(27, "mfr", "high", undefined, epa(35207)),
      },
      charging: CHARGING_60AH,
      warranty: warranty100k(WB_2014),
      buyerNotes: DCFC_TRAP,
    },
    {
      id: "i3-60ah-rex-2014-16",
      ...I3,
      modelYears: [2014, 2016],
      vds: ["1Z4"],
      packVariant: "60 Ah REx",
      plugIn: true,
      abstains: { heatPump: HP_ABSTAIN },
      battery: PACK_60AH,
      range: {
        epaRangeMi: f(72, "mfr", "high", "Electric-only EPA range. Identical rating 2014-2016 (ids 35279, 36030, 37222)", epa(35279)),
        epaRangeTotalMi: f(150, "mfr", "high", undefined, epa(35279)),
        mpgeElectric: f(117, "mfr", "high", undefined, epa(35279)),
        mpgeCombined: f(88, "mfr", "high", undefined, epa(35279)),
        mpgGasoline: f(39, "mfr", "high", undefined, epa(35279)),
      },
      charging: CHARGING_60AH,
      warranty: warranty100k(WB_2016),
      buyerNotes: DCFC_TRAP,
    },
    {
      id: "i3-94ah-bev-2017",
      ...I3,
      modelYears: [2017, 2017],
      vds: ["1Z6"],
      packVariant: "94 Ah",
      abstains: { heatPump: HP_ABSTAIN },
      battery: PACK_94AH,
      range: {
        epaRangeMi: f(114, "mfr", "high", undefined, epa(38001)),
        epaKwhPer100Mi: f(29, "mfr", "high", undefined, epa(38001)),
      },
      charging: CHARGING_94AH,
      warranty: warranty100k(WB_2017),
    },
    {
      id: "i3-94ah-rex-2017",
      ...I3,
      modelYears: [2017, 2017],
      vds: ["1Z8"],
      packVariant: "94 Ah REx",
      plugIn: true,
      abstains: { heatPump: HP_ABSTAIN },
      battery: PACK_94AH,
      range: {
        epaRangeMi: f(97, "mfr", "high", "Electric-only EPA range", epa(38229)),
        epaRangeTotalMi: f(180, "mfr", "high", undefined, epa(38229)),
        mpgeElectric: f(111, "mfr", "high", undefined, epa(38229)),
        mpgeCombined: f(88, "mfr", "high", undefined, epa(38229)),
        mpgGasoline: f(35, "mfr", "high", undefined, epa(38229)),
      },
      charging: CHARGING_94AH,
      warranty: warranty100k(WB_2017),
    },
    {
      id: "i3-94ah-bev-2018",
      ...I3,
      modelYears: [2018, 2018],
      vds: ["7Z2"],
      packVariant: "94 Ah",
      abstains: { heatPump: HP_ABSTAIN },
      battery: PACK_94AH,
      range: {
        epaRangeMi: f(114, "mfr", "high", "The i3s rates 107 on the same pack and has its own row", epa(39854)),
        epaKwhPer100Mi: f(29, "mfr", "high", undefined, epa(39854)),
      },
      charging: CHARGING_94AH,
      warranty: warranty100k(WB_2018),
    },
    {
      id: "i3s-94ah-bev-2018",
      ...I3,
      modelYears: [2018, 2018],
      vds: ["7Z6"],
      packVariant: "94 Ah",
      abstains: { heatPump: HP_ABSTAIN },
      battery: PACK_94AH,
      range: {
        epaRangeMi: f(107, "mfr", "high", "EPA certifies the i3s separately from the i3, which rates 114 on the same pack", epa(39855)),
        epaKwhPer100Mi: f(30, "mfr", "high", undefined, epa(39855)),
      },
      charging: CHARGING_94AH,
      warranty: warranty100k(WB_2018),
    },
    {
      id: "i3-94ah-rex-2018",
      ...I3,
      modelYears: [2018, 2018],
      // i3 and i3s REx: EPA rates them identically, unlike the BEVs.
      vds: ["7Z4", "7Z8"],
      packVariant: "94 Ah REx",
      plugIn: true,
      abstains: { heatPump: HP_ABSTAIN },
      battery: PACK_94AH,
      range: {
        epaRangeMi: f(97, "mfr", "high", "Electric-only EPA range. The i3s REx (id 39835) rates identically", epa(39834)),
        epaRangeTotalMi: f(180, "mfr", "high", undefined, epa(39834)),
        mpgeElectric: f(109, "mfr", "high", undefined, epa(39834)),
        mpgeCombined: f(87, "mfr", "high", undefined, epa(39834)),
        mpgGasoline: f(35, "mfr", "high", undefined, epa(39834)),
      },
      charging: CHARGING_94AH,
      warranty: warranty100k(WB_2018),
    },
    {
      id: "i3-120ah-bev-2019",
      ...I3,
      modelYears: [2019, 2019],
      // i3 and i3s: EPA rates the 120 Ah BEVs identically.
      vds: ["8P2", "8P6"],
      packVariant: "120 Ah",
      abstains: { heatPump: HP_ABSTAIN },
      battery: PACK_120AH,
      range: {
        epaRangeMi: f(153, "mfr", "high", "The i3s (id 41055) rates identically", epa(41054)),
        epaKwhPer100Mi: f(30, "mfr", "high", undefined, epa(41054)),
      },
      charging: CHARGING_120AH,
      warranty: warranty100k(WB_2019),
    },
    {
      id: "i3-120ah-rex-2019",
      ...I3,
      modelYears: [2019, 2019],
      vds: ["8P4", "8P8"],
      packVariant: "120 Ah REx",
      plugIn: true,
      abstains: { heatPump: HP_ABSTAIN },
      battery: PACK_120AH,
      range: {
        epaRangeMi: f(126, "mfr", "high", "Electric-only EPA range. The i3s REx (id 41212) rates identically", epa(41211)),
        epaRangeTotalMi: f(200, "mfr", "high", undefined, epa(41211)),
        mpgeElectric: f(100, "mfr", "high", undefined, epa(41211)),
        mpgeCombined: f(86, "mfr", "high", undefined, epa(41211)),
        mpgGasoline: f(31, "mfr", "high", undefined, epa(41211)),
      },
      charging: CHARGING_120AH,
      warranty: warranty100k(WB_2019),
    },
    {
      // Same car and same EPA figures as the 2019 row above. It exists
      // because BMW cut the defect term to 80,000 miles for MY2020.
      id: "i3-120ah-bev-2020-21",
      ...I3,
      modelYears: [2020, 2021],
      vds: ["8P2", "8P6"],
      packVariant: "120 Ah",
      abstains: { heatPump: HP_ABSTAIN },
      battery: PACK_120AH,
      range: {
        epaRangeMi: f(153, "mfr", "high", "Identical rating 2020-2021, i3 and i3s alike (ids 42512, 42513, 43819, 43662)", epa(42512)),
        epaKwhPer100Mi: f(30, "mfr", "high", undefined, epa(42512)),
      },
      charging: CHARGING_120AH,
      warranty: warranty80k(WB_2021),
    },
    {
      id: "i3-120ah-rex-2020-21",
      ...I3,
      modelYears: [2020, 2021],
      vds: ["8P4", "8P8"],
      packVariant: "120 Ah REx",
      plugIn: true,
      abstains: { heatPump: HP_ABSTAIN },
      battery: PACK_120AH,
      range: {
        epaRangeMi: f(126, "mfr", "high", "Electric-only EPA range. Identical 2020-2021, i3 and i3s alike (ids 42572, 42573, 43745, 43746)", epa(42572)),
        epaRangeTotalMi: f(200, "mfr", "high", undefined, epa(42572)),
        mpgeElectric: f(100, "mfr", "high", undefined, epa(42572)),
        mpgeCombined: f(86, "mfr", "high", undefined, epa(42572)),
        mpgGasoline: f(31, "mfr", "high", undefined, epa(42572)),
      },
      charging: CHARGING_120AH,
      warranty: warranty80k(WB_2021),
    }
  );
}

// ── BMW X5 xDrive40e, MY2016–2018 ─────────────────────────────────────────
{
  const PR =
    "https://www.press.bmwgroup.com/usa/article/detail/T0208453EN_US/the-bmw-x5-xdrive40e-launches-the-next-chapter-of-efficientdynamics-with-its-first-ever-plug-in-hybrid-sports-activity-vehicle?language=en_US";
  const TECH_DATA = "https://www.press.bmwgroup.com/usa/article/attachment/T0208453EN_US/387137";
  const WB_2017 =
    "https://www.bmwusa.com/content/dam/bmw/marketUS/common/warranty-books/2017/2017-BMW-X1-X3-X4-X5-X6-New-Vehicle-Limited-Warranty%20(BF06-2152195).pdf";

  R.push({
    id: "x5-40e-2016-18",
    make: "BMW",
    model: "X5",
    modelAliases: ["X5 xDrive40e", "X5 xDrive40e iPerformance", "X5 eDrive"],
    modelYears: [2016, 2018],
    // The bare "X5" model string is only safe because of this hard filter:
    // 5UXKT0C is the xDrive40e's own descriptor and no petrol X5 shares it.
    vds: ["KT0C"],
    drive: "AWD",
    packVariant: "PHEV",
    plugIn: true,
    abstains: {
      heatPump:
        "Neither BMW's US xDrive40e release nor its technical-data PDF mentions a heat pump, and the same abstention already stands on the later plug-in X5 rows in data4",
    },
    battery: {
      packGrossKwh: f(9.2, "mfr", "high", "“a gross energy capacity of 9.2 kilowatt hours (kWh)”; BMW's technical-data table prints the same figure against a 351 V pack", PR),
    },
    range: {
      epaRangeMi: f(14, "mfr", "high", "Electric-only EPA range. Identical rating 2016-2018 (ids 37068, 38169, 39526)", epa(37068)),
      epaRangeTotalMi: f(540, "mfr", "high", undefined, epa(37068)),
      mpgeElectric: f(56, "mfr", "high", undefined, epa(37068)),
      mpgeCombined: f(29, "mfr", "high", undefined, epa(37068)),
      mpgGasoline: f(24, "mfr", "high", undefined, epa(37068)),
    },
    charging: {
      portStandard: f("J1772", "mfr", "high", "BMW's technical-data table: “Level 1 Charging (OUC) AC Typ 1; 1.4 kW”, and no DC row", TECH_DATA),
      dcFastCharging: f("none", "mfr", "high", "AC charging only; BMW's technical-data table lists Level 1 and Level 2 rates and no DC charging at all", TECH_DATA),
      acOnboardKw: f(3.5, "mfr", "high", "“a charging rate of 3.5 kW (16 A/220 V) … approximately 2 hours and 45 minutes to fully recharge”", PR),
    },
    warranty: {
      batteryYears: f(
        8,
        "mfr",
        "high",
        "BMW's MY2017 booklet, under the heading “High-Voltage Lithium-Ion Battery Limited Warranty (X5 xDrive40e)”: “for a period of 8 years/80,000 miles, whichever occurs first”. The MY2016 and MY2018 booklets state the same term",
        WB_2017
      ),
      batteryMiles: f(80_000, "mfr", "high", "8 years/80,000 miles in the MY2016, MY2017 and MY2018 X5 booklets alike", WB_2017),
      batteryTransfers: f(true, "mfr", "high", "BMW warrants “to the first retail purchaser, and each subsequent purchaser”", WB_2017),
    },
  });
}

export const RESEARCH_ROWS_18: EnrichmentRow[] = R;
