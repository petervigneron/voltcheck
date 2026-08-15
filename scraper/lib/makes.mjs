// Manufacturer allowlist for the `make` field. Some dealer platforms put the
// dealership's own name in the JSON-LD `brand` (the windowsticker/jtzimages
// sites shipped 4 Teslas as "Hill city hot rods" and a Prologue as "Consumers
// auto warehouse, inc.", 2026-08-15) — and a make that isn't a real
// manufacturer can never match an enrichment row, since the matcher keys on
// make. A make outside this list is treated as unextracted: vpic-enrich
// repairs it from the VIN decode, and ingest drops (and logs) whatever is
// still unrecognized. Spellings are vPIC's, so repaired values match.
export const KNOWN_MAKES = new Set([
  "ACURA", "ALFA ROMEO", "ASTON MARTIN", "AUDI", "BENTLEY", "BMW",
  "BRIGHTDROP", "BUICK", "CADILLAC", "CHEVROLET", "CHRYSLER", "DODGE",
  "FERRARI", "FIAT", "FISKER", "FORD", "GENESIS", "GMC", "HONDA", "HYUNDAI",
  "INFINITI", "JAGUAR", "JEEP", "KARMA", "KIA", "LAMBORGHINI", "LAND ROVER",
  "LEXUS", "LINCOLN", "LOTUS", "LUCID", "MASERATI", "MAZDA", "MCLAREN",
  "MERCEDES-BENZ", "MINI", "MITSUBISHI", "NISSAN", "POLESTAR", "PORSCHE",
  "RAM", "RIVIAN", "ROLLS-ROYCE", "SCION", "SCOUT", "SMART", "SUBARU",
  "TESLA", "TOYOTA", "VINFAST", "VOLKSWAGEN", "VOLVO",
]);

export const isKnownMake = (m) => KNOWN_MAKES.has(String(m ?? "").trim().toUpperCase());
