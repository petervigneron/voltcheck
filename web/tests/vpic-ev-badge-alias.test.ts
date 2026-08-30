// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/vpic-ev-badge-alias.test.ts
//
// vPIC strips the electric badge off nameplates a combustion car shares:
// "Equinox EV" decodes as "Equinox", "F-150 Lightning" as "F-150", every
// plug-in Volvo as its bare chassis name. Measured against the live feed on
// 2026-08-30, 36,333 of 143,584 cars (25%) were researched yet answered the
// VIN check with "No researched row for this model yet".
//
// The fix is lib/enrichment/vpicEvAlias.ts: bare-name aliases consulted ONLY
// when the decode's own electrificationLevel says BEV/PHEV — the condition
// tests/vpic-model-strings.test.ts always demanded for these nameplates.
// This drives the REAL matcher with decodes captured from vPIC on
// 2026-08-30 (each VIN was a live listing that day; re-decode to re-verify).
import test from "node:test";
import assert from "node:assert/strict";
import { matchEnrichment } from "@/lib/enrichment/match";
import { VPIC_EV_MODEL_ALIAS_MAP, vpicEvModelAliases } from "@/lib/enrichment/vpicEvAlias";
import { ENRICHMENT_ROWS } from "@/lib/enrichment/data";
import { RESEARCH_ROWS } from "@/lib/enrichment/data2";
import { RESEARCH_ROWS_3 } from "@/lib/enrichment/data3";
import { RESEARCH_ROWS_4 } from "@/lib/enrichment/data4";
import { RESEARCH_ROWS_5 } from "@/lib/enrichment/data5";
import { RESEARCH_ROWS_6 } from "@/lib/enrichment/data6";
import { RESEARCH_ROWS_9 } from "@/lib/enrichment/data9";
import { RESEARCH_ROWS_10 } from "@/lib/enrichment/data10";
import { RESEARCH_ROWS_11 } from "@/lib/enrichment/data11";
import { RESEARCH_ROWS_12 } from "@/lib/enrichment/data12";
import { RESEARCH_ROWS_13 } from "@/lib/enrichment/data13";
import type { VinDecode } from "@/lib/types";

const BEV = "BEV (Battery Electric Vehicle)";
const PHEV = "PHEV (Plug-in Hybrid Electric Vehicle)";

const decode = (d: Partial<VinDecode>): VinDecode => ({ vin: "X".repeat(17), usMarket: true, ...d });

// Real decodes, captured 2026-08-30. The point of each entry is that the
// MODEL string alone reaches nothing — only the electrification gate lets it
// through — so a match here proves the gate works end to end, including the
// vds/vin8/trim filters that run after the model stage.
const REACHABLE: Array<[string, VinDecode]> = [
  ["Equinox EV — vPIC says petrol's name",
   decode({ vin: "3GN7DLRP0RS249576", make: "CHEVROLET", model: "Equinox", modelYear: 2024, trim: "2LT", electrificationLevel: BEV })],
  ["Blazer EV",
   decode({ vin: "3GNKD1RJ3SS153232", make: "CHEVROLET", model: "Blazer", modelYear: 2025, trim: "LT", driveType: "AWD", electrificationLevel: BEV })],
  ["Silverado EV",
   decode({ vin: "1GC10UED2RU205901", make: "CHEVROLET", model: "Silverado", modelYear: 2024, trim: "Work Truck (3WT)", electrificationLevel: BEV })],
  ["F-150 Lightning — vPIC's trim is the cab style",
   decode({ vin: "1FT6W1EV0PWG23290", make: "FORD", model: "F-150", modelYear: 2023, trim: "SuperCrew", electrificationLevel: BEV })],
  ["Kona Electric",
   decode({ vin: "KM8HC3A62SU019638", make: "HYUNDAI", model: "Kona", modelYear: 2025, trim: "SEL", electrificationLevel: BEV })],
  ["Niro EV",
   decode({ vin: "KNDCC3LG6M5107285", make: "KIA", model: "Niro", modelYear: 2021, trim: "EX", electrificationLevel: BEV })],
  ["XC40 Recharge",
   decode({ vin: "YV4ED3UL1P2983380", make: "VOLVO", model: "XC40", modelYear: 2023, trim: "Plus Dark", electrificationLevel: BEV })],
  ["XC90 T8 — the PHEV side of the gate",
   decode({ make: "VOLVO", model: "XC90", modelYear: 2024, electrificationLevel: PHEV })],
  ["Tucson Plug-in Hybrid",
   decode({ make: "HYUNDAI", model: "Tucson", modelYear: 2024, electrificationLevel: PHEV })],
  ["CX-90 PHEV",
   decode({ make: "MAZDA", model: "CX-90", modelYear: 2024, electrificationLevel: PHEV })],
  ["Outlander PHEV",
   decode({ make: "MITSUBISHI", model: "Outlander", modelYear: 2023, electrificationLevel: PHEV })],
];

for (const [label, d] of REACHABLE) {
  test(`gate: ${label} reaches a researched row`, () => {
    const r = matchEnrichment(d, null);
    assert.ok(
      r.exact || r.candidates?.length,
      `"${d.model}" + ${d.electrificationLevel} must reach the corpus; got nothing`
    );
  });
}

// Mirror negatives: the IDENTICAL decode with the electrification field the
// petrol (or non-plug-in hybrid) twin actually returns. Verified against vPIC
// 2026-08-30: petrol F-150/Kona/Equinox patterns decode with the field EMPTY,
// a non-plug-in Niro hybrid decodes "Strong HEV". None may reach an EV row.
const STRONG_HEV = "Strong HEV (Hybrid Electric Vehicle)";
const MUST_NOT: Array<[string, VinDecode]> = [
  ["petrol Equinox", decode({ make: "CHEVROLET", model: "Equinox", modelYear: 2024, trim: "2LT" })],
  ["petrol F-150", decode({ make: "FORD", model: "F-150", modelYear: 2023, trim: "XLT" })],
  ["petrol Kona", decode({ make: "HYUNDAI", model: "Kona", modelYear: 2025, trim: "SEL" })],
  ["petrol XC90", decode({ make: "VOLVO", model: "XC90", modelYear: 2024 })],
  ["Niro hybrid (Strong HEV is not PHEV)", decode({ make: "KIA", model: "Niro", modelYear: 2021, trim: "EX", electrificationLevel: STRONG_HEV })],
  ["petrol Tucson", decode({ make: "HYUNDAI", model: "Tucson", modelYear: 2024 })],
];

for (const [label, d] of MUST_NOT) {
  test(`gate: ${label} still matches nothing`, () => {
    const r = matchEnrichment(d, null);
    assert.equal(r.exact, undefined, `${label} must not resolve an EV row`);
    assert.ok(!r.candidates?.length, `${label} must not offer EV candidates`);
  });
}

// Map hygiene: every alias target must be a model string some corpus row
// actually answers to, so a row rename breaks this test instead of silently
// re-opening the hole.
const ALL_ROWS = [
  ...ENRICHMENT_ROWS, ...RESEARCH_ROWS, ...RESEARCH_ROWS_3, ...RESEARCH_ROWS_4,
  ...RESEARCH_ROWS_5, ...RESEARCH_ROWS_6, ...RESEARCH_ROWS_9, ...RESEARCH_ROWS_10,
  ...RESEARCH_ROWS_11, ...RESEARCH_ROWS_12, ...RESEARCH_ROWS_13,
];
const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
const knownByMake = new Map<string, Set<string>>();
for (const r of ALL_ROWS) {
  const k = r.make.toUpperCase();
  if (!knownByMake.has(k)) knownByMake.set(k, new Set());
  const set = knownByMake.get(k)!;
  for (const m of [r.model, ...(r.modelAliases ?? [])]) set.add(norm(m));
}

for (const [key, targets] of Object.entries(VPIC_EV_MODEL_ALIAS_MAP)) {
  const make = key.split("|")[0];
  for (const target of targets) {
    test(`map hygiene: "${key}" → "${target}" names a corpus row`, () => {
      assert.ok(
        knownByMake.get(make)?.has(norm(target)),
        `no ${make} row answers to "${target}" — renamed or removed?`
      );
    });
  }
}

// The gate itself: no level, no aliases.
test("gate: no electrificationLevel means no aliases at all", () => {
  assert.deepEqual(vpicEvModelAliases({ make: "FORD", model: "F-150" }), []);
  assert.deepEqual(
    vpicEvModelAliases({ make: "KIA", model: "Niro", electrificationLevel: STRONG_HEV }),
    []
  );
});
