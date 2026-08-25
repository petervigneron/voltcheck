// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/lucid-air-vin-descriptors.test.ts
//
// The Lucid Air rows in lib/enrichment/data12.ts are keyed on the VIN's
// vehicle descriptor rather than on the trim string, and three of the things
// that buys are invisible from the page — a human would only find them by
// opening a listing and knowing what the number should have been.
//
//   1. "Touring" is a substring of "Grand Touring", and trimStringsOverlap is
//      substring-tolerant in both directions, so on trim strings alone a
//      Touring listing reaches the Grand Touring row and vice versa. data3
//      hit exactly this on MY2025 and had to add a row to escape it; here the
//      descriptor makes it structurally impossible. A regression that dropped
//      `vds` would hand a 2024 Air Touring the Grand Touring's 516 miles
//      against its own 411, and the page would look completely normal.
//   2. Six live listings write vPIC's Series value, "Generation 1", into the
//      trim field. It names no grade — every Lucid Air pattern of every year
//      decodes that Series — so those cars are placed by their VIN alone.
//   3. The Dream Edition Range and the Dream Edition Performance are 49 EPA
//      miles apart, both decode to vPIC Trim "Dream", and the one live
//      listing's feed trim says only "Dream Edition". VIN position 7 is the
//      motor-power code (696 kW vs 829 kW) and is the only thing that
//      separates them.
//
// And one thing the keying deliberately COSTS, pinned so nobody "fixes" it:
// a Grand Touring Performance (50EA1GD) matches nothing, because no row is
// written for it. Silence is right; the alternative is it collecting the
// ordinary Grand Touring's 516 miles, which is the Cadillac Lyriq V-Series
// failure the `vds` field was added for.
import test from "node:test";
import assert from "node:assert/strict";
import { matchEnrichment } from "@/lib/enrichment/match";
import type { VinDecode } from "@/lib/types";

const decode = (over: Partial<VinDecode>): VinDecode => ({
  vin: "",
  usMarket: true,
  make: "LUCID",
  model: "Air",
  ...over,
});

// Real VINs off the live crawl on 2026-08-25.
const GT_2024 = "50EA1GBA0RA008716";
const TOURING_2024 = "50EA1TEAXRA001809";
const PURE_2024 = "50EA1PGA7RA003604";
const GT_2022 = "50EA1GBA9NA002374";
const DREAM_P_2022 = "50EA1DAA7NA002308";
const PURE_AWD_2023 = "50EA1PFA8PA008891";
const GEN1_2023_GT = "50EA1GBA3PA002566"; // feed trim: "Generation 1"
const GEN1_2024_PURE = "50EA1PGA2RA006409"; // feed trim: "Generation 1"

const range = (r: { range?: { epaRangeMi?: { value?: number } } }) => r.range?.epaRangeMi?.value;

test("a 2024 Air Touring gets 411 miles, not the Grand Touring's 516", () => {
  const r = matchEnrichment(decode({ vin: TOURING_2024, modelYear: 2024, trim: "Touring", driveType: "AWD" }), null);
  assert.equal(r.exact?.id, "lucid-air-2024-touring");
  assert.equal(range(r.exact!), 411);
});

test("a 2024 Air Grand Touring gets 516 miles, and its own descriptor keeps the Touring row away", () => {
  const r = matchEnrichment(decode({ vin: GT_2024, modelYear: 2024, trim: "Grand Touring", driveType: "AWD" }), null);
  assert.equal(r.exact?.id, "lucid-air-2024-grand-touring");
  assert.equal(range(r.exact!), 516);
});

test("the descriptor overrules a feed trim that names the other car", () => {
  // Same Grand Touring VIN, but the feed says "Touring". The trim reaches
  // both rows; only 50EA1GB survives, so the car keeps its own figures.
  const r = matchEnrichment(decode({ vin: GT_2024, modelYear: 2024, trim: "Touring", driveType: "AWD" }), null);
  assert.equal(r.exact?.id, "lucid-air-2024-grand-touring");
});

test('"Generation 1" is vPIC\'s Series, not a grade — the VIN places these cars', () => {
  const gt = matchEnrichment(decode({ vin: GEN1_2023_GT, modelYear: 2023, trim: "Generation 1", driveType: "AWD" }), null);
  assert.equal(gt.exact?.id, "lucid-air-2023-grand-touring");

  const pure = matchEnrichment(decode({ vin: GEN1_2024_PURE, modelYear: 2024, trim: "Generation 1", driveType: "RWD" }), null);
  assert.equal(pure.exact?.id, "lucid-air-2024-pure-rwd");
});

test("VIN position 7 separates the two Dream Editions, which the feed never does", () => {
  const perf = matchEnrichment(decode({ vin: DREAM_P_2022, modelYear: 2022, trim: "Dream Edition", driveType: "AWD" }), null);
  assert.equal(perf.exact?.id, "lucid-air-2022-dream-edition-performance");
  assert.equal(range(perf.exact!), 471);

  // Same feed trim, the Range car's descriptor (position 7 = C, 696 kW).
  const rangeCar = matchEnrichment(
    decode({ vin: "50EA1DCA7NA002308", modelYear: 2022, trim: "Dream Edition", driveType: "AWD" }),
    null
  );
  assert.equal(rangeCar.exact?.id, "lucid-air-2022-dream-edition-range");
  assert.equal(range(rangeCar.exact!), 520);
});

test("with no VIN the two Dream Editions present as candidates rather than one guess", () => {
  const r = matchEnrichment(decode({ modelYear: 2022, trim: "Dream Edition", driveType: "AWD" }), null);
  assert.equal(r.exact, undefined, "nothing in a feed record says which Dream Edition this is");
  assert.deepEqual(
    (r.candidates ?? []).map((c) => c.id).sort(),
    ["lucid-air-2022-dream-edition-performance", "lucid-air-2022-dream-edition-range"]
  );
});

// Caught in review before this file shipped: the 2026 Grand Touring briefly
// printed 480 (its 20-inch rating) while 2022, 2023 and 2024 printed their
// 19-inch ones. EPA rates the two cars within four miles at every wheel —
// 516/485/450 against 512/480/446 — so the mixed reference invented a 36-mile
// drop between a 2024 Grand Touring and a 2026 one. Whatever wheel these rows
// settle on, they have to settle on the same one.
test("the Grand Touring rows all quote the same wheel, so no year-over-year change is invented", () => {
  const gt = (vin: string, year: number) =>
    matchEnrichment(decode({ vin, modelYear: year, trim: "Grand Touring", driveType: "AWD" }), null).exact!;
  const y2022 = gt(GT_2022, 2022);
  const y2024 = gt(GT_2024, 2024);
  const y2026 = gt("50EA1GBA8TA015890", 2026);
  for (const r of [y2022, y2024, y2026]) {
    assert.match(r.range!.epaRangeMi!.note!, /^19-inch wheels/, `${r.id} must quote the same fitment as its siblings`);
  }
  assert.equal(range(y2022), 516);
  assert.equal(range(y2024), 516);
  assert.equal(range(y2026), 512);
});

test("the 2023 Air Pure is the AWD car, and 2024's is the rear-drive one", () => {
  const awd = matchEnrichment(decode({ vin: PURE_AWD_2023, modelYear: 2023, trim: "Pure", driveType: "AWD" }), null);
  assert.equal(awd.exact?.id, "lucid-air-2023-pure-awd");
  assert.equal(range(awd.exact!), 410);

  const rwd = matchEnrichment(decode({ vin: PURE_2024, modelYear: 2024, trim: "Pure", driveType: "RWD" }), null);
  assert.equal(rwd.exact?.id, "lucid-air-2024-pure-rwd");
  assert.equal(range(rwd.exact!), 419);
});

test("a Grand Touring Performance gets its own 446, not the ordinary car's 516", () => {
  // 50EA1GD: Grand Touring, position 7 = D (783 kW / 1,050 hp). EPA rates it
  // at 446 mi on its only fitment (id 46306). data12 wrote no row for it;
  // data4's trim-keyed air-2023-gtp survived the 2026-08-25 dedup precisely
  // because it covers this cohort with the real certification.
  const r = matchEnrichment(decode({ vin: "50EA1GDA1PA000001", modelYear: 2023, trim: "Grand Touring Performance", driveType: "AWD" }), null);
  assert.equal(r.exact?.id, "air-2023-gtp");
  assert.equal(r.exact?.range?.epaRangeMi?.value, 446);
});

test("a Sapphire gets the Sapphire row, never a Grand Touring row", () => {
  const r = matchEnrichment(decode({ vin: "50EA1STA1RA000001", modelYear: 2024, trim: "Sapphire", driveType: "AWD" }), null);
  assert.equal(r.exact?.id, "air-2024-26-sapphire");
  assert.equal(r.exact?.range?.epaRangeMi?.value, 427);
});

// The heat pump is dated, not uniform, and the whole value of these rows is
// the boundary: Lucid put the pump on the Sapphire, added it to the Grand
// Touring for MY2024 (17 April 2024 release), and made it "standard on every
// Lucid Air" for MY2025 (16 July 2024 release). So a 2024 Grand Touring has
// one and a 2024 Touring — the more expensive-looking sibling on a dealer
// lot, and the far more common car in this feed — does not. Nothing on the
// page shows that boundary; it is one word on each of two cards.
//
// The failure this pins is the tempting one: somebody sees three 2026 rows
// and a 2024 Grand Touring saying "standard", decides the model is simply
// heat-pump-equipped, and levels the 2024 Pure and Touring up to match.
test("MY2024 splits on the heat pump: Grand Touring yes, Pure and Touring no", () => {
  const hp = (vin: string, year: number, trim: string, drive: string) =>
    matchEnrichment(decode({ vin, modelYear: year, trim, driveType: drive }), null).exact?.thermal
      ?.heatPump;

  assert.equal(hp(GT_2024, 2024, "Grand Touring", "AWD")?.value, "standard");
  assert.equal(hp(TOURING_2024, 2024, "Touring", "AWD")?.value, "none");
  assert.equal(hp(PURE_2024, 2024, "Pure", "RWD")?.value, "none");

  // Both are Lucid's own words, so neither carries the "est" marker.
  for (const f of [
    hp(GT_2024, 2024, "Grand Touring", "AWD"),
    hp(TOURING_2024, 2024, "Touring", "AWD"),
  ]) {
    assert.equal(f?.source, "mfr");
  }
});

test("every 2026 Air has the heat pump, which is what 'standard on every Lucid Air' bought", () => {
  const y2026 = (vin: string, trim: string, drive: string) =>
    matchEnrichment(decode({ vin, modelYear: 2026, trim, driveType: drive }), null).exact!;
  const gt = y2026("50EA1GBA8TA015890", "Grand Touring", "AWD");
  const touring = y2026("50EA1TEA8TA015890", "Touring", "AWD");
  const pure = y2026("50EA1PGA8TA015890", "Pure", "RWD");
  for (const r of [gt, touring, pure]) {
    assert.equal(r.thermal?.heatPump?.value, "standard", `${r.id} should carry the pump`);
    assert.equal(r.thermal?.heatPump?.source, "mfr");
  }
});

// 2022 and 2023 are the years Lucid never wrote about either way. The rows
// stay silent, and — this is the part worth pinning — silence here has to be
// DECLARED, not merely absent, or it is indistinguishable from a row nobody
// finished. A future pass that finds a MY2022/23 source should delete the
// abstention and set the fact; what it must not do is quietly infer "none"
// from the 2024 boundary above, which is why this asserts the field is empty
// rather than asserting it is "none".
test("2022 and 2023 declare their silence on the heat pump rather than guessing", () => {
  const rows = [
    matchEnrichment(decode({ vin: GT_2022, modelYear: 2022, trim: "Grand Touring", driveType: "AWD" }), null).exact!,
    matchEnrichment(decode({ vin: DREAM_P_2022, modelYear: 2022, trim: "Dream Edition", driveType: "AWD" }), null).exact!,
    matchEnrichment(decode({ vin: PURE_AWD_2023, modelYear: 2023, trim: "Pure", driveType: "AWD" }), null).exact!,
    matchEnrichment(decode({ vin: GEN1_2023_GT, modelYear: 2023, trim: "Generation 1", driveType: "AWD" }), null).exact!,
  ];
  for (const r of rows) {
    assert.equal(r.thermal?.heatPump, undefined, `${r.id} has no source for this`);
    assert.ok(r.abstains?.heatPump, `${r.id} must say why it is silent`);
  }
});

// data3 owns MY2025 and a separate workstream is adjudicating those rows, so
// this asserts the SPANS stay disjoint rather than naming data3's row ids —
// the failure worth catching is a 2024 or 2026 row growing into 2025, not a
// rename over there.
test("no row in this file spans 2025, which data3 owns", () => {
  const r = matchEnrichment(decode({ vin: GT_2022, modelYear: 2022, trim: "Grand Touring", driveType: "AWD" }), null);
  assert.equal(r.exact?.id, "lucid-air-2022-grand-touring");

  const r25 = matchEnrichment(decode({ vin: "50EA1GBA0SA008107", modelYear: 2025, trim: "Grand Touring", driveType: "AWD" }), null);
  assert.ok(r25.exact, "a 2025 Grand Touring must still resolve");
  assert.match(r25.exact!.id, /2025/, "and it must be the 2025 row, not one of this file's");
});
