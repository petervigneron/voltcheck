// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/warranty.test.ts
//
// The asymmetry is the whole suite. Calling a live warranty dead costs a
// shopper a car; calling a dead one live costs them a battery pack, which is
// most of what these cars are worth. So every case that sits between the two
// in-service bounds must come back "unknown", and none may come back "active".
import test from "node:test";
import assert from "node:assert/strict";
import { batteryWarranty } from "@/lib/listings/warranty";
import type { EnrichmentRow } from "@/lib/types";
import type { Listing } from "@/lib/listings/types";

const f = <T,>(value: T) => ({ value, source: "mfr" as const, asOf: "2026-01-01", confidence: "high" as const });

const row = (years: number, miles: number): EnrichmentRow =>
  ({ id: "x", make: "X", model: "Y", modelYears: [2017, 2019], warranty: { batteryYears: f(years), batteryMiles: f(miles) } }) as EnrichmentRow;

type Subject = Pick<Listing, "make" | "model" | "year" | "mileage" | "batteryCoverage">;
// A make/model with no replacement recall behind it, so the cohort fallback
// is allowed to answer.
const car = (year: number, mileage?: number, extra: Partial<Subject> = {}): Subject =>
  ({ make: "Nissan", model: "Leaf", year, mileage, ...extra }) as Subject;

const NOW = new Date("2026-08-17T00:00:00Z");
const say = (w: ReturnType<typeof batteryWarranty>) => (w.state === "unknown" ? "unknown" : `${w.label} — ${w.why}`);

// ── The manufacturer's own record for this VIN outranks everything ─────────

test("GM's record decides it, and a replaced pack can be live past the original limit", () => {
  // The real 2017 Bolt from the owner portal: pack replaced 2021-12-23 at
  // 34,374 mi, so covered to 2029-12-23 or 134,374 mi. On the ORIGINAL terms
  // this car is 30,000 miles past a dead warranty.
  const cov = {
    startDate: "2021-12-23", startMileage: 34374,
    expiresDate: "2029-12-23", expiresMileage: 134374,
    inServiceDate: "2017-02-25", fromReplacement: true,
  };
  const live = batteryWarranty(row(8, 100_000), { make: "Chevrolet", model: "Bolt EV", year: 2017, mileage: 130_000, batteryCoverage: cov } as Subject, NOW);
  assert.equal(live.state, "active");
  // The expiry rides in the value; the pack it belongs to and the miles left
  // are the working, and stay in the tooltip.
  assert.equal(live.state === "active" ? live.label : "", "In force to Dec 2029");
  assert.match(say(live), /Replacement pack, fitted Dec 2021\. 4,374 mi left of 134,374/);

  // The same car at its real odometer is over the replacement cap, and only
  // then is it expired.
  const dead = batteryWarranty(row(8, 100_000), { make: "Chevrolet", model: "Bolt EV", year: 2017, mileage: 137_703, batteryCoverage: cov } as Subject, NOW);
  assert.equal(dead.state, "expired");
  assert.match(say(dead), /past 134,374 mi/);
});

test("a coverage record that ran out on the date reports the date, not the mileage", () => {
  const w = batteryWarranty(undefined, { make: "Chevrolet", model: "Bolt EV", year: 2017, mileage: 40_000,
    batteryCoverage: { startDate: "2017-02-25", expiresDate: "2025-02-25", expiresMileage: 100_014, inServiceDate: "2017-02-25", fromReplacement: false } } as Subject, NOW);
  assert.equal(w.state, "expired");
  assert.match(say(w), /ran out Feb 2025/);
});

// ── Without that record, a recalled Bolt cannot be answered at all ─────────

test("an unchecked Bolt in the recall years abstains instead of quoting dead terms", () => {
  for (const year of [2017, 2019, 2020, 2022]) {
    const w = batteryWarranty(row(8, 100_000), { make: "Chevrolet", model: "Bolt EV", year, mileage: 150_000 } as Subject, NOW);
    assert.equal(w.state, "unknown", `${year} Bolt must abstain, got ${say(w)}`);
  }
  // A 2023 Bolt is outside the recall, so the ordinary rules apply again.
  assert.equal(batteryWarranty(row(8, 100_000), { make: "Chevrolet", model: "Bolt EV", year: 2023, mileage: 150_000 } as Subject, NOW).state, "expired");
});

// ── The cohort fallback, where no recall clouds it ─────────────────────────

test("past the mileage limit is expired, whatever the clock says", () => {
  const w = batteryWarranty(row(8, 100_000), car(2017, 137_703), NOW);
  assert.equal(w.state, "expired");
  // "Expired" is the whole row. The arithmetic is tooltip material — the
  // owner's words on seeing it inline: "Expired is sufficient".
  assert.equal(w.state === "expired" ? w.label : "", "Expired");
  assert.match(say(w), /137,703 mi is past the 100,000 mi limit/);
});

test("expired on time once even the latest in-service date has run out", () => {
  assert.equal(batteryWarranty(row(8, 100_000), car(2014, 60_000), NOW).state, "expired");
});

test("in force only when the earliest in-service date is still covered", () => {
  const w = batteryWarranty(row(10, 100_000), car(2024, 20_000), NOW);
  assert.equal(w.state, "active");
  assert.match(say(w), /80,000 mi left/);
});

test("the ambiguous years between the two bounds stay unknown", () => {
  // MY2017 + 8: in service in 2016 it died in 2024, in 2018 it lives to 2026.
  assert.equal(batteryWarranty(row(8, 100_000), car(2017, 50_000), NOW).state, "unknown");
});

test("no odometer cannot produce an in-force claim", () => {
  assert.equal(batteryWarranty(row(10, 100_000), car(2024, undefined), NOW).state, "unknown");
});

test("no odometer can still produce an expiry, on time alone", () => {
  assert.equal(batteryWarranty(row(8, 100_000), car(2012, undefined), NOW).state, "expired");
});

test("a cohort with no warranty terms says nothing", () => {
  const bare = { id: "x", make: "X", model: "Y", modelYears: [2020, 2020] } as EnrichmentRow;
  assert.equal(batteryWarranty(bare, car(2020, 10), NOW).state, "unknown");
  assert.equal(batteryWarranty(undefined, car(2020, 10), NOW).state, "unknown");
});

test("a term with no mileage cap is in force on the clock alone, not unknown", () => {
  // Tesla S/X before 29 Jan 2020: "a period of 8 years", no cap. Formerly
  // fell through to "unknown" because the mileage side could never be safe.
  const r: EnrichmentRow = { ...row(8, 150_000), warranty: { batteryYears: f(8) } };
  const w = batteryWarranty(r, car(2022, 180_000), NOW); // 180k mi would be "Expired" under any cap
  assert.equal(w.state, "active");
  assert.match(say(w), /In force · \d\+ yr left/);
  // …and past the term it is still expired.
  assert.equal(batteryWarranty(r, car(2013, 50_000), NOW).state, "expired");
});

// ── A row's documented in-service floor tightens the generic one ───────────

test("a documented production start lifts the years-left floor, and never lowers it", () => {
  const sept2026 = new Date("2026-09-16T00:00:00Z");
  const lightning = (iso: string | undefined): EnrichmentRow =>
    ({
      id: "l", make: "FORD", model: "F-150 Lightning", modelYears: [2022, 2022],
      warranty: {
        batteryYears: f(8), batteryMiles: f(100_000),
        ...(iso ? { earliestInService: f(iso) } : {}),
      },
    }) as EnrichmentRow;
  const truck = (year: number) => ({ make: "Ford", model: "F-150 Lightning", year, mileage: 26_179 }) as Subject;

  // Generic floor: in service 1 Jan 2021, term ends 1 Jan 2029 — 2 whole years.
  assert.equal(say(batteryWarranty(lightning(undefined), truck(2022), sept2026)).split(" — ")[0], "In force · 73,821 mi or 2+ yr left");
  // Ford's production start, 26 Apr 2022: term ends 26 Apr 2030 — 3 whole years.
  assert.equal(say(batteryWarranty(lightning("2022-04-26"), truck(2022), sept2026)).split(" — ")[0], "In force · 73,821 mi or 3+ yr left");
  // A floor earlier than the generic one changes nothing: both are lower
  // bounds, and the later one is the tighter one.
  assert.equal(say(batteryWarranty(lightning("2019-06-01"), truck(2022), sept2026)).split(" — ")[0], "In force · 73,821 mi or 2+ yr left");
  // A malformed date falls back to the generic floor rather than throwing.
  assert.equal(say(batteryWarranty(lightning("spring 2022"), truck(2022), sept2026)).split(" — ")[0], "In force · 73,821 mi or 2+ yr left");
  // Whole years only: 26 Apr 2030 is 3 yr 7 mo from 16 Sept 2026, never 4.
  assert.equal(say(batteryWarranty(lightning("2022-04-26"), truck(2022), new Date("2027-04-27T00:00:00Z"))).split(" — ")[0], "In force · 73,821 mi or 2+ yr left");
  assert.equal(say(batteryWarranty(lightning("2022-04-26"), truck(2022), new Date("2027-04-25T00:00:00Z"))).split(" — ")[0], "In force · 73,821 mi or 3+ yr left");
});

test("the documented floor cannot keep a warranty in force past its own term", () => {
  const row = {
    id: "l", make: "FORD", model: "F-150 Lightning", modelYears: [2022, 2022],
    warranty: { batteryYears: f(8), batteryMiles: f(100_000), earliestInService: f("2022-04-26") },
  } as EnrichmentRow;
  const truck = { make: "Ford", model: "F-150 Lightning", year: 2022, mileage: 30_000 } as Subject;
  // 26 Apr 2030 has passed: the earliest in-service is out of time, the latest
  // (a 2023 sale) is not — unknown, exactly as the generic bounds would say.
  assert.equal(batteryWarranty(row, truck, new Date("2030-05-01T00:00:00Z")).state, "unknown");
});
