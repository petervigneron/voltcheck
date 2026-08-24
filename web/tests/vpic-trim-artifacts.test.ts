// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/vpic-trim-artifacts.test.ts
//
// Toyota filed ONE Part 565 pattern covering every grade of the 2026 RAV4
// PHEV, so vPIC decodes Trim "GR Sport" (Series "64 Series") for every VIN —
// verified 2026-08-24 against live cars whose selling dealers name the real
// grade: JTM7ERAV4TJ020569 sold as SE, JTM7ERAV4TD011420 as Woodland,
// JTM7ERAV6TJ021402 as XSE. Left alone, the /vin/ page would resolve an SE
// VIN exact to the GR Sport row and print 48 mi and "no DC fast charging" on
// a car that is really 52 mi and (XSE/Woodland) DC-capable.
//
// The mechanism under test is VPIC_PATTERN_TRIM_ARTIFACTS in
// lib/enrichment/match.ts: a vPIC-provenance trim matching a verified
// artifact string picks nothing, and the cohort's grade rows come back as
// candidates instead. The same string in a DEALER FEED names a specific car
// and must keep resolving exact — trims only lose their weight on the
// surface where they were proven meaningless.
import test from "node:test";
import assert from "node:assert/strict";
import { matchEnrichment, vpicTrimIsPatternArtifact } from "@/lib/enrichment/match";
import type { VinDecode } from "@/lib/types";

const decode = (d: Partial<VinDecode>): VinDecode => ({ vin: "X".repeat(17), usMarket: true, ...d });

// What lib/vpic.ts actually builds for a 2026 RAV4 PHEV VIN, whatever the
// car's real grade (strings from a live decode, 2026-08-24).
const rav4Vpic = (over: Partial<VinDecode> = {}) =>
  decode({
    vin: "JTM7ERAV4TJ020569",
    make: "TOYOTA",
    model: "RAV4 Prime (PHEV)",
    modelYear: 2026,
    trim: "GR Sport",
    series: "64 Series",
    trimFromVpic: true,
    driveType: "AWD/All-Wheel Drive",
    ...over,
  });

test("a vPIC decode of ANY 2026 RAV4 PHEV must not resolve exact to the GR Sport row", () => {
  const r = matchEnrichment(rav4Vpic(), null);
  assert.equal(r.exact, undefined, "the artifact trim must not pick a row");
  const ids = (r.candidates ?? []).map((c) => c.id).sort();
  assert.deepEqual(ids, ["rav4-phev-2026-gr-sport", "rav4-phev-2026-se", "rav4-phev-2026-woodland", "rav4-phev-2026-xse"]);
  // The exact wrong claims the artifact would have printed on an SE: the
  // 52-mile figure must be on the table, and the label row must not be.
  assert.ok(r.candidates!.some((c) => c.range?.epaRangeMi?.value === 52));
  assert.ok(!ids.includes("rav4-phev-2026-64-series"), "the 64 Series label is not a version the car could be");
  assert.match(r.discriminator ?? "", /window sticker/i);
});

test("the same string from a dealer feed keeps its full weight (feed lane untouched)", () => {
  // decodeFromListing never sets trimFromVpic — a dealer writing "GR SPORT"
  // is a claim about one specific car.
  const feed = (trim: string) =>
    matchEnrichment(decode({ vin: "JTM7ERAV0TD017280", make: "TOYOTA", model: "RAV4 Plug-in Hybrid", modelYear: 2026, trim }), null);
  assert.equal(feed("GR SPORT").exact?.id, "rav4-phev-2026-gr-sport");
  assert.equal(feed("XSE").exact?.id, "rav4-phev-2026-xse");
  assert.equal(feed("64 Series").exact?.id, "rav4-phev-2026-64-series", "the feed-label row still catches its label");
});

test("a corrected vPIC decode is honoured — the table keys on the artifact string, not the cohort", () => {
  // If NHTSA's data is ever fixed and an XSE VIN starts decoding "XSE", that
  // decode never hits the table and resolves normally.
  const r = matchEnrichment(rav4Vpic({ vin: "JTM7ERAV6TJ021402", trim: "XSE" }), null);
  assert.equal(r.exact?.id, "rav4-phev-2026-xse");
});

test("a distrusted FEED trim's candidate span also excludes the label row", () => {
  // The other lane that spans versions with row trims ignored
  // (matchWithoutTrustedTrim): a 2026 RAV4 whose "GR SPORT" is contradicted
  // by its own description falls to the four grade rows, never to the
  // "64 Series" label beside them.
  const r = matchEnrichment(
    decode({ vin: "JTM7ERAV0TD017280", make: "TOYOTA", model: "RAV4 Plug-in Hybrid", modelYear: 2026, trim: "GR SPORT", trimUntrusted: true }),
    null
  );
  assert.equal(r.exact, undefined);
  const ids = (r.candidates ?? []).map((c) => c.id);
  assert.equal(ids.length, 4);
  assert.ok(!ids.includes("rav4-phev-2026-64-series"));
});

test("the 2021–25 RAV4 Prime is out of scope — its filing names real grades", () => {
  // JTMAB3FV0RD181089, a 2024 sold as SE, decodes Trim "SE", Series
  // "50 Series" — per-grade patterns, so the artifact entry is year-scoped
  // to the 64 Series generation and the old car resolves as before.
  const d = rav4Vpic({ vin: "JTMAB3FV0RD181089", modelYear: 2024, trim: "SE", series: "50 Series" });
  assert.equal(vpicTrimIsPatternArtifact(d), false);
  assert.equal(matchEnrichment(d, null).exact?.id, "rav4-prime-2021-25");
});

// ── Lexus NX 450h+, the sibling with the same 2026 filing shape ────────────
//
// The JTJHKCFZ pattern decodes "450h+ Luxury" on cars sold as Premium
// (JTJHKCFZ1T2104331) and Premium Plus (JTJHKCFZ1T2098854) — grades 2026
// added. The NX facts are grade-invariant (one row per year), so the stake
// here is the printed trim, not the enrichment; the row must still resolve.

const nxVpic = (over: Partial<VinDecode> = {}) =>
  decode({ vin: "JTJHKCFZ1T2098854", make: "LEXUS", model: "NX", modelYear: 2026, trim: "450h+ Luxury", series: "26 Series", trimFromVpic: true, ...over });

test("2026 NX 450h+: the artifact 'Luxury' label is flagged, and the row still resolves without it", () => {
  const d = nxVpic();
  assert.equal(vpicTrimIsPatternArtifact(d), true, "the /vin/ page must not print 'Luxury' on a Premium Plus car");
  // One row per year and its facts hold for every grade, so spanning the
  // cohort collapses right back to it — an exact, reached without the trim.
  assert.equal(matchEnrichment(d, null).exact?.id, "nx-450h-plus-2026-alt");
});

test("2026 NX F Sport pattern still names its grade truly and stays honoured", () => {
  // JTJKKCFZ9T2077871, sold as an F Sport, decodes "450h+ F Sport Handling".
  const d = nxVpic({ vin: "JTJKKCFZ9T2077871", trim: "450h+ F Sport Handling" });
  assert.equal(vpicTrimIsPatternArtifact(d), false);
  assert.equal(matchEnrichment(d, null).exact?.id, "nx-450h-plus-2026-alt");
});

test("2022–25 NX decodes are out of scope — Luxury and F Sport each had their own pattern", () => {
  const d = nxVpic({ vin: "JTJHKCFZ0S2044363", modelYear: 2025 });
  assert.equal(vpicTrimIsPatternArtifact(d), false);
  assert.equal(matchEnrichment(d, null).exact?.id, "nx-450h-plus-2022-25-alt");
});
