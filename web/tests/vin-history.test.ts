// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs --test tests/vin-history.test.ts
//
// The rows behind "This VIN's history". Every assertion here is a claim the
// block would otherwise make about a real car, and the numbers that put each
// one in the file are in supabase/migrations/0085.
import test from "node:test";
import assert from "node:assert/strict";
import { vinHistoryRows, MIN_ABSENCE_DAYS, PRIOR_SITE_LABEL, ABSENCE_LABEL } from "@/lib/listings/vinHistory";

// The listing page's junk floor, closed over a 2023 used car.
const anyPrice = () => true;
const usedFloor = (priceUsd: number) => priceUsd >= 7_000;

const AUG28 = "2026-08-28T04:12:00Z";
const AUG29 = "2026-08-29T20:08:33Z";
const SEP10 = "2026-09-10T02:38:06Z";

test("no history at all prints nothing", () => {
  assert.deepEqual(vinHistoryRows(undefined, anyPrice), []);
  assert.deepEqual(vinHistoryRows({}, anyPrice), []);
});

test("a row with both facts empty prints nothing, not an empty state", () => {
  assert.deepEqual(vinHistoryRows({ firstSeenAt: AUG28, absences: [] }, anyPrice), []);
});

test("first seen is carried but never printed", () => {
  // The view holds it; migration 0028's guarded listing date owns that row on
  // the page, and an unguarded one is our tracking start in a listing date's
  // clothes.
  const rows = vinHistoryRows({ firstSeenAt: AUG28, absences: [{ goneAt: AUG29, backAt: SEP10 }] }, anyPrice);
  assert.equal(rows.length, 1);
  assert.ok(!rows.some((r) => /first seen/i.test(r.label) || r.value.includes("Aug 28")));
});

test("the prior site prints where, how much and when — and no more", () => {
  const rows = vinHistoryRows(
    { priorSite: { domain: "hyundaiofakron.com", priceUsd: 24_998, lastSeenAt: AUG28 } },
    anyPrice
  );
  assert.deepEqual(
    rows.map((r) => [r.label, r.value]),
    [[PRIOR_SITE_LABEL, "hyundaiofakron.com · $24,998 · Aug 28"]]
  );
});

test("a prior price under the junk floor is not a price this car was listed at", () => {
  // beckchryslerdodgejeep.com shipped finance payments where the price goes
  // ($1,280 on a Wrangler 4xe, 2026-08-19). One logged under an earlier
  // domain is still a payment.
  assert.deepEqual(
    vinHistoryRows({ priorSite: { domain: "example.com", priceUsd: 1_280, lastSeenAt: AUG28 } }, usedFloor),
    []
  );
});

test("a prior site with no readable date prints nothing", () => {
  assert.deepEqual(
    vinHistoryRows({ priorSite: { domain: "example.com", priceUsd: 24_998, lastSeenAt: "not a date" } }, anyPrice),
    []
  );
});

test("an absence prints the two days it ran between", () => {
  const rows = vinHistoryRows({ absences: [{ goneAt: AUG29, backAt: SEP10 }] }, anyPrice);
  assert.deepEqual(
    rows.map((r) => [r.label, r.value]),
    [[ABSENCE_LABEL, "Aug 29 – Sep 10"]]
  );
});

test("an absence shorter than the floor is a crawl flickering, and prints nothing", () => {
  // 0083: 14,942 crawl delists Sep 7-11, 48% undone within three days.
  const gone = "2026-09-07T00:00:00Z";
  const back = "2026-09-09T00:00:00Z";
  assert.deepEqual(vinHistoryRows({ absences: [{ goneAt: gone, backAt: back }] }, anyPrice), []);
});

test("the floor is exactly seven days, and seven days clears it", () => {
  const gone = "2026-09-01T00:00:00Z";
  const exactly = new Date(Date.parse(gone) + MIN_ABSENCE_DAYS * 86_400_000).toISOString();
  const justUnder = new Date(Date.parse(gone) + MIN_ABSENCE_DAYS * 86_400_000 - 1).toISOString();
  assert.equal(vinHistoryRows({ absences: [{ goneAt: gone, backAt: exactly }] }, anyPrice).length, 1);
  assert.equal(vinHistoryRows({ absences: [{ goneAt: gone, backAt: justUnder }] }, anyPrice).length, 0);
});

test("a backwards or unreadable pair prints nothing", () => {
  assert.deepEqual(vinHistoryRows({ absences: [{ goneAt: SEP10, backAt: AUG29 }] }, anyPrice), []);
  assert.deepEqual(vinHistoryRows({ absences: [{ goneAt: "", backAt: SEP10 }] }, anyPrice), []);
});

test("the block reads forward: oldest row first", () => {
  const rows = vinHistoryRows(
    {
      priorSite: { domain: "machens.com", priceUsd: 48_186, lastSeenAt: "2026-09-01T00:00:00Z" },
      absences: [
        { goneAt: "2026-08-10T00:00:00Z", backAt: "2026-08-20T00:00:00Z" },
        { goneAt: "2026-09-02T00:00:00Z", backAt: "2026-09-12T00:00:00Z" },
      ],
    },
    anyPrice
  );
  assert.deepEqual(
    rows.map((r) => r.value),
    ["Aug 10 – Aug 20", "machens.com · $48,186 · Sep 1", "Sep 2 – Sep 12"]
  );
});

test("no row ever says sold", () => {
  const rows = vinHistoryRows(
    {
      priorSite: { domain: "holidayfordusa.com", priceUsd: 27_384, lastSeenAt: AUG28 },
      absences: [{ goneAt: AUG29, backAt: SEP10 }],
    },
    anyPrice
  );
  // The site knows a seller stopped listing a car, never what happened to it
  // (app/listing/[id]/Delisted.tsx). And "another dealer" is a claim the data
  // does not make: most survivors are same-owner rooftop pairs (0061).
  for (const r of rows) {
    assert.ok(!/sold/i.test(`${r.label} ${r.value}`));
    assert.ok(!/dealer/i.test(`${r.label} ${r.value}`));
  }
});
