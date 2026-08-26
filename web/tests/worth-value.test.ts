// From web/:
//   npx tsx --test tests/worth-value.test.ts
//
// /worth's tier selection and its guardrails. Every SOLD refusal below is a
// gate lifted out of comps.ts, and each one is here because a specific false
// claim reached the site through the comparison surfaces once: the 2020 Taycan
// called $11k underpriced off a fit built on 40k-mile cars (odometer band), the
// 2023 Lightning Platinum called $18,408 over a median drawn from Pros
// (trim-span mixture), and the 2024 Model Y cohort 7SAYGDED whose one VIN code
// covers two different packs (identity mixture). This tool makes a LOUDER
// claim off the same fit — a price level rather than a distance — so a gate
// that lets it through when it should not is the same error with more of the
// page behind it.
//
// The invariant the whole file is testing: a cohort we cannot stand behind
// falls through to ESTIMATE or ABSTAIN. It never produces a confident SOLD.
import test from "node:test";
import assert from "node:assert/strict";
import {
  BRANDED_TITLE_COPY,
  UNAVAILABLE_COPY,
  askEstimate,
  decideValue,
  modelYearPool,
  narrowByTrim,
  soldBand,
  type AskPool,
  type WorthPeer,
  type WorthInput,
} from "../lib/listings/value";
import type { CompCohort, CompIndex } from "../lib/listings/comps";

const VIN = "7SAYGDEE5RA235597";
const VIN8 = "7SAYGDEE";
const YEAR = 2023;
const MILES = 40_000;

const picker: WorthInput = { year: YEAR, make: "Tesla", model: "Model Y", mileage: MILES };
const withVin: WorthInput = { ...picker, vin: VIN };

/** A cohort with nothing wrong with it: 26 sales, a real depreciation slope,
 *  this car's odometer well inside the fitted band, and versions that ask
 *  within noise of each other. */
const healthy = (over: Partial<CompCohort> = {}): CompCohort => ({
  vin8: VIN8,
  modelYear: YEAR,
  interceptUsd: 40_000,
  usdPerMile: -0.15, // $34,000 at 40,000 miles
  salesN: 26,
  odoLo: 8_000,
  odoHi: 75_000,
  saleLo: 25_000,
  saleHi: 52_000,
  trimSpanUsd: 800,
  residMedaeUsd: 2_200,
  ...over,
});

const index = (c: CompCohort): CompIndex => new Map([[`${c.vin8}|${c.modelYear}`, c]]);
const empty: CompIndex = new Map();

const peers = (
  asks: [mileage: number, askUsd: number][],
  trimKey?: string,
  trimLabel?: string
): WorthPeer[] =>
  asks.map(([mileage, askUsd], i) => ({
    vin: `TESTVIN${i}00000000`,
    mileage,
    askUsd,
    trimKey,
    trimLabel: trimKey ? (trimLabel ?? trimKey) : undefined,
  }));

const pool = (ps: WorthPeer[], over: Partial<AskPool> = {}): AskPool => ({
  peers: ps,
  basis: "model-year",
  identityMixed: false,
  identityChecked: false,
  ...over,
});

/** Four healthy asks at this car's own mileage: median $36,500. */
const FOUR = peers([
  [MILES, 35_000],
  [MILES, 36_000],
  [MILES, 37_000],
  [MILES, 38_000],
]);

// ── The band itself ────────────────────────────────────────────────────────

test("a clean cohort quotes the fit plus and minus its own median residual", () => {
  const b = soldBand(healthy(), MILES, { identityMixed: false });
  assert.ok(b);
  assert.equal(b.midUsd, 34_000);
  assert.equal(b.lowUsd, 31_800);
  assert.equal(b.highUsd, 36_200);
  assert.equal(b.salesN, 26);
});

test("the band is clamped into the prices the cohort actually reached", () => {
  // A cohort whose dearest sale was $34,500 cannot say cars like this one go
  // for $36,200 — no car in it ever did.
  const b = soldBand(healthy({ saleHi: 34_500 }), MILES, { identityMixed: false });
  assert.ok(b);
  assert.equal(b.highUsd, 34_500);
});

// ── The guardrails: each one must fall through, never quote ────────────────

test("odometer outside the fitted band: no sold claim", () => {
  const c = healthy({ odoLo: 8_000, odoHi: 25_000 });
  assert.equal(soldBand(c, MILES, { identityMixed: false }), undefined);
  // ...and the visitor still gets an estimate rather than nothing.
  const v = decideValue(withVin, index(c), pool(FOUR, { identityChecked: true }));
  assert.equal(v.tier, "estimate");
});

test("a cohort whose versions ask far apart is a mixture: no sold claim", () => {
  // trimSpanUsd clears max(residMedae, $1,500) — the Lightning Pro-through-
  // Platinum shape that migration 0022 measures.
  const c = healthy({ trimSpanUsd: 6_000 });
  assert.equal(soldBand(c, MILES, { identityMixed: false }), undefined);
  assert.equal(decideValue(withVin, index(c), pool(FOUR, { identityChecked: true })).tier, "estimate");
});

test("a cohort whose live cars resolve to two packs is a mixture: no sold claim", () => {
  // Tesla's 7SAYGDED holds Long Range and standard RWD under one code, and
  // Teslas carry no feed trim, so the trim-span gate above reads zero.
  const c = healthy();
  assert.equal(soldBand(c, MILES, { identityMixed: true }), undefined);
  const v = decideValue(withVin, index(c), pool(FOUR, { identityChecked: true, identityMixed: true }));
  assert.equal(v.tier, "estimate");
});

test("a flat or inverted fit is not a depreciation line: no sold claim", () => {
  for (const usdPerMile of [0, 0.05, Number.NaN]) {
    assert.equal(soldBand(healthy({ usdPerMile }), MILES, { identityMixed: false }), undefined);
  }
  // And the estimate that catches it does NOT claim a sales-anchored slope,
  // so the page owes no ODbL credit for a figure no title record shaped.
  const v = decideValue(withVin, index(healthy({ usdPerMile: 0 })), pool(FOUR, { identityChecked: true }));
  assert.equal(v.tier, "estimate");
  assert.equal(v.tier === "estimate" && v.waDerived, false);
});

test("an error bar as wide as the site's own bargain ceiling says nothing", () => {
  // Half-width past 30% of the fit: the band would cover a range in which this
  // site declines to call anything a bargain, which is not an answer.
  assert.equal(soldBand(healthy({ residMedaeUsd: 12_000 }), MILES, { identityMixed: false }), undefined);
});

test("a suspiciously tight cohort still gets the $1,500 floor, not false precision", () => {
  const b = soldBand(healthy({ residMedaeUsd: 200 }), MILES, { identityMixed: false });
  assert.ok(b);
  assert.equal(b.lowUsd, 32_500);
  assert.equal(b.highUsd, 35_500);
});

test("delivery mileage and 200k+ are outside what the model was fitted on", () => {
  assert.equal(soldBand(healthy({ odoLo: 0 }), 900, { identityMixed: false }), undefined);
  assert.equal(soldBand(healthy({ odoHi: 300_000 }), 250_000, { identityMixed: false }), undefined);
});

test("a cohort thinner than the model's own 8-sale floor says nothing", () => {
  assert.equal(soldBand(healthy({ salesN: 3 }), MILES, { identityMixed: false }), undefined);
});

test("a VIN whose cohort read never answered cannot clear the identity gate", () => {
  // identityChecked false = we did not get to ask. A gate we skipped is not a
  // gate, so SOLD is off even though every other coefficient is healthy.
  const v = decideValue(withVin, index(healthy()), pool(FOUR, { identityChecked: false }));
  assert.equal(v.tier, "estimate");
});

// ── Tier selection ─────────────────────────────────────────────────────────

test("VIN plus a clean cohort is the SOLD tier, and says so in one line", () => {
  const v = decideValue(withVin, index(healthy()), pool(FOUR, { identityChecked: true }));
  assert.equal(v.tier, "sold");
  assert.equal(v.tier === "sold" && v.estimated, false);
  assert.equal(
    v.source,
    "Half the cars like yours sold between $31,800 and $36,200 — based on 26 Washington sales of this configuration."
  );
  assert.equal(v.tier === "sold" && v.headline, "$31,800 – $36,200");
  assert.equal(v.tier === "sold" && v.waDerived, true);
});

test("the picker path never reaches SOLD, however clean the cohort", () => {
  // No VIN means nothing addresses ev_price_model, which is keyed on VIN 1-8.
  const v = decideValue(picker, index(healthy()), pool(FOUR));
  assert.equal(v.tier, "estimate");
});

test("the picker path is the ESTIMATE tier, marked est and sourced in one line", () => {
  const v = decideValue(picker, empty, pool(FOUR));
  assert.equal(v.tier, "estimate");
  assert.equal(v.tier === "estimate" && v.estimated, true);
  // Median ask $36,500 less the measured $1,100 the ask side runs above the
  // sold side.
  assert.equal(v.tier === "estimate" && v.headline, "$35,400");
  assert.equal(
    v.source,
    "About what a 2023 Tesla Model Y sells for at a dealership right now, from 4 live listings — a dealer buying yours will offer less."
  );
});

test("a VIN-cohort pool says which pool it was", () => {
  const v = decideValue(withVin, empty, pool(FOUR, { basis: "vin-cohort", identityChecked: true }));
  assert.equal(
    v.source,
    "About what a 2023 Tesla Model Y sells for at a dealership right now, from 4 live listings built to this VIN's configuration — a dealer buying yours will offer less."
  );
});

test("the claim names the channel, singular, whatever the nameplate ends in", () => {
  // The seller's question is what someone will pay THEM; the line says which
  // side of the counter this number sits on. Singular phrasing also retires
  // the plural-of-a-sibilant problem ("Model Ss").
  const v = decideValue({ ...picker, model: "Model S" }, empty, pool(FOUR));
  assert.equal(
    v.source,
    "About what a 2023 Tesla Model S sells for at a dealership right now, from 4 live listings — a dealer buying yours will offer less."
  );
});

test("under four comparable listings the tool abstains, with no number", () => {
  const v = decideValue(picker, index(healthy()), pool(FOUR.slice(0, 3)));
  assert.equal(v.tier, "abstain");
  assert.equal(
    v.source,
    "Fewer than four comparable 2023 Tesla Model Y listings are for sale right now — too few to put a number on, so we won't."
  );
  assert.ok(!("headline" in v));
});

test("a peer 40,000 miles away is dropped rather than corrected", () => {
  const far = peers([
    [MILES, 35_000],
    [MILES, 36_000],
    [MILES, 37_000],
    [MILES + 60_000, 20_000],
  ]);
  // Three left after the window, which is under the floor.
  assert.equal(askEstimate(pool(far), MILES, undefined), undefined);
});

// ── "Couldn't check" is not "can't value this car" ─────────────────────────

test("a failed read says so, and never borrows the abstention's words", () => {
  const v = decideValue(picker, empty, null, { dbFailed: true });
  assert.equal(v.tier, "unavailable");
  assert.equal(v.source, UNAVAILABLE_COPY);
  assert.ok(!/comparable/.test(v.source));
});

test("no listings and no failure is an honest abstention", () => {
  const v = decideValue(picker, empty, null, { dbFailed: false });
  assert.equal(v.tier, "abstain");
});

test("a failed read behind an otherwise thin pool still reads as a failure", () => {
  const v = decideValue(picker, empty, pool(FOUR.slice(0, 2)), { dbFailed: true });
  assert.equal(v.tier, "unavailable");
});

test("a failed read does not suppress an estimate we could actually make", () => {
  // The VIN cohort read failed and the make/model read did not: the visitor
  // gets the weaker true answer rather than an apology.
  const v = decideValue(picker, empty, pool(FOUR), { dbFailed: true });
  assert.equal(v.tier, "estimate");
});

// ── The optional trim narrows, or is ignored in silence ────────────────────

const MIXED = [
  ...peers([[MILES, 34_000], [MILES, 35_000], [MILES, 36_000], [MILES, 37_000]], "LONG RANGE", "Long Range"),
  ...peers([[MILES, 50_000], [MILES, 51_000], [MILES, 52_000], [MILES, 53_000]], "PERFORMANCE", "Performance"),
];

test("a trim the live cohort asserts narrows the pool", () => {
  const p = narrowByTrim(pool(MIXED), { ...picker, trim: "Long Range AWD" });
  assert.equal(p.peers.length, 4);
  assert.equal(p.matchedTrim, "Long Range");
});

test("the market's spelling of the trim wins over the visitor's typing", () => {
  // Typed lowercase, printed as the version is named. A page that echoed the
  // search box back would read as generated, and the trim is the maker's name
  // for a version of the car, not a term the reader supplied.
  const v = decideValue({ ...picker, trim: "long range" }, empty, pool(MIXED));
  assert.equal(
    v.source,
    "About what a 2023 Tesla Model Y Long Range sells for at a dealership right now, from 4 live listings — a dealer buying yours will offer less."
  );
});

test("a trim nothing in the cohort asserts is ignored, not reported", () => {
  const p = narrowByTrim(pool(MIXED), { ...picker, trim: "Plaid" });
  assert.equal(p.peers.length, 8);
  assert.equal(p.matchedTrim, undefined);
  const v = decideValue({ ...picker, trim: "Plaid" }, empty, pool(MIXED));
  assert.equal(v.tier, "estimate");
  assert.equal(
    v.source,
    "About what a 2023 Tesla Model Y sells for at a dealership right now, from 8 live listings — a dealer buying yours will offer less."
  );
});

test("trim matching is equality, never containment", () => {
  // "GT" must not select "GT Line", and "Premium" must not select "Premium Plus".
  const gtLine = peers([[MILES, 40_000], [MILES, 41_000], [MILES, 42_000], [MILES, 43_000]], "GT LINE", "GT Line");
  assert.equal(narrowByTrim(pool(gtLine), { ...picker, trim: "GT" }).matchedTrim, undefined);
  assert.equal(narrowByTrim(pool(gtLine), { ...picker, trim: "GT Line" }).matchedTrim, "GT Line");
});

test("a narrowed pool under the peer floor keeps the wide one", () => {
  const thin = [
    ...peers([[MILES, 34_000], [MILES, 35_000], [MILES, 36_000], [MILES, 37_000]], "LONG RANGE", "Long Range"),
    ...peers([[MILES, 60_000], [MILES, 61_000]], "PERFORMANCE", "Performance"),
  ];
  const p = narrowByTrim(pool(thin), { ...picker, trim: "Performance" });
  assert.equal(p.peers.length, 6);
  assert.equal(p.matchedTrim, undefined);
});

// ── The pool's own admission rules ─────────────────────────────────────────

test("a finance payment in the price column never enters the pool", () => {
  // $1,493 on a 2023 Model Y, live on 2026-08-19. The year-tiered floor, not a
  // flat one, is what catches it.
  const p = modelYearPool(
    [
      { vin: "A".repeat(17), year: YEAR, priceUsd: 1_493, mileage: MILES, condition: "used" },
      { vin: "B".repeat(17), year: YEAR, priceUsd: 35_000, mileage: MILES, condition: "used" },
    ],
    picker
  );
  assert.equal(p.peers.length, 1);
  assert.equal(p.peers[0].askUsd, 35_000);
});

test("a cab style is not a trim, so it never becomes a trim key", () => {
  // vPIC returns Trim "SuperCrew" for 2022-23 Lightnings, with no series at all.
  const p = modelYearPool(
    [{ vin: "C".repeat(17), year: 2023, priceUsd: 55_000, mileage: MILES, trim: "SuperCrew" }],
    { year: 2023, make: "Ford", model: "F-150 Lightning", mileage: MILES }
  );
  assert.equal(p.peers[0].trimKey, undefined);
});

test("the subject's own listing is not its own comparison", () => {
  const p = modelYearPool(
    [
      { vin: VIN, year: YEAR, priceUsd: 99_000, mileage: MILES },
      { vin: "D".repeat(17), year: YEAR, priceUsd: 35_000, mileage: MILES },
    ],
    withVin
  );
  assert.equal(p.peers.length, 1);
});

test("the make/model pool can never answer the identity question", () => {
  // No payload means no enrichment match, so it reports the question unasked
  // rather than answering "not mixed" by default — which is what keeps the
  // SOLD tier off a pool that could not run its last gate.
  const p = modelYearPool([], picker);
  assert.equal(p.identityChecked, false);
  assert.equal(p.identityMixed, false);
});

// ── The mileage adjustment ─────────────────────────────────────────────────

test("peers are moved to this car's odometer on the cohort's own slope", () => {
  // Four peers 20,000 miles fresher than the subject, at $40,000 each. On the
  // cohort's -$0.15/mi that is -$3,000, then -$1,100 ask-over-sold.
  const fresher = peers([
    [MILES - 20_000, 40_000],
    [MILES - 20_000, 40_000],
    [MILES - 20_000, 40_000],
    [MILES - 20_000, 40_000],
  ]);
  const e = askEstimate(pool(fresher), MILES, healthy());
  assert.ok(e);
  assert.equal(e.valueUsd, 35_900);
  assert.equal(e.slopeFromSales, true);
});

test("without a fitted slope the fallback is used, and is not called a sale figure", () => {
  const fresher = peers([
    [MILES - 20_000, 40_000],
    [MILES - 20_000, 40_000],
    [MILES - 20_000, 40_000],
    [MILES - 20_000, 40_000],
  ]);
  const e = askEstimate(pool(fresher), MILES, undefined);
  assert.ok(e);
  // -$0.09/mi over 20,000 miles, then -$1,100.
  assert.equal(e.valueUsd, 37_100);
  assert.equal(e.slopeFromSales, false);
});

// ── Condition and title ────────────────────────────────────────────────────

test("a branded title is refused a number, however healthy the pool", () => {
  // Every pool this tool can build is priced against clean titles; handing a
  // rebuilt car the clean-title number is the false-bargain error inverted.
  const v = decideValue(
    { ...withVin, condition: "branded" },
    index(healthy()),
    pool(FOUR, { identityChecked: true })
  );
  assert.equal(v.tier, "abstain");
  assert.equal(v.tier === "abstain" && v.source, BRANDED_TITLE_COPY);
});

test("accident history is collected but not priced — no unmeasured haircut", () => {
  // The pools are a market mixture that includes such cars, and this site has
  // never measured the discount; the estimate and its claim stay as they are.
  const v = decideValue({ ...picker, condition: "issues" }, empty, pool(FOUR));
  assert.equal(v.tier, "estimate");
  assert.equal(v.tier === "estimate" && v.headline, "$35,400");
});

test("URLs minted before the question existed still answer", () => {
  const v = decideValue({ ...picker, condition: undefined }, empty, pool(FOUR));
  assert.equal(v.tier, "estimate");
});
