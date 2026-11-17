// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/warranty-check.test.ts
//
// The /warranty tool knows make, model and year, never the trim. So the suite
// is about when it may speak for a whole cohort: a value prints only when
// every row agrees, and the in-force verdict exists only on one agreed term.
import test from "node:test";
import assert from "node:assert/strict";
import {
  cohortRows,
  warrantyAnswer,
  warrantyAnswerFromRows,
  warrantyModels,
  warrantyStatus,
} from "@/lib/listings/warrantyCheck";
import { MODEL_HUBS } from "@/lib/listings/modelHubs";
import type { EnrichmentRow, Source } from "@/lib/types";

const f = <T,>(value: T, source: Source = "mfr") => ({ value, source, asOf: "2026-01-01", confidence: "high" as const });
const row = (
  id: string,
  w: { years?: number; miles?: number; floor?: number; transfers?: boolean; source?: Source },
  extra: Partial<EnrichmentRow> = {}
): EnrichmentRow =>
  ({
    id,
    make: "Nissan",
    model: "Leaf",
    modelYears: [2023, 2023],
    warranty: {
      batteryYears: w.years != null ? f(w.years, w.source) : undefined,
      batteryMiles: w.miles != null ? f(w.miles, w.source) : undefined,
      sohFloorPct: w.floor != null ? f(w.floor) : undefined,
      batteryTransfers: w.transfers != null ? f(w.transfers) : undefined,
    },
    ...extra,
  }) as EnrichmentRow;

const NOW = new Date("2026-11-17T00:00:00Z");
const car = (year: number, mileage?: number) => ({ make: "Nissan", year, mileage });

// ── Rows agree: one term, and a verdict ────────────────────────────────────

test("rows that agree give one term and an in-force verdict", () => {
  const a = warrantyAnswerFromRows(
    [row("a", { years: 8, miles: 100000, floor: 70, transfers: true }, { trim: "S" }), row("b", { years: 8, miles: 100000, floor: 70, transfers: true }, { trim: "SV" })],
    "Leaf"
  )!;
  assert.equal(a.terms.length, 1);
  assert.deepEqual([a.terms[0].years, a.terms[0].miles], [8, 100000]);
  assert.equal(a.terms[0].trims, undefined, "one term needs no trims named");
  assert.equal(a.floorPct, 70);
  assert.equal(a.transfers, true);
  const s = warrantyStatus(a, car(2023, 30000), NOW);
  assert.equal(s.state, "active");
  assert.equal(s.state === "active" && s.label, "In force · 70,000 mi or 3+ yr left");
});

test("a real cohort whose rows agree answers (2023 Kia EV6)", () => {
  const a = warrantyAnswer("Kia", "EV6", 2023)!;
  assert.ok(cohortRows("Kia", "EV6", 2023).length > 1, "the control has several trims behind it");
  assert.deepEqual(a.terms.map((t) => [t.years, t.miles]), [[10, 100000]]);
  assert.equal(warrantyStatus(a, { make: "Kia", year: 2023, mileage: 30000 }, NOW).state, "active");
});

// ── Rows disagree: every term, no verdict ──────────────────────────────────

test("rows that disagree on the term give no verdict, and never pick one", () => {
  const a = warrantyAnswerFromRows(
    [row("a", { years: 8, miles: 100000 }, { trim: "Standard Range" }), row("b", { years: 8, miles: 120000 }, { trim: "Long Range" })],
    "Leaf"
  )!;
  assert.equal(a.terms.length, 2);
  assert.equal(a.basis, undefined);
  assert.deepEqual(a.terms.map((t) => t.trims), [["Standard Range"], ["Long Range"]]);
  // Even a reading inside both limits gets no verdict.
  assert.equal(warrantyStatus(a, car(2023, 10), NOW).state, "unknown");
});

test("terms are not attributed to trims when a trim-less row is among them", () => {
  const a = warrantyAnswerFromRows([row("a", { years: 8, miles: 100000 }), row("b", { years: 8, miles: 120000 }, { trim: "Long Range" })], "Leaf")!;
  assert.ok(a.terms.every((t) => t.trims === undefined));
});

test("terms are not attributed to trims when one trim name sits under two terms", () => {
  const a = warrantyAnswerFromRows(
    [row("a", { years: 8, miles: 100000 }, { trim: "Pro", drive: "RWD" }), row("b", { years: 8, miles: 120000 }, { trim: "Pro", drive: "AWD" })],
    "Leaf"
  )!;
  assert.ok(a.terms.every((t) => t.trims === undefined));
});

test("a real cohort whose rows disagree gives no verdict (2022 Tesla Model 3)", () => {
  const a = warrantyAnswer("Tesla", "Model 3", 2022)!;
  assert.ok(a.terms.length > 1);
  assert.equal(warrantyStatus(a, { make: "Tesla", year: 2022, mileage: 1000 }, NOW).state, "unknown");
});

test("floor and transfer print only when every row carries the same value", () => {
  const a = warrantyAnswerFromRows(
    [row("a", { years: 8, miles: 100000, floor: 70, transfers: true }), row("b", { years: 8, miles: 100000, floor: 75, transfers: true }), row("c", { years: 8, miles: 100000, transfers: true })],
    "Leaf"
  )!;
  assert.equal(a.floorPct, undefined, "70 against 75 is no answer");
  assert.equal(a.transfers, true);
  const b = warrantyAnswerFromRows([row("a", { years: 8, miles: 100000, floor: 70 }), row("b", { years: 8, miles: 100000 })], "Leaf")!;
  assert.equal(b.floorPct, undefined, "a row without a floor is not agreement");
});

// ── No rows, or part of a cohort: nothing ──────────────────────────────────

test("no rows, no answer", () => {
  assert.equal(warrantyAnswerFromRows([], "Leaf"), null);
  assert.equal(warrantyAnswer("Nissan", "Leaf", 1999), null);
  assert.equal(warrantyAnswer("Ford", "F-150 Lightning", 2019), null);
});

test("a row with no battery term silences the whole cohort", () => {
  assert.equal(warrantyAnswerFromRows([row("a", { years: 8, miles: 100000 }), row("b", {})], "Leaf"), null);
});

test("a cohort the matcher can only part-span without a VIN says nothing", () => {
  // Cayenne E-Hybrid rows are vinRequired: a VIN-less span drops them.
  assert.deepEqual(cohortRows("Porsche", "Cayenne E-Hybrid", 2021), []);
  assert.equal(warrantyAnswer("Porsche", "Cayenne E-Hybrid", 2021), null);
});

// ── The verdict is warranty.ts's, abstentions included ─────────────────────

test("a 2019 Bolt EV gets the term and no verdict", () => {
  const a = warrantyAnswer("Chevrolet", "Bolt EV", 2019)!;
  assert.deepEqual(a.terms.map((t) => [t.years, t.miles]), [[8, 100000]]);
  assert.equal(warrantyStatus(a, { make: "Chevrolet", year: 2019, mileage: 20000 }, NOW).state, "unknown");
  assert.equal(warrantyStatus(a, { make: "Chevrolet", year: 2019, mileage: 150000 }, NOW).state, "unknown");
});

test("a hub spelling cannot step around the Bolt abstention", () => {
  const a = { basis: { years: 8, miles: 100000, est: false }, models: ["Bolt", "Bolt EV"] };
  assert.equal(warrantyStatus(a, { make: "Chevrolet", year: 2019, mileage: 20000 }, NOW).state, "unknown");
});

test("a reading past the mileage limit is Expired", () => {
  const a = warrantyAnswer("Volkswagen", "ID.4", 2021)!;
  const s = warrantyStatus(a, { make: "Volkswagen", year: 2021, mileage: 120000 }, NOW);
  assert.equal(s.state, "expired");
  assert.equal(s.state === "expired" && s.label, "Expired");
});

test("control: a model whose maker states a floor prints it (2023 Kia EV6, 70%)", () => {
  assert.equal(warrantyAnswer("Kia", "EV6", 2023)!.floorPct, 70);
});

test("the cohort's in-service floor is the earliest any row documents, or none", () => {
  const withDate = (d?: string) =>
    row("x", { years: 8, miles: 100000 }, d ? ({ warranty: { batteryYears: f(8), batteryMiles: f(100000), earliestInService: f(d) } } as Partial<EnrichmentRow>) : {});
  assert.equal(warrantyAnswerFromRows([withDate("2022-04-26"), withDate("2022-06-01")], "Leaf")!.basis!.earliestInService, "2022-04-26");
  assert.equal(warrantyAnswerFromRows([withDate("2022-04-26"), withDate()], "Leaf")!.basis!.earliestInService, undefined);
});

test("a figure not from the manufacturer is marked", () => {
  const a = warrantyAnswerFromRows([row("a", { years: 8, miles: 100000, source: "agg" })], "Leaf")!;
  assert.equal(a.terms[0].est, true);
  assert.equal(a.basis!.est, true);
});

test("the picker offers only years the rows cover, and a quiet year carries no answer", () => {
  const models = warrantyModels(MODEL_HUBS);
  const ev6 = models.find((m) => m.makeSlug === "kia" && m.modelSlug === "ev6")!;
  assert.ok(ev6.years.every((y) => y.year >= 2022));
  assert.equal(ev6.sheet?.href, "/facts/kia/ev6/battery-warranty");
  const cayenne = models.find((m) => m.make === "Porsche" && m.model === "Cayenne E-Hybrid");
  if (cayenne) assert.ok(cayenne.years.every((y) => y.answer === null));
});

test("no answer anywhere carries a note", () => {
  const json = JSON.stringify(warrantyModels(MODEL_HUBS));
  assert.ok(!json.includes('"note"'));
});
