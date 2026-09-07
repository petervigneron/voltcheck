// A car that is no longer listed gets a page, not a 404 — and getting there
// must cost one primary-key read, never a walk.
//
// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/delisted-listing.test.ts
//
// Google's 2026-09-07 "Not found (404)" notice was this class: a listing
// indexed off the grid, sold a week later, answering Next's stock error
// page. findDelistedListing() reads delisted_listings_recent (0071), which
// holds cars delisted in the last 30 days and nothing else, so the same
// call is also the 30-day gate — an empty answer is the 404 it always was.
import test from "node:test";
import assert from "node:assert/strict";
import { findDelistedListing } from "../lib/listings/source";
import { __resetWalkFailureForTest } from "../lib/listings/db";

const SUPABASE_URL = "https://example.supabase.co";

function isWalk(url: string): boolean {
  return url.includes("order=vin.asc") || /\/rest\/v1\/listings\?select=vin\b/.test(url);
}

type Reply = { status: number; rows?: unknown[] };

function mockSupabase(reply: (url: string) => Reply) {
  const prev = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_ANON_KEY, fetch: globalThis.fetch };
  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_ANON_KEY = "test-anon-key";
  const urls: string[] = [];
  globalThis.fetch = (async (url: string | URL) => {
    const u = String(url);
    urls.push(u);
    const r = reply(u);
    return new Response(JSON.stringify(r.rows ?? []), {
      status: r.status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return {
    urls,
    restore() {
      process.env.SUPABASE_URL = prev.url;
      process.env.SUPABASE_ANON_KEY = prev.key;
      globalThis.fetch = prev.fetch;
    },
  };
}

const VIN = "5YJ3E1EA5RF824810";
const ROW = {
  payload: {
    id: VIN.toLowerCase(),
    vin: VIN,
    year: 2024,
    make: "Tesla",
    model: "Model 3",
    priceUsd: 31337,
    mileage: 26518,
    condition: "used",
    city: "Daly City",
    state: "CA",
    dealerName: "Concord Honda",
    sourceUrl: "https://www.concordhonda.com/used/x.htm",
  },
  first_seen_at: "2026-08-11T03:43:54Z",
  last_seen_at: "2026-08-24T09:00:00Z",
  delisted_at: "2026-08-26T15:51:11Z",
  price_usd: 31337,
  buyback_disclosed: false,
  branded_title_disclosed: false,
};

test.beforeEach(() => __resetWalkFailureForTest());

test("a recently delisted VIN resolves with one read of the delisted view and no walk", async () => {
  const m = mockSupabase((u) => (u.includes("/rest/v1/delisted_listings_recent?") ? { status: 200, rows: [ROW] } : { status: 200, rows: [] }));
  try {
    const l = await findDelistedListing(VIN.toLowerCase());
    assert.ok(l, "resolved");
    assert.equal(l.delistedAt, ROW.delisted_at);
    assert.equal(l.lastSeenAt, ROW.last_seen_at);
    assert.equal(l.priceUsd, 31337);
    assert.equal(l.make, "Tesla");
    assert.equal(m.urls.length, 1, `requests: ${m.urls.join("\n")}`);
    assert.match(m.urls[0], /delisted_listings_recent\?.*vin=eq\.5YJ3E1EA5RF824810/);
    assert.ok(!m.urls.some(isWalk), "no feed walk");
  } finally {
    m.restore();
  }
});

test("a VIN the view does not hold (older than 30 days, or never ours) is undefined — the 404 path", async () => {
  const m = mockSupabase(() => ({ status: 200, rows: [] }));
  try {
    assert.equal(await findDelistedListing(VIN.toLowerCase()), undefined);
    assert.equal(m.urls.length, 1);
    assert.ok(!m.urls.some(isWalk));
  } finally {
    m.restore();
  }
});

test("an id that is not VIN-shaped costs no request", async () => {
  const m = mockSupabase(() => ({ status: 200, rows: [ROW] }));
  try {
    assert.equal(await findDelistedListing("sample-1"), undefined);
    assert.equal(m.urls.length, 0);
  } finally {
    m.restore();
  }
});

test("a server error is retried once, then answers undefined rather than throwing", async () => {
  const m = mockSupabase(() => ({ status: 503 }));
  try {
    assert.equal(await findDelistedListing(VIN.toLowerCase()), undefined);
    assert.equal(m.urls.length, 2);
  } finally {
    m.restore();
  }
});
