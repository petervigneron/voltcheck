import type { VinDecode } from "../types";

// vPIC files many electrified cars under the model string their COMBUSTION
// sibling wears: "Equinox EV" decodes as "Equinox", "F-150 Lightning" as
// "F-150", "XC90 Recharge" as "XC90", "CX-90 PHEV" as "CX-90". The corpus
// keys those rows on the electrified name (or guards a bare-name `-alt` row
// with trim tokens vPIC's Trim field never carries), so the /vin/ page found
// nothing and printed "No researched row for this model yet" — the same words
// it uses for a car nobody researched. Measured against the live feed on
// 2026-08-30: 36,333 of 143,584 cars (25%) sat in that hole, including the
// Equinox EV (5,002), Blazer EV (3,591) and every plug-in Volvo.
//
// A bare modelAliases entry cannot fix this — /vin/ decodes whatever VIN a
// visitor types, with no classifyEv upstream, so "F-150" as an alias would
// print a Lightning's battery on a petrol truck. The gate is vPIC's own
// ElectrificationLevel: these aliases are consulted ONLY when the decode
// itself says BEV or PHEV, and only for the level the alias names. Control
// tests 2026-08-30: petrol F-150/Kona/Equinox VIN patterns decode with the
// field EMPTY, and a non-plug-in Niro hybrid decodes "Strong HEV" — which
// evLevel() deliberately does not accept. Listing-side matching is untouched
// because decodeFromListing never sets electrificationLevel.
//
// Values are corpus model strings (web/tests/vpic-ev-badge-alias.test.ts
// fails if one stops resolving). Where vPIC's one name covers materially
// different cars (Q8 e-tron vs its Sportback), every candidate string is
// listed and the matcher's existing vds/trim/drive filters — or the
// candidates presentation — take it from there.

export function evLevel(decode: Pick<VinDecode, "electrificationLevel">): "BEV" | "PHEV" | undefined {
  const e = decode.electrificationLevel ?? "";
  if (/^BEV\b/.test(e)) return "BEV";
  if (/^PHEV\b/.test(e)) return "PHEV";
  return undefined;
}

const MAP: Record<string, string[]> = {
  // ── BEV badge stripped ──
  "CHEVROLET|EQUINOX|BEV": ["Equinox EV"],
  "CHEVROLET|BLAZER|BEV": ["Blazer EV"],
  "CHEVROLET|SILVERADO|BEV": ["Silverado EV"],
  "GMC|SIERRA|BEV": ["Sierra EV"],
  "FORD|F-150|BEV": ["F-150 Lightning"],
  "KIA|NIRO|BEV": ["Niro EV"],
  "HYUNDAI|KONA|BEV": ["Kona Electric"],
  "VOLVO|XC40|BEV": ["XC40 Recharge Pure Electric"],
  "GENESIS|GV70|BEV": ["Electrified GV70"],
  "GENESIS|G80|BEV": ["Electrified G80"],
  // Audi files every e-tron under the bare chassis code. Where the corpus
  // folds SUV and Sportback onto one row set (Q4, Q6) one string suffices;
  // where it keys them separately both are listed.
  "AUDI|Q4|BEV": ["Q4 e-tron"],
  "AUDI|Q6|BEV": ["Q6 e-tron"],
  "AUDI|SQ6|BEV": ["SQ6 e-tron"],
  "AUDI|Q8|BEV": ["Q8 e-tron", "Q8 Sportback e-tron"],
  "AUDI|SQ8|BEV": ["SQ8 e-tron"],
  "AUDI|A6|BEV": ["A6 e-tron", "A6 Sportback e-tron"],
  "AUDI|S6|BEV": ["S6 Sportback e-tron"],
  // Mercedes: vPIC appends the body ("EQS-Class Sedan"), the corpus keys the
  // showroom name; sedan/SUV stay separate rows so the body vPIC names picks
  // the right one directly.
  "MERCEDES-BENZ|EQS-CLASS SEDAN|BEV": ["EQS"],
  "MERCEDES-BENZ|EQS-CLASS SUV|BEV": ["EQS SUV"],
  "MERCEDES-BENZ|EQE-CLASS SEDAN|BEV": ["EQE"],
  "MERCEDES-BENZ|EQE-CLASS SUV|BEV": ["EQE SUV"],
  "MERCEDES-BENZ|EQB-CLASS|BEV": ["EQB"],
  "LEXUS|ES|BEV": ["ES 350e", "ES 500e"],
  "LEXUS|RZ|BEV": ["RZ 300e", "RZ 350e", "RZ 450e", "RZ 550e"],

  // ── PHEV badge stripped ──
  "VOLVO|XC90|PHEV": ["XC90 Plug-In Hybrid"],
  "VOLVO|XC60|PHEV": ["XC60 Plug-In Hybrid"],
  "VOLVO|S60|PHEV": ["S60 Plug-In Hybrid"],
  "VOLVO|S90|PHEV": ["S90 Plug-In Hybrid"],
  "KIA|NIRO|PHEV": ["Niro Plug-In Hybrid"],
  "KIA|SPORTAGE|PHEV": ["Sportage Plug-In Hybrid"],
  "KIA|SORENTO|PHEV": ["Sorento Plug-In Hybrid"],
  "HYUNDAI|TUCSON|PHEV": ["Tucson Plug-In Hybrid"],
  "HYUNDAI|SANTA FE|PHEV": ["Santa Fe Plug-In Hybrid"],
  "HYUNDAI|SONATA|PHEV": ["Sonata Plug-In Hybrid"],
  "HYUNDAI|IONIQ|PHEV": ["Ioniq Plug-In Hybrid"],
  "MAZDA|CX-90|PHEV": ["CX-90 PHEV"],
  "MAZDA|CX-70|PHEV": ["CX-70 PHEV"],
  "NISSAN|ROGUE|PHEV": ["Rogue Plug-In Hybrid"],
  "MITSUBISHI|OUTLANDER|PHEV": ["Outlander PHEV"],
  "HONDA|CLARITY|PHEV": ["Clarity Plug-In Hybrid"],
  "FORD|FUSION|PHEV": ["Fusion Energi"],
  "FORD|C-MAX|PHEV": ["C-Max Energi"],
  "FORD|ESCAPE|PHEV": ["Escape PHEV"],
  "MERCEDES-BENZ|GLC-CLASS|PHEV": ["GLC 350e"],
  "MERCEDES-BENZ|GLE-CLASS|PHEV": ["GLE 450e"],
  "MERCEDES-BENZ|C-CLASS|PHEV": ["AMG C 63"],
  "MERCEDES-BENZ|E-CLASS|PHEV": ["AMG E 53 Hybrid"],
  "LEXUS|TX|PHEV": ["TX 550h+"],
  "LAND ROVER|RANGE ROVER|PHEV": ["Range Rover Plug-In Hybrid"],
  "LAND ROVER|RANGE ROVER SPORT|PHEV": ["Range Rover Sport Plug-In Hybrid"],
  "TOYOTA|PRIUS|PHEV": ["Prius Prime", "Prius Plug-In Hybrid"],
  "SUBARU|CROSSTREK|PHEV": ["Crosstrek Hybrid"],
  "MINI|COUNTRYMAN|PHEV": ["Cooper SE Countryman ALL4"],
  "FERRARI|296|PHEV": ["296 GTB", "296 GTS"],
  "FERRARI|SF90|PHEV": ["SF90 Stradale", "SF90 Spider"],
  "MCLAREN|ARTURA|PHEV": ["Artura"],
  "BENTLEY|BENTAYGA|PHEV": ["Bentayga Hybrid"],
};

// Exported for the alias-coverage test and scraper/vpic-model-alias-check.mjs.
export const VPIC_EV_MODEL_ALIAS_MAP: Readonly<Record<string, readonly string[]>> = MAP;

/** Corpus model strings this decode may additionally answer to — non-empty
 *  only when vPIC's own decode proves the car is a BEV or PHEV. */
export function vpicEvModelAliases(
  decode: Pick<VinDecode, "make" | "model" | "electrificationLevel">
): string[] {
  const lvl = evLevel(decode);
  if (!lvl || !decode.make || !decode.model) return [];
  return MAP[`${decode.make.trim().toUpperCase()}|${decode.model.trim().toUpperCase()}|${lvl}`] ?? [];
}
