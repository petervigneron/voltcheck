// lib/listings/near.ts + lib/listings/nearSearch.ts: the near-a-ZIP page's
// parameters, rows and links. From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs --test tests/near.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  conditionSet,
  isNearZip,
  nearAsking,
  nearCountLine,
  nearHeading,
  nearLinks,
  nearPath,
  nearQuery,
  nearRow,
  parseNearParams,
  typedZip,
} from "../lib/listings/near";
import { hubRows, nearListingQuery } from "../lib/listings/nearSearch";
import { findModelHub, MODEL_HUBS } from "../lib/listings/modelHubs";
import { makeSlug, type ApiListing, type SlimRow } from "../lib/api/records";
import { runQuery } from "../lib/api/query";

const ev6 = findModelHub("kia", "ev6")!;
const nx = findModelHub("lexus", "nx-450h-plus")!;

test("parameters: defaults, clamps, junk dropped, unknown keys ignored", () => {
  assert.deepEqual(parseNearParams(new URLSearchParams("")), { radius: 100 });
  assert.deepEqual(
    parseNearParams(new URLSearchParams("condition=Used&max_price=$28,000&max_miles=40000&year_min=2023&radius=50&utm_source=x&foo=1")),
    { condition: "used", maxPrice: 28000, maxMiles: 40000, yearMin: 2023, radius: 50 },
  );
  // clamps
  assert.equal(parseNearParams(new URLSearchParams("radius=9000")).radius, 500);
  assert.equal(parseNearParams(new URLSearchParams("radius=0")).radius, 100);
  assert.equal(parseNearParams(new URLSearchParams("radius=-5")).radius, 100);
  assert.equal(parseNearParams(new URLSearchParams("radius=0.4")).radius, 100);
  assert.equal(parseNearParams(new URLSearchParams("radius=0.6")).radius, 1);
  assert.equal(parseNearParams(new URLSearchParams("year_min=1900")).yearMin, 1990);
  assert.equal(parseNearParams(new URLSearchParams("year_min=99999")).yearMin, 2100);
  assert.equal(parseNearParams(new URLSearchParams("max_price=1e12")).maxPrice, 10_000_000);
  assert.equal(parseNearParams(new URLSearchParams("max_miles=5000000")).maxMiles, 1_000_000);
  // a cap of zero or less is no cap; zero miles is a real cap
  assert.equal(parseNearParams(new URLSearchParams("max_price=0")).maxPrice, undefined);
  assert.equal(parseNearParams(new URLSearchParams("max_miles=0")).maxMiles, 0);
  assert.equal(parseNearParams(new URLSearchParams("max_miles=-1")).maxMiles, undefined);
  // unreadable values drop
  assert.deepEqual(parseNearParams(new URLSearchParams("condition=cpo&max_price=cheap&radius=far&year_min=")), { radius: 100 });
  // the Next searchParams shape, with a repeated key
  assert.deepEqual(parseNearParams({ condition: ["new", "used"], max_price: "30000", radius: undefined }), {
    condition: "new",
    maxPrice: 30000,
    radius: 100,
  });
});

test("ZIPs: the path takes five digits; the form also takes ZIP+4", () => {
  assert.ok(isNearZip("60614"));
  for (const z of ["6061", "606145", "60614-1234", "abcde", " 60614"]) assert.ok(!isNearZip(z), z);
  assert.equal(typedZip(" 60614 "), "60614");
  assert.equal(typedZip("60614-1234"), "60614");
  assert.equal(typedZip("6061"), undefined);
  assert.equal(typedZip(null), undefined);
});

test("one search has one URL: fixed order, default radius left out", () => {
  const p = parseNearParams(new URLSearchParams("radius=100&year_min=2022&max_price=28000&condition=used"));
  assert.equal(nearQuery(p), "?condition=used&max_price=28000&year_min=2022");
  assert.equal(nearPath(ev6, "60614", p), "/ev/kia/ev6/near/60614?condition=used&max_price=28000&year_min=2022");
  assert.equal(nearPath(ev6, "60614", { radius: 100 }), "/ev/kia/ev6/near/60614");
  assert.equal(nearPath(ev6, "60614", { radius: 250 }), "/ev/kia/ev6/near/60614?radius=250");
});

test("heading and count line say the filters, and nothing else", () => {
  assert.equal(nearHeading("Kia EV6", "60614", { radius: 100 }), "Kia EV6 for sale near 60614");
  assert.equal(
    nearHeading("Kia EV6", "60614", { radius: 100, condition: "used", maxPrice: 28000 }),
    "Used Kia EV6 up to $28,000 for sale near 60614",
  );
  assert.equal(nearCountLine(1, { radius: 100 }, "2026-11-18T08:04:59Z"), "1 car · within 100 miles · as of Nov 18, 2026");
  assert.equal(
    nearCountLine(1234, { radius: 50, maxMiles: 40000, yearMin: 2023 }, "2026-11-18"),
    "1,234 cars · within 50 miles · 40,000 miles or less · 2023 or newer · as of Nov 18, 2026",
  );
  assert.equal(nearCountLine(0, { radius: 100 }, "garbage"), "0 cars · within 100 miles");
});

test("used includes certified", () => {
  assert.deepEqual([...conditionSet("used")], ["used", "certified"]);
  assert.deepEqual([...conditionSet("certified")], ["certified"]);
  assert.deepEqual([...conditionSet("new")], ["new"]);
});

const rec = (over: Partial<ApiListing> = {}): ApiListing => ({
  id: "knde34ab1n5000001",
  vin: "KNDE34AB1N5000001",
  url: "https://censusev.com/listing/knde34ab1n5000001",
  year: 2023,
  make: "Kia",
  model: "EV6",
  title: "2023 Kia EV6 Wind",
  price_usd: 27450,
  location: { city: "Evanston", state: "IL", zip: "60201" },
  seller: { type: "dealer" },
  ...over,
});

test("a row: every value from the record, est marked, absences empty", () => {
  const r = nearRow(
    rec({
      trim: "Wind",
      condition: "certified",
      mileage: 21345,
      range: { mi: 310, estimated: false, electric_only: false },
      battery: { kwh: 77, basis: "usable", estimated: true },
      last_seen: "2026-11-17",
    }),
    11.6,
    "EV6",
  );
  assert.deepEqual(r, {
    id: "knde34ab1n5000001",
    href: "/listing/knde34ab1n5000001",
    car: "2023 Wind",
    condition: "Certified",
    price: "$27,450",
    miles: "21,345",
    place: "Evanston, IL",
    distance: "12 mi",
    range: "310 mi",
    battery: "77 kWh (est)",
    lastSeen: "Nov 17",
    flags: [],
  });
  const bare = nearRow(rec({ price_usd: null, location: {} }), undefined, "EV6");
  assert.deepEqual(bare, { id: "knde34ab1n5000001", href: "/listing/knde34ab1n5000001", car: "2023 EV6", flags: [] });
});

test("a plug-in hybrid's range says electric; disclosures ride on the row", () => {
  const r = nearRow(
    rec({
      range: { mi: 37, estimated: true, electric_only: true },
      buyback_disclosed: true,
      branded_title_disclosed: true,
    }),
    3,
    "NX 450h+",
  );
  assert.equal(r.range, "37 mi electric (est)");
  assert.deepEqual(r.flags, ["Manufacturer buyback", "Branded title"]);
});

test("asking price prints only over the model page's floor", () => {
  assert.equal(nearAsking(undefined), undefined);
  assert.equal(nearAsking({ by_year: [], asking_usd: { n: 4, min: 1, median: 2, max: 3 } }), undefined);
  assert.deepEqual(nearAsking({ by_year: [], asking_usd: { n: 5, min: 24000, median: 31250, max: 52990 } }), {
    n: 5,
    min: "$24,000",
    median: "$31,250",
    max: "$52,990",
  });
});

test("wider and narrower links each change one thing", () => {
  const p = { radius: 100, condition: "used" as const, maxPrice: 28000 };
  const { wider, narrower } = nearLinks(ev6, "60614", p);
  assert.deepEqual(wider, [
    { label: "Within 200 miles", href: "/ev/kia/ev6/near/60614?condition=used&max_price=28000&radius=200" },
    { label: "Any price", href: "/ev/kia/ev6/near/60614?condition=used" },
    { label: "Any condition", href: "/ev/kia/ev6/near/60614?max_price=28000" },
  ]);
  assert.deepEqual(narrower, [{ label: "Within 50 miles", href: "/ev/kia/ev6/near/60614?condition=used&max_price=28000&radius=50" }]);

  const open = nearLinks(ev6, "60614", { radius: 500 }, { by_year: [], asking_usd: { n: 9, min: 20000, median: 31750, max: 50000 } });
  assert.deepEqual(open.wider, []);
  assert.deepEqual(
    open.narrower.map((l) => l.label),
    ["Within 250 miles", "New", "Used", "Certified", "Up to $31,000"],
  );
  // no price link from a median the page does not print
  const thin = nearLinks(ev6, "60614", { radius: 10 }, { by_year: [], asking_usd: { n: 2, min: 1, median: 30000, max: 3 } });
  assert.deepEqual(thin.narrower.map((l) => l.label), ["New", "Used", "Certified"]);
});

test("every hub's make slug is the slug the API index files its cars under", () => {
  for (const h of MODEL_HUBS) assert.equal(makeSlug(h.make), h.makeSlug, `${h.make} ${h.model}`);
});

const slim = (id: string, make: string, model: string, year: number, price: number, miles: number, cond: number, lat: number, lng: number): SlimRow => [
  id, make, model, year, price, miles, cond, "IL", lat, lng, 0, 300, 77, -1, "", "", "", 0,
];

test("the hub's every spelling is searched, nearest first, and used takes certified", () => {
  const rows: SlimRow[] = [
    slim("a", "lexus", "nx450h+", 2023, 50000, 10000, 1, 41.92, -87.65),
    slim("b", "lexus", "nx450hplus", 2024, 52000, 5000, 2, 41.95, -87.66),
    slim("c", "lexus", "nx350h", 2024, 40000, 5000, 1, 41.92, -87.65),
    slim("d", "toyota", "nx450h+", 2024, 40000, 5000, 1, 41.92, -87.65),
    slim("e", "lexus", "nx450h+", 2022, 30000, 5000, 0, 41.92, -87.65),
    slim("f", "lexus", "nx450h+", 2022, 30000, 5000, 1, 34.05, -118.24),
  ];
  const mine = hubRows(rows, nx);
  assert.deepEqual(mine.map((r) => r[0]), ["a", "b", "e", "f"]);
  const q = nearListingQuery({ radius: 100, condition: "used", maxPrice: 60000 });
  assert.equal(q.sort, "distance");
  assert.equal(q.limit, 50);
  const r = runQuery(mine, q, [41.92, -87.65]);
  assert.deepEqual(r.page.map(([id]) => id), ["a", "b"]);
  assert.equal(r.total, 2);
});
