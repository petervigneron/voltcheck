// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/db-short-read.test.ts
//
// The 2026-08-21 incident: the feed walk in lib/listings/db.ts came back
// 58,741 rows against a database that actually held ~97,800 (a mid-write
// salvage sync), and the guard that existed at the time only console.error'd
// — the short read still got rendered AND cached for the routes' full
// FEED_REVALIDATE_SECONDS/`revalidate = 86400` day. This exercises the fix:
// classifyFeedRead's calibration (reused verbatim from
// scraper/lib/sync-guard-logic.mjs, not re-guessed), and that a FAIL-level
// read still serves its rows (never throws — that would recreate the
// "flapping to stale fallback" failure the file's own comments describe)
// while triggering the cache-escape hatch instead of letting the render
// freeze into the day-long cache.
import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyFeedRead,
  fetchListingsFromDbUncached,
  SHORT_READ_WARN_DROP,
  SHORT_READ_FAIL_DROP,
  __setFeedCacheEscapeForTest,
} from "../lib/listings/db";

// ── classifyFeedRead: the pure calibration, no network involved ──────────

test("classifyFeedRead matches the reused sync-guard calibration (8% warn / 15% fail)", () => {
  assert.equal(SHORT_READ_WARN_DROP, 0.08);
  assert.equal(SHORT_READ_FAIL_DROP, 0.15);
});

test("a complete read is ok", () => {
  assert.equal(classifyFeedRead(1000, 1000), "ok");
});

test("real measured night-over-night churn (1.0-2.4%) never fires", () => {
  // scraper/lib/sync-guard-logic.mjs cites two real nights at 2.4% and 1.0%.
  assert.equal(classifyFeedRead(1000 - 24, 1000), "ok"); // 2.4%
  assert.equal(classifyFeedRead(1000 - 10, 1000), "ok"); // 1.0%
});

test("just under the warn floor is still ok, just over it is warn", () => {
  assert.equal(classifyFeedRead(1000 - 79, 1000), "ok"); // 7.9%
  assert.equal(classifyFeedRead(1000 - 80, 1000), "warn"); // 8.0%
});

test("just under the fail floor is warn, just over it is fail", () => {
  assert.equal(classifyFeedRead(1000 - 149, 1000), "warn"); // 14.9%
  assert.equal(classifyFeedRead(1000 - 150, 1000), "fail"); // 15.0%
});

test("tonight's actual incident numbers classify as fail", () => {
  // 87,082 -> 58,741 (sync-guard.mjs's own account of the incident) is a
  // ~32.5% drop; 97,800 -> 58,741 (this fix's brief) is ~40%. Either way,
  // nowhere near the 8-15% band — it's a clear fail, not a borderline case.
  assert.equal(classifyFeedRead(58_741, 87_082), "fail");
  assert.equal(classifyFeedRead(58_741, 97_800), "fail");
});

test("no count to compare against means no verdict, not a guessed one", () => {
  assert.equal(classifyFeedRead(12, null), "ok");
  assert.equal(classifyFeedRead(0, null), "ok");
});

// ── fetchListingsFromDbUncached: the render/cache split under a real walk ──

const SUPABASE_URL = "https://example.supabase.co";

function jsonHeaders(contentRange?: string) {
  return { get: (name: string) => (name.toLowerCase() === "content-range" ? (contentRange ?? null) : null) };
}

function fakeRow(n: number) {
  return {
    vin: `1FAKEVIN${String(n).padStart(8, "0")}`,
    payload: { id: `fake${n}`, vin: `1FAKEVIN${String(n).padStart(8, "0")}`, make: "Test", model: "T", year: 2024, priceUsd: 40000 },
    first_seen_at: "2026-01-01T00:00:00Z",
    last_seen_at: "2026-08-21T00:00:00Z",
    prev_price_usd: null,
    price_changed_at: null,
    buyback_disclosed: false,
    listed_on: null,
  };
}

/** Installs a fetch mock for one fetchListingsFromDbUncached() call: the
 *  count endpoint reports `total`; the feed walk returns `rowCount` rows
 *  total, all from the very first bucket range's first page so the test
 *  doesn't have to reason about all 36 buckets. Returns a restore function. */
function mockSupabase(total: number | "unreachable", rowCount: number) {
  const prevEnv = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_ANON_KEY };
  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_ANON_KEY = "test-anon-key";
  const prevFetch = globalThis.fetch;
  let firstBucketPageServed = false;
  globalThis.fetch = (async (url: string | URL) => {
    const u = String(url);
    if (u.includes("/rest/v1/listings?select=vin")) {
      if (total === "unreachable") throw new Error("simulated network failure");
      return {
        ok: true,
        status: 200,
        headers: jsonHeaders(`0-0/${total}`),
      } as unknown as Response;
    }
    if (u.includes("/rest/v1/live_listings_feed")) {
      // Only the first page of the first range ("gte.0", no "gt." cursor
      // yet) carries rows; every other bucket/page is a legitimate empty
      // read, same as a real walk over sparse VIN space.
      const isFirstRangeFirstPage = u.includes("vin=gte.0") && !u.includes("vin=gt.") && !firstBucketPageServed;
      const rows = isFirstRangeFirstPage ? Array.from({ length: rowCount }, (_, i) => fakeRow(i)) : [];
      if (isFirstRangeFirstPage) firstBucketPageServed = true;
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify(rows),
      } as unknown as Response;
    }
    throw new Error(`unexpected fetch in test: ${u}`);
  }) as typeof fetch;
  return () => {
    globalThis.fetch = prevFetch;
    process.env.SUPABASE_URL = prevEnv.url;
    process.env.SUPABASE_ANON_KEY = prevEnv.key;
  };
}

test("a truncated read is still served to the visitor, but escapes the day-long cache", async () => {
  const calls: number[] = [];
  const restoreEscape = __setFeedCacheEscapeForTest((shardCount) => {
    calls.push(shardCount);
  });
  const restoreFetch = mockSupabase(1000, 600); // 40% short — well past the 15% fail floor
  try {
    const rows = await fetchListingsFromDbUncached();
    assert.ok(rows, "a short read must still be served, not turned into null/fallback");
    assert.equal(rows!.length, 600, "the visitor gets what was actually read, not a blocked/empty response");
    assert.deepEqual(calls, [6], "a FAIL-level short read must trigger exactly one cache-escape call (SHARDS=6)");
  } finally {
    restoreFetch();
    restoreEscape();
  }
});

test("a normal read serves its rows and never touches the cache-escape hatch", async () => {
  const calls: number[] = [];
  const restoreEscape = __setFeedCacheEscapeForTest((shardCount) => {
    calls.push(shardCount);
  });
  const restoreFetch = mockSupabase(1000, 995); // 0.5% short — ordinary drift
  try {
    const rows = await fetchListingsFromDbUncached();
    assert.ok(rows);
    assert.equal(rows!.length, 995);
    assert.deepEqual(calls, [], "an ordinary read must not schedule an early revalidate");
  } finally {
    restoreFetch();
    restoreEscape();
  }
});

test("a warn-level read serves its rows and never touches the cache-escape hatch", async () => {
  // Warn is "worth a human's attention", not "don't trust this" — only fail
  // escapes the cache. Confirms the two levels are genuinely handled
  // differently, not just logged differently.
  const calls: number[] = [];
  const restoreEscape = __setFeedCacheEscapeForTest((shardCount) => {
    calls.push(shardCount);
  });
  const restoreFetch = mockSupabase(1000, 900); // 10% short — warn band, not fail
  try {
    const rows = await fetchListingsFromDbUncached();
    assert.ok(rows);
    assert.equal(rows!.length, 900);
    assert.deepEqual(calls, []);
  } finally {
    restoreFetch();
    restoreEscape();
  }
});

test("a failed count guard serves the walk unvalidated and never escapes the cache over nothing", async () => {
  // Mirrors the existing "count request failed" path: the guard's own
  // failure must not be fatal, and with no total to compare against there
  // is nothing to classify as short — classifyFeedRead(_, null) is "ok".
  const calls: number[] = [];
  const restoreEscape = __setFeedCacheEscapeForTest((shardCount) => {
    calls.push(shardCount);
  });
  const restoreFetch = mockSupabase("unreachable", 600);
  try {
    const rows = await fetchListingsFromDbUncached();
    assert.ok(rows, "an unreachable count guard must still serve the walk (fresh-but-unchecked beats provably stale)");
    assert.equal(rows!.length, 600);
    assert.deepEqual(calls, []);
  } finally {
    restoreFetch();
    restoreEscape();
  }
});
