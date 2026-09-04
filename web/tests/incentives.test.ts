// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/incentives.test.ts
//
// The incentive matcher may only ever say a car meets the CAR-SIDE conditions
// of a named program, and only where the listing carries the fact each
// condition is about. Every case below is a way that claim could go wrong on
// a real listing: a used car named beside a new-only rebate, a plug-in hybrid
// beside a BEV-only one, a car with no dealer state beside anything, a
// Silverado EV beside a light-duty cap it does not meet, an asking price
// passed off as an MSRP. The registry itself is checked too — a live program
// with no dated source, or an ended one still carrying a figure, fails here
// rather than rendering.
import test from "node:test";
import assert from "node:assert/strict";
import { enrichListing } from "@/lib/listings/enrich";
import type { Listing } from "@/lib/listings/types";
import { INCENTIVE_PROGRAMS, programById } from "@/lib/incentives/registry";
import { matchIncentives, dealerState, vehicleKind, cardIncentive, STRICT_POLICY, SITE_POLICY, type MatchPolicy } from "@/lib/incentives/match";
import { INCENTIVES_COPY_READY } from "@/lib/incentives/copy";
// No .tsx import here: the CI test job runs Node's type stripping without
// node_modules, and the hook transpiles .tsx by requiring typescript. The
// gate lives in a .ts module for exactly this reason (lib/incentives/visible.ts).
import { incentivesToRender, narrowToZip } from "@/lib/incentives/visible";
import { packIndex, unpackIndex } from "@/lib/listings/pack";
import type { CardRow } from "@/lib/listings/card";
import { buildTests } from "@/lib/listings/match";

test("site policy: an ask up to 10% over a price cap names the program WITH the cap; further over does not", () => {
  const il: Listing = {
    id: "t", vin: "1G1FY6S04P4100001", year: 2023, make: "Chevrolet", model: "Bolt EUV", trim: "LT",
    priceUsd: 21500, mileage: 24000, state: "IL", sellerType: "dealer", condition: "used",
  };
  // Massachusetts MOR-EV Used caps the price paid at $40,000.
  const at = (priceUsd: number) =>
    matchIncentives(enrichListing({ ...il, state: "MA", priceUsd }), SITE_POLICY, INCENTIVE_PROGRAMS, new Date("2026-09-02T12:00:00Z")).find(
      (m) => m.program.id === "ma-mor-ev"
    );
  assert.equal(at(39_000)?.cap?.askOverByUsd, undefined, "under the cap: met, no gap");
  const over = at(43_000);
  assert.ok(over, "$3,000 over a $40,000 cap is within 10%: named");
  assert.equal(over!.cap?.askOverByUsd, 3000, "the gap rides with the match so every surface prints the cap");
  assert.equal(at(45_000), undefined, "12.5% over: not named");
  // The card leads with the cap, not the figure, when the ask is over it.
  const card = cardIncentive(matchIncentives(enrichListing({ ...il, state: "MA", priceUsd: 43_000 }), SITE_POLICY, INCENTIVE_PROGRAMS, new Date("2026-09-02T12:00:00Z")));
  assert.equal(card?.overCapUsd, 40_000);
  assert.ok(card!.count >= 1);
});

test("the card leads with a state program over a utility one, and a settled figure over none", () => {
  const ca: Listing = {
    id: "t", vin: "1G1FY6S04P4100001", year: 2023, make: "Chevrolet", model: "Bolt EUV", trim: "LT",
    priceUsd: 19500, mileage: 24000, state: "CA", sellerType: "dealer", condition: "used",
  };
  const ms = matchIncentives(enrichListing(ca), SITE_POLICY, INCENTIVE_PROGRAMS, new Date("2026-09-02T12:00:00Z"));
  const card = cardIncentive(ms)!;
  assert.equal(card.programId, "ca-clean-cars-4-all", "the statewide program leads");
  assert.equal(card.count, ms.length);
  const ilCard = cardIncentive(
    matchIncentives(
      enrichListing({ ...ca, state: "IL" }),
      SITE_POLICY, INCENTIVE_PROGRAMS, new Date("2026-09-02T12:00:00Z")
    )
  )!;
  assert.equal(ilCard.usd, 2000);
});

test("the incentive summary survives the packed feed byte for byte", () => {
  const row: CardRow = {
    id: "1g1fy6s04p4100001", hay: "2023 chevrolet bolt euv lt", year: 2023, make: "Chevrolet", model: "Bolt EUV",
    title: "2023 Chevrolet Bolt EUV LT", priceUsd: 21500, realPrice: true, condition: "used", state: "IL",
    incentive: { name: "Illinois EV Rebate", usd: 2000, count: 1, utility: false, state: "IL" }, tiles: [],
  };
  const bare: CardRow = { ...row, id: "x", incentive: undefined };
  const overCap: CardRow = { ...row, id: "y", incentive: { name: "Massachusetts MOR-EV", overCapUsd: 40000, count: 3, utility: false, state: "MA" } };
  const utility: CardRow = { ...row, id: "z", state: "Pennsylvania", incentive: { name: "PECO Smart Driver rebate", usd: 50, count: 1, utility: true, state: "PA" } };
  // A summary packed before 2026-09-03 carried neither flag nor state.
  const old: CardRow = { ...row, id: "w", incentive: { name: "Illinois EV Rebate", usd: 2000, count: 1 } };
  const back = unpackIndex(packIndex([row, bare, overCap, utility, old]));
  assert.deepEqual(back[0].incentive, { name: "Illinois EV Rebate", usd: 2000, overCapUsd: undefined, count: 1, utility: false, state: "IL" });
  assert.equal(back[1].incentive, undefined);
  assert.deepEqual(back[2].incentive, { name: "Massachusetts MOR-EV", usd: undefined, overCapUsd: 40000, count: 3, utility: false, state: "MA" });
  assert.deepEqual(back[3].incentive, { name: "PECO Smart Driver rebate", usd: 50, overCapUsd: undefined, count: 1, utility: true, state: "PA" });
  assert.deepEqual(back[4].incentive, { name: "Illinois EV Rebate", usd: 2000, overCapUsd: undefined, count: 1, utility: undefined, state: undefined });
});

test("the card summary says which kind of program leads and its state, so the tag can be 'resident' or 'utility'", () => {
  const ca: Listing = {
    id: "t", vin: "1G1FY6S04P4100001", year: 2023, make: "Chevrolet", model: "Bolt EUV", trim: "LT",
    priceUsd: 19500, mileage: 24000, state: "California", sellerType: "dealer", condition: "used",
  };
  const card = cardIncentive(matchIncentives(enrichListing(ca), SITE_POLICY, INCENTIVE_PROGRAMS, new Date("2026-09-02T12:00:00Z")))!;
  assert.equal(card.utility, false, "the statewide program leads");
  assert.equal(card.state, "CA", "the two-letter code, whatever the dealer feed spelled");
  const pa = cardIncentive(matchIncentives(enrichListing({ ...ca, state: "PA" }), SITE_POLICY, INCENTIVE_PROGRAMS, new Date("2026-09-02T12:00:00Z")))!;
  assert.equal(pa.utility, true, "Pennsylvania's own program has ended; only PECO names the car");
  assert.equal(pa.state, "PA");
});

test("the rebate filter is Pro: without a pass the key is inert, with one it keeps only cars a program names", () => {
  const get = (k: string) => (k === "rebate" ? "1" : "");
  assert.equal(buildTests(get).rebate, undefined, "a stranger's ?rebate=1 applies nothing");
  assert.equal(buildTests(get, { pro: false }).rebate, undefined);
  const t = buildTests(get, { pro: true }).rebate!;
  const named: CardRow = {
    id: "a", hay: "", year: 2023, make: "Chevrolet", model: "Bolt EUV", title: "", priceUsd: 21500, realPrice: true,
    incentive: { name: "Illinois EV Rebate", usd: 2000, count: 1, utility: false, state: "IL" }, tiles: [],
  };
  assert.equal(t(named), true);
  assert.equal(t({ ...named, incentive: undefined }), false);
});

test("PNM: a New Mexico car under the $55,000 invoiced-price cap meets the car-side conditions; the $4,000 is stated, never the figure", () => {
  const nm: Listing = {
    id: "t", vin: "1G1FY6S04P4100001", year: 2023, make: "Chevrolet", model: "Bolt EUV", trim: "LT",
    priceUsd: 21500, mileage: 24000, state: "NM", sellerType: "dealer", condition: "used",
  };
  const m = matchIncentives(enrichListing(nm), SITE_POLICY, INCENTIVE_PROGRAMS, new Date("2026-09-02T12:00:00Z")).find((x) => x.program.id === "nm-pnm-income-qualified-ev-rebate");
  assert.ok(m, "named under the site policy (participating dealer stated)");
  assert.equal(m!.amountUsd, undefined, "an 'up to' figure is never the settled figure");
  assert.ok(m!.purchaserSideAmounts.some((a) => a.usd === 4000));
  assert.ok(m!.toCheckOnTheCar.some((c) => /participating dealership/.test(c)));
  assert.equal(matchIncentives(enrichListing({ ...nm, priceUsd: 61_000 }), SITE_POLICY, INCENTIVE_PROGRAMS).find((x) => x.program.id === "nm-pnm-income-qualified-ev-rebate"), undefined);
});

test("the copy gate: open now that the owner's two strings are in, and shut again the moment a placeholder returns", () => {
  // Owner wrote the toggle label and the confirm line on 2026-09-03, so the
  // feature renders. The gate itself is what this asserts: any string carrying
  // the "[OWNER COPY]" marker would put INCENTIVES_COPY_READY back to false and
  // incentivesToRender back to [].
  assert.equal(INCENTIVES_COPY_READY, true);
  const m = matchIncentives(
    enrichListing({
      id: "t", vin: "1G1FY6S04P4100001", year: 2023, make: "Chevrolet", model: "Bolt EUV", trim: "LT",
      priceUsd: 21500, mileage: 24000, state: "IL", sellerType: "dealer", condition: "used",
    }),
    STRICT_POLICY
  );
  assert.ok(m.length > 0);
  assert.deepEqual(incentivesToRender(m), m, "with the copy written, what matched is what renders");
});

test("a ZIP narrows only its own state's programs, and an IP guess never narrows to nothing", () => {
  // A California car: one statewide program and a pile of utility ones.
  const ca = matchIncentives(
    enrichListing({
      id: "t", vin: "1G1FY6S04P4100001", year: 2023, make: "Chevrolet", model: "Bolt EUV", trim: "LT",
      priceUsd: 19500, mileage: 24000, state: "CA", sellerType: "dealer", condition: "used",
    }),
    SITE_POLICY,
    INCENTIVE_PROGRAMS,
    new Date("2026-09-02T12:00:00Z")
  );
  assert.ok(ca.length > 1, "a used California car meets more than one program");
  const ids = (ms: typeof ca) => ms.map((m) => m.program.id).sort();

  // In-state, typed: this is what the ZIP is for — the shopper's own utility
  // out of the dozen.
  const sf = narrowToZip(ca, { state: "CA", keep: ["ca-clean-cars-4-all", "ca-pge-pre-owned-ev"], typed: true });
  assert.deepEqual(ids(sf), ["ca-clean-cars-4-all", "ca-pge-pre-owned-ev"]);
  assert.ok(sf.length < ca.length, "the other utilities are dropped");

  // Out of state: the ZIP answers nothing about California's programs, so it
  // drops none of them. Before 2026-09-04 this kept [] and the whole block
  // disappeared from every car outside the shopper's state.
  const nmTyped = narrowToZip(ca, { state: "NM", keep: ["nm-clean-car-income-tax-credit"], typed: true });
  assert.deepEqual(ids(nmTyped), ids(ca), "a New Mexico ZIP cannot answer a California program");

  // An IP guess that would empty the block is not allowed to: it says where
  // a connection came out, not where anyone lives (owner, 2026-09-04).
  assert.deepEqual(ids(narrowToZip(ca, { state: "CA", keep: [], typed: false })), ids(ca));
  // A typed ZIP may: that is the shopper telling us.
  assert.deepEqual(narrowToZip(ca, { state: "CA", keep: [], typed: true }), []);
  // No ZIP at all: everything the car meets.
  assert.deepEqual(ids(narrowToZip(ca, null)), ids(ca));
});

const RELAXED: MatchPolicy = SITE_POLICY;
const TODAY = new Date("2026-09-02T12:00:00Z");

// A 2023 Bolt EUV: the enrichment holds a row for it (EPA 247 mi, so the kind
// settles as BEV), and it is cheap enough to sit under every price cap.
const base: Listing = {
  id: "t",
  vin: "1G1FY6S04P4100001",
  year: 2023,
  make: "Chevrolet",
  model: "Bolt EUV",
  trim: "LT",
  priceUsd: 21500,
  mileage: 24000,
  state: "IL",
  sellerType: "dealer",
  condition: "used",
};
// The same car as leftover new stock: the matcher reads condition, not year.
const asNew: Listing = { ...base, condition: "new", mileage: 12, priceUsd: 27_500 };

function ids(l: Listing, policy = STRICT_POLICY) {
  return matchIncentives(enrichListing(l), policy, INCENTIVE_PROGRAMS, TODAY).map((m) => m.program.id);
}
function match(l: Listing, id: string, policy = STRICT_POLICY) {
  return matchIncentives(enrichListing(l), policy, INCENTIVE_PROGRAMS, TODAY).find((m) => m.program.id === id);
}

test("registry: every program is dated, sourced, and an ended one carries no figure", () => {
  assert.ok(INCENTIVE_PROGRAMS.length >= 20);
  for (const p of INCENTIVE_PROGRAMS) {
    assert.ok(p.sources.length > 0, `${p.id} has a source`);
    assert.match(p.statusAsOf, /^\d{4}-\d{2}-\d{2}$/, `${p.id} statusAsOf is a date`);
    if (p.status === "ended") assert.equal(p.amounts.length, 0, `${p.id} is ended and prints no figure`);
    if (p.status === "live") assert.ok(p.amounts.length > 0, `${p.id} is live and carries the program's figures`);
  }
});

test("dealer state: codes and spelled-out names map, territories and blanks do not", () => {
  assert.equal(dealerState({ state: "IL" }), "IL");
  assert.equal(dealerState({ state: "il" }), "IL");
  assert.equal(dealerState({ state: "Pennsylvania" }), "PA");
  assert.equal(dealerState({ state: "PR" }), undefined);
  assert.equal(dealerState({ state: "" }), undefined);
  assert.equal(dealerState({}), undefined);
});

test("the fixture settles as a BEV from its enrichment row", () => {
  assert.equal(vehicleKind(enrichListing(base)), "BEV");
});

test("a used BEV at an Illinois dealer under the price cap meets the Illinois rebate, and nothing else", () => {
  const m = matchIncentives(enrichListing(base), STRICT_POLICY, INCENTIVE_PROGRAMS, TODAY);
  assert.deepEqual(
    m.map((x) => x.program.id),
    ["il-ev-rebate"]
  );
  assert.equal(m[0].amountUsd, 2000, "the program's own standard figure");
  assert.ok(m[0].purchaserSideAmounts.some((a) => a.usd === 4000), "the low-income figure is stated, not asserted");
  assert.ok(m[0].purchaserConditions.some((c) => /Illinois resident/.test(c)));
  assert.deepEqual(m[0].toCheckOnTheCar, [], "strict policy states no unsettled car conditions");
});

test("no dealer state, no condition, or a private seller: no program at all", () => {
  assert.deepEqual(ids({ ...base, state: undefined }), []);
  assert.deepEqual(ids({ ...base, condition: undefined }), []);
  assert.deepEqual(ids({ ...base, sellerType: "private" }), []);
});

test("a price over the cap fails a price-paid cap; a placeholder price never passes one", () => {
  assert.deepEqual(ids({ ...base, priceUsd: 80_001 }), []);
  assert.deepEqual(ids({ ...base, priceUsd: 0 }), []);
});

test("a plug-in hybrid never meets a BEV-only program, and an unmatched car has no kind", () => {
  // 2024 Jeep Wrangler 4xe — a plug-in; the row is what settles it.
  const phev: Listing = {
    ...base,
    vin: "1C4JJXP68RW100001",
    year: 2024,
    make: "Jeep",
    model: "Wrangler 4xe",
    trim: "Sahara",
    priceUsd: 39_000,
  };
  assert.notEqual(vehicleKind(enrichListing(phev)), "BEV");
  assert.deepEqual(ids(phev), [], "Illinois pays on all-electric cars only");
  const unknown: Listing = { ...base, vin: "ZZZ00000000000001", make: "Nobody", model: "Nothing", trim: undefined };
  assert.equal(vehicleKind(enrichListing(unknown)), undefined);
  assert.deepEqual(ids(unknown), [], "an unknown kind is not a BEV");
});

test("new cars: MSRP-capped state programs are unsettled under strict policy; price-paid caps (IL, RI) are not", () => {
  for (const st of ["CO", "CT", "DE", "MA", "ME", "NJ", "NM", "NY", "OR"]) {
    // Utility programs are a separate question (their own caps, own tests below).
    assert.deepEqual(
      ids({ ...asNew, state: st }).filter((id) => programById(id)?.jurisdiction.kind !== "utility"),
      [],
      `${st}: MSRP cap is unsettled from an asking price`
    );
  }
  assert.deepEqual(ids({ ...asNew, state: "IL" }), ["il-ev-rebate"]);
  assert.ok(ids({ ...asNew, state: "RI" }).includes("ri-drive-ev"), "Rhode Island caps the price paid, which the asking price settles");
});

test("relaxed policy: an asking price under the cap names the program AND states the sticker check", () => {
  const ma = match({ ...asNew, state: "MA" }, "ma-mor-ev", RELAXED);
  assert.ok(ma, "MOR-EV named under the relaxed policy");
  assert.ok(ma!.toCheckOnTheCar.some((c) => /MSRP at or under \$55,000/.test(c)), "the MSRP cap is stated as a check, not asserted");
  assert.equal(ma!.amountUsd, 3500);
  // An MSRP cap gets no margin (owner, 2026-09-03): a car asking above the
  // cap is not labelled eligible, under either policy. The 10% margin is for
  // price-paid caps only (see the site-policy test below).
  assert.equal(match({ ...asNew, state: "MA", priceUsd: 56_000 }, "ma-mor-ev", RELAXED), undefined);
  assert.equal(match({ ...asNew, state: "MA", priceUsd: 56_000 }, "ma-mor-ev", STRICT_POLICY), undefined);
  assert.equal(match({ ...asNew, state: "MA", priceUsd: 55_000 }, "ma-mor-ev", RELAXED)?.cap?.askOverByUsd, undefined, "at the cap: named, no gap");
});

test("ended, waitlisted and out-of-state programs are never named", () => {
  assert.equal(programById("md-excise-tax-credit")?.status, "waitlist");
  assert.deepEqual(ids({ ...asNew, state: "MD" }, RELAXED), [], "Maryland's fund is depleted; a waiting list is not money on this car");
  assert.equal(programById("pa-afv-rebate")?.status, "ended");
  assert.ok(!ids({ ...base, state: "PA" }, RELAXED).includes("pa-afv-rebate"));
  assert.deepEqual(ids({ ...base, state: "TX" }, RELAXED), []);
});

test("utility programs: settled from the car alone, customer status stated; a list or a participating dealer is unsettled", () => {
  const ca: Listing = { ...base, state: "CA", priceUsd: 19_500 };
  const strict = ids(ca);
  assert.ok(strict.includes("ca-pge-pre-owned-ev"), "PG&E: used, 8 kWh or more (the Bolt EUV row holds 65 kWh), any dealer");
  assert.ok(strict.includes("ca-sdge-pre-owned-ev"));
  assert.ok(strict.includes("ca-riverside-used-ev"), "a California dealer is a California-licensed dealer");
  assert.ok(!strict.includes("ca-sce-pre-owned-ev"), "SCE gates on an Eligible Vehicle List the registry does not hold");
  assert.ok(!strict.includes("ca-ladwp-used-ev"), "LADWP gates on an approved-vehicle list");
  assert.ok(!strict.includes("ca-mce-ev-instant-rebate"), "MCE requires a participating dealer at point of sale");
  assert.ok(!strict.includes("ca-burbank-water-power-used-ev"), "Burbank is paused");
  const pge = match(ca, "ca-pge-pre-owned-ev")!;
  assert.equal(pge.amountUsd, 1000);
  assert.ok(pge.purchaserConditions.some((c) => /PG&E residential electric customer/.test(c)));
  // No pack size on the car → an 8 kWh floor is unmet, not assumed.
  const noRow: Listing = { ...ca, vin: "ZZZ00000000000001", make: "Nobody", model: "Nothing", trim: undefined };
  assert.ok(!ids(noRow).includes("ca-pge-pre-owned-ev"));
  // Every match on a utility program is a utility program, and the
  // component groups them: check the registry marks them so.
  for (const id of strict.filter((x) => x.startsWith("ca-"))) {
    assert.equal(programById(id)?.jurisdiction.kind === "utility" || id === "ca-clean-cars-4-all", true);
  }
});

test("used-car age and odometer rules read against the current year", () => {
  // Maine: used BEV, model year within 6 years, 72,000 mi or under, price paid ≤ $50,000.
  const me: Listing = { ...base, state: "ME", year: 2020, mileage: 60_000, priceUsd: 15_000, vin: "1G1FY6S06L4100003", model: "Bolt EV" };
  assert.ok(ids(me, RELAXED).includes("me-efficiency-maine-ev-rebate"));
  assert.ok(!ids({ ...me, year: 2019 }, RELAXED).includes("me-efficiency-maine-ev-rebate"), "2019 is seven years old in 2026");
  assert.ok(!ids({ ...me, mileage: 72_001 }, RELAXED).includes("me-efficiency-maine-ev-rebate"));
  assert.ok(!ids({ ...me, mileage: undefined }, RELAXED).includes("me-efficiency-maine-ev-rebate"), "no odometer is not under the odometer cap");
});

test("a KBB or market-value cap is not an asking price: strict drops it, relaxed states it", () => {
  const de: Listing = { ...base, state: "DE", priceUsd: 18_000 };
  assert.deepEqual(ids(de), []);
  const m = match(de, "de-clean-vehicle-rebate", RELAXED);
  assert.ok(m);
  assert.ok(m!.toCheckOnTheCar.some((c) => /Kelley Blue Book/.test(c)));
  assert.equal(m!.amountUsd, 2500);
});

test("a GVWR cap is never settled for a truck, and Colorado's credit stays silent without an MSRP", () => {
  const silverado: Listing = {
    ...asNew,
    vin: "1GC10YED0RU100005",
    year: 2024,
    make: "Chevrolet",
    model: "Silverado EV",
    trim: "RST",
    priceUsd: 45_000,
    state: "CO",
  };
  assert.equal(match(silverado, "co-innovative-motor-vehicle-credit", RELAXED), undefined, "9,900 lb GVWR truck cannot meet an 8,500 lb cap");
  assert.deepEqual(ids({ ...asNew, state: "CO" }), [], "strict: the MSRP cap is unsettled");
  const relaxed = match({ ...asNew, state: "CO" }, "co-innovative-motor-vehicle-credit", RELAXED);
  assert.ok(relaxed, "relaxed: a crossover under 8,500 lb with a battery over 4 kWh");
  assert.equal(relaxed!.amountUsd, 750, "the base credit; the under-$35,000 additional credit is an adder, stated beside it");
  assert.ok(relaxed!.purchaserSideAmounts.some((a) => a.usd === 2500));
});

test("New York: the range tier settles from the row and the over-$42,000 tier does not fire under it", () => {
  const ny = match({ ...asNew, state: "NY" }, "ny-drive-clean-rebate", RELAXED);
  assert.ok(ny, "named under the relaxed policy (participating dealer stated)");
  assert.ok(ny!.toCheckOnTheCar.some((c) => /eligible-vehicle list/.test(c)));
  assert.equal(ny!.amountUsd, 2000, "247 mi EPA range, asking under $42,000");
  // A car whose kind and range the enrichment cannot settle gets no figure —
  // never the $500 flat tier by default.
  const unknown: Listing = { ...asNew, state: "NY", vin: "ZZZ00000000000001", make: "Nobody", model: "Nothing", trim: undefined };
  const m = match(unknown, "ny-drive-clean-rebate", RELAXED);
  assert.ok(m, "both kinds qualify, so an unknown kind still meets the checked conditions");
  assert.equal(m!.amountUsd, undefined);
});
