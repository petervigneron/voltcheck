// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/watch.test.ts
//
// A standing order is a browse query string; every key must be one match.ts
// applies, and nothing the shopper left blank may become a filter.

import test from "node:test";
import assert from "node:assert/strict";
import { watchParams, type WatchInput } from "@/lib/watch";
import { REMOVABLE } from "@/lib/filters";

const blank: WatchInput = { make: "", model: "", trims: [], drive: "", minYear: "", maxMiles: "", maxPrice: "", cond: "", zip: "", radius: "" };

test("the owner's example becomes the keys the grid already filters on", () => {
  const qs = watchParams({ ...blank, make: "Hyundai", model: "IONIQ 5", trims: ["SEL", "Limited"], drive: "AWD", maxMiles: "30,000", maxPrice: "$25,000" });
  const p = new URLSearchParams(qs);
  assert.equal(p.get("make"), "Hyundai");
  assert.equal(p.get("model"), "IONIQ 5");
  assert.equal(p.get("trim"), "SEL,Limited");
  assert.equal(p.get("drive"), "AWD");
  assert.equal(p.get("maxMiles"), "30000");
  assert.equal(p.get("maxPrice"), "25000");
  for (const k of p.keys()) assert.ok((REMOVABLE as readonly string[]).includes(k), `${k} is not a grid filter`);
});

test("blank fields write nothing, and a radius without a ZIP is dropped", () => {
  assert.equal(watchParams(blank), "");
  assert.equal(watchParams({ ...blank, radius: "100" }), "");
  assert.equal(watchParams({ ...blank, zip: "1234", radius: "100" }), "");
  assert.equal(watchParams({ ...blank, zip: "98101", radius: "100" }), "zip=98101&radius=100");
  assert.equal(watchParams({ ...blank, zip: "98101", radius: "any" }), "zip=98101");
});

test("zero and junk never become a cap", () => {
  assert.equal(watchParams({ ...blank, maxMiles: "0", maxPrice: "abc", minYear: "20" }), "");
});
