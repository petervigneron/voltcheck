// From scraper/:  node --test "test/*.test.mjs"
//
// Model strings a dealer's upstream feed cut at a fixed column, and — mostly —
// the far larger set of short model names that must survive untouched. The
// rewrite cases are five real strings; the leave-alone cases are every false
// positive the naive prefix rule produced against the live 144,528-car feed,
// each with its real car counts, because that dry run is the only reason the
// four guards exist. See lib/model-truncation.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { repairTruncatedModels } from "../lib/model-truncation.mjs";

const cars = (make, model, n) => Array.from({ length: n }, () => ({ make, model }));
const modelsOf = (rows, model) => rows.filter((r) => r.model === model).length;

// The Volvo corpus as the 2026-08-29 feed had it: five names cut at exactly 25
// characters, each alongside the uncut spelling other rooftops publish.
const volvo = () => [
  ...cars("Volvo", "XC90 Recharge Plug-In Hyb", 4),
  ...cars("Volvo", "XC90 Recharge Plug-In Hybrid", 139),
  ...cars("Volvo", "XC60 Recharge Plug-In Hyb", 4),
  ...cars("Volvo", "XC60 Recharge Plug-In Hybrid", 69),
  ...cars("Volvo", "S60 Recharge Plug-In Hybr", 4),
  ...cars("Volvo", "S60 Recharge Plug-In Hybrid", 27),
  ...cars("Volvo", "XC40 Recharge Pure Electr", 4),
  ...cars("Volvo", "XC40 Recharge Pure Electric", 53),
  ...cars("Volvo", "C40 Recharge Pure Electri", 2),
  ...cars("Volvo", "C40 Recharge Pure Electric", 67),
];

test("the five 25-character cuts are completed onto the make's own spelling", () => {
  const rows = volvo();
  const r = repairTruncatedModels(rows);
  assert.equal(r.repaired, 18);
  assert.equal(modelsOf(rows, "XC90 Recharge Plug-In Hyb"), 0);
  assert.equal(modelsOf(rows, "XC90 Recharge Plug-In Hybrid"), 143);
  assert.equal(modelsOf(rows, "C40 Recharge Pure Electric"), 69);
  assert.equal(modelsOf(rows, "XC40 Recharge Pure Electric"), 57);
});

// Guard 4. One name at one column is a string we cannot explain, so it stays as
// the dealer published it — and gets reported, because the whole reason this
// defect survived is that nobody could see it.
test("a lone cut at its own column is declined, not repaired, and is reported", () => {
  const rows = [...volvo(), { make: "Volvo", model: "XC90 Recharge Plug-I" }];
  const r = repairTruncatedModels(rows);
  assert.equal(modelsOf(rows, "XC90 Recharge Plug-I"), 1);
  assert.ok(r.declined.some((d) => d.model === "XC90 Recharge Plug-I"));
});

// Guard 1. "C40 Recharge" ends where a word ends: it is Volvo's shorter name
// for the car, not a cut, and 182 live cars use it.
test("a short spelling that ends on a word boundary is never extended", () => {
  const rows = [...volvo(), ...cars("Volvo", "C40 Recharge", 182)];
  repairTruncatedModels(rows);
  assert.equal(modelsOf(rows, "C40 Recharge"), 182);
});

// Guard 3, and the worst thing the naive rule did. Every one of these is a
// nameplate that happens to prefix a different car's name.
test("a nameplate is not a truncation of the longer name it prefixes", () => {
  const rows = [
    ...cars("Toyota", "bZ", 2623),
    ...cars("Toyota", "bZ4X", 368),
    ...cars("BMW", "iX", 1282),
    ...cars("BMW", "iX3", 59),
    ...cars("BMW", "i3", 35),
    ...cars("BMW", "i3s", 1),
    ...cars("Cadillac", "Escalade IQ", 1174),
    ...cars("Cadillac", "Escalade IQL", 643),
    ...cars("Mercedes-Benz", "GLE", 347),
    ...cars("Mercedes-Benz", "GLE-Class", 1),
    ...cars("Lexus", "RZ", 224),
    ...cars("Lexus", "RZ-Series", 5),
  ];
  const r = repairTruncatedModels(rows);
  assert.equal(r.repaired, 0);
  assert.equal(modelsOf(rows, "bZ"), 2623);
  assert.equal(modelsOf(rows, "iX"), 1282);
  assert.equal(modelsOf(rows, "Escalade IQ"), 1174);
});

// Guard 4's floor, which is what these three needed: they clear guards 1-3 and
// are still wrong. "G 580" is the car; "G 580e" is one dealer's spelling of it.
test("short strings never repair, however unique their completion", () => {
  const rows = [
    ...cars("Mercedes-Benz", "G 580", 3),
    ...cars("Mercedes-Benz", "G 580e", 5),
    ...cars("Mercedes-Benz", "AMG E 53", 1),
    ...cars("Mercedes-Benz", "AMG E 53e Plug-In Hybrid", 2),
    ...cars("Lexus", "Rz", 1),
    ...cars("Lexus", "RZ-Series", 5),
  ];
  const r = repairTruncatedModels(rows);
  assert.equal(r.repaired, 0);
  assert.equal(modelsOf(rows, "G 580"), 3);
});

// Guard 2. The cut destroyed the distinction between three real cars and no
// rule can put it back, so it abstains — matching nothing is honest.
test("an ambiguous completion abstains", () => {
  const rows = [
    ...cars("Tesla", "Model 3 Standard Range", 1),
    ...cars("Tesla", "Model 3 Standard Range Plus", 1),
    ...cars("Tesla", "Model 3 Standard Range Plus RWD", 2),
    ...cars("Tesla", "Model 3 Standard Range Battery RWD", 1),
  ];
  const r = repairTruncatedModels(rows);
  assert.equal(r.repaired, 0);
  assert.equal(modelsOf(rows, "Model 3 Standard Range"), 1);
});

// The plus is model identity, not punctuation — an EQS 450+ is rear-drive and
// an EQS 450 is a 4MATIC. Guard 3 is what refuses this one.
test("the Mercedes plus is never completed onto", () => {
  const rows = [
    ...cars("Mercedes-Benz", "EQE 320", 19),
    ...cars("Mercedes-Benz", "EQE 320+ SUV", 18),
    ...cars("Mercedes-Benz", "EQS 450", 22),
    ...cars("Mercedes-Benz", "EQS 450+", 16),
    ...cars("Mercedes-Benz", "EQS 450+ SUV", 5),
  ];
  const r = repairTruncatedModels(rows);
  assert.equal(r.repaired, 0);
  assert.equal(modelsOf(rows, "EQE 320"), 19);
  assert.equal(modelsOf(rows, "EQS 450"), 22);
});

// A make whose corpus never carries the uncut spelling — a partial crawl, or
// the first night a broken feed appears. Abstain, don't invent.
test("with no uncut spelling in the corpus, nothing is repaired", () => {
  const rows = cars("Volvo", "XC90 Recharge Plug-In Hyb", 4);
  const r = repairTruncatedModels(rows);
  assert.equal(r.repaired, 0);
  assert.equal(modelsOf(rows, "XC90 Recharge Plug-In Hyb"), 4);
});

// The completion is scoped to the make: two makes' names never complete each
// other, however alike they read.
test("a completion never crosses makes", () => {
  const rows = [
    ...cars("Volvo", "XC90 Recharge Plug-In Hyb", 4),
    ...cars("Volvo", "XC60 Recharge Plug-In Hyb", 4),
    ...cars("Polestar", "XC90 Recharge Plug-In Hybrid", 139),
    ...cars("Polestar", "XC60 Recharge Plug-In Hybrid", 69),
  ];
  const r = repairTruncatedModels(rows);
  assert.equal(r.repaired, 0);
});

test("rows with no make or model are left alone", () => {
  const rows = [...volvo(), { make: "Volvo" }, { model: "XC90 Recharge Plug-In Hyb" }, {}];
  const r = repairTruncatedModels(rows);
  assert.equal(r.repaired, 18);
});
