import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RECHECK_CROSSCHECK_DOMAINS,
  SWEEP_ONLY_DOMAINS,
  SWEEP_FLOORS,
  oemAliveVins,
  oemSweepCounts,
  trustGoneVerdict,
  sweepSaysGone,
  isPerVinPage,
} from "../lib/recheck-oem-crosscheck.mjs";
import { FORD_BLUE_ADVANTAGE } from "../lib/oem/ford-blue-advantage.mjs";
import { HONDA } from "../lib/oem/honda.mjs";
import { HYUNDAI_CPO } from "../lib/oem/hyundai.mjs";
import { AUDI } from "../lib/oem/audi.mjs";
import { LUCID_NEW } from "../lib/oem/lucid.mjs";

test("RECHECK_CROSSCHECK_DOMAINS is exactly the four always-truncated, recheck-active OEM lanes", () => {
  // nissan-new/nissan-cpo are deliberately excluded: they're always-truncated
  // too, but recheck.mjs's own OEM_LOCATOR_DOMAINS skip set (built from
  // nissan.mjs's non-empty export) already excludes them from any per-VDP
  // check, for the opposite reason — their VDP is a client-rendered shell
  // that echoes the VIN for a real or fabricated one, so recheck could never
  // trust an "alive" reading from it, let alone a "gone" one.
  assert.deepEqual(
    [...RECHECK_CROSSCHECK_DOMAINS].sort(),
    ["audi-network", "ford-blue-advantage", "honda-prologue", "hyundai-cpo"].sort()
  );
});

test("RECHECK_CROSSCHECK_DOMAINS excludes nissan-new/nissan-cpo", () => {
  assert.equal(RECHECK_CROSSCHECK_DOMAINS.has("nissan-new"), false);
  assert.equal(RECHECK_CROSSCHECK_DOMAINS.has("nissan-cpo"), false);
});

test("oemAliveVins collects VINs only from cross-check domains, uppercased", () => {
  const feed = [
    { vin: "1abc", dealerDomain: "hyundai-cpo" },
    { vin: "2def", dealerDomain: "somedealer.com" }, // ordinary rooftop, ignored
    { vin: "3ghi", dealerDomain: "audi-network" },
    { vin: "", dealerDomain: "nissan-new" }, // no VIN, ignored
    null, // malformed row, ignored
  ];
  assert.deepEqual(oemAliveVins(feed), new Set(["1ABC", "3GHI"]));
});

test("oemAliveVins returns an empty set when the feed is missing or empty", () => {
  assert.deepEqual(oemAliveVins(undefined), new Set());
  assert.deepEqual(oemAliveVins([]), new Set());
});

test("trustGoneVerdict passes every non-cross-check domain through unchanged", () => {
  const alive = new Set(["1ABC"]);
  assert.equal(trustGoneVerdict("1ABC", "somedealer.com", alive), true);
  assert.equal(trustGoneVerdict("1ABC", "cadillac.com", alive), true);
});

test("trustGoneVerdict overrides a cross-check domain's gone verdict when tonight's sweep still lists the VIN", () => {
  const alive = new Set(["1ABC"]);
  assert.equal(trustGoneVerdict("1abc", "hyundai-cpo", alive), false);
  assert.equal(trustGoneVerdict("1ABC", "ford-blue-advantage", alive), false);
});

test("trustGoneVerdict trusts a cross-check domain's gone verdict when the sweep does not list the VIN", () => {
  const alive = new Set(["1ABC"]);
  assert.equal(trustGoneVerdict("9ZZZ", "hyundai-cpo", alive), true);
});

test("trustGoneVerdict trusts every verdict when the sweep is empty (feed unreadable/missing this run)", () => {
  const alive = new Set();
  assert.equal(trustGoneVerdict("1ABC", "hyundai-cpo", alive), true);
  assert.equal(trustGoneVerdict("1ABC", "nissan-cpo", alive), true);
});

// ── the sweep as evidence of absence (2026-09-12) ──────────────────────────

test("SWEEP_FLOORS restate each lane's own minExpected, so a walled proxy can never strike its whole lane", () => {
  assert.equal(SWEEP_FLOORS["ford-blue-advantage"], FORD_BLUE_ADVANTAGE.minExpected);
  assert.equal(SWEEP_FLOORS["honda-prologue"], HONDA.minExpected);
  assert.equal(SWEEP_FLOORS["hyundai-cpo"], HYUNDAI_CPO.minExpected);
  assert.equal(SWEEP_FLOORS["audi-network"], AUDI.minExpected);
  assert.equal(SWEEP_FLOORS["lucid-new"], LUCID_NEW.minExpected);
  assert.deepEqual(Object.keys(SWEEP_FLOORS).sort(), [...RECHECK_CROSSCHECK_DOMAINS, ...SWEEP_ONLY_DOMAINS].sort());
});

test("a sweep-only lane (never fetched, never certified) is judged by its own full-size sweep", () => {
  const feed = fullSweep("nissan-new", SWEEP_FLOORS["nissan-new"]);
  const alive = oemAliveVins(feed), counts = oemSweepCounts(feed);
  assert.equal(sweepSaysGone("9ZZZ", "nissan-new", alive, counts), true);
  assert.equal(sweepSaysGone("sweep000000000002", "nissan-new", alive, counts), false);
  // a short Nissan night says nothing
  const short = fullSweep("nissan-new", SWEEP_FLOORS["nissan-new"] - 1);
  assert.equal(sweepSaysGone("9ZZZ", "nissan-new", oemAliveVins(short), oemSweepCounts(short)), false);
  // and trustGoneVerdict (the OTHER direction) is untouched for these lanes: they are never fetched
  assert.equal(trustGoneVerdict("9ZZZ", "nissan-new", alive), true);
});

test("oemSweepCounts counts tonight's rows per cross-check domain and ignores the rest", () => {
  const feed = [
    { vin: "1abc", dealerDomain: "hyundai-cpo" },
    { vin: "1abd", dealerDomain: "hyundai-cpo" },
    { vin: "2def", dealerDomain: "somedealer.com" },
    { vin: "", dealerDomain: "audi-network" }, // no VIN, not a row
    null,
  ];
  const counts = oemSweepCounts(feed);
  assert.equal(counts.get("hyundai-cpo"), 2);
  assert.equal(counts.get("audi-network"), undefined);
  assert.equal(counts.get("somedealer.com"), undefined);
});

const fullSweep = (domain, n) => Array.from({ length: n }, (_, i) => ({ vin: `SWEEP${String(i).padStart(12, "0")}`, dealerDomain: domain }));

test("sweepSaysGone strikes only when the domain's sweep ran at full size and does not list the VIN", () => {
  const feed = fullSweep("ford-blue-advantage", SWEEP_FLOORS["ford-blue-advantage"]);
  const alive = oemAliveVins(feed), counts = oemSweepCounts(feed);
  assert.equal(sweepSaysGone("9ZZZ", "ford-blue-advantage", alive, counts), true);
  assert.equal(sweepSaysGone("sweep000000000001", "ford-blue-advantage", alive, counts), false); // listed (case-insensitive)
});

test("sweepSaysGone is never evidence for a domain outside the cross-check set", () => {
  const feed = fullSweep("ford-blue-advantage", SWEEP_FLOORS["ford-blue-advantage"]);
  const alive = oemAliveVins(feed), counts = oemSweepCounts(feed);
  assert.equal(sweepSaysGone("9ZZZ", "somedealer.com", alive, counts), false);
  assert.equal(sweepSaysGone("9ZZZ", "nissan-cpo", alive, counts), false);
});

test("sweepSaysGone answers false when the sweep is short, missing, or another lane's", () => {
  const short = fullSweep("ford-blue-advantage", SWEEP_FLOORS["ford-blue-advantage"] - 1);
  assert.equal(sweepSaysGone("9ZZZ", "ford-blue-advantage", oemAliveVins(short), oemSweepCounts(short)), false);
  assert.equal(sweepSaysGone("9ZZZ", "ford-blue-advantage", new Set(), new Map()), false);
  assert.equal(sweepSaysGone("9ZZZ", "ford-blue-advantage", new Set(), undefined), false);
  // A full Honda sweep says nothing about a Ford Blue Advantage row.
  const honda = fullSweep("honda-prologue", SWEEP_FLOORS["honda-prologue"]);
  assert.equal(sweepSaysGone("9ZZZ", "ford-blue-advantage", oemAliveVins(honda), oemSweepCounts(honda)), false);
  assert.equal(sweepSaysGone("9ZZZ", "honda-prologue", oemAliveVins(honda), oemSweepCounts(honda)), true);
});

test("isPerVinPage: a dealer homepage or search page is not a page about the VIN", () => {
  const vin = "1FT6W1EV2PWG58901";
  assert.equal(isPerVinPage("https://www.bonifacehierschevrolet.com//inventory/1FT6W1EV2PWG58901?utm_source=autotrader.com", vin), true);
  assert.equal(isPerVinPage("https://www.fairwayfordplacentia.com/inventory/certified-used-2023-ford-f-150-lightning-lariat-1ft6w1ev2pwg58901/", vin), true);
  assert.equal(isPerVinPage("https://brandonford.com/?utm_source=autotrader.com&utm_medium=referral", vin), false);
  assert.equal(isPerVinPage("https://www.damerowford.com/inventory/used-vehicles/?utm_source=autotrader.com", vin), false);
  assert.equal(isPerVinPage("https://www.fordblueadvantage.com/cars-for-sale", vin), false);
  assert.equal(isPerVinPage(undefined, vin), false);
  assert.equal(isPerVinPage("https://x.example/1FT6W1EV2PWG58901", ""), false);
});
