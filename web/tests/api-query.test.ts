// The public API's query engine (lib/api/query.ts): every filter, the sort
// order, paging, and the parser's refusal of vocabulary it does not know.
//
// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/api-query.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseQuery, resolveMake, runQuery, DEFAULT_LIMIT, DEFAULT_RADIUS_MI } from "../lib/api/query";
import type { SlimRow } from "../lib/api/records";

// [id, make, model, year, price, mileage, cond, state, lat, lng, kind, range, kwh, hp, port, drive, body, firstSeenDay]
const rows: SlimRow[] = [
  ["a", "tesla", "model3", 2022, 25000, 30000, 1, "CA", 37.77, -122.42, 0, 272, 60, 1, "NACS", "RWD", "sedan", 20700],
  ["b", "tesla", "modely", 2024, 38000, 8000, 2, "OR", 45.52, -122.68, 0, 310, 75, 1, "NACS", "AWD", "suv", 20710],
  ["c", "hyundai", "ioniq5", 2023, 0, 12000, 1, "CA", 34.05, -118.24, 0, 303, 77, 0, "CCS1", "AWD", "suv", 20690],
  ["d", "jeep", "wrangler4xe", 2021, 32000, 40000, 1, "TX", 29.76, -95.37, 1, 21, 17, -1, "", "AWD", "suv", 20650],
  ["e", "chevrolet", "boltev", 2019, 14000, 90000, 1, "CA", 37.77, -122.42, 0, 238, 60, 0, "CCS1", "FWD", "hatchback", 0],
  ["f", "ford", "mustangmache", 2026, 45000, -1, 0, "WA", 47.61, -122.33, 0, 300, 91, 1, "NACS", "AWD", "suv", 20712],
];
const SF: [number, number] = [37.77, -122.42];

test("parse: defaults, normalisation, and the errors an agent needs to see", () => {
  const { query, errors } = parseQuery(new URLSearchParams("make=Mercedes-Benz&model=EQE%20350%2B&price_max=$40,000&condition=used,certified&state=ca&zip=94110-1234&sort=year_desc"));
  assert.deepEqual(errors, []);
  assert.equal(query.make, "mercedes-benz");
  assert.equal(query.model, "eqe350+");
  assert.equal(query.priceMax, 40000);
  assert.deepEqual([...query.condition!], ["used", "certified"]);
  assert.deepEqual([...query.states!], ["CA"]);
  assert.equal(query.zip, "94110");
  assert.equal(query.radiusMi, DEFAULT_RADIUS_MI);
  assert.equal(query.limit, DEFAULT_LIMIT);
  const bad = parseQuery({ condition: "cpo", kind: "hybrid", sort: "cheapest", limit: 5000, zip: "9411" });
  assert.equal(bad.errors.length, 5, bad.errors.join("; "));
  assert.equal(parseQuery({ sort: "distance" }).errors[0], "sort=distance needs a zip");
});

test("filters: make, model, price bound excludes cars with no real price, kind, state, facts", () => {
  const ids = (q: Record<string, unknown>, origin?: [number, number]) => runQuery(rows, parseQuery(q).query, origin).page.map(([id]) => id);
  assert.deepEqual(ids({ make: "Tesla" }), ["a", "b"]);
  assert.deepEqual(ids({ model: "Model Y" }), ["b"]);
  assert.deepEqual(ids({ price_max: 30000 }), ["e", "a"], "ioniq 5 with no real price is not 'under $30k'");
  assert.deepEqual(ids({ kind: "PHEV" }), ["d"]);
  assert.deepEqual(ids({ state: "CA,OR", sort: "year_desc" }), ["b", "c", "a", "e"]);
  assert.deepEqual(ids({ heat_pump: "yes", charge_port: "nacs" }), ["a", "b", "f"]);
  assert.deepEqual(ids({ range_min: 300, drive: "AWD" }), ["b", "f", "c"]);
  assert.deepEqual(ids({ mileage_max: 10000 }), ["b"], "unknown mileage is not under any cap");
  assert.deepEqual(ids({ body: "hatchback,sedan" }), ["e", "a"]);
  assert.deepEqual(ids({ year_min: 2023, year_max: 2024, condition: "used,certified" }), ["b", "c"]);
});

test("zip: a radius filter, distance sort by default, and no location means no match", () => {
  const r = runQuery(rows, parseQuery({ zip: "94110", radius_mi: 50 }).query, SF);
  assert.deepEqual(r.page.map(([id]) => id), ["e", "a"], "price asc breaks the tie at zero miles");
  assert.equal(r.distances!.get("a"), 0);
  const wide = runQuery(rows, parseQuery({ zip: "94110", radius_mi: 3000, sort: "price_desc" }).query, SF);
  assert.deepEqual(wide.page.map(([id]) => id), ["f", "b", "d", "a", "e", "c"]);
});

test("sorts put cars without a price or mileage last, and paging is stable", () => {
  const r = runQuery(rows, parseQuery({ sort: "price_asc", limit: 2 }).query);
  assert.equal(r.total, 6);
  assert.deepEqual(r.page.map(([id]) => id), ["e", "a"]);
  const p2 = runQuery(rows, parseQuery({ sort: "price_asc", limit: 2, offset: 2 }).query);
  assert.deepEqual(p2.page.map(([id]) => id), ["d", "b"]);
  const last = runQuery(rows, parseQuery({ sort: "price_asc", limit: 2, offset: 4 }).query);
  assert.deepEqual(last.page.map(([id]) => id), ["f", "c"], "the priceless car is last");
  assert.deepEqual(runQuery(rows, parseQuery({ sort: "mileage_asc" }).query).page.at(-1)![0], "f");
  assert.deepEqual(runQuery(rows, parseQuery({ sort: "newest" }).query).page.map(([id]) => id), ["f", "b", "a", "c", "d", "e"]);
});

// ── Audit of 2026-11-17: four ways a search answered wrongly without saying so ──

test("an unknown parameter is refused and the one that was meant is named", () => {
  const e = (q: string | Record<string, unknown>) => parseQuery(typeof q === "string" ? new URLSearchParams(q) : q).errors;
  // The live failure: max_price=20000 answered every car on the site.
  assert.match(e("max_price=20000")[0], /^max_price: not a parameter.*did you mean price_max\?/);
  assert.match(e({ maxPrice: 20000 })[0], /did you mean price_max\?/);
  assert.match(e("max_miles=50000")[0], /did you mean mileage_max\?/);
  assert.match(e("fuel_type=BEV")[0], /did you mean kind\?/);
  assert.match(e("body_type=suv")[0], /did you mean body\?/);
  assert.match(e("radius=50&zip=94110")[0], /did you mean radius_mi\?/);
  assert.match(e("modle=Leaf")[0], /did you mean model\?/);
  // Nothing close: still refused, with no guess attached, and the vocabulary follows.
  const far = e("foo=bar");
  assert.equal(far[0], "foo: not a parameter this search takes");
  assert.match(far[1], /^parameters: make, model, /);
  // Every documented parameter still parses clean.
  assert.deepEqual(e("make=Kia&model=EV6&year_min=2022&year_max=2025&price_min=1&price_max=9&mileage_max=5&condition=used&kind=bev&state=CA&zip=94110&radius_mi=5&range_min=1&kwh_min=1&heat_pump=yes&charge_port=NACS&drive=AWD&body=suv&sort=newest&limit=1&offset=0"), []);
});

test("a make is found under the name people call it", () => {
  const make = (m: string) => parseQuery({ make: m }).query.make;
  assert.equal(make("Mercedes"), "mercedes-benz");
  assert.equal(make("VW"), "volkswagen");
  assert.equal(make("chevy"), "chevrolet");
  assert.equal(make("Mercedes-Benz"), "mercedes-benz");
  assert.equal(make("Tesla"), "tesla");
  const known = ["land-rover", "alfa-romeo", "tesla"];
  assert.equal(resolveMake("LandRover", known), "land-rover");
  assert.equal(resolveMake("Alfa", known), "alfa-romeo");
  // A make that is nobody's alias is left alone, to match nothing honestly.
  assert.equal(resolveMake("Tesler", known), "tesler");
});

test("a car with no answer matches neither side of a filter, and is counted", () => {
  const more: SlimRow[] = [
    ...rows,
    // No kind, no condition, no heat-pump answer; otherwise a cheap CA Tesla.
    ["g", "tesla", "model3", 2019, 21000, 60000, -1, "CA", 37.77, -122.42, -1, 0, 0, -1, "NACS", "", "sedan", 20700],
  ];
  const run = (q: Record<string, unknown>) => runQuery(more, parseQuery(q).query);
  const bev = run({ make: "Tesla", kind: "BEV" });
  assert.deepEqual(bev.page.map(([id]) => id), ["a", "b"]);
  assert.deepEqual(bev.notEstablished, { kind: 1 });
  assert.deepEqual(run({ make: "Tesla", kind: "PHEV" }).notEstablished, { kind: 1 });
  // Counted only when every OTHER filter passes: g is not under $20,000.
  assert.deepEqual(run({ make: "Tesla", kind: "BEV", price_max: 20000 }).notEstablished, {});
  assert.deepEqual(run({ state: "CA", condition: "used", heat_pump: "yes" }).notEstablished, { condition: 1, heat_pump: 1 });
  // No such filter asked, nothing to report, and the car is in the result.
  const all = run({ make: "Tesla" });
  assert.equal(all.total, 3);
  assert.deepEqual(all.notEstablished, {});
});
