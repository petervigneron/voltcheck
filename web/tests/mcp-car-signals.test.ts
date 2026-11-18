// The connector's per-car answers (lib/mcp/carSignals.ts) and compare_listings,
// through the real tools against fixture artifacts and a mocked database
// (fetch is stubbed; nothing leaves the process): last_seen on compact
// records, the asking_vs_similar band read from the published API index, the
// listing page's battery-warranty row on get_listing, and compare_listings'
// reads. Every field's silence is tested beside its answer.
import { test } from "node:test";
import assert from "node:assert/strict";
import { TOOLS, COMPACT_OMITS, INSTRUCTIONS, COMPARE_MAX } from "../lib/mcp/tools";
import { bandSet, bucketFor, carBatteryWarranty, similarBands } from "../lib/mcp/carSignals";
import { batteryWarranty } from "../lib/listings/warranty";
import { enrichListing } from "../lib/listings/enrich";
import type { ApiListing, SlimRow } from "../lib/api/records";
import type { Listing } from "../lib/listings/types";
import type { EnrichmentRow } from "../lib/types";

// ------------------------------------------------------------ fixtures

const AS_OF = new Date().toISOString();

function kia(i: number): ApiListing {
  const vin = `KNDC3DLC8P5${String(100000 + i)}`;
  return {
    id: vin.toLowerCase(),
    vin,
    url: `https://censusev.com/listing/${vin.toLowerCase()}`,
    year: 2023,
    make: "Kia",
    model: "EV6",
    title: "2023 Kia EV6",
    condition: "used",
    kind: "BEV",
    price_usd: 30000 + i * 100,
    mileage: 10000 + i,
    location: { city: "Portland", state: "OR", zip: "97201", lat: 45.5, lng: -122.7 },
    seller: { type: "dealer", name: "Example Kia", domain: "dealer.example", url: `https://dealer.example/vdp/${i}` },
    first_seen: "2026-10-02",
    last_seen: "2026-11-17",
  };
}
const KIAS = [1, 2, 3, 4].map(kia);
const kiaId = (i: number) => kia(i).id;

// Real Teslas the enrichment matches (2025 Model 3, VIN-keyed: a model year
// whose term runs past 2030, so the answer does not move under the test),
// read live by get_listing from the mocked database. T1's price is the one
// it was published at; T2's has moved since the publish.
const T1 = "5yj3e1ea8sf000001";
const T2 = "5yj3e1ea8sf000002";
const T3 = "5yj3e1ea8sf000003"; // 200,000 miles: its warranty has run out
const T4 = "5yj3e1ea8sf000004"; // a disclosed branded title
const tesla = (id: string, priceUsd: number, extra: Partial<Listing> = {}) => ({
  id,
  vin: id.toUpperCase(),
  year: 2025,
  make: "Tesla",
  model: "Model 3",
  priceUsd,
  mileage: 50000,
  condition: "used",
  sellerType: "dealer",
  zip: "98101",
  ...extra,
});
const LIVE: Record<string, Record<string, unknown>> = {
  [T1]: tesla(T1, 20000),
  [T2]: tesla(T2, 21000),
  [T3]: tesla(T3, 20000, { mileage: 200000 }),
  [T4]: tesla(T4, 20000),
};
const BRANDED = new Set([T4]);

// The band each car was published with, as the publisher writes it into the
// index's last element (0 none / 1 below / 2 typical / 3 above):
//   kia 1 below, kia 2 above, kia 3 typical, kia 4 none (could not compare);
//   T1 below at $20,000; T2 below at $20,000, but its live price has moved
//   to $21,000; T3 and T4 none.
const BANDS: Record<string, number> = { [kiaId(1)]: 1, [kiaId(2)]: 3, [kiaId(3)]: 2, [kiaId(4)]: 0, [T1]: 1, [T2]: 1, [T3]: 0, [T4]: 0 };
const slim = (id: string, slug: string, mk: string, price: number): SlimRow => [id, slug, mk, 2023, price, 10000, 1, "OR", 45.5, -122.7, 0, 310, 77, -1, "", "", "", 0, BANDS[id]];
const INDEX = {
  v: 1,
  as_of: AS_OF,
  r: [...KIAS.map((r) => slim(r.id, "kia", "ev6", r.price_usd!)), ...[T1, T2, T3, T4].map((id) => slim(id, "tesla", "model3", 20000))],
};
const MANIFEST = {
  v: 1,
  as_of: AS_OF,
  total: KIAS.length + 4,
  makes: [
    { make: "Kia", slug: "kia", count: KIAS.length, models: { EV6: KIAS.length } },
    { make: "Tesla", slug: "tesla", count: 4, models: { "Model 3": 4 } },
  ],
};


const dbUrls: string[] = [];
process.env.SUPABASE_URL = "https://fixture.supabase.example";
process.env.SUPABASE_ANON_KEY = "test-anon";
globalThis.fetch = (async (input: RequestInfo | URL) => {
  const u = String(input);
  const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
  if (u.includes("/rest/v1/")) {
    dbUrls.push(u);
    const vin = /vin=eq\.([A-Za-z0-9]+)/.exec(u)?.[1]?.toLowerCase();
    if (u.includes("/live_listings_feed?") && vin && LIVE[vin]) {
      return json([
        {
          payload: LIVE[vin],
          first_seen_at: "2026-10-01T00:00:00Z",
          last_seen_at: "2026-11-17T00:00:00Z",
          prev_price_usd: null,
          price_changed_at: null,
          buyback_disclosed: false,
          branded_title_disclosed: BRANDED.has(vin),
          listed_on: null,
        },
      ]);
    }
    return json([]);
  }
  const name = /\/feed\/([^/]+)$/.exec(u)?.[1];
  const files: Record<string, unknown> = { "api-manifest.json": MANIFEST, "api-index.json": INDEX, "api-make-kia.json": KIAS, "api-make-tesla.json": [] };
  if (name && name in files) return json(files[name]);
  return new Response("not found", { status: 404 });
}) as typeof fetch;

const tool = (name: string) => TOOLS.find((t) => t.name === name)!;
type Rec = Record<string, unknown>;
const byVin = (rs: Rec[], i: number) => rs.find((r) => r.vin === kia(i).vin)!;

// ------------------------------------------------------------ last_seen

test("compact records keep last_seen and still leave out first_seen", async () => {
  assert.equal((COMPACT_OMITS as readonly string[]).includes("last_seen"), false);
  assert.equal((COMPACT_OMITS as readonly string[]).includes("first_seen"), true);
  const r = (await tool("search_listings").handler({ make: "Kia", limit: 4 })) as { results: Rec[] };
  for (const rec of r.results) {
    assert.equal(rec.last_seen, "2026-11-17");
    assert.equal("first_seen" in rec, false);
  }
  const desc = (tool("search_listings").inputSchema as { properties: { detail: { description: string } } }).properties.detail.description;
  assert.equal(desc.includes("last_seen"), false, "the detail description no longer lists last_seen as left out");
});

// ------------------------------------------------------------ price bands
// The rule itself is tested in similar-band.test.ts; here, the reading.

test("bandSet: only cars with a band and a real price; codes outside 1-3 are none", () => {
  const row = (id: string, price: number, code?: number): SlimRow => {
    const r: SlimRow = [id, "kia", "ev6", 2023, price, 10000, 1, "OR", null, null, 0, 0, 0, -1, "", "", "", 0];
    if (code !== undefined) r.push(code);
    return r;
  };
  const set = bandSet({ v: 1, as_of: "a", r: [row("b", 30000, 1), row("t", 30000, 2), row("a", 30000, 3), row("n", 30000, 0), row("old", 30000), row("x", 30000, 7), row("free", 0, 1)] });
  assert.deepEqual([...set.byId].map(([id, v]) => [id, v.band]), [["b", "below"], ["t", "typical"], ["a", "above"]]);
});

test("bucketFor: same publish and same price, or nothing", () => {
  const set = { asOf: "a", byId: new Map([["x", { band: "below" as const, priceUsd: 30000 }]]) };
  assert.equal(bucketFor(set, "a", "x", 30000), "below");
  assert.equal(bucketFor(set, "b", "x", 30000), undefined, "a band set from another publish answers nothing");
  assert.equal(bucketFor(set, "a", "x", 30500), undefined, "a band taken at another price answers nothing");
  assert.equal(bucketFor(set, "a", "x", null), undefined);
  assert.equal(bucketFor(set, "a", "y", 30000), undefined);
  assert.equal(bucketFor(null, "a", "x", 30000), undefined);
});

test("a slow index costs the field, not the call", async () => {
  const t0 = Date.now();
  const got = await similarBands(() => new Promise(() => {}), 50);
  assert.equal(got, null);
  assert.ok(Date.now() - t0 < 1000);
});

test("search records carry asking_vs_similar exactly where the index has a band, compact and full", async () => {
  for (const detail of ["compact", "full"]) {
    const r = (await tool("search_listings").handler({ make: "Kia", limit: 4, detail })) as { results: Rec[] };
    assert.equal(byVin(r.results, 1).asking_vs_similar, "below", detail);
    assert.equal(byVin(r.results, 2).asking_vs_similar, "above", detail);
    assert.equal(byVin(r.results, 3).asking_vs_similar, "typical", detail);
    assert.equal("asking_vs_similar" in byVin(r.results, 4), false, `${detail}: could not compare is no field`);
    // Nothing a figure could be recovered from: the records carry the band
    // and no other new field (the breakdown's own median asking price of
    // every match is a different, older figure).
    const text = JSON.stringify(r.results);
    for (const leak of ["delta", "peer", "median", "spread", "gap", "ask_vs_similar", "askVsMarket", "trim_matched"]) {
      assert.equal(text.includes(leak), false, `${detail}: ${leak}`);
    }
  }
});

test("the connector reads no Pro artifact for the band", async () => {
  const seen: string[] = [];
  const inner = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    seen.push(String(input));
    return inner(input, init);
  }) as typeof fetch;
  try {
    await tool("search_listings").handler({ make: "Kia", limit: 4 });
    await tool("get_listing").handler({ vin: T1 });
  } finally {
    globalThis.fetch = inner;
  }
  assert.equal(seen.some((u) => u.includes("pro-")), false);
});

test("the REST search is untouched: no bucket, no warranty", async () => {
  const { searchListings } = await import("../lib/api/search");
  const r = await searchListings(new URLSearchParams({ make: "Kia", limit: "4" }));
  assert.ok(!("error" in r));
  if ("error" in r) return;
  for (const rec of r.results) {
    assert.equal("asking_vs_similar" in rec, false);
    assert.equal("battery_warranty" in rec, false);
  }
});

// ------------------------------------------------------------ get_listing

test("get_listing: this car's battery warranty, as its page computes it, and the bucket at its published price", async () => {
  const r = (await tool("get_listing").handler({ vin: T1.toUpperCase() })) as Rec & { battery_warranty: { status: string; in_force: boolean; estimated: boolean } };
  const l = LIVE[T1] as unknown as Listing;
  const page = batteryWarranty(enrichListing(l).row, l);
  assert.equal(page.state, "active");
  assert.deepEqual(r.battery_warranty, { status: page.state === "active" ? page.label : "", in_force: true, estimated: false });
  assert.equal(r.asking_vs_similar, "below");
  assert.equal(r.source && typeof r.source, "object");
});

test("get_listing: an expired warranty says so; a moved price gets no bucket", async () => {
  const expired = (await tool("get_listing").handler({ vin: T3 })) as Rec;
  assert.deepEqual(expired.battery_warranty, { status: "Expired", in_force: false, estimated: false });
  assert.equal("asking_vs_similar" in expired, false, "no band for this car");
  const moved = (await tool("get_listing").handler({ vin: T2 })) as Rec;
  assert.equal("asking_vs_similar" in moved, false, "its band was taken at another price");
  assert.equal((moved.battery_warranty as { in_force: boolean }).in_force, true);
});

test("get_listing: a branded title gets no warranty answer at all", async () => {
  const r = (await tool("get_listing").handler({ vin: T4 })) as Rec;
  assert.equal(r.branded_title_disclosed, true);
  assert.equal("battery_warranty" in r, false);
});

test("carBatteryWarranty: silent with no row, on a branded title, and where the function is unknown; estimated follows the page", () => {
  const l = { year: 2020, make: "Tesla", model: "Model 3", mileage: 50000 } as Listing;
  const row = { warranty: { batteryYears: { value: 8, source: "agg", asOf: "x", confidence: "high" }, batteryMiles: { value: 100000, source: "agg", asOf: "x", confidence: "high" } } } as unknown as EnrichmentRow;
  const now = new Date("2026-11-18T00:00:00Z");
  const cov = { startDate: "2021-12-23", expiresDate: "2029-12-23", expiresMileage: 134374, fromReplacement: true };
  // Even GM's own record says nothing here without a row: the page renders no
  // spec block, so it prints no warranty, and the connector matches the page.
  assert.equal(carBatteryWarranty(undefined, { ...l, batteryCoverage: cov }, now), undefined, "no row: the page renders no spec block");
  assert.equal(carBatteryWarranty(row, { ...l, brandedTitleDisclosed: true }, now), undefined);
  // A buyback with a branded flag is not a total loss: the page answers.
  assert.equal(carBatteryWarranty(row, { ...l, brandedTitleDisclosed: true, buybackDisclosed: true }, now)?.in_force, true);
  assert.deepEqual(carBatteryWarranty(row, l, now), { status: "In force · 50,000 mi left", in_force: true, estimated: true });
  // 2017-2022 Bolt with no GM record of its own: the recall abstention.
  assert.equal(carBatteryWarranty(row, { ...l, make: "Chevrolet", model: "Bolt EV", year: 2020 }, now), undefined);
  // No term at all: unknown, so nothing.
  assert.equal(carBatteryWarranty({} as EnrichmentRow, l, now), undefined);
  // GM's own record for the VIN wins, as on the page.
  assert.deepEqual(carBatteryWarranty(row, { ...l, make: "Chevrolet", model: "Bolt EV", year: 2019, batteryCoverage: cov }, now), {
    status: "In force to Dec 2029",
    in_force: true,
    estimated: true,
  });
});

// ------------------------------------------------------------ compare_listings

test("compare_listings: full records side by side, unknown VINs in not_found, no more reads than get_listing each", async () => {
  dbUrls.length = 0;
  await tool("get_listing").handler({ vin: T1 });
  const perListing = dbUrls.length;
  assert.ok(perListing > 0);

  dbUrls.length = 0;
  const missing = "5YJ3E1EA8LF999999";
  const r = (await tool("compare_listings").handler({ vins: [T1, T3.toUpperCase(), missing, "not-a-vin"] })) as {
    as_of: string;
    listings: Rec[];
    not_found: string[];
    source: unknown;
  };
  assert.ok(dbUrls.length <= perListing * 3, `${dbUrls.length} reads for 3 VINs against ${perListing} for one`);
  assert.deepEqual(r.listings.map((l) => l.vin), [T1.toUpperCase(), T3.toUpperCase()]);
  assert.deepEqual(r.not_found, [missing, "NOT-A-VIN"]);
  assert.ok(Number.isFinite(Date.parse(r.as_of)));
  assert.ok(r.source);
  assert.equal("unavailable" in r, false);
  const [a, b] = r.listings;
  assert.equal("as_of" in a, false, "one as_of, on the result");
  assert.equal(a.asking_vs_similar, "below");
  assert.equal((a.battery_warranty as { in_force: boolean }).in_force, true);
  assert.equal((b.battery_warranty as { in_force: boolean }).in_force, false);
  assert.match(String(a.url), /\?ref=mcp$/);
  // Full records: the fields compact search leaves out are here.
  assert.equal(a.id, T1);
});

test("compare_listings: two to five different VINs", async () => {
  const c = tool("compare_listings");
  await assert.rejects(() => c.handler({ vins: [T1] }), /2 to 5/);
  await assert.rejects(() => c.handler({ vins: [T1, T1.toUpperCase()] }), /2 to 5/, "duplicates count once");
  await assert.rejects(() => c.handler({ vins: Array.from({ length: COMPARE_MAX + 1 }, (_, i) => `5YJ3E1EA8LF00010${i}`) }), /2 to 5/);
  await assert.rejects(() => c.handler({ vins: "5YJ3E1EA8LF000001" }), /array/);
  await assert.rejects(() => c.handler({}), /array/);
  const schema = c.inputSchema as { properties: { vins: { minItems: number; maxItems: number } }; required: string[] };
  assert.equal(schema.properties.vins.minItems, 2);
  assert.equal(schema.properties.vins.maxItems, 5);
  assert.deepEqual(schema.required, ["vins"]);
  assert.equal(c.title, "Compare listings");
  assert.deepEqual(c.annotations, tool("get_listing").annotations);
});

test("instructions name the new tool and fields", () => {
  for (const s of ["compare_listings", "last_seen", "battery_warranty", "asking_vs_similar", "not an appraisal"]) assert.ok(INSTRUCTIONS.includes(s), s);
  for (const name of ["search_listings", "get_listing"]) assert.ok(tool(name).description.includes("not an appraisal"), name);
});
