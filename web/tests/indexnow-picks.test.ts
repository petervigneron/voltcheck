// lib/listings/indexnowPicks.ts: which listings a publish announces to IndexNow.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { CardRow } from "../lib/listings/card";
import { firstSeenSince, priceDroppedSince } from "../lib/listings/indexnowPicks";

const NOW = Date.parse("2026-11-18T12:00:00Z");
const SINCE = NOW - 7 * 3_600_000;
const row = (id: string, extra: Partial<CardRow> = {}) => ({ id, ...extra }) as CardRow;
const cut = (at: string, amountUsd = 1_000) => ({ amountUsd, at, prevUsd: 40_000 });

test("a cut seen after the previous publish is announced; an older one is not", () => {
  const rows = [
    row("fresh-cut", { cut: cut("2026-11-18T09:00:00Z") }),
    row("old-cut", { cut: cut("2026-11-17T09:00:00Z") }),
    row("edge", { cut: cut(new Date(SINCE).toISOString()) }),
    row("no-cut"),
  ];
  assert.deepEqual(priceDroppedSince(rows, SINCE), ["fresh-cut"]);
});

test("a cut with no readable time is never guessed at", () => {
  const rows = [row("blank", { cut: cut("") }), row("junk", { cut: cut("yesterday-ish") })];
  assert.deepEqual(priceDroppedSince(rows, SINCE), []);
});

test("a row whose cut is not a drop is not announced as one", () => {
  assert.deepEqual(priceDroppedSince([row("zero", { cut: cut("2026-11-18T09:00:00Z", 0) })], SINCE), []);
});

test("new cars are picked by first-seen time alone, independent of drops", () => {
  const rows = [
    row("new", { firstSeenAt: "2026-11-18T08:00:00Z" }),
    row("new-and-cut", { firstSeenAt: "2026-11-18T08:00:00Z", cut: cut("2026-11-18T10:00:00Z") }),
    row("old", { firstSeenAt: "2026-10-01T08:00:00Z", cut: cut("2026-11-18T10:00:00Z") }),
    row("unknown"),
  ];
  assert.deepEqual(firstSeenSince(rows, SINCE), ["new", "new-and-cut"]);
  assert.deepEqual(priceDroppedSince(rows, SINCE), ["new-and-cut", "old"]);
});
