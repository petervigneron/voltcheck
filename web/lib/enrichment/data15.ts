import type { EnrichmentRow, Fact, PortStandard, Source } from "../types";

// Fifteenth research tranche (2026-09-10): the four Mercedes nameplates the
// live-enrichment-gap audit found with no row at all, every one of them a
// name a PETROL car also wears.
//
//   "G-Class"          204 live (2025: 63, 2026: 16, 2027: 125)
//   "SL"                46 live (2024: 3, 2025: 17, 2026: 26)
//   "Mercedes-AMG GT"   45 live (2024: 9, 2025: 3, 2026: 32, 2027: 1)
//   "C-Class"           34 live (2016-18: 7, 2024-26: 27)
//
// Not one of those model strings names an electrified car on its own — there
// is a petrol G 550 and AMG G 63, an SL 43 and SL 55, an AMG GT 43/55/63, a
// C 300 and an AMG C 43. So every row here is keyed on the VEHICLE
// DESCRIPTOR, VIN positions 4-8, the way data11.ts's S-Class rows are, and
// none of them carries a trim list. `vds` is a hard prefix filter: a row keyed
// to descriptors can never match a VIN outside them, which is what makes a
// bare-nameplate `model` safe here and on the /vin/ page.
//
// ── THE DESCRIPTOR TABLE, SWEPT AGAINST vPIC ON 2026-09-10 ─────────────────
// vPIC decodes a 7-character partial VIN, so position 7 could be swept
// exhaustively (A-Z0-9) for each family. Every sweep separates the plug-in
// from its petrol siblings on that one character:
//
//   W1KVK8·   A = AMG SL55 (gasoline)      B = AMG SL63 (gasoline)
//             C = AMG SL63 Se  ← PHEV, this file
//   W1KRJ8·   A = AMG GT55 (gasoline)      J = AMG GT63 Pro (gasoline)
//             C = AMG GT63 Se  ← PHEV, the two-door C192 coupe
//   W1KAF8·   H = AMG C43 (gasoline)
//             A = AMG C63 Se   ← PHEV
//   55SWF4·   J = C300, K = C300-4M (both gasoline)
//             H = 350e         ← PHEV
//   W1K7X7·   K = "AMG GT63 Se / AMG GT63 S E Performance 4-M+ Bi-Turbo"
//             ← the four-door X290; no other position 7 exists for MY2024
//   W1NWM0·   A = G580e/G580 (MY2025, MY2026)   B = G580 (MY2027)
//             ← every member of the family is ElectrificationLevel
//               "BEV (Battery Electric Vehicle)", FuelTypePrimary "Electric"
//
// THE G-CLASS CONTROL IS THE ONE WITH A LIMIT, AND IT IS WORTH STATING RATHER
// THAN GLOSSING. vPIC needs seven concrete VIN characters before it returns a
// Model, so the petrol G's own descriptor could not be enumerated — the
// unknown span is positions 4-7 and that is 36^4 requests. What was tested
// instead: the whole W1NWM0 family, every model year, decodes to a
// battery-electric G-Class and nothing else (MY2025 answers only at position
// 7 = A, MY2027 only at B, and MY2025 returns nothing for B — the filing is
// year-scoped, so it is specific rather than a catch-all). MBUSA's own
// vehicle data gives the G 580 with EQ Technology baumuster 465600 against
// the G 550's 465210 and the AMG G 63's 465250, three different model codes.
// And 215 real G VINs in scraper/registry/vpic-cache.json are all W1NWM0AB or
// W1NWM0BB. A petrol G would have to share five VIN characters with a
// different baumuster to reach these rows.
//
// ── EPA'S "ELEC + GAS" IS NOT THE ELECTRIC RANGE, AND ON THESE CARS THE
//    DIFFERENCE IS TEN MILES ─────────────────────────────────────────────
// Every plug-in in this file is `phevBlended: true` in fueleconomy.gov's
// record, and for a blended plug-in the API's `rangeA` is the CHARGE-
// DEPLETING range on electricity AND gasoline together, not the all-electric
// range. EPA's own comparison page prints both, side by side, and they do not
// agree:
//
//   AMG SL63 S E Performance   (id 49017)  "11 miles Elec + Gas"  "All Elec: 0-1 mi"
//   AMG GT63 S E Performance   (id 49161)  "10 miles Elec + Gas"  "All Elec: 0-1 mi"
//   AMG GT63 S E Perf. (coupe) (id 49016)  "11 miles Elec + Gas"  "All Elec: 0-1 mi"
//   AMG C63 S E Performance    (id 49018)   "1 miles Elec + Gas"  "All Elec: 0-1 mi"
//   C350e MY2016               (id 38499)  "11 miles Elec + Gas"  "All Elec: 0-10 mi"
//   C350e MY2017 / MY2018      (38969/39853) "9 miles Elec + Gas" "All Elec: 0-8 mi"
//
// `range.epaRangeMi` renders on the card under the label "EPA electric
// range". Putting 11 there for a car EPA says goes at most one mile on the
// battery is the false-bargain direction, so this file publishes the
// ALL-ELECTRIC figure and records EPA's other number in the Fact's note.
//
// Mercedes settles it in its own words, twice. The 2026 SL 63 S E PERFORMANCE
// Quick Reference Guide prints "Electric range 1 mi (EPA)" for the same car
// whose `rangeA` is 11. The 2018 C350e Sedan Specifications release prints
// "All-electric range (mi) 0 - 8" for the car whose `rangeA` is 9. Both times
// the maker publishes the all-electric number, not the blended one.
//
// This DIVERGES from data11.ts, which carries the S 580e's `rangeA` of 56 as
// "Electric-only EPA range" where EPA's page for that car reads "56 miles
// Elec + Gas / All Elec: 0-46 mi". That row is not touched here — it is
// another tranche's — but the ten-mile gap is the same gap and it is flagged
// in docs/agents/research-mercedes-g580-sl-gt-2026-09-10.md.
//
// ── ONE ROW PER MODEL YEAR, BECAUSE EPA FILED IN HOLES ────────────────────
// EPA rated the G 580 in 2025 and 2026 and not 2027; the SL 63 S E, both
// AMG GT 63 S E bodies and the AMG C 63 S E in 2025 ONLY, with nothing for
// 2024, 2026 or 2027. Rather than carry one year's rating across a gap, each
// model year gets its own row citing its own fueleconomy.gov id, and the
// years EPA never filed abstain on `epaRangeMi` — the shape data11.ts's
// s580e-2024 and s580e-2026 rows established. The pack, charging and warranty
// facts are per-year Mercedes documents in every case, so only range moves.
//
// ── HEAT PUMP: EVERY ROW ABSTAINS, AND THE NEGATIVE IS CONTROLLED ─────────
// Eleven Mercedes documents were read this pass — two G 580 Quick Reference
// Guides, the G 580 press kit, MBUSA's G 580 model and build pages, four AMG
// Quick Reference Guides, the AMG C 63 S E launch release and the 2018 C350e
// specifications release. None of them contains the words "heat pump". The
// control that makes that silence readable rather than decisive: MBUSA's own
// model pages DO name one where it exists — the 2027 CLA 250+ page carries an
// option entry "Innovative heat pump", standard, with the text "An air-to-air
// heat pump can capture waste heat from the battery and electric drivetrain",
// and the 2027 EQS 450+ page carries the same entry. So MBUSA says it when it
// is true. What it does not do is say the opposite, and a yes/no fact is
// never estimated here.
//
// ── WHAT IS DELIBERATELY NOT CLAIMED ──────────────────────────────────────
// MY2027 G 580. 125 live cars, the largest single slice in this file, and
// Mercedes has published nothing about them in the United States. Tested, not
// assumed: mbusa.com/content/mb-vehicles-data/en_us/models/2027/g/g580w4e.html
// returns 404 while the 2026 G 580 and the 2027 AMG G 63 at the same paths
// return 200, so the absence is MBUSA's, not a bad URL. fueleconomy.gov's
// 2027 Mercedes-Benz menu carries no G 580. And the VIN descriptor CHANGED
// for this model year, W1NWM0AB to W1NWM0BB, with vPIC's BatteryKWh field
// going empty where MY2025 filed 122 and MY2026 filed 116-122 — which is
// exactly the signal that says the 116 kWh pack and the CCS1 inlet cannot be
// carried forward on faith. That row publishes the MY2027 warranty booklet's
// term and abstains on everything else.

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

// Mercedes-Benz USA warranty booklets, one per model year, fetched and read
// 2026-09-10. MD5s are in the research note.
const MB_EQ_WARRANTY = {
  2025: "https://www.mbusa.com/content/dam/mb-nafta/us/owners/manuals/2025/MY25%20EQ%20Warranty%20and%20Service%20Booklet_Web%20Eng_SpFinal.pdf",
  2026: "https://www.mbusa.com/content/dam/mb-nafta/us/owners/manuals/2026/MY26%20EQ%20Warranty%20and%20Service%20Booklet_Web%20Eng_Sp.pdf",
  2027: "https://www.mbusa.com/content/dam/mb-nafta/us/my27-content-request/MY27_EQ_Warranty_and_Service_Booklet_Web_Eng_Sp_DRAFT.pdf",
} as const;

const MB_PC_WARRANTY = {
  2024: "https://www.mbusa.com/content/dam/mb-nafta/us/owners/manuals/2024/2024-warranty-booklet.pdf",
  2025: "https://www.mbusa.com/content/dam/mb-nafta/us/owners/manuals/2025/MY25%20PC%20Warranty%20and%20Service%20Booklet_Web%20Eng_Sp.pdf",
  2026: "https://www.mbusa.com/content/dam/mb-nafta/us/owners/manuals/2026/MY26%20PC%20Warranty%20and%20Service%20Booklet_Web%20Eng_Sp.pdf",
  2027: "https://www.mbusa.com/content/dam/mb-nafta/us/my27-content-request/PCwarrantymanualusa.pdf",
} as const;

// The silence that every row in this file shares. Worded from what was
// actually read, plus the control that shows MBUSA does say it elsewhere.
const HEAT_PUMP_ABSTAIN =
  "None of the eleven Mercedes documents read for this car names a heat pump, and the positive control shows MBUSA does name one where it exists — its 2027 CLA 250+ and EQS 450+ model pages both carry a standard option entry called “Innovative heat pump” — so this silence is an absence of evidence rather than a statement that the car has none";

// ───────────────── MERCEDES-BENZ G 580 WITH EQ TECHNOLOGY ──────────────────
//
// The feed calls all 204 of them "G-Class" or "G-CLASS", with six more under
// "G 580e" and four under "G 580"; 129 of them carry no trim string at all.
// vPIC's model string is "G-Class" too, so the nameplate has to be the row's
// model and the descriptor has to be the guard.
{
  const G_QRG_25 =
    "https://web.archive.org/web/20260910194026/https://media.mbusa.com/releases/release-13ade706e08532ed28da51676b062f47-2025-mercedes-benz-g-580-with-eq-technology-quick-reference-guide";
  // The model page loads its spec block from the vehicle-data path; only the
  // latter contains the quoted strings (refuter, 2026-09-10).
  const G_MODEL_26 = "https://www.mbusa.com/content/mb-vehicles-data/en_us/models/2026/g/g580w4e.html";
  const G_DATA_25 = "https://www.mbusa.com/content/mb-vehicles-data/en_us/models/2025/g/g580w4e.html";
  const G_BUILD_26 = "https://www.mbusa.com/en/vehicles/build/g-class/suv/g580w4e";
  const MB_CHARGE = "https://www.mbusa.com/en/charge";

  const G_MODEL = {
    make: "MERCEDES-BENZ",
    model: "G-Class",
    modelAliases: ["G 580", "G 580e", "G 580 with EQ Technology", "G-Class SUV", "G-Class G 580E"],
    drive: "AWD" as const,
    packVariant: "G 580 with EQ Technology",
  };

  const G_WARRANTY_2025_ABSTAIN =
    "Mercedes publishes no battery term that names this car: the MY2025 EQ Warranty and Service Booklet gives 8 years/100,000 miles for the EQB and 10 years/155,000 for the EQE and EQS and never mentions the G 580 anywhere in its 134 pages, and the MY2025 passenger-car booklet covers only the petrol G 550 and AMG G 63 — the MY2026 booklet is the first to name G580, and a term added in 2026 must not be read backwards onto a 2025 car";

  R.push({
    id: "g580-2025",
    vinRequired: true, // a combustion car wears this name; the VIN keys keep it out (types.ts)
    ...G_MODEL,
    modelYears: [2025, 2025],
    vds: ["WM0AB"],
    abstains: { heatPump: HEAT_PUMP_ABSTAIN, batteryWarranty: G_WARRANTY_2025_ABSTAIN },
    battery: {
      packUsableKwh: f(
        116,
        "mfr",
        "high",
        "MBUSA's own MY2025 Quick Reference Guide: “Battery capacity 116 kWh (usable)”",
        G_QRG_25
      ),
    },
    range: {
      epaRangeMi: f(239, "mfr", "high", "MBUSA states the same figure: “Electric range 239 miles (EPA)”", epa(48717)),
      epaKwhPer100Mi: f(54, "mfr", "high", undefined, epa(48717)),
    },
    charging: {
      portStandard: f<PortStandard>(
        "CCS1",
        "mfr",
        "high",
        "MBUSA's MY2025 vehicle-data page: “DC charging connector type Combined Charging System (CCS)”, “AC charging connector type J1772”",
        G_DATA_25
      ),
      superchargerAccess: f(
        "adapter" as const,
        "mfr",
        "medium",
        "Mercedes sells the adapter rather than fitting the plug: “Adapter is for DC charging only at stations that use the NACS connector, including Tesla Superchargers. Do not use for AC charging.”",
        G_BUILD_26
      ),
      dcFastCharging: f("standard" as const, "mfr", "high", undefined, G_QRG_25),
      dcPeakKw: f(200, "mfr", "high", "“Charging capacity DC: 200 kW”", G_QRG_25),
      chargeTime1080Min: f(32, "mfr", "high", "“Charging time DC: 32 minutes (10-80% SOC)”", G_QRG_25),
      acOnboardKw: f(9.6, "mfr", "high", "13.6 hours from 0-100% on AC", G_QRG_25),
    },
  });

  R.push({
    id: "g580-2026",
    vinRequired: true, // a combustion car wears this name; the VIN keys keep it out (types.ts)
    ...G_MODEL,
    modelYears: [2026, 2026],
    vds: ["WM0AB"],
    abstains: { heatPump: HEAT_PUMP_ABSTAIN },
    battery: {
      packUsableKwh: f(
        116,
        "mfr",
        "high",
        "MBUSA's MY2026 model page reads “Battery capacity 116 kWh”; the press kit for the car states it as “116-kWh usable capacity”. vPIC's MY2026 pattern files the pair, BatteryKWh 116 to BatteryKWh_to 122",
        G_MODEL_26
      ),
    },
    range: {
      epaRangeMi: f(239, "mfr", "high", "MBUSA prints the same figure: “EPA-estimated electric range 239 miles”", epa(49687)),
      epaKwhPer100Mi: f(54, "mfr", "high", undefined, epa(49687)),
    },
    charging: {
      portStandard: f<PortStandard>(
        "CCS1",
        "mfr",
        "high",
        "MBUSA's MY2026 specification block: “DC charging connector type Combined Charging System (CCS)”, and “AC charging connector type J1772”",
        G_MODEL_26
      ),
      superchargerAccess: f(
        "adapter" as const,
        "mfr",
        "high",
        "“Adapter is for DC charging only at stations that use the NACS connector, including Tesla Superchargers. Do not use for AC charging.” — a dealer accessory on this car's own build page",
        G_BUILD_26
      ),
      dcFastCharging: f("standard" as const, "mfr", "high", undefined, G_MODEL_26),
      dcPeakKw: f(200, "mfr", "high", "“DC charging speed 200 kW”", G_MODEL_26),
      chargeTime1080Min: f(32, "mfr", "high", "“DC charging time (10-80%) 32 minutes”", G_MODEL_26),
      acOnboardKw: f(9.6, "mfr", "high", "“AC charging speed 9.6 kW”, 13.6 hours 0-100%", G_MODEL_26),
    },
    warranty: {
      batteryYears: f(
        8,
        "mfr",
        "high",
        "“8 years/100,000 miles (whichever occurs first) for EQB, CLA250, CLA350 and G580”",
        MB_EQ_WARRANTY[2026]
      ),
      batteryMiles: f(100_000, "mfr", "high", undefined, MB_EQ_WARRANTY[2026]),
      batteryTransfers: f(true, "mfr", "high", "MBUSA “warrants the certified lithium-ion battery … to the original and each subsequent owner”", MB_EQ_WARRANTY[2026]),
    },
  });

  R.push({
    id: "g580-2027",
    vinRequired: true, // a combustion car wears this name; the VIN keys keep it out (types.ts)
    ...G_MODEL,
    modelYears: [2027, 2027],
    vds: ["WM0BB"],
    abstains: {
      heatPump: HEAT_PUMP_ABSTAIN,
      packUsableKwh:
        "Mercedes has published nothing about the MY2027 G 580 in the United States and this model year filed a NEW VIN descriptor, W1NWM0BB against MY2025-26's W1NWM0AB, with vPIC's BatteryKWh going empty where MY2025 filed 122 and MY2026 filed 116 to 122 — a changed filing is the one circumstance in which the old pack figure must not be carried forward",
      epaRangeMi:
        "fueleconomy.gov's MY2027 Mercedes-Benz menu contains no G 580 of any kind, and MBUSA has published no manufacturer figure to stand in its place — its own vehicle-data path for a 2027 G 580 returns 404 while the 2026 G 580 and the 2027 AMG G 63 both return 200",
      portStandard:
        "The charge inlet is the fact this project gets wrong most often when it is carried across a model-year boundary, and MY2027 changed the VIN descriptor with no Mercedes document to say what else changed; MBUSA's charging page names only the CLA as having the NACS inlet but does not enumerate the rest of the range",
    },
    warranty: {
      batteryYears: f(
        8,
        "mfr",
        "medium",
        "MBUSA's MY2027 EQ Warranty and Service Booklet, whose quick-reference page reads “8 Years/100,000 Miles (EQB, CLA250, CLA350, G580)”. Medium because the file MBUSA publishes is marked DRAFT",
        MB_EQ_WARRANTY[2027]
      ),
      batteryMiles: f(100_000, "mfr", "medium", "From the same MY2027 draft booklet", MB_EQ_WARRANTY[2027]),
    },
    buyerNotes: [
      {
        headline: "Mercedes has published no US specification for the 2027 G 580, and its VIN filing changed",
        body:
          "The MY2027 electric G-Class is on dealer lots — 125 of them the day this was written, at $172,000 to $180,000 — while MBUSA's own site still shows the G 580 with EQ Technology as a 2026 model and its vehicle-data path for a 2027 G 580 returns 404. EPA has filed no MY2027 record either. Mercedes also filed a new vehicle descriptor for this model year, W1NWM0BB where 2025 and 2026 cars read W1NWM0AB, and vPIC's battery-capacity field for the new pattern is empty where the old one carried 122 kWh (2025) and 116-122 kWh (2026). The 2026 car's 116 kWh usable pack, 239-mile EPA rating and CCS1 inlet are therefore not printed here: a changed filing with no document behind it is exactly when carrying last year's numbers forward stops being a carry-over and starts being a guess.",
        severity: "info",
        learnMore: G_MODEL_26,
      },
    ],
  });
}

// ───────────── MERCEDES-AMG E PERFORMANCE PLUG-IN HYBRIDS ──────────────────
//
// Four cars, one powertrain family, and a feed that says almost nothing about
// any of them: of the 118 live SL, Mercedes-AMG GT and C-Class listings these
// rows answer for, EVERY ONE has an empty trim field. The VIN is the only
// thing that identifies them.
//
// The AMG high-performance battery is 6.1 kWh gross and 4.8 kWh usable, and
// each Quick Reference Guide states it for its own car in those words —
// "Battery capacity 6.1 kWh (4.8 kWh usable)" appears in the 2024 and 2026 SL
// guides, the 2025 GT 63 S E Performance guide and the 2025 GT 63 S E
// Performance 4-Door Coupe guide. The C 63 S E Performance is the exception
// and is treated as one: MBUSA states "6.1-kWh ultra-lightweight
// high-performance battery" and the launch release "a capacity of 6.1 kWh",
// but neither publishes a usable figure for that car, so its rows carry only
// the gross number rather than borrowing the AMG siblings' 4.8.
//
// None of these cars can DC fast charge. MBUSA's specification blocks list an
// AC charging speed, an AC charging time and an AC connector type and no DC
// row at all, and the C 63 launch release says the charging in a sentence:
// "Charging takes place via the installed … on-board charger with alternating
// current at a charging station, wallbox or household outlet."
{
  const SL_QRG_24 =
    "https://web.archive.org/web/20260910194328/https://media.mbusa.com/releases/release-1d2ba082ef32b72d00f8f4d0181074fc-2024-mercedes-amg-sl-63-s-e-performance-quick-reference-guide";
  const SL_QRG_26 =
    "https://web.archive.org/web/20260910193610/https://media.mbusa.com/releases/release-0aacd0cfec6ffa3ea5c65bd4c210e359-2026-mercedes-amg-sl-63-s-e-performance-quick-reference-guide";
  const GT4D_QRG_25 =
    "https://web.archive.org/web/20251206201231/https://media.mbusa.com/releases/release-7fa8a8ec6fed8413f2bac1ecef0a2881-2025-mercedes-amg-gt-63-s-e-performance-4-door-coupe-quick-reference-guide";
  const GT4D_MODEL_26 = "https://www.mbusa.com/en/vehicles/model/gt/amg-gt-4-door/gt63c4se";
  const GT2D_QRG_25 =
    "https://web.archive.org/web/20260910194457/https://media.mbusa.com/releases/release-cf381cd2fcff624ae37d39116317bd3b-2025-mercedes-amg-gt-63-s-e-performance-quick-reference-guide";
  const GT2D_MODEL_27 = "https://www.mbusa.com/en/vehicles/model/gt/amg-gt-2-door/amggt63e";
  const C63_RELEASE =
    "https://web.archive.org/web/20220921150449/https://media.mbusa.com/releases/release-2f4468bf3e26c13ea97feb134903da22-the-new-mercedes-amg-c-63-s-e-performance-the-dawn-of-a-new-era";
  const C63_MODEL_26 = "https://www.mbusa.com/en/vehicles/model/c-class/sedan/c63w4se";
  // The 2024 AMG C 63 S E Quick Reference Guide (media.mbusa.com answers curl
  // with an empty 202; the refuter captured it via Save Page Now 2026-09-10).
  const C63_QRG_24 =
    "https://web.archive.org/web/20260910202009/https://media.mbusa.com/releases/release-1d2ba082ef32b72d00f8f4d0180028da-2024-mercedes-amg-c-63-s-e-performance-quick-reference-guide";

  const PHEV_WARRANTY = (year: keyof typeof MB_PC_WARRANTY) => {
    const src = MB_PC_WARRANTY[year];
    return {
      batteryYears: f(
        6,
        "mfr",
        "high",
        year === 2024
          ? "“HIGH VOLTAGE BATTERY LIMITED WARRANTY Plug-in Hybrid Electric — 6 Years/62,000 Miles”. Cars first sold in California and ten other states (CO, CT, MA, MD, ME, NJ, NY, OR, RI, VT) get 10 years/150,000 miles instead"
          : "“HIGH VOLTAGE BATTERY LIMITED WARRANTY Plug-in Hybrid Electric — 6 Years/62,000 Miles”. Cars first sold in California and fourteen other states get 10 years/150,000 miles instead",
        src
      ),
      batteryMiles: f(62_000, "mfr", "high", undefined, src),
      batteryTransfers: f(true, "mfr", "high", "Transfers to each subsequent owner", src),
    };
  };

  // EPA's page prints two numbers for a blended plug-in and they disagree; the
  // header explains at length why the all-electric one is what goes on the
  // card. Every AMG E Performance row uses this note so the other figure is
  // never lost.
  const blended = (id: number, elecPlusGas: number) =>
    `EPA's own comparison page for this car reads “All Elec: 0-1 mi”. Its other charge-depleting figure, ${elecPlusGas} miles, is labelled “Elec + Gas” and is not an electric-only range — fueleconomy.gov marks this car phevBlended`;

  const NO_EPA_YEAR = (menuYear: number) =>
    `fueleconomy.gov filed a record for this car in MY2025 only; its MY${menuYear} Mercedes-Benz menu does not list it at all, and no Mercedes document publishes a US electric-range figure for the MY${menuYear} car, so the MY2025 rating is not carried across the gap`;

  const NO_SOH_NOTE = {
    headline: "The battery warranty is 6 years / 62,000 miles with no capacity floor — shorter than any all-electric Mercedes",
    body:
      "Mercedes' EQ warranty booklet does not cover plug-in hybrids at all; these cars fall under the ordinary passenger-car booklet, whose High-Voltage Battery Limited Warranty runs 6 years or 62,000 miles, whichever comes first, against 8 or 10 years for the battery-electric cars. It is transferable to each subsequent owner. What it does not do is name a capacity floor, where the EQ booklet warrants a specific number of amp-hours. Cars first sold in California and fourteen other states get 10 years / 150,000 miles instead.",
    severity: "trap" as const,
    learnMore: MB_PC_WARRANTY[2026],
  };

  // ── Mercedes-AMG SL 63 S E Performance (R232), MY2024-2026 ──────────────
  {
    const SL = {
      make: "MERCEDES-BENZ",
      model: "SL-Class",
      modelAliases: ["SL", "SL Roadster", "AMG SL", "Mercedes-AMG SL"],
      drive: "AWD" as const,
      packVariant: "PHEV",
      plugIn: true,
      ignoreKwhHint: true,
    };
    const slBattery = (src: string) => ({
      packGrossKwh: f(6.1, "mfr", "high", "“Battery capacity 6.1 kWh (4.8 kWh usable)”", src),
      packUsableKwh: f(4.8, "mfr", "high", "“Battery capacity 6.1 kWh (4.8 kWh usable)”", src),
    });
    const slCharging = {
      portStandard: f<PortStandard>(
        "J1772",
        "est",
        "medium",
        "Mercedes publishes no charging specification for the SL 63 S E Performance beyond the fact that it charges on alternating current. The GT 63 S E Performance, which shares this car's powertrain, platform and 106.3-inch wheelbase, is specified “AC charging connector type J1772” on its own MBUSA model page",
        GT2D_MODEL_27
      ),
      dcFastCharging: f(
        "none" as const,
        "mfr",
        "medium",
        "No Mercedes document for any AMG E Performance model states a DC charging capability, and MBUSA's specification block for the sibling GT lists an AC connector and no DC row",
        GT2D_MODEL_27
      ),
    };

    R.push({
      id: "amg-sl63se-2024",
      vinRequired: true, // a combustion car wears this name; the VIN keys keep it out (types.ts)
      ...SL,
      modelYears: [2024, 2024],
      vds: ["VK8CB"],
      abstains: { heatPump: HEAT_PUMP_ABSTAIN, epaRangeMi: NO_EPA_YEAR(2024) },
      battery: slBattery(SL_QRG_24),
      charging: slCharging,
      warranty: PHEV_WARRANTY(2024),
      buyerNotes: [NO_SOH_NOTE],
    });

    R.push({
      id: "amg-sl63se-2025",
      vinRequired: true, // a combustion car wears this name; the VIN keys keep it out (types.ts)
      ...SL,
      modelYears: [2025, 2025],
      vds: ["VK8CB"],
      abstains: { heatPump: HEAT_PUMP_ABSTAIN },
      battery: slBattery(SL_QRG_26),
      range: {
        epaRangeMi: f(1, "mfr", "high", blended(49017, 11), epa(49017)),
        epaRangeTotalMi: f(350, "mfr", "high", undefined, epa(49017)),
        mpgeElectric: f(29, "mfr", "high", undefined, epa(49017)),
        mpgeCombined: f(21, "mfr", "high", undefined, epa(49017)),
        mpgGasoline: f(18, "mfr", "high", undefined, epa(49017)),
      },
      charging: slCharging,
      warranty: PHEV_WARRANTY(2025),
      buyerNotes: [NO_SOH_NOTE],
    });

    R.push({
      id: "amg-sl63se-2026",
      vinRequired: true, // a combustion car wears this name; the VIN keys keep it out (types.ts)
      ...SL,
      modelYears: [2026, 2026],
      vds: ["VK8CB"],
      abstains: { heatPump: HEAT_PUMP_ABSTAIN },
      battery: slBattery(SL_QRG_26),
      range: {
        // The one year in this file where Mercedes publishes the electric
        // range itself, and it prints the all-electric number rather than
        // EPA's "Elec + Gas" figure — which is the whole argument in the
        // header, made by the manufacturer.
        epaRangeMi: f(
          1,
          "mfr",
          "high",
          "MBUSA's own MY2026 Quick Reference Guide: “Electric range 1 mi (EPA)”. Its fuel-economy line, “33 / 25 / 29 MPGe (gas + electric)”, is EPA's MY2025 city/highway/combined electric figure unchanged",
          SL_QRG_26
        ),
        mpgeElectric: f(29, "mfr", "high", "MBUSA's MY2026 guide prints EPA's MY2025 set, “33 / 25 / 29 MPGe (gas + electric)”; EPA has no MY2026 record", SL_QRG_26),
      },
      charging: slCharging,
      warranty: PHEV_WARRANTY(2026),
      buyerNotes: [NO_SOH_NOTE],
    });
  }

  // ── Mercedes-AMG GT 63 S E Performance, FOUR-DOOR (X290), MY2024-2026 ───
  //
  // Two different cars wear "Mercedes-AMG GT" in this feed and the VIN is the
  // only thing that separates them: W1K7X7KB is the four-door, built at
  // Valmet in Uusikaupunki and decoded by vPIC as BodyClass "Sedan/Saloon";
  // W1KRJ8CB is the two-door C192 coupe, built at Bremen, BodyClass "Coupe".
  // They are 831 hp and 805 hp, 116.2-inch and 106.3-inch wheelbases, and EPA
  // rates them separately — 31/26 MPGe against 32/24, 340 miles of total range
  // against 360. One row could not hold both.
  {
    const GT4D = {
      make: "MERCEDES-BENZ",
      model: "AMG GT",
      modelAliases: ["Mercedes-AMG GT", "AMG GT 4-Door Coupe", "AMG GT 4 Door", "AMG GT 63", "AMG® GT 63"],
      drive: "AWD" as const,
      packVariant: "PHEV",
      plugIn: true,
      ignoreKwhHint: true,
    };
    const gt4dBattery = {
      packGrossKwh: f(6.1, "mfr", "high", "“Battery capacity 6.1 kWh (4.8 kWh usable)”", GT4D_QRG_25),
      packUsableKwh: f(4.8, "mfr", "high", "“Battery capacity 6.1 kWh (4.8 kWh usable)”", GT4D_QRG_25),
    };
    const gt4dCharging = {
      portStandard: f<PortStandard>(
        "J1772",
        "mfr",
        "high",
        "MBUSA's own specification block for this car: “AC charging connector type J1772”",
        GT4D_MODEL_26
      ),
      dcFastCharging: f(
        "none" as const,
        "mfr",
        "high",
        "MBUSA's Charging block for this car lists “AC charging speed”, “AC charging time (10-100%)” and “AC charging connector type” and no DC entry of any kind",
        GT4D_MODEL_26
      ),
    };

    R.push({
      id: "amg-gt63se-4door-2024",
      vinRequired: true, // a combustion car wears this name; the VIN keys keep it out (types.ts)
      ...GT4D,
      modelYears: [2024, 2024],
      vds: ["7X7KB"],
      abstains: { heatPump: HEAT_PUMP_ABSTAIN, epaRangeMi: NO_EPA_YEAR(2024) },
      battery: gt4dBattery,
      charging: gt4dCharging,
      warranty: PHEV_WARRANTY(2024),
      buyerNotes: [NO_SOH_NOTE],
    });

    R.push({
      id: "amg-gt63se-4door-2025",
      vinRequired: true, // a combustion car wears this name; the VIN keys keep it out (types.ts)
      ...GT4D,
      modelYears: [2025, 2025],
      vds: ["7X7KB"],
      abstains: { heatPump: HEAT_PUMP_ABSTAIN },
      battery: gt4dBattery,
      range: {
        epaRangeMi: f(1, "mfr", "high", blended(49161, 10), epa(49161)),
        epaRangeTotalMi: f(340, "mfr", "high", undefined, epa(49161)),
        mpgeElectric: f(29, "mfr", "high", undefined, epa(49161)),
        mpgeCombined: f(20, "mfr", "high", undefined, epa(49161)),
        mpgGasoline: f(18, "mfr", "high", undefined, epa(49161)),
      },
      charging: gt4dCharging,
      warranty: PHEV_WARRANTY(2025),
      buyerNotes: [NO_SOH_NOTE],
    });

    R.push({
      id: "amg-gt63se-4door-2026",
      vinRequired: true, // a combustion car wears this name; the VIN keys keep it out (types.ts)
      ...GT4D,
      modelYears: [2026, 2026],
      vds: ["7X7KB"],
      abstains: { heatPump: HEAT_PUMP_ABSTAIN, epaRangeMi: NO_EPA_YEAR(2026) },
      battery: gt4dBattery,
      charging: gt4dCharging,
      warranty: PHEV_WARRANTY(2026),
      buyerNotes: [NO_SOH_NOTE],
    });
  }

  // ── Mercedes-AMG GT 63 S E Performance, TWO-DOOR COUPE (C192), 2025-2027 ─
  {
    const GT2D = {
      make: "MERCEDES-BENZ",
      model: "AMG GT",
      modelAliases: ["Mercedes-AMG GT", "AMG GT Coupe", "AMG GT 2 Door", "AMG GT 63", "AMG® GT 63"],
      drive: "AWD" as const,
      packVariant: "PHEV",
      plugIn: true,
      ignoreKwhHint: true,
    };
    const gt2dBattery = {
      packGrossKwh: f(6.1, "mfr", "high", "“Battery capacity 6.1 kWh (4.8 kWh usable)”", GT2D_QRG_25),
      packUsableKwh: f(4.8, "mfr", "high", "“Battery capacity 6.1 kWh (4.8 kWh usable)”", GT2D_QRG_25),
    };
    const gt2dCharging = (confidence: "high" | "medium") => ({
      portStandard: f<PortStandard>(
        "J1772",
        "mfr",
        confidence,
        "MBUSA's specification block for the AMG GT 63 S E PERFORMANCE Coupe: “AC charging speed 3.7 kW … AC charging connector type J1772”",
        GT2D_MODEL_27
      ),
      dcFastCharging: f(
        "none" as const,
        "mfr",
        confidence,
        "The same Charging block lists an AC speed, an AC charging time and an AC connector and no DC entry",
        GT2D_MODEL_27
      ),
    });

    R.push({
      id: "amg-gt63se-coupe-2025",
      vinRequired: true, // a combustion car wears this name; the VIN keys keep it out (types.ts)
      ...GT2D,
      modelYears: [2025, 2025],
      vds: ["RJ8CB"],
      abstains: { heatPump: HEAT_PUMP_ABSTAIN },
      battery: gt2dBattery,
      range: {
        epaRangeMi: f(1, "mfr", "high", blended(49016, 11), epa(49016)),
        epaRangeTotalMi: f(360, "mfr", "high", undefined, epa(49016)),
        mpgeElectric: f(28, "mfr", "high", "MBUSA's MY2025 guide prints the same set: “32 / 24 / 28 MPGe (EPA electric + gas)”", epa(49016)),
        mpgeCombined: f(21, "mfr", "high", undefined, epa(49016)),
        mpgGasoline: f(19, "mfr", "high", undefined, epa(49016)),
      },
      // The MBUSA page whose Charging block this cites is the MY2027 car's;
      // the MY2025 Quick Reference Guide states no connector, so medium.
      charging: gt2dCharging("medium"),
      warranty: PHEV_WARRANTY(2025),
      buyerNotes: [NO_SOH_NOTE],
    });

    R.push({
      id: "amg-gt63se-coupe-2026",
      vinRequired: true, // a combustion car wears this name; the VIN keys keep it out (types.ts)
      ...GT2D,
      modelYears: [2026, 2026],
      vds: ["RJ8CB"],
      abstains: { heatPump: HEAT_PUMP_ABSTAIN, epaRangeMi: NO_EPA_YEAR(2026) },
      battery: gt2dBattery,
      charging: gt2dCharging("medium"),
      warranty: PHEV_WARRANTY(2026),
      buyerNotes: [NO_SOH_NOTE],
    });

    R.push({
      id: "amg-gt63se-coupe-2027",
      vinRequired: true, // a combustion car wears this name; the VIN keys keep it out (types.ts)
      ...GT2D,
      modelYears: [2027, 2027],
      vds: ["RJ8CB"],
      abstains: { heatPump: HEAT_PUMP_ABSTAIN, epaRangeMi: NO_EPA_YEAR(2027) },
      battery: gt2dBattery,
      charging: {
        ...gt2dCharging("high"),
        acOnboardKw: f(3.7, "mfr", "high", "“AC charging speed 3.7 kW”", GT2D_MODEL_27),
      },
      warranty: PHEV_WARRANTY(2027),
      buyerNotes: [NO_SOH_NOTE],
    });
  }

  // ── Mercedes-AMG C 63 S E Performance (W206), MY2024-2026 ───────────────
  //
  // These 27 listings were flagged for this batch as suspected MILD hybrids
  // filed under "C-Class". They are not. Every W1KAF8AB VIN in the feed
  // decodes to Trim "AMG C63 Se" / "AMG C63 S E Performance", the MY2025 and
  // MY2026 patterns carry ElectrificationLevel "PHEV (Plug-in Hybrid Electric
  // Vehicle)" and BatteryKWh 6.10, and MBUSA's own model page calls the fuel
  // type "Performance Plug-In Hybrid". The MY2024 pattern's
  // ElectrificationLevel field is empty — a vPIC filing gap, not a different
  // car, since the same pattern names the same trim in that year and the
  // petrol AMG C 43 sits on W1KAF8HB.
  {
    const C63 = {
      make: "MERCEDES-BENZ",
      model: "C-Class",
      modelAliases: ["C-Class Sedan", "AMG C 63 S E Performance", "AMG C63 S E Performance"],
      drive: "AWD" as const,
      packVariant: "PHEV",
      plugIn: true,
      ignoreKwhHint: true,
    };
    const c63Battery = {
      // Mercedes' own 2024 Quick Reference Guide states the split for this car;
      // an earlier draft said no Mercedes document did (refuter, 2026-09-10).
      packGrossKwh: f(
        6.1,
        "mfr",
        "high",
        "MBUSA's model page lists a “6.1-kWh ultra-lightweight high-performance battery”; the launch release states “The high-performance battery offers a capacity of 6.1 kWh”. Neither publishes a usable figure for this car",
        C63_MODEL_26
      ),
      packUsableKwh: f(4.8, "mfr", "high", "“Battery capacity 6.1 kWh (4.8 kWh usable)”", C63_QRG_24),
    };
    const c63Charging = {
      portStandard: f<PortStandard>(
        "J1772",
        "est",
        "medium",
        "Mercedes names no connector. Its launch release describes the whole of the car's external charging: “Charging takes place via the installed … on-board charger with alternating current at a charging station, wallbox or household outlet.” J1772 is the US AC inlet those three places use",
        C63_RELEASE
      ),
      dcFastCharging: f(
        "none" as const,
        "mfr",
        "high",
        "“Charging takes place via the installed … on-board charger with alternating current at a charging station, wallbox or household outlet” — the release states alternating current and names no DC path",
        C63_RELEASE
      ),
      architectureV: f(400, "mfr", "high", "“The electric powertrain and 400-volt high-performance battery are AMG-exclusive”", C63_RELEASE),
    };

    R.push({
      id: "amg-c63se-2024",
      vinRequired: true, // a combustion car wears this name; the VIN keys keep it out (types.ts)
      ...C63,
      modelYears: [2024, 2024],
      vds: ["AF8AB"],
      abstains: { heatPump: HEAT_PUMP_ABSTAIN, epaRangeMi: NO_EPA_YEAR(2024) },
      battery: c63Battery,
      charging: c63Charging,
      warranty: PHEV_WARRANTY(2024),
      buyerNotes: [NO_SOH_NOTE],
    });

    R.push({
      id: "amg-c63se-2025",
      vinRequired: true, // a combustion car wears this name; the VIN keys keep it out (types.ts)
      ...C63,
      modelYears: [2025, 2025],
      vds: ["AF8AB"],
      abstains: { heatPump: HEAT_PUMP_ABSTAIN },
      battery: c63Battery,
      range: {
        epaRangeMi: f(1, "mfr", "high", blended(49018, 1), epa(49018)),
        epaRangeTotalMi: f(320, "mfr", "high", undefined, epa(49018)),
        mpgeElectric: f(37, "mfr", "high", "MBUSA's MY2026 page prints the same city and highway pair, 36 and 38 MPGe", epa(49018)),
        mpgeCombined: f(22, "mfr", "high", undefined, epa(49018)),
        mpgGasoline: f(20, "mfr", "high", undefined, epa(49018)),
      },
      charging: c63Charging,
      warranty: PHEV_WARRANTY(2025),
      buyerNotes: [NO_SOH_NOTE],
    });

    R.push({
      id: "amg-c63se-2026",
      vinRequired: true, // a combustion car wears this name; the VIN keys keep it out (types.ts)
      ...C63,
      modelYears: [2026, 2026],
      vds: ["AF8AB"],
      abstains: { heatPump: HEAT_PUMP_ABSTAIN, epaRangeMi: NO_EPA_YEAR(2026) },
      battery: c63Battery,
      charging: c63Charging,
      warranty: PHEV_WARRANTY(2026),
      buyerNotes: [NO_SOH_NOTE],
    });
  }
}

// ─────────────────── MERCEDES-BENZ C 350e, MY2016-2018 ─────────────────────
//
// Seven live cars, the oldest plug-in Mercedes on the site, and the reason
// this file's range rule was worth arguing: MBUSA's own 2018 specifications
// release prints "All-electric range (mi) 0 - 8" for the car fueleconomy.gov
// files with rangeA 9. The maker publishes the all-electric figure. So does
// this file.
//
// The warranty abstains for the reason data11.ts's S 550e row abstains, and
// it was tested the same way rather than assumed: MBUSA's published warranty
// archive begins at model year 2021, three years after this car ended, so no
// booklet covering it exists to read.
{
  const C350E_SPECS_18 =
    "https://web.archive.org/web/20260910194959/https://media.mbusa.com/releases/release-f64df5efcf40bb28fb4d418ddc1cb7b9-2018-mercedes-benz-c350e-sedan";

  const C350E = {
    make: "MERCEDES-BENZ",
    model: "C-Class",
    modelAliases: ["C 350e", "C350e", "C-Class Sedan", "C 350e Plug-in Hybrid"],
    drive: "RWD" as const,
    packVariant: "PHEV",
    plugIn: true,
    vds: ["WF4HB"],
  };

  const C350E_WARRANTY_ABSTAIN =
    "MBUSA's published warranty archive begins at model year 2021, three years after this car was discontinued, so no Mercedes booklet covering it exists to read and the current plug-in term must not be assumed backwards";

  const c350eBattery = {
    packGrossKwh: f(
      6.2,
      "mfr",
      "high",
      "MBUSA's 2018 C350e Sedan Specifications: “Battery size (kWh) 6.2”. Mercedes does not label the figure gross or usable",
      C350E_SPECS_18
    ),
  };
  const c350eCharging = {
    portStandard: f<PortStandard>(
      "J1772",
      "est",
      "medium",
      "Mercedes names no connector, giving only “Battery Charging time (240v) 2.5 hours”. J1772 is the US AC inlet of this car's era",
      C350E_SPECS_18
    ),
    dcFastCharging: f("none" as const, "est", "high", "Mercedes publishes only a 240-volt AC charging time for this car and no DC figure", C350E_SPECS_18),
  };

  R.push({
    id: "c350e-2016",
    vinRequired: true, // a combustion car wears this name; the VIN keys keep it out (types.ts)
    ...C350E,
    modelYears: [2016, 2016],
    abstains: { heatPump: HEAT_PUMP_ABSTAIN, batteryWarranty: C350E_WARRANTY_ABSTAIN },
    battery: c350eBattery,
    range: {
      epaRangeMi: f(
        10,
        "mfr",
        "high",
        "EPA's comparison page reads “All Elec: 0-10 mi”. Its other figure, 11 miles, is labelled “Elec + Gas” and is the blended charge-depleting range, not an electric-only one",
        epa(38499)
      ),
      epaRangeTotalMi: f(410, "mfr", "high", undefined, epa(38499)),
      mpgeElectric: f(51, "mfr", "high", undefined, epa(38499)),
      mpgeCombined: f(34, "mfr", "high", undefined, epa(38499)),
      mpgGasoline: f(30, "mfr", "high", undefined, epa(38499)),
    },
    charging: c350eCharging,
  });

  R.push({
    id: "c350e-2017",
    vinRequired: true, // a combustion car wears this name; the VIN keys keep it out (types.ts)
    ...C350E,
    modelYears: [2017, 2017],
    abstains: { heatPump: HEAT_PUMP_ABSTAIN, batteryWarranty: C350E_WARRANTY_ABSTAIN },
    battery: c350eBattery,
    range: {
      epaRangeMi: f(
        8,
        "mfr",
        "high",
        "EPA's comparison page reads “All Elec: 0-8 mi”; its 9-mile figure is labelled “Elec + Gas”. MBUSA states the same all-electric figure for the mechanically identical MY2018 car: “All-electric range (mi) 0 - 8”",
        epa(38969)
      ),
      epaRangeTotalMi: f(410, "mfr", "high", undefined, epa(38969)),
      mpgeElectric: f(51, "mfr", "high", undefined, epa(38969)),
      mpgeCombined: f(34, "mfr", "high", undefined, epa(38969)),
      mpgGasoline: f(30, "mfr", "high", undefined, epa(38969)),
    },
    charging: c350eCharging,
  });

  R.push({
    id: "c350e-2018",
    vinRequired: true, // a combustion car wears this name; the VIN keys keep it out (types.ts)
    ...C350E,
    modelYears: [2018, 2018],
    abstains: { heatPump: HEAT_PUMP_ABSTAIN, batteryWarranty: C350E_WARRANTY_ABSTAIN },
    battery: c350eBattery,
    range: {
      epaRangeMi: f(
        8,
        "mfr",
        "high",
        "MBUSA's own 2018 specifications release: “All-electric range (mi) 0 - 8”, matching EPA's “All Elec: 0-8 mi”. EPA's 9-mile figure is labelled “Elec + Gas”",
        C350E_SPECS_18
      ),
      epaRangeTotalMi: f(410, "mfr", "high", undefined, epa(39853)),
      mpgeElectric: f(51, "mfr", "high", "MBUSA prints the same numbers: “MPGe: 45 / 61 / 51”", epa(39853)),
      mpgeCombined: f(34, "mfr", "high", undefined, epa(39853)),
      mpgGasoline: f(30, "mfr", "high", "MBUSA prints the same: “City / Highway / Combined 28 / 32 / 30”", epa(39853)),
    },
    charging: c350eCharging,
  });
}

export const RESEARCH_ROWS_15: EnrichmentRow[] = R;
