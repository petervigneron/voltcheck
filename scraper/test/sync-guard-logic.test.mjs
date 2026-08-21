import { test } from "node:test";
import assert from "node:assert/strict";
import { THRESHOLDS, STABILITY_TOLERANCE, isStable, verdictFor, worstLevel } from "../lib/sync-guard-logic.mjs";

test("isStable tolerates ordinary drift but not a mid-write swing", () => {
  assert.equal(isStable(87082, 87050), true); // 32 rows of drift, well under tolerance
  assert.equal(isStable(87082, 58741), false); // the actual 2026-08-21 incident's swing
  assert.equal(isStable(0, 0), true);
});

test("verdictFor: no prior baseline never alarms", () => {
  assert.equal(verdictFor(null, 500, 0.08, 0.15).level, "ok");
  assert.equal(verdictFor(0, 500, 0.08, 0.15).level, "ok");
});

test("verdictFor: growth and small drops are ok", () => {
  assert.equal(verdictFor(1000, 1050, 0.08, 0.15).level, "ok"); // grew
  assert.equal(verdictFor(1000, 970, 0.08, 0.15).level, "ok"); // -3%, ordinary churn
});

test("verdictFor: global thresholds warn then fail as the drop deepens", () => {
  assert.equal(verdictFor(1000, 900, THRESHOLDS.globalWarnDrop, THRESHOLDS.globalFailDrop).level, "warn"); // -10%
  assert.equal(verdictFor(1000, 800, THRESHOLDS.globalWarnDrop, THRESHOLDS.globalFailDrop).level, "fail"); // -20%
});

test("verdictFor reproduces the actual 2026-08-21 incident as a global FAIL", () => {
  const v = verdictFor(87082, 58741, THRESHOLDS.globalWarnDrop, THRESHOLDS.globalFailDrop);
  assert.equal(v.level, "fail");
});

test("lane thresholds are looser than global (a single OEM brand outage warns, not fails, unless severe)", () => {
  // One mid-size brand's locator goes dark: lane drops 20% — worth a look, not a hard stop.
  assert.equal(verdictFor(40000, 32000, THRESHOLDS.laneWarnDrop, THRESHOLDS.laneFailDrop).level, "warn");
  // A whole lane craters (the historical dealer-lane 15,926 -> 0 event, bd8f662a -> 8981600).
  assert.equal(verdictFor(15926, 0, THRESHOLDS.laneWarnDrop, THRESHOLDS.laneFailDrop).level, "fail");
});

test("worstLevel picks fail over warn over ok", () => {
  assert.equal(worstLevel(["ok", "ok"]), "ok");
  assert.equal(worstLevel(["ok", "warn"]), "warn");
  assert.equal(worstLevel(["warn", "fail", "ok"]), "fail");
  assert.equal(worstLevel([]), "ok");
});
