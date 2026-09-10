// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/toyota-rav4-phev-2026.test.ts
//
// The 2026 RAV4 Plug-In Hybrid rows (lib/enrichment/data6.ts) are keyed on
// the GRADE, not on the VIN, because the VIN cannot key them: all 4,394 live
// 2026 VINs read JTM7ERAV through position 8 — the whole WMI and VDS — so
// there is no position that separates SE from XSE from Woodland from GR
// SPORT. What has to hold instead is that each grade string lands on its own
// row, that the two grades whose names contain one another do not swap, that
// a listing with NO grade lands on the base row (321 live cars, the gap this
// research closed) and is told nothing that varies, and that the base row
// never presents itself as a fifth version of the car.

import test from "node:test";
import assert from "node:assert/strict";
import { matchEnrichment, matchIgnoringTrim } from "@/lib/enrichment/match";
import type { VinDecode } from "@/lib/types";

// A real live VIN shape; every 2026 RAV4 PHEV shares positions 1-8.
const VIN = "JTM7ERAV0TJ000001";
const decode = (over: Partial<VinDecode>): VinDecode => ({
  vin: VIN,
  usMarket: true,
  make: "TOYOTA",
  model: "RAV4 Plug-in Hybrid",
  modelYear: 2026,
  driveType: "AWD",
  ...over,
});

test("each grade string resolves to its own row, with the range and charging hardware Toyota publishes for it", () => {
  // [feed trim, row id, mi (Toyota's own figure, the lower of its two), port, onboard kW, DC]
  const cases: [string, string, number, string, number, string][] = [
    ["SE", "rav4-phev-2026-se", 52, "J1772", 7, "none"],
    ["XSE", "rav4-phev-2026-xse", 52, "CCS1", 11, "standard"],
    ["Woodland", "rav4-phev-2026-woodland", 49, "CCS1", 11, "standard"],
    ["GR Sport", "rav4-phev-2026-gr-sport", 48, "J1772", 7, "none"],
  ];
  for (const [trim, id, mi, port, kw, dc] of cases) {
    const r = matchEnrichment(decode({ trim }), null);
    assert.equal(r.exact?.id, id, `trim "${trim}" → ${r.exact?.id ?? "no exact"}`);
    // Toyota's own estimate, never EPA's: fueleconomy.gov has rated no 2026
    // RAV4 PHEV, so the figure lives in mfrRangeMi and renders as an estimate.
    assert.equal(r.exact?.range?.mfrRangeMi?.value, mi);
    assert.equal(r.exact?.range?.epaRangeMi, undefined);
    assert.equal(r.exact?.charging?.portStandard?.value, port);
    assert.equal(r.exact?.charging?.acOnboardKw?.value, kw);
    assert.equal(r.exact?.charging?.dcFastCharging?.value, dc);
  }
});

test("SE does not swallow XSE", () => {
  // norm("SE") is two characters, so trimStringsOverlap demands equality and
  // the substring "SE" inside "XSE" cannot claim it. Pinned because the
  // grades differ by the whole charging group, not by a rounding.
  assert.equal(matchEnrichment(decode({ trim: "XSE" }), null).exact?.id, "rav4-phev-2026-xse");
  assert.equal(matchEnrichment(decode({ trim: "SE" }), null).exact?.id, "rav4-phev-2026-se");
});

test("a grade string with a dealer's suffix still lands on its grade", () => {
  // "XSE Natl" is live in the feed on two cars.
  assert.equal(matchEnrichment(decode({ trim: "XSE Natl" }), null).exact?.id, "rav4-phev-2026-xse");
});

test("a listing with no grade lands on the base row and is told nothing that varies by grade", () => {
  const r = matchEnrichment(decode({ trim: undefined }), null);
  assert.equal(r.exact?.id, "rav4-phev-2026-base");
  // The three things every grade shares.
  assert.equal(r.exact?.warranty?.batteryYears?.value, 10);
  assert.equal(r.exact?.warranty?.batteryMiles?.value, 150_000);
  assert.equal(r.exact?.warranty?.batteryTransfers?.value, true);
  // The three that do not, each declared rather than merely absent.
  assert.equal(r.exact?.range?.mfrRangeMi, undefined);
  assert.equal(r.exact?.range?.epaRangeMi, undefined);
  assert.equal(r.exact?.charging?.portStandard, undefined);
  assert.equal(r.exact?.battery?.packUsableKwh, undefined);
  for (const key of ["epaRangeMi", "portStandard", "packUsableKwh", "heatPump"] as const) {
    assert.ok((r.exact?.abstains?.[key] ?? "").split(/\s+/).length >= 5, `${key} needs a reason`);
  }
});

test("the vPIC generation label keeps its own row and never takes the base row's silence", () => {
  // 97 live cars carry trim "64 Series" — vPIC's generation code in a dealer
  // trim field. The early exact-trim pass must still hand them the label row.
  assert.equal(matchEnrichment(decode({ trim: "64 Series" }), null).exact?.id, "rav4-phev-2026-64-series");
});

test("the /vin/ span shows the four real grades and neither the base row nor the label row", () => {
  // Every 2026 VIN decodes vPIC Trim "GR Sport" (a single-pattern filing), so
  // matchEnrichment routes this cohort through matchIgnoringTrim. What that
  // path must present is the versions the car could be — four grades — not
  // the two rows that exist to absorb a listing that names none.
  const span = matchIgnoringTrim(decode({ trim: undefined }), null);
  assert.deepEqual(
    (span.candidates ?? []).map((c) => c.id).sort(),
    ["rav4-phev-2026-gr-sport", "rav4-phev-2026-se", "rav4-phev-2026-woodland", "rav4-phev-2026-xse"]
  );
});

test("a 2025 RAV4 PHEV is untouched by these rows", () => {
  // The previous generation keeps its own row and its real EPA rating; the
  // 2026 rows' year gate is what keeps them apart.
  const r = matchEnrichment(decode({ modelYear: 2025, model: "RAV4 Prime", trim: "SE", vin: "JTMEB3FV0ND000001" }), null);
  assert.equal(r.exact?.id, "rav4-prime-2021-25");
  assert.equal(r.exact?.range?.epaRangeMi?.value, 42);
});
