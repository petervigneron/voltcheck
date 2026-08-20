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
const AS_OF = "2026-08-20";

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

// VW's own EV warranty booklet ("USA Warranty and Maintenance, Electric
// models, Model year 2025"), text-searched to confirm it names the Buzz.
const WARRANTY = {
  batteryYears: f(8, "mfr" as Source, "high"),
  batteryMiles: f(100_000, "mfr" as Source, "high"),
  sohFloorPct: f(70, "mfr" as Source, "high", "HV battery warranted 8 years, 100,000 miles, 70 percent floor"),
  batteryTransfers: f(true, "mfr" as Source, "high", "Battery warranty transfers automatically at no cost to new owner"),
};

// One VW-authored page states a US Buzz voltage figure, and it's a
// different (European) car — see the research doc's caveat. 400V here is
// independent-review-sourced (The Drive) plus the well-documented fact that
// MEB, the Buzz/ID.4 platform, is 400V across the board, distinct from VW
// Group's 800V PPE. No usable link for either source, so no sourceUrl.
const ARCHITECTURE_V = f(400 as const, "agg" as Source, "medium", "MEB platform runs a 400-volt architecture, per independent review");

// Not available on the US car. Every V2L reference found is a "Volkswagen
// Commercial Vehicles" Summer 2026 software update for the EUROPEAN Buzz —
// explicitly not US, "not before MY2027" per Carscoops. Expressed here as a
// per-car fact only (no cross-market comparison in the rendered headline);
// the market context lives in `body`, which the UI never shows.
const V2L_NOTE = {
  headline: "No V2L (vehicle-to-load) power-out on this car",
  body: "The 2.0 kW V2L power-out reported in EV press is a separate market's 'Summer 2026' commercial-vehicle software update, not confirmed for any US MY2025 or planned MY2027 Buzz.",
  severity: "trap" as const,
};

// Same VW EV warranty booklet as the ID.4 rows (data2.ts); the commercial-use
// exclusion is stated for every VW EV, not just the ID.4, so it carries over
// verbatim rather than being re-researched per model.
const RENTAL_VOIDS_WARRANTY = {
  headline: "Rental or rideshare history permanently voids the HV warranty",
  body: "VW's booklet: commercial use voids the high-voltage system warranty, and “if a commercial vehicle is sold to a subsequent retail owner, this warranty still does not apply.”",
  severity: "warning" as const,
};

export const RESEARCH_ROWS_5: EnrichmentRow[] = [
  {
    id: "id-buzz-2025-rwd",
    make: "VOLKSWAGEN",
    model: "ID. Buzz",
    modelAliases: ["ID Buzz", "ID.Buzz", "ID4 Buzz"],
    modelYears: [2025, 2025],
    drive: "RWD",
    battery: {
      packGrossKwh: f(91, "mfr", "high", "91 kWh gross battery, Volkswagen technical specifications sheet"),
      packUsableKwh: f(86, "mfr", "high", "86 kWh usable of 91 kWh gross, Volkswagen spec sheet"),
      chemistry: f("NMC", "agg", "medium"),
    },
    range: {
      epaRangeMi: f(234, "mfr", "high", "EPA-rated 234 miles, 83 MPGe combined, Volkswagen spec sheet", "https://www.fueleconomy.gov/ws/rest/vehicle/48444"),
      epaKwhPer100Mi: f(37, "mfr", "medium", "VW's own combined kWh/100mi print, not derived from MPGe"),
    },
    charging: {
      portStandard: f("CCS1", "mfr", "high"),
      dcPeakKw: f(200, "mfr", "high", "DC fast charge 200 kW peak, 10 to 80 percent in 26 minutes"),
      chargeTime1080Min: f(26, "mfr", "high"),
      superchargerAccess: f("adapter", "mfr", "high", "NACS adapter purchased separately, $200, $100 rebate for original MY25 owners", NACS_RELEASE),
      architectureV: ARCHITECTURE_V,
      acOnboardKw: f(11, "mfr", "high", "11 kW AC onboard charger, maximum acceptance rate, VW spec sheet"),
      plugAndCharge: f(true, "mfr", "high", "Plug&Charge active only for original owner, first three years", PNC_RELEASE),
    },
    thermal: { heatPump: f("none", "agg", "medium", "No heat pump on US-market cars; resistive cabin heater only") },
    specs: {
      towRatingLb: f(2600, "mfr", "high", "Tow rating 2,600 lb braked, 1,650 lb unbraked, factory hitch"),
    },
    warranty: WARRANTY,
    buyerNotes: [V2L_NOTE, RENTAL_VOIDS_WARRANTY],
  },

  {
    id: "id-buzz-2025-awd",
    make: "VOLKSWAGEN",
    model: "ID. Buzz",
    modelAliases: ["ID Buzz", "ID.Buzz", "ID4 Buzz"],
    modelYears: [2025, 2025],
    drive: "AWD",
    battery: {
      packGrossKwh: f(91, "mfr", "high", "91 kWh gross battery, Volkswagen technical specifications sheet"),
      packUsableKwh: f(86, "mfr", "high", "86 kWh usable of 91 kWh gross, Volkswagen spec sheet"),
      chemistry: f("NMC", "agg", "medium"),
    },
    range: {
      epaRangeMi: f(231, "mfr", "high", "EPA-rated 231 miles, 80 MPGe combined, Volkswagen 4MOTION spec sheet", "https://www.fueleconomy.gov/ws/rest/vehicle/48445"),
      epaKwhPer100Mi: f(38, "mfr", "medium", "VW's own combined kWh/100mi print, not derived from MPGe"),
    },
    charging: {
      portStandard: f("CCS1", "mfr", "high"),
      dcPeakKw: f(200, "mfr", "high", "DC fast charge 200 kW peak, 10 to 80 percent in 26 minutes"),
      chargeTime1080Min: f(26, "mfr", "high"),
      superchargerAccess: f("adapter", "mfr", "high", "NACS adapter purchased separately, $200, $100 rebate for original MY25 owners", NACS_RELEASE),
      architectureV: ARCHITECTURE_V,
      acOnboardKw: f(11, "mfr", "high", "11 kW AC onboard charger, maximum acceptance rate, VW spec sheet"),
      plugAndCharge: f(true, "mfr", "high", "Plug&Charge active only for original owner, first three years", PNC_RELEASE),
    },
    thermal: { heatPump: f("none", "agg", "medium", "No heat pump on US-market cars; resistive cabin heater only") },
    specs: {
      towRatingLb: f(3500, "mfr", "high", "Tow rating 3,500 lb braked, 1,650 lb unbraked, factory hitch"),
    },
    warranty: WARRANTY,
    buyerNotes: [V2L_NOTE, RENTAL_VOIDS_WARRANTY],
  },
];
