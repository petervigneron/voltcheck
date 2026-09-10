import type { EnrichmentRow, Fact, PortStandard, Source } from "../types";

// Audi A6/S6 Sportback e-tron MY2027, Audi e-tron GT facelift (S / RS
// performance) MY2025–26, and Volkswagen e-Golf MY2015–19 (2026-09-10).
//
// Three nameplate groups that live-enrichment-gap.mjs found matching nothing
// at all: 239 MY2027 A6/S6 Sportback e-trons, 119 facelifted e-tron GTs and
// 47 e-Golfs. Every figure below comes from a manufacturer document fetched
// and read this pass — Audi's own MY-specific Technical Specifications PDFs
// and press releases off media.audiusa.com, Volkswagen's per-model-year press
// kits off media.vw.com — with EPA ratings taken from fueleconomy.gov's REST
// API and cited to the Find.do page for the id they came from. The Audi spec
// PDFs were rendered to images (pdftoppm) and read as pages before their
// numbers were copied, because their numbers live in three-column tables.
//
// ── HOW THE PDFs WERE REACHED, SO THE NEXT PASS DOESN'T REPEAT THE HOUR ────
// media.audiusa.com and media.vw.com are the same SPA product, and both are
// behind an edge that answers curl with the 2.5 KB app shell — for the HTML
// pages AND for the /assets/... PDF URLs, which is new since the note in
// docs. What works is a real browser on the origin: `/api/releases/<id>`
// returns the release JSON (body in data.content), `/api/models/<slug>` and
// `/api/press-kits/<slug>` list the Technical Specifications / Release /
// Pricing PDFs per model year, and fetching an /assets/... URL from a page
// already on that origin returns the actual PDF. No UA spoofing and no
// challenge solving was involved; the plain HTTP client simply is not served.
//
// ══ 1. AUDI A6 SPORTBACK e-tron AND S6 SPORTBACK e-tron, MY2027 ═══════════
//
// 239 live and nothing to match: data4's a6etron/s6etron rows stop at 2026.
//
// THE PORT WAS THE QUESTION, and Audi answers it in its own MY2027 sheet.
// Audi announced Tesla Supercharger access on 2025-09-05 (release 643) as an
// ADAPTER programme — "Availability of Audi North American Charging System
// (NACS) to Combined Charging System (CCS) DC fast charging adapter ... as a
// port installed accessory" — not a native port, and Audi USA has published
// no native-NACS release since (the newsroom's own keyword search returns
// that one release and nothing else, checked 2026-09-10). The MY2027
// Technical Specifications sheet then says it outright, for all three
// versions: "Charge Port (Driver side) — AC/DC Combo Port — J1772 / CCS".
// So MY2027 is CCS1, and the row says so from Audi's own table rather than
// by carrying MY2026's answer forward.
//
// RANGE. Audi's sheet and fueleconomy.gov agree to the mile, which is the
// control test for both: A6 RWD 348 (395 with the ultra package), A6 quattro
// 327 (360 ultra), S6 326 on 20-inch wheels (311 on 21s). The rows publish
// the STANDARD-equipment configuration — the sheet's "Wheels (Standard)" row
// reads 20-inch for all three, and the ultra package is an option — and name
// the alternates in the Fact note.
//
// HEAT PUMP IS AN ABSTENTION, matching what data4 and data10 already do for
// every PPE car. The MY2027 sheet has no heat-pump row (the word does not
// appear in its four pages), and release 663's model-year change list does
// not mention thermal hardware. Carrying the older e-tron's standard heat
// pump across platforms is the aggregator inheritance this corpus has been
// burned by; carrying a European PPE brochure across markets is the other.
//
// SUPERCHARGER ACCESS IS ABSENT, not "adapter". Release 643's compatible-model
// list is a MY2025 list ("A6 Sportback e-tron (MY2025)"), written a year
// before these cars, and an entitlement Audi has not restated for MY2027 is
// not a MY2027 fact.
//
// ── VIN KEYS, read off 302 live A6/S6 VINs ────────────────────────────────
// WMI is WAU on every one and position 8 is H, which is data4's key for this
// family. Positions 5-8 read C, D or E followed by AGH, and position 5 is the
// discriminator:
//
//   position 5  C = A6 Sportback e-tron (RWD)
//               D = A6 Sportback e-tron quattro
//               E = S6 Sportback e-tron
//
// That holds without exception across all 22 (year, descriptor) groups and
// 302 cars: every C car's feed drivetrain is RWD, every D and E car's is AWD.
// Position 4 is the trim, and Audi RENUMBERED it between model years — 2025
// used 1/2/3/7, MY2027 uses 1/2/3/5/6 — so the rows enumerate position 4 over
// the digits rather than over the four values that happen to be live today.
// A trim Audi adds later keeps matching; a letter at position 4 (which this
// family has never used, though the e-tron GT does) would match nothing,
// which is the safe direction.
//
// MODEL YEAR 2026 DOES NOT EXIST for this car in the US, and that is worth
// writing down because the feed disagrees. Every live A6/S6 e-tron VIN
// carries S (2025) or V (2027) at position 10; not one carries T (2026).
// EPA's 2026 Audi menu has no A6 e-tron either, and release 683 goes straight
// from "an all-new Audi offering for 2025" to "For model year 2027". One live
// car — WAU6DAGH9VA000271, a MY2027 VIN a dealer filed as a 2026 "Technik"
// (a Canadian trim name) — is therefore mislabeled at the source. These rows
// are scoped [2027, 2027] and leave it alone: it lands on data4's 2025–26
// rows as two candidates (the refuter ran the matcher — no exact match), and
// widening these rows to 2026 to catch it would put three rows on one car
// for the sake of a single typo.
//
// ══ 2. AUDI e-tron GT FACELIFT: S e-tron GT AND RS e-tron GT performance ═══
//
// 119 live, MY2025 and MY2026, and the corpus had only the pre-facelift car
// (data4's etrongt-2022-23 / rs-etrongt-2022-23 and data3's 2024 row). These
// are a different vehicle: 105 kWh gross where the old one is 93.4, 320 kW
// where it was 270, and a two-model lineup that replaced the names.
//
// The VIN separates the two generations completely, so none of this can reach
// the old cars and none of theirs can reach these. Across all 317 live
// e-tron GTs, positions 4-8 fall into six patterns in two disjoint sets:
//
//   pre-facelift   C/D/E/F + JBFW  e-tron GT quattro
//                  A/B     + HBFW  RS e-tron GT
//   facelift       G/H     + 9BFW  S e-tron GT
//                  J       + 8BFW  RS e-tron GT performance
//
// Position 5 alone would do it (9 vs 8 vs J/H), but `vds` prefixes start at
// position 4, so the rows enumerate the position-4 letters. That is a closed
// set here rather than a guess: the S is sold in two trims (Premium Plus =
// G, Prestige = H, both live) and the RS performance in one (J), and release
// 683's pricing table carries no S for MY2027 (EPA's 2027 menu still lists an S e-tron GT), so the lineup is not going to
// grow underneath these rows.
//
// ONE ROW PER MODEL, SPANNING 2025–2026, because Audi's two spec sheets say
// the same thing. The MY2025 sheet (updated 11/21/2024) and the MY2026 sheet
// (updated 8/20/2025) carry identical Battery, Charging, Efficiency and
// Warranty blocks — 105/97 kWh, J1772/CCS, 9.6 kW AC / 320 kW DC, 18 minutes,
// 300 and 278 miles, 8 years/100,000 miles — and EPA's four records agree
// (48688/50185 both 300, 48993/50184 both 278). That is the maker's own
// material showing the figures did not change, which is what this corpus
// requires before two model years share a row.
//
// THE RS's STANDARD WHEEL CHANGED and its rating did not. Release 623 says
// the MY2025 car "comes standard with 20" 5-segment aero design wheels"; the
// MY2026 sheet's Wheels (Standard) row reads 21-inch, and release 683 says
// so explicitly ("the standard wheel diameter grew from 20-inch to a 21-inch
// 6-double-spoke milled cut"). EPA published exactly one RS e-tron GT
// performance record in each year, both 278, and Audi's own MY2026 footnote
// still reads "278 miles when equipped with 20-inch wheels" — so 278 is the
// only certified figure there is for either year, and the note says which
// wheel it was measured on rather than implying a 21-inch rating exists.
//
// SUPERCHARGER ACCESS IS "adapter" HERE, unlike the A6/S6 rows, because
// release 643's compatible list names this car by model year: "e-tron GT
// (MY2022 - MY2026)".
//
// HEAT PUMP ABSTAINS, and this one is uncomfortable, so here is the whole
// account. data4's pre-facelift rows assert `heatPump: standard` sourced
// "mfr" with no URL and the note "Audi: the e-tron GT's heat pump is
// standard". Nothing in the material read this pass supports that for the
// facelift: neither spec sheet has a heat-pump row, and release 623 — which
// spends four paragraphs on this car's thermal management, its "four coolant
// circuits", its "adaptive cooling circuit" and the changes Audi "made ... to
// the system's pumps and valves" — never uses the words "heat pump". A
// control test on that: the same release names the battery twelve times and
// the wheels by design and finish, so it is not a document that omits
// hardware it fitted. Silence in the one Audi USA document that discusses
// this car's thermal system at length is not evidence of a heat pump.
//
// CHEMISTRY IS NCM, in Audi's own words: "The battery pack's new cell
// chemistry ... with an adjusted ratio of nickel, cobalt and manganese, and a
// gross capacity of 105 kWh (97 kWh net)".
//
// ══ 3. VOLKSWAGEN e-GOLF, MY2015–2019 ═════════════════════════════════════
//
// 47 live, no row, two different packs and — the reason this needs eight rows
// rather than two — a heat pump and a DC fast-charging port that are both
// trim options for four of the five model years.
//
// VW's per-model-year press kits state each one plainly, and they differ:
//
//   2015  CCS standard on both trims ("The e-Golf comes equipped with a
//         standard Combined Charging System (CCS)"); heat pump on the SEL
//         Premium only ("a newly developed heat pump system that is fitted to
//         the SEL Premium model").
//   2016  the new SE gets a 3.6 kW onboard charger and DC fast charging only
//         via a $1,675 package; the SEL Premium keeps 7.2 kW and standard
//         CCS. Heat pump still SEL Premium only.
//   2017  7.2 kW becomes standard on both, "DC Fast Charging (optional on SE,
//         standard on SEL Premium)". Heat pump SEL Premium only.
//   2018  identical to 2017, package now $995. VW's own pricing sheet is the
//         cleanest statement of it: "Combined Charging System (CCS)
//         receptacle to enable DC Fast Charging — SE: P, SEL Premium: S" and
//         "Energy-efficient auxilliary climate control heat pump — SE: -,
//         SEL Premium: S".
//   2019  "All e-Golf models come equipped with a standard Combined Charging
//         System (CCS)" — the SE's package became standard equipment. Heat
//         pump still SEL Premium only.
//
// So the heat pump is a per-trim fact in all five years and the port is a
// per-trim fact in three of them, and a model-level e-Golf row would be wrong
// about one or the other for roughly half these cars.
//
// PACKS. 24.2 kWh and 83 miles for 2015–16; 35.8 kWh and 125 miles for
// 2017–19 ("For 2017, Volkswagen is using an updated lithium-ion battery with an
// increased energy capacity of 35.8 kWh from 24.2 kWh"). VW prints one
// unqualified "Capacity" figure and never says gross or usable, so it is
// filed as gross the way the Bolt's 60 is.
//
// ── VIN KEYS, read off all 47 live cars and control-tested against vPIC ────
// WMI WVW, position 8 U, and the two positions that matter are 4 and 5:
//
//   position 4  K = SE (2016-19) / Limited Edition (2015)
//               M = SEL (2018 only)
//               P = SEL Premium (every year)
//   position 5  P = the 24.2 kWh car (2015-16)
//               R = the 35.8 kWh car (2017-19)
//
// Position 4 is vPIC's own Part 565 trim decode, checked on fifteen live VINs
// on 2026-09-10: WVWKP7AU6FW905671 decodes Trim "Limited Edition",
// WVWKP7AU1GW903912 "SE", WVWPP7AU4GW915462 "SEL Premium",
// WVWMR7AU2JW908952 "SEL". Position 5 is keyed as well as position 4 —
// "KP" and "KR" rather than bare "K" — deliberately: a listing whose year is
// wrong by one is common in this feed, and without position 5 a 2017 car
// filed as a 2016 would match the 2016 row and be told it has a 24.2 kWh pack
// and 83 miles of range. Keying the generation makes that combination match
// nothing instead.
//
// THE 2018 "SEL" IS A REAL FILING AND AN UNDOCUMENTED CAR. VW filed a third
// MY2018 pattern that vPIC decodes as Trim "SEL", one is live, and its dealer
// calls it an SEL too — but Volkswagen's MY2018 US material describes exactly
// two trims. The press release prices "the 2018 Volkswagen e-Golf SE ... at
// $30,495. The SEL Premium model starts at $37,345", and the pricing sheet
// has two columns. So that row carries what VW states for "all 2018 e-Golf
// models" — the pack, the range, the 7.2 kW onboard charger, the warranty —
// and abstains on the two facts that vary by trim, because for THIS trim VW
// published neither.
//
// PORT ON THE OPTIONAL-DCFC ROWS follows the Bolt EV precedent in data.ts
// exactly: portStandard "CCS1" with dcFastCharging "optional" and a note
// saying the DC pins are only on cars that were ordered with the package.
// Splitting those rows further is not possible — nothing in the VIN, and
// nothing in a dealer feed, records whether a given car has it.

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

// ── Audi A6 Sportback e-tron / S6 Sportback e-tron, MY2027 ────────────────
{
  const SPECS =
    "https://media.audiusa.com/assets/applications/original/17278-2027my-audi-a6-and-s6-sportback-e-tron-technical-specs-rev-260803.pdf";
  const PR_MY27 = "https://media.audiusa.com/releases/663";

  const PPE_HEATPUMP_ABSTAIN =
    "Audi's MY2027 A6/S6 Sportback e-tron Technical Specifications sheet has no heat-pump row and release 663's model-year change list names no thermal hardware, so the corpus stays silent rather than carrying the older e-tron's standard heat pump across a different platform";

  const battery = {
    packGrossKwh: f(100, "mfr", "high", "Audi's MY2027 sheet, “Battery Size (Gross) — 100 kWh”", SPECS),
    packUsableKwh: f(94.4, "mfr", "high", "Audi's MY2027 sheet, “Battery Size (Net) — 94.4 kWh”; release 663 prints the same pair as “100 kWh (94.4 Net)”", PR_MY27),
  };
  const charging = {
    portStandard: f<PortStandard>("CCS1", "mfr", "high", "“Charge Port (Driver side) — AC/DC Combo Port — J1772 / CCS”; a second, AC-only J1772 port sits on the passenger side", SPECS),
    dcFastCharging: f<"standard">("standard", "mfr", "high", undefined, SPECS),
    dcPeakKw: f(270, "mfr", "high", "“Max Charging Capacity AC / DC — up to 9.6 kW / 270 kW”", SPECS),
    acOnboardKw: f(9.6, "mfr", "high", "Level 2 at 9.6 kW (240V, 40A) fills the pack in 11.5 hours on Audi's figures", SPECS),
    chargeTime1080Min: f(21, "mfr", "high", "“DC Fast Charging (270 kW) — 21 minutes (10% - 80% charge)”, Audi's own conditions", SPECS),
    architectureV: f(800, "mfr", "high", "“Battery Type — 800V Lithium Ion”", SPECS),
  };
  const warranty = {
    batteryYears: f(8, "mfr", "high", "“High Voltage Battery Limited Warranty — 8 Years / 100,000 Miles (whichever occurs first), 70% retention of battery capacity”", SPECS),
    batteryMiles: f(100_000, "mfr", "high", "Same row of Audi's MY2027 sheet", SPECS),
    sohFloorPct: f(70, "mfr", "high", "“70% retention of battery capacity”", SPECS),
  };
  // Position 4 is the trim and Audi renumbers it between model years, so it
  // is enumerated over the digits; position 5 is the version.
  const vds = (version: "C" | "D" | "E") => "0123456789".split("").map((d) => `${d}${version}AGH`);

  const base = {
    make: "AUDI",
    modelYears: [2027, 2027] as [number, number],
    battery,
    charging,
    warranty,
    abstains: { heatPump: PPE_HEATPUMP_ABSTAIN },
  };

  R.push(
    {
      ...base,
      id: "a6-sportback-etron-2027-rwd",
      model: "A6 Sportback e-tron",
      modelAliases: ["A6 e-tron"],
      drive: "RWD",
      vds: vds("C"),
      range: {
        epaRangeMi: f(348, "mfr", "high", "Standard configuration on the standard 20-inch wheel; Audi's sheet reads “348; 395 w/ultra package” and EPA rates the ultra separately at 395 (id 50369)", epa(50366)),
        epaKwhPer100Mi: f(30, "mfr", "high", "Standard configuration; 26 with the ultra package", epa(50366)),
      },
    },
    {
      ...base,
      id: "a6-sportback-etron-2027-quattro",
      model: "A6 Sportback e-tron",
      modelAliases: ["A6 e-tron"],
      drive: "AWD",
      vds: vds("D"),
      range: {
        epaRangeMi: f(327, "mfr", "high", "Standard configuration on the standard 20-inch wheel; Audi's sheet reads “327; 360 w/ultra package” and EPA rates the ultra separately at 360 (id 50368)", epa(50367)),
        epaKwhPer100Mi: f(32, "mfr", "high", "Standard configuration; 29 with the ultra package", epa(50367)),
      },
    },
    {
      ...base,
      id: "s6-sportback-etron-2027",
      model: "S6 Sportback e-tron",
      modelAliases: ["S6 e-tron"],
      drive: "AWD",
      vds: vds("E"),
      range: {
        epaRangeMi: f(326, "mfr", "high", "Audi's sheet reads “326 (w/20\" wheel)” and its Wheels (Standard) row is 20-inch; the optional 21-inch fitment is EPA-rated 311 (id 50371)", epa(50370)),
        epaKwhPer100Mi: f(33, "mfr", "high", "20-inch wheels, Audi's standard fitment", epa(50370)),
      },
    }
  );
}

// ── Audi S e-tron GT and RS e-tron GT performance, MY2025–2026 ────────────
{
  const SPECS_25 =
    "https://media.audiusa.com/assets/applications/original/14354-2025-e-tron-gt-model-family-tech-specs-jan-2025-final-rev.pdf";
  const SPECS_26 =
    "https://media.audiusa.com/assets/applications/original/15393-2026my-audi-e-tron-gt-technical-specs-august-2025.pdf";
  const PR_2025 = "https://media.audiusa.com/releases/623";
  const PR_NACS = "https://media.audiusa.com/releases/643";

  const GT_HEATPUMP_ABSTAIN =
    "Neither Audi USA spec sheet for the facelifted e-tron GT has a heat-pump row, and release 623 describes this car's thermal management, its four coolant circuits, its adaptive cooling circuit and the changes Audi made to its pumps and valves without ever using the words heat pump";

  const battery = {
    packGrossKwh: f(105, "mfr", "high", "“Battery Size (Gross) — 105 kWh” on both the MY2025 and MY2026 sheets", SPECS_26),
    packUsableKwh: f(97, "mfr", "high", "“Battery Size (Net) — 97 kWh”; release 623 states the pair as “a gross capacity of 105 kWh (97 kWh net)”", PR_2025),
    chemistry: f<"NCM">("NCM", "mfr", "high", "Audi: “The battery pack's new cell chemistry ... with an adjusted ratio of nickel, cobalt and manganese”", PR_2025),
  };
  const charging = {
    portStandard: f<PortStandard>("CCS1", "mfr", "high", "“Charge Port (Driver side) — AC/DC Combo Port — J1772 / CCS”, identical on the MY2025 and MY2026 sheets", SPECS_26),
    superchargerAccess: f<"adapter">("adapter", "mfr", "high", "Audi's NACS release lists “e-tron GT (MY2022 - MY2026)” as compatible with the Audi NACS-to-CCS DC adapter; DC only, not Tesla Destination or other AC chargers", PR_NACS),
    dcFastCharging: f<"standard">("standard", "mfr", "high", undefined, SPECS_26),
    dcPeakKw: f(320, "mfr", "high", "“Max Charging Capacity AC / DC — up to 9.6 kW / 320 kW”; release 623: “increased, from 270 kW to 320 kW”", SPECS_26),
    acOnboardKw: f(9.6, "mfr", "high", "Level 2 at 9.6 kW (240V, 40A) fills the pack in 12 hours on Audi's figures", SPECS_26),
    chargeTime1080Min: f(18, "mfr", "high", "“DC Fast Charging (320 kW) — 18 minutes (10% - 80% charge)”, on a 320 kW or higher charger under Audi's ideal conditions", SPECS_26),
    architectureV: f(800, "mfr", "high", "“Battery Type — 800V Lithium Ion”", SPECS_26),
  };
  const warranty = {
    batteryYears: f(8, "mfr", "high", "“The high-voltage battery is warranted for 8 years or 100,000 miles, whichever occurs first, for defects in material and workmanship and for a capacity of at least 70%”", SPECS_26),
    batteryMiles: f(100_000, "mfr", "high", "Same footnote of Audi's MY2026 sheet; the MY2025 sheet's warranty table reads the same", SPECS_25),
    sohFloorPct: f(70, "mfr", "high", "“a capacity of at least 70%”", SPECS_26),
  };

  const base = {
    make: "AUDI",
    modelYears: [2025, 2026] as [number, number],
    drive: "AWD" as const,
    battery,
    charging,
    warranty,
    abstains: { heatPump: GT_HEATPUMP_ABSTAIN },
  };

  R.push(
    {
      ...base,
      id: "s-etron-gt-2025-26",
      model: "S e-tron GT",
      modelAliases: ["e-tron GT"],
      vds: ["G9BFW", "H9BFW"],
      range: {
        epaRangeMi: f(300, "mfr", "high", "Audi's standard 20-inch wheel — “2026 Audi S e-tron GT EPA estimated range is 300 miles when equipped with 20-inch wheels”; the optional 21-inch fitment rates 294 (ids 48689, 50186). MY2025 id 48688 and MY2026 id 50185 rate identically", epa(50185)),
        epaKwhPer100Mi: f(38, "mfr", "high", "20-inch wheels; EPA prints 38 kWh/100 mi (combE 37.65) on both the MY2025 and MY2026 pages", epa(50185)),
      },
    },
    {
      ...base,
      id: "rs-etron-gt-performance-2025-26",
      model: "RS e-tron GT performance",
      modelAliases: ["RS e-tron GT", "e-tron GT"],
      vds: ["J8BFW"],
      range: {
        epaRangeMi: f(278, "mfr", "high", "“2026 Audi RS e-tron GT performance EPA estimated range is 278 miles when equipped with 20-inch wheels” — the only rating EPA published in either year (ids 48993, 50184). The 20-inch wheel is standard for MY2025 and the MY2026 car's standard wheel is 21-inch, which Audi did not certify separately", epa(50184)),
        epaKwhPer100Mi: f(40, "mfr", "high", "20-inch wheels", epa(50184)),
      },
    }
  );
}

// ── Volkswagen e-Golf, MY2015–2019 ───────────────────────────────────────
{
  const SPECS_15 = "https://media.vw.com/assets/documents/original/6313-75843375354eb40dd8a387.pdf";
  const REL_15 = "https://media.vw.com/assets/documents/original/7296-20155+eGolf+Release.pdf";
  const SPECS_16 = "https://media.vw.com/assets/documents/original/6355-54576941755ef2e1318cb8.pdf";
  const REL_16 = "https://media.vw.com/assets/documents/original/7258-2016+eGolf+Release.pdf";
  const SPECS_17 = "https://media.vw.com/assets/documents/original/6456-18417786758fdfc77c7df6.pdf";
  const REL_17 = "https://media.vw.com/assets/documents/original/8450-2017eGolfrelease.pdf";
  const SPECS_18 = "https://media.vw.com/assets/documents/original/8949-2018eGolftechspecs.pdf";
  const REL_18 = "https://media.vw.com/assets/documents/original/8952-2018eGolfRelease.pdf";
  const PRICE_18 = "https://media.vw.com/assets/documents/original/8947-2018eGolfpricingFINAL.pdf";
  const REL_19 = "https://media.vw.com/assets/documents/original/9219-2019eGolfRelease.pdf";
  const SPECS_19 = "https://media.vw.com/assets/documents/original/9221-2019eGolfTechnicalSpecifications.pdf";

  const PACK_24 = (url: string) => ({
    packGrossKwh: f(24.2, "mfr", "high", "VW's technical specifications, “Capacity — 24.2 kWh” at 323 V; VW prints one figure and never says gross or usable", url),
  });
  const PACK_36 = (url: string) => ({
    packGrossKwh: f(35.8, "mfr", "high", "VW's technical specifications, “Capacity — 35.8 kWh” at 323 V; VW prints one figure and never says gross or usable", url),
  });

  // CCS fitted as standard equipment.
  const CCS_STD = (url: string, quote: string, acKw: number, to80: number) => ({
    portStandard: f<PortStandard>("CCS1", "mfr", "high", quote, url),
    dcFastCharging: f<"standard">("standard", "mfr", "high", quote, url),
    dcPeakKw: f(50, "mfr", "high", "VW: the SAE DC fast charging infrastructure delivers “direct power at up to 50 kW”", url),
    acOnboardKw: f(acKw, "mfr", "high", `${acKw} kW onboard charger, standard`, url),
    chargeTimeTo80Min: f(to80, "mfr", "high", "VW states a time to 80% without naming a starting state of charge, on a 50 kW DC station", url),
  });
  // CCS only on cars ordered with the package — the Bolt EV shape.
  const CCS_OPT = (url: string, quote: string, acKw: number, acNote: string, to80: number) => ({
    portStandard: f<PortStandard>("CCS1", "mfr", "high", `Only on cars ordered with the DC Fast Charging package; without it the inlet is AC J1772 only. ${quote}`, url),
    dcFastCharging: f<"optional">("optional", "mfr", "high", quote, url),
    dcPeakKw: f(50, "mfr", "high", "When fitted: VW says the DC infrastructure delivers “direct power at up to 50 kW”", url),
    acOnboardKw: f(acKw, "mfr", "high", acNote, url),
    chargeTimeTo80Min: f(to80, "mfr", "high", "When fitted; VW states a time to 80% without naming a starting state of charge", url),
  });

  const W_70 = (url: string) => ({
    batteryYears: f(8, "mfr", "high", "VW: “The battery has a limited warranty that covers eight years or 100,000 miles … against 70 percent capacity”", url),
    batteryMiles: f(100_000, "mfr", "high", "Same sentence of VW's release", url),
    sohFloorPct: f(70, "mfr", "high", "“against 70 percent capacity”", url),
  });
  const W_PLAIN = (url: string) => ({
    batteryYears: f(8, "mfr", "high", "VW: “The battery has a limited warranty that covers eight years or 100,000 miles (whichever occurs first).” This year's release drops the 70-percent clause the 2015 and 2016 releases carry, so the row does not state a capacity floor", url),
    batteryMiles: f(100_000, "mfr", "high", "Same sentence of VW's release", url),
  });

  const HP_NONE = (url: string, quote: string) => ({ heatPump: f<"none">("none", "mfr", "high", quote, url) });
  const HP_STD = (url: string, quote: string) => ({ heatPump: f<"standard">("standard", "mfr", "high", quote, url) });

  const R83 = (id: number, url: string) => ({
    epaRangeMi: f(83, "mfr", "high", "VW's own specifications print the same figure: “Range — 83 miles”, EPA-estimated", url),
    epaKwhPer100Mi: f(29, "mfr", "high", "116 MPGe combined on VW's sheet and EPA's", epa(id)),
  });
  const R125 = (id: number, url: string) => ({
    epaRangeMi: f(125, "mfr", "high", "VW's own specifications print the same figure: “Range — 125 miles”, EPA-estimated", url),
    epaKwhPer100Mi: f(28, "mfr", "high", "119 MPGe combined on VW's sheet and EPA's", epa(id)),
  });

  const vw = { make: "VOLKSWAGEN", model: "e-Golf", drive: "FWD" as const };

  const HP_2015 = "VW: “a newly developed heat pump system that is fitted to the SEL Premium model”; the Limited Edition's own standard-equipment list does not carry one";
  const HP_2016 = "VW: “a newly developed heat pump system that is fitted in the SEL Premium model”";
  const HP_1718 = "VW: “a heat pump system that is fitted in the SEL Premium model”; VW's 2018 pricing sheet reads “Energy-efficient auxilliary climate control heat pump — SE: -, SEL Premium: S”";
  const HP_2019 = "VW: “a heat pump system that is fitted in the SEL Premium model”";

  R.push(
    {
      ...vw,
      id: "egolf-2015-limited-edition",
      modelYears: [2015, 2015],
      vds: ["KP"],
      battery: PACK_24(SPECS_15),
      range: R83(35849, SPECS_15),
      charging: CCS_STD(REL_15, "VW: “The e-Golf comes equipped with a standard Combined Charging System (CCS)”, and the Limited Edition's standard-equipment list carries “DC fast charging (SAE Combined Charging System)”", 7.2, 30),
      thermal: HP_NONE(REL_15, HP_2015),
      warranty: W_70(REL_15),
    },
    {
      ...vw,
      id: "egolf-2015-16-sel-premium",
      modelYears: [2015, 2016],
      vds: ["PP"],
      battery: PACK_24(SPECS_16),
      range: R83(36834, SPECS_16),
      charging: CCS_STD(REL_16, "VW: “The e-Golf SEL Premium ... comes equipped with a standard Combined Charging System (CCS)”; the 2015 release says the same of that year's car", 7.2, 30),
      thermal: HP_STD(REL_16, HP_2016),
      warranty: W_70(REL_16),
    },
    {
      ...vw,
      id: "egolf-2016-se",
      modelYears: [2016, 2016],
      vds: ["KP"],
      battery: PACK_24(SPECS_16),
      range: R83(36834, SPECS_16),
      charging: CCS_OPT(
        REL_16,
        "VW: “The e-Golf SE comes equipped with a 3.6 kW onboard charger, but can be upgraded to the 7.2 kW onboard charger with the DC Fast Charging Package ($1,675)”",
        3.6,
        "3.6 kW standard; the $1,675 DC Fast Charging Package raises it to 7.2 kW",
        30
      ),
      thermal: HP_NONE(REL_16, HP_2016),
      warranty: W_70(REL_16),
    },
    {
      ...vw,
      id: "egolf-2017-18-se",
      modelYears: [2017, 2018],
      vds: ["KR"],
      battery: PACK_36(SPECS_17),
      range: R125(38549, SPECS_17),
      charging: CCS_OPT(
        REL_18,
        "VW: “When equipped with DC Fast Charging (optional on SE, standard on SEL Premium)”; the 2018 pricing sheet marks the CCS receptacle “P” (package) on the SE, a $995 option, and the 2017 release words it identically",
        7.2,
        "“All 2018 e-Golf models have a 7.2 kW onboard charger as standard equipment”; the 2017 release says the same",
        60
      ),
      thermal: HP_NONE(PRICE_18, HP_1718),
      warranty: W_PLAIN(REL_18),
    },
    {
      ...vw,
      id: "egolf-2017-18-sel-premium",
      modelYears: [2017, 2018],
      vds: ["PR"],
      battery: PACK_36(SPECS_18),
      range: R125(39871, SPECS_18),
      charging: CCS_STD(REL_18, "VW: “The e-Golf SEL Premium models come equipped with a standard Combined Charging System (CCS)”; the 2018 pricing sheet marks the CCS receptacle “S” on this trim", 7.2, 60),
      thermal: HP_STD(PRICE_18, HP_1718),
      warranty: W_PLAIN(REL_18),
    },
    {
      ...vw,
      id: "egolf-2018-sel",
      modelYears: [2018, 2018],
      vds: ["MR"],
      battery: PACK_36(SPECS_18),
      range: R125(39871, SPECS_18),
      charging: {
        acOnboardKw: f(7.2, "mfr", "high", "“All 2018 e-Golf models have a 7.2 kW onboard charger as standard equipment”", REL_18),
      },
      warranty: W_PLAIN(REL_18),
      abstains: {
        heatPump:
          "Volkswagen filed a third MY2018 pattern that vPIC decodes as Trim SEL, but VW's own MY2018 US material describes only the SE and the SEL Premium — the pricing sheet has two columns and the release prices two trims — so the heat pump, which VW fits to the SEL Premium alone, is unstated for this trim",
        portStandard:
          "The same gap: VW's MY2018 pricing sheet gives the CCS receptacle as standard on the SEL Premium and a package on the SE, and says nothing at all about an SEL, so whether this trim's inlet carries DC pins is not something Volkswagen published",
      },
    },
    {
      ...vw,
      id: "egolf-2019-se",
      modelYears: [2019, 2019],
      vds: ["KR"],
      battery: PACK_36(SPECS_19),
      range: R125(40769, SPECS_19),
      charging: CCS_STD(REL_19, "VW: “New for the SE trim is a standard DC Fast Charger” and “All e-Golf models come equipped with a standard Combined Charging System (CCS)”", 7.2, 60),
      thermal: HP_NONE(REL_19, HP_2019),
      warranty: W_PLAIN(REL_19),
    },
    {
      ...vw,
      id: "egolf-2019-sel-premium",
      modelYears: [2019, 2019],
      vds: ["PR"],
      battery: PACK_36(SPECS_19),
      range: R125(40769, SPECS_19),
      charging: CCS_STD(REL_19, "VW: “All e-Golf models come equipped with a standard Combined Charging System (CCS)”", 7.2, 60),
      thermal: HP_STD(REL_19, HP_2019),
      warranty: W_PLAIN(REL_19),
    }
  );
}

export const RESEARCH_ROWS_19: EnrichmentRow[] = R;
