import { test } from "node:test";
import assert from "node:assert/strict";
import { fuelTextOnly, classifyEv, EV_ONLY_WMIS, EV_MODEL_RE } from "../lib/ev.mjs";

// These cover the gap that put 308 non-EVs on the live site on 2026-08-22:
// ingest could not distinguish "vPIC agreed this is electric" from "vPIC was
// never asked", because both arrive as evConfidence "high". The predicate
// below is what ingest.mjs and vpic-enrich.mjs now share, so a disagreement
// between them fails here rather than in production.

test("a dealer's fuel-type text alone is never a vouched classification", () => {
  // A real one: 1C6SRFBT2PN665088, a petrol Ram 1500 Big Horn that reached the
  // site because its dealer page declared fuelType "Electric".
  const ram = { vin: "1C6SRFBT2PN665088", make: "Ram", model: "1500", trim: "Big Horn 4x4 Quad Cab", evConfidence: "high" };
  assert.equal(fuelTextOnly(ram), true);
});

test("an EV-only WMI vouches without vPIC", () => {
  const tesla = { vin: "5YJ3E1EA7KF000000", make: "Tesla", model: "Model 3", evConfidence: "high" };
  assert.ok(EV_ONLY_WMIS.has("5YJ"));
  assert.equal(fuelTextOnly(tesla), false);
});

test("a known EV nameplate vouches without vPIC", () => {
  const lyriq = { vin: "1GYKPRRL0PZ000000", make: "Cadillac", model: "Lyriq", evConfidence: "high" };
  assert.ok(EV_MODEL_RE.test("Lyriq"));
  assert.equal(fuelTextOnly(lyriq), false);
});

test("a vPIC-promoted classification is not fuel-text-only", () => {
  const promoted = { vin: "JN1AZ0CP0MM000000", make: "Nissan", model: "Ariya", evConfidence: "high", evConfidenceSource: "vpic" };
  assert.equal(fuelTextOnly(promoted), false);
});

// The intake gate itself, as ingest.mjs applies it. Kept as a local mirror
// rather than importing ingest.mjs, which reads files and writes at module
// scope; if the two ever diverge the tests above catch the predicate half and
// this documents the other half.
const admits = (r) => r.evConfidence === "high" && (!fuelTextOnly(r) || r.evVpicAsked === true);

test("a fuel-text-only listing vPIC was never asked about is held, not published", () => {
  const unasked = { vin: "1C6SRFBT2PN665088", make: "Ram", model: "1500", evConfidence: "high" };
  assert.equal(admits(unasked), false);
});

test("a fuel-text-only listing vPIC answered — even blankly — is published", () => {
  // Every hydrogen fuel-cell car in the feed decodes to a row vPIC cannot
  // classify as electric or refute. 42 live listings sit in that state
  // permanently, so "answered" has to be the bar, not "answered usefully" —
  // otherwise the gate quietly deletes the Mirai, the NEXO and the CR-V eFCEV.
  const mirai = { vin: "JTDBVRBD0MA000000", make: "Toyota", model: "Mirai", evConfidence: "high", evVpicAsked: true };
  assert.equal(admits(mirai), true);
});

test("a listing vPIC refuted never reaches ingest at all", () => {
  const refuted = { vin: "JTDKN3DU9F1987600", make: "Toyota", model: "Prius", evConfidence: "vpic_refuted", evVpicAsked: true };
  assert.equal(admits(refuted), false);
});

test("the MY2026 Toyota bZ (renamed bZ4X) name-matches as a BEV candidate", () => {
  // EchoPark 2026-08-23: seven 2026 "Toyota bZ" fell through because only
  // "bz4x" was known. The rename is Toyota's, not a new car.
  assert.deepEqual(classifyEv({ name: "2026 Toyota bZ XLE" }), { isEv: true, kind: "BEV?", confidence: "name_match" });
  assert.deepEqual(classifyEv({ name: "2026 Toyota bZ Woodland" }), { isEv: true, kind: "BEV?", confidence: "name_match" });
  // The token needs the make word in front, so stray "BZ" letters elsewhere
  // stay unmatched.
  assert.equal(classifyEv({ name: "2021 Mercedes-Benz GLE 350 BZ Edition" }).isEv, false);
});

test("a petrol Grand Wagoneer Series III is not the Wagoneer S", () => {
  // AutoFunds lane build 2026-08-23: unanchored "wagoneer s" matched inside
  // "Series III". The BEV keeps matching; the petrol trucks do not.
  assert.deepEqual(classifyEv({ name: "2025 Jeep Wagoneer S Limited" }), { isEv: true, kind: "BEV?", confidence: "name_match" });
  assert.equal(classifyEv({ name: "2023 Jeep Grand Wagoneer Series III" }).isEv, false);
  assert.equal(classifyEv({ name: "2024 Jeep Wagoneer Series II" }).isEv, false);
});

test("a fuel field saying bare BEV is an explicit electric claim", () => {
  // motorcarsites prints fuelType "BEV"; a Cybertruck needed its WMI to land.
  assert.deepEqual(classifyEv({ fuelType: "BEV" }), { isEv: true, kind: "BEV", confidence: "high" });
  // Fuel-text-only rows still go through the vPIC gate downstream, same as "Electric".
  assert.equal(classifyEv({ fuelType: "Beverage" }).isEv, false);
});

test("classifyEv still refuses a plain gas/electric hybrid and admits a plug-in", () => {
  assert.equal(classifyEv({ fuelType: "Gas/Electric Hybrid", vehicleIdentificationNumber: "1HGCV3F17KA015397" }).isEv, false);
  const phev = classifyEv({ fuelType: "Plug-in Gas/Electric Hybrid", vehicleIdentificationNumber: "5YM23CS01P9S34188" });
  assert.equal(phev.isEv, true);
  assert.equal(phev.kind, "PHEV");
});
