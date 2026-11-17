// What the connector hands an assistant, end to end through the real search
// against fixture artifacts (fetch is stubbed; nothing leaves the process):
// compact against full records, a breakdown over every match rather than the
// page, the seller link through /go in connector results only, and the
// source on every response. Then the two model tools, battery_warranty on
// real enrichment rows and market_snapshot on fixture figures, including the
// path where the database does not answer.
import { test } from "node:test";
import assert from "node:assert/strict";
import { TOOLS, SOURCE, COMPACT_OMITS } from "../lib/mcp/tools";
import { searchListings, breakdownOf } from "../lib/api/search";
import { batteryWarranty, marketSnapshot, shapeMarketSnapshot, bounded, resolveHub, WARRANTY_CAVEAT } from "../lib/mcp/insights";
import type { ApiListing, SlimRow } from "../lib/api/records";
import type { HubIndex } from "../lib/listings/hubIndex";
import type { Market } from "../lib/market";
import type { ModelSpeed } from "../lib/listings/speed";

// ------------------------------------------------------------ fixtures

const AS_OF = new Date().toISOString();
const TRIMS = ["Wind", "GT-Line", "Light"];

function kia(i: number): ApiListing {
  const vin = `KNDC3DLC8P5${String(100000 + i)}`;
  return {
    id: vin.toLowerCase(),
    vin,
    url: `https://censusev.com/listing/${vin.toLowerCase()}`,
    year: 2022 + (i % 3),
    make: "Kia",
    model: "EV6",
    ...(i % 5 === 4 ? {} : { trim: TRIMS[i % 3] }),
    title: `${2022 + (i % 3)} Kia EV6`,
    condition: "used",
    kind: "BEV",
    price_usd: i === 0 ? null : 30000 + i * 100,
    previous_price_usd: 40000,
    price_changed_at: "2026-11-01",
    price_cut: { usd: 900, at: "2026-11-10" },
    mileage: 10000 + i,
    location: { city: "Portland", state: "OR", zip: "97201", lat: 45.5, lng: -122.7 },
    seller: { type: "dealer", name: "Example Kia", domain: "dealer.example", url: `https://dealer.example/vdp/${i}` },
    image_url: "https://img.example/x.jpg",
    battery: { kwh: 77, basis: "usable", estimated: false },
    range: { mi: 310, estimated: true, electric_only: false },
    listed_on: "2026-10-01",
    first_seen: "2026-10-02",
    last_seen: "2026-11-17",
  };
}
const KIAS = Array.from({ length: 30 }, (_, i) => kia(i));
const IONIQ: ApiListing = { ...kia(99), id: "km8krdaf1pu000001", vin: "KM8KRDAF1PU000001", make: "Hyundai", model: "Ioniq 5", trim: "SEL", price_usd: 41000 };
const slim = (r: ApiListing, makeSlug: string, mk: string): SlimRow => [
  r.id, makeSlug, mk, r.year, r.price_usd ?? 0, r.mileage ?? -1, 1, "OR", 45.5, -122.7, 0, 310, 77, -1, "", "", "", 0,
];
const INDEX = { v: 1, as_of: AS_OF, r: [...KIAS.map((r) => slim(r, "kia", "ev6")), slim(IONIQ, "hyundai", "ioniq5")] };
const MANIFEST = {
  v: 1,
  as_of: AS_OF,
  total: 31,
  makes: [
    { make: "Kia", slug: "kia", count: 30, models: { EV6: 30 } },
    { make: "Hyundai", slug: "hyundai", count: 1, models: { "Ioniq 5": 1 } },
  ],
};
const FILES: Record<string, unknown> = { "api-manifest": MANIFEST, "api-index": INDEX, "api-make-kia": KIAS, "api-make-hyundai": [IONIQ] };

process.env.SUPABASE_URL = "https://fixture.supabase.example";
globalThis.fetch = (async (input: RequestInfo | URL) => {
  const name = /\/feed\/([^/]+)\.json$/.exec(String(input))?.[1];
  if (name && name in FILES) return new Response(JSON.stringify(FILES[name]), { status: 200 });
  return new Response("not found", { status: 404 });
}) as typeof fetch;

const tool = (name: string) => TOOLS.find((t) => t.name === name)!;
type Out = Record<string, unknown> & { results: Record<string, unknown>[]; breakdown: Record<string, unknown> };

// ------------------------------------------------------------ search

test("compact is the default and leaves out exactly what its description says", async () => {
  const r = (await tool("search_listings").handler({ make: "Kia", model: "EV6", limit: 2 })) as Out;
  assert.equal(r.results.length, 2);
  const rec = r.results[0] as Record<string, unknown> & { location: Record<string, unknown>; seller: Record<string, unknown> };
  for (const k of COMPACT_OMITS) assert.equal(k in rec, false, k);
  assert.deepEqual(Object.keys(rec.location).sort(), ["city", "state"]);
  // What an assistant shows a car with stays.
  for (const k of ["vin", "url", "year", "make", "model", "title", "price_usd", "mileage", "seller", "battery", "range", "price_cut", "condition", "kind"]) assert.ok(k in rec, k);
  assert.deepEqual(rec.range, { mi: 310, estimated: true, electric_only: false }, "estimated flags survive");
  // The schema's description names every omitted field.
  const desc = (tool("search_listings").inputSchema as { properties: { detail: { description: string } } }).properties.detail.description;
  for (const k of [...COMPACT_OMITS, "location.zip", "location.lat", "location.lng"]) assert.ok(desc.includes(k), k);
});

test("full returns every field, with the connector's links", async () => {
  const r = (await tool("search_listings").handler({ make: "Kia", model: "EV6", limit: 2, sort: "mileage_asc", detail: "full" })) as Out;
  const rec = r.results[0] as Record<string, unknown> & { seller: { url: string; name: string; domain: string }; location: Record<string, unknown> };
  for (const k of [...COMPACT_OMITS]) assert.ok(k in rec, k);
  assert.equal(rec.location.zip, "97201");
  assert.equal(rec.seller.url, `https://censusev.com/go/${rec.id}?ref=mcp`);
  assert.equal(rec.seller.domain, "dealer.example");
  assert.equal(rec.url, `https://censusev.com/listing/${rec.id}?ref=mcp`);
  await assert.rejects(() => tool("search_listings").handler({ detail: "everything" }), /detail/);
});

test("the REST search's records are plain and carry no breakdown", async () => {
  const r = await searchListings(new URLSearchParams({ make: "Kia", model: "EV6", limit: "2" }));
  assert.ok(!("error" in r));
  if ("error" in r) return;
  assert.equal("breakdown" in r, false);
  assert.match(r.results[0].seller.url!, /^https:\/\/dealer\.example\/vdp\/\d+$/);
  assert.equal(r.results[0].url.includes("?"), false);
  assert.ok("image_url" in r.results[0], "REST records are not compacted");
});

test("the breakdown covers every match, not the page", async () => {
  const r = (await tool("search_listings").handler({ make: "Kia", model: "EV6", limit: 2 })) as Out;
  assert.equal(r.total, 30);
  const b = r.breakdown as { by_year: { year: number; n: number }[]; by_trim: { trim: string; n: number }[]; asking_usd: Record<string, number> };
  assert.deepEqual(b.by_year, [{ year: 2024, n: 10 }, { year: 2023, n: 10 }, { year: 2022, n: 10 }]);
  assert.equal(b.by_trim.reduce((s, t) => s + t.n, 0), 24, "the six cars with no stated trim are not given one");
  assert.deepEqual(b.asking_usd, { n: 29, min: 30100, median: 31500, max: 32900 }, "the car with no real price is not in it");
});

test("cars of more than one model get no trim list", async () => {
  const r = (await tool("search_listings").handler({ limit: 1 })) as Out;
  assert.equal(r.total, 31);
  assert.equal("by_trim" in r.breakdown, false);
  assert.equal((r.breakdown.by_year as { n: number }[]).reduce((s, y) => s + y.n, 0), 31);
});

test("breakdownOf: top trims capped, empty set is empty", () => {
  const rows = Array.from({ length: 12 }, (_, i) => [`id${i}`, "k", "m", 2024, 0, -1, 1, "", null, null, 0, 0, 0, -1, "", "", "", 0] as SlimRow);
  const b = breakdownOf(rows, (id) => `T${id}`);
  assert.equal(b.by_trim!.length, 8);
  assert.equal(b.asking_usd, undefined, "no real price, no price summary");
  assert.deepEqual(breakdownOf([]), { by_year: [] });
});

test("every tool response names its source", async () => {
  const s = await tool("search_listings").handler({ limit: 1 });
  const m = await tool("list_models").handler({});
  const w = await tool("battery_warranty").handler({ make: "Kia", model: "EV6", year: 2023 });
  for (const r of [s, m, w]) assert.deepEqual((r as { source: unknown }).source, { name: "Census EV", url: "https://censusev.com" });
  assert.deepEqual(SOURCE, { name: "Census EV", url: "https://censusev.com" });
});

// ------------------------------------------------------------ battery_warranty

const NOW = new Date("2026-11-18T00:00:00Z");

test("battery_warranty: a 2023 Kia EV6 at 42,000 mi is 10 yr / 100,000 mi, in force, 70% floor", () => {
  const r = batteryWarranty({ make: "Kia", model: "EV6", year: 2023, mileage: 42000 }, NOW);
  assert.equal(r.established, true);
  assert.deepEqual(r.terms, [{ years: 10, miles: 100000, estimated: false }]);
  assert.match(r.status!, /^In force/);
  assert.equal(r.capacity_floor_pct, 70);
  assert.equal(r.caveat, WARRANTY_CAVEAT);
  assert.equal(r.fact_sheet, "https://censusev.com/facts/kia/ev6/battery-warranty?ref=mcp");
});

test("battery_warranty: a 2022 Tesla Model 3 has two terms and no status", () => {
  const r = batteryWarranty({ make: "Tesla", model: "Model 3", year: 2022, mileage: 1000 }, NOW);
  assert.equal(r.established, true);
  assert.ok(r.terms!.length >= 2);
  assert.equal(r.status, undefined);
});

test("battery_warranty: a 2019 Bolt EV has its term and no status, whatever the spelling", () => {
  const r = batteryWarranty({ make: "chevy", model: "BOLT EV", year: 2019, mileage: 20000 }, NOW);
  assert.deepEqual(r.terms!.map((t) => [t.years, t.miles]), [[8, 100000]]);
  assert.equal(r.status, undefined);
  assert.equal(r.make, "Chevrolet");
});

test("battery_warranty: a model with no rows is not established, and gets no fallback term", () => {
  const r = batteryWarranty({ make: "Lucid", model: "Gravity", year: 2025 }, NOW);
  // Lucid's battery-warranty sheet is linked from the Gravity page too; the
  // answer itself is silent.
  assert.deepEqual(Object.keys(r).sort(), ["established", "fact_sheet", "make", "model", "year"]);
  assert.equal(r.established, false);
  // A year the rows do not cover is the same answer, with the sheet when there is one.
  const old = batteryWarranty({ make: "Kia", model: "EV6", year: 1999 }, NOW);
  assert.equal(old.established, false);
  assert.equal(old.terms, undefined);
  assert.equal(old.fact_sheet, "https://censusev.com/facts/kia/ev6/battery-warranty?ref=mcp");
});

test("battery_warranty: an expired warranty prints no floor or transfer, as the page does", () => {
  const r = batteryWarranty({ make: "Nissan", model: "Leaf", year: 2020, mileage: 130000 }, NOW);
  assert.equal(r.status, "Expired");
  assert.equal(r.capacity_floor_pct, undefined);
  assert.equal(r.transfers, undefined);
});

test("battery_warranty: a name with no model page is an error naming the argument", () => {
  assert.throws(() => batteryWarranty({ make: "Kia", model: "EV7", year: 2023 }, NOW), /^Error: model: .*EV6/);
  assert.throws(() => batteryWarranty({ make: "Nope", model: "EV6", year: 2023 }, NOW), /^Error: make: /);
  assert.throws(() => batteryWarranty({ make: "Kia", model: "EV6", year: "soon" }, NOW), /^Error: year: /);
  assert.throws(() => batteryWarranty({ make: "Kia", model: "EV6", year: 2023, mileage: -5 }, NOW), /^Error: mileage: /);
  assert.equal(resolveHub("Mercedes", "EQB").make, "Mercedes-Benz");
});

// ------------------------------------------------------------ market_snapshot

const HUB_INDEX: HubIndex = {
  v: 1,
  asOf: "2026-11-17",
  hubs: {
    "hyundai/ioniq-5": {
      total: 1234,
      cars: [],
      stats: {
        asOf: "2026-11-17",
        byCondition: { new: 600, used: 600, certified: 34 },
        cuts: 10,
        years: [
          { year: 2021, n: 3, priced: 3 },
          { year: 2022, n: 300, priced: 290, medianUsd: 27995, medianMiles: 41000 },
          { year: 2023, n: 40, priced: 4, medianMiles: 20000 },
        ],
        configs: [],
        states: [],
      },
    },
  },
};
const MARKET: Market = {
  asOf: "2026-11-17",
  sold: [],
  national: [],
  site: [],
  rows: [
    { path: "/ev/hyundai/ioniq-5", make: "Hyundai", model: "Ioniq 5", cars: 900, ask: 26400, change30: -1.2, change60: null },
    { path: "/ev/kia/ev6", make: "Kia", model: "EV6", cars: 50, ask: 29000, change30: 1, change60: 2 },
  ],
};
const SPEED = new Map<string, ModelSpeed>([["/ev/hyundai/ioniq-5", { listed: 812, pct: 41, from: "2026-09-01", to: "2026-10-15" }]]);

test("market_snapshot: the model page's and /market's figures, nothing else", async () => {
  const r = await marketSnapshot({ make: "Hyundai", model: "IONIQ 5" }, { hubIndex: async () => HUB_INDEX, market: async () => MARKET, speed: async () => SPEED });
  assert.deepEqual(r, {
    make: "Hyundai",
    model: "Ioniq 5",
    page: "https://censusev.com/ev/hyundai/ioniq-5?ref=mcp",
    for_sale: 1234,
    as_of: "2026-11-17",
    by_year: [
      { year: 2022, for_sale: 300, median_asking_usd: 27995 },
      { year: 2023, for_sale: 40, median_asking_usd: null },
    ],
    asking_at_40000_mi_usd: 26400,
    change_30d_pct: -1.2,
    change_60d_pct: null,
    market_as_of: "2026-11-17",
    no_longer_listed_after_30_days_pct: 41,
    no_longer_listed_window: { from: "2026-09-01", to: "2026-10-15", used_cars_listed: 812 },
  });
});

test("market_snapshot: a /market row under its car floor is not printed", () => {
  const ev6 = resolveHub("Kia", "EV6");
  const r = shapeMarketSnapshot(ev6, { total: 50, cars: [] }, "2026-11-17", MARKET, new Map());
  assert.equal(r.asking_at_40000_mi_usd, undefined);
  assert.equal(r.change_30d_pct, undefined);
  assert.equal(r.no_longer_listed_after_30_days_pct, undefined);
  assert.deepEqual(r.by_year, []);
});

test("market_snapshot: a database that fails or hangs costs its fields, not the answer", async () => {
  const r = await marketSnapshot(
    { make: "Hyundai", model: "Ioniq 5" },
    {
      hubIndex: async () => HUB_INDEX,
      market: async () => {
        throw new Error("market: market_snapshot answered 500");
      },
      speed: (signal) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")))),
    },
    50,
  );
  assert.equal(r.for_sale, 1234);
  assert.equal(r.by_year.length, 2);
  for (const k of ["asking_at_40000_mi_usd", "change_30d_pct", "change_60d_pct", "market_as_of", "no_longer_listed_after_30_days_pct", "no_longer_listed_window"]) assert.equal(k in r, false, k);
});

test("market_snapshot: no hub artifact is an error, a wrong name is an error naming it", async () => {
  const deps = { hubIndex: async () => null, market: async () => MARKET, speed: async () => SPEED };
  await assert.rejects(() => marketSnapshot({ make: "Hyundai", model: "Ioniq 5" }, deps, 50), /not available/);
  await assert.rejects(() => marketSnapshot({ make: "Hyundai", model: "Ioniq 55" }, deps, 50), /^Error: model: /);
});

test("bounded: a read that never answers resolves null at the deadline", async () => {
  const t = Date.now();
  assert.equal(await bounded(() => new Promise<number>(() => {}), 30), null);
  assert.ok(Date.now() - t < 1000);
  assert.equal(await bounded(async () => 7, 30), 7);
});
