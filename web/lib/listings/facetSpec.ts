// Which spec facets a model's rail offers, and in what order — the curated
// half of the per-model facet spec (docs/facet-spec-top-models.md, owner
// sign-off 2026-09-01, starting with the Ioniq 5).
//
// Same matching contract as lib/facts/links.ts: exact on modelKey, no prefix
// rule — "Ioniq 5 N" is a different car and gets the default rail rather than
// a curation that half-applies. Models without a row keep SPEC_FACETS in its
// standing order, so curation can only ever be added a model at a time.
//
// Presence is still decided by the data: Browse offers a row only when the
// axis actually varies in the model's live inventory (fewer than two distinct
// values and the row never renders), so a curated entry is an ordering and an
// invitation, never a claim that the choice exists this week.

import { modelKey } from "./modelName";
import { DRIVE_FACET, SPEC_FACETS, type FacetKey } from "../filters";

export type FacetDef = { key: FacetKey; label: string; unit: string };

const DEFS: Record<FacetKey, FacetDef> = Object.fromEntries(
  [...SPEC_FACETS, DRIVE_FACET].map((f) => [f.key, f])
) as Record<FacetKey, FacetDef>;

const FACET_SPECS: {
  make: string;
  /** modelKey() spellings that are this model. */
  keys: string[];
  /** Facets in display order. */
  facets: FacetKey[];
}[] = [
  // Ioniq 5: trim, battery, drivetrain — the versions a shopper decides
  // between. No range row: with pack and drivetrain picked, the EPA figure is
  // settled, so a range row would be the same question asked in worse units.
  // Measured 2026-09-01 over 5,306 live cars: trim is 96.9% the six real
  // Hyundai trims, and drivetrain reaches ~100% once the VIN-matched row's
  // drive backfills the 19% the feeds leave blank (buildIndex.ts).
  { make: "hyundai", keys: ["ioniq5"], facets: ["trim", "kwh", "drive"] },
];

/** The facet rows for one model, in display order. */
export function facetsFor(make: string, model: string): FacetDef[] {
  const mk = modelKey(make);
  const mo = modelKey(model);
  const row = FACET_SPECS.find((m) => modelKey(m.make) === mk && m.keys.includes(mo));
  return (row ? row.facets : SPEC_FACETS.map((f) => f.key)).map((k) => DEFS[k]);
}
