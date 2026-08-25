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
// RANGE VARIES BY WHEEL on every RZ, and EPA labels the wheel itself, so no
// inference is needed: each row prints the 18-inch rating and names the
// 20-inch one. Lexus's own MY25 brochure footnote confirms which grade gets
// which — "220-mile total driving range for 2025 Lexus RZ 450e Premium
// (18-inch wheels) … 196-mile range for RZ 450e Luxury or RZ 450e Premium
// with 20-inch wheels" — so 18 inches is the standard fitment the house rule
// asks for. The 550e F SPORT is the exception and is rated on 20s only.
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

  const rz450e = rz({
    id: "rz-450e-2023-25",
    model: "RZ 450e",
    modelAliases: ["RZ 450e Premium", "RZ 450e Luxury"],
    years: [2023, 2025],
    drive: "AWD",
    vds: ["AAAAB"],
    packKwh: 71.4,
    packUrl: RZ_MY25_BROCHURE,
    range: { epaRangeMi: f(220, "mfr", "high", "18-inch wheels; 196 mi on the 20-inch fitment", epa(49101)) },
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
  const bare = (row: EnrichmentRow, badge: string): EnrichmentRow => ({
    ...row,
    id: `${row.id}-alt`,
    model: "RZ",
    modelAliases: undefined,
    trim: [badge],
  });
  R.push(
    rz450e,
    rz300e,
    rz350e26,
    rz450e26,
    rz550e26,
    bare(rz450e, "450e"),
    bare(rz300e, "300e"),
    bare(rz350e26, "350e"),
    bare(rz450e26, "450e"),
    bare(rz550e26, "550e")
  );
}

export const RESEARCH_ROWS_9: EnrichmentRow[] = R;
