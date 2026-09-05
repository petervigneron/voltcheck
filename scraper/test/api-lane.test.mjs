import { test } from "node:test";
import assert from "node:assert/strict";
import { apiLaneDone, API_LANE_TRIES } from "../lib/api-lane.mjs";

// The rule the dealer.com and DealerOn lanes in crawl.mjs run on. Before it,
// finding the site config was enough to retire the lane, so one rate-limited
// answer handed a whole rooftop to the page-budgeted HTML walk.
test("a lane that answered is finished, whatever try it was on", () => {
  assert.equal(apiLaneDone({ ok: true, tries: 1 }), true);
  assert.equal(apiLaneDone({ ok: true, tries: 2 }), true);
});

test("a silent first try does NOT retire the lane — that is the whole fix", () => {
  assert.equal(apiLaneDone({ ok: false, tries: 1 }), false);
});

test("a silent lane gives up after its attempts, so a dead endpoint costs one extra request", () => {
  assert.equal(apiLaneDone({ ok: false, tries: API_LANE_TRIES }), true);
  assert.equal(apiLaneDone({ ok: false, tries: API_LANE_TRIES + 1 }), true);
});

test("the budget is two, and a caller may say otherwise", () => {
  assert.equal(API_LANE_TRIES, 2);
  assert.equal(apiLaneDone({ ok: false, tries: 2, max: 3 }), false);
  assert.equal(apiLaneDone({ ok: false, tries: 3, max: 3 }), true);
});
