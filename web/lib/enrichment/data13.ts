import type { EnrichmentRow, Fact, Source } from "../types";

// ── Audi Q5 55 TFSI e quattro, model years 2020–2025 (2026-09-10) ───────────
//
// 315 live listings and not one enrichment row: the whole US life of Audi's
// only plug-in SUV, sitting on the site with an empty card. By year:
// 2020 20, 2021 29, 2022 23, 2023 104, 2024 100, 2025 39. The feed spells the
// car four ways and dealers pick almost at random —
//
//   "Q5 TFSI e"  220    "Q5 e"  55    "Q5"  39    "Q5 S-Line"  1
//
// — so the row set has to answer to all four, and two of those four are names
// a petrol Q5 also wears.
//
// ── WHAT AUDI ACTUALLY CHANGED, AND WHEN ───────────────────────────────────
// The pack boundary is NOT where this batch's brief guessed it (2022/2023).
// It is one model year earlier, and Audi says so in its own MY2022 change
// log (release 474, 28 April 2021): the Q5 55 TFSI e "gets a battery upgrade
// to 17.9 kWh battery (+3.8 kWh)", and the same release's price table reads
// "Audi Q5 55 TFSI e quattro 2.0-liter, 4 CYL + 17.9 kWh battery S tronic®".
// 14.1 + 3.8 = 17.9, so the arithmetic names the year it left behind.
//
// Two independent EPA quantities move at the same seam and nowhere else,
// which is how the boundary was checked rather than assumed: electric range
// 20 / 19 / 23 / 22 / — / 23 across 2020-2025, and the 240 V full-charge time
// 2.4 h for 2020 and 2021, then 3.0 h for 2022, 2023 and 2025. A pack that
// grows 27% at an unchanged charge rate is exactly a 2.4 → 3.0 h step.
//
// So the rows split 2020 | 2021 | 2022 | 2023 | 2024 | 2025 — six of them,
// one per year, because EPA re-rated the car nearly every year and combining
// years would mean printing one year's miles on another's window sticker.
//
// ── THE 2024 HOLE IS EPA'S, NOT AUDI'S ─────────────────────────────────────
// There is no 2024 Audi plug-in record on fueleconomy.gov at all. Checked
// twice, two ways: the REST menu for year=2024&make=Audi lists Q5 quattro,
// Q5 S line quattro and Q5 Sportback S line quattro and every option under
// them is `fuelType: Premium` (2023 and 2025 both carry a plug-in option, so
// the walk works), and EPA's own full vehicles.csv holds Audi plug-ins for
// 2016-2023 and 2025 with 2024 simply absent. The car was certified — vPIC
// prints its EPA test group, RVGAT02.0A3P, on every MY2024 VIN — the
// consumer record was never published. 100 live 2024 cars therefore get an
// `epaRangeMi` abstention rather than 2023's 22 miles or 2025's 23, which is
// the whole point of the field: a range is the number a PHEV shopper acts on.
//
// ── HEAT PUMP: SOURCED FOR 2020-21, ABSTAINED AFTER ────────────────────────
// Audi states it plainly for the first two years and never again. MY2020
// (release 381): "The climate control system uses a highly efficient heat
// pump that pools the waste heat from the high-voltage components." MY2021
// (release 443): "equipped with an integrated heat pump that uses battery
// heat to efficiently warm the cabin." Nothing in the MY2022, MY2023, MY2024
// or MY2025 change logs (releases 474, 518, 573, 612), the archived MY2024
// and MY2025 audiusa.com pages, or any of Audi of America's 420 press
// releases mentions the Q5 PHEV's climate hardware again.
//
// That silence is NOT read as a yes here, and the reason is this exact make:
// Audi's own MY2022 Q4 e-tron US release named an "available" heat pump, the
// production car then shipped resistive PTC heaters from about February 2023,
// MY2024 had none, and it returned only as an option on the MY2025 Q4 55.
// A running change inside a generation, with no press release marking it.
// data10's Q4 rows abstain for that; so do these, for 2022 through 2025.
//
// ── BATTERY WARRANTY: NO AUDI DOCUMENT SAYS IT, FOR ANY YEAR ───────────────
// Audi of America publishes the 8-year/100,000-mile high-voltage term in
// exactly one place, its EV FAQ, and that page scopes itself in its own
// footnote: "8-year/100,000-mile (whichever occurs first) high-voltage
// battery limited warranty coverage on MY21 and newer Audi e-tron vehicles."
// The Q5 55 TFSI e is a TFSI e, not an e-tron — Audi's ERG treats the two
// letterings as different classes of car — so borrowing that sentence would
// be extending a maker's claim past the vehicles the maker attached it to.
// audiusa.com/en/service/warranty/ and its New Vehicle Limited Warranty layer
// state only 4 yr/50,000 mi basic plus 12 yr corrosion and never mention the
// high-voltage battery; every Audi of America release 2018-2026 was scanned
// for a warranty sentence naming a battery and the only hits are a boilerplate
// capacity-loss disclaimer; and web.archive.org's index of audiusa.com's
// asset tree holds CPO booklets through 2018 and no new-vehicle Warranty &
// Maintenance booklet. So all six rows abstain. data3's e-tron GT row hit the
// same wall and published `agg`/`low` with a buyerNote; an abstention is the
// better shape, because it is a decision the coverage report counts.
//
// ── KEYS: POSITION 8 IS THE ENGINE, AND IT IS THE WHOLE ANSWER ─────────────
// Every one of the 315 live cars is WA1 + one of five descriptors, and all
// 315 carry a real 17-character VIN (checked; no placeholder ids):
//
//   E2AFY 180   G2AFY 73   F2AFY 51   E2BFY 6   F2BFY 5
//
// Position 4 is the grade — E Premium Plus, F Prestige, G Premium — and
// vPIC's own Trim decode says so ("S Line quattro Premium Plus" for E2AFY).
// Position 8 is the engine: Y. Sweeping position 8 across all 33 legal VIN
// characters at each live prefix for MY2021 and MY2024 (vPIC
// DecodeVinValues, 2026-09-10) returns three filed values and no others —
//
//   WA1E2AFY  Q5 e, 55 TFSI, PHEV        WA1F2AFY  Q5 e, 55 TFSI, PHEV
//   WA1E2AF3  45 TFSI (petrol)           WA1F2AF3  45 TFSI (petrol)
//   WA1E2AFZ  Q4 (a different nameplate) WA1F2AFZ  Q4
//
// — so the petrol Q5 the feed shares a name with decodes on a different
// position 8, and it is a hard filter that keeps it out. The control ran the
// other way too: fixing positions 5-8 at 2AFY and 2BFY and sweeping position
// 4 across all 33 characters for every year 2020-2025 returns E, F and G and
// nothing else, and every hit is PHEV. G2BFY is listed below although no live
// car wears it, because Audi filed the pattern and a Premium arriving on it
// should not fall through to nothing.
//
// THE BARE "Q5" ALIAS IS DELIBERATE AND IS SAFE ONLY BECAUSE OF `vds`.
// 39 live cars are filed by their dealer as model "Q5" and one as "Q5 S-Line"
// — petrol-shared names — and the matcher filters on the model string BEFORE
// it looks at the VIN, so a row that does not carry those aliases can never
// see those cars at all. The aliases are therefore paired with a `vds` key
// that no petrol Q5 VIN can satisfy: model gets the row into the running, the
// descriptor decides. A petrol Q5 typed into /vin/ matches none of these
// rows. The one residual: a listing whose id is not a 17-character VIN skips
// every VIN filter (match.ts guards the slice), so a placeholder-id "Q5"
// would reach the year's row on the model string alone. No such listing
// exists among the 315, and the browse feed only carries electrified cars, so
// the case is theoretical — but it is the cost of the alias and it is written
// down rather than discovered later.
//
// NO `trim` KEY ON ANY ROW, for the reason data12's EV3 rows carry none: the
// matcher applies a row's trim list before its VIN keys, and 267 of the 315
// live cars have an empty trim field. A trim key would reject them.
// Nothing about these rows varies by grade anyway — Premium, Premium Plus and
// Prestige share one pack, one rating and one plug.
//
// ── WHAT IS DELIBERATELY NOT HERE ──────────────────────────────────────────
// NO Q5 SPORTBACK PHEV ROW. The US Q5 Sportback was never sold as a plug-in:
// Audi's price tables for MY2022, MY2023, MY2024 and MY2025 (releases 474,
// 518, 573, 612) each list "Q5 Sportback S line 45 TFSI" and no Sportback
// TFSI e, EPA has no Sportback plug-in record in any year, and the two live
// descriptors with a B in position 6 (E2BFY, F2BFY — 11 cars) decode on vPIC
// as Series "SUV", BodyClass "Sport Utility Vehicle", 4 doors, exactly like
// their A-position twins. B is not the Sportback body here.
//
// NO `dcFastCharging`. The car has no DC port, but Audi's documents say what
// it CAN do ("can be charged at any SAE J1772 home or public charger") and
// never state the absence, and a yes/no fact is never inferred. The field is
// expected-tier, so leaving it out costs the row nothing; writing "none" on
// Audi's silence would be a claim Audi did not make.
//
// NO CHEMISTRY, NO DC PEAK, NO 10-80% TIME — Audi publishes none of them for
// this car, and the pack voltage is stated once (MY2020, 381 V) and never
// again, so it rides on the MY2020 row alone rather than being carried
// forward as if Audi had repeated it.
//
// Research note, with every quote and its URL:
// docs/agents/research-audi-q5-tfsi-e-2026-09-10.md

const AS_OF = "2026-09-10";

const f = <T,>(
  value: T,
  source: Source,
  confidence: Fact<T>["confidence"],
  note?: string,
  sourceUrl?: string
): Fact<T> => ({ value, source, asOf: AS_OF, confidence, note, sourceUrl });

// Audi of America releases, read through media.audiusa.com's own API
// (/api/releases/<id>); the human URLs below are the same documents.
const PR_2020_LAUNCH = "https://media.audiusa.com/en-us/releases/381";
const PR_2021_PHEV = "https://media.audiusa.com/en-us/releases/443";
const PR_MY2022 = "https://media.audiusa.com/en-us/releases/474";
const PR_MY2023 = "https://media.audiusa.com/en-us/releases/518";
const PR_MY2024 = "https://media.audiusa.com/en-us/releases/573";
const PR_MY2025 = "https://media.audiusa.com/en-us/releases/612";

const epa = (id: number) => `https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=${id}`;

// Audi states the plug for the two years it introduced the car and never
// restates it. What IS restated, per model year, is the complete list of
// what changed on the Q5 55 TFSI e — and none of releases 474, 518, 573 or
// 612 touches the charging system. Audi's first NACS provision of any kind
// (release 643, September 2025) is an adapter for e-tron BEVs and names no
// plug-in. Confidence drops to medium on the years Audi did not say it.
const J1772_2020 = f<"J1772">(
  "J1772",
  "mfr",
  "high",
  "“The Audi Q5 TFSI e is standard equipped with a compact charging system and can be charged at any SAE J1772 charging station.”",
  PR_2020_LAUNCH
);
const J1772_2021 = f<"J1772">(
  "J1772",
  "mfr",
  "high",
  "“The PHEV models can be charged at any SAE J1772 home or public charger …”",
  PR_2021_PHEV
);
const J1772_CARRIED = f<"J1772">(
  "J1772",
  "mfr",
  "medium",
  "Audi states the plug for this car in the MY2021 release — “The PHEV models can be charged at any SAE J1772 home or public charger …” — and its model-year change logs for MY2022, MY2023, MY2024 and MY2025 record no charging-system change on the Q5 55 TFSI e; Audi's first NACS provision (Sept 2025) is a BEV-only adapter",
  PR_2021_PHEV
);

// Audi publishes 7.7 kW for the 14.1 kWh car and never republishes it. EPA's
// own 240 V full-charge time moves 2.4 h → 3.0 h at the 2022 pack change,
// which is what an unchanged rate looks like against a 14.1 → 17.9 kWh pack.
const AC_2021 = f(
  7.7,
  "mfr",
  "high",
  "“Their onboard 7.7 kW charger allows them to replenish battery power from empty to 100% in just 2.4 hours when using a 240-volt outlet.”",
  PR_2021_PHEV
);
const AC_CARRIED = f(
  7.7,
  "mfr",
  "medium",
  "Audi published 7.7 kW for the 14.1 kWh car (MY2021 release); no model-year change log after that records a charger change, and EPA's 240V full-charge time steps 2.4 h → 3.0 h exactly as the pack grows 14.1 → 17.9 kWh at an unchanged rate",
  PR_2021_PHEV
);

const WARRANTY_ABSTAIN =
  "Audi of America publishes no high-voltage battery term for the Q5 55 TFSI e. Its 8-year/100,000-mile figure appears only in the EV FAQ, whose own footnote scopes it to “MY21 and newer Audi e-tron vehicles”, and this car is a TFSI e rather than an e-tron; audiusa.com's warranty page states only the 4-year/50,000-mile basic and 12-year corrosion terms; every Audi of America press release from 2018 to 2026 was scanned and none states a battery term; and no new-vehicle Warranty & Maintenance booklet for MY2020-2025 is published on audiusa.com or held in web.archive.org's index of its asset tree. Audi's own Certified pre-owned booklet says the high-voltage battery “might be covered by the New Vehicle Limited Warranty … Please check with your Audi dealer to determine specific warranty coverage”, which is a maker declining to state the term, not a term";

const HEATPUMP_ABSTAIN =
  "Audi names a heat pump on this car only in its MY2020 and MY2021 launch releases and states nothing about its climate hardware in the MY2022, MY2023, MY2024 or MY2025 change logs, the archived MY2024 and MY2025 audiusa.com pages, or any other Audi document found this pass. Silence is not carried forward as a yes on this make: Audi's MY2022 Q4 e-tron release named an available heat pump, the US car then shipped resistive PTC heaters from about February 2023 and MY2024 had none, all without a release marking the change.";

const EPA_2024_ABSTAIN =
  "fueleconomy.gov has no 2024 Audi plug-in record of any kind: the REST menu for year=2024 make=Audi returns Q5 quattro, Q5 S line quattro and Q5 Sportback S line quattro and every option under them is petrol, and EPA's full vehicles.csv carries Audi plug-ins for 2016-2023 and 2025 with 2024 absent. The car was certified — vPIC prints EPA test group RVGAT02.0A3P on MY2024 VINs — but no consumer rating was published, and 2023's 22 miles or 2025's 23 would be another year's number printed on this one.";

// Every row: same make, same four feed spellings, same five-plus-one filed
// descriptors, same quattro-only drivetrain, same kind of car.
const Q5_PHEV = {
  make: "AUDI",
  model: "Q5 TFSI e",
  modelAliases: ["Q5 e", "Q5", "Q5 S-Line", "Q5 Plug-in Hybrid"],
  vds: ["E2AFY", "E2BFY", "F2AFY", "F2BFY", "G2AFY", "G2BFY"],
  drive: "AWD" as const,
  packVariant: "PHEV",
  plugIn: true,
};

export const RESEARCH_ROWS_13: EnrichmentRow[] = [
  {
    id: "audi-q5-tfsi-e-2020",
    vinRequired: true, // a combustion car wears this name; the VIN keys keep it out (types.ts)
    ...Q5_PHEV,
    modelYears: [2020, 2020],
    battery: {
      packGrossKwh: f(
        14.1,
        "mfr",
        "high",
        "“The lithium-ion battery pack, located under the luggage compartment floor, is made up of 104 prismatic cells and stores 14.1 kWh of energy with a voltage of 381 volts.” Audi does not say gross or usable",
        PR_2020_LAUNCH
      ),
    },
    range: {
      epaRangeMi: f(20, "mfr", "high", "EPA rangeA (electric-only), 2020 Audi Q5 plug-in hybrid; Audi's own release states the same figure — “EPA estimated 20-mile electric-only mode driving range”", epa(42448)),
      epaRangeTotalMi: f(390, "mfr", "high", "EPA combined gasoline + electricity range", epa(42448)),
      mpgeElectric: f(65, "mfr", "high", "EPA combA08, running on the battery", epa(42448)),
      mpgeCombined: f(38, "mfr", "high", "EPA phevComb, its blended gasoline-electricity composite", epa(42448)),
      mpgGasoline: f(27, "mfr", "high", "EPA comb08, on gasoline once the battery is depleted", epa(42448)),
    },
    charging: {
      portStandard: J1772_2020,
      architectureV: f(381, "mfr", "high", "“stores 14.1 kWh of energy with a voltage of 381 volts”", PR_2020_LAUNCH),
    },
    thermal: {
      heatPump: f<"standard">(
        "standard",
        "mfr",
        "high",
        "“The climate control system uses a highly efficient heat pump that pools the waste heat from the high-voltage components. With 1 kW of electrical energy, it can generate up to 3 kW of thermal heating output”",
        PR_2020_LAUNCH
      ),
    },
    abstains: { batteryWarranty: WARRANTY_ABSTAIN },
  },
  {
    id: "audi-q5-tfsi-e-2021",
    vinRequired: true, // a combustion car wears this name; the VIN keys keep it out (types.ts)
    ...Q5_PHEV,
    modelYears: [2021, 2021],
    battery: {
      packGrossKwh: f(
        14.1,
        "mfr",
        "high",
        "“All three vehicles come with a 14.1 kWh battery pack that sits under the rear cargo area” — the 2021 Q5, A7 and A8 TFSI e. Audi does not say gross or usable",
        PR_2021_PHEV
      ),
    },
    range: {
      epaRangeMi: f(19, "mfr", "high", "EPA rangeA (electric-only), 2021 Audi Q5 plug-in hybrid", epa(43424)),
      epaRangeTotalMi: f(400, "mfr", "high", "EPA combined gasoline + electricity range", epa(43424)),
      mpgeElectric: f(50, "mfr", "high", "EPA combA08, running on the battery", epa(43424)),
      mpgeCombined: f(37, "mfr", "high", "EPA phevComb, its blended gasoline-electricity composite", epa(43424)),
      mpgGasoline: f(27, "mfr", "high", "EPA comb08, on gasoline once the battery is depleted", epa(43424)),
    },
    charging: { portStandard: J1772_2021, acOnboardKw: AC_2021 },
    thermal: {
      heatPump: f<"standard">(
        "standard",
        "mfr",
        "high",
        "“All three vehicles come with a 14.1 kWh battery pack that sits under the rear cargo area and are equipped with an integrated heat pump that uses battery heat to efficiently warm the cabin.”",
        PR_2021_PHEV
      ),
    },
    abstains: { batteryWarranty: WARRANTY_ABSTAIN },
  },
  {
    id: "audi-q5-tfsi-e-2022",
    vinRequired: true, // a combustion car wears this name; the VIN keys keep it out (types.ts)
    ...Q5_PHEV,
    modelYears: [2022, 2022],
    battery: {
      packGrossKwh: f(
        17.9,
        "mfr",
        "high",
        "The MY2022 change log: the Q5 55 TFSI e “gets a battery upgrade to 17.9 kWh battery (+3.8 kWh)”, and the same release's price table reads “Audi Q5 55 TFSI e quattro 2.0-liter, 4 CYL + 17.9 kWh battery S tronic®”. Audi does not say gross or usable",
        PR_MY2022
      ),
    },
    range: {
      epaRangeMi: f(23, "mfr", "high", "EPA rangeA (electric-only), 2022 Audi Q5 TFSI e quattro — first year of the 17.9 kWh pack", epa(44159)),
      epaRangeTotalMi: f(390, "mfr", "high", "EPA combined gasoline + electricity range", epa(44159)),
      mpgeElectric: f(61, "mfr", "high", "EPA combA08, running on the battery", epa(44159)),
      mpgeCombined: f(38, "mfr", "high", "EPA phevComb, its blended gasoline-electricity composite", epa(44159)),
      mpgGasoline: f(26, "mfr", "high", "EPA comb08, on gasoline once the battery is depleted", epa(44159)),
    },
    charging: { portStandard: J1772_CARRIED, acOnboardKw: AC_CARRIED },
    abstains: { heatPump: HEATPUMP_ABSTAIN, batteryWarranty: WARRANTY_ABSTAIN },
  },
  {
    id: "audi-q5-tfsi-e-2023",
    vinRequired: true, // a combustion car wears this name; the VIN keys keep it out (types.ts)
    ...Q5_PHEV,
    modelYears: [2023, 2023],
    battery: {
      packGrossKwh: f(
        17.9,
        "mfr",
        "high",
        "MY2023 price table: “Q5 S line 55 TFSI e quattro 2.0-liter, 4 CYL + 17.9 kWh battery S tronic®”. Audi does not say gross or usable",
        PR_MY2023
      ),
    },
    range: {
      epaRangeMi: f(28, "mfr", "high", "EPA's printed all-electric range, “All Elec: 0-28 mi” (its city/highway electric figures are ~28 too). The API's rangeA (22) is EPA's “Elec + Gas” charge-depleting figure, not the electric-only range — see the types.ts note", epa(47213)),
      epaRangeTotalMi: f(400, "mfr", "high", "EPA combined gasoline + electricity range", epa(47213)),
      mpgeElectric: f(60, "mfr", "high", "EPA combA08, running on the battery", epa(47213)),
      mpgeCombined: f(38, "mfr", "high", "EPA phevComb, its blended gasoline-electricity composite", epa(47213)),
      mpgGasoline: f(26, "mfr", "high", "EPA comb08, on gasoline once the battery is depleted", epa(47213)),
    },
    charging: { portStandard: J1772_CARRIED, acOnboardKw: AC_CARRIED },
    abstains: { heatPump: HEATPUMP_ABSTAIN, batteryWarranty: WARRANTY_ABSTAIN },
  },
  {
    id: "audi-q5-tfsi-e-2024",
    vinRequired: true, // a combustion car wears this name; the VIN keys keep it out (types.ts)
    ...Q5_PHEV,
    modelYears: [2024, 2024],
    battery: {
      packGrossKwh: f(
        17.9,
        "mfr",
        "high",
        "MY2024 price table: “Q5 S line 55 TFSI e 2.0L TFSI, 4 CYL PHEV / 17.9 kWh battery 362 hp / 369 lb.-ft.”. Audi does not say gross or usable",
        PR_MY2024
      ),
    },
    charging: { portStandard: J1772_CARRIED, acOnboardKw: AC_CARRIED },
    abstains: {
      epaRangeMi: EPA_2024_ABSTAIN,
      heatPump: HEATPUMP_ABSTAIN,
      batteryWarranty: WARRANTY_ABSTAIN,
    },
  },
  {
    id: "audi-q5-tfsi-e-2025",
    vinRequired: true, // a combustion car wears this name; the VIN keys keep it out (types.ts)
    ...Q5_PHEV,
    modelYears: [2025, 2025],
    battery: {
      packGrossKwh: f(
        17.9,
        "mfr",
        "high",
        "MY2025 price table: “Q5 S line 55 TFSI e 2.0L TFSI, 4 CYL PHEV 17.9 kWh battery //362 hp / 369 lb.-ft.”; Audi's own MY2025 Q5 Plug-in Hybrid page printed the same figure as a headline tile, “Battery size 17.9 kWh”. Audi does not say gross or usable",
        PR_MY2025
      ),
    },
    range: {
      epaRangeMi: f(28, "mfr", "high", "EPA's printed all-electric range, “All Elec: 0-28 mi” (its city/highway electric figures are ~28 too). The API's rangeA (23) is EPA's “Elec + Gas” charge-depleting figure, not the electric-only range — see the types.ts note", epa(48653)),
      epaRangeTotalMi: f(390, "mfr", "high", "EPA combined gasoline + electricity range", epa(48653)),
      mpgeElectric: f(58, "mfr", "high", "EPA combA08, running on the battery", epa(48653)),
      mpgeCombined: f(38, "mfr", "high", "EPA phevComb, its blended gasoline-electricity composite", epa(48653)),
      mpgGasoline: f(26, "mfr", "high", "EPA comb08, on gasoline once the battery is depleted", epa(48653)),
    },
    charging: { portStandard: J1772_CARRIED, acOnboardKw: AC_CARRIED },
    abstains: { heatPump: HEATPUMP_ABSTAIN, batteryWarranty: WARRANTY_ABSTAIN },
  },
];
