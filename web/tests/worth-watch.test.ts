// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/worth-watch.test.ts
//
// A value watch is a /worth query behind worth=1. What the page parses, the
// sender must parse back identically — and the alert sender must never
// mistake one for a browse search.
import test from "node:test";
import assert from "node:assert/strict";
import { isWorthWatch, parseWorthInput, readWorthWatch, worthWatchLabel, worthWatchParams, worthWatchUrl } from "@/lib/worthWatch";

test("a valuation round-trips through its watch params", () => {
  const input = parseWorthInput((k) => ({ year: "2023", make: "Hyundai", model: "IONIQ 5", miles: "41,200", vin: "KM8KRDAF1PU123456", trim: "SEL", drive: "AWD", cond: "issues" })[k]);
  assert.ok(input);
  const params = worthWatchParams(input!);
  assert.ok(params.startsWith("worth=1&"));
  assert.ok(isWorthWatch(params));
  assert.deepEqual(readWorthWatch(params), input);
  assert.equal(worthWatchLabel(input!), "2023 Hyundai IONIQ 5 · 41,200 mi");
  assert.equal(worthWatchUrl(input!), "/worth?year=2023&make=Hyundai&model=IONIQ+5&miles=41200&vin=KM8KRDAF1PU123456&trim=SEL&drive=AWD&cond=issues");
});

test("the same car asked twice is one row: blanks and 'good' are dropped, keys are ordered", () => {
  const a = worthWatchParams({ year: 2022, make: "Kia", model: "EV6", mileage: 30000, condition: "good" });
  const b = worthWatchParams({ year: 2022, make: "Kia", model: "EV6", mileage: 30000, trim: undefined, vin: undefined });
  assert.equal(a, b);
  assert.equal(a, "worth=1&year=2022&make=Kia&model=EV6&miles=30000");
});

test("a browse search and a saved-cars list are not watches", () => {
  assert.equal(isWorthWatch("make=Hyundai&model=IONIQ+5&maxPrice=25000"), false);
  assert.equal(isWorthWatch("ids=km8krdaf1pu123456"), false);
  assert.equal(isWorthWatch("worth=10&year=2023"), false);
  assert.equal(readWorthWatch("worth=1&year=1980&make=X&model=Y&miles=1"), null);
  assert.equal(readWorthWatch("worth=1&year=2023&make=X&model=Y&miles=400000"), null);
});

test("a malformed VIN is dropped, not refused", () => {
  const i = readWorthWatch("worth=1&year=2023&make=Tesla&model=Model+Y&miles=12000&vin=NOTAVIN");
  assert.ok(i);
  assert.equal(i!.vin, undefined);
});
