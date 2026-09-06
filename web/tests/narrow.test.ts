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

test("a filtered result spans makes: one menu, counted against that filter, by name", () => {
  const [make, ...rest] = narrow({ cut: "1" });
  assert.equal(rest.length, 0);
  assert.equal(make.key, "make");
  assert.deepEqual(
    make.values.map((v) => [v.v, v.n]),
    [
      ["Ford", 7],
      ["Kia", 1],
      ["Tesla", 4],
    ]
  );
  // Every entry is a live URL value: a make with no car under the filter is
  // not offered at all, rather than offered dead.
  assert.ok(make.values.every((v) => v.n > 0));
});

test("one make in the pool is not a choice", () => {
  assert.deepEqual(narrow({ q: "tesla" }), []);
});

test("a chosen make stays listed and pressed, and its models come alongside, folded to the dropdown's labels", () => {
  const [make, model, ...rest] = narrow({ cut: "1", make: "Ford" });
  assert.equal(rest.length, 0);
  assert.equal(make.key, "make");
  // Counted with the make lifted, so the other makes still say what
  // switching would leave.
  assert.deepEqual(
    make.values.map((v) => [v.v, v.n]),
    [
      ["Ford", 7],
      ["Kia", 1],
      ["Tesla", 4],
    ]
  );
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

test("a chosen model stays listed too, counted with the model lifted", () => {
  const groups = narrow({ cut: "1", make: "Ford", model: "Mustang Mach-E" });
  assert.deepEqual(
    groups.map((g) => g.key),
    ["make", "model"]
  );
  assert.deepEqual(
    groups[1].values.map((v) => [v.v, v.n]),
    [
      ["F-150 Lightning", 5],
      ["Mustang Mach-E", 2],
    ]
  );
});

test("two makes OR: both stay pressed, and there is no model menu across makes", () => {
  const get = (k: string) => ({ cut: "1", make: "Ford,Tesla" })[k] ?? "";
  const tests = buildTests(get);
  // Ten Fords and ten Teslas.
  assert.equal(feed.filter((r) => tests.make!(r)).length, 20);
  const groups = narrowFacets(feed, tests, activeFilterKeys(tests), get, makesModels);
  assert.deepEqual(
    groups.map((g) => g.key),
    ["make"]
  );
});

test("two models OR, folded", () => {
  const tests = buildTests((k) => ({ make: "Ford", model: "F-150 Lightning,MUSTANG MACH-E" })[k] ?? "");
  assert.equal(feed.filter((r) => tests.model!(r)).length, 10);
});

test("a make with one model on offer has a make menu but no model menu", () => {
  assert.deepEqual(
    narrow({ cut: "1", make: "Kia" }).map((g) => g.key),
    ["make"]
  );
});

test("a picked make the other filters have emptied stays listed at zero", () => {
  const [make] = narrow({ drive: "AWD", make: "Tesla", minRange: "9999" });
  assert.deepEqual(make.values, [{ v: "Tesla", label: "Tesla", n: 0 }]);
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

test("names sort case-insensitively, so a shouted feed spelling files with its neighbours", () => {
  const mixed = [row("audi", "Q4", { cut }), row("BMW", "iX", { cut }), row("Cadillac", "Lyriq", { cut })];
  const get = (k: string) => (k === "cut" ? "1" : "");
  const tests = buildTests(get);
  const [make] = narrowFacets(mixed, tests, activeFilterKeys(tests), get, {});
  assert.deepEqual(
    make.values.map((v) => v.v),
    ["audi", "BMW", "Cadillac"]
  );
});
