// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/listed-sort.test.ts
//
// The "Recently listed" sort (lib/listings/card.ts listedSortKey). Dated cars
// lead newest-first; the featured score only breaks ties inside a day and
// orders the undated rest.
import test from "node:test";
import assert from "node:assert/strict";
import { listedSortKey, type CardRow } from "../lib/listings/card";

const row = (listedOn?: string) => ({ listedOn }) as CardRow;

test("a newer listing outranks an older one whatever the featured score", () => {
  assert.ok(listedSortKey(row("2026-09-30"), -300) > listedSortKey(row("2026-09-29"), 1300));
});

test("any dated car outranks every undated one", () => {
  assert.ok(listedSortKey(row("2026-08-13"), -300) > listedSortKey(row(), 1300));
});

test("featured order breaks ties within a day and orders the undated", () => {
  assert.ok(listedSortKey(row("2026-09-30"), 50) > listedSortKey(row("2026-09-30"), 10));
  assert.equal(listedSortKey(row(), 42), 42);
});
