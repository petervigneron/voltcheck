// findListing() must resolve an id WITHOUT walking the feed.
//
// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/find-listing.test.ts
//
// The 2026-08-22 incident: findListing()'s fallback was
// `(await allListings()).find(l => l.id === id)` — a full feed walk, 226
// PostgREST requests against a 100,297-row feed — taken on every id the
// per-VIN read didn't return. While the database is sick the per-VIN read
// misses EVERY time, and the sitemap advertises ~100,297 listing URLs, so a
// crawler working through them became a walk generator: 2,500-4,900 feed-page
// requests an hour against a ~20/hour baseline, 13 GB of disk reads over 44
// hours. The 60-second cooldown (49684cf) bounds the outage case only.
//
// Every test here counts the requests as well as checking the answer, because
// the answer was never the bug.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { findListing } from "../lib/listings/source";
import { __resetWalkFailureForTest } from "../lib/listings/db";
import { decodeSnapshot } from "../lib/listings/snapshot";

/** The committed snapshot, through the SAME decoder source.ts uses. This is the
 *  control on the compressed format (2026-08-22): scraper/ and web/ each carry
 *  their own copy of the codec across the lane boundary, and this is what stops
 *  them drifting — a snapshot the site cannot decode fails here, loudly, instead
 *  of 404ing every listing page during the outage the file exists for. */
function snapshotRows(): { id: string; vin: string }[] {
  return decodeSnapshot(JSON.parse(readFileSync("data/scraped-listings.json", "utf8"))) as unknown as {
    id: string;
    vin: string;
  }[];
}

const SUPABASE_URL = "https://example.supabase.co";

/** A request is a feed WALK page if it asks live_listings_feed for many rows
 *  in VIN order — the shape lib/listings/db.ts's fetchListingsFromDbUncached
 *  uses (`order=vin.asc`), as opposed to the single `vin=eq.` row read. The
 *  count guard that precedes a walk (`/rest/v1/listings?select=vin` with
 *  head+count) counts too: it only ever runs as part of one. */
function isWalk(url: string): boolean {
  return url.includes("order=vin.asc") || /\/rest\/v1\/listings\?select=vin\b/.test(url);
}

type Reply = { status: number; rows?: unknown[] };

/** Answers every Supabase request with `reply`, recording the URLs. */
function mockSupabase(reply: (url: string) => Reply) {
  const prev = {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_ANON_KEY,
    fetch: globalThis.fetch,
  };
  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_ANON_KEY = "test-anon-key";
  const urls: string[] = [];
  globalThis.fetch = (async (url: string | URL) => {
    const u = String(url);
    urls.push(u);
    const { status, rows } = reply(u);
    return {
      ok: status < 400,
      status,
      headers: { get: () => null },
      json: async () => rows ?? [],
      text: async () => JSON.stringify(rows ?? []),
    } as unknown as Response;
  }) as typeof fetch;
  return {
    urls,
    restore() {
      process.env.SUPABASE_URL = prev.url;
      process.env.SUPABASE_ANON_KEY = prev.key;
      globalThis.fetch = prev.fetch;
      __resetWalkFailureForTest();
    },
  };
}

const LIVE_VIN = "5yj3e1ea8lf000001";

function feedRow(id: string) {
  return {
    payload: { id, vin: id.toUpperCase(), year: 2024, make: "Tesla", model: "Model 3", priceUsd: 30000 },
    first_seen_at: "2026-01-01T00:00:00Z",
    last_seen_at: "2026-08-22T00:00:00Z",
    prev_price_usd: null,
    price_changed_at: null,
    buyback_disclosed: false,
    listed_on: null,
  };
}

// ── the id shape decides whether the database is asked at all ────────────

test("an id that is not VIN-shaped 404s without any request", async () => {
  // Both halves matter and they used to be separate tests, because a slug id
  // used to resolve: eleven demo cars (lib/listings/sample.ts) were merged
  // into the live feed and answered on their own slugs. They were deleted on
  // 2026-09-02 — a site holding 149,213 real cars has no business printing a
  // price for a hand-written one — so the only honest answer to a slug is
  // nothing, and the request-count assertion is the part that still has teeth:
  // this branch exists so a crawler working through junk URLs cannot turn
  // itself into a load generator (see resolveListing's header).
  const mock = mockSupabase(() => {
    throw new Error("the database must not be asked for a slug id");
  });
  try {
    for (const id of ["not-a-real-listing", "bolt18-lt-nodc", "my23-lr-fremont"]) {
      assert.equal(await findListing(id), undefined, `${id} must not resolve`);
    }
    assert.deepEqual(mock.urls, []);
  } finally {
    mock.restore();
  }
});

// ── the case the walk was costing us: a VIN the live feed doesn't have ───

test("a VIN the database says it doesn't have 404s WITHOUT a feed walk", async () => {
  // The old code walked all 226 pages here — on a healthy database, for
  // nothing: the walk reads the same live_listings_feed view this read does
  // (`WHERE delisted_at IS NULL`, migration 0041), so it cannot return a row
  // the by-id read just missed. A sold car is invisible to both.
  const mock = mockSupabase(() => ({ status: 200, rows: [] }));
  try {
    assert.equal(await findListing("5yj3e1ea8lf999999"), undefined);
    assert.equal(mock.urls.filter(isWalk).length, 0);
    assert.equal(mock.urls.length, 1);
  } finally {
    mock.restore();
  }
});

test("an uppercase VIN in the URL still reaches the database", async () => {
  // The canonical form is lowercase, but /listing/<UPPERCASE VIN> resolved
  // before this change (the read uppercases the id anyway) and a
  // lowercase-only shape test here would have started 404ing it.
  const mock = mockSupabase((u) =>
    u.includes("vin=eq.") ? { status: 200, rows: [feedRow(LIVE_VIN)] } : { status: 200, rows: [] }
  );
  try {
    const found = await findListing(LIVE_VIN.toUpperCase());
    assert.equal(found?.id, LIVE_VIN);
    assert.equal(mock.urls.filter(isWalk).length, 0);
  } finally {
    mock.restore();
  }
});

test("a live VIN resolves from the one row read, no walk", async () => {
  const mock = mockSupabase((u) =>
    u.includes("vin=eq.") ? { status: 200, rows: [feedRow(LIVE_VIN)] } : { status: 200, rows: [] }
  );
  try {
    const found = await findListing(LIVE_VIN);
    assert.equal(found?.id, LIVE_VIN);
    assert.equal(mock.urls.filter(isWalk).length, 0);
  } finally {
    mock.restore();
  }
});

// ── the case the fallback existed for: the database can't answer ─────────

test("a database that 500s serves the bundled snapshot, without a walk", async () => {
  // This is the outage path the old full-scan fallback was there to cover,
  // and it still resolves — the row now comes straight out of the bundled
  // JSON instead of out of a walk that fails 226 times first. The VIN is a
  // real one from the committed snapshot.
  const snapshotId = snapshotRows()[0].id;
  const mock = mockSupabase(() => ({ status: 500 }));
  try {
    const found = await findListing(snapshotId);
    assert.equal(found?.id, snapshotId);
    assert.equal(mock.urls.filter(isWalk).length, 0);
    // One read plus one retry, and nothing else: a 5xx here bakes into an
    // ISR page cached for a day, so the retry is worth two requests — but
    // only two. In particular no detail read: the database just failed to
    // answer for this VIN, so asking it again about the same car is two
    // more requests into an outage for a description it won't return.
    assert.equal(mock.urls.length, 2);
  } finally {
    mock.restore();
  }
});

test("a VIN in neither the database nor the snapshot 404s, still no walk", async () => {
  const mock = mockSupabase(() => ({ status: 500 }));
  try {
    assert.equal(await findListing("5yj3e1ea8lf999998"), undefined);
    assert.equal(mock.urls.filter(isWalk).length, 0);
  } finally {
    mock.restore();
  }
});

// ── the invariant the id-shape shortcut rests on ─────────────────────────

test("every bundled snapshot row is keyed by its own lowercase VIN", async () => {
  // The control test for the shortcut above: if a snapshot row could carry a
  // non-VIN-shaped id, skipping the database for slug ids would start losing
  // real cars. Checked here against the committed file rather than assumed,
  // so a future snapshot that breaks the rule fails loudly instead of
  // quietly 404ing.
  const rows = snapshotRows();
  assert.ok(rows.length > 0);
  const offenders = rows.filter((r) => r.id !== String(r.vin ?? "").toLowerCase() || !/^[a-z0-9]{17}$/.test(r.id));
  assert.deepEqual(offenders.slice(0, 5), []);
});

test("nothing hand-written is merged into the feed", async () => {
  // The check that keeps the demo rows from coming back. source.ts built the
  // feed as `[...db, ...SAMPLE_LISTINGS]` for months and nothing failed when
  // eleven invented cars went out with 149,213 real ones; only a person
  // reading the sitemap found them. Asserted against the source, because the
  // failure is an import, not a value.
  const src = readFileSync("lib/listings/source.ts", "utf8");
  assert.doesNotMatch(src, /SAMPLE_LISTINGS/, "source.ts must not merge hand-written listings into the feed");
  assert.doesNotMatch(src, /from "\.\/sample"/, "lib/listings/sample.ts is deleted; do not reintroduce it");
});
