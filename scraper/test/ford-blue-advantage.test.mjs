// The Ford Blue Advantage pull against a fake marketplace that behaves like
// the real one on 2026-09-07: a 400-record browsable window per query, honest
// totalResultCount, minPrice/maxPrice honoured, ~2% of cars priceless, and the
// certified cars restated as CERTIFIED on USED pages.
import { test } from "node:test";
import assert from "node:assert/strict";
import { pullFordBlueAdvantage, readBand } from "../lib/oem/ford-blue-advantage.mjs";

const WINDOW = 400;

function car(i, { year, dg, lt, price, group = "ELE" }) {
  const vin = `1FTVW1EV${String(i).padStart(9, "0")}`.slice(0, 17);
  return {
    vin, year, listingType: lt, modelCode: group === "ELE" ? "FORDMACHE" : "ESCAPE",
    model: { name: "Mustang Mach-E" }, trim: { name: "Premium" },
    fuelType: group === "ELE" ? { code: "E", group: "Electric" } : { code: "B", group: "Plug-in Hybrid: Gas/Electric" },
    driveType: { name: dg === "AWD4WD" ? "AWD" : "RWD" },
    pricingDetail: price == null ? { noPriceLabel: "Contact Dealer For Price" } : { salePrice: price },
    mileage: { value: "12,345" },
    owner: { name: "Test Ford", website: { href: `https://test-ford.example/inventory/${vin}`, deepLink: true }, location: { address: { city: "Buena Park", state: "CA", zip: "90621" } } },
    images: { primary: 0, sources: [] },
    _dg: dg, _group: group,
  };
}

// A fake marketplace: `cars` is the full inventory; the api answers a query
// string the way the real proxy does, including the window.
function fakeApi(cars, { ignorePrice = false } = {}) {
  const calls = [];
  const api = async (params) => {
    calls.push(params);
    const p = new URLSearchParams(params);
    const lt = p.get("listingType"), group = p.get("fuelTypeGroup"), dg = p.get("driveGroup");
    const y = Number(p.get("startYear"));
    const lo = p.has("minPrice") ? Number(p.get("minPrice")) : null, hi = p.has("maxPrice") ? Number(p.get("maxPrice")) : null;
    let hits = cars.filter((c) => c._group === group && c._dg === dg && c.year === y);
    // USED pages carry certified cars too, restated as CERTIFIED.
    if (lt === "CERTIFIED") hits = hits.filter((c) => c.listingType === "CERTIFIED");
    if (!ignorePrice && lo != null) hits = hits.filter((c) => c.pricingDetail.salePrice != null && c.pricingDetail.salePrice >= lo && c.pricingDetail.salePrice <= hi);
    const fr = Number(p.get("firstRecord")), n = Number(p.get("numRecords"));
    const page = fr >= WINDOW ? [] : hits.slice(fr, Math.min(fr + n, WINDOW));
    return { totalResultCount: hits.length, listings: page };
  };
  return { api, calls };
}

function inventory() {
  const cars = [];
  let i = 0;
  // A slice three times the window (AWD4WD/2023, like the real 1,254), with
  // prices spread so bisection has to go a few levels deep, 2% priceless, and
  // 300 of them certified.
  for (let k = 0; k < 1254; k++) cars.push(car(i++, { year: 2023, dg: "AWD4WD", lt: k < 300 ? "CERTIFIED" : "USED", price: k % 50 === 0 ? null : 20_000 + (k * 37) % 30_000 }));
  // A slice that fits the window untouched.
  for (let k = 0; k < 150; k++) cars.push(car(i++, { year: 2022, dg: "RWD", lt: "USED", price: 30_000 + k }));
  // PHEVs, one small FWD slice.
  for (let k = 0; k < 40; k++) cars.push(car(i++, { year: 2017, dg: "FWD", lt: "USED", price: 15_000 + k, group: "PIH" }));
  return cars;
}

test("collects every priced car of a slice three times the window, certified first", async () => {
  const cars = inventory();
  const { api, calls } = fakeApi(cars);
  const report = await pullFordBlueAdvantage({ api });
  const got = new Set(report.evs.map((r) => r.vin));
  const priced = cars.filter((c) => c.pricingDetail.salePrice != null);
  assert.ok(priced.every((c) => got.has(c.vin)), "every priced car is collected");
  // Priceless cars fall outside every price band, so the bisected slice loses
  // them (ingest drops a priceless row anyway); a slice read whole keeps them.
  assert.ok(got.size <= cars.length && got.size >= priced.length);
  assert.equal(report.evs.filter((r) => r.certified).length, 300);
  assert.equal(report.evs.filter((r) => r.condition === "used").length, got.size - 300);
  assert.equal(report.evs.filter((r) => r.evKind === "PHEV").length, 40);
  assert.equal(report.truncated, true, "a marketplace snapshot never certifies completeness");
  assert.ok(!report.notes.some((n) => /dropped/.test(n)), `no dropped tails: ${report.notes.join(" | ")}`);
  // No single query was ever asked to page past the window.
  assert.ok(calls.every((c) => Number(new URLSearchParams(c).get("firstRecord")) < WINDOW));
  // The small slice was read whole, without bisection.
  assert.ok(!calls.some((c) => /startYear=2022.*minPrice/.test(c)), "a slice under the window is not bisected");
});

test("a price filter the server ignores is read once and noted, not recursed to the dollar", async () => {
  const cars = inventory().filter((c) => c.year === 2023);
  const { api, calls } = fakeApi(cars, { ignorePrice: true });
  const byVin = new Map();
  const report = { fetched: 0, errors: [], notes: [] };
  await readBand("listingType=USED&fuelTypeGroup=ELE&driveGroup=AWD4WD&startYear=2023&endYear=2023", 0, 400_000, cars.length, { group: "ELE", evKind: "BEV" }, byVin, report, api, "t");
  assert.ok(byVin.size <= WINDOW && byVin.size > 350, `read the window's worth, got ${byVin.size}`);
  assert.equal(report.notes.length, 1);
  assert.match(report.notes[0], /price filter ignored, 1254 reported, \d+ dropped/);
  assert.ok(calls.length < 10, `bounded probing, made ${calls.length} calls`);
});

test("the collected-count floor flags a lane that lost the USED facet", async () => {
  const cars = inventory().filter((c) => c.listingType === "CERTIFIED");
  const { api } = fakeApi(cars);
  const report = await pullFordBlueAdvantage({ api });
  assert.equal(report.evs.length, 300); // the certified slice fits the window and is read whole, priceless cars included
  assert.ok(report.errors.some((e) => /< floor 1500/.test(e)));
});
