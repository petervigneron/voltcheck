// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/enrichment-abstains.test.ts
//
// `abstains` (lib/types.ts) lets a row say it is deliberately silent on a
// core field, so scripts/enrichment-coverage.mjs stops scoring that silence
// as a half-stocked cohort. That is a useful thing and a dangerous one: it is
// also, mechanically, a way to turn the coverage check green without filling
// anything in. What keeps it honest is that an abstention has to be TRUE —
// the field really is empty, the reason really is a reason — and that the
// facts it defers to really are carried somewhere else.
//
// The CI script enforces the first half. This pins the second: that each
// "the grade-keyed rows below carry it" claim is a fact about the corpus and
// not a sentence someone wrote. If a future edit deletes the trim-keyed bZ
// rows, the base row's abstention silently becomes a lie about a nameplate
// with 2,589 live listings, and nothing else in the repo would notice.
import test from "node:test";
import assert from "node:assert/strict";
import { ENRICHMENT_ROWS } from "@/lib/enrichment/data";
import { RESEARCH_ROWS } from "@/lib/enrichment/data2";
import { RESEARCH_ROWS_3 } from "@/lib/enrichment/data3";
import { RESEARCH_ROWS_4 } from "@/lib/enrichment/data4";
import { RESEARCH_ROWS_5 } from "@/lib/enrichment/data5";
import { RESEARCH_ROWS_6 } from "@/lib/enrichment/data6";
import type { EnrichmentRow, AbstainableField } from "@/lib/types";

const ALL: EnrichmentRow[] = [...ENRICHMENT_ROWS, ...RESEARCH_ROWS, ...RESEARCH_ROWS_3, ...RESEARCH_ROWS_4, ...RESEARCH_ROWS_5, ...RESEARCH_ROWS_6];
const byId = (id: string) => {
  const r = ALL.find((x) => x.id === id);
  assert.ok(r, `no row with id ${id}`);
  return r;
};

// Same accessors scripts/enrichment-coverage.mjs uses for its core tier.
const GET: Record<AbstainableField, (r: EnrichmentRow) => unknown> = {
  packUsableKwh: (r) => r.battery?.packUsableKwh ?? r.battery?.packGrossKwh,
  epaRangeMi: (r) => r.range?.epaRangeMi,
  heatPump: (r) => r.thermal?.heatPump,
  batteryWarranty: (r) => r.warranty?.batteryYears,
  portStandard: (r) => r.charging?.portStandard,
};

test("every abstention in the corpus is well-formed: known core field, real reason, field actually empty", () => {
  for (const r of ALL) {
    for (const [key, reason] of Object.entries(r.abstains ?? {})) {
      const get = GET[key as AbstainableField];
      assert.ok(get, `${r.id} abstains on "${key}", which is not an abstainable core field`);
      assert.equal(get(r), undefined, `${r.id} abstains on "${key}" but carries a value for it — one statement is stale`);
      assert.ok(
        typeof reason === "string" && reason.trim().split(/\s+/).length >= 5,
        `${r.id}'s "${key}" abstention needs a reason, not a marker — got ${JSON.stringify(reason)}`
      );
    }
  }
});

// The base-row shape: one row per nameplate carrying what every version
// shares, trim-keyed rows carrying what varies. The abstention is only
// honest while the second half exists.
const DEFERS_TO_GRADES: Array<[string, string[]]> = [
  ["bz-2026", ["bz-2026-fwd-xle", "bz-2026-fwd-xle-plus", "bz-2026-fwd-limited", "bz-2026-awd-xle", "bz-2026-awd-limited"]],
  ["bz-woodland-2026", ["bz-woodland-2026-base", "bz-woodland-2026-premium"]],
  ["bz4x-fwd", ["bz4x-xle-fwd", "bz4x-ltd-fwd-2023", "bz4x-ltd-fwd-2024"]],
  ["bz4x-awd", ["bz4x-xle-awd", "bz4x-xle-awd-2025", "bz4x-ltd-awd"]],
  ["subaru-solterra", ["subaru-solterra-premium-2023", "subaru-solterra-premium-2024", "subaru-solterra-ltd-touring"]],
];

for (const [baseId, gradeIds] of DEFERS_TO_GRADES) {
  test(`${baseId} abstains on EPA range, and every grade row it defers to carries one`, () => {
    const base = byId(baseId);
    assert.ok(base.abstains?.epaRangeMi, `${baseId} should declare its silence, not just be silent`);
    assert.equal(base.range?.epaRangeMi, undefined);
    for (const id of gradeIds) {
      assert.ok(byId(id).range?.epaRangeMi?.value, `${id} must carry the range ${baseId} defers to it`);
    }
  });
}

test("the 2017-19 Tesla S/X rows abstain with no siblings to defer to — nothing separates 60D from 100D", () => {
  for (const id of ["tesla-model-s-2019", "tesla-model-x-2017", "tesla-model-x-2018"]) {
    const r = byId(id);
    assert.ok(r.abstains?.epaRangeMi);
    assert.equal(r.range?.epaRangeMi, undefined, "a floor figure here reads as a rating and feeds the browse minRange filter");
  }
});

// The third shape: no rating exists to defer to, anywhere. These sit above
// EPA's 10,000 lb light-duty labelling threshold, so `epaRangeMi` is not a
// gap that research closes — there is no certified figure and there never
// will be. What makes this worth a test rather than a comment is the label:
// EnrichmentReport prints this field under the literal words "EPA range", so
// a maker's own estimate placed here reads as a government rating. Cadillac
// quotes 465 miles for the Escalade IQ and it is not an EPA number; it lives
// in the buyer note, and this pins it out of the field.
test("the Class-3 trucks and Escalade IQ/IQL abstain on EPA range, and print no figure under that label", () => {
  for (const id of [
    "silverado-class3-standard", "silverado-class3-extended", "silverado-class3-max",
    "cadillac-escalade-iq-2026", "cadillac-escalade-iql-2026",
  ]) {
    const r = byId(id);
    assert.ok(r.abstains?.epaRangeMi, `${id} should declare why it is silent`);
    assert.equal(r.range?.epaRangeMi, undefined, "no EPA rating exists for this vehicle to print");
  }
});

// Regression pin. All fourteen of these shipped with no portStandard, so the
// detail page printed "Port: Unknown" directly under "DC fast charging: Not
// available" — a plug we appeared not to have researched on a car that only
// has one kind.
test("every PHEV row states its AC inlet, so none of them render an unknown port", () => {
  const phevIds = [
    "volt-2011-12", "volt-2013-15", "volt-2016-19",
    "rav4-prime-2021-25",
    "prius-prime-2017-19", "prius-prime-2020-22", "prius-prime-2023-25-base", "prius-prime-2023-25-se",
    "pacifica-hybrid-2017-19", "pacifica-hybrid-2020-25",
    "escape-phev-2020-22", "escape-phev-2023", "escape-phev-2024-25",
    "clarity-phev-2018-21",
  ];
  for (const id of phevIds) {
    const r = byId(id);
    assert.equal(r.charging?.portStandard?.value, "J1772", `${id} takes a J1772 AC inlet and should say so`);
    assert.equal(r.charging?.dcFastCharging?.value, "none", `${id} is the no-DC-port case this pins`);
  }
});
