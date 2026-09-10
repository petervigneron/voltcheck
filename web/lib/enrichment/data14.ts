import type { EnrichmentRow, Fact, Source } from "../types";

// Tesla Model S 2012-2018 + 2020, and Model X 2016 + 2019 + 2020 (2026-09-10).
//
// 593 of these cars were live with no enrichment row at all: Model S 2012 (6),
// 2013 (25), 2014 (23), 2015 (29), 2016 (63), 2017 (65), 2018 (102), 2020 (56),
// and Model X 2016 (59), 2019 (64), 2020 (101). data3.ts already owns
// tesla-model-s-2019, tesla-model-x-2017 and tesla-model-x-2018; data4.ts owns
// 2021+. Neither span is touched here.
//
// ── WHAT SEPARATES THESE CARS: VIN POSITION 8, AND NOTHING ELSE ────────────
// Every row below is keyed on VIN position 8 or on nothing. Position 8 is
// Tesla's own motor/battery code and it is the only field on one of these
// listings that a dealer cannot blur. Measured against the 6,773 Teslas in
// scraper/registry/vpic-cache.json and the 593 live cars, decoded through
// vPIC (Tesla's Part 565 filing), it reads:
//
//   MY2012-13   P = Performance 85 kWh   N = 85 kWh   G = 60 kWh   C = 40 kWh
//   MY2014-20   1 = single motor (RWD)   2 = dual motor   4 = dual Performance
//
// The 2012-13 half of that table is not an inference: vPIC returns a battery
// band per pattern and it tracks position 8 exactly, across 41 cached VINs —
// P and N both decode 81-90 kWh, G decodes 51-60, C decodes 31-40. Position 7
// (A/C/D in those years) does NOT track it: C appears against P, N and G
// alike, i.e. against both the 85 and the 60. The MY2014+ half is vPIC's own
// EVDriveUnit/OtherEngineInfo decode of the same position: "Single Motor",
// "Dual Motor", "Dual Motor - Performance".
//
// ── WHAT WAS REJECTED ──────────────────────────────────────────────────────
// 1. VIN position 7 as a pack code for MY2014-15 (H, S, E). Falsified by
//    control: EVERY MY2016 Model S is position 7 = "E" while that year spans
//    six packs (60, 70, 75, 85, 90, 100), and in MY2015 all three of E, H and
//    S appear against each of the three motor codes 1, 2 and 4. A field that
//    cannot separate cohorts that must differ cannot source a pack claim —
//    the same test that retired position 7 as a chemistry code in
//    lib/tesla-vin.ts.
// 2. VIN position 11 (plant). Model S and Model X were built at Fremont only;
//    all 593 live cars are plant code F. No split to lean on.
// 3. Trim-keyed grade rows on top of the abstaining base rows. This was the
//    obvious way to answer the 47 live 2018 Model S listings that say "75D"
//    and the 10 that say "100D", and it is deliberately not done. Every other
//    Tesla row in this corpus resolves on the VIN alone (data4.ts's 2021+ S/X
//    rows key on vin8 and carry packVariant, which the matcher never reads),
//    and docs/agents/trim-error-rate-2026-08-21.md is the reason: vPIC returns
//    a blank trim for 100% of Tesla VINs, dealer.com's per-vehicle description
//    substitutes the trim field back into itself so it can never disagree, and
//    resale price bands overlap too much to separate versions. A trim string
//    no available channel can check is exactly what commit 6a6e4f3 stopped
//    letting decide a range. A "75D" row would also make this file contradict
//    its own siblings, which print nothing for a 2018 Model X that says 75D.
// 4. The Ah x V product in the EPA certification reports. "Total Voltage of
//    Battery Packs 400 / Battery Energy Capacity 245" is filed identically on
//    the MY2013 85 kWh car and the MY2020 100 kWh car, and 350/250 on every
//    Model X from 2016 to 2020. It is a constant field, not a measurement —
//    the vPIC-Lightning-reads-98 shape. Pack figures below come only from
//    Tesla's own words in the certificate (the carline name, or the
//    "Manufacturer Test Vehicle Comments" line) and never from that product.
//
// ── SOURCES ────────────────────────────────────────────────────────────────
// Range: fueleconomy.gov's REST API, cited per row as the Find.do page for the
// vehicle id the figure came from.
// Pack: EPA Certification Summary Information Reports filed by Tesla
// (dis.epa.gov), where Tesla names the pack itself — either as the carline
// ("62 - Model S 75D") or in its own test-vehicle comment ("This is a Dual
// Motor Base configuration with 100kWh battery").
// Warranty: Tesla's own New Vehicle Limited Warranty PDFs, read from
// web.archive.org captures (tesla.com is behind Akamai). The terms turn on
// PURCHASE DATE, not model year, and Tesla says so in the document itself.
// Heat pump: Tesla's own owner's manuals, which enumerate the high-voltage
// components. Pre-refresh manuals list "Battery Coolant Heater" and "Cabin
// Heater"; the post-refresh manual replaces both with "Heat Pump Assembly".
// The full claim-by-claim table is in
// docs/agents/research-tesla-early-s-x-2026-09-10.md.

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
const cert = (docid: number) => `https://dis.epa.gov/otaqpub/display_file.jsp?docid=${docid}&flag=1`;

const MS = { make: "TESLA", model: "Model S" } as const;
const MX = { make: "TESLA", model: "Model X" } as const;

// ── Charging ───────────────────────────────────────────────────────────────
// Tesla's own connector on every US car of these years, and native
// Supercharging. Encoded exactly as the 2017-19 rows in data3.ts and the
// 2021+ rows in data4.ts encode it, so the fleet reads the same way.
const CHARGING = {
  portStandard: f<"NACS">("NACS", "mfr", "high", "Tesla's proprietary connector"),
  superchargerAccess: f<"native">("native", "mfr", "high"),
};

// ── Battery and Drive Unit warranty ────────────────────────────────────────
// Tesla's Model S/X New Vehicle Limited Warranty, US and Canada: "Your
// vehicle's Battery and Drive Unit are covered under this Battery and Drive
// Unit Limited Warranty for a period of 8 years, with the exception of the
// original 60 kWh battery (manufactured before 2015) that is covered for a
// period of 8 years or 125,000 miles/200,000 km, whichever comes first."
// No mileage cap and no capacity floor: the same document says "Loss of
// Battery energy or power over time or due to or resulting from Battery
// usage, is NOT covered". sohFloorPct is therefore absent from every row in
// this file, and batteryMiles is absent wherever the real term is "unlimited"
// — Fact<number> cannot say unlimited, and any number here would be a cap
// Tesla did not impose.
const W_PRE2020_URL =
  "https://web.archive.org/web/20180410085207/https://www.tesla.com/sites/default/files/downloads/Model_S_X_Warranty_NA_en.pdf";
// The successor document, effective 29 January 2020, which is where the
// 150,000-mile cap and the 70% floor arrive — and which states its own reach:
// "Any Model S or Model X purchased prior to the effective date specified on
// the cover page of this New Vehicle Limited Warranty is subject to the
// applicable Battery and Drive Unit Warranty effective as of the date of
// purchase."
const W_2020_URL =
  "https://web.archive.org/web/20200201164901/https://www.tesla.com/sites/default/files/downloads/tesla-new-vehicle-limited-warranty-en-us.pdf";
const W_TRANSFER =
  "“This New Vehicle Limited Warranty is transferable at no cost to any person(s) who subsequently and lawfully assume(s) ownership of the vehicle after the first retail purchaser”";

// `powertrainTerms` is set explicitly on every row here, and that is
// deliberate rather than decorative: lib/enrichment/backfill.ts fills the
// field at match time for any row that lacks it, and its Tesla branch writes
// "Electric drive: 8 yr / 150,000 mi" for every Model S and Model X on the
// books. That is the post-January-2020 term, and stating it on a 2013 car
// would be a cap Tesla never imposed on it. Setting the field stops the
// backfill (it only fills gaps).
const WARRANTY_UNLIMITED = {
  batteryYears: f(
    8,
    "mfr",
    "high",
    "“covered … for a period of 8 years”, with no mileage cap for Model S/X and no capacity-retention floor; the 150,000-mile/70% terms begin with the warranty effective 29 January 2020 and Tesla's own text limits them to vehicles purchased on or after that date",
    W_PRE2020_URL
  ),
  batteryTransfers: f(true, "mfr", "high", W_TRANSFER, W_PRE2020_URL),
  powertrainTerms: f(
    "Electric drive: 8 yr, no mileage cap",
    "mfr",
    "high",
    "Drive unit covered with the battery, under the same clause",
    W_PRE2020_URL
  ),
};

// Rows that may hold an original 60 kWh car, where Tesla's own exception caps
// the term at 125,000 miles but nothing on the listing says whether this is
// one of those cars. Eight years is what both branches share.
const WARRANTY_YEARS_ONLY = {
  batteryYears: f(
    8,
    "mfr",
    "high",
    "Eight years either way; the mileage term is not published here because Tesla caps “the original 60 kWh battery (manufactured before 2015)” at 125,000 miles and leaves every other Model S/X of these years uncapped, and this row cannot tell which car it has",
    W_PRE2020_URL
  ),
  batteryTransfers: f(true, "mfr", "high", W_TRANSFER, W_PRE2020_URL),
  powertrainTerms: f("Electric drive: 8 yr", "mfr", "high", "Drive unit covered with the battery", W_PRE2020_URL),
};

// The one row with a real cap, and Tesla names the car it applies to exactly.
const WARRANTY_60KWH = {
  batteryYears: f(
    8,
    "mfr",
    "high",
    "“the original 60 kWh battery (manufactured before 2015) … is covered for a period of 8 years or 125,000 miles/200,000 km, whichever comes first”",
    W_PRE2020_URL
  ),
  batteryMiles: f(125_000, "mfr", "high", undefined, W_PRE2020_URL),
  batteryTransfers: f(true, "mfr", "high", W_TRANSFER, W_PRE2020_URL),
  powertrainTerms: f("Electric drive: 8 yr / 125,000 mi", "mfr", "high", "Drive unit covered with the battery", W_PRE2020_URL),
};

// MY2020 cars were delivered on both sides of 29 January 2020, so the mileage
// cap is a per-car fact a listing cannot settle: unlimited before that date,
// 150,000 miles with a 70% floor on or after it. Both documents say 8 years,
// so that is what these rows publish and nothing else.
const WARRANTY_2020 = {
  batteryYears: f(
    8,
    "mfr",
    "high",
    "Eight years under both the warranty in force through 28 January 2020 (8 years, no mileage cap) and the one effective 29 January 2020 (“8 years or 150,000 miles (240,000 km), whichever comes first, with minimum 70% retention”); which one applies is set by the car's purchase date, which a listing does not carry",
    W_2020_URL
  ),
  batteryTransfers: f(true, "mfr", "high", W_TRANSFER, W_2020_URL),
  powertrainTerms: f("Electric drive: 8 yr", "mfr", "high", "Drive unit covered with the battery", W_2020_URL),
};

// ── Heat pump ──────────────────────────────────────────────────────────────
// Tesla's own owner's manuals, "Electric Vehicle Components / High Voltage
// Components". Pre-refresh Model S (software 2018.12 and 2020.44) lists
// "3. Battery Coolant Heater … 8. Cabin Heater" and no heat pump; the
// post-refresh manual (software 2021.12.4.2) opens the same list with
// "1. Heat Pump Assembly" and both resistive heaters are gone. That pair is
// the control test — the claim is not read off an absence alone.
const MS_MANUAL_2020 =
  "https://web.archive.org/web/20201120094844/https://www.tesla.com/sites/default/files/model_s_owners_manual_north_america_en_us.pdf";
const MX_MANUAL_2020 =
  "https://web.archive.org/web/20201031235103/https://www.tesla.com/sites/default/files/model_x_owners_manual_north_america_en.pdf";
const HEAT_PUMP_MS = f<"none">(
  "none",
  "mfr",
  "high",
  "Model S Owner's Manual, software 2020.44, High Voltage Components: “3. Battery Coolant Heater … 8. Cabin Heater”, no heat pump; the same list in the software 2021.12.4.2 manual, after the January 2021 refresh, reads “1. Heat Pump Assembly”. The software 2018.12 manual lists the resistive heaters identically",
  MS_MANUAL_2020
);
const HEAT_PUMP_MX = f<"none">(
  "none",
  "mfr",
  "high",
  "Model X Owner's Manual, software 2020.20, High Voltage Components: “5. Battery Coolant Heater … 7. Cabin Heater”, no heat pump; the version 8.0 manual covering the 2016-17 cars lists the same two",
  MX_MANUAL_2020
);

// The sentence every abstaining row here shares, spelled out per row because
// the field and the spread differ.
const NOTHING_SEPARATES =
  "nothing on one of these listings separates them: vPIC returns a blank trim for every Tesla VIN, position 8 only tells the motor, and Model S and Model X were built at Fremont only, so there is no plant split either";

const R: EnrichmentRow[] = [
  // ── Model S 2012 ─────────────────────────────────────────────────────────
  // Every live 2012 car is position 8 = P or N, which Tesla's Part 565 filing
  // decodes as an 81-90 kWh battery — the 85 kWh car, the only pack Tesla
  // delivered in MY2012. EPA rated exactly one MY2012 Model S configuration.
  {
    id: "ms-2012-85",
    ...MS,
    modelYears: [2012, 2012],
    vin8: ["N", "P"],
    drive: "RWD",
    packVariant: "85 kWh",
    battery: {
      packGrossKwh: f(
        85,
        "vin",
        "medium",
        "Tesla's Part 565 pattern files VIN position 8 = N and P as an 81-90 kWh battery (vPIC decode of all 9 cached MY2012 VINs); 85 kWh was Tesla's only MY2012 pack, and EPA's MY2012 rating (265/262.69/266.78) is the same triple as its MY2013 “Model S (85 kW-hr battery pack)” entry",
        epa(32557)
      ),
    },
    range: {
      epaRangeMi: f(265, "mfr", "high", "The only MY2012 Model S configuration EPA rated", epa(32557)),
    },
    charging: CHARGING,
    thermal: { heatPump: HEAT_PUMP_MS },
    warranty: WARRANTY_UNLIMITED,
  },

  // ── Model S 2013 — three packs, and position 8 names each one ────────────
  {
    id: "ms-2013-85",
    ...MS,
    modelYears: [2013, 2013],
    vin8: ["N", "P"],
    drive: "RWD",
    packVariant: "85 kWh",
    battery: {
      packGrossKwh: f(
        85,
        "mfr",
        "high",
        "EPA's MY2013 carline is named “Model S (85 kW-hr battery pack)”; Tesla's Part 565 pattern files position 8 = N and P as 81-90 kWh, across 32 cached MY2013 VINs",
        epa(33368)
      ),
    },
    range: { epaRangeMi: f(265, "mfr", "high", undefined, epa(33368)) },
    charging: CHARGING,
    thermal: { heatPump: HEAT_PUMP_MS },
    warranty: WARRANTY_UNLIMITED,
  },
  {
    id: "ms-2013-60",
    ...MS,
    modelYears: [2013, 2013],
    vin8: ["G"],
    drive: "RWD",
    packVariant: "60 kWh",
    battery: {
      packGrossKwh: f(
        60,
        "mfr",
        "high",
        "EPA's MY2013 carline is named “Model S (60 kW-hr battery pack)”; position 8 = G decodes 51-60 kWh on all 5 cached VINs",
        epa(33367)
      ),
    },
    range: { epaRangeMi: f(208, "mfr", "high", undefined, epa(33367)) },
    charging: CHARGING,
    thermal: { heatPump: HEAT_PUMP_MS },
    // The one row in this file with a real mileage cap, and Tesla names the
    // car it applies to exactly: "the original 60 kWh battery (manufactured
    // before 2015)".
    warranty: WARRANTY_60KWH,
  },
  {
    id: "ms-2013-40",
    ...MS,
    modelYears: [2013, 2013],
    vin8: ["C"],
    drive: "RWD",
    packVariant: "40 kWh",
    battery: {
      packGrossKwh: f(
        40,
        "mfr",
        "high",
        "EPA's MY2013 carline is named “Model S (40 kW-hr battery pack)”; position 8 = C decodes 31-40 kWh, and unlike every other MY2012-13 pattern it decodes without vPIC's “w/DC Fast Charge” trim",
        epa(33612)
      ),
    },
    range: { epaRangeMi: f(139, "mfr", "high", undefined, epa(33612)) },
    charging: {
      // Deliberately no superchargerAccess: the 40 kWh car is the one Model S
      // of these years whose Supercharging was not enabled from the factory,
      // and Tesla's own material of the period was not reachable to say so
      // either way. Silence rather than a native/none guess.
      portStandard: CHARGING.portStandard,
    },
    thermal: { heatPump: HEAT_PUMP_MS },
    // Tesla's mileage exception names "the original 60 kWh battery
    // (manufactured before 2015)" and says nothing about the 40 kWh car, so
    // only the eight years is published. (EPA's carline is the pack figure
    // above; whether that pack is physically a 60 is not something any
    // document read here states, and the row does not say it.)
    warranty: WARRANTY_YEARS_ONLY,
  },

  // ── Model S 2014 ────────────────────────────────────────────────────────
  {
    id: "ms-2014-rwd",
    ...MS,
    modelYears: [2014, 2014],
    vin8: ["1"],
    drive: "RWD",
    packVariant: "single motor",
    abstains: {
      packUsableKwh: `Tesla sold the MY2014 rear-drive Model S with a 60 kWh and an 85 kWh pack and ${NOTHING_SEPARATES}`,
      epaRangeMi:
        "The MY2014 rear-drive Model S is rated 208 miles with the 60 kWh pack and 265 with the 85, and no field on one of these listings says which pack a given car has",
    },
    charging: CHARGING,
    thermal: { heatPump: HEAT_PUMP_MS },
    // 60 kWh cars built before 2015 cap at 125,000 miles, 85 kWh cars do not
    // cap at all, and this row cannot tell them apart — so the eight years,
    // which both share, is all it says.
    warranty: WARRANTY_YEARS_ONLY,
  },
  {
    id: "ms-2014-awd",
    ...MS,
    modelYears: [2014, 2014],
    vin8: ["2"],
    drive: "AWD",
    packVariant: "P85D",
    battery: {
      packGrossKwh: f(
        85,
        "mfr",
        "high",
        "The only MY2014 all-wheel-drive Model S EPA rated, filed as “Model S AWD (85 kW-hr battery pack)”",
        epa(35994)
      ),
    },
    range: {
      epaRangeMi: f(
        242,
        "mfr",
        "high",
        "The only MY2014 AWD Model S certification there is; its motor pair “180 and 350 kW” is the P85D's. The 85D's 270-mile rating is a MY2015 certification and cannot apply to a MY2014 car. vPIC decodes this pattern as a plain “Dual Motor” without the Performance qualifier it adds from MY2015 on, which is consistent with MY2014 having had only one dual-motor car to code for",
        epa(35994)
      ),
    },
    charging: CHARGING,
    thermal: { heatPump: HEAT_PUMP_MS },
    warranty: WARRANTY_UNLIMITED,
  },

  // ── Model S 2015 ────────────────────────────────────────────────────────
  {
    id: "ms-2015-rwd",
    ...MS,
    modelYears: [2015, 2015],
    vin8: ["1"],
    drive: "RWD",
    packVariant: "single motor",
    abstains: {
      packUsableKwh: `EPA rated MY2015 rear-drive Model S cars with 60, 85 and 90 kWh packs and ${NOTHING_SEPARATES}`,
      epaRangeMi:
        "The MY2015 rear-drive Model S is rated 208 miles with the 60 kWh pack and 265 with the 85 and the 90, and nothing on one of these listings says which",
    },
    charging: CHARGING,
    thermal: { heatPump: HEAT_PUMP_MS },
    // MY2015 production began in late 2014, so a 60 kWh car on this row could
    // fall inside Tesla's "manufactured before 2015" mileage exception.
    warranty: WARRANTY_YEARS_ONLY,
  },
  {
    id: "ms-2015-dual",
    ...MS,
    modelYears: [2015, 2015],
    vin8: ["2"],
    drive: "AWD",
    packVariant: "dual motor",
    abstains: {
      packUsableKwh: `The MY2015 70D, 85D and 90D carry 70, 85 and 90 kWh packs and ${NOTHING_SEPARATES}`,
      epaRangeMi:
        "The MY2015 70D is rated 240 miles and the 85D and 90D 270, a 30-mile spread nothing on one of these listings resolves",
    },
    charging: CHARGING,
    thermal: { heatPump: HEAT_PUMP_MS },
    warranty: WARRANTY_UNLIMITED,
  },
  {
    id: "ms-2015-dual-perf",
    ...MS,
    modelYears: [2015, 2015],
    vin8: ["4"],
    drive: "AWD",
    packVariant: "Dual Motor Performance",
    // The one bucket in this file where the two candidates disagree on the
    // pack and agree exactly on the rating, so the range is publishable and
    // the pack is not.
    abstains: {
      packUsableKwh:
        "The two MY2015 Performance cars this VIN code covers, the P85D and the P90D, carry 85 and 90 kWh packs respectively and no field on one of these listings separates them",
    },
    range: {
      epaRangeMi: f(
        253,
        "mfr",
        "high",
        "Both MY2015 dual-motor Performance carlines are rated 253 miles — P85D (id 36008) and P90D (id 36787) — so this figure holds whichever of the two a given car is",
        epa(36008)
      ),
    },
    charging: CHARGING,
    thermal: { heatPump: HEAT_PUMP_MS },
    warranty: WARRANTY_UNLIMITED,
  },

  // ── Model S 2016 and 2017 — six packs and four, and no way in ───────────
  // Both years are one row rather than three, because splitting on position 8
  // would produce three rows that abstain on the same two fields for the same
  // reason. Every motor code in both years still spans several packs.
  {
    id: "ms-2016",
    ...MS,
    modelYears: [2016, 2016],
    abstains: {
      packUsableKwh: `EPA rated thirteen MY2016 Model S configurations spanning 60, 70, 75, 85, 90 and 100 kWh packs, and ${NOTHING_SEPARATES}`,
      epaRangeMi:
        "MY2016 Model S ratings run from 210 miles (60 kWh, rear drive) to 315 (P100D), and each of the three motor codes still covers three or more of them",
    },
    charging: CHARGING,
    thermal: { heatPump: HEAT_PUMP_MS },
    warranty: WARRANTY_UNLIMITED,
  },
  {
    id: "ms-2017",
    ...MS,
    modelYears: [2017, 2017],
    abstains: {
      packUsableKwh: `EPA rated eight MY2017 Model S configurations spanning 60, 75, 90 and 100 kWh packs, and ${NOTHING_SEPARATES}`,
      epaRangeMi:
        "MY2017 Model S ratings run from 210 miles (60, rear drive) to 335 (100D); the dual-motor code alone covers 218, 259, 294 and 335",
    },
    charging: CHARGING,
    thermal: { heatPump: HEAT_PUMP_MS },
    warranty: WARRANTY_UNLIMITED,
  },

  // ── Model S 2018 — the year the lineup got small enough to answer ───────
  // Tesla's MY2018 certificates say it themselves: "MY2018 Initial
  // certification of Model S RWD carline - 75kwh. Dropping 60kw option" and
  // "MY2018 certification for Model S AWD carline. Removing 60 and 90kwh
  // battery options". That leaves one rear-drive car, one Performance car,
  // and a dual-motor code that still covers two.
  {
    id: "ms-2018-rwd",
    ...MS,
    modelYears: [2018, 2018],
    vin8: ["1"],
    drive: "RWD",
    packVariant: "75 kWh",
    battery: {
      packGrossKwh: f(
        75,
        "mfr",
        "high",
        "The single rear-drive carline on Tesla's MY2018 certificate is “22 - Model S 75kWh”, and the test group's own comment reads “MY2018 Initial certification of Model S RWD carline - 75kwh. Dropping 60kw option.”",
        cert(42149)
      ),
    },
    range: { epaRangeMi: f(249, "mfr", "high", "EPA's “Model S 75kWh”, the only MY2018 rear-drive Model S", epa(39837)) },
    charging: CHARGING,
    thermal: { heatPump: HEAT_PUMP_MS },
    warranty: WARRANTY_UNLIMITED,
  },
  {
    id: "ms-2018-dual",
    ...MS,
    modelYears: [2018, 2018],
    vin8: ["2"],
    drive: "AWD",
    packVariant: "dual motor",
    abstains: {
      packUsableKwh:
        "Tesla's MY2018 certificate lists the 75D and the 100D under this one motor code, at 75 and 100 kWh, and no field on one of these listings separates them",
      epaRangeMi:
        "The MY2018 75D is rated 259 miles and the 100D 335, a 76-mile spread that only the window sticker or the door-jamb label resolves",
    },
    charging: CHARGING,
    thermal: { heatPump: HEAT_PUMP_MS },
    warranty: WARRANTY_UNLIMITED,
  },
  {
    id: "ms-2018-perf",
    ...MS,
    modelYears: [2018, 2018],
    vin8: ["4"],
    drive: "AWD",
    packVariant: "P100D",
    battery: {
      packGrossKwh: f(
        100,
        "mfr",
        "high",
        "“65 - Model S P100D” is the only Performance carline on Tesla's MY2018 Model S AWD certificate, whose test-group comment is “MY2018 certification for Model S AWD carline. Removing 60 and 90kwh battery options.”",
        cert(42152)
      ),
    },
    range: { epaRangeMi: f(315, "mfr", "high", "EPA's “Model S P100D”, the only MY2018 Performance Model S", epa(39840)) },
    charging: CHARGING,
    thermal: { heatPump: HEAT_PUMP_MS },
    warranty: WARRANTY_UNLIMITED,
  },

  // ── Model S 2020 — one pack, three names, two ratings ───────────────────
  {
    id: "ms-2020-dual",
    ...MS,
    modelYears: [2020, 2020],
    vin8: ["2"],
    drive: "AWD",
    packVariant: "Dual Motor",
    battery: {
      packGrossKwh: f(
        100,
        "mfr",
        "medium",
        "Tesla's MY2020 Model S certificate describes both non-Performance test vehicles — “Model S Standard Range” and “Model S Long Range” — as “a Dual Motor Base configuration with 100kWh battery”. The Long Range Plus arrived as a later running change and is not itself a carline on this certificate, hence medium: the figure rests on the pack being unchanged across a mid-year efficiency revision rather than on a document naming the Plus",
        cert(49221)
      ),
    },
    abstains: {
      epaRangeMi:
        "The three non-Performance MY2020 Model S versions are rated 287 miles (Standard Range), 373 (Long Range) and 402 (Long Range Plus), and the VIN code they share says only that the car is a dual motor",
    },
    charging: CHARGING,
    thermal: { heatPump: HEAT_PUMP_MS },
    warranty: WARRANTY_2020,
  },
  {
    id: "ms-2020-perf",
    ...MS,
    modelYears: [2020, 2020],
    vin8: ["4"],
    drive: "AWD",
    packVariant: "Performance",
    battery: {
      packGrossKwh: f(
        100,
        "mfr",
        "high",
        "Tesla's MY2020 Model S certificate describes both Performance test vehicles, the 19-inch and the 21-inch, as “a Dual Motor Performance … configuration with 100kWh battery”",
        cert(49221)
      ),
    },
    range: {
      epaRangeMi: f(
        348,
        "mfr",
        "high",
        "The 19-inch wheel, which is the standard configuration: Tesla's own Model S page in August 2020 advertised the Performance at “348 mile range”. The 21-inch carline is rated 326 (id 42284)",
        epa(42283)
      ),
    },
    charging: CHARGING,
    thermal: { heatPump: HEAT_PUMP_MS },
    warranty: WARRANTY_2020,
  },

  // ── Model X 2016 ────────────────────────────────────────────────────────
  {
    id: "mx-2016",
    ...MX,
    modelYears: [2016, 2016],
    drive: "AWD",
    abstains: {
      packUsableKwh: `EPA rated MY2016 Model X configurations on 60, 75, 90 and 100 kWh packs, and ${NOTHING_SEPARATES}`,
      epaRangeMi:
        "MY2016 Model X ratings run from 200 miles (60D) to 289 (P100D); the non-Performance motor code alone covers 200, 238 and 257",
    },
    charging: CHARGING,
    thermal: { heatPump: HEAT_PUMP_MX },
    warranty: WARRANTY_UNLIMITED,
  },

  // ── Model X 2019 ────────────────────────────────────────────────────────
  // One row, not two. The Performance code looked answerable — both cars it
  // covers are 100 kWh — but the certificate that names a MY2019 Model X pack
  // covers only the 75D, 100D and P100D, and the mid-year Raven "Performance"
  // that shares the code is not on it. Rather than publish a pack for a
  // version no Tesla document in hand names, the year abstains as a whole.
  {
    id: "mx-2019",
    ...MX,
    modelYears: [2019, 2019],
    drive: "AWD",
    abstains: {
      packUsableKwh: `The MY2019 Model X was sold as the 75D and as 100 kWh cars, Tesla's certificate for the year names three carlines only, and ${NOTHING_SEPARATES}`,
      epaRangeMi:
        "MY2019 Model X ratings run from 238 miles (75D) to 325 (Long Range), with the Performance at 270 and the P100D at 289, and the motor code separates none of those pairs",
    },
    charging: CHARGING,
    thermal: { heatPump: HEAT_PUMP_MX },
    warranty: WARRANTY_UNLIMITED,
  },

  // ── Model X 2020 ────────────────────────────────────────────────────────
  // Unlike the MY2020 Model S certificate, the MY2020 Model X one states no
  // pack energy anywhere — its test-vehicle comments give horsepower and axle
  // ratios only, and its battery block is the constant 350 V / 250 Ah that
  // Tesla filed for every Model X from 2016 on. So the pack abstains here
  // even though the sister car's is published.
  {
    id: "mx-2020-dual",
    ...MX,
    modelYears: [2020, 2020],
    vin8: ["2"],
    drive: "AWD",
    packVariant: "Dual Motor",
    abstains: {
      packUsableKwh:
        "Tesla's MY2020 Model X certification states no pack energy for any of its four carlines, and no other Tesla document reachable this pass names one",
      epaRangeMi:
        "The three non-Performance MY2020 Model X versions are rated 258 miles (Standard Range), 328 (Long Range) and 351 (Long Range Plus), and the VIN code they share says only that the car is a dual motor",
    },
    charging: CHARGING,
    thermal: { heatPump: HEAT_PUMP_MX },
    warranty: WARRANTY_2020,
  },
  {
    id: "mx-2020-perf",
    ...MX,
    modelYears: [2020, 2020],
    vin8: ["4"],
    drive: "AWD",
    packVariant: "Performance",
    abstains: {
      packUsableKwh:
        "Tesla's MY2020 Model X certification states no pack energy for any of its four carlines, and no other Tesla document reachable this pass names one",
    },
    range: {
      epaRangeMi: f(
        305,
        "mfr",
        "high",
        "The 20-inch wheel, which is the standard configuration: Tesla's own Model X page in August 2020 advertised the Performance at “305 mile range”. The 22-inch carline is rated 272 (id 42288)",
        epa(42287)
      ),
    },
    charging: CHARGING,
    thermal: { heatPump: HEAT_PUMP_MX },
    warranty: WARRANTY_2020,
  },
];

export const RESEARCH_ROWS_14: EnrichmentRow[] = R;
