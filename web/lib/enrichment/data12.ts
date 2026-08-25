import type { EnrichmentRow, Fact, Source } from "../types";

// Lucid Air, model years 2022–2024 and 2026 (2026-08-25).
//
// 483 Lucid Airs are live today and only three rows existed for them — the
// MY2025 Pure, Touring and Grand Touring in data3, which cover 125 of those
// cars. Every other year matched nothing at all: 28 from 2022, 60 from 2023,
// 102 from 2024 and 168 from 2026, arriving with an empty enrichment card on
// a $70,900–$249,000 car. scripts/live-enrichment-gap.mjs called it one
// group, "LUCID Air, total, 357 listings, 2022-2026", the second-largest
// unmatched nameplate this make has after the Gravity. This file covers those
// four years and takes that group to one listing. It deliberately does not
// touch the 2025 span, which data3 owns.
//
// Sourcing is the two lanes data6 and data9 use: every range figure comes
// from fueleconomy.gov's REST API (menu/model -> menu/options -> /vehicle/{id})
// and cites the Find.do page for the id it came from; every battery, charging
// and warranty fact comes from a Lucid document fetched and read this pass.
// The spec PDFs were rendered to images and read as pages, not scraped as
// text, because their numbers live in tables.
//
// ── THE VIN IS THE DISCRIMINATOR, AND LUCID FILED IT PROPERLY ──────────────
// Every row here is keyed on the vehicle descriptor rather than trusting the
// trim string, because Lucid's Part 565 filing encodes the version twice and
// dealer feeds encode it badly. Scanning all 1,296 (position 6, position 7)
// pairs against vPIC for 2022, 2023, 2024 and 2026 (2026-08-25) returns a
// clean two-axis table:
//
//   position 6 — the model:  D=Dream  G=Grand Touring  P=Pure
//                            S=Sapphire  T=Touring
//   position 7 — motor power: A=829 kW  B=611  C=696  D=783
//                            E=462  F=358  G=330  T=930
//
// Position 6 is vPIC's own Trim decode, so it needs no interpreting. Position
// 7 is filed independently of it, and it is what separates cars a trim string
// cannot — but read it carefully, because only ONE model year offers an
// independent check on it.
//
// MY2022 is that year. EPA prints the motor pair for each MY2022 Lucid entry
// and the sums land exactly on vPIC's kW:
//
//   Air Dream P  "370 and 459kW"  = 829  -> position 7 = A
//   Air Dream R  "198 and 498kW"  = 696  -> position 7 = C
//   Air G Touring "178 and 433kW" = 611  -> position 7 = B
//
// 829 kW is 1,111 hp and 696 kW is 933 hp, and those are the two Dream Edition
// outputs Lucid's own 16 September 2021 release names ("the 1,111 horsepower
// Lucid Air Dream Edition Performance"; the Range "achieving 520 miles of
// range while still delivering 933 horsepower"). So 50EA1DA is a Dream Edition
// Performance and 50EA1DC a Dream Edition Range — 49 EPA miles apart, and no
// dealer feed distinguishes them: the one live Dream says only "Dream Edition"
// and vPIC decodes both patterns to Trim "Dream".
//
// DO NOT extend that control past 2022. EPA's `evMotor` is unreliable in later
// years and would mis-key three of these rows if it were trusted: the MY2023
// Grand Touring record (46303) prints the Dream Performance's "370 and 459kW",
// and the MY2024 and MY2026 Touring records print the Grand Touring's "178 and
// 433 kW". For 2023 onward the keys rest on vPIC's Trim decode plus what the
// live feed actually contains — every one of the 483 live Airs is a 50EA1
// VIN, and every Touring of every year is 50EA1TE, every Pure 2024-on
// 50EA1PG, every 2023 Pure 50EA1PF, every Grand Touring 50EA1GB.
//
// The same key stops the Touring/Grand Touring collision that data3 had to
// fix with a separate row: `trimStringsOverlap` is substring-tolerant, so a
// listing that says "Touring" matches a row keyed "Grand Touring" as well.
// A `vds` filter is hard — a row keyed to descriptors never matches a VIN
// outside them — so the Grand Touring row simply cannot reach a Touring VIN.
//
// It also protects the versions this file deliberately does NOT carry. There
// is no live 2023 Grand Touring Performance (50EA1GD, 783 kW, EPA-rated only
// on 21-inch wheels at 446 mi) and no live Sapphire (50EA1ST, 930 kW, 427
// mi), so no row is written for either. Because every Grand Touring row is
// keyed to 50EA1GB, a Grand Touring Performance ARRIVING WITH ITS VIN matches
// nothing rather than picking up the ordinary car's 516 miles — the Cadillac
// Lyriq V-Series failure exactly, and the reason `vds` exists. Note the limit
// of that, since it is easy to overclaim: with no VIN in the record, "Grand
// Touring Performance" still contains both "Grand Touring" and "Touring", so
// such a listing lands on those two rows as candidates rather than on nothing.
// Every listing on the live site carries its VIN, so this is the shard-audit
// path rather than the shopper's, but the guarantee is VIN-shaped and the
// comment should not pretend otherwise.
//
// One more premise worth writing down because it is untested: the scan varied
// positions 6 and 7 only, so every key here assumes positions 4-5 are "A1".
// All 483 live Airs are; a Lucid Air whose descriptor is not A1 would match no
// row at all, which is the safe direction to be wrong in.
//
// ── "GENERATION 1" IS vPIC's SERIES FIELD, LEAKED INTO THE TRIM ───────────
// Seven live listings carry the trim "Generation 1" — one 2022, four 2023,
// one 2024, and one 2025 this file does not touch. That is not a Lucid
// grade: it is vPIC's `Series` value, which reads "Generation 1" for every
// Lucid Air pattern of every year, and some feeds write vPIC's Series into
// their trim field. Same shape as the 2026 RAV4's "64 Series". It is listed
// as an alias on every row rather than given a label row of its own, because
// here the VIN settles it: a "Generation 1" listing reaches all of its year's
// rows on the trim test and then the descriptor picks exactly one. Without a
// VIN it resolves to candidates, which is the honest answer.
//
// ── WHAT THIS FILE WILL NOT SAY ───────────────────────────────────────────
// Pack size for 2022, 2023 and 2026 is absent, not forgotten. Lucid published
// per-trim technical specifications only for MY2024 and MY2025; there is no
// 2022, 2023 or 2026 sheet on lucidmotors.com (checked by URL this pass), and
// vPIC's figure cannot stand in for one: BatteryKWh reads exactly 112.00 for
// EVERY MY2022 Lucid pattern — including the Touring patterns, and Lucid sold
// no 2022 Air Touring at all (EPA's MY2022 Lucid list is Dream P, Dream R and
// Grand Touring, nothing else). A capacity filed against a car that was never
// built is a filing constant, not a measurement, and it is the exact shape
// `ignoreKwhHint` exists for. Carrying MY2025's 84 kWh back to the
// 2026 Pure would be the same guess in a nicer suit, and for the 2026 Touring
// it would be a wrong one: Lucid's own 2026 release credits the range gain to
// "new higher density battery cells."
//
// ── WHEELS ────────────────────────────────────────────────────────────────
// Every Air is EPA-rated two or three times, once per wheel, and the spread
// reaches 66 miles (2024 and 2026 Grand Touring, 516 to 450 and 512 to 446).
// Lucid marks a standard fitment in some documents and not others, so every
// row here prints the 19-inch rating, names the other ratings in its note, and
// says the word "standard" only where Lucid used it for that model year:
//
//   said outright — 2024 Pure ("19" wheel (standard)", technical specs) and
//     2026 Touring ("the standard 19-inch Aero Range wheel", 2026 release).
//   not said — 2022 and 2023 (no per-trim sheet survives), the 2024 Touring
//     (whose sheet lists 19/20/21-inch tires with no standard marked, where
//     the Pure sheet of the same year marks one) and every Grand Touring.
//
// Where it is not said the row still prints the 19-inch rating and names the
// rest in the note, exactly as data9's Mercedes CLA and Lexus RZ rows do,
// without asserting which wheel a given car wears.
//
// THE GRAND TOURING IS WHERE THAT RULE COSTS SOMETHING, so here is the whole
// argument. Lucid's current Grand Touring page says the car "Comes standard
// with 20” Aero Lite wheels", EPA rates that fitment at 480, and data3's
// MY2025 Grand Touring row prints 480 on exactly that reasoning. This file
// prints 512 for MY2026 anyway, for three reasons:
//
//   - that page prices MY2027 by its own footnotes, and using a later model
//     year's page to fix this one's fitment is the move this file refuses two
//     paragraphs above for pack kWh;
//   - the only per-model-year Lucid document that marks a Grand Touring
//     standard wheel at all is the MY2025 technical-spec sheet, and it says
//     "19” wheel (standard)" — the opposite;
//   - and a 20-inch reference for 2026 beside a 19-inch reference for 2022,
//     2023 and 2024 would print a 36-mile drop between a 2024 Grand Touring
//     and a 2026 one that EPA's own records say does not exist (516/485/450
//     against 512/480/446 — within four miles at every wheel). Inventing a
//     year-over-year regression on a $114,900 car is its own false claim.
//
// The live consequence is a conflict with data3's MY2025 row, which prints
// 480 where the 2024 and 2026 rows here print 516 and 512. That conflict is
// real and it is data3's to settle — a separate pass is adjudicating those
// rows — so it is written down here rather than papered over by matching a
// figure this file's own evidence does not support.
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

{
  // Lucid's own charging knowledge page. Undated, so it is read as a
  // statement about the Air as Lucid describes it today, which is the right
  // reading for the port: "Lucid Air has a combination J1772–CCS1 charge
  // port, which is different from the NACS charge port," and "Only
  // newer-generation Superchargers (V3 and above) are capable of charging
  // Lucid vehicles."
  //
  // One number on that page is deliberately NOT used. It says "the Lucid
  // Connected Home Charging Station charges at up to 19.2 kW" — that is the
  // wall box's rating, not the car's onboard AC acceptance, and no Lucid
  // document found this pass states the Air's AC limit. acOnboardKw stays
  // empty rather than borrowing the charger's figure.
  const CHARGING_KB = "https://lucidmotors.com/knowledge/ownership/charging/public-charging";

  // 22 July 2025, on lucidmotors.com: the MY2026 lineup and the Supercharger
  // adapter. "The DC NACS to CCS1 adapter will be priced at $220 US excluding
  // taxes. Using this solution, the Air can charge at up to 50 kW," and it
  // applies to "All Lucid Air owners, regardless of model or model year,"
  // from 31 July 2025 — which is why the 2022 rows carry the same
  // Supercharger fact as the 2026 ones.
  const RELEASE_2026 = "https://lucidmotors.com/stories/2026-lucid-air-tesla-superchargers";

  // Lucid's 5 December 2023 lineup release — off lucidmotors.com now, read
  // from web.archive.org/web/20240901000000/https://lucidmotors.com/
  // media-room/lucid-air-model-lineup-updates-2024. It is not cited on a fact
  // because every range figure below cites EPA directly, but its footnote is
  // the independent check on all of them, in Lucid's own words: "EPA est.
  // range ratings in miles for MY 2024 vehicles when equipped with 19” wheels:
  // 411 Touring/419 Pure RWD… EPA est. range ratings in miles for MY 2023
  // vehicles when equipped with 19” wheels: 516 Grand Touring/425 Touring/410
  // Pure AWD." All five of those figures match the EPA record cited below
  // them (the footnote also gives the Sapphire's 427; no row here uses it).
  //
  // The same sentence settles a discrepancy that would otherwise look like an
  // error: the 2024 Pure technical-spec sheet prints 410 miles where EPA says
  // 419, and Lucid explains why in the next clause — "Manufacturer's
  // projected range for Pure RWD equipped with 19” wheels is 410 miles." Two
  // different figures for the same car, one Lucid's own projection and one the
  // government's rating. This field is labelled "EPA range" on the page, so it
  // carries 419.

  const PURE_SPECS_2024 = "https://lucidmotors.com/media/document/lucid-air-pure-technical-specs-2024.pdf";
  const TOURING_SPECS_2024 = "https://lucidmotors.com/media/document/lucid-air-touring-technical-specs-2024.pdf";

  // Three booklets, one term. All three US booklets were read this pass and
  // all three print the same High Voltage Battery line — "8 Years / 100,000
  // miles retaining 70% capacity" — and all three extend the warranty to
  // subsequent owners, the pre-April-2024 one in the plainest words: "The
  // Lucid New Vehicle Limited Warranty can be transferred from the original
  // owner to a subsequent owner—the new owner must provide proof of ownership
  // transfer." (The later two say the same thing differently and add a
  // region-transfer restriction that does not touch resale within the US.)
  //
  // Lucid splits these by PURCHASE DATE, not model year, which is why MY2024
  // has no booklet of its own to cite: its own table reads "Before 04/16/2024
  // — New Vehicle Limited Warranty (Model Year 2022, 2023, and 2024)" and "On
  // or after 04/16/2024 — (Model Year 2024 and Model Year 2025)". A 2024 Air
  // falls under whichever one its buyer bought under, so those rows cite the
  // knowledge page that carries the coverage table and links both booklets
  // rather than picking one and being wrong for half the year's cars.
  const WARRANTY_TO_APR_2024 =
    "https://lucidmotors.com/s3fs-public/pdf/New-Vehicle-Limited-Warranty-NA-Before-Apr16-24.pdf";
  const WARRANTY_MY2024_SPLIT =
    "https://lucidmotors.com/knowledge/ownership/maintenance-and-warranty/lucid-limited-warranty";
  const WARRANTY_MY2026 =
    "https://lucidmotors.com/media/document/WARR_New-Vehicle-Limited-Warranty_enUS_2026.21.3.pdf";

  const warranty = (url: string): EnrichmentRow["warranty"] => ({
    batteryYears: f(8, "mfr", "high", undefined, url),
    batteryMiles: f(100_000, "mfr", "high", undefined, url),
    sohFloorPct: f(70, "mfr", "high", undefined, url),
    batteryTransfers: f(true, "mfr", "high", undefined, url),
  });

  const charging = (extra: NonNullable<EnrichmentRow["charging"]> = {}): EnrichmentRow["charging"] => ({
    portStandard: f<"CCS1">("CCS1", "mfr", "high", "Combination J1772–CCS1 inlet; no native NACS port", CHARGING_KB),
    superchargerAccess: f<"adapter">(
      "adapter",
      "mfr",
      "high",
      "Lucid's $220 NACS adapter, up to 50 kW, V3 Superchargers and newer",
      RELEASE_2026
    ),
    dcFastCharging: f<"standard">("standard", "mfr", "high", undefined, CHARGING_KB),
    ...extra,
  });

  // "Generation 1" rides on every row: see the header. It is vPIC's Series
  // value, not a grade, and the descriptor is what actually picks the row.
  const GEN1 = "Generation 1";

  // ── WHY EVERY ROW HERE IS SILENT ON THE HEAT PUMP ────────────────────────
  // Control-tested rather than assumed. Every page in lucidmotors.com's own
  // sitemap that could carry the fact was fetched this pass — 49 /stories/
  // releases plus /air, /air-pure, /air-touring, /air-grand-touring,
  // /air-sapphire, /air-vs-competition, /technologies, /tech-talks and the
  // charging and knowledge-base pages — and the word "pump" appears on
  // exactly none of the 58, for any Lucid. The control that makes that worth
  // believing rather than a broken grep: over the same 58 files "range" hits
  // 44 and "battery" hits 40. Neither MY2024 technical-spec sheet has a
  // thermal section at all, and Lucid publishes no owner's manual outside its
  // login-walled portal.
  //
  // So the answer is not "we did not look": as Lucid's published record stands
  // today, the company says nothing about heat-pump hardware on any Air of any
  // year, and a row that filled this in would be guessing.
  //
  // WHAT WOULD CLOSE THIS, for whoever picks it up: Lucid's April 2024 Grand
  // Touring release and its July 2024 MY2025 lineup release are both reported
  // to date the fitment (Sapphire first, then the 2024 Grand Touring, then the
  // whole lineup), and data3's MY2025 rows already quote the second one. Both
  // have been removed from lucidmotors.com, and web.archive.org answered 503
  // to every attempt over the whole of this pass. Read them and four rows here
  // — the 2024 Grand Touring and all three 2026 cars — become answerable, and
  // the 2022/2023 rows get a dated "not yet" instead of a silence. Until then
  // this file will not repeat a quotation it has not read; that is exactly the
  // fabricated-citation failure the fact-sheet protocol exists to prevent.
  const LUCID_HEAT_PUMP_SILENCE =
    "No page now published on lucidmotors.com uses the term heat pump for any Lucid, and neither MY2024 technical-spec sheet has a thermal section";

  // ───────────────────────────── MY2022 ──────────────────────────────────
  // 28 live: 26 listings that say "Grand Touring", one that says "Generation
  // 1" on a Grand Touring VIN, and one Dream Edition. Both Dream rows are
  // written even though only the Performance is in stock, because the two are
  // 49 EPA miles apart and the feed never names which is which — only the VIN
  // does.
  //
  // ignoreKwhHint is set on this year for the reason in the header: vPIC
  // answers BatteryKWh 112.00 for every MY2022 Lucid pattern, Touring
  // patterns included, and no 2022 Air Touring was ever sold. It is a filing
  // constant, not a per-car fact, and must never be allowed to veto a row.
  const y2022 = (
    id: string,
    trim: string[],
    vds: string[],
    rangeMi: number,
    epaId: number,
    kwh100: number,
    rangeNote: string
  ): EnrichmentRow => ({
    id,
    make: "LUCID",
    model: "Air",
    modelYears: [2022, 2022],
    trim,
    drive: "AWD",
    vds,
    ignoreKwhHint: true,
    range: {
      epaRangeMi: f(rangeMi, "mfr", "high", rangeNote, epa(epaId)),
      epaKwhPer100Mi: f(kwh100, "mfr", "high", "19-inch wheels", epa(epaId)),
    },
    charging: charging(),
    warranty: warranty(WARRANTY_TO_APR_2024),
    abstains: {
      packUsableKwh:
        "lucidmotors.com publishes no MY2022 technical-spec sheet, and vPIC's 112 kWh is one constant filed against every 2022 Lucid pattern, including a Touring Lucid never sold that year",
      heatPump:
        LUCID_HEAT_PUMP_SILENCE,
    },
  });

  R.push(
    y2022(
      "lucid-air-2022-dream-edition-range",
      ["Dream Edition Range", "Dream Edition R", "Dream Edition", "Dream", GEN1],
      ["A1DC"],
      520,
      44493,
      27,
      "19-inch wheels; 481 mi on the 21-inch fitment"
    ),
    y2022(
      "lucid-air-2022-dream-edition-performance",
      ["Dream Edition Performance", "Dream Edition P", "Dream Edition", "Dream", GEN1],
      ["A1DA"],
      471,
      44491,
      29,
      "19-inch wheels; 451 mi on the 21-inch fitment"
    ),
    y2022(
      "lucid-air-2022-grand-touring",
      ["Grand Touring", GEN1],
      ["A1GB"],
      516,
      44495,
      26,
      "19-inch wheels; 469 mi on the 21-inch fitment"
    )
  );

  // ───────────────────────────── MY2023 ──────────────────────────────────
  // 60 live, and 59 of them resolve: 28 Tourings, 16 Grand Tourings and 15
  // Pures once the four "Generation 1" listings are placed by their VINs. The
  // sixtieth is a Grand Touring (50EA1GBA6PA001055) whose trim field is empty,
  // and it stays unmatched on purpose — trimMatches() refuses a trim-keyed row
  // to a listing that names no trim, and a trim-less row here would be a
  // catch-all for every VIN-less Air of the year.
  //
  // The Pure is all-wheel drive this year and only this year — the rear-drive
  // Pure arrives for 2024, and vPIC's 330 kW code (position 7 = G) is unused
  // in the 2023 filing. Four live listings say "RWD" in the feed on a 50EA1PF
  // VIN, which is the 480-hp twin-motor car; the drive filter cannot lose the
  // row over it (it only narrows when something survives), and the descriptor
  // decides.
  const y2023 = (
    id: string,
    trim: string[],
    vds: string[],
    rangeMi: number,
    epaId: number,
    kwh100: number,
    rangeNote: string
  ): EnrichmentRow => ({
    id,
    make: "LUCID",
    model: "Air",
    modelYears: [2023, 2023],
    trim,
    drive: "AWD",
    vds,
    range: {
      epaRangeMi: f(rangeMi, "mfr", "high", rangeNote, epa(epaId)),
      epaKwhPer100Mi: f(kwh100, "mfr", "high", "19-inch wheels", epa(epaId)),
    },
    charging: charging(),
    warranty: warranty(WARRANTY_TO_APR_2024),
    abstains: {
      packUsableKwh:
        "lucidmotors.com publishes no MY2023 technical-spec sheet, and a neighbouring year is not a source: the Pure's own pack moved 88 to 84 kWh across one model year",
      heatPump:
        LUCID_HEAT_PUMP_SILENCE,
    },
  });

  R.push(
    y2023(
      "lucid-air-2023-pure-awd",
      ["Pure", GEN1],
      ["A1PF"],
      410,
      46307,
      24,
      "19-inch wheels; 384 mi on the 20-inch fitment"
    ),
    y2023(
      "lucid-air-2023-touring",
      ["Touring", GEN1],
      ["A1TE"],
      425,
      46309,
      24,
      "19-inch wheels; 384 mi on the 20- and 21-inch fitments"
    ),
    y2023(
      "lucid-air-2023-grand-touring",
      ["Grand Touring", GEN1],
      ["A1GB"],
      516,
      46303,
      26,
      "19-inch wheels; 469 mi on the 20- and 21-inch fitments"
    )
  );

  // ───────────────────────────── MY2024 ──────────────────────────────────
  // 102 live: 76 Tourings, 22 Pures (including one "Generation 1" and one
  // "Pure Electric Luxury") and four Grand Tourings.
  // This is the best-documented year — Lucid's Pure and Touring technical
  // specifications are still on lucidmotors.com — and the only one where a
  // pack figure is published for two of the three cars. There is no MY2024
  // Grand Touring sheet on lucidmotors.com at all, so that row abstains on
  // the pack rather than carrying
  // MY2025's 117 kWh backwards; the Pure's own pack moved 88 -> 84 between
  // those two years, which is exactly why a year cannot be assumed.
  R.push(
    {
      id: "lucid-air-2024-pure-rwd",
      make: "LUCID",
      model: "Air",
      modelYears: [2024, 2024],
      trim: ["Pure", GEN1],
      drive: "RWD",
      vds: ["A1PG"],
      battery: { packGrossKwh: f(88, "mfr", "high", "16-module pack", PURE_SPECS_2024) },
      range: {
        epaRangeMi: f(419, "mfr", "high", "19-inch wheels, standard; 394 mi on the 20-inch fitment", epa(47454)),
        epaKwhPer100Mi: f(25, "mfr", "high", "19-inch wheels", epa(47454)),
      },
      charging: charging(),
      warranty: warranty(WARRANTY_MY2024_SPLIT),
      abstains: {
        heatPump:
          LUCID_HEAT_PUMP_SILENCE,
      },
    },
    {
      id: "lucid-air-2024-touring",
      make: "LUCID",
      model: "Air",
      modelYears: [2024, 2024],
      trim: ["Touring", GEN1],
      drive: "AWD",
      vds: ["A1TE"],
      battery: { packGrossKwh: f(92, "mfr", "high", undefined, TOURING_SPECS_2024) },
      range: {
        epaRangeMi: f(411, "mfr", "high", "19-inch wheels; 382 mi on 20-inch, 365 mi on 21-inch", epa(47839)),
        epaKwhPer100Mi: f(25, "mfr", "high", "19-inch wheels", epa(47839)),
      },
      charging: charging({
        dcPeakKw: f(250, "mfr", "high", undefined, TOURING_SPECS_2024),
        architectureV: f(700, "mfr", "high", "Platform stated as 700V+", TOURING_SPECS_2024),
      }),
      warranty: warranty(WARRANTY_MY2024_SPLIT),
      abstains: {
        heatPump:
          LUCID_HEAT_PUMP_SILENCE,
      },
    },
    {
      id: "lucid-air-2024-grand-touring",
      make: "LUCID",
      model: "Air",
      modelYears: [2024, 2024],
      trim: ["Grand Touring", GEN1],
      drive: "AWD",
      vds: ["A1GB"],
      range: {
        epaRangeMi: f(516, "mfr", "high", "19-inch wheels; 485 mi on 20-inch, 450 mi on 21-inch", epa(47836)),
        epaKwhPer100Mi: f(26, "mfr", "high", "19-inch wheels", epa(47836)),
      },
      charging: charging(),
      warranty: warranty(WARRANTY_MY2024_SPLIT),
      abstains: {
        packUsableKwh:
          "lucidmotors.com publishes no US MY2024 Grand Touring sheet, and the Pure's pack moved 88 to 84 kWh between 2024 and 2025, so a neighbouring year is not a source",
        heatPump: LUCID_HEAT_PUMP_SILENCE,
      },
    }
  );

  // ───────────────────────────── MY2026 ──────────────────────────────────
  // 168 live and the largest single-year block in the file: 103 Tourings, 39
  // Pures, 26 Grand Tourings, every one of them with a clean trim string.
  //
  // The Touring is a genuinely different car from the 2025 one — Lucid's own
  // release credits "new higher density battery cells" for taking it from 406
  // to 431 EPA miles — which is both why it gets its own row and why no pack
  // figure is carried over. The Pure and Grand Touring are unchanged on
  // paper: EPA's 2026 entries repeat the 2025 numbers to the decimal.
  R.push(
    {
      id: "lucid-air-2026-pure-rwd",
      make: "LUCID",
      model: "Air",
      modelYears: [2026, 2026],
      trim: ["Pure", GEN1],
      drive: "RWD",
      vds: ["A1PG"],
      range: {
        epaRangeMi: f(420, "mfr", "high", "19-inch wheels; 372 mi on the 20-inch fitment", epa(49969)),
        epaKwhPer100Mi: f(23, "mfr", "high", "19-inch wheels", epa(49969)),
      },
      charging: charging(),
      warranty: warranty(WARRANTY_MY2026),
      abstains: {
        packUsableKwh:
          "lucidmotors.com publishes no MY2026 technical-spec sheet for any Air, and carrying MY2025's 84 kWh forward would be a guess rather than a figure",
        heatPump: LUCID_HEAT_PUMP_SILENCE,
      },
    },
    {
      id: "lucid-air-2026-touring",
      make: "LUCID",
      model: "Air",
      modelYears: [2026, 2026],
      trim: ["Touring", GEN1],
      drive: "AWD",
      vds: ["A1TE"],
      range: {
        epaRangeMi: f(431, "mfr", "high", "19-inch Aero Range wheels, standard; 396 mi on 20-inch", epa(49972)),
        epaKwhPer100Mi: f(25, "mfr", "high", "19-inch wheels", epa(49972)),
      },
      charging: charging({ dcPeakKw: f(250, "mfr", "high", undefined, RELEASE_2026) }),
      warranty: warranty(WARRANTY_MY2026),
      abstains: {
        packUsableKwh:
          "Lucid credits the 2026 Touring's range gain to new higher density cells and publishes no capacity for it, so MY2025's 92 kWh is the wrong car's figure",
        heatPump: LUCID_HEAT_PUMP_SILENCE,
      },
    },
    {
      id: "lucid-air-2026-grand-touring",
      make: "LUCID",
      model: "Air",
      modelYears: [2026, 2026],
      trim: ["Grand Touring", GEN1],
      drive: "AWD",
      vds: ["A1GB"],
      range: {
        epaRangeMi: f(512, "mfr", "high", "19-inch wheels; 480 mi on 20-inch, 446 mi on 21-inch", epa(49966)),
        epaKwhPer100Mi: f(26, "mfr", "high", "19-inch wheels", epa(49966)),
      },
      charging: charging(),
      warranty: warranty(WARRANTY_MY2026),
      abstains: {
        packUsableKwh:
          "lucidmotors.com publishes no MY2026 technical-spec sheet for any Air, and carrying MY2025's 117 kWh forward would be a guess rather than a figure",
        heatPump: LUCID_HEAT_PUMP_SILENCE,
      },
    }
  );
}

export const RESEARCH_ROWS_12: EnrichmentRow[] = R;
