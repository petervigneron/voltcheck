// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/shelf-merge.test.ts
//
// The account shelf (lib/shelfMerge.ts): what survives validation in either
// direction, and the one merge rule that matters — a union only on a
// browser's first sign-in, because a union any later time re-adds what was
// un-starred on another device.

import test from "node:test";
import assert from "node:assert/strict";
import { validShelf, unionShelf, sameShelf, CARS_CAP, SEARCHES_CAP } from "@/lib/shelfMerge";

const VIN = (n: number) => `5yj3e1ea7kf${String(n).padStart(6, "0")}`;
const car = (n: number, savedAt: string, extra: Record<string, unknown> = {}) => ({ id: VIN(n), savedAt, ...extra });

test("validShelf keeps well-formed entries newest first and drops the rest", () => {
  const s = validShelf({
    cars: [
      car(1, "2026-09-01T00:00:00.000Z", { title: "2023 Kia EV6 Wind", priceUsd: 31990.4 }),
      car(2, "2026-09-02T00:00:00.000Z"),
      { id: "TOO-SHORT", savedAt: "2026-09-02T00:00:00.000Z" },
      { id: VIN(3), savedAt: "yesterday" },
      { id: VIN(4).toUpperCase(), savedAt: "2026-09-03T00:00:00.000Z", priceUsd: -5, title: "x".repeat(300) },
      null,
      "nope",
    ],
    searches: [
      { qs: "make=Kia&model=EV6", label: "Kia EV6", savedAt: "2026-08-01T00:00:00.000Z" },
      { qs: "x".repeat(2000), label: "", savedAt: "2026-08-01T00:00:00.000Z" },
      { qs: "make=Tesla", savedAt: "2026-08-02T00:00:00.000Z" },
    ],
  });
  assert.deepEqual(
    s.cars.map((c) => c.id),
    [VIN(4), VIN(2), VIN(1)],
  );
  assert.equal(s.cars[2].priceUsd, 31990, "price rounded");
  assert.equal(s.cars[0].priceUsd, undefined, "negative price dropped");
  assert.equal(s.cars[0].title, undefined, "oversized title dropped");
  assert.deepEqual(
    s.searches.map((x) => x.qs),
    ["make=Tesla", "make=Kia&model=EV6"],
  );
  assert.equal(s.searches[0].label, "", "missing label becomes empty, not undefined");
});

test("duplicates collapse to the later save, and the caps hold", () => {
  const s = validShelf({
    cars: [car(1, "2026-09-01T00:00:00.000Z", { title: "old" }), car(1, "2026-09-05T00:00:00.000Z", { title: "new" })],
    searches: [],
  });
  assert.equal(s.cars.length, 1);
  assert.equal(s.cars[0].title, "new");

  const many = validShelf({
    cars: Array.from({ length: CARS_CAP + 40 }, (_, i) => car(i, `2026-01-${String((i % 28) + 1).padStart(2, "0")}T00:00:00.000Z`)),
    searches: Array.from({ length: SEARCHES_CAP + 5 }, (_, i) => ({ qs: `q=${i}`, label: "", savedAt: "2026-01-01T00:00:00.000Z" })),
  });
  assert.equal(many.cars.length, CARS_CAP);
  assert.equal(many.searches.length, SEARCHES_CAP);
});

test("unionShelf is the first-sign-in merge: both sides, newest first, no duplicates", () => {
  const local = validShelf({ cars: [car(1, "2026-09-01T00:00:00.000Z"), car(2, "2026-09-03T00:00:00.000Z")], searches: [] });
  const account = validShelf({ cars: [car(2, "2026-09-02T00:00:00.000Z"), car(3, "2026-09-04T00:00:00.000Z")], searches: [{ qs: "a=1", label: "A", savedAt: "2026-09-01T00:00:00.000Z" }] });
  const u = unionShelf(local, account);
  assert.deepEqual(u.cars.map((c) => c.id), [VIN(3), VIN(2), VIN(1)]);
  assert.equal(u.cars[1].savedAt, "2026-09-03T00:00:00.000Z", "the later save of the shared car survives");
  assert.equal(u.searches.length, 1);
  // Which is exactly why it must not run on every load: the account had
  // dropped car 1, and the union brought it back.
  assert.equal(account.cars.some((c) => c.id === VIN(1)), false);
  assert.equal(u.cars.some((c) => c.id === VIN(1)), true);
});

test("sameShelf is a structural comparison", () => {
  const a = validShelf({ cars: [car(1, "2026-09-01T00:00:00.000Z")], searches: [] });
  const b = validShelf({ cars: [car(1, "2026-09-01T00:00:00.000Z")], searches: [] });
  assert.equal(sameShelf(a, b), true);
  assert.equal(sameShelf(a, validShelf({ cars: [], searches: [] })), false);
});
