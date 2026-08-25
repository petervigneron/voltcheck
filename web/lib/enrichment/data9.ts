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

export const RESEARCH_ROWS_9: EnrichmentRow[] = R;
