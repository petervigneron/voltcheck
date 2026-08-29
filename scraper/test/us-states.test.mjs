// node --test scraper/test/us-states.test.mjs
//
// The guard that keeps foreign inventory off a site about US inventory. Every
// foreign value below was live on 2026-08-29; every US value is one the feed
// actually carries, including the three listings that spell "Georgia" out.
import test from "node:test";
import assert from "node:assert/strict";
import { isOutsideUs } from "../lib/us-states.mjs";

test("US states pass, by code and by name", () => {
  for (const s of ["CA", "NY", "TX", "DC", "PR", "GU", "Georgia", "New York", "West Virginia", "District of Columbia", "north carolina"]) {
    assert.equal(isOutsideUs(s), false, `${s} should read as US`);
  }
});

test("the Canadian rooftops are rejected — the ones no price check could catch", () => {
  // 64 live cars across five dealers, priced in Canadian dollars. At 1.37 to
  // the dollar a $51,300 sticker looks like an ordinary US ask, which is why
  // this needs a state test and not a plausibility test.
  for (const s of ["BC", "AB", "ON", "QC", "British Columbia", "Ontario"]) {
    assert.equal(isOutsideUs(s), true, `${s} should read as foreign`);
  }
});

test("the Mexican rooftop is rejected (clikautofinance.com, 18 cars in pesos)", () => {
  for (const s of ["Querétaro", "Michoacán de Ocampo", "CDMX", "Jalisco"]) {
    assert.equal(isOutsideUs(s), true, `${s} should read as foreign`);
  }
});

test("unknown is not foreign", () => {
  // 30,702 of 145,849 live listings carry no state, almost all US rooftops
  // whose pages omit addressRegion. Dropping them would cost a fifth of the
  // feed to catch 82 cars, so silence answers false and the hole is accepted.
  for (const s of ["", "   ", null, undefined]) {
    assert.equal(isOutsideUs(s), false);
  }
});
