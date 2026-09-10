// vPIC's Model, spelled the way the feed spells it.
//
// vpic-enrich.mjs takes vPIC's Model for a listing whose own model the feed
// cannot fold on (lib/model-trust.mjs). vPIC's spelling is not the feed's in
// two ways, and each has its own table here:
//
//   BADGE — vPIC files an electrified car under the model string its
//           combustion sibling wears: "Equinox EV" decodes as "Equinox",
//           every plug-in Volvo as its bare chassis name. The bare name is a
//           different car, so the alias is consulted ONLY when the decode's
//           own ElectrificationLevel says BEV or PHEV, and only for that
//           level — the same gate web/lib/enrichment/vpicEvAlias.ts applies
//           on the /vin/ page, and its control tests (petrol F-150 / Kona /
//           Equinox VIN patterns decode with the field EMPTY) are why.
//   PLAIN — vPIC's own extra words: "Ariya Hatchback", "Prius Prime (PHEV)"
//           (both measured in scraper/vpic-model-alias-check.mjs, 08-22 and
//           09-09).
//
// The web table lists every corpus row a decode may answer to, and for some
// decodes that is more than one ("Q8 e-tron" or "Q8 Sportback e-tron"; the
// four Lexus RZ power levels). Those are candidates for a matcher with a VIN
// in hand, not a nameplate, and picking the first would print a version the
// decode never named — so this table carries only the decodes whose feed
// spelling is one string, and test/vpic-model.test.mjs holds the two tables
// in step: every entry here must be one of the web's candidates, and every
// web entry must be either here or in that test's list of deliberate
// omissions. Anything vPIC names that neither table knows passes through as
// vPIC wrote it; ingest.mjs's canonModel settles the casing.
const BADGE = {
  "CHEVROLET|EQUINOX|BEV": "Equinox EV",
  "CHEVROLET|BLAZER|BEV": "Blazer EV",
  "CHEVROLET|SILVERADO|BEV": "Silverado EV",
  "GMC|SIERRA|BEV": "Sierra EV",
  "FORD|F-150|BEV": "F-150 Lightning",
  "KIA|NIRO|BEV": "Niro EV",
  "HYUNDAI|KONA|BEV": "Kona Electric",
  "VOLVO|XC40|BEV": "XC40 Recharge Pure Electric",
  "GENESIS|GV70|BEV": "Electrified GV70",
  "GENESIS|G80|BEV": "Electrified G80",
  "AUDI|Q4|BEV": "Q4 e-tron",
  "AUDI|Q6|BEV": "Q6 e-tron",
  "AUDI|SQ6|BEV": "SQ6 e-tron",
  "AUDI|SQ8|BEV": "SQ8 e-tron",
  "AUDI|S6|BEV": "S6 Sportback e-tron",
  "MERCEDES-BENZ|EQS-CLASS SEDAN|BEV": "EQS",
  "MERCEDES-BENZ|EQS-CLASS SUV|BEV": "EQS SUV",
  "MERCEDES-BENZ|EQE-CLASS SEDAN|BEV": "EQE",
  "MERCEDES-BENZ|EQE-CLASS SUV|BEV": "EQE SUV",
  "MERCEDES-BENZ|EQB-CLASS|BEV": "EQB",
  "VOLVO|XC90|PHEV": "XC90 Plug-In Hybrid",
  "VOLVO|XC60|PHEV": "XC60 Plug-In Hybrid",
  "VOLVO|S60|PHEV": "S60 Plug-In Hybrid",
  "VOLVO|S90|PHEV": "S90 Plug-In Hybrid",
  "KIA|NIRO|PHEV": "Niro Plug-In Hybrid",
  "KIA|SPORTAGE|PHEV": "Sportage Plug-In Hybrid",
  "KIA|SORENTO|PHEV": "Sorento Plug-In Hybrid",
  "HYUNDAI|TUCSON|PHEV": "Tucson Plug-In Hybrid",
  "HYUNDAI|SANTA FE|PHEV": "Santa Fe Plug-In Hybrid",
  "HYUNDAI|SONATA|PHEV": "Sonata Plug-In Hybrid",
  "HYUNDAI|IONIQ|PHEV": "Ioniq Plug-In Hybrid",
  "MAZDA|CX-90|PHEV": "CX-90 PHEV",
  "MAZDA|CX-70|PHEV": "CX-70 PHEV",
  "NISSAN|ROGUE|PHEV": "Rogue Plug-In Hybrid",
  "MITSUBISHI|OUTLANDER|PHEV": "Outlander PHEV",
  "HONDA|CLARITY|PHEV": "Clarity Plug-In Hybrid",
  "FORD|FUSION|PHEV": "Fusion Energi",
  "FORD|C-MAX|PHEV": "C-Max Energi",
  "FORD|ESCAPE|PHEV": "Escape PHEV",
  "LEXUS|TX|PHEV": "TX 550h+",
  "LAND ROVER|RANGE ROVER|PHEV": "Range Rover Plug-In Hybrid",
  "LAND ROVER|RANGE ROVER SPORT|PHEV": "Range Rover Sport Plug-In Hybrid",
  "SUBARU|CROSSTREK|PHEV": "Crosstrek Hybrid",
  "MCLAREN|ARTURA|PHEV": "Artura",
  "BENTLEY|BENTAYGA|PHEV": "Bentayga Hybrid",
  // vPIC files the electric Macan as "Macan"; the web map made the same
  // alias in the Porsche VIN-key pass (493ed23, 2026-09-10).
  "PORSCHE|MACAN|BEV": "Macan Electric",
};

const PLAIN = {
  "NISSAN|ARIYA HATCHBACK": "Ariya",
  "TOYOTA|PRIUS PRIME (PHEV)": "Prius Prime",
};

export const VPIC_BADGE_ALIASES = Object.freeze({ ...BADGE });

function level(e) {
  const s = String(e ?? "");
  if (/^BEV\b/.test(s)) return "BEV";
  if (/^PHEV\b/.test(s)) return "PHEV";
  return undefined;
}

/** The feed's spelling of a vPIC decode row's Model, or undefined when vPIC
 *  named none. `r` is a live batch result or a cache entry; both carry Make,
 *  Model and ElectrificationLevel under those names. */
export function feedModelFromVpic(r) {
  const make = String(r?.Make ?? "").trim().toUpperCase();
  const model = String(r?.Model ?? "").trim();
  if (!model) return undefined;
  const key = `${make}|${model.toUpperCase()}`;
  const lvl = level(r?.ElectrificationLevel);
  return (lvl && BADGE[`${key}|${lvl}`]) ?? PLAIN[key] ?? model;
}
