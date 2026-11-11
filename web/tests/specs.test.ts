// lib/facts/specs.ts: a model's spec lines, drawn only from enrichment facts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { SPEC_HUBS, SPEC_MIN_COLUMNS, specColumns, specLines, specPath, versionOf } from "../lib/facts/specs";
import { MODEL_HUBS, type ModelHub } from "../lib/listings/modelHubs";
import type { EnrichmentRow, Fact } from "../lib/types";

const hub: ModelHub = { makeSlug: "kia", make: "Kia", modelSlug: "ev9", model: "EV9", keys: ["ev9"] };
const f = <T,>(value: T, source: Fact<T>["source"] = "mfr"): Fact<T> => ({
  value,
  source,
  sourceUrl: "https://example.org/doc",
  asOf: "2026-09-01",
  confidence: "high",
  note: "researcher working that must never reach the page",
});
const row = (o: Partial<EnrichmentRow>): EnrichmentRow => ({ id: Math.random().toString(36), make: "Kia", model: "EV9", modelYears: [2024, 2024], ...o });

test("a line carries the row's facts as text, with usable battery preferred and gross labelled", () => {
  const [l] = specLines(hub, [
    row({
      trim: "Light",
      drive: "RWD",
      battery: { packUsableKwh: f(76.1), packGrossKwh: f(80) },
      range: { epaRangeMi: f(230) },
      charging: { dcPeakKw: f(236), chargeTime1080Min: f(20), portStandard: f("CCS1") },
      thermal: { heatPump: f("standard") },
      warranty: { batteryYears: f(10), batteryMiles: f(100000) },
    }),
  ]);
  assert.equal(l.version, "Light · RWD");
  assert.equal(l.cells.battery?.text, "76.1 kWh");
  assert.equal(l.cells.range?.text, "230 mi");
  assert.equal(l.cells.dc?.text, "236 kW");
  assert.equal(l.cells.time?.text, "20 min");
  assert.equal(l.cells.port?.text, "CCS1");
  assert.equal(l.cells.heatPump?.text, "Standard");
  assert.equal(l.cells.warranty?.text, "10 yr / 100,000 mi");
  const [g] = specLines(hub, [row({ battery: { packGrossKwh: f(99.8) } })]);
  assert.equal(g.cells.battery?.text, "99.8 kWh gross");
});

test("a non-maker number is marked estimated; a yes-or-no fact never is", () => {
  const [l] = specLines(hub, [
    row({ range: { epaRangeMi: f(280, "agg") }, charging: { portStandard: f("NACS", "agg") }, thermal: { heatPump: f("none", "est") } }),
  ]);
  assert.equal(l.cells.range?.est, true);
  assert.equal(l.cells.port?.est, false);
  assert.equal(l.cells.heatPump?.est, false);
});

test("no note ever reaches a cell", () => {
  const lines = specLines(hub, [row({ range: { epaRangeMi: f(280) }, battery: { packUsableKwh: f(99) } })]);
  assert.doesNotMatch(JSON.stringify(lines), /researcher working/);
});

test("identical consecutive years join into one line; a difference keeps them apart", () => {
  const same = { battery: { packUsableKwh: f(76.1) }, range: { epaRangeMi: f(230) } };
  const lines = specLines(hub, [
    row({ modelYears: [2024, 2024], trim: "Light", ...same }),
    row({ modelYears: [2025, 2025], trim: "Light", ...same }),
    row({ modelYears: [2026, 2026], trim: "Light", battery: { packUsableKwh: f(76.1) }, range: { epaRangeMi: f(245) } }),
  ]);
  assert.deepEqual(lines.map((l) => [l.from, l.to, l.cells.range?.text]), [
    [2026, 2026, "245 mi"],
    [2024, 2025, "230 mi"],
  ]);
});

test("a row matches through an alias, never by prefix, and a feed-label row is not a version", () => {
  const lines = specLines(hub, [
    row({ model: "EV9 GT", range: { epaRangeMi: f(1) } }),
    row({ model: "Something", modelAliases: ["EV9"], range: { epaRangeMi: f(2) } }),
    row({ feedLabelRow: true, range: { epaRangeMi: f(3) } }),
    row({ make: "Hyundai", range: { epaRangeMi: f(4) } }),
  ]);
  assert.deepEqual(lines.map((l) => l.cells.range?.text), ["2 mi"]);
});

test("empty columns are not drawn and a warranty needs both its years and its miles", () => {
  const lines = specLines(hub, [row({ range: { epaRangeMi: f(230) }, warranty: { batteryYears: f(8) } })]);
  assert.deepEqual(specColumns(lines), ["range"]);
});

test("the real table: most hubs get a page, every page has enough to say, and paths are unique", () => {
  assert.ok(SPEC_HUBS.length >= 200, `only ${SPEC_HUBS.length} of ${MODEL_HUBS.length} hubs have a spec page`);
  const paths = new Set<string>();
  for (const h of SPEC_HUBS) {
    const lines = specLines(h);
    assert.ok(specColumns(lines).length >= SPEC_MIN_COLUMNS, specPath(h));
    assert.ok(lines.every((l) => l.from <= l.to && l.from > 2009 && l.to < 2030), specPath(h));
    assert.ok(!paths.has(specPath(h)));
    paths.add(specPath(h));
  }
});

test("a version is named once: first trim name, and no drivetrain or pack the trim already says", () => {
  assert.equal(versionOf({ trim: ["Light", "Light Short Range"], drive: "RWD", packVariant: "Standard Range" }), "Light · RWD · Standard Range");
  assert.equal(versionOf({ trim: "Long Range RWD", drive: "RWD", packVariant: "Long Range" }), "Long Range RWD");
  assert.equal(versionOf({ trim: "Mid Range", packVariant: "Mid Range" }), "Mid Range");
  assert.equal(versionOf({}), "");
});
