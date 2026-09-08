// Sellers who say every car they sell has a branded title.
//
// Owner, 2026-09-08, on parklinemotors.com's 2022 Rivian R1T 7FCTGAAA1NN011275
// ($45,821): "How did we miss the branded title on this truck?!!?" We missed
// it on purpose, and the purpose was wrong for this lot. Parkline writes
// "This branded title Tesla Model Y has passed a thorough 150+ point
// inspection" on some cars — 24 of its 45 were flagged by that sentence —
// but on this Rivian the notes carry only the lot-wide copy ("a premium
// selection of pre-owned branded title vehicles", "our branded title
// expertise"), and migration 0069 treats those words as the dealer talking
// about itself, not about the car. Which they are. But Parkline's homepage
// also says "Every car in our inventory is handpicked and expertly rebuilt",
// and a seller's statement about every car it sells IS a statement about
// this one. Same for stricklandauto.com ("a branded-title dealership that
// builds a high volume of vehicles in-house", on every car it lists).
//
// So: a hand-curated list of rooftops whose seller has said, on its own
// site, that its whole inventory is branded. Every car on such a lot carries
// `inventoryBranded: true` in its payload (ingest.mjs), and migration 0074
// makes branded_title_disclosed read it. The list is curated, not learned,
// because the claim is about an entire lot and one wrong entry would brand
// dozens of clean cars: each entry quotes the seller's own words and where
// they were read. buyback-dealers.mjs prints candidates it sees on homepages
// (lib/buyback-dealer-signals.mjs readBrandedTitleSignals); a person reads
// the page and adds the entry. Not gated on condition — Strickland's cars
// arrive here published as "new", which a rebuilder cannot sell, and the
// brand is true whatever the condition field says.

import { readFileSync } from "node:fs";

const FILE = new URL("../registry/branded-title-dealers.json", import.meta.url);
let table;
function load() {
  if (table) return table;
  table = new Map();
  try {
    const j = JSON.parse(readFileSync(FILE, "utf8"));
    for (const [domain, entry] of Object.entries(j)) {
      if (domain.startsWith("_") || !entry || typeof entry !== "object" || !entry.statement) continue;
      table.set(domain.toLowerCase().replace(/^www\./, ""), entry);
    }
  } catch {
    /* no registry: no seller has said it */
  }
  return table;
}

/** True when the seller of this rooftop states its whole inventory is branded. */
export function inventoryBrandedFor(dealerDomain) {
  if (typeof dealerDomain !== "string" || !dealerDomain) return false;
  return load().has(dealerDomain.toLowerCase().replace(/^www\./, ""));
}

/** The curated entries, for tests and the candidate review line. */
export function brandedTitleDealers() {
  return new Map(load());
}
