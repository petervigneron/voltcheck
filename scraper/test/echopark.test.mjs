import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyItem } from "../lib/oem/echopark.mjs";

// EchoPark's SRP publishes no fuel type and its VDPs are Akamai-403, so the
// only evidence this lane has for "is it an EV" is the VIN and the
// year/make/model/trim strings. classifyItem is the whole of that judgement,
// and the seam rule inside it is the one non-obvious decision in the module —
// these are the live rows from the 2026-08-23 sweep that shaped it.

const item = (make, model, trim, vin = "1N4AZ1CP7JC303215") => ({ year: 2024, make, model, trim, vin });

test("a nameplate in the model is kept", () => {
  const c = classifyItem(item("Hyundai", "IONIQ 5", "SEL"));
  assert.equal(c.isEv, true);
  assert.equal(c.confidence, "name_match");
});

test("a nameplate that lives only in the trim is kept — Lexus files the RZ as model 'RZ'", () => {
  assert.equal(classifyItem(item("Lexus", "RZ", "RZ 450e Premium")).isEv, true);
  assert.equal(classifyItem(item("MINI", "Hardtop 2 Door", "Cooper SE")).isEv, true);
});

test("a match that only appears across the model/trim join is rejected and counted", () => {
  // "Grand Wagoneer" + "Series II" reads as Jeep's BEV "Wagoneer S" once the
  // two fields are concatenated. Four petrol Wagoneers on the live lot.
  const c = classifyItem(item("Jeep", "Grand Wagoneer", "Series II"));
  assert.equal(c.isEv, false);
  assert.equal(c.seamOnly, true);
});

test("a real Wagoneer S would still be kept — the nameplate is the model", () => {
  assert.equal(classifyItem(item("Jeep", "Wagoneer S", "Launch Edition")).isEv, true);
});

test("an EV-only WMI settles it at high confidence with no name to go on", () => {
  const c = classifyItem(item("Tesla", "Model 3", "Performance", "5YJ3E1ET6SF028414"));
  assert.equal(c.isEv, true);
  assert.equal(c.confidence, "high");
  assert.equal(c.kind, "BEV");
});

test("a petrol car off the same page is not an EV, and is not a seam rejection either", () => {
  const c = classifyItem(item("Chevrolet", "Colorado", "4WD Z71", "1GCGTDEN8L1106597"));
  assert.equal(c.isEv, false);
  assert.ok(!c.seamOnly);
});
