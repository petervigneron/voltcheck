// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/backfill-rowids.test.ts
//
// The backfill tested-range maps key on enrichment row ids, and nothing tied
// the two together: when a row is split by model year or renamed, its key in
// the map silently stops matching and the fact goes dark. Found 2026-08-25:
// five keys ("bz-2026-fwd-plus", "hummer-ev-suv", "silverado-3wt",
// "blazer-rwd", "silverado-4wt") matched no row — each orphaned by the
// 2026-08-22 year-splits or the bZ trim rework — so their tested figures had
// quietly stopped rendering anywhere. Only a human diff of the id sets could
// have caught it; this is that diff, run on every test pass.
import test from "node:test";
import assert from "node:assert/strict";
import { TESTED_BY_ROWID, TESTED_EST_BY_ROWID } from "@/lib/enrichment/backfill";
import { ALL_ROWS } from "@/lib/enrichment/rows";

// The same union match.ts builds — a new data file must be added both there
// and here, and a key pointing only at a file this list misses should fail.
const ALL_IDS = new Set(
  ALL_ROWS.map((r) => r.id),
);

test("every tested-range backfill key resolves to a real enrichment row", () => {
  const orphans = Object.keys(TESTED_BY_ROWID).filter((id) => !ALL_IDS.has(id));
  assert.deepEqual(orphans, [], `TESTED_BY_ROWID keys matching no row: ${orphans.join(", ")}`);
});

test("every estimated tested-range backfill key resolves to a real enrichment row", () => {
  const orphans = Object.keys(TESTED_EST_BY_ROWID).filter((id) => !ALL_IDS.has(id));
  assert.deepEqual(orphans, [], `TESTED_EST_BY_ROWID keys matching no row: ${orphans.join(", ")}`);
});

test("no row id appears in both maps — the tested entry would silently shadow the estimate", () => {
  const shadowed = Object.keys(TESTED_EST_BY_ROWID).filter((id) => id in TESTED_BY_ROWID);
  assert.deepEqual(shadowed, [], `keys in both maps: ${shadowed.join(", ")}`);
});
