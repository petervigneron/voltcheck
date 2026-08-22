import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RECHECK_CROSSCHECK_DOMAINS,
  oemAliveVins,
  trustGoneVerdict,
} from "../lib/recheck-oem-crosscheck.mjs";

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
