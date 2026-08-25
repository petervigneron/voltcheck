import type { EnrichmentRow, Fact, Source } from "../types";

// Fifth research tranche (2026-08-20): VW ID. Buzz — the only VW nameplate
// with zero enrichment rows before this pass (owner flagged Buzz detail
// pages as nearly empty). Full research in
// docs/agents/idbuzz-enrichment-2026-08-20.md.
//
// Two rows, not one per trim: VW's own per-trim tech-spec PDFs (Pro S, Pro S
// Plus RWD/AWD, 1st Edition RWD/AWD) are byte-identical on every
// drivetrain-determined fact — trim only changes content (seats, roof,
// wheels), never the powertrain numbers. So the row key is `drive`, with
// `trim` left undefined (matches every trim).
//
// Scope: US MY2025 only. VW confirmed in Dec 2025 it is skipping MY2026 ID.
// Buzz production for the US market and selling down MY2025 stock until a
// MY2027 return — "2025 onward" therefore resolves to exactly one model year
// today; do not add a MY2026 row from this file without new research.
//
// Copy-fix pass (2026-08-20, owner review of the live page): every note
// below was re-read against the house rule that a note is a qualifier, not a
// citation or a restatement — see FactRow.tsx's header comment. Deleted
// notes that only repeated the value shown above them or named a source
// (the hover citation on any sourceUrl now carries that); kept only the ones
// stating a real per-car condition (plugAndCharge's ownership window,
// towRatingLb's unbraked figure, which has no field of its own).
const AS_OF = "2026-08-20";

// Volkswagen battery-warranty transferability — the sentence in the
// High-Voltage System Limited Warranty section of VW's own USA Warranty and
// Maintenance booklet for electric models. Fuller comment in data2.ts.
const VW_EV_BOOKLET =
  "https://ownersliterature.vw.com/owners-literature-service/v1/document/511662d8-903a-4c14-9434-0958f5f3a036";
const VW_XFER_NOTE =
  "\u201CAutomatically transferred without cost if the ownership of the vehicle changes within the warranty period\u201D";


function f<T>(
  value: T,
  source: Source,
  confidence: Fact<T>["confidence"] = "high",
  note?: string,
  sourceUrl?: string
): Fact<T> {
  return { value, source, asOf: AS_OF, confidence, note, sourceUrl };
}

// media.vw.com press releases, read live and quoted in full in the research doc.
const NACS_RELEASE = "https://media.vw.com/releases/1891";
const PNC_RELEASE = "https://media.vw.com/releases/1823";

// VW's own MY2025 US retail order guide (Volkswagen of America letterhead,
// "2025 ID. Buzz"; mirrored byte-identically at two dealer hosts, MD5
// 07bc03a6370cda774fbd23d7fc15f306). Its two-page "Available Features"
// table itemizes every heated feature by trim — mirrors, steering wheel,
// front seats, 2nd-row seats, washer nozzles, windshield — down to a
// dot/dash grid per trim, and contains zero occurrences of "pump" anywhere
// in the document. Same document family and same control-test logic already
// used to confirm the ID.4 has no US heat pump (docs/agents/
// factsheet-heatpump-by-year.md): a feature this granular about heating
// would carry a heat pump line the same way if the car had one.
const ORDER_GUIDE = "https://volkswagenorderguides.com/wp-content/uploads/2024/09/2025_Volkswagen_ID.Buzz_Order_Guide.pdf";

// VW's own EV warranty booklet ("USA Warranty and Maintenance, Electric
// models, Model year 2025"), text-searched to confirm it names the Buzz.
const WARRANTY = {
  batteryYears: f(8, "mfr" as Source, "high"),
  batteryMiles: f(100_000, "mfr" as Source, "high"),
  sohFloorPct: f(70, "mfr" as Source, "high"),
  batteryTransfers: f(true, "mfr" as Source, "high", VW_XFER_NOTE, VW_EV_BOOKLET),
};

// architectureV (pack voltage) deliberately has no row: checked four
// VW-authored US documents for this model (the order guide above, the
// per-trim tech-spec PDF, the EV warranty booklet, the Quick-Start Guide) —
// none states a system voltage. The only VW-authored page that states one is
// volkswagen-newsroom.com's EUROPEAN ID. Buzz drive-system page, a different
// car (150 kW/~79 kWh EU spec vs. this car's 210 kW/91 kWh US spec) and
// explicitly excluded by the house rule against EU-sourced Buzz specs. An
// uncitable claim doesn't belong on the page — see FactRow.tsx's citation
// rule — so the field is omitted rather than shipped as an unsourced "agg"
// guess.

export const RESEARCH_ROWS_5: EnrichmentRow[] = [
  {
    id: "id-buzz-2025-rwd",
    make: "VOLKSWAGEN",
    model: "ID. Buzz",
    modelAliases: ["ID Buzz", "ID.Buzz", "ID4 Buzz"],
    modelYears: [2025, 2025],
    drive: "RWD",
    battery: {
      packGrossKwh: f(91, "mfr", "high"),
      packUsableKwh: f(86, "mfr", "high"),
      chemistry: f("NMC", "agg", "medium"),
    },
    range: {
      epaRangeMi: f(234, "mfr", "high", undefined, "https://www.fueleconomy.gov/ws/rest/vehicle/48444"),
      epaKwhPer100Mi: f(37, "mfr", "medium"),
    },
    charging: {
      portStandard: f("CCS1", "mfr", "high"),
      dcFastCharging: f("standard", "mfr", "high"),
      dcPeakKw: f(200, "mfr", "high"),
      chargeTime1080Min: f(26, "mfr", "high"),
      superchargerAccess: f("adapter", "mfr", "high", undefined, NACS_RELEASE),
      acOnboardKw: f(11, "mfr", "high"),
      plugAndCharge: f(true, "mfr", "high", "Original owner only, first three years", PNC_RELEASE),
    },
    thermal: { heatPump: f("none", "mfr", "high", undefined, ORDER_GUIDE) },
    specs: {
      towRatingLb: f(2600, "mfr", "high", "1,650 lb unbraked"),
    },
    warranty: WARRANTY,
  },

  {
    id: "id-buzz-2025-awd",
    make: "VOLKSWAGEN",
    model: "ID. Buzz",
    modelAliases: ["ID Buzz", "ID.Buzz", "ID4 Buzz"],
    modelYears: [2025, 2025],
    drive: "AWD",
    battery: {
      packGrossKwh: f(91, "mfr", "high"),
      packUsableKwh: f(86, "mfr", "high"),
      chemistry: f("NMC", "agg", "medium"),
    },
    range: {
      epaRangeMi: f(231, "mfr", "high", undefined, "https://www.fueleconomy.gov/ws/rest/vehicle/48445"),
      epaKwhPer100Mi: f(38, "mfr", "medium"),
    },
    charging: {
      portStandard: f("CCS1", "mfr", "high"),
      dcFastCharging: f("standard", "mfr", "high"),
      dcPeakKw: f(200, "mfr", "high"),
      chargeTime1080Min: f(26, "mfr", "high"),
      superchargerAccess: f("adapter", "mfr", "high", undefined, NACS_RELEASE),
      acOnboardKw: f(11, "mfr", "high"),
      plugAndCharge: f(true, "mfr", "high", "Original owner only, first three years", PNC_RELEASE),
    },
    thermal: { heatPump: f("none", "mfr", "high", undefined, ORDER_GUIDE) },
    specs: {
      towRatingLb: f(3500, "mfr", "high", "1,650 lb unbraked"),
    },
    warranty: WARRANTY,
  },
];
