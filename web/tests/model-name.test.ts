// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/model-name.test.ts
//
// The make/model dropdown used to list every distinct spelling the feed
// carried — 721 strings for about 500 cars, 226 of them a single listing, and
// among them "IONIQ 5 SEL (ORIGINAL MSRP $42,350!!!!)". That is not a cosmetic
// problem on this page. Measured against production on 2026-08-25:
//
//   /worth?...&model=IONIQ 5 SEL  ->  "fewer than four comparable listings"
//   /worth?...&model=Ioniq 5      ->  $24,500 est., from 440 comps
//
// Same car. The seller who scrolled to the uglier entry was told theirs
// couldn't be valued. So the list is folded and pruned — and the two things
// that must not break in the process are the two this file pins: a fold must
// never merge cars that differ, and a URL that predates the fold must still
// find every car it used to and then some.
import test from "node:test";
import assert from "node:assert/strict";
import { cleanModel, modelKey, preferredForm } from "@/lib/listings/modelName";
import { modelTally } from "@/lib/listings/tally";
import { buildTests } from "@/lib/listings/match";
import { withCurrent } from "@/lib/filters";
import type { CardRow } from "@/lib/listings/card";

const row = (make: string, model: string, i: number): CardRow =>
  ({ id: `${i}`, make, model, year: 2023, hay: "" }) as unknown as CardRow;

/** n cars of one make/model spelling. */
const fleet = (spec: [string, string, number][]): CardRow[] => {
  const out: CardRow[] = [];
  for (const [make, model, n] of spec) for (let i = 0; i < n; i++) out.push(row(make, model, out.length));
  return out;
};

const matches = (rows: CardRow[], make: string, model: string) => {
  const t = buildTests((k) => (k === "make" ? make : k === "model" ? model : ""));
  return rows.filter((r) => t.make!(r) && t.model!(r)).length;
};

test("case, spacing and punctuation are the same car", () => {
  const k = modelKey("Tucson Plug-In Hybrid");
  for (const spelling of [
    "TUCSON Plug-in Hybrid",
    "TUCSON PLUG-IN HYBRID",
    "Tucson Plugin Hybrid",
    "Tucson Plug In Hybrid",
    "  tucson   plug-in   hybrid  ",
  ]) {
    assert.equal(modelKey(spelling), k, spelling);
  }
});

test("a trailing parenthetical is dealer ad copy, not a model", () => {
  assert.equal(cleanModel("IONIQ 5 SEL (ORIGINAL MSRP $42,350!!!!)"), "IONIQ 5 SEL");
  assert.equal(modelKey("IONIQ 5 SEL (ORIGINAL MSRP $42,350!!!!)"), modelKey("IONIQ 5 SEL"));
});

test("the plus is identity, not punctuation", () => {
  // A Mercedes EQS 450+ is rear-drive and an EQS 450 is a 4MATIC — different
  // range, different price. lib/enrichment/match.ts holds the same rule as
  // trimPlusMismatch; if the fold ever swallowed the plus, /worth would price
  // one against the other.
  assert.notEqual(modelKey("EQS 450+"), modelKey("EQS 450"));
  assert.notEqual(modelKey("CLA 250+"), modelKey("CLA 250"));
});

test("a trim word is never folded away", () => {
  // The tempting one-line rule — collapse anything that extends a deeper
  // model of the same make — would put the $67k Ioniq 5 N in with the $44k
  // Ioniq 5, and the Kona Electric in with the petrol Kona. Matching nothing
  // is honest; matching the wrong thing is not.
  assert.notEqual(modelKey("Ioniq 5 N"), modelKey("Ioniq 5"));
  assert.notEqual(modelKey("Kona Electric"), modelKey("Kona"));
  assert.notEqual(modelKey("Niro EV"), modelKey("Niro"));
});

test("the commonest spelling is the label, and a tie is not shouted", () => {
  assert.equal(preferredForm(new Map([["TUCSON PLUG-IN HYBRID", 66], ["Tucson Plug-In Hybrid", 335]])), "Tucson Plug-In Hybrid");
  assert.equal(preferredForm(new Map([["Esprinter 2500", 24], ["eSprinter 2500", 24]])), "eSprinter 2500");
});

test("one entry per model, and the single-car spellings are not offered", () => {
  const rows = fleet([
    ["Hyundai", "Ioniq 5", 400],
    ["Hyundai", "IONIQ 5", 12],
    ["Hyundai", "IONIQ 5 SEL (ORIGINAL MSRP $42,350!!!!)", 1],
    ["Hyundai", "IONIQ 5 SE", 1],
    ["Hyundai", "Ioniq 5 N", 9],
  ]);
  assert.deepEqual(modelTally(rows).makesModels.Hyundai, ["Ioniq 5", "Ioniq 5 N"]);
});

test("a spelling with two cars is a car, not a typo", () => {
  const rows = fleet([["Hyundai", "Ioniq 5", 400], ["Hyundai", "Nexo", 2]]);
  assert.deepEqual(modelTally(rows).makesModels.Hyundai, ["Ioniq 5", "Nexo"]);
});

test("the filter reaches every spelling, so pruning costs no car its page", () => {
  const rows = fleet([
    ["Hyundai", "TUCSON Plug-in Hybrid", 695],
    ["Hyundai", "Tucson Plug-In Hybrid", 335],
    ["Hyundai", "TUCSON PLUG-IN HYBRID", 66],
    ["Hyundai", "Tucson Plugin Hybrid", 27],
    ["Hyundai", "Ioniq 5", 400],
  ]);
  const [label] = modelTally(rows).makesModels.Hyundai.filter((m) => /tucson/i.test(m));
  assert.equal(matches(rows, "Hyundai", label), 1123);
  // A saved search or a shared link from before the fold — including a
  // spelling the dropdown no longer offers — still answers with all of them.
  assert.equal(matches(rows, "Hyundai", "TUCSON PLUG-IN HYBRID"), 1123);
  assert.equal(matches(rows, "Hyundai", "Tucson Plugin Hybrid"), 1123);
});

test("the fold never widens a filter onto a different car", () => {
  const rows = fleet([
    ["Hyundai", "Ioniq 5", 400],
    ["Hyundai", "Ioniq 5 N", 9],
    ["Mercedes-Benz", "EQS 450+", 17],
    ["Mercedes-Benz", "EQS 450", 22],
  ]);
  assert.equal(matches(rows, "Hyundai", "Ioniq 5"), 400);
  assert.equal(matches(rows, "Hyundai", "Ioniq 5 N"), 9);
  assert.equal(matches(rows, "Mercedes-Benz", "EQS 450+"), 17);
  assert.equal(matches(rows, "Mercedes-Benz", "EQS 450"), 22);
});

test("a select never renders empty over a filter that is applied", () => {
  // A pruned spelling still arrives from a shared link, and /worth renders
  // server-side with a make in the URL before the facets have loaded at all.
  assert.deepEqual(withCurrent(["Ioniq 5", "Ioniq 6"], "IONIQ 5 SE"), ["Ioniq 5", "IONIQ 5 SE", "Ioniq 6"]);
  assert.deepEqual(withCurrent([], "Hyundai"), ["Hyundai"]);
  assert.deepEqual(withCurrent(["Ioniq 5"], "Ioniq 5"), ["Ioniq 5"]);
  assert.deepEqual(withCurrent(["Ioniq 5"], ""), ["Ioniq 5"]);
});
