// From web/:
//   npx tsx --test tests/worth-trims.test.ts
//
// The trim facets behind /worth's trim dropdown (tally.ts worthTrimTally).
// The invariant that matters: every key in the trims map is a label the model
// dropdown (modelTally makesModels) actually offers, because the form looks a
// cell up with the strings its own dropdowns hold — a facet filed under a
// spelling the dropdown never shows is unreachable, and one filed under a
// pruned model would offer trims for a pick that cannot be made.
import test from "node:test";
import assert from "node:assert/strict";
import { modelTally, worthTrimTally } from "../lib/listings/tally";
import type { CardRow } from "../lib/listings/card";

let seq = 0;
const car = (make: string, model: string, year: number, trim?: string): CardRow =>
  ({
    id: `t${seq++}`,
    hay: `${year} ${make} ${model} ${trim ?? ""}`.toLowerCase(),
    year,
    make,
    model,
    title: `${year} ${make} ${model}`,
    priceUsd: 30_000,
    realPrice: true,
    trim,
  }) as CardRow;

const n = (count: number, make: string, model: string, year: number, trim?: string): CardRow[] =>
  Array.from({ length: count }, () => car(make, model, year, trim));

test("a trim four live cars carry is offered, under the dropdown's own label", () => {
  // Two spellings of one model; the commonest ("Ioniq 5") is the label the
  // model dropdown offers, and the facet must be filed under it — including
  // the trims that arrived on rows spelled the other way.
  const rows = [
    ...n(3, "Hyundai", "Ioniq 5", 2023, "SEL"),
    ...n(1, "Hyundai", "IONIQ 5", 2023, "SEL"),
    ...n(4, "Hyundai", "Ioniq 5", 2023, "Limited"),
    ...n(2, "Hyundai", "Ioniq 5", 2023),
  ];
  const { trims } = worthTrimTally(rows);
  const offered = modelTally(rows).makesModels["Hyundai"];
  assert.deepEqual(offered, ["Ioniq 5"]);
  assert.deepEqual(Object.keys(trims["Hyundai"]), ["Ioniq 5"]);
  assert.deepEqual(trims["Hyundai"]["Ioniq 5"]["2023"], ["Limited", "SEL"]);
});

test("under four live cars a trim is not offered — it could never narrow a pool", () => {
  const rows = [...n(3, "Ford", "F-150 Lightning", 2023, "Lariat"), ...n(5, "Ford", "F-150 Lightning", 2023, "XLT")];
  const { trims } = worthTrimTally(rows);
  assert.deepEqual(trims["Ford"]["F-150 Lightning"]["2023"], ["XLT"]);
});

test("deepest first, because a seller's trim is usually the common one", () => {
  const rows = [...n(4, "Tesla", "Model Y", 2023, "Performance"), ...n(9, "Tesla", "Model Y", 2023, "Long Range")];
  const { trims } = worthTrimTally(rows);
  assert.deepEqual(trims["Tesla"]["Model Y"]["2023"], ["Long Range", "Performance"]);
});

test("a model the dropdown prunes gets no facet — its cell is unreachable", () => {
  // One car of a junk spelling: pruned from makesModels, so pruned here too,
  // even if its trim were common elsewhere.
  const rows = [car("Hyundai", "IONIQ 6 SE Standard Range", 2023, "SE"), ...n(4, "Hyundai", "Ioniq 6", 2023, "SE")];
  const { trims } = worthTrimTally(rows);
  assert.deepEqual(Object.keys(trims["Hyundai"]), ["Ioniq 6"]);
});

test("years stay separate — a trim sold in one year is not offered for another", () => {
  const rows = [...n(4, "Kia", "EV6", 2022, "Wind"), ...n(4, "Kia", "EV6", 2023, "GT-Line")];
  const { trims } = worthTrimTally(rows);
  assert.deepEqual(trims["Kia"]["EV6"]["2022"], ["Wind"]);
  assert.deepEqual(trims["Kia"]["EV6"]["2023"], ["GT-Line"]);
  assert.equal(trims["Kia"]["EV6"]["2024"], undefined);
});

test("a cell with no offerable trims is absent, not an empty list", () => {
  const rows = n(6, "Chevrolet", "Bolt EV", 2021);
  const { trims } = worthTrimTally(rows);
  assert.equal(trims["Chevrolet"], undefined);
});
