// The /shop question pages' pure half: the registry, the question-to-query
// mapping, the per-model aggregation and every string they print.
//
// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/shop.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { slimEstimated, slimRow, toApiListing, type ApiListing, type ApiManifest, type SlimRow } from "../lib/api/records";
import { enrichListing } from "../lib/listings/enrich";
import type { Listing } from "../lib/listings/types";
import {
  formatSpan,
  formatYears,
  shopCarRow,
  shopCountLine,
  shopDescription,
  shopItemListJsonLd,
  shopMatches,
  shopModelRow,
  shopModels,
  shopQuery,
} from "../lib/listings/shop";
import { findShopQuestion, SHOP_QUESTIONS, shopHeading, shopNeighbours, shopPath, type ShopQuestion } from "../lib/listings/shopQuestions";
import { modelNamer } from "../lib/listings/shopSearch";

const q = (slug: string) => findShopQuestion(slug)!;

// [id, make, model, year, price, miles, cond, state, lat, lng, kind, range, kwh, hp, port, drive, body, firstSeen, band, est]
const row = (id: string, o: Partial<{ make: string; model: string; year: number; price: number; cond: number; kind: number; range: number; kwh: number; hp: number; port: string; drive: string; body: string; est: number }> = {}): SlimRow => [
  id, o.make ?? "chevrolet", o.model ?? "boltev", o.year ?? 2020, o.price ?? 18000, 40000, o.cond ?? 1, "CA", null, null,
  o.kind ?? 0, o.range ?? 259, o.kwh ?? 65, o.hp ?? -1, o.port ?? "CCS1", o.drive ?? "FWD", o.body ?? "hatchback", 0, 0, o.est ?? 0,
];

test("registry: unique slugs, every heading distinct, no merit words", () => {
  const slugs = SHOP_QUESTIONS.map((x) => x.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  for (const s of slugs) assert.match(s, /^[a-z0-9-]+$/);
  const heads = SHOP_QUESTIONS.map(shopHeading);
  assert.equal(new Set(heads).size, heads.length);
  for (const h of heads) assert.doesNotMatch(h, /\bbest\b|\btop\b|\bcheapest\b|recommend/i);
  assert.equal(findShopQuestion("nope"), undefined);
  assert.equal(shopPath(q("used-ev-under-25000")), "/shop/used-ev-under-25000");
});

test("headings are built from the fields", () => {
  assert.equal(shopHeading(q("used-ev-under-25000")), "Used electric cars under $25,000");
  assert.equal(shopHeading(q("used-plug-in-hybrid-under-20000")), "Used plug-in hybrids under $20,000");
  assert.equal(shopHeading(q("used-ev-250-miles-range-under-30000")), "Used electric cars with 250+ miles of EPA range under $30,000");
  assert.equal(shopHeading(q("used-ev-heat-pump-under-30000")), "Used electric cars with a heat pump under $30,000");
  assert.equal(shopHeading(q("used-ev-nacs-under-30000")), "Used electric cars with a NACS charge port under $30,000");
  assert.equal(shopHeading(q("used-electric-suv-under-30000")), "Used electric SUVs under $30,000");
  assert.equal(shopHeading(q("used-electric-truck-under-50000")), "Used electric trucks under $50,000");
  assert.equal(shopHeading(q("used-awd-ev-under-25000")), "Used all-wheel-drive electric cars under $25,000");
  assert.equal(shopHeading(q("new-ev-under-35000")), "New electric cars under $35,000");
  const both: ShopQuestion = { slug: "x", condition: "used", kind: "BEV", under: 30000, rangeMin: 300, heatPump: true };
  assert.equal(shopHeading(both), "Used electric cars with 300+ miles of EPA range and a heat pump under $30,000");
});

test("query: used includes certified, every filter maps", () => {
  const lq = shopQuery(q("used-awd-ev-under-25000"));
  assert.deepEqual([...lq.condition!].sort(), ["certified", "used"]);
  assert.equal(lq.kind, "BEV");
  assert.equal(lq.priceMax, 25000);
  assert.deepEqual([...lq.drives!], ["AWD"]);
  assert.equal(lq.sort, "price_asc");
  assert.deepEqual([...shopQuery(q("new-ev-under-35000")).condition!], ["new"]);
  assert.equal(shopQuery(q("used-ev-heat-pump-under-30000")).heatPump, "yes");
  assert.deepEqual([...shopQuery(q("used-ev-nacs-under-30000")).ports!], ["NACS"]);
  assert.deepEqual([...shopQuery(q("used-electric-truck-under-50000")).bodies!], ["truck"]);
  assert.equal(shopQuery(q("used-ev-300-miles-range-under-40000")).rangeMin, 300);
});

test("matches: strict price bound, unknowns never count, cheapest first", () => {
  const rows = [
    row("a", { price: 25000 }), // not under $25,000
    row("b", { price: 24999.5 }),
    row("c", { price: 12000 }),
    row("d", { price: 0 }), // no real price
    row("e", { cond: -1 }), // condition unknown
    row("f", { kind: -1 }), // kind unknown
    row("g", { kind: 1 }), // a PHEV
    row("h", { cond: 0 }), // new
    row("i", { cond: 2, price: 20000 }), // certified is used
  ];
  assert.deepEqual(shopMatches(rows, q("used-ev-under-25000")).map((r) => r[0]), ["c", "i", "b"]);
});

test("matches: heat pump counts only an established yes", () => {
  const rows = [row("y", { hp: 1 }), row("n", { hp: 0 }), row("u", { hp: -1 })];
  assert.deepEqual(shopMatches(rows, q("used-ev-heat-pump-under-30000")).map((r) => r[0]), ["y"]);
});

test("matches: EPA range only — an estimated range does not count; NACS likewise", () => {
  const rows = [
    row("epa", { range: 259 }),
    row("est", { range: 280, est: 1 }),
    row("short", { range: 240 }),
    row("kwhEst", { range: 255, est: 2 }), // battery estimated, range EPA
  ];
  assert.deepEqual(shopMatches(rows, q("used-ev-250-miles-range-under-30000")).map((r) => r[0]).sort(), ["epa", "kwhEst"]);
  const ports = [row("n1", { port: "NACS" }), row("n2", { port: "NACS", est: 4 }), row("c", { port: "CCS1" })];
  assert.deepEqual(shopMatches(ports, q("used-ev-nacs-under-30000")).map((r) => r[0]), ["n1"]);
});

test("matches: a range question refuses an index without the estimated bits", () => {
  const old = [row("a").slice(0, 19) as SlimRow];
  assert.equal(slimEstimated(old[0]), undefined);
  assert.throws(() => shopMatches(old, q("used-ev-250-miles-range-under-30000")), /estimated bits/);
  assert.throws(() => shopMatches(old, q("used-ev-nacs-under-30000")), /estimated bits/);
  assert.equal(shopMatches(old, q("used-ev-under-25000")).length, 1);
});

const manifest: ApiManifest = {
  v: 1,
  as_of: "2026-11-18T19:18:52.553Z",
  total: 0,
  makes: [
    { make: "Chevrolet", slug: "chevrolet", count: 3, models: { "Bolt EV": 5, "BOLT EV": 1, "Spark EV": 2 } },
    { make: "Nissan", slug: "nissan", count: 1, models: { Leaf: 1 } },
  ],
};

test("models: grouped by model page, most cars first, median at the floor, spans marked", () => {
  const hits = [
    row("1", { price: 10000, year: 2017, range: 238, kwh: 60 }),
    row("2", { price: 12000, year: 2018, range: 238, kwh: 60 }),
    row("3", { price: 14000, year: 2019, range: 259, kwh: 66 }),
    row("4", { price: 16000, year: 2021, range: 259, kwh: 66, est: 2 }),
    row("5", { price: 18000, year: 2022, range: 247, kwh: 65, est: 2 }),
    row("6", { model: "sparkev", price: 9000, year: 2016, range: 82, kwh: 19, est: 1 }),
    row("7", { make: "nissan", model: "leaf", price: 8000, year: 2018, range: 0, kwh: 0 }),
  ];
  const models = shopModels(hits, modelNamer(manifest));
  assert.deepEqual(models.map((m) => [m.name, m.n]), [
    ["Chevrolet Bolt EV", 5],
    ["Chevrolet Spark EV", 1],
    ["Nissan Leaf", 1],
  ]);
  const bolt = shopModelRow(models[0]);
  assert.equal(bolt.href, "/ev/chevrolet/bolt-ev");
  assert.equal(bolt.cars, "5");
  assert.equal(bolt.lowest, "$10,000");
  assert.equal(bolt.median, "$14,000");
  assert.equal(bolt.range, "238–259 mi");
  // 65 kWh is held only by a car whose pack is estimated; 66 by one that is not.
  assert.equal(bolt.battery, "60–66 kWh");
  assert.equal(bolt.years, "2017–2019, 2021–2022");
  const spark = shopModelRow(models[1]);
  assert.equal(spark.href, undefined, "no model page, no link");
  assert.equal(spark.median, undefined, "under the floor, no median");
  assert.equal(spark.range, "82 (est) mi");
  const leaf = shopModelRow(models[2]);
  assert.equal(leaf.range, undefined, "nothing printed for an absence");
  assert.equal(leaf.battery, undefined);
});

test("models: spans are withheld when the index cannot say which figures are estimated", () => {
  const hits = [row("1").slice(0, 19) as SlimRow];
  const [m] = shopModels(hits, modelNamer(manifest));
  assert.equal(m.range, undefined);
  assert.equal(m.battery, undefined);
});

test("models: a plug-in hybrid's range is labelled electric", () => {
  const [m] = shopModels([row("1", { kind: 1, range: 32 }), row("2", { kind: 1, range: 42 })], modelNamer(manifest));
  assert.equal(shopModelRow(m).range, "32–42 mi electric");
});

test("spans and years format", () => {
  assert.equal(formatSpan({ lo: 220, hi: 310, loEst: true, hiEst: false }, "mi"), "220 (est)–310 mi");
  assert.equal(formatSpan({ lo: 77, hi: 77, loEst: false, hiEst: false }, "kWh"), "77 kWh");
  assert.equal(formatYears([2017, 2018, 2019, 2021]), "2017–2019, 2021");
  assert.equal(formatYears([2024]), "2024");
});

test("count line and description", () => {
  assert.equal(shopCountLine(4512, manifest.as_of), "4,512 cars · United States · as of Nov 18, 2026");
  assert.equal(shopCountLine(1, "garbage"), "1 car · United States");
  const models = shopModels(
    [row("1", { price: 10000 }), row("2", { price: 11000 }), row("3", { price: 12000 }), row("4", { price: 13000 }), row("5", { price: 14000 }), row("6", { make: "nissan", model: "leaf" })],
    modelNamer(manifest),
  );
  assert.equal(
    shopDescription(q("used-ev-under-15000"), 6, models, manifest.as_of),
    "6 used electric cars under $15,000 for sale in the United States, as of Nov 18, 2026. Chevrolet Bolt EV: 5 cars, median $12,000; Nissan Leaf: 1 car.",
  );
  assert.equal(shopDescription(q("used-ev-under-15000"), 0, [], manifest.as_of), "0 used electric cars under $15,000 for sale in the United States, as of Nov 18, 2026.");
});

test("neighbours: one budget down and up, same question otherwise", () => {
  assert.deepEqual(shopNeighbours(q("used-ev-under-25000")), {
    lower: { label: "Under $20,000", href: "/shop/used-ev-under-20000" },
    higher: { label: "Under $30,000", href: "/shop/used-ev-under-30000" },
  });
  assert.deepEqual(shopNeighbours(q("used-ev-under-15000")), { higher: { label: "Under $20,000", href: "/shop/used-ev-under-20000" } });
  assert.deepEqual(shopNeighbours(q("used-ev-250-miles-range-under-30000")), { higher: { label: "Under $40,000", href: "/shop/used-ev-250-miles-range-under-40000" } });
  assert.deepEqual(shopNeighbours(q("used-ev-heat-pump-under-30000")), {});
});

test("item list: the table's models, with a URL only where a model page exists", () => {
  const j = shopItemListJsonLd(q("used-ev-under-25000"), [{ name: "Chevrolet Bolt EV", href: "/ev/chevrolet/bolt-ev" }, { name: "Chevrolet Spark EV" }]);
  assert.equal(j["@type"], "ItemList");
  assert.equal(j.numberOfItems, 2);
  assert.deepEqual(j.itemListElement, [
    { "@type": "ListItem", position: 1, name: "Chevrolet Bolt EV", url: "https://censusev.com/ev/chevrolet/bolt-ev" },
    { "@type": "ListItem", position: 2, name: "Chevrolet Spark EV" },
  ]);
});

test("car row: full title, the near page's marks and disclosure labels", () => {
  const rec: ApiListing = {
    id: "1g1fz6s00k4000001",
    vin: "1G1FZ6S00K4000001",
    url: "",
    year: 2019,
    make: "Chevrolet",
    model: "Bolt EV",
    trim: "LT",
    title: "2019 Chevrolet Bolt EV LT",
    condition: "used",
    price_usd: 11995,
    mileage: 61000,
    location: { city: "Austin", state: "TX" },
    seller: { type: "dealer" },
    range: { mi: 238, estimated: false, electric_only: false },
    branded_title_disclosed: true,
  };
  const r = shopCarRow(rec);
  assert.equal(r.car, "2019 Chevrolet Bolt EV LT");
  assert.equal(r.href, "/listing/1g1fz6s00k4000001");
  assert.equal(r.price, "$11,995");
  assert.equal(r.miles, "61,000");
  assert.equal(r.range, "238 mi");
  assert.equal(r.place, "Austin, TX");
  assert.deepEqual(r.flags, ["Branded title"]);
});

test("slim row carries the estimated bits from the record", () => {
  const l = { id: "5yj3e1ea4mf099936", vin: "5YJ3E1EA4MF099936", year: 2021, make: "Tesla", model: "Model 3", priceUsd: 25000, sellerType: "dealer" } as unknown as Listing;
  const e = enrichListing(l);
  const rec = toApiListing(e, { realPrice: true });
  const bits = (r: ApiListing) => slimRow(r, e)[19]!;
  assert.equal(bits({ ...rec, range: undefined, battery: undefined, charge_port: undefined }), 0);
  assert.equal(bits({ ...rec, range: { mi: 300, estimated: true, electric_only: false } }) & 1, 1);
  assert.equal(bits({ ...rec, battery: { kwh: 75, basis: "usable", estimated: true } }) & 2, 2);
  assert.equal(bits({ ...rec, charge_port: { standard: "NACS", estimated: true } }) & 4, 4);
});
