// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/panamera-vin-keys.test.ts
//
// The Porsche Panamera E-Hybrid rows (lib/enrichment/data6.ts) carried no VIN
// key at all until 2026-09-10: a year window and a dealer trim string picked
// the grade, and a listing whose trim was blank or junk fell through to
// whichever row wore the bare "Panamera E-Hybrid" alias — always the 4
// E-Hybrid, whatever the car was. Measured over all 137 live Panamera
// listings that day, five were reading another grade's row, including a
// 680 hp Turbo S E-Hybrid quoting the 4 E-Hybrid's 16 electric miles against
// its own 14, and a 4S E-Hybrid Executive quoting the 4's MPGe.
//
// The rows are keyed on VIN positions 4-8 now, read off all 137 live VINs and
// confirmed against vPIC's DecodeVINValuesBatch, with a COMPLETE sweep of all
// 23 valid letters at position 5 on both families and both bodies as the
// control for the negatives below. Every live VIN here is a real one from the
// shard cache; every petrol VIN is a synthetic pattern VIN that was decoded
// at vPIC and came back Gasoline with an empty ElectrificationLevel.
//
// What this pins:
//
//   * a blank trim reaches the right grade on the VIN alone;
//   * a dealer trim naming a different grade cannot override the VIN;
//   * vPIC's MY2026 habit of dropping the word "Turbo" from the pattern trim
//     does not turn a 670 hp Turbo E-Hybrid into a base car;
//   * a petrol Panamera reaches no plug-in row, trim or no trim;
//   * a VIN outside the patterns matches nothing rather than the nearest row.

import test from "node:test";
import assert from "node:assert/strict";
import { matchEnrichment } from "@/lib/enrichment/match";
import type { VinDecode } from "@/lib/types";

const decode = (over: Partial<VinDecode>): VinDecode => ({ vin: "", usMarket: true, make: "PORSCHE", ...over });
const PHEV = "PHEV (Plug-in Hybrid Electric Vehicle)";
const idOf = (d: VinDecode) => matchEnrichment(d, null).exact?.id;

// ── One pattern per grade, in every year ─────────────────────────────────
test("every plug-in Panamera grade resolves from the VIN with no trim at all", () => {
  // [live VIN, model year, row id, electric EPA miles the row prints]
  const cases: [string, number, string, number | undefined][] = [
    // 971, positions 6-8 = 2A7. Position 5: E = 4 E-Hybrid, K = 4S E-Hybrid,
    // H = Turbo S E-Hybrid.
    ["WP0AE2A79JL127844", 2018, "panamera-4-ehybrid-2018", 16],
    ["WP0AH2A79JL145011", 2018, "panamera-turbos-ehybrid-2018-20", 14],
    ["WP0AE2A79KL123309", 2019, "panamera-4-ehybrid-2019-20", 14],
    ["WP0AE2A74LL131609", 2020, "panamera-4-ehybrid-2019-20", 14],
    ["WP0AE2A74ML128758", 2021, "panamera-4-ehybrid-2021-23", 19],
    ["WP0AK2A77ML141691", 2021, "panamera-4s-ehybrid-2021-23", 19],
    ["WP0AH2A70NL142021", 2022, "panamera-turbos-ehybrid-2021-23", 17],
    ["WP0AK2A75NL132196", 2022, "panamera-4s-ehybrid-2021-23", 19],
    ["WP0AE2A70PL120323", 2023, "panamera-4-ehybrid-2021-23", 19],
    // 972, positions 6-8 = 2YA. Position 5: E = 4, C = 4S, F = Turbo.
    ["WP0AE2YA9SL045275", 2025, "panamera-4-ehybrid-2025", 28],
    ["WP0AC2YA9SL060252", 2025, "panamera-4s-ehybrid-2025", 28],
    ["WP0AF2YA7SL080121", 2025, "panamera-turbo-ehybrid-2025-26", undefined],
    ["WP0AE2YA1TL031324", 2026, "panamera-4-ehybrid-2026", undefined],
    ["WP0AC2YA6TL050148", 2026, "panamera-4s-ehybrid-2026", undefined],
    ["WP0AF2YA4TL080028", 2026, "panamera-turbo-ehybrid-2025-26", undefined],
  ];
  for (const [vin, year, id, mi] of cases) {
    const r = matchEnrichment(decode({ vin, model: "Panamera E-Hybrid", modelYear: year }), null);
    assert.equal(r.exact?.id, id, `${vin} → ${r.exact?.id ?? "no exact"}`);
    assert.equal(r.exact?.range?.epaRangeMi?.value, mi, `${vin} range`);
  }
});

test("the VIN wins over a dealer's trim string", () => {
  // Real live listing: the dealer's trim field says "Automatic". It used to
  // fall through to the 4 E-Hybrid row and print 16 electric miles; vPIC
  // decodes WP0AH2A7 MY2018 as Turbo S E-Hybrid, 680 hp, 8 cyl, 4.0 L, and
  // that car rates 14.
  const ts = matchEnrichment(decode({ vin: "WP0AH2A79JL145011", model: "Panamera E-Hybrid", modelYear: 2018, trim: "Automatic" }), null);
  assert.equal(ts.exact?.id, "panamera-turbos-ehybrid-2018-20");
  assert.equal(ts.exact?.range?.epaRangeMi?.value, 14);

  // A 4S E-Hybrid whose dealer typed the 4's badge is still a 4S: the two
  // share an electric range but not their MPGe (50 against 52).
  const fourS = matchEnrichment(decode({ vin: "WP0AK2A75NL132196", model: "Panamera E-Hybrid", modelYear: 2022, trim: "4 E-Hybrid" }), null);
  assert.equal(fourS.exact?.id, "panamera-4s-ehybrid-2021-23");
  assert.equal(fourS.exact?.range?.mpgeElectric?.value, 50);

  // And a trim naming the grade correctly still lands on the same research —
  // the bare-nameplate `-alt` twin of the row, which carries the same facts.
  assert.equal(
    idOf(decode({ vin: "WP0AK2A70NL132073", model: "Panamera", modelYear: 2022, trim: "4S E-Hybrid" })),
    "panamera-4s-ehybrid-2021-23-alt"
  );
});

// ── The MY2026 filing artifact ───────────────────────────────────────────
test("vPIC dropping the word Turbo from its MY2026 pattern trim does not demote a Turbo E-Hybrid", () => {
  // vPIC decodes WP0AF2YA as Trim "Turbo E-Hybrid" for MY2025 and bare
  // "E-Hybrid" for MY2026 — same 670 hp, 8 cyl, 4.0 L engine either year,
  // against 463 hp / 6 cyl for the 4 E-Hybrid. The key is the VIN pattern,
  // not the string, so both years reach the Turbo row.
  for (const [vin, year] of [["WP0AF2YA7SL080121", 2025], ["WP0AF2YA2TL080075", 2026]] as const) {
    assert.equal(idOf(decode({ vin, model: "Panamera E-Hybrid", modelYear: year })), "panamera-turbo-ehybrid-2025-26", vin);
  }
  // The same artifact reads WP0AH2YA MY2026 as "S E-Hybrid" where MY2025
  // reads "Turbo S E-Hybrid" (771 hp both years). Porsche sells no
  // "Panamera S E-Hybrid", and this corpus holds no MY2025-26 Turbo S
  // E-Hybrid row at all — so these two live listings must match NOTHING
  // rather than borrow the Turbo's or the 4's figures, which is what they
  // were doing.
  for (const trim of [undefined, "Turbo S", "S E-Hybrid"]) {
    const r = matchEnrichment(decode({ vin: "WP0AH2YAXTL085020", model: "Panamera E-Hybrid", modelYear: 2026, trim }), null);
    assert.equal(r.exact, undefined, `trim "${trim}" → ${r.exact?.id}`);
    assert.equal(r.candidates?.length ?? 0, 0, `trim "${trim}" → candidates`);
  }
});

// ── The Executive rides the same rows ────────────────────────────────────
test("an Executive VIN reaches its grade's row, which EPA rates identically", () => {
  // Position 4 B is the long-wheelbase Executive. fueleconomy.gov rates it
  // separately through MY2020 (ids 40225/40226, 41291/41292, 42355/42356,
  // 40055/40056) and the two records match in every figure; from MY2022 EPA
  // folds them into one record.
  const cases: [string, number, string][] = [
    ["WP0BE2A7XJL160226", 2018, "panamera-4-ehybrid-2018"],
    ["WP0BE2A7XKL160499", 2019, "panamera-4-ehybrid-2019-20"],
    ["WP0BH2A77JL172213", 2018, "panamera-turbos-ehybrid-2018-20"],
    ["WP0BK2A79PL154015", 2023, "panamera-4s-ehybrid-2021-23"],
  ];
  for (const [vin, year, id] of cases) {
    assert.equal(idOf(decode({ vin, model: "Panamera E-Hybrid", modelYear: year })), id, vin);
  }
  // A trimless Executive 4S used to reach the plain 4 E-Hybrid row.
  const bk = matchEnrichment(decode({ vin: "WP0BK2A79PL154015", model: "Panamera E-Hybrid", modelYear: 2023 }), null);
  assert.equal(bk.exact?.range?.mpgeElectric?.value, 50);
});

// ── Petrol cannot reach a plug-in row ────────────────────────────────────
test("a petrol Panamera matches no plug-in row, with or without a trim", () => {
  // Every VIN here was decoded at vPIC: Gasoline, ElectrificationLevel
  // empty. A complete position-5 sweep of both families shows the petrol
  // letters (A, B, C, F, G, J) are disjoint from the keyed plug-in letters
  // (971: E, K, H; 972: E, C, F, H) — position 5 F is a petrol Turbo on the
  // 2A7 family and the plug-in Turbo E-Hybrid on 2YA, which is exactly why a
  // year window on its own was never enough.
  const petrol: [string, number, string][] = [
    ["WP0AF2A75NL100000", 2022, "Turbo S"],
    ["WP0AG2A79NL100000", 2022, "GTS"],
    ["WP0AJ2A77NL100000", 2022, "Panamera 4"],
    ["WP0AB2A78JL100000", 2018, "4S"],
    ["WP0AA2YA9TL100000", 2026, "Panamera 4"],
    ["WP0AG2YA0TL100000", 2026, "GTS"],
  ];
  for (const [vin, year, trim] of petrol) {
    for (const model of ["Panamera", "Panamera E-Hybrid"]) {
      for (const t of [undefined, trim, "4 E-Hybrid", "Turbo"]) {
        const r = matchEnrichment(decode({ vin, model, modelYear: year, trim: t }), null);
        assert.equal(r.exact, undefined, `${vin} ${model} "${t}" → ${r.exact?.id}`);
        assert.equal(r.candidates?.length ?? 0, 0, `${vin} ${model} "${t}" → candidates`);
      }
    }
  }
});

test("a trimless bare-nameplate Panamera still matches nothing", () => {
  // The `-alt` rows keep their trim guard: match.ts skips every VIN filter
  // for a listing carrying no VIN, so a trimless bare-"Panamera" row would
  // answer a petrol Panamera. tests/phev-bare-model-aliases.test.ts pins
  // that, and this pins the other half — the guard survived the VIN keying.
  const bare = { vin: "WP0AE2YA1TL031324", model: "Panamera", modelYear: 2026 };
  assert.equal(idOf(decode(bare)), undefined);
  assert.equal(idOf(decode({ ...bare, electrificationLevel: PHEV })), undefined);
  // Naming the grade opens the `-alt` row, and the VIN then has to agree.
  assert.equal(idOf(decode({ ...bare, trim: "4 E-Hybrid" })), "panamera-4-ehybrid-2026-alt");
  assert.equal(idOf(decode({ vin: "WP0AC2YA9TL050158", model: "Panamera", modelYear: 2026, trim: "4 E-Hybrid" })), undefined);
});

// ── The negative: outside the patterns, nothing ──────────────────────────
test("a VIN outside these patterns matches no Panamera row rather than the nearest one", () => {
  for (const [vin, year] of [
    ["WP0ZZ2A79PL120323", 2023],
    ["WP0ZZ2YA1TL031324", 2026],
  ] as const) {
    const r = matchEnrichment(decode({ vin, model: "Panamera E-Hybrid", modelYear: year, electrificationLevel: PHEV }), null);
    assert.equal(r.exact, undefined, `${vin} → ${r.exact?.id}`);
    assert.equal(r.candidates?.length ?? 0, 0, `${vin} → candidates`);
  }
  // The 970.2 Panamera S E-Hybrid is position 5 D on the same 2A7 family the
  // 971 uses — one family code across two generations — and this corpus has
  // no row for it. Five live MY2014-2016 listings; silence is the answer.
  for (const [vin, year, trim] of [
    ["WP0AD2A7XEL044674", 2014, "HB S E-Hybrid"],
    ["WP0AD2A71GL040063", 2016, "S"],
  ] as const) {
    for (const model of ["Panamera", "Panamera E-Hybrid"]) {
      const r = matchEnrichment(decode({ vin, model, modelYear: year, trim, electrificationLevel: PHEV }), null);
      assert.equal(r.exact, undefined, `${vin} ${model} → ${r.exact?.id}`);
      assert.equal(r.candidates?.length ?? 0, 0, `${vin} ${model} → candidates`);
    }
  }
  // And a 971 pattern must not answer for a 972 model year or the reverse:
  // AK (4S E-Hybrid) exists only on 2A7, AC only on 2YA.
  assert.equal(idOf(decode({ vin: "WP0AK2A75NL132196", model: "Panamera E-Hybrid", modelYear: 2026 })), undefined);
  assert.equal(idOf(decode({ vin: "WP0AC2YA6TL050148", model: "Panamera E-Hybrid", modelYear: 2022 })), undefined);
});
