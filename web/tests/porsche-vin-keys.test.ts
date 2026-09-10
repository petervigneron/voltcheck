// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/porsche-vin-keys.test.ts
//
// The Porsche rows (lib/enrichment/data4.ts for the Taycan and Macan
// Electric, data6.ts for the Cayenne E-Hybrid) were keyed on dealer trim
// strings alone until 2026-09-10, and match.ts refuses a trim-keyed row for
// a listing whose trim is blank. Measured against the live shard cache that
// day: 0 of 1,331 Taycans and 0 of 1,044 Macan Electrics resolved to
// anything once the trim was taken away, and 117 MY2026 Cayenne Electric
// listings — a battery-electric car with no row in the corpus — were being
// answered with a plug-in hybrid Cayenne's pack, charger and J1772 inlet.
//
// The rows are now keyed on VIN positions 4-8, read off all 3,845 live
// Porsche VINs and confirmed against vPIC's DecodeVINValuesBatch. Every VIN
// below is a real one from that cache. What this pins:
//
//   * a blank trim still reaches the right row, on the VIN alone;
//   * a dealer trim naming a different grade cannot override the VIN;
//   * a VIN outside the patterns matches none of these rows, rather than
//     the nearest one.

import test from "node:test";
import assert from "node:assert/strict";
import { matchEnrichment } from "@/lib/enrichment/match";
import type { VinDecode } from "@/lib/types";

const decode = (over: Partial<VinDecode>): VinDecode => ({ vin: "", usMarket: true, make: "PORSCHE", ...over });
const PHEV = "PHEV (Plug-in Hybrid Electric Vehicle)";
const BEV = "BEV (Battery Electric Vehicle)";
const idOf = (d: VinDecode) => matchEnrichment(d, null).exact?.id;

// ── Taycan: position 4 is the body, position 5 the grade ─────────────────
test("a trimless Taycan resolves on the VIN, one pattern per body and grade", () => {
  // [VIN, model year, row id, EPA range the row prints]
  const cases: [string, number, string, number][] = [
    // AD = GTS sedan, CD = GTS Sport Turismo. The two used to be told apart
    // only by a trim string, and "GTS" on a Sport Turismo listing resolved
    // to the sedan's 246 mi.
    ["WP0AD2Y11PSA48268", 2023, "taycan-2023-24-gts", 246],
    ["WP0CD2Y18PSA90154", 2023, "taycan-2023-24-gts-st", 233],
    // BA / BB = 4 and 4S Cross Turismo.
    ["WP0BA2Y16PSA60557", 2023, "taycan-ct-2023-24-4", 235],
    ["WP0BB2Y17PSA65442", 2023, "taycan-ct-2023-24-4s", 230],
    // AE = Turbo GT, gen 2 only.
    ["WP0AE2Y10TSA43019", 2026, "taycan-2025-26-turbogt", 276],
  ];
  for (const [vin, year, id, mi] of cases) {
    const r = matchEnrichment(decode({ vin, model: "Taycan", modelYear: year }), null);
    assert.equal(r.exact?.id, id, `${vin} → ${r.exact?.id ?? "no exact"}`);
    assert.equal(r.exact?.range?.epaRangeMi?.value, mi);
  }
});

test("the VIN wins over a dealer's trim string", () => {
  // Real feed values from the live cache, on a Sport Turismo VIN: "GTS" was
  // resolving to the sedan row for exactly these listings.
  for (const trim of ["GTS", "GTS Sport Tourismo", "Used 2023 Porsche Taycan"]) {
    assert.equal(idOf(decode({ vin: "WP0CD2Y18PSA90154", model: "Taycan", modelYear: 2023, trim })), "taycan-2023-24-gts-st", `trim "${trim}"`);
  }
  // And a Cross Turismo advertised as a bare "4S" is not the sedan 4S.
  assert.equal(idOf(decode({ vin: "WP0BB2Y17PSA65442", model: "Taycan", modelYear: 2023, trim: "4S" })), "taycan-ct-2023-24-4s");
});

// ── The four patterns that name two cars: a base row, never a grade ───────
test("a VIN pattern covering two versions lands on a base row that abstains, not on one grade's range", () => {
  // AA sedan gen 1: Performance Battery or Performance Battery Plus, 208 vs
  // 242 miles, and Porsche's Part 565 kWh figure is a per-pattern constant
  // that cannot break the tie (79.2 on every 2021-24 AA and AB VIN).
  const base = matchEnrichment(decode({ vin: "WP0AA2Y10PSA10412", model: "Taycan", modelYear: 2023 }), null);
  assert.equal(base.exact?.id, "taycan-2023-24-base");
  assert.equal(base.exact?.range?.epaRangeMi, undefined);
  assert.equal(base.exact?.battery?.packGrossKwh, undefined);
  assert.ok((base.exact?.abstains?.epaRangeMi ?? "").split(/\s+/).length >= 5);
  assert.ok((base.exact?.abstains?.packUsableKwh ?? "").split(/\s+/).length >= 5);
  // The pack figure vPIC files for this VIN names the grade's standard pack,
  // not this car's, so it must not be allowed to resolve the tie either.
  assert.equal(
    idOf(decode({ vin: "WP0AA2Y10PSA10412", model: "Taycan", modelYear: 2023, batteryKwhHint: 79.2 })),
    "taycan-2023-24-base"
  );

  // AC covers Turbo and Turbo S in every year — vPIC decodes the pattern as
  // "Turbo / Turbo S" in as many words. Both ship the Plus pack, so the base
  // row can state the pack and abstains on range alone.
  const ac = matchEnrichment(decode({ vin: "WP0AC2Y16PSA52366", model: "Taycan", modelYear: 2023 }), null);
  assert.equal(ac.exact?.id, "taycan-2023-24-turbo-base");
  assert.equal(ac.exact?.battery?.packGrossKwh?.value, 93.4);
  assert.equal(ac.exact?.range?.epaRangeMi, undefined);

  // AA in gen 2 covers the RWD Taycan AND the AWD Taycan 4 — vPIC decodes
  // the MY2026 pattern as "Taycan, Taycan 4".
  const gen2 = matchEnrichment(decode({ vin: "WP0AA2Y10TSA08721", model: "Taycan", modelYear: 2026 }), null);
  assert.equal(gen2.exact?.id, "taycan-2025-26-base");
  assert.equal(gen2.exact?.range?.epaRangeMi, undefined);

  // A listing that DOES name its grade still gets the grade row: the base
  // row exists for silence, not instead of the research.
  assert.equal(idOf(decode({ vin: "WP0AC2Y16PSA52366", model: "Taycan", modelYear: 2023, trim: "Turbo S" })), "taycan-2023-24-turbos");
  assert.equal(idOf(decode({ vin: "WP0AA2Y10TSA08721", model: "Taycan", modelYear: 2026, trim: "4" })), "taycan-2025-26-4-pbp");
});

// ── Macan Electric: one grade per pattern, no ties ────────────────────────
test("every Macan Electric grade has its own VIN pattern and resolves with no trim at all", () => {
  const cases: [string, string, number][] = [
    ["WP1AA2XA0TL000686", "macan-2026-4", 304],
    ["WP1AB2XA2TL150120", "macan-2026-4s", 290],
    ["WP1AC2XA6TL200305", "macan-2026-turbo", 293],
    ["WP1AD2XA0TL075427", "macan-2026-base", 309],
    ["WP1AE2XA0TL250014", "macan-2026-gts", 294],
  ];
  for (const [vin, id, mi] of cases) {
    const r = matchEnrichment(decode({ vin, model: "Macan Electric", modelYear: 2026 }), null);
    assert.equal(r.exact?.id, id, `${vin} → ${r.exact?.id ?? "no exact"}`);
    assert.equal(r.exact?.range?.epaRangeMi?.value, mi);
  }
  // "Electric 4" is a real feed trim on base-RWD cars and on Macan 4s alike;
  // before the VIN key it swallowed both into whichever row's trim list
  // happened to overlap. The VIN decides now.
  assert.equal(idOf(decode({ vin: "WP1AD2XA0TL075427", model: "Macan Electric", modelYear: 2026, trim: "Electric 4" })), "macan-2026-base");
  assert.equal(idOf(decode({ vin: "WP1AA2XA0TL000686", model: "Macan Electric", modelYear: 2026, trim: "Macan" })), "macan-2026-4");
});

test("a bare-nameplate Macan reaches the VIN-keyed rows only once vPIC says the car is electric", () => {
  // The bare "Macan" rows keep a trim guard, because match.ts skips every
  // VIN filter on a listing with no VIN and a trimless bare-name row would
  // then answer a petrol Macan. The route in is vpicEvAlias.ts, gated on
  // vPIC's own BEV reading.
  const bare = { vin: "WP1AD2XA0TL075427", model: "Macan", modelYear: 2026 };
  assert.equal(idOf(decode(bare)), undefined);
  assert.equal(idOf(decode({ ...bare, electrificationLevel: BEV })), "macan-2026-base");
  // A petrol Macan is not electrified, so no alias fires and nothing matches
  // — with or without a trim.
  assert.equal(idOf(decode({ model: "Macan", modelYear: 2026, vin: "WP1AA2A56TLB00001" })), undefined);
  assert.equal(idOf(decode({ model: "Macan", modelYear: 2026, vin: "WP1AA2A56TLB00001", trim: "S" })), undefined);
});

// ── Cayenne: position 5 is the E-Hybrid grade, positions 6-8 the family ───
test("each Cayenne E-Hybrid grade resolves from the VIN with no trim", () => {
  const cases: [string, string, number][] = [
    ["WP1AE2AY1TDA11056", "cayenne-ehybrid-2026", 25.9],
    ["WP1AN2AY0TDA20685", "cayenne-s-ehybrid-2026", 25.9],
    ["WP1AM2AY3TDA30324", "cayenne-turbo-ehybrid-2026", 25.9],
    ["WP1BE2AY1TDA45728", "cayenne-ehybrid-2026", 25.9],
  ];
  for (const [vin, id, kwh] of cases) {
    const r = matchEnrichment(decode({ vin, model: "Cayenne E-Hybrid", modelYear: 2026, electrificationLevel: PHEV }), null);
    assert.equal(r.exact?.id, id, `${vin} → ${r.exact?.id ?? "no exact"}`);
    assert.equal(r.exact?.battery?.packGrossKwh?.value, kwh);
  }
  // A trimless Turbo S used to land on the plain E-Hybrid row and print its
  // 17 electric miles; the Turbo S rates 15.
  const ts = matchEnrichment(decode({ vin: "WP1AH2AY8NDA46087", model: "Cayenne E-Hybrid", modelYear: 2022, electrificationLevel: PHEV }), null);
  assert.equal(ts.exact?.id, "cayenne-turbos-ehybrid-2021-23");
  assert.equal(ts.exact?.range?.epaRangeMi?.value, 15);
});

test("a MY2026 Cayenne Electric lands on its own row, never a plug-in hybrid's, whatever the dealer typed", () => {
  // The most expensive thing these keys fix: 117 live battery-electric
  // Cayennes were answering with a plug-in hybrid's 25.9 kWh pack, 11 kW
  // charger, J1772 inlet and "no DC fast charging". When this test was
  // written there was no researched row for the car and silence was the
  // answer; data21.ts (same day) keys the Cayenne Electric rows on the 2X1
  // descriptor and aliases the bare names, so now the VIN picks the right
  // electric row and the E-Hybrid rows stay out of reach.
  const bevs: [string, string, string][] = [
    ["WP1AA2X13TD000160", "Cayenne", ""],
    ["WP1AD2X11TD150419", "Cayenne", "Turbo Electric"],
    ["WP1AD2X11TD150419", "Cayenne", "Turbo"],
    ["WP1BB2X10TD300160", "Cayenne Coupe", "S"],
    ["WP1BB2X10TD300160", "Cayenne", "S Electric"],
  ];
  for (const [vin, model, trim] of bevs) {
    const r = matchEnrichment(decode({ vin, model, modelYear: 2026, trim: trim || undefined, electrificationLevel: BEV }), null);
    assert.ok(r.exact && /^cayenne-.*electric-2026$/.test(r.exact.id), `${vin} "${trim}" → ${r.exact?.id ?? "no exact"}`);
    assert.equal(r.exact?.battery?.packGrossKwh?.value, 113, `${vin} "${trim}" → pack ${r.exact?.battery?.packGrossKwh?.value}`);
  }
});

test("a bare-nameplate Cayenne reaches its grade row through vPIC's own PHEV reading", () => {
  const bare = { vin: "WP1AN2AY0TDA20685", model: "Cayenne", modelYear: 2026 };
  assert.equal(idOf(decode(bare)), undefined);
  assert.equal(idOf(decode({ ...bare, electrificationLevel: PHEV })), "cayenne-s-ehybrid-2026");
  // A petrol Cayenne is neither BEV nor PHEV to vPIC, so no alias fires.
  assert.equal(idOf(decode({ model: "Cayenne", modelYear: 2026, vin: "WP1AA2AY0TDB00001" })), undefined);
});

// ── The negative: outside the patterns, nothing ──────────────────────────
test("a VIN outside these patterns matches no Porsche row rather than the nearest one", () => {
  // Right make, right nameplate string, a descriptor Porsche does not file.
  for (const [model, vin, year] of [
    ["Taycan", "WP0ZZ2Y10PSA10412", 2023],
    ["Macan Electric", "WP1ZZ2XA0TL075427", 2026],
    ["Cayenne E-Hybrid", "WP1ZZ2AY1TDA11056", 2026],
  ] as const) {
    const r = matchEnrichment(decode({ vin, model, modelYear: year, electrificationLevel: PHEV }), null);
    assert.equal(r.exact, undefined, `${vin} → ${r.exact?.id}`);
    assert.equal(r.candidates?.length ?? 0, 0, `${vin} → candidates`);
  }
  // The 958-era Cayenne S E-Hybrid is a different family in positions 6-8
  // (2A2, not 2AY) and its rows must not answer for the 9YA car or vice
  // versa. 2A2 has no MY2026 row at all.
  assert.equal(idOf(decode({ vin: "WP1AE2A21HLA74831", model: "Cayenne E-Hybrid", modelYear: 2026, electrificationLevel: PHEV })), undefined);
});
