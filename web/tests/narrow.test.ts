// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/narrow.test.ts
//
// The make/model rows under the filter rail (lib/listings/narrow.ts). The
// claim each chip makes is a count — "pressing this leaves N cars" — so the
// tests pin what the count is measured against, and when a row is owed at
// all.

import test from "node:test";
import assert from "node:assert/strict";
import { narrowFacets } from "@/lib/listings/narrow";
import { activeFilterKeys, buildTests } from "@/lib/listings/match";
import { FACET_CAP } from "@/lib/filters";
import type { CardRow } from "@/lib/listings/card";

const row = (make: string, model: string, over: Partial<CardRow> = {}): CardRow =>
  ({
    id: `${make}-${model}-${Math.random()}`,
    hay: `2024 ${make} ${model}`.toLowerCase(),
    year: 2024,
    make,
    model,
    title: `2024 ${make} ${model}`,
    priceUsd: 30_000,
    realPrice: true,
    tiles: [],
    ...over,
  }) as unknown as CardRow;

const cut = { amountUsd: 1_000, at: "2026-09-01", prevUsd: 31_000 };

const feed: CardRow[] = [
  ...Array.from({ length: 5 }, () => row("Ford", "F-150 Lightning", { cut, drive: "AWD" })),
  ...Array.from({ length: 3 }, () => row("Ford", "Mustang Mach-E", { drive: "AWD" })),
  ...Array.from({ length: 2 }, () => row("Ford", "MUSTANG MACH-E", { cut })),
  ...Array.from({ length: 4 }, () => row("Tesla", "Model 3", { cut })),
  ...Array.from({ length: 6 }, () => row("Tesla", "Model Y", { drive: "AWD" })),
  row("Kia", "EV6", { cut, drive: "AWD" }),
];

// The dropdown's own fold, spelled the way tally.ts offers it.
const makesModels = {
  Ford: ["F-150 Lightning", "Mustang Mach-E"],
  Tesla: ["Model 3", "Model Y"],
  Kia: ["EV6"],
};

const narrow = (params: Record<string, string>) => {
  const get = (k: string) => params[k] ?? "";
  const tests = buildTests(get);
  return narrowFacets(feed, tests, activeFilterKeys(tests), get, makesModels);
};

test("nothing to narrow on the pristine landing page", () => {
  assert.deepEqual(narrow({}), []);
});

test("a filtered result spans makes: one row, counted against that filter, deepest first", () => {
  const [make, ...rest] = narrow({ cut: "1" });
  assert.equal(rest.length, 0);
  assert.equal(make.key, "make");
  assert.deepEqual(
    make.values.map((v) => [v.v, v.n]),
    [
      ["Ford", 7],
      ["Tesla", 4],
      ["Kia", 1],
    ]
  );
  // Every chip is a live URL value: a make with no car under the filter is
  // not offered at all, rather than offered dead.
  assert.ok(make.values.every((v) => v.n > 0 && v.top));
});

test("one make in the pool is not a choice", () => {
  assert.deepEqual(narrow({ q: "tesla" }), []);
});

test("a chosen make gives way to its models, folded to the dropdown's labels", () => {
  const [model, ...rest] = narrow({ cut: "1", make: "Ford" });
  assert.equal(rest.length, 0);
  assert.equal(model.key, "model");
  // "MUSTANG MACH-E" and "Mustang Mach-E" are one chip under the offered
  // spelling, and only the cut cars count.
  assert.deepEqual(
    model.values.map((v) => [v.v, v.n]),
    [
      ["F-150 Lightning", 5],
      ["Mustang Mach-E", 2],
    ]
  );
});

test("a chosen model closes the question; the spec rail takes it from there", () => {
  assert.deepEqual(narrow({ cut: "1", make: "Ford", model: "Mustang Mach-E" }), []);
});

test("a make with one model on offer has no model row", () => {
  assert.deepEqual(narrow({ cut: "1", make: "Kia" }), []);
});

test("two filters both count: AWD and price cut together", () => {
  const [make] = narrow({ cut: "1", drive: "AWD" });
  assert.deepEqual(
    make.values.map((v) => [v.v, v.n]),
    [
      ["Ford", 5],
      ["Kia", 1],
    ]
  );
});

test("past the cap the rest wait behind +N more, and which survive is a question of depth", () => {
  const many: CardRow[] = [];
  for (let i = 0; i < FACET_CAP + 3; i++) {
    for (let n = 0; n <= i; n++) many.push(row(`Make${String(i).padStart(2, "0")}`, "X", { cut }));
  }
  const get = (k: string) => (k === "cut" ? "1" : "");
  const tests = buildTests(get);
  const [make] = narrowFacets(many, tests, activeFilterKeys(tests), get, {});
  assert.equal(make.values.length, FACET_CAP + 3);
  assert.equal(make.values.filter((v) => v.top).length, FACET_CAP);
  // The three thinnest are the ones held back.
  assert.deepEqual(
    make.values.filter((v) => !v.top).map((v) => v.n),
    [3, 2, 1]
  );
});
