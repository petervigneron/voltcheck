// node --test scraper/test/audit-status-merge.test.mjs
//
// The property that matters: two workflows writing registry/audit-status.json
// from their own checkouts must COMPOSE, never overwrite. The real incident
// this encodes — nightly recorded price-audit, feed-audits recorded its four,
// and the file that reached git had only feed-audits' — is the first case.
import test from "node:test";
import assert from "node:assert/strict";
import { mergeStatus } from "../lib/audit-status.mjs";

const at = (name, iso, extra = {}) => ({ [name]: { lastRunAt: iso, result: "ok", detail: "", expectedEveryHours: 24, ...extra } });

test("two runs that recorded different checks both keep theirs", () => {
  const nightly = { checks: { ...at("price-audit", "2026-08-23T16:48:25Z"), ...at("sync-guard", "2026-08-23T16:55:47Z") } };
  const feed = { checks: { ...at("feed-shard-health", "2026-08-23T18:50:38Z"), ...at("live-price-audit", "2026-08-23T18:50:40Z") } };
  const m = mergeStatus(nightly, feed);
  assert.deepEqual(Object.keys(m.checks).sort(), ["feed-shard-health", "live-price-audit", "price-audit", "sync-guard"]);
});

test("the same check recorded twice keeps the LATER reading", () => {
  const older = { checks: at("live-price-audit", "2026-08-24T01:57:56Z", { detail: "23 implausible" }) };
  const newer = { checks: at("live-price-audit", "2026-08-24T02:18:00Z", { detail: "11 implausible" }) };
  assert.equal(mergeStatus(older, newer).checks["live-price-audit"].detail, "11 implausible");
  // and the answer must not depend on which side is "ours"
  assert.equal(mergeStatus(newer, older).checks["live-price-audit"].detail, "11 implausible");
});

test("a malformed entry never shadows a real run", () => {
  // Otherwise a junk record would make a live check look dead and the
  // staleness gate would cry wolf — the failure that gets an alarm muted.
  const junk = { checks: at("price-audit", "not-a-date") };
  const real = { checks: at("price-audit", "2026-08-23T16:48:25Z") };
  assert.equal(mergeStatus(junk, real).checks["price-audit"].lastRunAt, "2026-08-23T16:48:25Z");
  assert.equal(mergeStatus(real, junk).checks["price-audit"].lastRunAt, "2026-08-23T16:48:25Z");
});

test("lastGoodCounts follows its own timestamp, not its side", () => {
  const a = { checks: {}, lastGoodCounts: { total: 103526, at: "2026-08-23T15:54:03Z" } };
  const b = { checks: {}, lastGoodCounts: { total: 107316, at: "2026-08-24T02:07:58Z" } };
  assert.equal(mergeStatus(a, b).lastGoodCounts.total, 107316);
  assert.equal(mergeStatus(b, a).lastGoodCounts.total, 107316);
});

test("merging against an empty or first-ever file keeps everything", () => {
  const mine = { checks: at("price-audit", "2026-08-23T16:48:25Z"), lastGoodCounts: { total: 1, at: "2026-08-23T00:00:00Z" } };
  assert.deepEqual(mergeStatus(mine, {}), { _comment: undefined, checks: mine.checks, lastGoodCounts: mine.lastGoodCounts });
});
