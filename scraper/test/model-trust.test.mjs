import { test } from "node:test";
import assert from "node:assert/strict";
import { isHeadlineModel, untrustedModel } from "../lib/model-trust.mjs";

test("a model with the car's own year in it is the headline, not a nameplate", () => {
  // ultimatems.com, 2026-09-09: the platform's VDP JSON-LD.
  assert.equal(isHeadlineModel("VISTIQ 2026 Luxury AWD NAV PANO SUPERCRUISE 6PASS 1K Mi", 2026), true);
  assert.equal(isHeadlineModel("Ariya 2023 Engage+ e4ORCE AWD NAV PROPILOT CRUISE 21K Mi", 2023), true);
  assert.equal(isHeadlineModel("LYRIQ 2024 Tech CARPLAY PANO ADAPT 15K MLS!!", "2024"), true);
  // The year is a whole token, not a substring of a bigger number.
  assert.equal(isHeadlineModel("Model 3", 2024), false);
  assert.equal(isHeadlineModel("F-150 Lightning", 2023), false);
  assert.equal(isHeadlineModel("EQE 350+", 2023), false);
  assert.equal(isHeadlineModel("Bolt EV 2023", 2023), true);
  assert.equal(isHeadlineModel("120240", 2024), false);
  // No year to compare against: nothing to say.
  assert.equal(isHeadlineModel("VISTIQ 2026 Luxury", undefined), false);
  assert.equal(isHeadlineModel("", 2026), false);
});

test("untrustedModel: none, the dropdown placeholder, or the headline", () => {
  assert.equal(untrustedModel({ model: undefined, year: 2026 }), true);
  assert.equal(untrustedModel({ model: "  ", year: 2026 }), true);
  assert.equal(untrustedModel({ model: "Other", year: 2024 }), true);
  assert.equal(untrustedModel({ model: "OTHER", year: 2024 }), true);
  assert.equal(untrustedModel({ model: "VISTIQ 2026 Luxury AWD", year: 2026 }), true);
  assert.equal(untrustedModel({ model: "Vistiq", year: 2026 }), false);
  assert.equal(untrustedModel({ model: "Equinox EV", year: 2025 }), false);
  // A different year in the string is somebody else's problem, not this tell's.
  assert.equal(untrustedModel({ model: "Bolt EV 2023", year: 2022 }), false);
  assert.equal(untrustedModel(undefined), true);
});
