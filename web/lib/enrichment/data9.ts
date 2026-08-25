import type { EnrichmentRow, Fact, Source } from "../types";

// Tenth research tranche (2026-08-25): the tail of the live-enrichment-gap
// list that no earlier pass reached — cars that are selling in volume right
// now and had no enrichment row at all.
//
// Sourcing, same two lanes as data6: every EPA figure comes from
// fueleconomy.gov's REST API (menu/model -> menu/options -> /vehicle/{id})
// and cites the Find.do page for the id it came from; every battery, charging,
// thermal and warranty fact comes from a manufacturer document fetched this
// pass and verified against its own words. Nothing was filled from a search
// snippet or from memory, and where a document does not state a thing the row
// abstains.
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

// ───────────────────── MERCEDES-BENZ CLA with EQ Technology ────────────────
// The electric CLA (MMA platform, built in Rastatt) — 760 live listings on
// 2026-08-25 and not one enrichment row, because it is brand new: MY2026 cars
// began arriving in Q1 2026 and MY2027 is already the bulk of the feed.
//
// TWO different cars share the "CLA" nameplate here, and the plus sign is what
// keeps them apart. Mercedes still sells a petrol CLA 250 (and, for 2027, a
// CLA 220); the electric one is the CLA 250+. match.ts refuses any model or
// trim comparison where a "+" appears on one side only — norm() strips the
// symbol, so "250" and "250+" would otherwise be equal — which means the
// electric row cannot reach a petrol car however loosely it is keyed. The
// 4MATIC car needs no such trick: there is no petrol CLA 350 in the US, on
// either MY2026 or MY2027 (checked against fueleconomy.gov's own model list
// for both years, which carries CLA250, CLA250 4matic, CLA 220, AMG CLA35 and
// AMG CLA45 S and no CLA350).
//
// The dealer feed almost never uses the full name: 763 of the 760-odd
// listings arrive as model "CLA" with the identity in the trim ("250+
// Electric", "350 4MATIC Electric"), and vPIC decodes every one of them to
// model "CLA-Class" with trim "CLA250+" or "CLA350 4MATIC" (decoded live
// 2026-08-25: W1KFJ1DB0VJ051014 and W1KFJ4EB0VJ056360). So each car gets a
// named row plus a bare-nameplate row guarded by the trim token, the shape
// tests/phev-bare-model-aliases.test.ts pins down for every other nameplate a
// petrol car shares.
//
// RANGE VARIES BY CONFIGURATION on the 250+, and the row says so rather than
// printing the good number alone. EPA rates two versions of the same RWD car
// — 374 mi / 126 MPGe and 317 mi / 109 MPGe — with the same 200 kW motor and
// the same 85 kWh pack, and Mercedes' own spec table publishes the 374 figure
// as "Up to 374 mi". Its quick-reference guide names 17-inch wheels as the
// CLA 250+ standard fitment with 18- and 19-inch optional, which is almost
// certainly what separates the two EPA entries — but "almost certainly" is
// not a source, so the note states both ratings and claims nothing about
// which wheel is which. The 4MATIC has a single EPA entry (312 mi) and needs
// no such hedge; Mercedes prints exactly that number.
//
// The port is the unusual fact here and is stated by Mercedes verbatim: the
// CLA has "a NACS DC charging inlet and J1772 AC charging inlet" — two
// physical connectors, DC on the NACS one — and it is the first Mercedes that
// needs no adapter at a Tesla Supercharger, while every other Mercedes EV
// (EQB/EQE/EQS/G580) is CCS1 plus a NACS adapter.
{
  const CLA_PRICING =
    "https://media.mbusa.com/releases/release-38c9543bcb6142f7d20a68c4cc02c2b3-mercedes-benz-usa-announces-pricing-for-all-new-electric-cla";
  const CLA_QRG =
    "https://media.mbusa.com/releases/release-f0ef3d598fde1190ee2a3f8b3e05c25a-2026-mercedes-benz-cla-all-electric-quick-reference-guide";
  // "The MMA models will be the first Mercedes-Benz vehicles to feature an
  // air-to-air heat pump as standard" — the CLA is the first MMA model.
  const MMA_EFFICIENCY =
    "https://media.mbusa.com/releases/release-13ade706e08532ed28da51676b0bba33-the-next-level-of-efficiency-becomes-reality";
  const MB_NACS = "https://www.mbusa.com/en/charge/nacs-charging";
  // The MY2026 EQ warranty booklet names this car by grade: "8 years/100,000
  // miles (whichever occurs first) for EQB, CLA250, CLA350 and G580", against
  // 10 yr/155,000 mi for EQE and EQS. Read as a rendered page, not only as
  // extracted text, because the booklet sets that list in two columns. The
  // MY2027 booklet repeats it word for word, which is what lets one row span
  // both years. Worth flagging for the EQE/EQS rows in data6, which abstain on
  // Mercedes battery warranty because "Mercedes' US warranty booklets are
  // PDF-walled" — they are not; this one fetched and parsed on the first try.
  const MB_EQ_WARRANTY =
    "https://www.mbusa.com/content/dam/mb-nafta/us/owners/manuals/2026/MY26%20EQ%20Warranty%20and%20Service%20Booklet_Web%20Eng_Sp.pdf";

  const CLA_BATTERY = {
    packUsableKwh: f(85, "mfr", "high", undefined, CLA_QRG),
    chemistry: f<"NMC">("NMC", "mfr", "high", undefined, CLA_QRG),
  };
  const CLA_CHARGING = {
    portStandard: f<"NACS">("NACS", "mfr", "high", "NACS inlet for DC; AC charging uses a separate J1772 inlet", MB_NACS),
    superchargerAccess: f<"native">("native", "mfr", "high", "No adapter needed at a Tesla Supercharger", MB_NACS),
    dcPeakKw: f(320, "mfr", "high", undefined, CLA_QRG),
    chargeTime1080Min: f(22, "mfr", "high", "10–80% at a 320 kW DC station", CLA_QRG),
    acOnboardKw: f(9.6, "mfr", "high", undefined, CLA_QRG),
    architectureV: f(800, "mfr", "high", undefined, CLA_PRICING),
    dcFastCharging: f<"standard">("standard", "mfr", "high", undefined, CLA_QRG),
  };
  const CLA_THERMAL = {
    heatPump: f<"standard">("standard", "mfr", "high", "Air-to-air multi-source heat pump", MMA_EFFICIENCY),
  };
  const CLA_WARRANTY = {
    batteryYears: f(8, "mfr", "high", undefined, MB_EQ_WARRANTY),
    batteryMiles: f(100_000, "mfr", "high", undefined, MB_EQ_WARRANTY),
    batteryTransfers: f(true, "mfr", "high", undefined, MB_EQ_WARRANTY),
  };
  const CLA_NOTES: EnrichmentRow["buyerNotes"] = [
    {
      headline: "Two charge ports: DC fast charging goes in the NACS inlet, AC and home charging in the J1772 one",
      severity: "info",
      learnMore: MB_NACS,
    },
  ];

  const cla = (
    id: string,
    model: string,
    modelAliases: string[],
    drive: "RWD" | "AWD",
    range: EnrichmentRow["range"]
  ): EnrichmentRow => ({
    id,
    make: "MERCEDES-BENZ",
    model,
    modelAliases,
    modelYears: [2026, 2027],
    drive,
    packVariant: "85 kWh",
    battery: CLA_BATTERY,
    range,
    charging: CLA_CHARGING,
    thermal: CLA_THERMAL,
    warranty: CLA_WARRANTY,
    buyerNotes: CLA_NOTES,
  });

  const cla250 = cla(
    "cla-250plus-2026-27",
    "CLA 250+",
    ["CLA250+", "CLA 250+ with EQ Technology", "CLA250 Plus with EQ Tech"],
    "RWD",
    {
      epaRangeMi: f(374, "mfr", "high", "Up to 374 mi; a second EPA-rated configuration is 317 mi", epa(50031)),
      epaKwhPer100Mi: f(27, "mfr", "high", "For the 374-mile configuration", epa(50031)),
    }
  );
  const cla350 = cla(
    "cla-350-4matic-2026-27",
    "CLA 350",
    ["CLA 350 4MATIC with EQ Technology", "CLA350 4matic with EQ Tech", "CLA 350 4MATIC"],
    "AWD",
    {
      epaRangeMi: f(312, "mfr", "high", undefined, epa(50032)),
      epaKwhPer100Mi: f(29, "mfr", "high", undefined, epa(50032)),
    }
  );
  R.push(
    cla250,
    cla350,
    // The bare nameplate, guarded. "250+" is safe on the plus rule alone: a
    // petrol CLA 250 carries no "+" anywhere in its trim, and match.ts rejects
    // a one-sided plus outright. "350" is safe because no petrol CLA 350
    // exists here — and it does not collide with the AMG CLA 35 either, whose
    // trim norms to "AMGCLA35"/"CLA354MATIC", neither of which contains "350".
    { ...cla250, id: "cla-250plus-2026-27-alt", model: "CLA", modelAliases: ["CLA-Class"], trim: ["250+"] },
    { ...cla350, id: "cla-350-4matic-2026-27-alt", model: "CLA", modelAliases: ["CLA-Class"], trim: ["350"] }
  );
}

// ─────────────────────────────── LEXUS RZ ─────────────────────────────────
// 577 live listings on 2026-08-25 across five distinct cars and eleven model
// spellings, and not one enrichment row — the whole nameplate was missing.
//
// The five cars are separated by VIN descriptor, verified against every live
// RZ in the database rather than assumed: JTJ|AAAAB is the 2023–25 450e AWD,
// ABABB the 2024–25 300e FWD, BDADB the 2026 350e FWD, BCACB the 2026 450e
// and 550e AWD. Those four patterns cover 100% of the live fleet, which is
// what makes a hard `vds` key safe here — and it is needed, because the feed
// does mis-file: seven listings arrive as model "RZ 450e" carrying trim
// "RZ 350e" on a BDADB VIN. Without the key those would take the 450e's 264
// miles; with it they take nothing, which is the honest answer for a listing
// whose model and trim contradict each other.
//
// RANGE VARIES BY WHEEL on most of the RZ line, and EPA labels the wheel in
// its own model names, so no inference is needed about which figure is which.
// Where a grade is sold on both fitments the row prints the 18-inch rating —
// the standard one, per the house rule — and names the 20-inch figure.
//
// Read the brochure footnote carefully before copying that pattern onto the
// 2023–25 450e, because it does not say what it looks like it says:
// "220-mile total driving range for 2025 Lexus RZ 450e Premium (18-inch
// wheels) … 196-mile range for RZ 450e Luxury OR RZ 450e Premium with 20-inch
// wheels". The wheel caveat governs the PREMIUM only. The Luxury is 196 flat,
// so it gets its own row with no wheel note, and the 550e F SPORT likewise is
// rated on 20s only.
//
// The 2026 facelift changes the charging picture completely and the rows are
// split on it: 2023–25 cars have a CCS1 inlet and reach Superchargers only
// through the complimentary NACS adapter Lexus began mailing owners about in
// November 2025, while 2026 cars have a native NACS (SAE J3400) inlet, need
// no adapter, ship with Plug & Charge, and take 11 kW AC instead of 7.
//
// Two abstentions. Heat pump: no Lexus document fetched this pass names one,
// and the 2026 release is detailed enough about thermal management (it
// describes an updated water-cooling system) that its silence is suggestive
// but not evidence. Battery warranty on the 2026 rows: the MY25 RZ brochure
// states the term for this car in its own words — "Electric vehicle drive
// components (transaxle, traction battery, inverter with converter) covered
// for 8 years or 100,000 miles" — and no MY26 equivalent is published, so the
// 2023–25 rows carry it and the 2026 rows say nothing rather than roll it
// forward.
{
  const RZ_2026_PR = "https://pressroom.lexus.com/2026-lexus-rz-adds-more-power-and-performance-2/";
  const RZ_CHARGING_PR =
    "https://pressroom.lexus.com/2026-lexus-rz-goes-on-sale-with-upgraded-convenience-features-expanded-charging-network-options-for-all-lexus-bev-owners/";
  const RZ_MY25_BROCHURE =
    "https://www.lexus.com/content/dam/lexus/documents/brochures/models/2025/MY25-Lexus-RZ-Brochure.pdf";

  const RZ_HP_ABSTAIN = "No Lexus document consulted this pass states heat-pump hardware for the RZ";
  const RZ_WARRANTY_2026_ABSTAIN =
    "Lexus publishes no MY2026 RZ warranty document and the MY2025 term cannot be rolled forward";

  const RZ_CHARGING_PRE26 = {
    portStandard: f<"CCS1">("CCS1", "mfr", "high", undefined, RZ_CHARGING_PR),
    superchargerAccess: f<"adapter">("adapter", "mfr", "high", "Complimentary NACS adapter from a Lexus dealer", RZ_CHARGING_PR),
    acOnboardKw: f(7, "mfr", "high", undefined, RZ_2026_PR),
    dcFastCharging: f<"standard">("standard", "mfr", "high", undefined, RZ_MY25_BROCHURE),
  };
  const RZ_CHARGING_2026 = {
    portStandard: f<"NACS">("NACS", "mfr", "high", "SAE J3400 inlet on the passenger side", RZ_2026_PR),
    superchargerAccess: f<"native">("native", "mfr", "high", "No adapter needed at a Tesla Supercharger", RZ_CHARGING_PR),
    acOnboardKw: f(11, "mfr", "high", undefined, RZ_2026_PR),
    chargeTime1080Min: f(30, "mfr", "medium", "10–80% under ideal DC fast-charging conditions", RZ_2026_PR),
    plugAndCharge: f(true, "mfr", "high", "Enrol once in the Lexus app", RZ_CHARGING_PR),
    dcFastCharging: f<"standard">("standard", "mfr", "high", undefined, RZ_2026_PR),
  };
  const RZ_WARRANTY_PRE26 = {
    batteryYears: f(8, "mfr", "high", undefined, RZ_MY25_BROCHURE),
    batteryMiles: f(100_000, "mfr", "high", undefined, RZ_MY25_BROCHURE),
  };

  const rz = (
    o: {
      id: string;
      model: string;
      modelAliases?: string[];
      trim?: string[];
      years: [number, number];
      drive: "AWD" | "FWD";
      vds: string[];
      packKwh: number;
      packUrl: string;
      range: EnrichmentRow["range"];
      pre26: boolean;
    }
  ): EnrichmentRow => ({
    id: o.id,
    make: "LEXUS",
    model: o.model,
    modelAliases: o.modelAliases,
    trim: o.trim,
    modelYears: o.years,
    drive: o.drive,
    vds: o.vds,
    packVariant: `${o.packKwh} kWh`,
    battery: { packGrossKwh: f(o.packKwh, "mfr", "high", undefined, o.packUrl) },
    range: o.range,
    charging: o.pre26 ? RZ_CHARGING_PRE26 : RZ_CHARGING_2026,
    warranty: o.pre26 ? RZ_WARRANTY_PRE26 : undefined,
    abstains: o.pre26
      ? { heatPump: RZ_HP_ABSTAIN }
      : { heatPump: RZ_HP_ABSTAIN, batteryWarranty: RZ_WARRANTY_2026_ABSTAIN },
  });

  // GRADE-KEYED, not one row for both, because the brochure footnote does not
  // read the way it first looks. "220-mile … for RZ 450e Premium (18-inch
  // wheels) … 196-mile range for RZ 450e Luxury OR RZ 450e Premium with
  // 20-inch wheels" puts the Luxury at 196 unconditionally — the 18-inch
  // caveat attaches only to the Premium. A single 220-mile row carrying both
  // grade spellings as aliases was the first shape here and it overstated
  // every Luxury by 24 miles, on 70 live listings.
  const rz450ePremium = rz({
    id: "rz-450e-2023-25-premium",
    model: "RZ 450e",
    modelAliases: ["RZ 450e Premium"],
    trim: ["Premium"],
    years: [2023, 2025],
    drive: "AWD",
    vds: ["AAAAB"],
    packKwh: 71.4,
    packUrl: RZ_MY25_BROCHURE,
    range: { epaRangeMi: f(220, "mfr", "high", "18-inch wheels; 196 mi on the 20-inch fitment", epa(49101)) },
    pre26: true,
  });
  const rz450eLuxury = rz({
    id: "rz-450e-2023-25-luxury",
    model: "RZ 450e",
    modelAliases: ["RZ 450e Luxury"],
    trim: ["Luxury"],
    years: [2023, 2025],
    drive: "AWD",
    vds: ["AAAAB"],
    packKwh: 71.4,
    packUrl: RZ_MY25_BROCHURE,
    // No wheel caveat: the Luxury is 196 on either fitment.
    range: { epaRangeMi: f(196, "mfr", "high", "20-inch wheels, the Luxury's only rating", epa(49102)) },
    pre26: true,
  });
  const rz300e = rz({
    id: "rz-300e-2024-25",
    model: "RZ 300e",
    modelAliases: ["RZ-Series"],
    years: [2024, 2025],
    drive: "FWD",
    vds: ["ABABB"],
    packKwh: 72.8,
    packUrl: RZ_MY25_BROCHURE,
    range: { epaRangeMi: f(266, "mfr", "high", "18-inch wheels; 224 mi on the 20-inch fitment", epa(49099)) },
    pre26: true,
  });
  const rz350e26 = rz({
    id: "rz-350e-2026",
    model: "RZ 350e",
    modelAliases: ["RZ 350e PREMIUM"],
    years: [2026, 2026],
    drive: "FWD",
    vds: ["BDADB"],
    packKwh: 74.69,
    packUrl: RZ_2026_PR,
    range: {
      epaRangeMi: f(301, "mfr", "high", "18-inch wheels; 284 mi on the 20-inch fitment", epa(50291)),
      epaKwhPer100Mi: f(27, "mfr", "high", "18-inch wheels", epa(50291)),
    },
    pre26: false,
  });
  const rz450e26 = rz({
    id: "rz-450e-2026",
    model: "RZ 450e",
    modelAliases: ["RZ 450e PREMIUM AWD", "RZ 450e Premium"],
    years: [2026, 2026],
    drive: "AWD",
    vds: ["BCACB"],
    packKwh: 74.69,
    packUrl: RZ_2026_PR,
    range: {
      epaRangeMi: f(264, "mfr", "high", "18-inch wheels; 20-inch fitments rate 257 or 228 mi", epa(50217)),
      epaKwhPer100Mi: f(31, "mfr", "high", "18-inch wheels", epa(50217)),
    },
    pre26: false,
  });
  const rz550e26 = rz({
    id: "rz-550e-2026",
    model: "RZ 550e",
    years: [2026, 2026],
    drive: "AWD",
    vds: ["BCACB"],
    packKwh: 76.96,
    packUrl: RZ_2026_PR,
    range: {
      epaRangeMi: f(229, "mfr", "high", "20-inch wheels, the F SPORT's only fitment", epa(50220)),
      epaKwhPer100Mi: f(35, "mfr", "high", undefined, epa(50220)),
    },
    pre26: false,
  });

  // 220 listings arrive under the bare "RZ" with the variant in the trim
  // ("450e PREMIUM AWD", "350e"). No petrol car has ever worn this nameplate,
  // so the guard is not there to keep one out — it is there to keep the five
  // electric variants apart, which the four-character badge does cleanly
  // (no two of 300e/350e/450e/550e contain each other). The `vds` key rides
  // along and settles the 2026 450e-versus-550e pair, which share a VIN
  // descriptor and differ only by badge.
  //
  // The 2023–25 450e is the exception and carries the grade in its badge key
  // ("450e Premium", "450e Luxury") for the reason the grade-keyed rows above
  // give: those two are 24 miles apart. A bare-RZ listing that says only
  // "450e" overlaps BOTH keys and resolves to candidates rather than to
  // whichever row is listed first, which is the honest answer — and it is
  // also what vPIC's own 2023 decode produces, see below.
  const bare = (row: EnrichmentRow, badge: string): EnrichmentRow => ({
    ...row,
    id: `${row.id}-alt`,
    model: "RZ",
    modelAliases: undefined,
    trim: [badge],
  });
  // Splitting the 450e by grade costs the ten 2023–25 listings whose whole
  // trim is "15 Series" — vPIC's generation code leaked into a dealer feed,
  // the same shape as the RAV4's "64 Series". They used to land on a
  // trim-less row and take its range; now they name no grade, and the two
  // grades are 24 miles apart, so no range can honestly be shown. This is the
  // feedLabelRow case the schema already has: carry what both grades share —
  // pack, charging, warranty — abstain on the range, and stay out of any
  // candidate span, because "15 Series" is not a version of the car.
  const rz450eLabel: EnrichmentRow = {
    ...rz450ePremium,
    id: "rz-450e-2023-25-series-label",
    modelAliases: ["RZ"],
    trim: ["15 Series"],
    feedLabelRow: true,
    range: undefined,
    abstains: {
      ...rz450ePremium.abstains,
      epaRangeMi: "The trim names vPIC's generation code, not a grade, and Premium and Luxury differ by 24 miles",
    },
  };
  R.push(
    rz450ePremium,
    rz450eLuxury,
    rz450eLabel,
    rz300e,
    rz350e26,
    rz450e26,
    rz550e26,
    bare(rz450ePremium, "450e Premium"),
    bare(rz450eLuxury, "450e Luxury"),
    bare(rz300e, "300e"),
    bare(rz350e26, "350e"),
    bare(rz450e26, "450e"),
    bare(rz550e26, "550e")
  );
}

// ────────────────────────────── JEEP RECON ────────────────────────────────
// 319 live listings on 2026-08-25, every one of them a MOAB, and no row. The
// Recon is BEV-only and no petrol car has ever worn the nameplate, so the
// model string needs no trim guard — vPIC decodes 3C4RJACK to make JEEP,
// model "Recon", trim "Moab", ElectrificationLevel BEV.
//
// The row abstains on the charge port, which is the interesting part. Jeep's
// own launch release and press kit describe the battery, the drive modules
// and the underbody shields in detail and never name the connector; the
// Stellantis Supercharger announcement puts the Recon in the 2026 access wave
// and then says in its own words that "additional details on network
// accessibility and adapter information … will be shared later". A 400-volt
// Stellantis BEV is almost certainly CCS1, and "almost certainly" is exactly
// what this field must not print. Heat pump abstains on the standing rule
// that Stellantis documents never use the term, so silence proves nothing.
{
  const RECON_PR = "https://media.stellantisnorthamerica.com/newsrelease.do?id=27220&mid=";
  const RECON_FAQ = "https://www.jeep.com/recon/faq.html";
  R.push({
    id: "recon-2026",
    make: "JEEP",
    model: "Recon",
    modelYears: [2026, 2026],
    drive: "AWD",
    packVariant: "100 kWh",
    battery: { packGrossKwh: f(100, "mfr", "high", undefined, RECON_PR) },
    range: {
      epaRangeMi: f(222, "mfr", "high", undefined, epa(50449)),
      epaKwhPer100Mi: f(48, "mfr", "high", undefined, epa(50449)),
    },
    charging: { architectureV: f(400, "mfr", "high", undefined, RECON_PR) },
    warranty: {
      batteryYears: f(8, "mfr", "high", undefined, RECON_FAQ),
      batteryMiles: f(100_000, "mfr", "high", undefined, RECON_FAQ),
    },
    abstains: {
      portStandard: "No Jeep or Stellantis document consulted this pass names the Recon's charge connector",
      heatPump: "Stellantis documents never use the term, so their silence is not evidence of absence",
    },
  });
}

// ───────────────────────────── DODGE HORNET R/T ───────────────────────────
// 273 live listings, all of them the R/T plug-in hybrid, filed under the
// nameplate the petrol Hornet GT shares. Guarded on the badge, and the guard
// has a wrinkle: norm("R/T") is "RT", two characters, and the matcher demands
// an exact match below three — so the bare "R/T" key catches only a listing
// whose whole trim is "R/T" (123 of them) and the longer spellings need their
// own keys. "R/T Plus" covers "R/T Plus EAWD" and "R/T Plus PHEV" by
// substring, and does not reach the petrol "GT Plus" in either direction.
//
// One row, not two: R/T and R/T Plus are the same powertrain — 1.3-litre
// turbo, 89 kW motor, 15.5 kWh pack — and EPA files one record for both.
//
// The battery warranty was an abstention here and it was wrong. I checked
// Dodge's FAQ page, found the model discontinued and the question no longer
// answered, and stopped — without checking the window sticker, which
// Stellantis hosts per VIN and which states the term outright. "No page states
// it" was a claim about where I had looked, not about what exists, which is
// the thing an abstention is never allowed to be.
{
  const HORNET_FACTS = "https://www.media.stellantisnorthamerica.com/newsrelease.do?id=25012&mid=5";
  // The battery term is on Dodge's own hosted window sticker, which is
  // VIN-keyed and may stop resolving once that car sells — so the sentence is
  // quoted here as well as linked. (A quoted span is also what keeps this out
  // of the inline note and in the tooltip, per noteRule.ts.) The row spans
  // 2024–25 and this is a MY2025 R/T Plus eAWD sticker; the Hornet R/T had one
  // powertrain across both years.
  const HORNET_STICKER =
    "https://www.dodge.com/hostd/windowsticker/getWindowStickerPdf.do?vin=ZACPDFCW6S3A44871";
  const HORNET_WARRANTY_QUOTE =
    "“8–year or 100,000–mile High Voltage Battery Warranty.” — window sticker, VIN ZACPDFCW6S3A44871";
  // "R" is not a typo. specTrim() cuts a trim at the first slash, so the
  // browse shard files all 273 of these as trim "R" while the per-listing
  // path sees "R/T" — one car, two spellings, and a row that matched only one
  // of them would have the grid and the card disagreeing. A one-character key
  // is exact-match-only under trimStringsOverlap, so it can reach nothing
  // else: the petrol Hornet GT cuts to "GT", never to "R".
  //
  // "R/T EAWD" was here and has been removed under the rule the Volvo T8 rows
  // in data6 were re-cut on: a guard token must not contain a drivetrain
  // substring. "RTEAWD" contains "AWD", and substring matching runs both
  // ways, so any decode whose whole trim is "AWD" reached this row. The
  // exposure was narrower than Volvo's — vPIC answers "GT" for a petrol
  // Hornet, and cleanTrim deletes a standalone "AWD" on the listing path — but
  // arguing the instance instead of removing the class is how the Volvo one
  // shipped. It costs the ~14 listings whose whole trim is "R/T EAWD" their
  // detail-page facts; they keep their browse card, because the shard cuts
  // them to "R" like every other Hornet. A `vds` key on ZACPDFCW/ZACPDFDW
  // would recover them for any car that has a VIN and is the right next step.
  const HORNET_TRIMS = ["R/T", "R", "R/T Plus", "R/T PHEV"];
  R.push({
    id: "hornet-rt-2024-25",
    make: "DODGE",
    model: "Hornet",
    modelYears: [2024, 2025],
    trim: HORNET_TRIMS,
    drive: "AWD",
    packVariant: "PHEV",
    battery: { packGrossKwh: f(15.5, "mfr", "high", undefined, HORNET_FACTS) },
    range: {
      epaRangeMi: f(33, "mfr", "high", "Electric-only EPA range", epa(47275)),
      epaRangeTotalMi: f(360, "mfr", "high", undefined, epa(47275)),
      mpgeElectric: f(77, "mfr", "high", undefined, epa(47275)),
      mpgeCombined: f(47, "mfr", "high", undefined, epa(47275)),
      mpgGasoline: f(29, "mfr", "high", undefined, epa(47275)),
    },
    charging: {
      acOnboardKw: f(7.4, "mfr", "high", "Full charge in about 2.5 hours on Level 2", HORNET_FACTS),
      // Same treatment data4 and data6 give every plug-in hybrid whose maker
      // never names the inlet: J1772 is the only AC connector a US PHEV
      // ships, but the value stays `est` because no document said it.
      portStandard: f<"J1772">("J1772", "est", "high", "AC charging only, no DC fast charge"),
      dcFastCharging: f<"none">("none", "est", "high", "AC charging only"),
    },
    warranty: {
      batteryYears: f(8, "mfr", "high", HORNET_WARRANTY_QUOTE, HORNET_STICKER),
      batteryMiles: f(100_000, "mfr", "high", HORNET_WARRANTY_QUOTE, HORNET_STICKER),
    },
    abstains: {
      heatPump: "Stellantis documents never use the term, so their silence is not evidence of absence",
    },
  });
}

// ── VOLVO XC40 — bare nameplate, ATTEMPTED AND HELD BACK ──────────────────
// 286 live listings file the electric XC40 as bare "XC40" with the badge in
// the trim ("Recharge Ultimate, Twin Motor, Electric"), the same shape as the
// XC90/XC60 T8 rows in data6, and the guard is already worked out and safe:
// ["Recharge", "Twin", "Single Motor", "Pure Elec", "P8"] resolves every live
// spelling and matches no petrol grade name (probed 2026-08-25).
//
// It is not here because deriving the rows from data4's would take
// enrichment-coverage from 250 core-field failures to 254. data4's four XC40
// Recharge rows carry only EPA range and charge port — no pack size, no heat
// pump, no battery warranty — so each derived row is a fifth, sixth, seventh
// and eighth half-stocked cohort, and the ratchet is right to say so.
//
// Filling those three fields is the real fix and it is blocked, not skipped:
// volvocars.com/us/media/press-releases/… now answers 403 to both curl and
// the fetch tool, and the control that makes that worth writing down is that
// data6 cites two pages on that exact host, so the block is new rather than a
// bad URL. The three facts needed are the 2021–23 twin, 2024 twin and 2024
// single pack sizes. Whoever unblocks that host should add them to data4's
// rows and then bring these derived rows back — do NOT paper over it with
// abstentions, which is what the ratchet exists to catch.

// ───────────────────────────── SUBARU UNCHARTED ───────────────────────────
// 177 live listings on 2026-08-25 for a car that only reached retailers this
// year. One pack (74.7 kWh) across all three trims, and the trims differ only
// in drivetrain and wheel: Premium FWD, Sport (AWD), GT (AWD on 20s). EPA
// rates all three separately and its own model names carry the wheel — 308,
// 287 and 273 miles — and Subaru's release orders them the same way ("more
// than 300", "more than 285", "more than 270"), which is the cross-check that
// says the mapping is right rather than assumed.
//
// The pack figure has a second, independent source worth noting: vPIC returns
// BatteryKWh 74.70 and "Onboard Charger: 11 kW" for both VIN patterns
// (JTMAAAAE 15 Series AWD, JTMABABE 10 Series FWD, decoded 2026-08-25), which
// agrees with Subaru's own press release to the decimal.
//
// Battery warranty is the Subaru BEV booklet's standing term — "The Battery
// and Electric Drive Units are covered for 8 years, or 100,000 miles,
// whichever comes first, with retention of 70% or more of the original"
// capacity — the same document data2's Solterra rows have used since 2023.
// Subaru publishes no 2026-specific booklet, so the confidence is medium
// rather than high; the term itself is stated for Subaru BEVs, not inferred.
// Heat pump abstains: the release describes battery preconditioning in detail
// and never mentions cabin heating hardware.
{
  const UNCH_PR = "https://media.subaru.com/pressrelease/2403/1/all-new-2026-subaru-uncharted-ev-arrives-more";
  const SUBARU_BEV_WARRANTY =
    "https://techinfo.subaru.com/stis/doc/warrantyBooklet/5125115-Subaru_MSA5M2301M-text.PDF";
  const UNCH_CHARGING = {
    portStandard: f<"NACS">("NACS", "mfr", "high", undefined, UNCH_PR),
    dcPeakKw: f(150, "mfr", "high", undefined, UNCH_PR),
    chargeTime1080Min: f(28, "mfr", "high", "10–80% at up to 150 kW", UNCH_PR),
    acOnboardKw: f(11, "mfr", "high", undefined, UNCH_PR),
    dcFastCharging: f<"standard">("standard", "mfr", "high", undefined, UNCH_PR),
  };
  const UNCH_WARRANTY = {
    batteryYears: f(8, "mfr", "medium", undefined, SUBARU_BEV_WARRANTY),
    batteryMiles: f(100_000, "mfr", "medium", undefined, SUBARU_BEV_WARRANTY),
    sohFloorPct: f(70, "mfr", "medium", undefined, SUBARU_BEV_WARRANTY),
  };
  const uncharted = (
    id: string,
    trim: string[],
    drive: "FWD" | "AWD",
    rangeMi: number,
    epaId: number,
    kwh100: number,
    rangeNote?: string
  ): EnrichmentRow => ({
    id,
    make: "SUBARU",
    model: "Uncharted",
    modelYears: [2026, 2026],
    trim,
    drive,
    packVariant: "74.7 kWh",
    battery: { packGrossKwh: f(74.7, "mfr", "high", undefined, UNCH_PR) },
    range: {
      epaRangeMi: f(rangeMi, "mfr", "high", rangeNote, epa(epaId)),
      epaKwhPer100Mi: f(kwh100, "mfr", "high", undefined, epa(epaId)),
    },
    charging: UNCH_CHARGING,
    thermal: { batteryPreconditioning: f(true, "mfr", "high", "Prepares the pack for fast charging in cold weather", UNCH_PR) },
    warranty: UNCH_WARRANTY,
    abstains: {
      heatPump: "Subaru's Uncharted release describes battery preconditioning and never mentions cabin heating hardware",
    },
  });
  R.push(
    uncharted("uncharted-2026-premium-fwd", ["Premium"], "FWD", 308, 50301, 26),
    uncharted("uncharted-2026-sport", ["Sport"], "AWD", 287, 50303, 29),
    uncharted("uncharted-2026-gt", ["GT"], "AWD", 273, 50302, 30, "20-inch wheels")
  );
}

// ───────────────────────────── ACURA ZDX (2024) ───────────────────────────
// 115 live listings, all MY2024, and three different cars behind them: the
// A-Spec rear-drive (313 mi), the A-Spec AWD (304) and the Type S (278). The
// feed's trim strings do not reliably separate the first two — "A-Spec" is
// written for both, and 21 listings say things like "1SA" or "w/A-Spec Pkg
// Factory Certified" — so the rows key on the VIN descriptor, which does:
// 4W5|KHMRK decodes RWD, KHNRL decodes AWD and XHPRL decodes Type-S, checked
// against vPIC on a live VIN of each. Three patterns, 115 listings, no
// remainder.
//
// The Type S row also carries its trim, which is what keeps it out of the way
// of an ordinary A-Spec: a listing that says "A-Spec" never reaches it, and a
// listing with no trim at all reaches only the two drivetrain rows.
//
// Two abstentions. Heat pump: the ZDX is a GM-built Ultium car wearing a
// Honda badge, and neither maker's documents use the term. Battery warranty:
// Acura's spec sheet has no warranty section and its consumer pages describe
// an "8- to 10-year" high-voltage battery warranty whose length depends on
// the state of registration, which is not a number this field can print.
{
  const ZDX_SPECS =
    "https://acuranews.com/en-US/releases/release-50763955e7ef98f595b7e8fb0e005c30-2024-acura-zdx-zdx-type-s-specifications-features";
  const ZDX_PRICING =
    "https://acuranews.com/en-US/releases/release-a463299e9046a088b84018a75814e97e-2024-acura-zdx-zdx-type-s-deliver-electrified-performance-starting-at-64500";
  const ZDX_CHARGING = {
    portStandard: f<"CCS1">("CCS1", "mfr", "high", "CCS1 port, NACS-compatible", ZDX_PRICING),
    superchargerAccess: f<"adapter">("adapter", "mfr", "high", "Tesla Superchargers through the CCS1 port", ZDX_PRICING),
    dcPeakKw: f(190, "mfr", "high", undefined, ZDX_PRICING),
    dcFastCharging: f<"standard">("standard", "mfr", "high", undefined, ZDX_SPECS),
  };
  const zdx = (
    id: string,
    vds: string[],
    drive: "RWD" | "AWD",
    rangeMi: number,
    epaId: number,
    kwh100: number,
    trim?: string[]
  ): EnrichmentRow => ({
    id,
    make: "ACURA",
    model: "ZDX",
    modelYears: [2024, 2024],
    trim,
    drive,
    vds,
    packVariant: "102 kWh",
    battery: { packGrossKwh: f(102, "mfr", "high", undefined, ZDX_SPECS) },
    range: {
      epaRangeMi: f(rangeMi, "mfr", "high", undefined, epa(epaId)),
      epaKwhPer100Mi: f(kwh100, "mfr", "high", undefined, epa(epaId)),
    },
    charging: ZDX_CHARGING,
    abstains: {
      heatPump: "Neither Acura nor GM, which builds this Ultium car, uses the term in any document consulted",
      batteryWarranty: "Acura states an 8-to-10-year battery term that varies by state of registration, not one figure",
    },
  });
  R.push(
    zdx("zdx-2024-rwd", ["KHMRK"], "RWD", 313, 47809, 37),
    zdx("zdx-2024-awd", ["KHNRL"], "AWD", 304, 47808, 39),
    zdx("zdx-2024-type-s", ["XHPRL"], "AWD", 278, 48781, 43, ["Type S", "Type-S"])
  );
}

// ────────────────────────────── POLESTAR 4 ────────────────────────────────
// 136 live listings and no row. Three versions, separated by the trim string
// the feed already writes in full ("Long Range Single Motor", "Long Range
// Dual Motor", and the Performance pack), so no VIN key is needed — and no
// model alias either: 105 of these are filed under the bare model "4", which
// match.ts already reaches because it strips a redundant make prefix from
// both sides before comparing ("Polestar 4" and "4" both key to "4").
//
// The trim keys look wrong until you know what the matcher is actually handed.
// cleanTrim() deletes the words "dual motor" from any non-Rivian trim — they
// are packaging on a Tesla, identity on a Rivian — so every one of these
// arrives as "Long Range", "Long Range Plus" or "Long Range Pilot Plus" with
// the thing that names the version already gone. Keying the rows on the feed's
// printed strings resolved NOTHING when it was probed; the keys below are the
// post-cleaning strings, and the drivetrain plus the VIN descriptor (YSR|PA3A4
// dual, PB3A4 single) do the work the trim can no longer do. The Plus and
// Pilot packages are options, not versions, and land on the plain Dual Motor
// row; "Long Range Performance" is spelled in full so the matcher's exact-name
// pass can prefer it over the plain row it contains.
//
// Polestar's US site states every fact here in its own words, including the
// heat pump ("Energy saving heat pump, using surplus heat from the powertrain
// and the air") — worth noting because Polestar is the one maker in the
// backfill table left blank for want of a drive-unit figure, so its
// documentation is not uniformly generous.
//
// The battery warranty first shipped as 8 years with no mileage cap, on the
// stated grounds that Polestar's US site gives the cap only in kilometres
// (160,000 km) and converting it would be our arithmetic printed as the
// maker's. The kilometre figure is real but it is on the specifications page,
// which carries Polestar's global warranty text; the range-and-charging page —
// already cited on this row for the charge port — states the US terms in
// miles: "within 8 years or 100,000 miles" and a replacement "If the
// battery's State-of-Health (SoH) drops below 70% of its original capacity".
// Both are filled now and cited to that page. The lesson is narrower than the
// mistake: I had that file open and read one warranty paragraph on the wrong
// page of the same site.
{
  const PS4_SPECS = "https://www.polestar.com/us/polestar-4/specifications/";
  const PS4_CHARGING_PAGE = "https://www.polestar.com/us/polestar-4/range-and-charging/";
  const PS4_CHARGING = {
    portStandard: f<"CCS1">("CCS1", "mfr", "high", "CCS1 port; NACS access needs an adapter", PS4_CHARGING_PAGE),
    superchargerAccess: f<"adapter">("adapter", "mfr", "high", "NACS adapters sold at Polestar Service Points", PS4_CHARGING_PAGE),
    dcPeakKw: f(200, "mfr", "high", undefined, PS4_SPECS),
    chargeTime1080Min: f(30, "mfr", "high", "10–80% on a 200 kW DC charger", PS4_SPECS),
    acOnboardKw: f(11, "mfr", "high", undefined, PS4_SPECS),
    architectureV: f(400, "mfr", "high", undefined, PS4_SPECS),
    dcFastCharging: f<"standard">("standard", "mfr", "high", undefined, PS4_SPECS),
  };
  const ps4 = (
    id: string,
    trim: string[],
    vds: string[],
    drive: "RWD" | "AWD",
    rangeMi: number,
    epaId: number,
    kwh100: number,
    rangeNote?: string
  ): EnrichmentRow => ({
    id,
    make: "POLESTAR",
    model: "Polestar 4",
    modelYears: [2026, 2026],
    trim,
    vds,
    drive,
    packVariant: "100 kWh",
    battery: { packGrossKwh: f(100, "mfr", "high", "Cell-to-pack, 110 cells", PS4_SPECS) },
    range: {
      epaRangeMi: f(rangeMi, "mfr", "high", rangeNote, epa(epaId)),
      epaKwhPer100Mi: f(kwh100, "mfr", "high", undefined, epa(epaId)),
    },
    charging: PS4_CHARGING,
    thermal: { heatPump: f<"standard">("standard", "mfr", "high", "Draws surplus heat from the powertrain and the air", PS4_SPECS) },
    warranty: {
      batteryYears: f(8, "mfr", "high", undefined, PS4_CHARGING_PAGE),
      batteryMiles: f(100_000, "mfr", "high", undefined, PS4_CHARGING_PAGE),
      sohFloorPct: f(70, "mfr", "high", undefined, PS4_CHARGING_PAGE),
    },
  });
  R.push(
    ps4("polestar-4-2026-single", ["Long Range"], ["PB3A4"], "RWD", 310, 50033, 35),
    ps4("polestar-4-2026-dual", ["Long Range"], ["PA3A4"], "AWD", 280, 50034, 40),
    ps4("polestar-4-2026-perf", ["Long Range Performance"], ["PA3A4"], "AWD", 255, 50035, 44, "22-inch Performance wheels")
  );
}

export const RESEARCH_ROWS_9: EnrichmentRow[] = R;
