// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/filters-body-kind.test.ts
//
// Owner, 2026-09-07: "Users should be able to select multiple vehicle styles
// at once" and "There should be EV and PHEV filters." The body filter ORs a
// comma-list the way drive does, the kind filter reads the card's own BEV/PHEV
// answer, and both admit only cars we can classify — an unknown is neither.

import test from "node:test";
import assert from "node:assert/strict";
import { buildTests, QUICK_KNOWS } from "@/lib/listings/match";
import { describeFilter, toggleValue } from "@/lib/filters";
import { packIndex, unpackIndex } from "@/lib/listings/pack";
import type { CardRow } from "@/lib/listings/card";

const row = (over: Partial<CardRow>): CardRow => ({
  id: over.id ?? "x",
  hay: "2024 make model",
  year: 2024,
  make: "Make",
  model: "Model",
  title: "2024 Make Model",
  priceUsd: 30000,
  realPrice: true,
  tiles: [],
  ...over,
});

const suv = row({ id: "suv", body: "suv", kind: "BEV" });
const truck = row({ id: "truck", body: "truck", kind: "BEV" });
const sedan = row({ id: "sedan", body: "sedan", kind: "PHEV" });
const unknown = row({ id: "unknown" });

const get = (params: Record<string, string>) => (k: string) => params[k] ?? "";

test("body: several styles OR, one style is the one-element case, unknown bodies sit it out", () => {
  const both = buildTests(get({ body: "suv,truck" })).body!;
  assert.equal(both(suv), true);
  assert.equal(both(truck), true);
  assert.equal(both(sedan), false);
  assert.equal(both(unknown), false);
  const one = buildTests(get({ body: "suv" })).body!;
  assert.equal(one(suv), true);
  assert.equal(one(truck), false);
  assert.equal(buildTests(get({})).body, undefined);
});

test("kind: EV or PHEV, from the card's own answer; unknown is neither", () => {
  const bev = buildTests(get({ kind: "bev" })).kind!;
  assert.equal(bev(suv), true);
  assert.equal(bev(sedan), false);
  assert.equal(bev(unknown), false);
  const phev = buildTests(get({ kind: "phev" })).kind!;
  assert.equal(phev(sedan), true);
  assert.equal(phev(suv), false);
  assert.equal(phev(unknown), false);
  // Case-insensitive on the URL, and a value that is neither is no filter.
  assert.equal(buildTests(get({ kind: "PHEV" })).kind!(sedan), true);
  assert.equal(buildTests(get({ kind: "hybrid" })).kind, undefined);
  // The rail's "can this row be judged" denominator knows the axis.
  assert.equal(QUICK_KNOWS.kind!(suv), true);
  assert.equal(QUICK_KNOWS.kind!(unknown), false);
});

test("chips: a body list reads as an OR of labels, a kind as its label, and the rail toggles a value in the list", () => {
  assert.equal(describeFilter("body", "suv,truck"), "SUVs or Trucks");
  assert.equal(describeFilter("body", "suv"), "SUVs");
  assert.equal(describeFilter("body", "blimp"), null);
  assert.equal(describeFilter("kind", "bev"), "EV");
  assert.equal(describeFilter("kind", "phev"), "PHEV");
  assert.equal(describeFilter("kind", "hybrid"), null);
  // Pressing SUVs on the rail under ?body=truck adds it; pressing again removes only it.
  assert.equal(toggleValue("truck", "suv"), "truck,suv");
  assert.equal(toggleValue("truck,suv", "suv"), "truck");
});

test("pack: kind survives the wire round trip, and a body packed before it existed unpacks without it", () => {
  const rows = [suv, sedan, unknown];
  const back = unpackIndex(JSON.parse(JSON.stringify(packIndex(rows))));
  assert.deepEqual(back.map((r) => r.kind), ["BEV", "PHEV", undefined]);
  const packed = packIndex([suv]);
  delete (packed.r[0] as { kd?: unknown }).kd;
  assert.equal(unpackIndex(packed)[0].kind, undefined);
});
