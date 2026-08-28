import type { EnrichmentRow, Fact, Source } from "../types";

// Eleventh research tranche (2026-08-25): the biggest remaining "no row at
// all" groups on scripts/live-enrichment-gap.mjs — Lucid Gravity, Subaru
// Trailseeker, the whole Audi e-tron SUV line (Q4/Q6/SQ6/Q8), Dodge Charger
// Daytona, the electric Lexus ES, and the MY2027 Ioniq 5.
//
// Sourcing, the two lanes data6 and data9 set up:
//  - Every EPA figure comes from fueleconomy.gov's REST API (menu/model ->
//    menu/options -> /vehicle/{id}) and cites the Find.do page for the id it
//    came from. Nothing was read off a search-result snippet.
//  - Every battery, charging, thermal and warranty fact was read out of a
//    manufacturer page or PDF fetched this pass. PDFs were rendered to images
//    and read as pictures, never trusted to pdftotext's column order (the
//    Audi and Subaru spec tables here are four-column and would linearize
//    wrong). Where a document does not state a thing, the row abstains.
//
// RANGE VARIES BY WHEEL on nearly every car in this file, so each row prints
// the maker's own STANDARD fitment and labels it. Three of those standard
// fitments were only findable this pass because the maker states them
// outright, and one of them moved between model years — see the Gravity
// Grand Touring comment, which is the trap in this tranche.
const AS_OF = "2026-08-25";

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

// ═══════════════════════════════ AUDI ═══════════════════════════════════
// Four nameplates, 1,200+ live listings, and exactly one Audi row in the
// corpus before this pass (the 2024 e-tron GT in data3).
//
// THE CONNECTOR IS THE BUYER FACT HERE, and Audi states it plainly enough to
// quote: "All Audi BEVs on the road today have charging ports designed to
// work with Combined Charging Standard (CCS1) connectors." Every row below is
// CCS1 on Audi's own word, not by inference from the absence of a NACS claim.
//
// And the Q4 is worse off than its siblings in a way no other row in this
// corpus records: Audi's own NACS FAQ says "The Q4 e-tron is not currently
// able to utilize the Audi NACS DC adapter or any other NACS adapter." Not
// "no adapter is bundled" — the car cannot use one at all, so a Q4 owner has
// no path onto the Supercharger network while a Q6 owner has a $200 one.
// That is superchargerAccess "none" with a manufacturer citation, and it is
// the kind of thing a shopper cross-shopping a Q4 against a Q6 would never
// learn from a dealer listing.
//
// HEAT PUMP is stated for exactly one of these cars and abstained on the rest.
// The control test passed: Audi's MY2024 Q8 e-tron release says the car
// "offers standard four-zone automatic climate control with a heat pump and
// comfort pre-conditioning", so Audi does use the term in US material and its
// absence elsewhere is at least meaningful. It is still not a statement, so
// the Q4/Q6/SQ6 rows abstain rather than print "none" — the Volvo lesson
// (data6) is that a marque that names a heat pump in one place can still be
// silent about one it fits.
{
  const AUDI_EV_FAQ = "https://www.audiusa.com/en/ev-hub/faqs/";
  const AUDI_NACS_FAQ = "https://www.audiusa.com/en/ev-hub/layer/nacs-faqs/";
  const AUDI_NACS_PR = "https://media.audiusa.com/releases/643";
  const Q6_PR = "https://media.audiusa.com/releases/618";
  const Q6_2027_PAGE = "https://www.audiusa.com/en/models/q6-e-tron/q6-e-tron/2027/overview/";
  const SQ6_2027_PAGE = "https://www.audiusa.com/en/models/q6-e-tron/sq6-e-tron/2027/overview/";
  const Q4_2026_PAGE = "https://www.audiusa.com/en/models/q4/q4-e-tron/2026/overview/";
  const Q4_2024_PR = "https://media.audiusa.com/releases/597";
  const Q4_2023_SPECS =
    "https://media.audiusa.com/assets/documents/original/10203-2023Q4etronTechnicalSpecifications.pdf";
  // The MY2022 pack figure is cited to a sales-start release rather than to
  // the MY2022 technical-specification sheet, and the difference is one word.
  // The 2022 spec sheet's row reads "Battery size (kWh)" — the 2023 sheet's
  // reads "Battery size (kWh gross)" — so filing 82 as a GROSS figure on the
  // strength of the 2022 sheet would be reading a qualifier Audi did not
  // print that year. A release table does print it: "Battery (gross
  // capacity) / 82 kWh".
  //
  // AND THAT RELEASE IS THE MY2023 ONE, which the constant used to deny by
  // its name (2026-08-25). media.audiusa.com/view/releases/547 is dated
  // September 30, 2022, announces "the anticipated on sale date for the 2023
  // Q4 e-tron portfolio has arrived", carries a "2023 Model Year Highlights"
  // section, and its key-specifications table prints MY2023's EPA figures —
  // 265 for the new 40, 236 for the 50, 242 for the Sportback 50 — not
  // MY2022's 241. Calling it Q4_2022_PR made a MY2023 document look like a
  // MY2022 one at the only place a reader would check.
  //
  // It still carries the MY2022 pack, and the row says why in its own note
  // rather than in a constant's name: 82 kWh gross is one physical pack
  // across the 40/45/50/55 and every model year in this block — the same
  // reason the MY2023 spec sheet is cited for the MY2023-24 rows and the
  // MY2024 refresh release for the 55. What is carried across is the word
  // "gross", not a figure; the figure is 82 in the 2022 sheet too.
  const Q4_2023_SALES_START_PR = "https://media.audiusa.com/view/releases/547";
  const Q4_2022_PACK_NOTE =
    "“Battery (gross capacity) / 82 kWh” — Audi's MY2023 sales-start release, filing the same physical pack; "
    + "the MY2022 specification sheet prints the same 82 under a row reading only “Battery size (kWh)”";
  const Q4_2022_SPECS =
    "https://media.audiusa.com/assets/documents/original/9397-2022Q4etronTechnicalSpecifications.pdf";
  const Q8_2024_SPECS =
    "https://media.audiusa.com/assets/documents/original/10700-2024Q8etronTechnicalSpecsFINAL0330231.pdf";
  const Q8_2024_PR = "https://media.audiusa.com/en-us/releases/566";

  const AUDI_HP_ABSTAIN =
    "Audi names a heat pump for the Q8 e-tron but no Audi document consulted this pass states one for this model";
  // "8-year/100,000-mile (whichever occurs first) high-voltage battery limited
  // warranty coverage on MY21 and newer Audi e-tron vehicles" — one sentence
  // covering every model year in this block, which is why it is one constant.
  const AUDI_WARRANTY = {
    batteryYears: f(8, "mfr", "high", undefined, AUDI_EV_FAQ),
    batteryMiles: f(100_000, "mfr", "high", undefined, AUDI_EV_FAQ),
  };
  const AUDI_CCS1 = f<"CCS1">("CCS1", "mfr", "high", undefined, AUDI_NACS_FAQ);

  // ───────────────────────── Q6 e-tron / SQ6 e-tron ─────────────────────
  // PPE, 800V, one pack across the whole line: "a total gross capacity of
  // 100 kWh (94.4 kWh net)", "A maximum DC fast-charging capacity of 270 kW
  // (260kW on RWD models)", "10 to 80 percent state of charge (SoC) in as
  // little as 21 minutes", "Standard Level 2 AC charging … supported at rates
  // up to 9.6kW", "the ratio of nickel to cobalt and manganese in the battery
  // cells is approximately 8:1:1". MY2027 carries all of it: Audi's own 2027
  // page still says the car charges "its 100kWh battery from 10% to 80% in
  // about 21 minutes".
  //
  // MY2026 IS A HOLE IN EPA'S DATA, not in Audi's lineup, and the rows say so
  // rather than stretching a neighbouring year over it. Control test run this
  // pass: EPA's 2026 Audi model list carries Q4 45/55 e-tron and the e-tron
  // GT family but no Q6 or SQ6 at all, while 2025 and 2027 both carry the full
  // Q6 line — so the absence is EPA's, not a fetch failure. Stretching either
  // neighbour would be a real error and not a small one: the quattro is 307 mi
  // on 19s in 2025 and 325 in 2027, so whichever year you borrowed you would
  // be wrong by 18 miles in a known direction.
  const Q6_BATTERY = {
    packGrossKwh: f(100, "mfr", "high", undefined, Q6_PR),
    packUsableKwh: f(94.4, "mfr", "high", undefined, Q6_PR),
    chemistry: f<"NCM">("NCM", "mfr", "medium", "Nickel:cobalt:manganese about 8:1:1", Q6_PR),
  };
  const q6Charging = (dcPeakKw: number) => ({
    portStandard: AUDI_CCS1,
    superchargerAccess: f<"adapter">("adapter", "mfr", "high", "Audi NACS DC adapter, DC stations only", AUDI_NACS_PR),
    dcPeakKw: f(dcPeakKw, "mfr", "high", undefined, Q6_PR),
    chargeTime1080Min: f(21, "mfr", "high", "10–80% at Audi's rated DC peak", Q6_PR),
    acOnboardKw: f(9.6, "mfr", "high", "240V/40A; a 19.2 kW charger is optional", Q6_PR),
    architectureV: f(800, "mfr", "high", undefined, Q6_PR),
    plugAndCharge: f(true, "mfr", "high", undefined, Q6_PR),
    dcFastCharging: f<"standard">("standard", "mfr", "high", undefined, Q6_PR),
  });

  const q6 = (o: {
    id: string;
    model: string;
    modelAliases?: string[];
    trim?: string[];
    years: [number, number];
    drive?: "AWD" | "RWD";
    dcPeakKw: number;
    range?: EnrichmentRow["range"];
    rangeAbstain?: string;
    buyerNotes?: EnrichmentRow["buyerNotes"];
  }): EnrichmentRow => ({
    id: o.id,
    make: "AUDI",
    model: o.model,
    modelAliases: o.modelAliases,
    trim: o.trim,
    modelYears: o.years,
    drive: o.drive,
    battery: Q6_BATTERY,
    range: o.range,
    charging: q6Charging(o.dcPeakKw),
    warranty: AUDI_WARRANTY,
    abstains: o.rangeAbstain
      ? { heatPump: AUDI_HP_ABSTAIN, epaRangeMi: o.rangeAbstain }
      : { heatPump: AUDI_HP_ABSTAIN },
    buyerNotes: o.buyerNotes,
  });

  const Q6_2026_RANGE_ABSTAIN =
    "EPA published no MY2026 Q6 e-tron record at all (its 2026 Audi list carries the Q4 and e-tron GT but no Q6), and the MY2025 and MY2027 ratings differ by 18 miles, so neither year can stand in for it";

  R.push(
    q6({
      id: "audi-q6-etron-2025-rwd",
      model: "Q6 e-tron",
      years: [2025, 2025],
      drive: "RWD",
      dcPeakKw: 260,
      range: { epaRangeMi: f(310, "mfr", "high", "19-inch wheels, standard", epa(48683)) },
      buyerNotes: [
        {
          headline: "The 321-mile figure Audi advertises needs the ultra package's 18-inch wheels and summer tires; on the standard 19s it is 310",
          severity: "info",
          learnMore: Q6_PR,
        },
      ],
    }),
    // Trim-keyed on "quattro" only because this is the one model year where
    // an RWD row and an AWD row compete for the same model string. Audi's own
    // badge is in the dealer trim ("Premium Plus quattro®"), so it settles
    // which car a listing is even when the feed carries no drivetrain field.
    // The MY2026/2027 rows are deliberately not keyed that way: the Q6 has no
    // RWD sibling in those years, and a trim key there would lock out the 44
    // live MY2027 listings whose trim field is empty.
    q6({
      id: "audi-q6-etron-2025-awd",
      model: "Q6 e-tron",
      // No trim key: cleanTrim's AUDI_NOISE deletes the word "quattro" before
      // matching, so a ["quattro"] key can never fire — the 2026-08-25 audit
      // found 112 live quattro Q6s falling through to the RWD row's 310/260
      // because of it. drive: "AWD" vs the sibling's "RWD" separates the pair;
      // a drive-less listing correctly presents both as candidates.
      years: [2025, 2025],
      drive: "AWD",
      dcPeakKw: 270,
      range: { epaRangeMi: f(307, "mfr", "high", "19-inch wheels, standard", epa(48297)) },
    }),
    q6({
      id: "audi-q6-sportback-etron-2025",
      model: "Q6 Sportback e-tron",
      modelAliases: ["Q6 e-tron Sportback", "Q6 e-tron SB"],
      years: [2025, 2025],
      drive: "AWD",
      dcPeakKw: 270,
      range: { epaRangeMi: f(319, "mfr", "high", "19-inch wheels, standard", epa(48686)) },
    }),
    q6({
      id: "audi-sq6-etron-2025",
      model: "SQ6 e-tron",
      years: [2025, 2025],
      drive: "AWD",
      dcPeakKw: 270,
      range: { epaRangeMi: f(275, "mfr", "high", "20-inch wheels, standard", epa(48303)) },
    }),
    q6({
      id: "audi-sq6-sportback-etron-2025",
      model: "SQ6 Sportback e-tron",
      modelAliases: ["SQ6 e-tron Sportback"],
      years: [2025, 2025],
      drive: "AWD",
      dcPeakKw: 270,
      range: { epaRangeMi: f(283, "mfr", "high", "20-inch wheels, standard", epa(48690)) },
    }),

    q6({
      id: "audi-q6-etron-2026",
      model: "Q6 e-tron",
      modelAliases: ["Q6 Sportback e-tron", "Q6 e-tron Sportback"],
      years: [2026, 2026],
      dcPeakKw: 270,
      rangeAbstain: Q6_2026_RANGE_ABSTAIN,
    }),
    q6({
      id: "audi-sq6-etron-2026",
      model: "SQ6 e-tron",
      modelAliases: ["SQ6 Sportback e-tron", "SQ6 e-tron Sportback"],
      years: [2026, 2026],
      dcPeakKw: 270,
      rangeAbstain: Q6_2026_RANGE_ABSTAIN,
    }),

    // MY2027 standard wheels are Audi's own words on its own model page:
    // "The Audi Q6 e-tron offers standard 19” wheel designs" and "The SQ6
    // e-tron comes with standard 20\" wheels."
    q6({
      id: "audi-q6-etron-2027",
      model: "Q6 e-tron",
      years: [2027, 2027],
      drive: "AWD",
      dcPeakKw: 270,
      range: { epaRangeMi: f(325, "mfr", "high", "19-inch wheels, standard", epa(50376)) },
    }),
    q6({
      id: "audi-q6-sportback-etron-2027",
      model: "Q6 Sportback e-tron",
      modelAliases: ["Q6 e-tron Sportback", "Q6 e-tron SB"],
      years: [2027, 2027],
      drive: "AWD",
      dcPeakKw: 270,
      range: { epaRangeMi: f(325, "mfr", "high", "19-inch wheels, standard", epa(50379)) },
    }),
    q6({
      id: "audi-sq6-etron-2027",
      model: "SQ6 e-tron",
      years: [2027, 2027],
      drive: "AWD",
      dcPeakKw: 270,
      range: { epaRangeMi: f(285, "mfr", "high", "20-inch wheels, standard", epa(50380)) },
    }),
    q6({
      id: "audi-sq6-sportback-etron-2027",
      model: "SQ6 Sportback e-tron",
      modelAliases: ["SQ6 e-tron Sportback"],
      years: [2027, 2027],
      drive: "AWD",
      dcPeakKw: 270,
      range: { epaRangeMi: f(285, "mfr", "high", "20-inch wheels, standard", epa(50382)) },
    })
  );

  // ─────────────────────────────── Q4 e-tron ────────────────────────────
  // MEB, 82 kWh gross, and the grade number is IN THE DEALER TRIM STRING —
  // "Premium 40 e-tron®", "Prestige 50 e-tron® quattro®", "Premium 45
  // e-tron®", "Premium 55 e-tron® quattro®" — which is what makes trim-keyed
  // rows work here at all. The numbers are also the drivetrain: 40 and 45 are
  // RWD single-motor, 50 and 55 are quattro, so the `drive` field backs the
  // trim key up rather than duplicating it.
  //
  // A BASE ROW carries the shared facts for the 42-plus live listings whose
  // trim field is empty, and abstains on range, because 40-vs-50 is 265
  // against 236 in the same model year and nothing in those listings says
  // which. Same shape as data2's Solterra base row.
  //
  // YEAR SPANS are paired only where EPA's own figures are identical in both
  // years (40: 265 in 2023 and 2024; 50: 236 in both; 55: 258 in 2024 and
  // 2025; 45: 288 in 2025 and 2026). The 55 drops to 251 for MY2026 and gets
  // its own row rather than being folded into the pair above it.
  //
  // AND NO WHEEL NOTE ON ANY OF THESE, unlike every other car in this file.
  // EPA certifies each Q4 grade exactly once per model year with no wheel or
  // tire qualifier in the entry name — there is no 19-versus-20-inch split to
  // label, so writing "19-inch wheels, standard" under the figure would be
  // decorating it with a condition EPA never attached. The Q8 e-tron quattro
  // is the same shape; the Q8 Sportback is not, and says so.
  //
  // THE GRADE KEYS HAVE TO SURVIVE cleanTrim, and the first draft's did not
  // (fixed 2026-08-25, when data4's overlapping Q4 rows came out and took
  // their own keys with them). The block comment below is right that Audi
  // dealers put the number in the trim — "Premium Plus 50 e-tron® quattro®" —
  // but that is the RAW feed string, and no matcher ever sees it:
  // lib/listings/enrich.ts's cleanTrim strips e-tron and quattro as Audi
  // noise (AUDI_NOISE) before matching, so the trim that arrives is "Premium
  // Plus 50 ®". Against that, "50 e-tron" cannot overlap — the word is gone —
  // and bare "50" norms to two characters, where trimStringsOverlap demands
  // exact equality with the WHOLE trim and gets it only from the 3 listings
  // that say just "50 ®". Every other grade-naming Q4 fell through to the
  // base row and lost its EPA range: 604 live listings, measured.
  //
  // So the keys are the spellings the feed actually uses, counted across the
  // 137,322 live listings rather than imagined. Tier-first is the common one
  // (170 "Premium Plus 50 ®", 103 "Prestige 50 ®", 72 "Premium 50 ®") and
  // number-first is the minority (11 "50 Premium", 2 "50 Premium Plus"), so
  // both orders are keyed. Cross-grade collision is impossible because the
  // number is the discriminator and "PREMIUMPLUS40" neither contains nor is
  // contained by "PREMIUMPLUS50". Bare tier names are deliberately NOT keys:
  // 101 live Q4s say only "Premium Plus" or "Prestige", and in 2024 that
  // could be a 50 at 236 miles or a 55 at 258. Those go to the base row and
  // are shown no range, which is the whole reason the base row exists.
  const gradeTrims = (n: 40 | 45 | 50 | 55): string[] => [
    `${n}`,
    `${n} e-tron`,
    `Premium ${n}`,
    `Premium Plus ${n}`,
    `Prestige ${n}`,
    `${n} Premium`,
    `${n} Premium Plus`,
    `${n} Prestige`,
  ];
  const Q4_HP_ABSTAIN = AUDI_HP_ABSTAIN;
  const Q4_NO_NACS = f<"none">(
    "none",
    "mfr",
    "high",
    "No NACS adapter works on a Q4 e-tron",
    AUDI_NACS_FAQ
  );
  const Q4_NOTE: EnrichmentRow["buyerNotes"] = [
    {
      headline:
        "Audi says the Q4 e-tron cannot use its NACS adapter or any other, so this is the one Audi EV with no route onto the Tesla Supercharger network",
      severity: "warning",
      learnMore: AUDI_NACS_FAQ,
    },
  ];

  const q4 = (o: {
    id: string;
    model: string;
    modelAliases?: string[];
    trim?: string[];
    years: [number, number];
    drive?: "AWD" | "RWD";
    packUrl: string;
    packNote?: string;
    dcPeakKw: number;
    dcUrl: string;
    acUrl: string;
    range?: EnrichmentRow["range"];
    rangeAbstain?: string;
  }): EnrichmentRow => ({
    id: o.id,
    make: "AUDI",
    model: o.model,
    modelAliases: o.modelAliases,
    trim: o.trim,
    modelYears: o.years,
    drive: o.drive,
    battery: { packGrossKwh: f(82, "mfr", "high", o.packNote, o.packUrl) },
    range: o.range,
    charging: {
      portStandard: AUDI_CCS1,
      superchargerAccess: Q4_NO_NACS,
      dcPeakKw: f(o.dcPeakKw, "mfr", "high", undefined, o.dcUrl),
      acOnboardKw: f(9.6, "mfr", "high", "240V/40A; 11.5 kW on a third-party wall box", o.acUrl),
      dcFastCharging: f<"standard">("standard", "mfr", "high", undefined, o.dcUrl),
    },
    warranty: AUDI_WARRANTY,
    abstains: o.rangeAbstain
      ? { heatPump: Q4_HP_ABSTAIN, epaRangeMi: o.rangeAbstain }
      : { heatPump: Q4_HP_ABSTAIN },
    buyerNotes: Q4_NOTE,
  });

  const Q4_BASE_ABSTAIN =
    "The grade number sets the rating (40 and 45 are RWD at 265 and 288, 50 and 55 are quattro at 236 to 258) and these listings carry no grade in their trim, so the grade-keyed rows below carry the figure and an unreadable trim is shown none";

  R.push(
    // MY2022: the US line was the 50 quattro only, in SUV and Sportback bodies.
    q4({
      id: "audi-q4-50-etron-2022",
      model: "Q4 e-tron",
      years: [2022, 2022],
      drive: "AWD",
      packUrl: Q4_2023_SALES_START_PR,
      packNote: Q4_2022_PACK_NOTE,
      dcPeakKw: 150,
      dcUrl: Q4_2024_PR,
      acUrl: Q4_2022_SPECS,
      range: { epaRangeMi: f(241, "mfr", "high", undefined, epa(44781)) },
    }),
    q4({
      id: "audi-q4-sportback-50-etron-2022",
      model: "Q4 Sportback e-tron",
      modelAliases: ["Q4 e-tron Sportback"],
      years: [2022, 2022],
      drive: "AWD",
      packUrl: Q4_2023_SALES_START_PR,
      packNote: Q4_2022_PACK_NOTE,
      dcPeakKw: 150,
      dcUrl: Q4_2024_PR,
      acUrl: Q4_2022_SPECS,
      range: { epaRangeMi: f(241, "mfr", "high", undefined, epa(44782)) },
    }),

    q4({
      id: "audi-q4-40-etron-2023-24",
      model: "Q4 e-tron",
      trim: gradeTrims(40),
      years: [2023, 2024],
      drive: "RWD",
      packUrl: Q4_2023_SPECS,
      dcPeakKw: 150,
      dcUrl: Q4_2023_SPECS,
      acUrl: Q4_2023_SPECS,
      range: { epaRangeMi: f(265, "mfr", "high", undefined, epa(46910)) },
    }),
    q4({
      id: "audi-q4-50-etron-2023-24",
      model: "Q4 e-tron",
      trim: gradeTrims(50),
      years: [2023, 2024],
      drive: "AWD",
      packUrl: Q4_2023_SPECS,
      dcPeakKw: 150,
      dcUrl: Q4_2023_SPECS,
      acUrl: Q4_2023_SPECS,
      range: { epaRangeMi: f(236, "mfr", "high", undefined, epa(46911)) },
    }),
    q4({
      id: "audi-q4-sportback-50-etron-2023-24",
      model: "Q4 Sportback e-tron",
      modelAliases: ["Q4 e-tron Sportback"],
      trim: gradeTrims(50),
      years: [2023, 2024],
      drive: "AWD",
      packUrl: Q4_2023_SPECS,
      dcPeakKw: 150,
      dcUrl: Q4_2023_SPECS,
      acUrl: Q4_2023_SPECS,
      range: { epaRangeMi: f(242, "mfr", "high", undefined, epa(46912)) },
    }),

    // "All 2024 Q4 55 e-tron models feature an 82 kWh (gross) battery that
    // provides 77 kWh of net energy… The Q4 55 e-tron quattro now achieves a
    // maximum DC charging power of 175 kW, up from 150 kW for the Q4 50
    // e-tron."
    {
      id: "audi-q4-55-etron-2024-25",
      make: "AUDI",
      model: "Q4 e-tron",
      trim: gradeTrims(55),
      modelYears: [2024, 2025],
      drive: "AWD",
      battery: {
        packGrossKwh: f(82, "mfr", "high", undefined, Q4_2024_PR),
        packUsableKwh: f(77, "mfr", "high", undefined, Q4_2024_PR),
      },
      range: { epaRangeMi: f(258, "mfr", "high", undefined, epa(47810)) },
      charging: {
        portStandard: AUDI_CCS1,
        superchargerAccess: Q4_NO_NACS,
        dcPeakKw: f(175, "mfr", "high", undefined, Q4_2024_PR),
        chargeTime1080Min: f(28, "mfr", "high", "10–80% under normal conditions", Q4_2024_PR),
        acOnboardKw: f(9.6, "mfr", "high", "240V/40A; 11.5 kW on a third-party wall box", Q4_2023_SPECS),
        dcFastCharging: f<"standard">("standard", "mfr", "high", undefined, Q4_2024_PR),
      },
      warranty: AUDI_WARRANTY,
      abstains: { heatPump: Q4_HP_ABSTAIN },
      buyerNotes: Q4_NOTE,
    },
    {
      id: "audi-q4-sportback-55-etron-2024-25",
      make: "AUDI",
      model: "Q4 Sportback e-tron",
      modelAliases: ["Q4 e-tron Sportback"],
      trim: gradeTrims(55),
      modelYears: [2024, 2025],
      drive: "AWD",
      battery: {
        packGrossKwh: f(82, "mfr", "high", undefined, Q4_2024_PR),
        packUsableKwh: f(77, "mfr", "high", undefined, Q4_2024_PR),
      },
      range: { epaRangeMi: f(258, "mfr", "high", undefined, epa(47811)) },
      charging: {
        portStandard: AUDI_CCS1,
        superchargerAccess: Q4_NO_NACS,
        dcPeakKw: f(175, "mfr", "high", undefined, Q4_2024_PR),
        chargeTime1080Min: f(28, "mfr", "high", "10–80% under normal conditions", Q4_2024_PR),
        acOnboardKw: f(9.6, "mfr", "high", "240V/40A; 11.5 kW on a third-party wall box", Q4_2023_SPECS),
        dcFastCharging: f<"standard">("standard", "mfr", "high", undefined, Q4_2024_PR),
      },
      warranty: AUDI_WARRANTY,
      abstains: { heatPump: Q4_HP_ABSTAIN },
      buyerNotes: Q4_NOTE,
    },

    // "At the core of the Audi Q4 e-tron lies the power and engineered
    // precision of its 82 kWh battery. Get on the road sooner with up to
    // 175 kW DC fast-charging speeds." — Audi's MY2026 model page, line-wide.
    q4({
      id: "audi-q4-45-etron-2025-26",
      model: "Q4 e-tron",
      trim: gradeTrims(45),
      years: [2025, 2026],
      drive: "RWD",
      packUrl: Q4_2026_PAGE,
      dcPeakKw: 175,
      dcUrl: Q4_2026_PAGE,
      acUrl: Q4_2023_SPECS,
      range: { epaRangeMi: f(288, "mfr", "high", undefined, epa(48296)) },
    }),
    q4({
      id: "audi-q4-55-etron-2026",
      model: "Q4 e-tron",
      trim: gradeTrims(55),
      years: [2026, 2026],
      drive: "AWD",
      packUrl: Q4_2026_PAGE,
      dcPeakKw: 175,
      dcUrl: Q4_2026_PAGE,
      acUrl: Q4_2023_SPECS,
      range: { epaRangeMi: f(251, "mfr", "high", undefined, epa(50182)) },
    }),
    q4({
      id: "audi-q4-sportback-55-etron-2026",
      model: "Q4 Sportback e-tron",
      modelAliases: ["Q4 e-tron Sportback"],
      trim: gradeTrims(55),
      years: [2026, 2026],
      drive: "AWD",
      packUrl: Q4_2026_PAGE,
      dcPeakKw: 175,
      dcUrl: Q4_2026_PAGE,
      acUrl: Q4_2023_SPECS,
      range: { epaRangeMi: f(251, "mfr", "high", undefined, epa(50183)) },
    }),

    q4({
      id: "audi-q4-etron-base-2023-26",
      model: "Q4 e-tron",
      modelAliases: ["Q4 Sportback e-tron", "Q4 e-tron Sportback"],
      years: [2023, 2026],
      packUrl: Q4_2023_SPECS,
      dcPeakKw: 150,
      dcUrl: Q4_2023_SPECS,
      acUrl: Q4_2023_SPECS,
      rangeAbstain: Q4_BASE_ABSTAIN,
    })
  );

  // ─────────────────────────────── Q8 e-tron ────────────────────────────
  // The only car in this file whose heat pump is a manufacturer statement:
  // "The Q8 e-tron offers standard four-zone automatic climate control with a
  // heat pump and comfort pre-conditioning."
  //
  // Everything else is off Audi's own MY2024 technical-specification sheet,
  // read as a rendered page: "Battery Size (Gross) 114 kWh", "Battery Size
  // (Net) 106 kWh", "Charge Port (Driver side) AC/DC Combo Port J1772 / CCS",
  // "Max Charging Capacity AC / DC up to 9.6 kW / 170 kW", "DC Fast Charging
  // (170 kW) 31 minutes (10% - 80% charge)", "Battery Type 397V Lithium Ion",
  // "Wheels (Standard) 20\" 5-arm aero ring design wheels".
  //
  // NO superchargerAccess ON THESE ROWS, deliberately. Audi's adapter release
  // lists the compatible existing model lines as "e-tron (MY2019 – MY2025)",
  // "e-tron GT", "A6 Sportback e-tron" and "Q6 e-tron" — and the MY2024–25
  // half of that first range can only mean the renamed Q8 e-tron, which is an
  // inference and not a sentence. Audi's parts catalogue would settle it and
  // is behind a bot wall. Saying nothing costs an expected-tier field; saying
  // "adapter" on a guess would put a charging network in front of a shopper
  // that Audi has not actually promised them.
  const q8 = (o: { id: string; model: string; modelAliases?: string[]; range: EnrichmentRow["range"] }): EnrichmentRow => ({
    id: o.id,
    make: "AUDI",
    model: o.model,
    modelAliases: o.modelAliases,
    modelYears: [2024, 2024],
    drive: "AWD",
    battery: {
      packGrossKwh: f(114, "mfr", "high", undefined, Q8_2024_SPECS),
      packUsableKwh: f(106, "mfr", "high", undefined, Q8_2024_SPECS),
    },
    range: o.range,
    charging: {
      portStandard: f<"CCS1">("CCS1", "mfr", "high", "Combined AC/DC inlet on the driver's side", Q8_2024_SPECS),
      dcPeakKw: f(170, "mfr", "high", undefined, Q8_2024_SPECS),
      chargeTime1080Min: f(31, "mfr", "high", "10–80% at a 170 kW station", Q8_2024_SPECS),
      acOnboardKw: f(9.6, "mfr", "high", "240V/40A; 19.2 kW optional", Q8_2024_SPECS),
      architectureV: f(397, "mfr", "high", "Nominal pack voltage", Q8_2024_SPECS),
      dcFastCharging: f<"standard">("standard", "mfr", "high", undefined, Q8_2024_SPECS),
    },
    thermal: {
      heatPump: f<"standard">("standard", "mfr", "high", "Part of the standard four-zone climate control", Q8_2024_PR),
    },
    warranty: AUDI_WARRANTY,
  });

  R.push(
    q8({
      id: "audi-q8-etron-2024",
      model: "Q8 e-tron",
      range: { epaRangeMi: f(285, "mfr", "high", undefined, epa(46913)) },
    }),
    q8({
      id: "audi-q8-sportback-etron-2024",
      model: "Q8 Sportback e-tron",
      modelAliases: ["Q8 e-tron Sportback"],
      // EPA rates the Sportback twice: 296 as filed, and 300 as "ultra
      // quattro" — the ultra package's 19-inch wheels and summer tires, the
      // same option that lifts the Q6 RWD from 310 to 321. The standard
      // fitment is Audi's own "Wheels (Standard) 20\"", so 296 is the row.
      range: { epaRangeMi: f(296, "mfr", "high", "Standard equipment; the ultra package is rated 300", epa(47440)) },
    })
  );
}

// ═════════════════════ SUBARU TRAILSEEKER (MY2026-27) ═══════════════════
// 464 live listings and Subaru's first NACS-native EV. Everything below is
// Subaru's own words: "Powered by a 74.7-kWh lithium-ion battery, the 2026
// Subaru Trailseeker includes a standard North American Charging Standard
// (NACS) charge port… and can recharge up to 80% in as little as 28 minutes
// at speeds up to 150 kW on a fast-charger", plus "11-kW onboard L2 charger —
// Standard" and "High Voltage Battery & Electric Drive Unit Limited Warranty
// — 8 years or 100,000 miles" from Subaru's own trim-comparison table.
//
// NO chargeTime1080Min: Subaru's 28 minutes is "up to 80%" with no stated
// starting point, and this field means 10→80 specifically.
//
// THE WHEEL SPLIT IS THE WHOLE RANGE STORY. EPA rates the Trailseeker twice —
// "Trailseeker AWD" 281 mi and "Trailseeker 20 inch AWD" 274 — and Subaru's
// trim-comparison table settles which is which without ambiguity: "20-inch
// aluminum-alloy wheels" reads Not Available on Premium and Standard on
// Limited, Touring and Touring with leather. So Premium is the 18-inch 281
// and every other grade is the 20-inch 274, and the four columns of that
// table were read as an image rather than trusted to text extraction.
//
// HEAT PUMP ABSTAINS, and this one was control-tested rather than assumed.
// Subaru's trim-comparison feature list has a whole "Climate Control" section
// and no heat-pump line anywhere in it — and neither does the same table for
// the 2026 Solterra, a car built on the platform whose Toyota twin is widely
// described as having one. The control test is about the DOCUMENT, not the
// hardware: two Subaru feature tables of the same format, one for each of
// Subaru's two current EVs, and neither uses the term at all. That is enough
// to show the vocabulary is missing from the format, which is what makes the
// silence uninformative. It is deliberately NOT a claim about what the
// Solterra has — the corpus's own Solterra heat-pump value is `agg` with no
// citation, exactly the tier the Volvo and Ariya findings in data6 taught us
// not to lean on. Same shape as that Volvo control test, one rung more
// careful.
//
// MY2027 SPANS WITH MY2026 (2026-08-25), carried over when data4's duplicate
// Trailseeker rows were removed — they were keyed [2026, 2027] and these were
// not, so deleting them without widening these would have opened a hole in a
// model year that is already certified. EPA re-rates the identical two
// configurations at the identical two figures: ids 50692 "Trailseeker AWD"
// 281 mi and 50691 "Trailseeker 20 inch AWD" 274 mi, against MY2026's 50300
// and 50299. Checked against the 2027 Subaru model list directly, so this is
// a match, not a carry-forward over an absence.
{
  const TSK_PR = "https://media.subaru.com/pressrelease/2397/all-new-2026-subaru-trailseeker-combines-375-horsepower";
  const TSK_TRIMS = "https://www.subaru.com/services/vehicles/pdf/trimComparison/2026/TSK?hideBuildMsrp=false";
  const TSK_HP_ABSTAIN =
    "Subaru's feature tables never use the term: neither the Trailseeker's own trim-comparison table nor the 2026 Solterra's names a heat pump anywhere, so their silence says nothing either way";

  const trailseeker = (id: string, trim: string[] | undefined, range: Fact<number> | undefined, rangeAbstain?: string): EnrichmentRow => ({
    id,
    make: "SUBARU",
    model: "Trailseeker",
    modelYears: [2026, 2027],
    trim,
    drive: "AWD",
    battery: { packGrossKwh: f(74.7, "mfr", "high", undefined, TSK_PR) },
    range: range ? { epaRangeMi: range } : undefined,
    charging: {
      portStandard: f<"NACS">("NACS", "mfr", "high", undefined, TSK_PR),
      dcPeakKw: f(150, "mfr", "high", undefined, TSK_PR),
      acOnboardKw: f(11, "mfr", "high", undefined, TSK_TRIMS),
      dcFastCharging: f<"standard">("standard", "mfr", "high", undefined, TSK_PR),
    },
    thermal: {
      batteryPreconditioning: f(true, "mfr", "high", "Automatic when navigating to a charger, or by touchscreen", TSK_PR),
    },
    warranty: {
      batteryYears: f(8, "mfr", "high", undefined, TSK_TRIMS),
      batteryMiles: f(100_000, "mfr", "high", undefined, TSK_TRIMS),
    },
    abstains: rangeAbstain ? { heatPump: TSK_HP_ABSTAIN, epaRangeMi: rangeAbstain } : { heatPump: TSK_HP_ABSTAIN },
    specs: { towRatingLb: f(3500, "mfr", "high", undefined, TSK_PR) },
  });

  R.push(
    trailseeker("subaru-trailseeker-2026-premium", ["Premium"], f(281, "mfr", "high", "18-inch wheels, standard on Premium; EPA ids 50300 and 50692 rate MY2026 and MY2027 identically", epa(50300))),
    trailseeker(
      "subaru-trailseeker-2026-20in",
      ["Limited", "Touring"],
      f(274, "mfr", "high", "20-inch wheels, standard on Limited and Touring; EPA ids 50299 and 50691 rate MY2026 and MY2027 identically", epa(50299))
    ),
    // Base row for listings whose trim field is empty or names something the
    // two rows above don't. 281 vs 274 is only seven miles, but printing
    // either on a car we can't grade would be inventing which wheels it has.
    trailseeker(
      "subaru-trailseeker-2026-base",
      undefined,
      undefined,
      "Premium is rated 281 on 18-inch wheels and Limited/Touring 274 on 20s, and these listings name no grade, so the grade-keyed rows carry the figure"
    )
  );
}

// ═════════════════════ LEXUS ES 350e / ES 500e (MY2026) ═════════════════
// 209 live listings across two model strings the feed treats as different
// cars: "ESe" (with the grade in the trim, "ES 350e Premium") and "ES 350e" /
// "ES 500e" (with the grade in the model). Both spellings get rows, and the
// "ESe" ones are trim-guarded so a 500e listing can never pick up the FWD
// car's 307 miles.
//
// Every figure is from one Lexus release: "both ES BEV models share a
// 74.7-kWh lithium-ion battery", "Every ES comes standard with 19-inch
// aluminum wheels", "The ES 350e has a 307-mile EPA-estimated total driving
// range rating per full charge with the standard 19-inch wheels", "The ES
// 500e has a 276-mile EPA-estimated total driving range rating per full
// charge with the standard 19-inch wheels", "a North American Charging System
// (NACS) J3400-style charge port", "an onboard 11-kW AC charger", "Level 3
// charging from 10 percent to 80 percent can take about 28 minutes with
// charging speeds of up to 150 kW". EPA's own records agree to the mile
// (350e 19" 307 / 21" 292; 500e 19" 276 / 21" 272).
//
// ONE ABSTENTION: the heat pump, which no Lexus document consulted this pass
// names on the electric ES.
//
// The warranty is NOT abstained, and the first draft of these rows was wrong
// to. It copied the MY2026 RZ rows' reasoning in data9 — "Lexus publishes no
// MY2026 BEV warranty document" — which is false for both cars. Lexus
// publishes L-MMS-26ESBEV.pdf, the "2026 ES BEV Warranty and Services Guide"
// (form 25-TCS-19206), on Toyota's own publications CDN, and its printed page
// 18 states the term in the maker's own words: an Electric Vehicle Drive
// Components Warranty covering the Traction Battery "Below 70% of original
// capacity", "in effect for 8 years or 100,000 miles from the vehicle's in
// service date". Printed page 16 adds the transfer clause and confirms the
// scope: "These warranties apply to 2026 model-year Lexus ES BEV vehicles …
// Warranty coverage is automatically transferred at no cost to subsequent
// vehicle owners." The data9 RZ rows are corrected in the same commit.
//
// ROOT CAUSE: the negative came from a failed search rather than a control
// test. These guides live at a completely regular address —
// assets.sia.toyota.com/publications/en/omms-s/L-MMS-26<MODEL>/pdf/ — and one
// fetch of a sibling guide that must exist (the RX or the LX, both of which
// search engines do surface) would have handed over the scheme. Not finding a
// document is not the same as a document not existing, and an abstention that
// turns on the second must be tested that way.
{
  const ES_PR = "https://pressroom.lexus.com/2026-lexus-es-launches-with-battery-electric-models-new-hybrid-coming-soon/";
  const ES_WARRANTY_GUIDE =
    "https://assets.sia.toyota.com/publications/en/omms-s/L-MMS-26ESBEV/pdf/L-MMS-26ESBEV.pdf";
  const ES_HP_ABSTAIN = "No Lexus document consulted this pass states heat-pump hardware for the electric ES";
  const ES_WARRANTY = {
    batteryYears: f(8, "mfr", "high", undefined, ES_WARRANTY_GUIDE),
    batteryMiles: f(100_000, "mfr", "high", "From the in-service date", ES_WARRANTY_GUIDE),
    sohFloorPct: f(70, "mfr", "high", undefined, ES_WARRANTY_GUIDE),
    batteryTransfers: f(true, "mfr", "high", "At no cost to subsequent owners", ES_WARRANTY_GUIDE),
  };

  const ES_CHARGING = {
    portStandard: f<"NACS">("NACS", "mfr", "high", "SAE J3400 inlet on the passenger-side front fender", ES_PR),
    superchargerAccess: f<"native">("native", "mfr", "high", "A CCS/J1772-to-NACS adapter is included for other networks", ES_PR),
    dcPeakKw: f(150, "mfr", "high", undefined, ES_PR),
    chargeTime1080Min: f(28, "mfr", "high", "10–80% under ideal DC conditions", ES_PR),
    acOnboardKw: f(11, "mfr", "high", undefined, ES_PR),
    dcFastCharging: f<"standard">("standard", "mfr", "high", undefined, ES_PR),
  };

  const es = (o: {
    id: string;
    model: string;
    modelAliases?: string[];
    trim?: string[];
    drive: "FWD" | "AWD";
    rangeMi: number;
    epaId: number;
    altWheelMi: number;
  }): EnrichmentRow => ({
    id: o.id,
    make: "LEXUS",
    model: o.model,
    modelAliases: o.modelAliases,
    trim: o.trim,
    modelYears: [2026, 2026],
    drive: o.drive,
    battery: { packGrossKwh: f(74.7, "mfr", "high", undefined, ES_PR) },
    range: {
      epaRangeMi: f(
        o.rangeMi,
        "mfr",
        "high",
        `19-inch wheels, standard; ${o.altWheelMi} mi on the 21-inch option`,
        epa(o.epaId)
      ),
    },
    charging: ES_CHARGING,
    thermal: {
      batteryPreconditioning: f(true, "mfr", "high", "By touchscreen, or automatically when routing to a charger", ES_PR),
    },
    warranty: ES_WARRANTY,
    abstains: { heatPump: ES_HP_ABSTAIN },
  });

  R.push(
    es({ id: "lexus-es-350e-2026", model: "ES 350e", drive: "FWD", rangeMi: 307, epaId: 50450, altWheelMi: 292 }),
    es({ id: "lexus-es-500e-2026", model: "ES 500e", drive: "AWD", rangeMi: 276, epaId: 50452, altWheelMi: 272 }),
    // The "ESe" model string a large share of dealers file these under. The
    // grade lives in the trim there ("ES 350e Premium", "ES 500e Luxury"), so
    // the two rows are trim-guarded on the grade token and nothing else.
    es({
      id: "lexus-ese-350e-2026",
      model: "ESe",
      trim: ["ES 350e", "350e"],
      drive: "FWD",
      rangeMi: 307,
      epaId: 50450,
      altWheelMi: 292,
    }),
    es({
      id: "lexus-ese-500e-2026",
      model: "ESe",
      trim: ["ES 500e", "500e"],
      drive: "AWD",
      rangeMi: 276,
      epaId: 50452,
      altWheelMi: 272,
    }),
    // Base "ESe" row: same pack, port, charging and preconditioning for both
    // cars, no range, because "ESe" with no grade token in the trim could be
    // either the 307-mile FWD or the 276-mile AWD.
    {
      id: "lexus-ese-2026-base",
      make: "LEXUS",
      model: "ESe",
      modelYears: [2026, 2026],
      battery: { packGrossKwh: f(74.7, "mfr", "high", undefined, ES_PR) },
      charging: ES_CHARGING,
      thermal: {
        batteryPreconditioning: f(true, "mfr", "high", "By touchscreen, or automatically when routing to a charger", ES_PR),
      },
      warranty: ES_WARRANTY,
      abstains: {
        heatPump: ES_HP_ABSTAIN,
        epaRangeMi: "The 350e is rated 307 and the 500e 276, and a bare ESe listing names neither, so the grade-keyed rows carry the figure",
      },
    }
  );
}

// ═════════════════════════ LUCID GRAVITY (MY2026-27) ════════════════════
// 839 live listings, the largest single gap on the list, and a car whose
// facts Lucid publishes unusually well.
//
// "we developed new, unique technology to allow the 926V Lucid Gravity to
// charge seamlessly at up to 400 kW on 1000V charging equipment and at
// sustained speeds of up to 225 kW on 500V architecture fast chargers,
// including Tesla V3 Superchargers"; "the Lucid Gravity became the first
// non-Tesla to be sold with a NACS charge port"; "Lucid Gravity gains wide
// access, with no adapter necessary, to the Tesla Supercharger network";
// "Lucid Gravity is capable of bi-directional charging, supporting up to 80 A
// at 19.2 kW with the NACS charge port"; "achieving speeds up to 400 kW with
// a compact 123 kWh battery"; and, for the Touring, "the 89 kWh battery
// delivers an EPA-estimated 337 miles of range".
//
// HEAT PUMP comes from the owner's manual rather than any press release,
// because Lucid's Gravity marketing never mentions it: "NOTE: The Lucid
// Gravity uses a heat pump for climate control." That is an engineering
// primary and it is why these rows state it where the Trailseeker's abstain.
//
// THE STANDARD CONFIGURATION MOVED BETWEEN MODEL YEARS, and this is the trap
// in this tranche. Lucid's own footnote for the MY2026 headline reads "EPA
// est. range rating for Lucid Gravity when equipped with 20”F/21”R wheels and
// configured as 2-row, 5-seat vehicle is 450 miles for Grand Touring and 337
// miles for Touring". But Lucid's MY2027 announcement says the Grand Touring
// "now comes standard with DreamDrive 2 Premium, the Comfort & Convenience
// Package, the Power Package, and 21\"/22\" wheels", and moves third-row
// seating into the optional Prestige Package. So the standard MY2027 Grand
// Touring is a 21/22-inch two-row car, which EPA rates at 407 — not 450.
// A single 2026-2027 Grand Touring row at 450 would have overstated every
// MY2027 car by 43 miles, which is why the two years are separate rows.
// The Touring did not move: 337 on 20F/21R in both years, EPA's own MY2026
// and MY2027 records agreeing to the mile.
{
  const GRAVITY_CHARGING_PR =
    "https://ir.lucidmotors.com/news-releases/news-release-details/lucid-gravity-combining-450-miles-epa-range-400-kw-fast-charging/";
  const GRAVITY_PAGE = "https://lucidmotors.com/gravity";
  const GRAVITY_TOURING_PAGE = "https://lucidmotors.com/stories/introducing-lucid-gravity-touring";
  const GRAVITY_OM = "https://lucidmotors.com/media/document/OM_Gravity_enUS_v12_2.pdf";
  const GRAVITY_2027_PR =
    "https://ir.lucidmotors.com/news-releases/news-release-details/lucid-reveals-2027-gravity-lineup-expanded-standard-features";
  // NOT the MY26-titled booklet, which would be a roll-forward onto the
  // MY2027 rows. Lucid also publishes a US New Vehicle Limited Warranty
  // scoped by PURCHASE DATE rather than model year — "Effective for vehicles
  // purchased on or after April 16, 2024" — which covers a 2026 and a 2027
  // Gravity alike without anyone having to assume a term carries. Same terms,
  // wider and better-defined scope, and it settles transferability too: the
  // warranty is "provided to the original purchaser or lessor … and to
  // subsequent owner(s) if the vehicle is within the applicable coverage
  // period."
  const LUCID_WARRANTY_US = "https://lucidmotors.com/s3fs-public/pdf/WAR_New-Vehicle-Limited-Warranty_enUS_2025.11.2.pdf";

  const GRAVITY_CHARGING = {
    portStandard: f<"NACS">("NACS", "mfr", "high", undefined, GRAVITY_CHARGING_PR),
    superchargerAccess: f<"native">("native", "mfr", "high", "No adapter needed at a Tesla Supercharger", GRAVITY_CHARGING_PR),
    dcPeakKw: f(400, "mfr", "high", "On 1000V equipment; up to 225 kW sustained on 500V", GRAVITY_CHARGING_PR),
    acOnboardKw: f(19.2, "mfr", "high", "80 A through the NACS inlet", GRAVITY_CHARGING_PR),
    architectureV: f(926, "mfr", "high", undefined, GRAVITY_CHARGING_PR),
    dcFastCharging: f<"standard">("standard", "mfr", "high", undefined, GRAVITY_CHARGING_PR),
  };
  const GRAVITY_THERMAL = {
    heatPump: f<"standard">("standard", "mfr", "high", undefined, GRAVITY_OM),
  };
  // "The high voltage battery is covered for the duration of 8 years or
  // 100,000 miles… with a minimum 70% retention of battery capacity over the
  // warranty period."
  const LUCID_WARRANTY = {
    batteryYears: f(8, "mfr", "high", undefined, LUCID_WARRANTY_US),
    batteryMiles: f(100_000, "mfr", "high", undefined, LUCID_WARRANTY_US),
    sohFloorPct: f(70, "mfr", "high", undefined, LUCID_WARRANTY_US),
    batteryTransfers: f(true, "mfr", "high", "Subsequent owners, within the coverage period", LUCID_WARRANTY_US),
  };
  const GRAVITY_NOTE: EnrichmentRow["buyerNotes"] = [
    {
      headline: "Adapters for CCS1 and J1772 come with the car; the NACS inlet is the native one",
      severity: "info",
      learnMore: GRAVITY_CHARGING_PR,
    },
  ];

  const gravity = (o: {
    id: string;
    trim?: string[];
    years: [number, number];
    packKwh: number;
    packUrl: string;
    rangeMi: number;
    epaId: number;
    rangeNote: string;
    extraNotes?: EnrichmentRow["buyerNotes"];
  }): EnrichmentRow => ({
    id: o.id,
    make: "LUCID",
    model: "Gravity",
    trim: o.trim,
    modelYears: o.years,
    drive: "AWD",
    battery: { packGrossKwh: f(o.packKwh, "mfr", "high", undefined, o.packUrl) },
    range: { epaRangeMi: f(o.rangeMi, "mfr", "high", o.rangeNote, epa(o.epaId)) },
    charging: GRAVITY_CHARGING,
    thermal: GRAVITY_THERMAL,
    warranty: LUCID_WARRANTY,
    buyerNotes: [...(o.extraNotes ?? []), ...GRAVITY_NOTE],
  });

  R.push(
    gravity({
      id: "lucid-gravity-touring-2026-27",
      trim: ["Touring"],
      years: [2026, 2027],
      packKwh: 89,
      packUrl: GRAVITY_TOURING_PAGE,
      rangeMi: 337,
      epaId: 50221,
      rangeNote: "20-in front/21-in rear wheels, two-row seating",
    }),
    gravity({
      id: "lucid-gravity-grand-touring-2026",
      trim: ["Grand Touring"],
      years: [2026, 2026],
      packKwh: 123,
      packUrl: GRAVITY_CHARGING_PR,
      rangeMi: 450,
      epaId: 49670,
      rangeNote: "20-in front/21-in rear wheels, two-row seating",
      extraNotes: [
        {
          headline: "The 450-mile rating is the two-row build; EPA rates the three-row at 437 on the same wheels",
          severity: "info",
          learnMore: GRAVITY_PAGE,
        },
      ],
    }),
    gravity({
      id: "lucid-gravity-grand-touring-2027",
      trim: ["Grand Touring"],
      years: [2027, 2027],
      packKwh: 123,
      packUrl: GRAVITY_CHARGING_PR,
      rangeMi: 407,
      epaId: 50654,
      rangeNote: "21-in front/22-in rear wheels, standard for 2027",
      extraNotes: [
        {
          headline: "For 2027 the Grand Touring's standard wheels grew to 21/22 inch, which is 43 miles of EPA range below the 2026 car's 20/21s",
          severity: "info",
          learnMore: GRAVITY_2027_PR,
        },
      ],
    }),
    // Base row: pack size is the one thing that differs between the two
    // grades, so a Gravity with no readable trim gets the charging, thermal
    // and warranty facts both share and neither grade's range or pack.
    {
      id: "lucid-gravity-2026-27-base",
      make: "LUCID",
      model: "Gravity",
      modelYears: [2026, 2027],
      drive: "AWD",
      charging: GRAVITY_CHARGING,
      thermal: GRAVITY_THERMAL,
      warranty: LUCID_WARRANTY,
      abstains: {
        epaRangeMi:
          "Touring and Grand Touring are rated 337 and 450 on different packs, and these listings name neither grade, so the grade-keyed rows carry the figure",
        packUsableKwh: "The Touring's pack is 89 kWh and the Grand Touring's 123, and a bare Gravity listing does not say which car it is",
      },
      buyerNotes: GRAVITY_NOTE,
    }
  );
}

// ══════════════════ DODGE CHARGER DAYTONA (MY2024-2026) ═════════════════
// "The battery pack delivers 100.5 kWh installed capacity"; "The nickel
// cobalt aluminum chemistry of the battery cell provides more power per
// gram"; "a 400V propulsion system"; "Both vehicles can be recharged from a
// 20 to 80% charge status in just over 24 minutes when using a Level 3 DC CCS
// fast charger"; and, from Dodge's own EV FAQ, "The battery for the Dodge
// Charger Daytona has a limited warranty for 8 years or 100,000 miles."
//
// NO chargeTime1080Min and NO dcPeakKw. Dodge's 24 minutes is 20→80%, not
// 10→80%, and the 350 kW it names is the charger's rating, not the car's
// acceptance. Neither field will hold a number that means something else.
//
// HEAT PUMP ABSTAINS on the standing Stellantis rule the corpus already
// carries (data4's Wrangler comment, data9's Recon rows): Stellantis's US
// press kits and owner's manuals never use the term for any model, so neither
// presence nor absence can be stated.
//
// THE TIRE SPLIT, and why the R/T rows print a number where the 2024 Scat
// Pack's does not. EPA rates the R/T on four fitments and Stellantis names
// the standard one outright — "the R/T models are ready to handle with
// 245/55R18 all-season tires wrapped around 18-by-8.5-inch aluminum wheels" —
// and EPA's own base entry carries that exact size string in all three model
// years, which is the carry-over check for widening it past MY2024. The Scat
// Pack has no such sentence for MY2024, where the Track Package was standard
// and EPA splits it only by summer-versus-all-season rubber (216 against
// 241) — nothing on a listing can tell those apart, so that row goes quiet,
// the same call data4 made on the Wagoneer S's Falken-versus-Pirelli split.
// For MY2025-26 Dodge's own site calls the staggered 305/325 setup
// "available", so the square 305/35ZR20 is the standard fitment and the rows
// print it.
//
// BARE "Charger" IS SAFE FOR 2024-2025 AND NOT FOR 2026. Dealers file some of
// these as model "Charger" with trim "R/T". Through MY2025 no petrol Charger
// existed — EPA's 2024 and 2025 Dodge model lists carry Charger Daytona,
// Durango and Hornet and nothing else — but the MY2026 list adds "Charger R/T
// AWD" and "Charger Scat Pack AWD", the Sixpack-engined cars, which wear the
// same two trim names. So the bare-nameplate rows stop at 2025.
{
  const DAYTONA_PR = "https://media.stellantisnorthamerica.com/newsrelease.do?id=25748";
  const DAYTONA_PRICING_PR = "https://media.stellantisnorthamerica.com/newsrelease.do?id=25748&fIId=26052&mid=5";
  const DODGE_EV_FAQ = "https://www.dodge.com/hybrid-and-electric-vehicles/faq.html";
  const DODGE_PERF_PAGE = "https://www.dodge.com/charger/performance.html";
  const STELLANTIS_HP_ABSTAIN =
    "Stellantis's US press kits and owner's manuals never use the term heat pump for any model, so neither presence nor absence can be stated";
  // A third spelling some dealers file, carried over from data4's rows when
  // they were removed as duplicates (2026-08-25). No live listing used it on
  // the day it moved, but it cost nothing to keep and a spelling that goes
  // dark goes dark silently. Safe on every row here, bare-nameplate rule
  // included: the string contains "Daytona", so it cannot be a Sixpack.
  const DAYTONA_ALIASES = ["Charger Daytona EV"];

  const DAYTONA_BATTERY = {
    packGrossKwh: f(100.5, "mfr", "high", "Installed capacity", DAYTONA_PR),
    chemistry: f<"NCA">("NCA", "mfr", "high", undefined, DAYTONA_PR),
  };
  const DAYTONA_CHARGING = {
    portStandard: f<"CCS1">("CCS1", "mfr", "high", undefined, DAYTONA_PR),
    architectureV: f(400, "mfr", "high", undefined, DAYTONA_PR),
    dcFastCharging: f<"standard">("standard", "mfr", "high", undefined, DAYTONA_PR),
  };
  const DAYTONA_WARRANTY = {
    batteryYears: f(8, "mfr", "high", undefined, DODGE_EV_FAQ),
    batteryMiles: f(100_000, "mfr", "high", undefined, DODGE_EV_FAQ),
  };

  const daytona = (o: {
    id: string;
    model: string;
    modelAliases?: string[];
    trim: string[];
    years: [number, number];
    range?: EnrichmentRow["range"];
    rangeAbstain?: string;
    buyerNotes?: EnrichmentRow["buyerNotes"];
  }): EnrichmentRow => ({
    id: o.id,
    make: "DODGE",
    model: o.model,
    modelAliases: o.modelAliases,
    trim: o.trim,
    modelYears: o.years,
    drive: "AWD",
    battery: DAYTONA_BATTERY,
    range: o.range,
    charging: DAYTONA_CHARGING,
    warranty: DAYTONA_WARRANTY,
    abstains: o.rangeAbstain
      ? { heatPump: STELLANTIS_HP_ABSTAIN, epaRangeMi: o.rangeAbstain }
      : { heatPump: STELLANTIS_HP_ABSTAIN },
    buyerNotes: o.buyerNotes,
  });

  // ONE CONSTANT PER YEAR-SPAN, not one for the nameplate. The first draft
  // shared a single R/T note and a single Scat Pack note across every row,
  // and each was false somewhere: the R/T note quoted a 258-to-308 spread that
  // is the union of three model years, when MY2024-25's 20-inch entries run
  // 268 to 308 and MY2026's run 258 to 295 — 13 miles of overstatement on the
  // 2026 car, in the expensive direction. The Scat Pack note quoted a
  // "40-plus mile" penalty that is true for MY2025 (38 to 63) and not for
  // MY2026-27 (26 to 44), and it called the staggered setup "available, not
  // standard" on the MY2024 rows, whose own comment says the opposite: the
  // 2024 Scat Pack shipped WITH the Track Package. A note is a fact about the
  // car it renders under, so each span states its own.
  const rtNote = (spread: string): EnrichmentRow["buyerNotes"] => [
    {
      headline: `The R/T's rating is for its standard 245/55R18 tires; the 20-inch options EPA also rates run from ${spread} miles`,
      severity: "info",
      learnMore: DAYTONA_PRICING_PR,
    },
  ];
  const spAvailableNote = (penalty: string): EnrichmentRow["buyerNotes"] => [
    {
      headline: `Dodge calls the staggered 305-front/325-rear tire setup available, not standard, and EPA rates it ${penalty} miles shorter`,
      severity: "info",
      learnMore: DODGE_PERF_PAGE,
    },
  ];
  const SP_2024_NOTE: EnrichmentRow["buyerNotes"] = [
    {
      // Not "its staggered tires": EPA's own MY2024 entries are "Charger
      // 2-Dr Daytona Scat Pack Track Pack AWD" (216, id 48785) and the same
      // name with " A/S" (241, id 48786). The word staggered is nowhere in
      // either, and the split EPA actually certifies is the compound.
      headline: "The 2024 Scat Pack shipped with the Track Package, and EPA rates it 216 miles on summer rubber against 241 on all-seasons",
      severity: "info",
      learnMore: DAYTONA_PRICING_PR,
    },
  ];
  // "Daytona R/T" earns its place by what OVERLAP does with it, not by being
  // a spelling anyone files: 22 live listings carry trim "Daytona R", and
  // neither "R/T" nor "R" can reach it — both norm to under three characters,
  // where trimStringsOverlap demands exact equality rather than substring.
  // "Daytona R/T" norms to DAYTONART, which contains DAYTONAR, so the one
  // key covers "Daytona R", "Daytona R/T" and data4's "2-DOOR DAYTONA R/T".
  // It cannot reach a Scat Pack: DAYTONASCATPACK neither contains nor is
  // contained by DAYTONART, and "RT" is not a substring of it.
  const RT_TRIMS = ["R/T", "R", "Daytona R/T"];
  const SP_TRIMS = ["Scat Pack"];
  const SP_2024_ABSTAIN =
    "The 2024 Scat Pack shipped with the Track Package and EPA rates it twice on that package alone, 216 miles on summer tires and 241 on all-seasons — a split no listing field can resolve";

  // EPA's base R/T entry is the same 245/55ZR18 fitment in MY2024 and MY2025
  // and it is rated 274 in both, so one row spans the pair; MY2026 re-rates
  // the identical fitment at 263 and gets its own.
  R.push(
    daytona({
      id: "dodge-charger-daytona-rt-2024-25",
      model: "Charger Daytona",
      modelAliases: DAYTONA_ALIASES,
      trim: RT_TRIMS,
      years: [2024, 2025],
      range: { epaRangeMi: f(274, "mfr", "high", "18-inch wheels, standard", epa(48782)) },
      buyerNotes: rtNote("268 to 308"),
    }),
    daytona({
      id: "dodge-charger-daytona-sp-2024",
      model: "Charger Daytona",
      modelAliases: DAYTONA_ALIASES,
      trim: SP_TRIMS,
      years: [2024, 2024],
      rangeAbstain: SP_2024_ABSTAIN,
      buyerNotes: SP_2024_NOTE,
    }),
    daytona({
      id: "dodge-charger-daytona-sp-2025",
      model: "Charger Daytona",
      modelAliases: DAYTONA_ALIASES,
      trim: SP_TRIMS,
      years: [2025, 2025],
      range: {
        epaRangeMi: f(279, "mfr", "high", "305/35ZR20 wheels, standard; 216–241 on the staggered option", epa(49075)),
      },
      buyerNotes: spAvailableNote("38 to 63"),
    }),
    daytona({
      id: "dodge-charger-daytona-rt-2026",
      model: "Charger Daytona",
      modelAliases: DAYTONA_ALIASES,
      trim: RT_TRIMS,
      years: [2026, 2026],
      range: { epaRangeMi: f(263, "mfr", "high", "18-inch wheels, standard", epa(49957)) },
      buyerNotes: rtNote("258 to 295"),
    }),
    // MY2027 spans with MY2026 because EPA re-rated the identical standard
    // 305/35ZR20 fitment at the same 267 miles. No MY2027 R/T row exists here
    // for the same reason EPA has none: the 2027 Daytona line is Scat Pack
    // only, so an R/T row would be inventing a car.
    daytona({
      id: "dodge-charger-daytona-sp-2026-27",
      model: "Charger Daytona",
      modelAliases: DAYTONA_ALIASES,
      trim: SP_TRIMS,
      years: [2026, 2027],
      range: {
        epaRangeMi: f(267, "mfr", "high", "305/35ZR20 wheels, standard; 223–241 on the staggered option", epa(49648)),
      },
      buyerNotes: spAvailableNote("26 to 44"),
    }),
    // Bare-nameplate rows, 2024-2025 only. See the block comment: the MY2026
    // petrol Charger wears the same R/T and Scat Pack badges, so widening
    // these would hand a Sixpack six-cylinder an EV's battery facts.
    daytona({
      id: "dodge-charger-daytona-rt-2024-25-alt",
      model: "Charger",
      trim: RT_TRIMS,
      years: [2024, 2025],
      range: { epaRangeMi: f(274, "mfr", "high", "18-inch wheels, standard", epa(48782)) },
      buyerNotes: rtNote("268 to 308"),
    }),
    daytona({
      id: "dodge-charger-daytona-sp-2024-25-alt",
      model: "Charger",
      trim: SP_TRIMS,
      years: [2024, 2025],
      rangeAbstain: SP_2024_ABSTAIN,
      buyerNotes: SP_2024_NOTE,
    }),
    // Base row for the handful of Charger Daytona listings whose trim field
    // names neither badge. Only under the full "Charger Daytona" model string,
    // never bare "Charger": a trimless bare-Charger row would swallow the
    // MY2026 petrol Sixpack, which is the whole reason the alt rows above are
    // trim-guarded.
    {
      id: "dodge-charger-daytona-base-2024-27",
      make: "DODGE",
      model: "Charger Daytona",
      modelAliases: DAYTONA_ALIASES,
      modelYears: [2024, 2027],
      drive: "AWD",
      battery: DAYTONA_BATTERY,
      charging: DAYTONA_CHARGING,
      warranty: DAYTONA_WARRANTY,
      abstains: {
        heatPump: STELLANTIS_HP_ABSTAIN,
        epaRangeMi:
          "R/T and Scat Pack are rated 263 to 274 and 216 to 279 across their tire fitments, and these listings name neither badge, so the badge-keyed rows carry the figure",
      },
    }
  );
}

// ═══════════════════ HYUNDAI IONIQ 5 (MY2027) ═══════════════════════════
// data.ts's MY2025-26 block ends with an instruction: "Identical MY2027 EPA
// records already exist, but no 2027 Hyundai sheet — do not widen these rows
// until one is published." One is published now, and it is not a spec sheet
// but something better for this purpose: Hyundai's own model-year change
// document, titled "2027 Hyundai IONIQ 5 (EV) – Carry-over Model", whose
// complete list of changes from MY2026 is roof rails moving from XRT/Limited
// to SEL-and-above, HomeLink narrowing to Limited, the cargo cover becoming
// an accessory, and two matte paints being dropped. Nothing in the powertrain,
// the pack, the charging hardware or the climate system.
//
// So these are MY2027 rows rather than a widening of data.ts's, which leaves
// that file's own condition visible and its rows untouched. The facts are the
// ones the MY2025 specs-and-features sheet states and the carry-over document
// leaves alone; the EPA ids are 2027's own, and they repeat the 2025 and 2026
// figures exactly (245 / 318 / 290 / 269 / 259).
//
// The heat pump is the fact worth carrying forward carefully: it is AWD-only
// on this car, so the RWD rows say "none" and the AWD rows "standard", which
// is what the MY2025 feature sheet states and the carry-over document does
// not touch.
{
  const I5_SPECS_2025 = "https://www.hyundainews.com/assets/documents/original/64493-2025IONIQ5SpecsFeatures121124.pdf";
  const I5_NACS_2025 = "https://www.hyundainews.com/assets/documents/original/63444-2025IONIQ5XRTLimited8272024finalmjab.pdf";
  const I5_2027_CARRYOVER = "https://www.hyundainews.com/models/hyundai-ioniq_5-2027-ioniq_5";
  const I5_HANDBOOK = "https://www.hyundaiusa.com/content/dam/hyundai/us/com/pdf/assurance/2026_owners_handbook_warranty.pdf";

  // WARRANTY SOURCE, corrected. The first draft of these rows hung all five
  // warranty facts off the specs-and-features sheet above, which contains no
  // warranty text at all — a full-text search of that PDF for "warrant"
  // returns zero hits. The real source is Hyundai's "Owner's Handbook &
  // Warranty Information", whose Section 6 states the term in Hyundai's own
  // words: "The Warranty period for the following HYBRID, PLUG-IN HYBRID, AND
  // ELECTRIC VEHICLE Direct Energy components is limited to 10 years from the
  // date of original retail delivery or date of first use, or 100,000 miles,
  // whichever occurs first", with capacity "covered not to degrade more than
  // 70% of the original battery capacity", and the summary table's footnote
  // giving the powertrain split.
  //
  // The edition is MY2026 and these rows are MY2027, because Hyundai has not
  // published a MY2027 handbook (the 2027 URL 404s on the same path the 2026
  // one serves from — control-tested, not assumed). What licenses the read
  // across that year line is the same document the rows themselves rest on:
  // Hyundai's "2027 Hyundai IONIQ 5 (EV) – Carry-over Model" page, whose
  // complete change list is roof rails, HomeLink, a cargo cover and two
  // paints. When a MY2027 handbook appears, re-point these.
  //
  // batteryTransfers is deliberately GONE from this set. data.ts's MY2025-26
  // rows carry it as true with no citation, and the handbook does not support
  // it: its Warranty Transferability section names the New Vehicle Limited,
  // Anti-Perforation, emissions and Replacement Parts warranties as
  // transferable and says the 10-year Powertrain warranty is not, and leaves
  // the Section 6 EV warranty out of both lists. An expected-tier field is
  // cheap to leave empty; a transferability claim a buyer might pay for is
  // not cheap to get wrong.
  const I5_WARRANTY = {
    batteryYears: f(10, "mfr", "high", undefined, I5_HANDBOOK),
    batteryMiles: f(100_000, "mfr", "high", "From first retail delivery or first use", I5_HANDBOOK),
    sohFloorPct: f(70, "mfr", "high", undefined, I5_HANDBOOK),
    powertrainTerms: f("1st owner 10yr/100k; subsequent owners 5yr/60k", "mfr", "high", undefined, I5_HANDBOOK),
  };
  const I5_NOTES: EnrichmentRow["buyerNotes"] = [
    { headline: "HV battery bus-bar recall: NHTSA 25V482 / 26V068", severity: "warning", resolvedBy: "campaign_check" },
    {
      headline: "Hyundai calls the 2027 car a carry-over: the only changes from 2026 are roof rails, HomeLink, the cargo cover and two dropped paints",
      severity: "info",
      learnMore: I5_2027_CARRYOVER,
    },
  ];

  const i5 = (o: {
    id: string;
    trim?: string;
    drive: "AWD" | "RWD";
    packKwh: number;
    packNote: string;
    archNote: string;
    rangeMi: number;
    epaId: number;
    rangeNote?: string;
    heatPump: "standard" | "none";
    heatPumpNote: string;
    dcPeak: boolean;
  }): EnrichmentRow => ({
    id: o.id,
    make: "HYUNDAI",
    model: "Ioniq 5",
    trim: o.trim,
    modelYears: [2027, 2027],
    drive: o.drive,
    battery: { packGrossKwh: f(o.packKwh, "mfr", "high", o.packNote, I5_SPECS_2025) },
    range: { epaRangeMi: f(o.rangeMi, "mfr", "high", o.rangeNote, epa(o.epaId)) },
    charging: {
      portStandard: f<"NACS">("NACS", "mfr", "high", "Native NACS since the MY2025 facelift", I5_NACS_2025),
      superchargerAccess: f<"native">("native", "mfr", "high", undefined, I5_NACS_2025),
      architectureV: f(800, "mfr", "high", o.archNote, I5_SPECS_2025),
      dcFastCharging: f<"standard">("standard", "mfr", "high", undefined, I5_SPECS_2025),
      // Hyundai's 2025 sheet, which these MY2027 rows already carry for pack,
      // architecture and heat pump as a documented carryover. Its charge-time
      // block is the reason the note names two numbers: the facelift ships a
      // NACS port, but the car's quickest DC session is still on an 800V CCS
      // station through the adapter (20 min), while its own NACS plug on a
      // 150 kW Supercharger takes 24-30. A shopper reading "NACS" would
      // otherwise assume the Supercharger is the fast one.
      acOnboardKw: f(10.9, "mfr", "high", undefined, I5_SPECS_2025),
      chargeTime1080Min: f(20, "mfr", "high", "10-80% on a >250 kW 800V charger via the CCS adapter; 24-30 min on a 150 kW NACS Supercharger", I5_SPECS_2025),
      ...(o.dcPeak
        ? {
            dcPeakKw: f(
              257,
              "tested",
              "medium",
              "Hyundai publishes no vehicle peak. Instrumented curves on the 84 kWh pack peak at ~257–260 kW on 800V hardware, only reachable via the CCS adapter, not on today's 400V Superchargers"
            ),
          }
        : {}),
    },
    thermal: {
      heatPump: f<"standard" | "none">(o.heatPump, "mfr", "high", o.heatPumpNote, I5_SPECS_2025),
      batteryPreconditioning: f(true, "mfr", "high", "Standard on all models", I5_SPECS_2025),
    },
    warranty: I5_WARRANTY,
    buyerNotes: I5_NOTES,
  });

  R.push(
    i5({
      id: "ioniq5-2027-sr",
      trim: "Standard Range",
      drive: "RWD",
      packKwh: 63.0,
      packNote: "Standard Range pack",
      archNote: "523V, Standard Range pack",
      rangeMi: 245,
      epaId: 50646,
      heatPump: "none",
      heatPumpNote: "Heat pump is AWD-only; every Standard Range car is RWD",
      dcPeak: false,
    }),
    i5({
      id: "ioniq5-2027-rwd",
      drive: "RWD",
      packKwh: 84.0,
      packNote: "Long Range pack",
      archNote: "697V, long-range pack",
      rangeMi: 318,
      epaId: 50645,
      rangeNote: "One rating covers all long-range RWD trims",
      heatPump: "none",
      heatPumpNote: "Heat pump is AWD-only; RWD cars have none",
      dcPeak: true,
    }),
    i5({
      id: "ioniq5-2027-awd",
      drive: "AWD",
      packKwh: 84.0,
      packNote: "Long Range pack",
      archNote: "697V, long-range pack",
      rangeMi: 290,
      epaId: 50642,
      rangeNote: "19-inch wheels, SE and SEL",
      heatPump: "standard",
      heatPumpNote: "Standard on AWD",
      dcPeak: true,
    }),
    i5({
      id: "ioniq5-2027-awd-limited",
      trim: "Limited",
      drive: "AWD",
      packKwh: 84.0,
      packNote: "Long Range pack",
      archNote: "697V, long-range pack",
      rangeMi: 269,
      epaId: 50643,
      rangeNote: "20-inch wheels, the Limited AWD's fitment",
      heatPump: "standard",
      heatPumpNote: "Standard on AWD",
      dcPeak: true,
    }),
    i5({
      id: "ioniq5-2027-xrt",
      trim: "XRT",
      drive: "AWD",
      packKwh: 84.0,
      packNote: "Long Range pack",
      archNote: "697V, long-range pack",
      rangeMi: 259,
      epaId: 50644,
      heatPump: "standard",
      heatPumpNote: "XRT is AWD-only and the heat pump is standard on AWD",
      dcPeak: true,
    })
  );

  // A GUARD, not a researched car. data.ts keeps trim-"N" rows for MY2025 and
  // MY2026 with the comment that they are "sparse on purpose … so an Ioniq 5 N
  // listed under the base model name doesn't inherit the 290-mile AWD rating",
  // and the four MY2027 rows above are trim-agnostic by design, so without
  // this one an N filed as model "Ioniq 5" would take the ordinary AWD car's
  // 290 miles against its own 221 — a 69-mile overstatement, in the direction
  // that costs a shopper money.
  //
  // It says almost nothing because there is almost nothing true to say: no
  // MY2027 IONIQ 5 N exists in EPA's dataset (control test — EPA's 2027
  // Hyundai records carry five ordinary IONIQ 5 entries and no N), and
  // Hyundai's own newsroom stops at a MY2026 IONIQ 5 N model page. The
  // warranty is the one fact that spans the nameplate regardless of grade.
  R.push({
    id: "ioniq5-2027-n-guard",
    make: "HYUNDAI",
    model: "Ioniq 5",
    modelYears: [2027, 2027],
    trim: "N",
    warranty: I5_WARRANTY,
    abstains: {
      epaRangeMi: "EPA has no MY2027 IONIQ 5 N record and the MY2026 N's 221 miles cannot be assumed to carry",
      packUsableKwh: "Hyundai publishes no MY2027 IONIQ 5 N specification, so the MY2026 pack figure cannot be carried forward",
      portStandard: "Hyundai publishes no MY2027 IONIQ 5 N specification, and the N's connector has differed from the rest of the line before",
      heatPump: "Hyundai publishes no MY2027 IONIQ 5 N specification, so the MY2026 fitment cannot be carried forward",
    },
    buyerNotes: I5_NOTES,
  });
}

// ═══════════════ GMC HUMMER EV PICKUP / SUV (MY2026) ════════════════════
// data2's Hummer rows stop at MY2025 (pickup) and MY2025 (SUV), and 439 live
// MY2026 listings fall off the end of them. These rows pick those up, and
// they are deliberately thin, because GM publishes far less about this truck
// than every other maker in this file does about theirs. Three of the five
// core fields abstain, and each abstention is a finding rather than a
// backlog item:
//
// NO EPA RANGE EXISTS FOR MY2026, control-tested twice. fueleconomy.gov's
// 2026 GMC list carries the Sierra EV but no Hummer of either body, so the
// absence is EPA's and not a fetch failure; and GM's own MY2026 pages say
// "AVAILABLE GM-EST. RANGE UP TO 363 MILES" (pickup) and "UP TO 319 MILES"
// (SUV) — GM-estimated, in GM's own words, never EPA-estimated. GM's figures
// go in a buyer note where a shopper can see whose estimate they are;
// epaRangeMi means an EPA rating and stays empty, the same call data2's own
// Hummer note already makes for the unrated 2022-23 trucks.
//
// NO kWh FIGURE EXISTS IN ANY GM DOCUMENT. GM describes these packs only by
// module count — "20-module" and "24-module" — on its model pages, in its
// trim configurators and in its own spec-sheet PDFs, where a full-text search
// for "kWh" returns nothing at all. Every kWh number in circulation for this
// truck is somebody's estimate. data2's older rows carry one tagged `est`;
// these rows would rather say nothing than add a fourth model year of it.
//
// NO HEAT-PUMP CLAIM, on the standing GM rule: GM's vocabulary for this is
// "Ultium" and "energy recovery", and the words "heat pump" appear on neither
// MY2026 model page nor in the spec PDFs.
//
// WHAT THESE ROWS DO CARRY is worth the file space: the connector, the route
// onto the Supercharger network, and a warranty with a stated capacity floor,
// all from GM and all confirmed for MY2026 specifically. The connector is the
// nice one — GM's own accessory catalogue says the NACS DC adapter "is
// designed for compatible EVs with a CCS1 charging inlet", and its fitment
// list names the 2026 Hummer EV Pickup and the 2026 Hummer EV SUV, which is
// GM saying in two sentences that the MY2026 truck is still CCS1 and still
// needs the adapter.
{
  const GM_NACS_ADAPTER = "https://accessories.gmc.com/product/gm-nacs-dc-adapter-85836744";
  const GM_SUPERCHARGER = "https://www.gmc.com/support/vehicle/ev-charging/public-charging/tesla-supercharger";
  const GM_BATTERY_LIFE = "https://www.gmc.com/gmc-life/ev-battery-life";
  const HUMMER_PICKUP_2026 = "https://www.gmc.com/electric/hummer-ev/pickup-truck";
  const HUMMER_SUV_2026 = "https://www.gmc.com/electric/hummer-ev/suv";

  // No epaRangeMi abstention any more: EPA still has not rated a MY2026 Hummer
  // of either body — its 2026 GMC list is the Sierra EV and nothing else,
  // re-read 2026-08-28 — but GM publishes a figure for every configuration and
  // `range.mfrRangeMi` (lib/types.ts) is where a maker's own figure goes. The
  // rows below carry it. The other two silences stand.
  const HUMMER_ABSTAINS = {
    packUsableKwh:
      "GM states pack size only as a module count — 20-module or 24-module — on its model pages, in its configurators and in its own spec sheets, which carry no kWh figure anywhere",
    heatPump:
      "GM's MY2026 Hummer pages and spec sheets never use the term, describing thermal hardware only as Ultium and energy recovery, so neither presence nor absence can be stated",
  };
  // ── MY2026 Hummer: one row per configuration, keyed on VIN positions 4-8 ──
  //
  // 868 of these showed no range at all, and the shape of the failure is the
  // one this corpus keeps repeating: EPA never rated the truck, the schema's
  // only range field was named epaRangeMi, so the row abstained — and then put
  // GM's number in a NOTE HEADLINE reading "No EPA range rating exists for the
  // 2026 truck; GM's own estimate is up to 363 miles on the 24-module pack".
  // That headline is the best of SIX pickup figures. A 2X pickup is a 316-mile
  // truck, so the one row was quietly 47 miles optimistic for the 244 of them
  // in the feed, in the sentence it used instead of a number.
  //
  // GMC's own FAQ tables, read 2026-08-28:
  //   Pickup 2X                       316   (Extreme Off-Road Package: 300)
  //   Pickup 3X, 20-module            312   (EOR: 297)
  //   Pickup 3X, 24-module            363   (EOR: 345)
  //   SUV    2X                       319   (EOR: 298)
  //   SUV    3X                       310   (EOR: 294)
  //
  // The VIN carries trim and pack, and the sweep is what says so rather than
  // the dealer's trim string. One real live VIN per descriptor in the feed:
  //   4EADD  2X,  2-MOTOR, 20-MOD (ETI)      4EDDA  3X, 3-MOTOR, 24-MOD (ETN)
  //   4EBDD  2X,  2-MOTOR, 20-MOD (ETI)      4EDDB  3X, 3-MOTOR, 20-MOD (ETI)
  //   4EEDB  3X Carbon Fiber, 20-MOD (ETI)
  //   TEHDE  2X,  2-MOTOR, 20-MOD (ETJ)      TERDC  3X, 3-MOTOR, 20-MOD (ETJ)
  //   TENDE  2X,  2-MOTOR, 20-MOD (ETJ)      TESDC  3X Carbon Fiber, 20-MOD
  //
  // Note position 8 is D/A/B on the pickup and E/C on the SUV for the same
  // packs — which is exactly why these are five-character `vds` keys and not
  // `vin8` (data4.ts's Sierra EV block flagged the Hummer as the collision
  // that makes position 8 unsafe on its own, and it was right).
  //
  // TWO THINGS DELIBERATELY NOT CLAIMED.
  // The Extreme Off-Road Package moves every figure by 15-21 miles and is not
  // in the VIN: vPIC's full decode carries no option-package field, and GMC
  // sells it as a package rather than a model. So these rows print the
  // standard configuration's figure and name the package's figure in the row
  // `note` — the rule this corpus settled for range-varies-by-wheel-size,
  // where a "always quote the lowest" rule was ratified and reversed the same
  // day. Every figure here already renders with the "est" mark.
  // And `3VL`: two pickup descriptors, 4EADD and 4EBDD, decode as 2X trucks
  // that differ in NOTHING vPIC reports except the trim label, which reads
  // "3VL 2X" on the first and "2X" on the second — same motor count, same
  // module count, same everything else on a full field-by-field diff. Nothing
  // found this pass connects 3VL to the Extreme Off-Road Package, and guessing
  // that it does would move 130 trucks to 300 miles on a hunch. Both are 2X
  // rows at 316. If 3VL is ever identified, this is the note to revisit.
  const HUMMER_RANGE_SRC_PICKUP = HUMMER_PICKUP_2026;
  const HUMMER_RANGE_SRC_SUV = HUMMER_SUV_2026;
  const eorNote = (standard: number, eor: number, what: string) =>
    `GM-estimated, ${what}. GMC quotes ${eor} miles for the same truck with the Extreme Off-Road Package, which is an option package and is not encoded in the VIN, so this is the standard configuration's figure. GM has no EPA rating for any MY2026 Hummer.`;
  const HUMMER_CHARGING = {
    portStandard: f<"CCS1">("CCS1", "mfr", "high", undefined, GM_NACS_ADAPTER),
    superchargerAccess: f<"adapter">("adapter", "mfr", "high", "GM NACS DC adapter, DC stations only", GM_SUPERCHARGER),
  };
  const HUMMER_WARRANTY = {
    batteryYears: f(8, "mfr", "high", undefined, GM_BATTERY_LIFE),
    batteryMiles: f(100_000, "mfr", "high", undefined, GM_BATTERY_LIFE),
    sohFloorPct: f(75, "mfr", "high", undefined, GM_BATTERY_LIFE),
  };

  const NACS_NOTE = {
    headline: "Still a CCS1 port: Tesla Superchargers need GM's NACS DC adapter, which does not work on Level 2 chargers",
    severity: "info" as const,
    learnMore: GM_NACS_ADAPTER,
  };
  // No `trim` key on any of these. On a vds-keyed row a trim key is a veto —
  // trimMatches() refuses a listing whose own trim field is blank and runs
  // before the vds filter — and three live Hummers carry no trim string at
  // all. tests/sierra-ev-vin-keys.test.ts pins the same rule for the Sierra.
  const hummer2026 = (
    id: string,
    model: string,
    modelAliases: string[] | undefined,
    vds: string[],
    packVariant: string,
    rangeMi: number,
    note: string,
    src: string
  ): EnrichmentRow => ({
    id,
    make: "GMC",
    model,
    modelAliases,
    modelYears: [2026, 2026],
    vds,
    packVariant,
    range: { mfrRangeMi: f(rangeMi, "mfr", "high", note, src) },
    charging: HUMMER_CHARGING,
    warranty: HUMMER_WARRANTY,
    abstains: HUMMER_ABSTAINS,
    buyerNotes: [NACS_NOTE],
  });

  R.push(
    hummer2026("hummer-ev-pickup-2026-2x", "Hummer EV", ["Hummer EV Pickup"], ["4EADD", "4EBDD"],
      "2X (20-module)", 316, eorNote(316, 300, "2X pickup, 20-module pack"), HUMMER_RANGE_SRC_PICKUP),
    hummer2026("hummer-ev-pickup-2026-3x-20", "Hummer EV", ["Hummer EV Pickup"], ["4EDDB", "4EEDB"],
      "3X (20-module)", 312, eorNote(312, 297, "3X pickup, 20-module pack"), HUMMER_RANGE_SRC_PICKUP),
    hummer2026("hummer-ev-pickup-2026-3x-24", "Hummer EV", ["Hummer EV Pickup"], ["4EDDA"],
      "3X (24-module)", 363, eorNote(363, 345, "3X pickup, 24-module pack — the longest-range Hummer GM sells"), HUMMER_RANGE_SRC_PICKUP),
    hummer2026("hummer-ev-suv-2026-2x", "Hummer EV SUV", ["Hummer SUV"], ["TEHDE", "TENDE"],
      "2X", 319, eorNote(319, 298, "2X SUV"), HUMMER_RANGE_SRC_SUV),
    hummer2026("hummer-ev-suv-2026-3x", "Hummer EV SUV", ["Hummer SUV"], ["TERDC", "TESDC"],
      "3X", 310, eorNote(310, 294, "3X SUV"), HUMMER_RANGE_SRC_SUV)
  );
}

export const RESEARCH_ROWS_10: EnrichmentRow[] = R;
