// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/alert-kinds.test.ts
//
// The /saved Alerts tab tells the three subscription shapes apart by their
// params, the same split the two senders make. Each case is a real row shape
// from the owner's account on 2026-10-31.
import test from "node:test";
import assert from "node:assert/strict";
import { alertHref, alertKind } from "@/lib/alertKinds";

test("a saved-cars row is 'cars' and lives on /saved", () => {
  const p = "ids=1ft6w1ev4pwg00997,1ft6w1ev3nwg11213";
  assert.equal(alertKind(p), "cars");
  assert.equal(alertHref("cars", p), "/saved");
});

test("a value watch is 'worth' and links back to the valuation it re-runs", () => {
  const p = "worth=1&year=2023&make=Hyundai&model=Ioniq+5&miles=61000&vin=KM8KNDAF3PU152258&trim=SEL&drive=AWD";
  assert.equal(alertKind(p), "worth");
  assert.equal(alertHref("worth", p), "/worth?year=2023&make=Hyundai&model=Ioniq+5&miles=61000&vin=KM8KNDAF3PU152258&trim=SEL&drive=AWD");
});

test("anything else is a search and links to its results", () => {
  const p = "make=Ford&model=F-150+Lightning&minYear=2022&maxMiles=70000&maxPrice=37000&minRange=300";
  assert.equal(alertKind(p), "search");
  assert.equal(alertHref("search", p), `/?${p}`);
  // A search whose params merely mention the words is still a search.
  assert.equal(alertKind("q=worth+watching&make=Ford"), "search");
});
