// lib/marketMonths.ts: which months get a page at /market/<yyyy-mm>, and
// which of the two figures each is allowed to print.
import { test } from "node:test";
import assert from "node:assert/strict";
import { monthReports, nextMonth, prevMonth } from "../lib/marketMonths";

const site = (rows: [string, number, number][]) => rows.map(([day, idx, cars]) => ({ day, idx, cars }));
const sold = (rows: [string, number, number][]) => rows.map(([month, change, sales]) => ({ month, change, sales, idx: 100 }));

test("a finished month prints both figures, read month-end to month-end", () => {
  const r = monthReports({
    asOf: "2026-11-17",
    sold: sold([["2026-10-01", -1.2, 840]]),
    site: site([
      ["2026-09-29", 1.0, 60000],
      ["2026-09-30", 0.98, 61000],
      ["2026-10-15", 0.5, 1],
      ["2026-10-31", 0.9702, 65000],
      ["2026-11-17", 0.9, 70000],
    ]),
  });
  assert.deepEqual(r, [
    {
      month: "2026-10",
      sold: { change: -1.2, sales: 840 },
      asking: { change: -1, from: "2026-09-30", to: "2026-10-31", cars: 65000 },
    },
  ]);
});

test("the month still running gets no page", () => {
  const r = monthReports({
    asOf: "2026-11-17",
    sold: sold([["2026-11-01", 3, 100]]),
    site: site([
      ["2026-10-31", 1, 1],
      ["2026-11-17", 1.1, 1],
    ]),
  });
  assert.deepEqual(r, []);
});

test("an index that starts mid-month gives that month and the next no asking figure it cannot stand behind", () => {
  // The real shape: the index begins 15 Aug 2026. August has no month-before
  // reading; September does (31 Aug), so September is the first with one.
  const r = monthReports({
    asOf: "2026-11-01",
    sold: sold([["2026-08-01", 0.4, 700]]),
    site: site([
      ["2026-08-15", 1, 9998],
      ["2026-08-31", 0.99, 20000],
      ["2026-09-30", 0.97, 40000],
      // October's last reading is the 20th: not a month-end.
      ["2026-10-20", 0.95, 50000],
    ]),
  });
  assert.deepEqual(
    r.map((m) => [m.month, !!m.sold, !!m.asking]),
    [
      ["2026-09", false, true],
      ["2026-08", true, false],
    ],
  );
});

test("month arithmetic crosses a year", () => {
  assert.equal(prevMonth("2026-01"), "2025-12");
  assert.equal(nextMonth("2025-12"), "2026-01");
});
