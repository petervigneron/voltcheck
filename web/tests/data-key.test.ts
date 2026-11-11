// The data key's rules (lib/dataKeyCore.ts) and what a key adds to a record
// (lib/api/paidFields.ts). The parts that talk to Stripe and the database are
// exercised by migration 0117's own rolled-back test and by a real purchase.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GRACE_MS,
  RECHECK_MS,
  entitled,
  keyLine,
  needsRefresh,
  periodEnd,
  presentedKey,
  stripeToState,
} from "../lib/dataKeyCore";
import { paidFields, withPaidFields } from "../lib/api/paidFields";
import type { ProSignals } from "../lib/listings/proSignals";

const KEY = "cev_" + "a1".repeat(32);
const NOW = Date.parse("2026-12-15T12:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();
const DAY = 86_400_000;
const h = (init: Record<string, string>) => new Headers(init);

test("a key is read from Authorization or X-Api-Key, and never guessed at", () => {
  assert.equal(presentedKey(h({ authorization: `Bearer ${KEY}` })), KEY);
  assert.equal(presentedKey(h({ authorization: `bearer   ${KEY}  ` })), KEY);
  assert.equal(presentedKey(h({ "x-api-key": KEY })), KEY);
  assert.equal(presentedKey(h({})), null);
  // Something else's bearer token is not ours to refuse…
  assert.equal(presentedKey(h({ authorization: "Bearer eyJhbGciOi.some.jwt" })), null);
  assert.equal(presentedKey(h({ authorization: "Basic dXNlcjpwYXNz" })), null);
  // …but something shaped like our key and wrong is told so.
  assert.equal(presentedKey(h({ authorization: "Bearer cev_tooshort" })), "malformed");
  assert.equal(presentedKey(h({ authorization: `Bearer ${KEY.toUpperCase()}` })), null);
  assert.equal(presentedKey(h({ "x-api-key": "nonsense" })), "malformed");
});

test("the period end is found wherever Stripe's API version keeps it", () => {
  assert.equal(periodEnd({ current_period_end: 1_800_000_000 }), 1_800_000_000);
  assert.equal(periodEnd({ items: { data: [{ current_period_end: 1_800_000_000 }] } }), 1_800_000_000);
  assert.equal(periodEnd({ current_period_end: null, items: { data: [{ current_period_end: 5 }, { current_period_end: 9 }] } }), 9);
  assert.equal(periodEnd({}), null);
});

test("Stripe's statuses map to ours, and a late payment is not yet an ending", () => {
  const end = 1_800_000_000;
  const at = iso(end * 1000);
  assert.deepEqual(stripeToState({ status: "active", current_period_end: end }), { status: "active", periodEnd: at });
  assert.deepEqual(stripeToState({ status: "active", cancel_at_period_end: true, current_period_end: end }), { status: "canceling", periodEnd: at });
  assert.deepEqual(stripeToState({ status: "past_due", current_period_end: end }), { status: "active", periodEnd: at });
  assert.equal(stripeToState({ status: "canceled", current_period_end: end }).status, "ended");
  assert.equal(stripeToState({ status: "canceled", ended_at: end - 100, current_period_end: end }).periodEnd, iso((end - 100) * 1000));
  assert.equal(stripeToState({ status: "unpaid", current_period_end: end }).status, "ended");
  assert.equal(stripeToState({ status: "incomplete_expired" }).status, "ended");
  // A status this code has never seen sells nothing.
  assert.equal(stripeToState({ status: "something_new", current_period_end: end }).status, "ended");
});

test("a renewing key gets a grace window; a cancelled one stops on the day", () => {
  const justOver = iso(NOW - DAY);
  assert.equal(entitled({ status: "active", current_period_end: iso(NOW + DAY) }, NOW), true);
  assert.equal(entitled({ status: "active", current_period_end: justOver }, NOW), true);
  assert.equal(entitled({ status: "active", current_period_end: iso(NOW - GRACE_MS - 1) }, NOW), false);
  assert.equal(entitled({ status: "canceling", current_period_end: iso(NOW + DAY) }, NOW), true);
  assert.equal(entitled({ status: "canceling", current_period_end: justOver }, NOW), false);
  assert.equal(entitled({ status: "ended", current_period_end: iso(NOW + 30 * DAY) }, NOW), false);
  assert.equal(entitled({ status: "active", current_period_end: "not a date" }, NOW), false);
});

test("Stripe is asked only once the stored month is over, and not twice in ten minutes", () => {
  const over = iso(NOW - 3_600_000);
  assert.equal(needsRefresh({ status: "active", current_period_end: iso(NOW + DAY), checked_at: iso(NOW - 40 * DAY) }, NOW), false);
  assert.equal(needsRefresh({ status: "active", current_period_end: over, checked_at: iso(NOW - 40 * DAY) }, NOW), true);
  assert.equal(needsRefresh({ status: "canceling", current_period_end: over, checked_at: iso(NOW - 40 * DAY) }, NOW), true);
  assert.equal(needsRefresh({ status: "active", current_period_end: over, checked_at: iso(NOW - RECHECK_MS + 1000) }, NOW), false);
  assert.equal(needsRefresh({ status: "active", current_period_end: over }, NOW), true);
  // An ended subscription is not coming back on its own; a new purchase revives the row.
  assert.equal(needsRefresh({ status: "ended", current_period_end: over, checked_at: iso(NOW - 40 * DAY) }, NOW), false);
});

test("the account line says renews, ends or ended, by what is true now", () => {
  const day = (s: string) => s.slice(0, 10);
  assert.equal(keyLine({ status: "active", current_period_end: iso(NOW + DAY) }, NOW, day), "renews 2026-12-16");
  assert.equal(keyLine({ status: "canceling", current_period_end: iso(NOW + DAY) }, NOW, day), "ends 2026-12-16");
  assert.equal(keyLine({ status: "canceling", current_period_end: iso(NOW - DAY) }, NOW, day), "ended 2026-12-14");
  assert.equal(keyLine({ status: "ended", current_period_end: iso(NOW - DAY) }, NOW, day), "ended 2026-12-14");
});

test("a key adds the two paid fields to cars that have them and nothing to cars that do not", () => {
  const signals: ProSignals = new Map([
    ["vin1", { askVsMarket: { deltaUsd: -3200, peerN: 9, trimMatched: true } }],
    ["vin2", { incentive: { name: "Clean Vehicle Rebate", usd: 2000, count: 2, state: "CO", utility: false } }],
    ["vin3", { askVsMarket: { deltaUsd: 500, peerN: 4, trimMatched: false }, incentive: { name: "Utility credit", overCapUsd: 1500, count: 1 } }],
  ]);
  assert.deepEqual(paidFields("vin1", signals), { ask_vs_similar: { delta_usd: -3200, peers: 9, trim_matched: true } });
  assert.deepEqual(paidFields("vin2", signals), { incentive: { program: "Clean Vehicle Rebate", programs: 2, usd: 2000, state: "CO", utility: false } });
  assert.deepEqual(paidFields("vin3", signals), {
    ask_vs_similar: { delta_usd: 500, peers: 4, trim_matched: false },
    incentive: { program: "Utility credit", programs: 1, over_cap_usd: 1500 },
  });
  assert.deepEqual(paidFields("nothing", signals), {});

  const recs = [{ id: "vin1", price_usd: 20000 }, { id: "nothing", price_usd: 30000 }];
  const out = withPaidFields(recs, signals);
  assert.deepEqual(out[0], { id: "vin1", price_usd: 20000, ask_vs_similar: { delta_usd: -3200, peers: 9, trim_matched: true } });
  assert.deepEqual(out[1], { id: "nothing", price_usd: 30000 });
  // The caller's records are not the ones that changed.
  assert.deepEqual(recs[0], { id: "vin1", price_usd: 20000 });
});
