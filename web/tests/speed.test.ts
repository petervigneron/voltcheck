// lib/listings/speed.ts: which rows become a model's selling-speed figure,
// and when one may be printed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { shapeSpeed, SPEED_MIN, type RawSpeedRow } from "../lib/listings/speed";
import type { ModelHub } from "../lib/listings/modelHubs";

const hub = (make: string, model: string, keys: string[]): ModelHub => ({
  makeSlug: make.toLowerCase(),
  make,
  modelSlug: keys[0],
  model,
  keys,
});
const HUBS = [hub("Tesla", "Model 3", ["model3"]), hub("Lexus", "NX 450h+", ["nx450h+", "nx450hplus"]), hub("Hyundai", "Ioniq 5", ["ioniq5"])];
const row = (make: string, model: string, listed: number, gone: number): RawSpeedRow => ({
  make,
  model,
  listed,
  gone,
  window_from: "2026-09-05",
  window_to: "2026-10-04",
});

test("a model's figure is its share no longer listed, with the cars and the window it rests on", () => {
  const s = shapeSpeed([row("tesla", "Model 3", 3074, 1998)], HUBS).get("/ev/tesla/model3");
  assert.deepEqual(s, { listed: 3074, pct: 65, from: "2026-09-05", to: "2026-10-04" });
});

test("spellings that are one hub are added before dividing", () => {
  const s = shapeSpeed([row("lexus", "NX 450h+", 80, 40), row("lexus", "NX 450h Plus", 40, 8)], HUBS).get("/ev/lexus/nx450h+");
  assert.equal(s?.listed, 120);
  assert.equal(s?.pct, 40);
});

test("a spelling no hub claims is dropped, not folded into a neighbour", () => {
  // The Ioniq 5 N is a different car and no hub here carries its key.
  const m = shapeSpeed([row("hyundai", "Ioniq 5", 200, 120), row("hyundai", "Ioniq 5 N", 300, 30)], HUBS);
  assert.equal(m.get("/ev/hyundai/ioniq5")?.listed, 200);
  assert.equal(m.size, 1);
});

test("under the floor there is no figure at all", () => {
  assert.equal(shapeSpeed([row("tesla", "Model 3", SPEED_MIN - 1, 50)], HUBS).size, 0);
  assert.equal(shapeSpeed([row("tesla", "Model 3", SPEED_MIN, 50)], HUBS).size, 1);
});

test("rows that cannot be a count are ignored, and nothing is an empty answer", () => {
  assert.equal(shapeSpeed(null).size, 0);
  const bad = [
    row("tesla", "Model 3", 200, 250),
    row("tesla", "Model 3", -5, 0),
    { ...row("tesla", "Model 3", 200, 100), window_from: "soon" },
  ];
  assert.equal(shapeSpeed(bad, HUBS).size, 0);
});
