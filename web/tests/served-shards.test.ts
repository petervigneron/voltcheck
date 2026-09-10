// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/served-shards.test.ts
//
// lib/listings/servedShards.ts reads a deployed site's shards until the
// route's 404, so a script's count is the site's, never this checkout's
// pack.ts SHARDS. On 2026-09-10 a hard 48-way fan-out against a production
// still serving 24 failed a round of alert digests.
import test from "node:test";
import assert from "node:assert/strict";
import { fetchServedShards } from "../lib/listings/servedShards";

function stubSite(served: number, { failAt }: { failAt?: number } = {}) {
  const asked: number[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL) => {
    const n = Number(String(url).split("/api/index/")[1]);
    asked.push(n);
    if (n === failAt) return new Response("boom", { status: 500 });
    if (n >= served) return Response.json({ error: "no such shard" }, { status: 404 });
    return Response.json({ v: 1, t: [], h: [], r: [{ i: `car-${n}` }] });
  }) as typeof fetch;
  return { asked, restore: () => (globalThis.fetch = real) };
}

test("reads exactly as many shards as the site serves, whatever this checkout's SHARDS says", async () => {
  for (const served of [24, 48, 5]) {
    const site = stubSite(served);
    try {
      const shards = await fetchServedShards("https://example.test");
      assert.equal(shards.length, served);
      assert.deepEqual(shards.map((s) => (s.r[0] as { i: string }).i), Array.from({ length: served }, (_, n) => `car-${n}`));
    } finally {
      site.restore();
    }
  }
});

test("a shard that exists and fails is an error, never a shorter feed", async () => {
  const site = stubSite(24, { failAt: 9 });
  try {
    await assert.rejects(fetchServedShards("https://example.test"), /index shard 9: HTTP 500/);
  } finally {
    site.restore();
  }
});

test("a site serving no shards is an error, not an empty inventory", async () => {
  const site = stubSite(0);
  try {
    await assert.rejects(fetchServedShards("https://example.test"), /serves no index shards/);
  } finally {
    site.restore();
  }
});
