// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/search-fold.test.ts
//
// One truck, three paths, two of them wrong (2026-11-05). A Jacksonville
// dealer listed a 2023 F-150 Lightning as "F150 Lightning". The model
// dropdown folds spellings, so make=Ford&model=F-150+Lightning kept it; the
// search box compared raw words, so q=Ford+F-150+Lightning dropped it ("f-150"
// is not inside "f150"); and the featured sort's depth term counted the raw
// spelling, so in the search that did keep it the cheapest truck sat at 281
// of 395. These pin the two fixes: the search box and the depth term fold the
// way the dropdown does.
import test from "node:test";
import assert from "node:assert/strict";
import { buildTests, rowMatches, searchFold } from "@/lib/listings/match";
import { depthKey, modelTally } from "@/lib/listings/tally";
import type { CardRow } from "@/lib/listings/card";

const row = (over: Partial<CardRow> & { make: string; model: string; hay: string }): CardRow => ({
  id: over.hay.replace(/\s+/g, "-"),
  year: 2023,
  title: over.hay,
  priceUsd: 35995,
  realPrice: true,
  tiles: [],
  ...over,
});

const q = (text: string) => buildTests((k) => (k === "q" ? text : ""));

const typo = row({ make: "Ford", model: "F150 Lightning", hay: "2023 ford f150 lightning pro ext range oxford white" });
const hyphen = row({ make: "Ford", model: "F-150 Lightning", hay: "2023 ford f-150 lightning lariat antimatter blue" });

test("search box: the words typed and the dealer's spelling fold the same way", () => {
  // The saved search that missed the truck.
  assert.equal(rowMatches(q("Ford F-150 Lightning"), typo), true);
  assert.equal(rowMatches(q("Ford F-150 Lightning"), hyphen), true);
  // And the other way round: a shopper who types it the dealer's way still
  // finds every hyphenated one.
  assert.equal(rowMatches(q("f150 lightning"), hyphen), true);
  // The same gap on other nameplates.
  const etron = row({ make: "Audi", model: "e-tron", hay: "2021 audi e-tron premium plus" });
  assert.equal(rowMatches(q("etron"), etron), true);
  const id4 = row({ make: "Volkswagen", model: "ID.4", hay: "2023 volkswagen id.4 pro s" });
  assert.equal(rowMatches(q("id4"), id4), true);
  assert.equal(rowMatches(q("id.4"), id4), true);
  // The cost, pinned so it is a choice and not a surprise: a lone short token
  // is still a whole word of the folded haystack, and "id4" has no word "4".
  assert.equal(rowMatches(q("id 4"), id4), false);
});

test("search box: folding does not loosen what the raw match already refused", () => {
  // A short token is still a whole word: "y" must not land inside "grey".
  const grey = row({ make: "Tesla", model: "Model 3", hay: "2022 tesla model 3 long range stealth grey" });
  assert.equal(rowMatches(q("tesla y"), grey), false);
  const y = row({ make: "Tesla", model: "Model Y", hay: "2022 tesla model y long range midnight silver" });
  assert.equal(rowMatches(q("tesla y"), y), true);
  // "+" is identity, not punctuation (tests/match.test.ts): a search for the
  // plus trim does not fold down to the trim without it.
  const plain = row({ make: "Mercedes-Benz", model: "EQE", hay: "2024 mercedes-benz eqe 350 4matic" });
  const plus = row({ make: "Mercedes-Benz", model: "EQE", hay: "2024 mercedes-benz eqe 350+" });
  assert.equal(rowMatches(q("350+"), plus), true);
  assert.equal(rowMatches(q("350+"), plain), false);
  // Spaces still split tokens; every token still has to land.
  assert.equal(rowMatches(q("ford lightning platinum"), typo), false);
});

test("searchFold drops only the punctuation that splits a nameplate", () => {
  assert.equal(searchFold("Ford F-150 Lightning"), "ford f150 lightning");
  assert.equal(searchFold("ID. Buzz"), "id buzz");
  assert.equal(searchFold("Plug-In Hybrid"), "plugin hybrid");
  assert.equal(searchFold("EQE 350+"), "eqe 350+");
  assert.equal(searchFold("Mercedes-Benz"), "mercedesbenz");
});

test("featured depth term: a dealer's spelling of the model does not count as its own model", () => {
  const rows = [
    ...Array.from({ length: 30 }, (_, i) => row({ ...hyphen, id: `h${i}` })),
    row({ ...hyphen, id: "shout", model: "F-150 LIGHTNING" }),
    typo,
  ];
  const { counts, suggestions } = modelTally(rows);
  assert.equal(depthKey(typo), depthKey(hyphen));
  assert.equal(counts.get(depthKey(typo)), 32);
  // The typo is folded into the real model's suggestion, under the commonest
  // spelling, instead of being offered as a model of its own.
  assert.deepEqual(suggestions, [{ label: "Ford F-150 Lightning", count: 32 }]);
});

test("featured depth term: Browse's lookup key and the tally's write key are one function", () => {
  // The make is lowercased and the model folded, so a key spelled by hand on
  // either side cannot drift from the other.
  assert.equal(depthKey({ make: "Ford", model: "F-150 Lightning" }), "ford f150lightning");
  assert.equal(depthKey({ make: "FORD", model: "f150 lightning (CALL NOW)" }), "ford f150lightning");
});
