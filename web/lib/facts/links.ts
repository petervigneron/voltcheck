// Which fact sheets answer questions about a given car, for the surfaces
// shoppers actually land on: a listing page and a model-narrowed browse grid
// both link the matching sheets, because the sheets' own /facts index has no
// traffic to send them yet.
//
// This is a separate module from registry.ts on purpose. The registry carries
// every sheet's FAQ text for JSON-LD — ~70KB of prose that belongs on the
// server — and Browse.tsx is client code on the highest-traffic page. So this
// file holds only what a link needs: one row per model, the sheet topics it
// has, and the modelKey spellings that count as that model. It can drift from
// the registry, which is why tests/fact-links.test.ts pins the two to each
// other in both directions: a sheet added there without a row here fails, and
// a row here pointing at no sheet fails.
//
// Matching is exact on modelKey (lib/listings/modelName.ts), the same fold the
// grid groups cards by. Deliberately no prefix rule: "Ioniq 5 N" gets no link
// to the Ioniq 5 sheets rather than a link that half-applies. Matching nothing
// is honest; matching the wrong thing is not.

import { modelKey } from "@/lib/listings/modelName";

export type FactLink = { path: string; label: string };

// One label shape per topic, phrased as the question the sheet answers —
// each is a question that sheet's own FAQ actually asks.
const LABELS: Record<string, (name: string) => string> = {
  charging: (name) => `How fast does the ${name} charge?`,
  "heat-pump": (name) => `Does the ${name} have a heat pump?`,
  "battery-warranty": (name) => `How long is the ${name} battery warranty?`,
};

export const FACT_LINK_MODELS: {
  /** URL segments, matching registry.ts. */
  make: string;
  model: string;
  /** Topic segments this model has sheets for, in display order. */
  topics: string[];
  /** How the label names the car. */
  name: string;
  /** modelKey() spellings that are this model. */
  keys: string[];
}[] = [
  { make: "nissan", model: "ariya", topics: ["charging", "heat-pump"], name: "Nissan Ariya", keys: ["ariya"] },
  { make: "nissan", model: "leaf", topics: ["charging", "heat-pump"], name: "Nissan Leaf", keys: ["leaf"] },
  { make: "hyundai", model: "ioniq-5", topics: ["charging", "heat-pump", "battery-warranty"], name: "Hyundai Ioniq 5", keys: ["ioniq5"] },
  { make: "hyundai", model: "ioniq-6", topics: ["charging", "heat-pump"], name: "Hyundai Ioniq 6", keys: ["ioniq6"] },
  { make: "kia", model: "ev6", topics: ["charging", "heat-pump", "battery-warranty"], name: "Kia EV6", keys: ["ev6"] },
  { make: "ford", model: "mustang-mach-e", topics: ["charging", "heat-pump"], name: "Ford Mustang Mach-E", keys: ["mustangmache"] },
  { make: "ford", model: "f-150-lightning", topics: ["charging", "heat-pump"], name: "Ford F-150 Lightning", keys: ["f150lightning"] },
  { make: "volkswagen", model: "id-4", topics: ["charging", "heat-pump"], name: "Volkswagen ID.4", keys: ["id4"] },
  { make: "volkswagen", model: "id-buzz", topics: ["charging", "heat-pump"], name: "Volkswagen ID. Buzz", keys: ["idbuzz"] },
  // One sheet covers both nameplates (registry.ts says why), so both keys
  // answer to the one row.
  { make: "chevrolet", model: "bolt-ev-euv", topics: ["charging", "heat-pump"], name: "Chevrolet Bolt EV or EUV", keys: ["boltev", "bolteuv"] },
  { make: "tesla", model: "model-3", topics: ["charging", "heat-pump", "battery-warranty"], name: "Tesla Model 3", keys: ["model3"] },
  { make: "tesla", model: "model-y", topics: ["charging", "heat-pump", "battery-warranty"], name: "Tesla Model Y", keys: ["modely"] },
  // batch6 (2026-09-01). Heat-pump rows deliberately absent for the GM-platform
  // cars, the Prologue and the Wrangler 4xe — see registry.ts.
  { make: "honda", model: "prologue", topics: ["charging", "battery-warranty"], name: "Honda Prologue", keys: ["prologue"] },
  // Every Wrangler 4xe is the four-door body, so the feed's "Wrangler 4xe" and
  // "Wrangler Unlimited 4xe" spellings are one vehicle and share the row (the
  // Bolt EV/EUV precedent). Petrol "Wrangler" stays unmatched.
  { make: "jeep", model: "wrangler-4xe", topics: ["charging", "battery-warranty"], name: "Jeep Wrangler 4xe", keys: ["wrangler4xe", "wranglerunlimited4xe"] },
  { make: "kia", model: "ev9", topics: ["charging", "heat-pump", "battery-warranty"], name: "Kia EV9", keys: ["ev9"] },
  // The Lyriq-V and Optiq-V are separate feed models (like the Ioniq 5 N) and get no link.
  { make: "cadillac", model: "lyriq", topics: ["charging", "battery-warranty"], name: "Cadillac Lyriq", keys: ["lyriq"] },
  { make: "cadillac", model: "optiq", topics: ["charging", "battery-warranty"], name: "Cadillac Optiq", keys: ["optiq"] },
  // "Blazer EV Police Package" is a separate fleet spelling and gets no link;
  // petrol "BLAZER" and "Equinox" stay unmatched.
  { make: "chevrolet", model: "blazer-ev", topics: ["charging", "battery-warranty"], name: "Chevrolet Blazer EV", keys: ["blazerev"] },
  { make: "chevrolet", model: "equinox-ev", topics: ["charging", "battery-warranty"], name: "Chevrolet Equinox EV", keys: ["equinoxev"] },
];

/** The fact-sheet links for one car, given the feed's own make/model strings. Empty when no sheet is exactly this model. */
export function factLinksFor(make: string, model: string): FactLink[] {
  const mk = modelKey(make);
  const mo = modelKey(model);
  const row = FACT_LINK_MODELS.find((m) => modelKey(m.make) === mk && m.keys.includes(mo));
  if (!row) return [];
  return row.topics.map((t) => ({
    path: `/facts/${row.make}/${row.model}/${t}`,
    label: LABELS[t]!(row.name),
  }));
}
