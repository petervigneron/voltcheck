// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/niro-first-gen-vin8.test.ts
//
// A 2018 Niro HYBRID typed into /vin/ was handed the Niro plug-in's battery,
// 26 electric miles and J1772 inlet. The bare-"Niro" -alt row is guarded by
// the trim token "PHEV", and vPIC answers the MY2018 grade-C pattern with one
// trim string for two powertrains: "EX Premium (PHEV), Graphite Edition (HEV)".
// The hybrid carries the plug-in's token in its own decode, so the trim guard
// cannot keep it out — only VIN position 8 can (C hybrid, D plug-in).
//
// Every decode below is vPIC's own answer for a real car, fetched through
// DecodeVINValuesBatch on 2026-09-10: the hybrids are auction and history-
// report listings, the plug-ins are live Voltcheck listings. The /vin/ gate
// (tests/vin-page-ev-gate.test.ts) would also refuse the hybrids on their
// "Strong HEV" reading; the listing-shape test below pins the VIN key on its
// own, so neither guard is load-bearing for the other.
import test from "node:test";
import assert from "node:assert/strict";
import { matchEnrichment } from "@/lib/enrichment/match";
import type { VinDecode } from "@/lib/types";

const MIXED = "EX Premium (PHEV), Graphite Edition (HEV)";
const HYBRIDS = ["KNDCC3LC1J5160937", "KNDCC3LC2J5112038", "KNDCC3LC3J5128653", "KNDCC3LCXJ5133428", "KNDCC3LC2J5146237"];
const vpic = (vin: string, trim: string, electrificationLevel: string, modelYear = 2018): VinDecode => ({
  vin,
  usMarket: true,
  make: "KIA",
  model: "Niro",
  modelYear,
  trim,
  trimFromVpic: true,
  electrificationLevel,
});
const listing = (vin: string, model: string, trim: string | undefined, modelYear: number): VinDecode => ({
  vin,
  usMarket: true,
  make: "KIA",
  model,
  modelYear,
  trim,
});
const PHEV = "PHEV (Plug-in Hybrid Electric Vehicle)";

test("a real 2018 Niro hybrid decoding the shared grade-C trim matches nothing", () => {
  for (const vin of HYBRIDS) {
    const r = matchEnrichment(vpic(vin, MIXED, "Strong HEV (Hybrid Electric Vehicle)"), null);
    assert.equal(r.exact, undefined, vin);
    assert.equal(r.candidates, undefined, vin);
  }
});

test("the VIN key alone keeps a hybrid VIN off the plug-in row, with no gate in play", () => {
  // A listing-shaped decode: no trimFromVpic, no electrification reading, so
  // only position 8 stands between this hybrid VIN and the plug-in's facts.
  for (const vin of HYBRIDS) {
    const r = matchEnrichment(listing(vin, "Niro", MIXED, 2018), null);
    assert.equal(r.exact, undefined, vin);
    assert.equal(r.candidates, undefined, vin);
  }
});

test("the plug-in wearing the same trim string still resolves, on position 8 alone", () => {
  // KNDCC3LD4J5144563 is a live 2018 EX Premium plug-in; vPIC gives it the
  // identical mixed string, so nothing but position 8 separates it from the
  // hybrids above.
  assert.equal(matchEnrichment(vpic("KNDCC3LD4J5144563", MIXED, PHEV), null).exact?.id, "niro-phev-2018-22-alt");
  assert.equal(matchEnrichment(vpic("KNDCM3LD2J5140038", "LX (PHEV)", PHEV), null).exact?.id, "niro-phev-2018-22-alt");
  assert.equal(matchEnrichment(vpic("KNDCD3LD2K5281581", "EX (PHEV)", PHEV, 2019), null).exact?.id, "niro-phev-2018-22-alt");
});

test("the feed's own Niro plug-in shapes keep their row", () => {
  // The live listing KNDCM3LD2J5140038 arrives as model "Niro", trim "LX Phev".
  assert.equal(matchEnrichment(listing("KNDCM3LD2J5140038", "Niro", "LX Phev", 2018), null).exact?.id, "niro-phev-2018-22-alt");
  assert.equal(matchEnrichment(listing("KNDCM3LD7N5496183", "Niro", "LXS Phev", 2022), null).exact?.id, "niro-phev-2018-22-alt");
  assert.equal(matchEnrichment(listing("KNDCC3LD6N5539172", "Niro Plug-In Hybrid", "EX Premium", 2022), null).exact?.id, "niro-phev-2018-22");
  // A listing whose id is not a VIN skips every VIN filter, as before.
  assert.equal(matchEnrichment(listing("NIRO-PHEV-18", "Niro", "LX Phev", 2018), null).exact?.id, "niro-phev-2018-22-alt");
});
