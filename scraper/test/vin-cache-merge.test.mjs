// node --test scraper/test/vin-cache-merge.test.mjs
//
// The property: two workflows writing the same VIN-keyed cache from their own
// checkouts must COMPOSE. The real incident — rolling-crawl.yml and nightly.yml
// both writing 28 MB of vpic-cache.json on one line, nightly losing every
// overlap and dropping gm-warranty.json with it — is the first case.
import test from "node:test";
import assert from "node:assert/strict";
import { mergeVinCache } from "../lib/vin-cache-merge.mjs";

test("entries only one side has all survive", () => {
  const rolling = { AAA: { checkedAt: "2026-08-24", Trim: "S" } };
  const nightly = { BBB: { checkedAt: "2026-08-23", Trim: "SV" } };
  assert.deepEqual(Object.keys(mergeVinCache(nightly, rolling)).sort(), ["AAA", "BBB"]);
});

test("a VIN both sides hold keeps the later checkedAt, whichever side it is on", () => {
  // Bolt recall packs restart the warranty clock, so a re-check really can
  // supersede an earlier answer — this is not just tie-breaking.
  const older = { AAA: { checkedAt: "2026-08-01", coverage: "old" } };
  const newer = { AAA: { checkedAt: "2026-08-24", coverage: "new" } };
  assert.equal(mergeVinCache(older, newer).AAA.coverage, "new");
  assert.equal(mergeVinCache(newer, older).AAA.coverage, "new");
});

test("an entry with no usable checkedAt never displaces one that has it", () => {
  const junk = { AAA: { checkedAt: "not-a-date", Trim: "?" } };
  const real = { AAA: { checkedAt: "2026-08-24", Trim: "S" } };
  assert.equal(mergeVinCache(junk, real).AAA.Trim, "S");
  assert.equal(mergeVinCache(real, junk).AAA.Trim, "S");
});

test("merging never drops a VIN — the whole point of a union", () => {
  const a = Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`A${i}`, { checkedAt: "2026-08-23" }]));
  const b = Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`B${i}`, { checkedAt: "2026-08-24" }]));
  assert.equal(Object.keys(mergeVinCache(a, b)).length, 100);
});

test("an empty or missing side is a no-op, not a wipe", () => {
  const mine = { AAA: { checkedAt: "2026-08-24" } };
  assert.deepEqual(mergeVinCache(mine, {}), mine);
  assert.deepEqual(mergeVinCache({}, mine), mine);
  assert.deepEqual(mergeVinCache(undefined, mine), mine);
});
