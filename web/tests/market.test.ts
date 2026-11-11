// lib/market.ts: which cohorts become rows on /market, and when a change is
// allowed to be printed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { shapeMarket, type RawMarket } from "../lib/market";
import type { ModelHub } from "../lib/listings/modelHubs";

const hub = (make: string, model: string, keys: string[]): ModelHub => ({
  makeSlug: make.toLowerCase(),
  make,
  modelSlug: keys[0],
  model,
  keys,
});

const HUBS = [
  hub("Hyundai", "Ioniq 5", ["ioniq5"]),
  hub("Lexus", "NX 450h+", ["nx450h+", "nx450hplus"]),
  hub("Jeep", "Wrangler 4xe", ["wrangler4xe"]),
  hub("Jeep", "Wrangler", ["wrangler"]),
];

const raw = (models: RawMarket["models"]): RawMarket => ({
  asOf: "2026-11-08",
  site: [
    { d: "2026-08-15", i: 1, c: 9998 },
    { d: "2026-11-08", i: 0.9502, c: 65625 },
  ],
  models,
});

test("a cohort becomes a row only through a hub's own key", () => {
  const m = shapeMarket(
    raw([
      { cohort: "hyundai ioniq5", cars: 2049, ask: 26193, c30: 0.1, s30: 0.9, c60: -2.2, s60: 0.8 },
      // No hub carries this key: the Ioniq 5 N is a different car.
      { cohort: "hyundai ioniq5n", cars: 120, ask: 52000, c30: -1, s30: 1, c60: -2, s60: 1 },
    ]),
    HUBS,
  );
  assert.deepEqual(
    m.rows.map((r) => [r.model, r.cars, r.ask, r.change30, r.change60]),
    [["Ioniq 5", 2049, 26193, 0.1, -2.2]],
  );
});

test("the Wrangler and the Wrangler 4xe stay two rows, as they are two hubs", () => {
  const m = shapeMarket(
    raw([
      { cohort: "jeep wrangler4xe", cars: 3986, ask: 26952, c30: -2.8, s30: 0.9, c60: -6.6, s60: 0.9 },
      { cohort: "jeep wrangler", cars: 2140, ask: 27139, c30: -2.9, s30: 0.9, c60: -7.3, s60: 0.9 },
    ]),
    HUBS,
  );
  assert.deepEqual(m.rows.map((r) => r.model), ["Wrangler 4xe", "Wrangler"]);
});

test("two spellings of one hub pool by the cars behind each", () => {
  const m = shapeMarket(
    raw([
      { cohort: "lexus nx450h+", cars: 300, ask: 40000, c30: -2, s30: 1, c60: -4, s60: 1 },
      { cohort: "lexus nx450hplus", cars: 100, ask: 44000, c30: -6, s30: 1, c60: null, s60: 0 },
    ]),
    HUBS,
  );
  const [r] = m.rows;
  assert.equal(r.cars, 400);
  assert.equal(r.ask, 41000);
  assert.equal(r.change30, -3);
  // 60 days: only the 300-car spelling stood, and it is 75% of the hub.
  assert.equal(r.change60, -4);
});

test("a change read from under half the model's cars is not printed", () => {
  const m = shapeMarket(
    raw([{ cohort: "hyundai ioniq5", cars: 1000, ask: 26000, c30: -18.7, s30: 0.3, c60: -9, s60: 0.5 }]),
    HUBS,
  );
  assert.equal(m.rows[0].change30, null);
  assert.equal(m.rows[0].change60, -9);
});

test("junk rows and junk index points are dropped, not shown as zero", () => {
  const m = shapeMarket(
    {
      asOf: "2026-11-08",
      site: [
        { d: "2026-08-15", i: 1, c: 10 },
        { d: "2026-08-16", i: 0, c: 10 },
      ],
      models: [{ cohort: "hyundai ioniq5", cars: 0, ask: 0, c30: null, s30: null, c60: null, s60: null }],
    },
    HUBS,
  );
  assert.equal(m.rows.length, 0);
  assert.equal(m.site.length, 1);
});
