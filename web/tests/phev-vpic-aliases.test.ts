// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/phev-vpic-aliases.test.ts
//
// The /vin/ check page matches enrichment against what vPIC returns, not
// against a dealer feed's model field, and the two disagree. vPIC suffixes
// Toyota's Prime nameplates — "Prius Prime (PHEV)", "RAV4 Prime (PHEV)" —
// while every other plug-in hybrid in the corpus decodes to a bare name
// ("Volt", "Escape", "Clarity", "Pacifica", each checked against a live VIN
// on 2026-08-22). Found by opening voltcheck.net/vin/JTDACACU4P3005078, a
// 2023 Prius Prime, and reading "No researched row for this model yet" on a
// car the corpus holds thirteen sourced facts about.
//
// A model-string mismatch has no symptom other than a page quietly saying it
// knows nothing, which is the same thing it says about a car nobody has
// researched — the failure mode the coverage check exists for, one layer
// further out. This pins the strings.
import test from "node:test";
import assert from "node:assert/strict";
import { RESEARCH_ROWS_4 } from "@/lib/enrichment/data4";
import type { EnrichmentRow } from "@/lib/types";

const byId = (id: string): EnrichmentRow => {
  const r = RESEARCH_ROWS_4.find((x) => x.id === id);
  assert.ok(r, `no row with id ${id}`);
  return r;
};

// Model string, and a live VIN it was decoded from, so a future reader can
// re-run the check rather than trust the comment.
const VPIC_MODELS: Array<[string, string, string]> = [
  ["rav4-prime-2021-25", "RAV4 Prime (PHEV)", "JTM7ERAV1TJ015250"],
  ["prius-prime-2017-19", "Prius Prime (PHEV)", "JTDACACU4P3005078"],
  ["prius-prime-2020-22", "Prius Prime (PHEV)", "JTDACACU4P3005078"],
  ["prius-prime-2023-25-base", "Prius Prime (PHEV)", "JTDACACU4P3005078"],
  ["prius-prime-2023-25-se", "Prius Prime (PHEV)", "JTDACACU4P3005078"],
];

for (const [id, vpicModel, vin] of VPIC_MODELS) {
  test(`${id} answers to vPIC's own model string "${vpicModel}" (VIN ${vin})`, () => {
    const r = byId(id);
    const names = [r.model, ...(r.modelAliases ?? [])];
    assert.ok(
      names.includes(vpicModel),
      `the /vin/ page decodes this car as "${vpicModel}"; row knows ${JSON.stringify(names)}`
    );
  });
}
