import type { EnrichmentRow, Fact, Source } from "../types";
import { VOLVO_BARE_T8_TRIMS } from "./data6";

// Eighth research tranche (2026-08-30): the plug-in backlog that turned
// phev-enrichment-gap.mjs red at 80 groups against a committed baseline of
// 37. The feed had grown from ~100,900 live listings to 143,584, and the
// plug-in half of it from ~4,500 to 41,890 — so the check was not reporting a
// regression in the corpus, it was reporting that nine years of used
// plug-ins had arrived at once and almost none of the pre-2021 ones had ever
// been researched. The 43 new groups are, in order of how many shoppers they
// hide from: the first-generation Volvo T8s (2016–2020, plus the V60, a
// nameplate the corpus had no row for at any year), the Audi Q5/A7/A8 TFSI e
// (204 listings, no Audi plug-in row existed at all), the F15 BMW X5
// xDrive40e and G11 740e, the 958-era Porsche Cayenne and 970-era Panamera
// E-Hybrids, the Mercedes C 350e and GLE 550e, the Kia Optima PHEV, and the
// MY2027 cars now landing on dealer lots — Land Rover, Volvo, BMW XM — for
// which EPA has published nothing.
//
// Sourcing, the same two lanes data6.ts set up and for the same reasons:
//
//  - EPA figures come from fueleconomy.gov's BULK vehicles.csv, read
//    field-by-field, never transcribed by eye: epaRangeMi is `rangeA`,
//    epaRangeTotalMi is `range`, mpgeElectric is `combA08`, mpgeCombined is
//    `phevComb`, mpgGasoline is `comb08`. Each row cites the same Find.do
//    compare page by the record's own `id`. Two independent checks that the
//    mapping is right: it reproduces the figures data6.ts's Volvo and Porsche
//    rows already publish from the REST API, and Audi's own press releases
//    state EPA numbers for three cars in words ("All-electric range 19 miles;
//    50 combined city/highway MPGe") that match the CSV's rangeA and combA08
//    for those exact records.
//
//  - Battery, charger, connector, heat-pump and warranty facts come from
//    manufacturer documents fetched this pass and quoted in the comments
//    below. Where no maker document consulted this pass states a fact, the
//    row leaves it empty or abstains. Nothing here is filled from memory, and
//    nothing is carried across a generation boundary — see the Volvo pack
//    note, which is the whole reason the 2016–2020 rows abstain on a figure
//    the 2021+ rows publish confidently.
//
// THE EU-DOCUMENT TRAP, refused twice in this tranche. Audi's global media
// centre states 17.9 kWh gross / 14.4 kWh net for the MY2022+ Q5 TFSI e, and
// it is the only document that states it. That is audi-mediacenter.com, a
// European site describing a European car, and this project has already been
// burned by exactly that shape: the Volvo XC40/C40 and Nissan Ariya heat-pump
// claims (2026-08-25) were EU specifications that reached US listings through
// aggregators and were falsified against the US corpus. So the 2022–2025 Q5
// rows abstain on pack size rather than publish a figure no Audi of America
// document states, even though the number is very probably right. The 2020
// and 2021 rows publish 14.1 kWh because media.audiusa.com — the US site —
// says it in its own words.
//
// WHAT IS DELIBERATELY LEFT UNMATCHED, so nobody "fixes" it later:
//   - Bare Volvo XC90/XC60 listings whose trim is a grade name ("T8 Plus",
//     "T8 Ultra"). data6.ts's BARE_T8_TRIMS comment explains at length why a
//     "T8 Plus" key is unsafe — trimStringsOverlap is substring-tolerant in
//     BOTH directions, so "T8PLUS" swallows a petrol listing that says only
//     "PLUS". That reasoning is unchanged and this tranche does not touch it.
//     The two `partial` XC90/XC60 groups are that silence, not a gap.
//   - Feed junk: model "ACZZ" with trim "xDrive45e", model "BMW 5" with trim
//     "30e xDrive Plug-In Hybrid", a Mercedes trim of ".". These are mangled
//     strings, not nameplates, and a row keyed on one would be a row keyed on
//     one dealer's export bug.
const AS_OF = "2026-08-30";

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

// Same rationale as data4's PHEV_J1772 and data6's copy: J1772 is the only AC
// inlet a US-market plug-in hybrid ships, but where no maker document
// consulted this pass names the connector the fact stays `est`.
const J1772_EST = f<"J1772">("J1772", "est", "high", "AC charging only, no DC fast charge");
const NO_DCFC_EST = f<"none">("none", "est", "high", "AC charging only");
const EST_CHARGING = { portStandard: J1772_EST, dcFastCharging: NO_DCFC_EST };

const HP_ABSTAIN = "No US maker document consulted this pass states heat-pump hardware for this model";

// Emit a researched row twice: once under the model string that names the
// plug-in, once under the bare nameplate a petrol car shares, guarded by trim
// tokens only the plug-in wears. Same helper as data6's, and the guard is
// load-bearing on /vin/ for the reason data4's Wrangler comment gives — vPIC
// hands the matcher a petrol car's raw trim, so a trim-less bare-model alias
// would hand that car this row's electric miles.
function withAlt(
  row: EnrichmentRow,
  alt: { model: string; modelAliases?: string[]; trim: string[] }
): EnrichmentRow[] {
  return [row, { ...row, id: `${row.id}-alt`, model: alt.model, modelAliases: alt.modelAliases, trim: alt.trim }];
}

// Every row in this file is a plug-in hybrid, and several of them abstain on
// range because EPA published none — which is exactly the shape that made 31
// live S 580e listings read as false claims on 2026-08-29 (see the `plugIn`
// comment in lib/types.ts). Stating the kind is cheaper than having the
// cross-kind guard infer it from facts the row was honest enough not to
// publish, so every row states it.
const R: EnrichmentRow[] = [];
const push = (...rows: EnrichmentRow[]) => R.push(...rows.map((r) => ({ plugIn: true, ...r })));

// A PHEV row built from EPA's five fields and nothing else.
const epaRange = (id: number, elec: number, total: number, mpgeE: number, mpgeC: number, gas: number, note?: string): EnrichmentRow["range"] => ({
  epaRangeMi: f(elec, "mfr", "high", note ?? "Electric-only EPA range", epa(id)),
  epaRangeTotalMi: f(total, "mfr", "high", undefined, epa(id)),
  mpgeElectric: f(mpgeE, "mfr", "high", undefined, epa(id)),
  mpgeCombined: f(mpgeC, "mfr", "high", undefined, epa(id)),
  mpgGasoline: f(gas, "mfr", "high", undefined, epa(id)),
});

// ─────────────────────── VOLVO T8: THE YEARS BEFORE 2021 ───────────────────
// data6.ts researched the T8 from 2021 on, where Volvo's own press release
// about the pack growing 11.6 → 18.8 kWh gives a battery figure and the
// current support pages give 3.6 kW and "no DC". None of that reaches back
// here. The first-generation T8 (2016–2020) is a different pack, and the
// giveaway is in EPA's own records rather than any spec sheet: the XC90's
// electric rating moves 14 → 14 → 19 → 17 → 18 across 2016–2020 while the
// 2021 car rates 18 on the 11.6 kWh pack. A number that wanders like that is
// a car being re-rated, and possibly re-packed, and the honest thing to do
// with a pack size published for the 2021 car is not to reach back five years
// with it. So these rows carry EPA's ratings — which are per-year, certain,
// and the figures a shopper is actually comparing — and abstain on the pack.
//
// Volvo's warranty terms get the same treatment for the same reason: the
// 8-year/100,000-mile figure data6.ts publishes is cited to Volvo's CURRENT
// certified-pre-owned page, which is a statement about the cars Volvo sells
// now, not a 2016 XC90.
//
// The heat-pump abstention is not laziness either — it is the control test
// data6.ts recorded: Volvo's US site never says "heat pump" even for the
// EX90, so Volvo's silence proves nothing about any Volvo.
{
  const VOLVO_OLD_PACK_ABSTAIN =
    "Volvo's published 11.6 kWh figure is for the 2021-on T8; no Volvo document consulted this pass states this generation's pack";
  const VOLVO_OLD_WARRANTY_ABSTAIN =
    "Volvo's 8-year/100,000-mile hybrid battery terms are published for its current cars; no period Volvo document for this model year was consulted";
  const VOLVO_OLD_ABSTAINS = {
    packUsableKwh: VOLVO_OLD_PACK_ABSTAIN,
    batteryWarranty: VOLVO_OLD_WARRANTY_ABSTAIN,
    heatPump: HP_ABSTAIN,
  };

  // The nameplate spellings the feed actually sends, taken from the gap
  // report rather than invented: "XC90 Recharge Plug-In Hybrid" and its two
  // truncations ("… Plug-In Hyb", "… Plug-I" — dealer systems cut the field
  // at different widths), the "Recharge" sub-brand alone, and the "<name>
  // Hybrid" spelling that four separate groups arrived under.
  const volvoAliases = (n: string) => [
    `${n} Recharge Plug-In Hybrid`,
    `${n} Recharge Plug-In Hyb`,
    `${n} Recharge Plug-I`,
    `${n} Recharge`,
    `${n} T8 Recharge`,
    `${n} T8`,
    `${n} Hybrid`,
    `${n} Plug-in Hybrid`,
  ];

  const volvoOld = (id: string, name: string, years: [number, number], range: EnrichmentRow["range"]): EnrichmentRow => ({
    id,
    make: "VOLVO",
    model: `${name} Plug-In Hybrid`,
    modelAliases: volvoAliases(name),
    modelYears: years,
    packVariant: "PHEV",
    range,
    charging: EST_CHARGING,
    abstains: VOLVO_OLD_ABSTAINS,
  });

  push(
    volvoOld("xc90-t8-2016", "XC90", [2016, 2016], epaRange(37224, 14, 350, 53, 30, 25)),
    volvoOld("xc90-t8-2017", "XC90", [2017, 2017], epaRange(37703, 14, 350, 54, 30, 25)),
    volvoOld("xc90-t8-2018", "XC90", [2018, 2018], epaRange(39383, 19, 380, 62, 36, 27)),
    volvoOld("xc90-t8-2019", "XC90", [2019, 2019], epaRange(40407, 17, 490, 58, 33, 25)),
    // EPA's 2020 XC90 and XC60 records both carry rangeCityA 27.1 /
    // rangeHwyA 22.82 — the identical pair, on two different cars, and
    // inconsistent with each record's own rangeA. rangeA is the field
    // fueleconomy.gov's page displays and the one data6.ts's xc60-t8-2021 row
    // already publishes through the same inconsistency, so it is what ships
    // here too; 2019 and 2021 bracket both figures.
    volvoOld("xc90-t8-2020", "XC90", [2020, 2020], epaRange(41948, 18, 520, 55, 34, 27)),
    volvoOld("xc60-t8-2018", "XC60", [2018, 2018], epaRange(39382, 18, 370, 59, 34, 26)),
    volvoOld("xc60-t8-2019", "XC60", [2019, 2019], epaRange(40406, 17, 500, 58, 33, 26)),
    volvoOld("xc60-t8-2020", "XC60", [2020, 2020], epaRange(41947, 19, 520, 57, 34, 27)),
    volvoOld("s60-t8-2019", "S60", [2019, 2019], epaRange(41255, 22, 520, 74, 43, 31)),
    volvoOld("s60-t8-2020", "S60", [2020, 2020], epaRange(41944, 22, 510, 69, 42, 30)),
    volvoOld("s90-t8-2018", "S90", [2018, 2018], epaRange(39381, 21, 410, 71, 41, 29)),
    volvoOld("s90-t8-2019", "S90", [2019, 2019], epaRange(40405, 21, 490, 71, 41, 29)),
    volvoOld("s90-t8-2020", "S90", [2020, 2020], epaRange(41945, 21, 490, 60, 40, 30))
  );

  // ── V60 T8: a nameplate the corpus held no row for at any year ──────────
  // Same drivetrain and the same 2022 mid-year pack split as the S60 — EPA
  // carries both a "T8 AWD Recharge" and a "T8 AWD Recharge ext. Range" 2022
  // record, rating 22 and 40 miles, and dealer feeds do not carry the suffix,
  // so those two resolve to candidates exactly as the S60's do. The packVariant
  // labels are what a shopper reads to tell them apart.
  //
  // Pack and charger DO get published from 2021 on: those are the years
  // data6.ts's Volvo research covers, and its VOLVO_ER press release is about
  // the T8 powertrain rather than one body style. The 2020 V60 sits on the
  // other side of that line and abstains with its S60 and S90 contemporaries.
  const VOLVO_ER_PR = "https://www.volvocars.com/us/media/press-releases/11C10482DFEF2BC9/";
  const VOLVO_CHARGE_XC90 =
    "https://www.volvocars.com/us/support/car/xc90-plug-in-hybrid/article/0ed816eed33d98cac0a8cc377bc12bc7-83c0c849d91ad5fac0a8cc3751bbe62b-8664b2fa77a7e089c0a8296870d1a409/";
  const VOLVO_NO_DC = "https://www.volvocars.com/us/support/topic/blt62870ecab912f410/";
  const VOLVO_CPO = "https://www.volvocars.com/us/l/certified-by-volvo/";
  const VOLVO_PACK_NOTE = "Nominal energy; Volvo does not split gross and usable";
  const VOLVO_CHARGING = {
    acOnboardKw: f(3.6, "mfr", "high", undefined, VOLVO_CHARGE_XC90),
    portStandard: f<"J1772">("J1772", "mfr", "high", "AC charging only, no DC fast charge", VOLVO_NO_DC),
    dcFastCharging: f<"none">("none", "mfr", "high", undefined, VOLVO_NO_DC),
  };
  const VOLVO_WARRANTY = {
    batteryYears: f(8, "mfr", "high", undefined, VOLVO_CPO),
    batteryMiles: f(100_000, "mfr", "high", undefined, VOLVO_CPO),
  };

  const v60 = (id: string, years: [number, number], packKwh: number, packVariant: string, over: Partial<EnrichmentRow>): EnrichmentRow => ({
    id,
    make: "VOLVO",
    model: "V60 Plug-In Hybrid",
    modelAliases: volvoAliases("V60"),
    modelYears: years,
    packVariant,
    battery: { packGrossKwh: f(packKwh, "mfr", "high", VOLVO_PACK_NOTE, VOLVO_ER_PR) },
    charging: VOLVO_CHARGING,
    warranty: VOLVO_WARRANTY,
    abstains: { heatPump: HP_ABSTAIN },
    ...over,
  });

  push(
    {
      id: "v60-t8-2020",
      make: "VOLVO",
      model: "V60 Plug-In Hybrid",
      modelAliases: volvoAliases("V60"),
      modelYears: [2020, 2020],
      packVariant: "PHEV",
      range: epaRange(41946, 22, 510, 69, 42, 30),
      charging: EST_CHARGING,
      abstains: VOLVO_OLD_ABSTAINS,
    },
    v60("v60-t8-2021", [2021, 2021], 11.6, "PHEV", { range: epaRange(42985, 22, 510, 69, 42, 30) }),
    v60("v60-t8-2022-std", [2022, 2022], 11.6, "Standard range pack", {
      range: epaRange(44363, 22, 510, 69, 42, 30, "Electric-only EPA range, pre-update 2022 cars"),
    }),
    v60("v60-t8-2022-er", [2022, 2022], 18.8, "Extended Range", {
      range: epaRange(45199, 40, 530, 74, 52, 31, "Electric-only EPA range, Extended Range 2022 cars"),
    }),
    v60("v60-t8-2023", [2023, 2023], 18.8, "PHEV", { range: epaRange(46262, 40, 530, 74, 52, 31) }),
    // fueleconomy.gov carries no 2024 V60 plug-in record at all — the only
    // 2024 V60 it lists is the petrol Cross Country B5 — though 2024 V60
    // Polestar Engineered listings are live. 2023 and 2025 rate the car
    // identically at 40 miles, which is suggestive and is still not a rating
    // EPA issued for a 2024 car, so the row abstains rather than reaching for
    // the neighbour. Same call as the 2024 Range Rover P550e and the 2024
    // GLE 450e in data6.ts.
    v60("v60-t8-2024", [2024, 2024], 18.8, "Extended Range", {
      abstains: {
        epaRangeMi: "fueleconomy holds no 2024 V60 plug-in record; the 2023 and 2025 cars both rate 40 miles",
        heatPump: HP_ABSTAIN,
      },
    }),
    v60("v60-t8-2025", [2025, 2025], 18.8, "PHEV", { range: epaRange(48678, 40, 530, 74, 52, 31) })
  );

  // ── The bare-nameplate rows for S60 / S90 / V60 ─────────────────────────
  // data6.ts built these for XC90 and XC60 and stopped there, which is why 70
  // live S60 listings and 9 V60s reached no row: they arrive as model "S60"
  // with the plug-in badge in the trim ("Recharge Plus", "Recharge Ultimate",
  // "Recharge Polestar Engineered").
  //
  // The guard tokens are data6's BARE_T8_TRIMS plus two Polestar spellings,
  // and every one of them has to survive the same test its comment sets out:
  // a token must name the electrified powertrain and nothing else, must not
  // be a grade name a petrol car shares, and must not contain a drivetrain
  // substring (the "eAWD" lesson — "EAWD" is contained by "ULTIMATEAWD", so a
  // petrol B6 Ultimate took the T8's row).
  //
  //   "Recharge"           — Volvo's electrified sub-brand; no petrol S60,
  //                          S90 or V60 wears it. Also the token that survives
  //                          specTrim()'s cut-at-the-comma, so it is the one
  //                          that works on the browse shard as well as on the
  //                          per-listing path.
  //   "Plug-in hybrid"     — says what it is.
  //   "T8"                 — two characters, so the matcher demands an exact
  //                          trim of "T8" and it catches nothing else. Kept
  //                          for the handful of listings whose whole trim is
  //                          that string, exactly as data6 keeps it.
  //   "Polestar Engineered",
  //   "T8 Polestar"        — new here, and safe on these three nameplates for
  //                          a reason that is about the cars and not the
  //                          strings: on the S60, V60 and XC60 the Polestar
  //                          Engineered IS the T8. There is no petrol Volvo
  //                          called Polestar Engineered in any year these
  //                          rows cover, so the substring credit these tokens
  //                          give ("POLESTARENGINEERED" swallowing a listing
  //                          that says only "Polestar") lands on a plug-in
  //                          every time. Neither token contains a drivetrain
  //                          substring. The 2013–2016 petrol S60/V60 Polestar
  //                          is the car this WOULD have caught, and every row
  //                          here starts at 2018.
  //
  // Deliberately still absent: "T8 Plus", "T8 Ultra", "T8 Inscription" and
  // every other grade-bearing spelling, for the reason data6.ts gives.
  const BARE_T8_TRIMS = VOLVO_BARE_T8_TRIMS;
  for (const r of R.filter((x) => /^(s60|s90|v60)-t8-/.test(x.id))) {
    push({
      ...r,
      id: `${r.id}-alt`,
      model: r.id.slice(0, 3).toUpperCase(),
      modelAliases: [`${r.id.slice(0, 3).toUpperCase()} Polestar`],
      trim: BARE_T8_TRIMS,
    });
  }
  // The same bare rows for the XC90/XC60 years this file adds, so the older
  // cars behave like the 2021+ ones data6.ts already covers.
  for (const r of R.filter((x) => /^xc(90|60)-t8-20(1|20)/.test(x.id) && !x.trim)) {
    push({ ...r, id: `${r.id}-alt`, model: r.id.startsWith("xc90") ? "XC90" : "XC60", modelAliases: undefined, trim: BARE_T8_TRIMS });
  }

  // ── MY2027 XC90 / XC60 ──────────────────────────────────────────────────
  // On dealer lots, and fueleconomy.gov's 2027 menu holds five plug-in
  // records in total (two BMWs, a Kia, a Bentley) and no Volvo. The pack,
  // charger and warranty are unchanged current-car facts from Volvo's own
  // pages; the rating abstains.
  for (const [name, id] of [["XC90", "xc90"], ["XC60", "xc60"]] as Array<[string, string]>) {
    push(
      ...withAlt(
        {
          id: `${id}-t8-2027`,
          make: "VOLVO",
          model: `${name} Plug-In Hybrid`,
          modelAliases: volvoAliases(name),
          modelYears: [2027, 2027],
          packVariant: "PHEV",
          plugIn: true,
          battery: { packGrossKwh: f(18.8, "mfr", "high", VOLVO_PACK_NOTE, VOLVO_ER_PR) },
          charging: VOLVO_CHARGING,
          warranty: VOLVO_WARRANTY,
          abstains: {
            epaRangeMi: "fueleconomy.gov has published no 2027 Volvo plug-in rating yet",
            heatPump: HP_ABSTAIN,
          },
        },
        { model: name, trim: BARE_T8_TRIMS }
      )
    );
  }
}


// ───────────── AUDI Q5 / A7 / A8 TFSI e — no Audi plug-in row existed ──────
// 206 live listings across four groups and not one Audi plug-in row in the
// corpus, which made this the single biggest silence the gap check found.
//
// Two Audi of America releases carry every hardware fact below, in Audi's own
// words, and they agree with each other:
//
//   MY2020 (media.audiusa.com release 381): "The lithium-ion battery pack,
//   located under the luggage compartment floor, is made up of 104 prismatic
//   cells and stores 14.1 kWh of energy with a voltage of 381 volts." — "The
//   climate control system uses a highly efficient heat pump that pools the
//   waste heat from the high-voltage components." — "can be charged at any
//   SAE J1772 charging station."
//
//   MY2021 (release 443, covering all three cars): "All three vehicles come
//   with a 14.1 kWh battery pack that sits under the rear cargo area and are
//   equipped with an integrated heat pump" — "Their onboard 7.7 kW charger
//   allows them to replenish battery power from empty to 100% in just 2.4
//   hours when using a 240-volt outlet."
//
// The heat pump is worth pausing on, because this project has a standing rule
// that an aggregator's heat-pump claim is worthless (the Volvo XC40/C40 and
// Nissan Ariya claims were EU specs, falsified 2026-08-25). This is not that:
// it is Audi of America describing US cars in two independent releases, and it
// is the rare PHEV where the maker states the hardware plainly. So it ships as
// `mfr`, and it is the only heat-pump fact in this file.
//
// Both releases quote EPA figures in prose, and all three match the bulk
// CSV's rangeA and combA08 for the exact records cited below — which is the
// cross-check that the CSV field mapping used throughout this file is right.
//
// The MY2022 pack change is real and deliberately unstated. EPA's own records
// show it without naming it: charge240 goes 2.4 → 3.0 hours and the rating
// jumps 19 → 23 miles between the 2021 and 2022 Q5. Audi's GLOBAL media
// centre states 17.9 kWh gross / 14.4 kWh net for that car and no Audi of
// America document consulted this pass states anything, so the 2022+ rows
// abstain — see this file's header for why a European spec sheet is not
// evidence about a US car. The heat pump abstains from 2022 on for the same
// reason: it was documented for a pack that is no longer in the car.
{
  const AUDI_2020_PR = "https://media.audiusa.com/en-us/releases/381";
  const AUDI_2021_PR = "https://media.audiusa.com/releases/443";
  const AUDI_WARRANTY_ABSTAIN =
    "No Audi of America document consulted this pass states the high-voltage battery's warranty terms";
  const AUDI_LATE_PACK_ABSTAIN =
    "Only Audi's European media centre states this pack; no Audi of America document consulted this pass gives a figure";
  const AUDI_PACK_141 = (src: string) => ({
    packGrossKwh: f(14.1, "mfr", "high", "Audi does not split gross and usable", src),
  });
  const AUDI_HEAT_PUMP = (src: string) => ({ heatPump: f<"standard">("standard", "mfr", "high", undefined, src) });
  const AUDI_J1772 = (src: string) => ({
    portStandard: f<"J1772">("J1772", "mfr", "high", "AC charging only, no DC fast charge", src),
    dcFastCharging: NO_DCFC_EST,
  });

  const audi = (id: string, model: string, aliases: string[], years: [number, number], over: Partial<EnrichmentRow>): EnrichmentRow => ({
    id,
    make: "AUDI",
    model,
    modelAliases: aliases,
    modelYears: years,
    packVariant: "PHEV",
    ...over,
  });

  // The feed spellings, from the gap report: the plain badge, the "quattro"
  // suffix, the Sportback body, and the "Plug-In Hybrid" name EPA's own 2025
  // record uses.
  const Q5_ALIASES = ["Q5 55 TFSI e", "Q5 TFSI e quattro", "Q5 55 TFSI e quattro", "Q5 Plug-In Hybrid", "Q5 Sportback TFSI e", "Q5 e"];
  push(
    audi("q5-tfsie-2020", "Q5 TFSI e", Q5_ALIASES, [2020, 2020], {
      battery: AUDI_PACK_141(AUDI_2020_PR),
      range: epaRange(42448, 20, 390, 65, 38, 27),
      charging: AUDI_J1772(AUDI_2020_PR),
      thermal: AUDI_HEAT_PUMP(AUDI_2020_PR),
      abstains: { batteryWarranty: AUDI_WARRANTY_ABSTAIN },
    }),
    audi("q5-tfsie-2021", "Q5 TFSI e", Q5_ALIASES, [2021, 2021], {
      battery: AUDI_PACK_141(AUDI_2021_PR),
      range: epaRange(43424, 19, 400, 50, 37, 27),
      charging: { acOnboardKw: f(7.7, "mfr", "high", undefined, AUDI_2021_PR), ...AUDI_J1772(AUDI_2021_PR) },
      thermal: AUDI_HEAT_PUMP(AUDI_2021_PR),
      abstains: { batteryWarranty: AUDI_WARRANTY_ABSTAIN },
    }),
    audi("q5-tfsie-2022", "Q5 TFSI e", Q5_ALIASES, [2022, 2022], {
      range: epaRange(44159, 23, 390, 61, 38, 26),
      charging: EST_CHARGING,
      abstains: { packUsableKwh: AUDI_LATE_PACK_ABSTAIN, batteryWarranty: AUDI_WARRANTY_ABSTAIN, heatPump: HP_ABSTAIN },
    }),
    audi("q5-tfsie-2023", "Q5 TFSI e", Q5_ALIASES, [2023, 2023], {
      range: epaRange(47213, 22, 400, 60, 38, 26),
      charging: EST_CHARGING,
      abstains: { packUsableKwh: AUDI_LATE_PACK_ABSTAIN, batteryWarranty: AUDI_WARRANTY_ABSTAIN, heatPump: HP_ABSTAIN },
    }),
    // fueleconomy.gov holds no 2024 Q5 plug-in record; the 2023 and 2025 cars
    // rate 22 and 23 miles, which do not agree, so nothing is borrowed.
    audi("q5-tfsie-2024", "Q5 TFSI e", Q5_ALIASES, [2024, 2024], {
      charging: EST_CHARGING,
      abstains: {
        epaRangeMi: "fueleconomy holds no 2024 record; the 2023 and 2025 cars rate 22 and 23 miles",
        packUsableKwh: AUDI_LATE_PACK_ABSTAIN,
        batteryWarranty: AUDI_WARRANTY_ABSTAIN,
        heatPump: HP_ABSTAIN,
      },
    }),
    audi("q5-tfsie-2025", "Q5 TFSI e", Q5_ALIASES, [2025, 2025], {
      range: epaRange(48653, 23, 390, 58, 38, 26),
      charging: EST_CHARGING,
      abstains: { packUsableKwh: AUDI_LATE_PACK_ABSTAIN, batteryWarranty: AUDI_WARRANTY_ABSTAIN, heatPump: HP_ABSTAIN },
    })
  );

  // Bare "Q5" with the badge in the trim ("Prestige 55 Tfsi e"). "TFSI e" is
  // the guard, and it is safe against every petrol Q5 trim for a reason worth
  // stating rather than assuming: the petrol grades are numbered the same way
  // ("40 TFSI", "45 TFSI quattro"), so the tokens are one character apart
  // once normalized — "45TFSI" against "TFSIE" — and neither contains the
  // other. The plug-in is the only Q5 whose badge ends in "e".
  for (const r of R.filter((x) => /^q5-tfsie-/.test(x.id))) {
    push({ ...r, id: `${r.id}-alt`, model: "Q5", modelAliases: ["Q5 Sportback"], trim: ["TFSI e", "55 TFSI e"] });
  }

  push(
    audi("a7-tfsie-2021", "A7 TFSI e", ["A7 55 TFSI e", "A7 Sportback TFSI e", "A7 TFSI e quattro", "A7 Sportback 55 TFSI e"], [2021, 2021], {
      battery: AUDI_PACK_141(AUDI_2021_PR),
      range: epaRange(43213, 24, 440, 68, 43, 29),
      charging: { acOnboardKw: f(7.7, "mfr", "high", undefined, AUDI_2021_PR), ...AUDI_J1772(AUDI_2021_PR) },
      thermal: AUDI_HEAT_PUMP(AUDI_2021_PR),
      abstains: { batteryWarranty: AUDI_WARRANTY_ABSTAIN },
    }),
    audi("a7-tfsie-2022", "A7 TFSI e", ["A7 55 TFSI e", "A7 Sportback TFSI e", "A7 TFSI e quattro", "A7 Sportback 55 TFSI e"], [2022, 2022], {
      range: epaRange(44158, 26, 410, 70, 43, 27),
      charging: EST_CHARGING,
      abstains: { packUsableKwh: AUDI_LATE_PACK_ABSTAIN, batteryWarranty: AUDI_WARRANTY_ABSTAIN, heatPump: HP_ABSTAIN },
    }),
    audi("a8-tfsie-2020", "A8 L TFSI e", ["A8 TFSI e", "A8 L 60 TFSI e", "A8 60 TFSI e", "A8 L TFSI e quattro"], [2020, 2020], {
      battery: AUDI_PACK_141(AUDI_2021_PR),
      range: epaRange(42447, 17, 420, 54, 31, 23),
      charging: AUDI_J1772(AUDI_2021_PR),
      thermal: AUDI_HEAT_PUMP(AUDI_2021_PR),
      abstains: { batteryWarranty: AUDI_WARRANTY_ABSTAIN },
    }),
    audi("a8-tfsie-2021", "A8 L TFSI e", ["A8 TFSI e", "A8 L 60 TFSI e", "A8 60 TFSI e", "A8 L TFSI e quattro"], [2021, 2021], {
      battery: AUDI_PACK_141(AUDI_2021_PR),
      range: epaRange(43033, 18, 420, 53, 31, 23),
      charging: { acOnboardKw: f(7.7, "mfr", "high", undefined, AUDI_2021_PR), ...AUDI_J1772(AUDI_2021_PR) },
      thermal: AUDI_HEAT_PUMP(AUDI_2021_PR),
      abstains: { batteryWarranty: AUDI_WARRANTY_ABSTAIN },
    })
  );
  for (const r of R.filter((x) => /^(a7|a8)-tfsie-/.test(x.id))) {
    push({
      ...r,
      id: `${r.id}-alt`,
      model: r.id.startsWith("a7") ? "A7" : "A8",
      modelAliases: r.id.startsWith("a7") ? ["A7 Sportback"] : ["A8 L"],
      trim: ["TFSI e", "55 TFSI e", "60 TFSI e"],
    });
  }
}

// ─────────────────── BMW X5 xDrive40e (F15) AND 740e (G11) ────────────────
// The two BMW plug-ins that predate everything data6.ts researched, and 39
// live listings between them. EPA rates the X5 xDrive40e identically for all
// three of its years and the 740e xDrive identically for all three of its
// years, so each is one row.
//
// Packs and warranty abstain. data6.ts's BMW rows publish 12 kWh gross /
// 9.09 kWh usable, but those are cited to BMW's MY2021 330e and 5-Series
// releases and describe the later generation's pack; reaching back five years
// with them is the same mistake the Volvo block above refuses. BMW's warranty
// abstention is data6.ts's own and unchanged: its pages state both
// 8-year/80,000 and 8-year/100,000 for plug-in hybrids.
{
  const BMW_WARRANTY_ABSTAIN = "BMW's own pages state both 8-year/80,000 and 8-year/100,000 for plug-in hybrids";
  const BMW_OLD_PACK_ABSTAIN =
    "BMW's published 12 kWh / 9.09 kWh figures are for the 2021-on cars; no BMW document consulted this pass states this generation's pack";
  const BMW_OLD_ABSTAINS = {
    packUsableKwh: BMW_OLD_PACK_ABSTAIN,
    batteryWarranty: BMW_WARRANTY_ABSTAIN,
    heatPump: HP_ABSTAIN,
  };
  push(
    // Bare "X5" is guarded on "xDrive40e", and the guard survives the test
    // that matters on /vin/: every petrol F15 trim is xDrive35i, xDrive35d,
    // xDrive50i, sDrive35i or X5 M, and "XDRIVE40E" neither contains nor is
    // contained by any of them. The one string close enough to worry about is
    // the later xDrive45e, which these rows' 2016-2018 window excludes anyway.
    ...withAlt(
      {
        id: "x5-40e-2016-18",
        make: "BMW",
        model: "X5 xDrive40e",
        modelAliases: ["X5 xDrive40e iPerformance", "X5 eDrive", "X5 eDrive40e", "X5 xDrive40e iPerformance Sport", "X5 40e"],
        modelYears: [2016, 2018],
        packVariant: "PHEV",
        plugIn: true,
        drive: "AWD",
        range: epaRange(37068, 14, 540, 56, 29, 24, "Electric-only EPA range. Identical rating 2016–2018"),
        charging: EST_CHARGING,
        abstains: BMW_OLD_ABSTAINS,
      },
      { model: "X5", trim: ["xDrive40e"] }
    ),
    ...withAlt(
      {
        id: "740e-2017-19",
        make: "BMW",
        model: "740e xDrive",
        modelAliases: ["740e", "740e xDrive iPerformance", "740e iPerformance"],
        modelYears: [2017, 2019],
        packVariant: "PHEV",
        plugIn: true,
        drive: "AWD",
        range: epaRange(38045, 14, 340, 64, 33, 27, "Electric-only EPA range. Identical rating 2017–2019"),
        charging: EST_CHARGING,
        abstains: BMW_OLD_ABSTAINS,
      },
      { model: "7 Series", modelAliases: ["7-Series"], trim: ["740e"] }
    )
  );
}

// ──────────── PORSCHE: THE 958-ERA CAYENNE AND 970-ERA PANAMERA ───────────
// data6.ts's Porsche block starts at 2017 for the Cayenne and 2018 for the
// Panamera. These are the years before that, and they use the same helper
// shape and the same abstentions — Porsche's E-Hybrid warranty manuals are
// PDF-only and were not machine-readable, and no Porsche document consulted
// in either pass states this generation's pack.
//
// One shape here is a listing that is wrong about its own car and still
// matches correctly: four "Cayenne E-Hybrid Coupe" listings for MY2016, a
// year in which no Cayenne Coupe existed — the Coupe body arrived for 2020.
// They are 958-era Cayenne S E-Hybrids wearing a body name their dealer's
// feed invented, and data6.ts's `cayenne` helper already lists "Cayenne
// E-Hybrid Coupe" among the bare-nameplate aliases, so the row reaches them
// through the same door as the honest spellings. Nothing is asserted about
// the body; the powertrain facts are the same car either way.
{
  const PORSCHE_ABSTAINS = {
    packUsableKwh: "The 958/970-era pack size was not confirmed from a Porsche document this pass",
    batteryWarranty: "Porsche's E-Hybrid warranty manuals are PDF-only and were not machine-readable",
    heatPump: HP_ABSTAIN,
  };
  // data6.ts's Porsche rows guard their bare-nameplate rows on ["S E-Hybrid",
  // "S"], and the bare "S" is deliberately NOT repeated here. It is one
  // character, so the matcher demands an exact trim of "S" — and a petrol
  // Porsche whose whole trim is "S" is not a hypothetical, it is the Cayenne
  // S and the Panamera S, sold in these exact years in far greater numbers
  // than the hybrid. On the live feed it costs nothing (a petrol Panamera
  // never clears classifyEv), but matchEnrichment is also what /vin/ runs on
  // whatever a shopper pastes in, and there it would hand a 2014 petrol
  // Panamera S the plug-in's 16 electric miles.
  //
  // Nothing is lost by dropping it, because in these years the MODEL string
  // already carries the claim. 2014-2016 is before Porsche sold any other
  // Cayenne or Panamera plug-in — the plain Cayenne E-Hybrid arrives in 2019,
  // the Turbo S E-Hybrid in 2018 — so "Cayenne E-Hybrid" and "Panamera
  // E-Hybrid" can only mean the S here, and they go on the named row as
  // aliases. That is the exact ambiguity data6.ts's helper comment forbids
  // aliasing through in later years, and the reason it forbids it (a plain
  // E-Hybrid listing being dragged onto the S row) does not exist in a year
  // with no plain E-Hybrid to drag.
  const porsche = (id: string, model: string, aliases: string[], years: [number, number], bare: string, range: EnrichmentRow["range"]): EnrichmentRow[] =>
    withAlt(
      {
        id,
        make: "PORSCHE",
        model,
        modelAliases: [...aliases, `${bare} E-Hybrid`, `${bare} E-Hybrid Coupe`, `${bare} e-Hybrid`],
        modelYears: years,
        packVariant: "PHEV",
        plugIn: true,
        range,
        charging: EST_CHARGING,
        abstains: PORSCHE_ABSTAINS,
      },
      { model: bare, modelAliases: [`${bare} Coupe`], trim: ["S E-Hybrid"] }
    );
  push(
    ...porsche("cayenne-s-ehybrid-2016", "Cayenne S E-Hybrid", ["Cayenne S E-Hybrid Coupe"], [2016, 2016], "Cayenne",
      epaRange(36709, 14, 480, 47, 27, 22)),
    // The 970-era Panamera S E-Hybrid: 2014 and 2015 carry an identical
    // rating, 2016 differs on total range and MPGe, so it gets its own row.
    ...porsche("panamera-s-ehybrid-2014-15", "Panamera S E-Hybrid", [], [2014, 2015], "Panamera",
      epaRange(34789, 16, 540, 50, 31, 25, "Electric-only EPA range. Identical rating 2014–2015")),
    ...porsche("panamera-s-ehybrid-2016", "Panamera S E-Hybrid", [], [2016, 2016], "Panamera",
      epaRange(36710, 16, 560, 51, 31, 25))
  );
}

// ──────── MERCEDES: C 350e, GLE 550e, AND THE AMG E PERFORMANCE CARS ───────
// Three separate silences. The C 350e (2016-2018) and GLE 550e (2016-2018)
// are nameplates the corpus held no row for at any year. The AMG GT 63 S E
// Performance is the one Mercedes E Performance car data11/data6 never
// reached, and its MY2024 sibling the AMG C 63 S E Performance has a row for
// 2025-2026 but not for the year the feed is selling.
//
// Warranty: data6.ts's Mercedes rows abstain, and this file keeps that. The
// figures data11.ts publishes for the S-Class come from a specific model
// year's PC Warranty and Service Booklet, and there is no such booklet in
// hand for a 2016 car.
//
// The AMG GT's EPA records split sedan from coupe — 10 miles / 340 total for
// the four-door, 11 / 360 for the two-door — and the feed does not say which
// body a listing is. Both rows exist and a listing with no body word resolves
// to candidates rather than to whichever came first; that is the honest
// answer to a question the listing does not answer.
{
  const MB_WARRANTY_ABSTAIN =
    "No Mercedes-Benz USA warranty booklet for this model year was consulted this pass";
  const MB_ABSTAINS = { batteryWarranty: MB_WARRANTY_ABSTAIN, heatPump: HP_ABSTAIN };
  const mb = (id: string, model: string, aliases: string[], years: [number, number], over: Partial<EnrichmentRow>): EnrichmentRow => ({
    id,
    make: "MERCEDES-BENZ",
    model,
    modelAliases: aliases,
    modelYears: years,
    packVariant: "PHEV",
    plugIn: true,
    charging: EST_CHARGING,
    abstains: { ...MB_ABSTAINS, packUsableKwh: "No Mercedes-Benz USA document consulted this pass states this car's pack size" },
    ...over,
  });

  push(
    // C 350e. EPA re-rated it downward for 2017 — 11 miles becomes 9 — with
    // everything else unchanged, so the two years are two rows rather than
    // one averaged one.
    ...withAlt(
      mb("c350e-2016", "C 350e", ["C350e", "C-Class 350e", "C 350 e"], [2016, 2016], { range: epaRange(38499, 11, 410, 51, 34, 30) }),
      { model: "C-Class", modelAliases: ["C Class", "C-class"], trim: ["C 350e", "350e"] }
    ),
    ...withAlt(
      mb("c350e-2017-18", "C 350e", ["C350e", "C-Class 350e", "C 350 e"], [2017, 2018], {
        range: epaRange(38969, 9, 410, 51, 34, 30, "Electric-only EPA range. Identical rating 2017–2018"),
      }),
      { model: "C-Class", modelAliases: ["C Class", "C-class"], trim: ["C 350e", "350e"] }
    ),
    // GLE 550e. Same shape: 12 miles for 2016-2017, 10 for 2018.
    ...withAlt(
      mb("gle550e-2016-17", "GLE 550e", ["GLE550e", "GLE 550e 4MATIC", "GLE550e 4matic"], [2016, 2017], {
        range: epaRange(37526, 12, 460, 43, 25, 21, "Electric-only EPA range. Identical rating 2016–2017"),
      }),
      { model: "GLE", modelAliases: ["GLE-Class", "GLE Class"], trim: ["550e"] }
    ),
    ...withAlt(
      mb("gle550e-2018", "GLE 550e", ["GLE550e", "GLE 550e 4MATIC", "GLE550e 4matic"], [2018, 2018], {
        range: epaRange(39742, 10, 460, 43, 25, 21),
      }),
      { model: "GLE", modelAliases: ["GLE-Class", "GLE Class"], trim: ["550e"] }
    )
  );

  // AMG GT 63 S E Performance, and the MY2024 AMG C 63 S E Performance year
  // hole. The GT's pack is not published by Mercedes-Benz USA in any document
  // consulted this pass — data6.ts's AMG GLC 63 row cites a Mercedes release
  // for its 6.1 kWh, and that release is about the GLC, so it does not travel.
  // "AMG GT 63" on its own is NOT a plug-in. The C192 AMG GT 63 4MATIC+ is a
  // petrol V8, sold in the same years under the same badge, and only the
  // "S E Performance" suffix separates it. So the named rows are keyed on the
  // full E Performance spelling, and the bare "AMG GT 63" / "AMG GT" strings
  // the feed sends live ONLY on the trim-guarded rows below — the same
  // contract data4.ts's Wrangler comment sets out, and for the same reason:
  // /vin/ hands the matcher whatever vPIC says about a petrol car.
  //
  // Both bodies carry the same guard rather than one taking the listing. EPA
  // rates them apart — 10 miles and 340 total for the four-door, 11 and 360
  // for the coupe — and a listing that says "AMG GT 63" + "S E Performance"
  // has not said which body it is. Two candidates and the existing "exact
  // trim determines which row applies" discriminator is the honest answer;
  // letting the four-door win by declaration order would print its rating on
  // half the coupes.
  const AMG_GT_ALIASES = ["AMG GT 63 S E Performance 4MATIC+", "GT 63 S E Performance", "AMG GT 4-Door 63 S E Performance"];
  const AMG_GT_BARE = { model: "AMG GT 63", modelAliases: ["AMG GT", "GT 63", "AMG GT 4-Door"], trim: ["S E Performance", "63 S E Performance"] };
  push(
    ...withAlt(
      mb("amg-gt63-se-2025-26-sedan", "AMG GT 63 S E Performance", AMG_GT_ALIASES, [2025, 2026], {
        packVariant: "4-door",
        range: epaRange(49161, 10, 340, 29, 20, 18, "Electric-only EPA range, four-door. Identical rating 2025–2026"),
      }),
      AMG_GT_BARE
    ),
    ...withAlt(
      mb("amg-gt63-se-2025-26-coupe", "AMG GT 63 S E Performance Coupe", ["AMG GT Coupe 63 S E Performance"], [2025, 2026], {
        packVariant: "Coupe",
        range: epaRange(49016, 11, 360, 28, 21, 19, "Electric-only EPA range, coupe. Identical rating 2025–2026"),
      }),
      AMG_GT_BARE
    ),
    // MY2024 AMG GT 63 S E Performance and AMG C 63 S E Performance: both on
    // sale, neither rated. fueleconomy.gov's 2024 menu holds no Mercedes E
    // Performance record at all, and the 2025 ratings are for cars a model
    // year newer, so the range abstains.
    ...withAlt(
      mb("amg-gt63-se-2024", "AMG GT 63 S E Performance", AMG_GT_ALIASES, [2024, 2024], {
        abstains: {
          ...MB_ABSTAINS,
          epaRangeMi: "fueleconomy.gov holds no 2024 Mercedes E Performance rating; the 2025 cars rate 10 and 11 miles by body",
          packUsableKwh: "No Mercedes-Benz USA document consulted this pass states this car's pack size",
        },
      }),
      AMG_GT_BARE
    ),
    ...withAlt(
      mb("amg-c63-se-2024", "AMG C 63", ["AMG C63", "AMG C 63 S E Performance", "AMG C63 S E Performance"], [2024, 2024], {
        abstains: {
          ...MB_ABSTAINS,
          epaRangeMi: "fueleconomy.gov holds no 2024 Mercedes E Performance rating; the 2025 C 63 rates 1 mile",
          packUsableKwh: "No Mercedes-Benz USA document consulted this pass states this car's pack size",
        },
      }),
      { model: "C-Class", modelAliases: ["C Class"], trim: ["C 63 S E Performance", "63 S E Performance"] }
    )
  );
}

// ─────────────────── KIA OPTIMA PLUG-IN HYBRID (2017–2020) ────────────────
// Kia's own launch release and its US media specifications page both state
// the pack, in the same words and the same number: "a 9.8 kWh lithium-ion
// polymer battery pack, which produces roughly 60 percent more energy output
// than the battery pack found in the outgoing Optima's hybrid system", and
// the specifications table's "Battery Energy (kWh) 9.8kWh".
//
// The release also says "A full charge can be achieved in less-than three
// hours via a 240V (Level 2) charger" — a time, not a rate, so no onboard
// charger kW is claimed here. And it gives a pre-production range estimate of
// "0 to 27 miles in full EV mode" that EPA later rated at 29; the EPA rating
// is what ships, which is the rule everywhere else in this corpus.
{
  const KIA_PR = "https://www.kiamedia.com/us/en/media/pressreleases/11199/all-new-2017-kia-optima-plug-in-hybrid-makes-global-debut-at-chicago-auto-show";
  const KIA_SPECS = "https://www.kiamedia.com/us/en/models/optima-phev/2017/specifications";
  const optima = (id: string, years: [number, number], range: EnrichmentRow["range"]): EnrichmentRow[] =>
    withAlt(
      {
        id,
        make: "KIA",
        model: "Optima Plug-In Hybrid",
        modelAliases: ["Optima PHEV", "Optima Plug-in Hybrid"],
        modelYears: years,
        packVariant: "PHEV",
        plugIn: true,
        drive: "FWD",
        battery: { packGrossKwh: f(9.8, "mfr", "high", "Kia does not split gross and usable", KIA_SPECS) },
        range,
        charging: EST_CHARGING,
        abstains: {
          batteryWarranty: "No Kia document consulted this pass states the high-voltage battery's warranty terms",
          heatPump: HP_ABSTAIN,
        },
      },
      // Bare "Optima", and the sharpest guard in this file. Kia sold the
      // Optima Hybrid and the Optima Plug-In Hybrid side by side, under one
      // nameplate, in all four of these years — so the token has to separate
      // two cars that are both hybrids and only one of which plugs in.
      //
      // "Plug-In Hybrid" is the obvious choice and it is WRONG, which the
      // test in tests/phev-bare-model-aliases.test.ts caught before this
      // shipped. trimStringsOverlap is substring-tolerant in both directions,
      // and "PLUGINHYBRID" CONTAINS "HYBRID" — so keying on the full phrase
      // hands every conventional Optima Hybrid this row's 29 electric miles
      // and 9.8 kWh pack. The failure runs the opposite way to the usual one:
      // it is not the listing's string reaching too far, it is the row's.
      //
      // "Plug-In" is the fix. It still catches every real spelling — a listing
      // trim of "Plug-In Hybrid EX" contains "PLUGIN" — and "HYBRID" neither
      // contains nor is contained by it. The same edit was made to Volvo's
      // shared token list in data6.ts, where "Plug-in hybrid" had the same
      // latent flaw against a mild-hybrid B5 whose dealer writes "Hybrid".
      { model: "Optima", trim: ["Plug-In", "PHEV"] }
    );
  push(
    ...optima("optima-phev-2017-19", [2017, 2019], epaRange(38406, 29, 610, 103, 61, 40, "Electric-only EPA range. Identical rating 2017–2019")),
    ...optima("optima-phev-2020", [2020, 2020], epaRange(41529, 28, 630, 101, 61, 41))
  );
  void KIA_PR;
}

// ───────────────── FORD FUSION SPECIAL SERVICE PLUG-IN HYBRID ─────────────
// The police-fleet Fusion Energi, which EPA rates as its own vehicle — 26
// electric miles against the retail car's 22, on the same 610-mile total —
// so it is genuinely a different rating and not a badge on the Fusion Energi
// row. One live listing, and it would otherwise print the retail car's
// figures. Battery and warranty defer to nothing: data6.ts's Ford Energi
// rows carry them, but they are cited to retail-car releases and this is a
// fleet variant, so they abstain here rather than borrow.
{
  push({
    id: "fusion-ssv-phev-2019-20",
    make: "FORD",
    model: "Fusion Special Service Plug-In Hybrid",
    modelAliases: ["Special Service Plug-In Hybrid", "Fusion Special Service Vehicle PHEV", "Police Responder Plug-In Hybrid Sedan"],
    modelYears: [2019, 2020],
    packVariant: "PHEV",
    plugIn: true,
    drive: "FWD",
    range: epaRange(41900, 26, 610, 102, 60, 42, "Electric-only EPA range. Identical rating 2019–2020"),
    charging: EST_CHARGING,
    abstains: {
      packUsableKwh: "No Ford document consulted this pass states the fleet car's pack; the retail Fusion Energi's figure is not evidence about it",
      batteryWarranty: "No Ford document consulted this pass states this fleet variant's battery terms",
      heatPump: HP_ABSTAIN,
    },
  });
}

export const RESEARCH_ROWS_13: EnrichmentRow[] = R;
