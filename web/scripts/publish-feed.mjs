#!/usr/bin/env node
// Publish the browse feed as static artifacts, so serving it never walks the
// database again.
//
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//     scripts/publish-feed.mjs [--force]
//
// WHY (2026-08-26): every browse body — first, trims, 24 shards — was built
// from a full feed walk at request time, so a cold cache meant a 140k-row ×
// 8-lane read against a burstable instance whose CPU credits are precisely
// what that spends. Once drained, everything on the box ran ~10x slow and
// the walk itself started dying (statement-timeout storms, the 08-21→08-26
// incident class). This script does the walk ONCE — in CI, off-peak, with
// FEED_LANES set low, free to retry — and uploads the exact bodies the route
// serves (built by the same functions: buildFirstPaint, worthTrimTally,
// packIndex, shardOfId) to the public `feed` storage bucket. The route
// (app/api/index/[shard]/route.ts) serves artifact-first and only walks when
// the artifact is missing or stale.
//
// Bodies upload first, manifest LAST: readers gate on the manifest, so a
// publish that dies halfway leaves the previous manifest pointing at the
// previous coherent set, not a mixed one.
//
// The guard: refuses to publish a walk that fell back to the bundled
// snapshot, and refuses a total that shrank >10% against the manifest
// already published (the 2026-08-21 shape — a thin read becoming the cached
// truth; here it would become the DURABLE truth). --force overrides the
// shrink check for a deliberate inventory contraction, never the fallback
// check — there is no deliberate version of publishing the bundled snapshot.
import { buildCardIndex } from "../lib/listings/buildIndex.ts";
import { buildFirstPaint } from "../lib/listings/firstPaint.ts";
import { SHARDS, packIndex, shardOfId } from "../lib/listings/pack.ts";
import { worthTrimTally } from "../lib/listings/tally.ts";
import { buildHubIndex } from "../lib/listings/hubIndex.ts";
import { buildApiArtifacts } from "../lib/api/records.ts";

const FORCE = process.argv.includes("--force");
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("publish-feed: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  process.exit(1);
}
const SHRINK_TOLERANCE = 0.1;

const t0 = Date.now();
const { rows, origin, listings, enriched } = await buildCardIndex();
if (origin === "fallback") {
  console.error("publish-feed: the walk fell back to the bundled snapshot — refusing to publish it as the durable feed.");
  process.exit(1);
}
console.error(`publish-feed: walked ${rows.length} cars (origin ${origin}) in ${((Date.now() - t0) / 1000).toFixed(0)}s`);

try {
  const prev = await fetch(`${SUPABASE_URL}/storage/v1/object/public/feed/manifest.json`, {
    signal: AbortSignal.timeout(30_000),
  });
  if (prev.ok) {
    const m = await prev.json();
    if (typeof m.total === "number" && m.total > 0 && rows.length < m.total * (1 - SHRINK_TOLERANCE) && !FORCE) {
      console.error(
        `publish-feed: REFUSING — tonight's walk holds ${rows.length} cars against the published manifest's ${m.total}, ` +
          `a ${(100 * (1 - rows.length / m.total)).toFixed(1)}% shrink (tolerance ${SHRINK_TOLERANCE * 100}%). ` +
          "This is the thin-read shape; re-run with --force only for a deliberate contraction."
      );
      process.exit(1);
    }
  }
} catch (e) {
  console.error(`publish-feed: no previous manifest readable (${e.message}) — first publish, continuing`);
}

async function upload(name, body) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/feed/${name}.json`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      "x-upsert": "true",
    },
    body,
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`upload ${name}: HTTP ${res.status} — ${(await res.text()).slice(0, 200)}`);
  console.error(`publish-feed: ${name}.json — ${(Buffer.byteLength(body) / 1e6).toFixed(2)} MB`);
}

const shardCounts = [];
for (let n = 0; n < SHARDS; n++) {
  const shardRows = rows.filter((r) => shardOfId(r.id) === n);
  shardCounts.push(shardRows.length);
  await upload(`shard-${n}`, JSON.stringify(packIndex(shardRows)));
}
await upload("first", JSON.stringify(buildFirstPaint(rows)));
await upload("trims", JSON.stringify(worthTrimTally(rows)));
// The model hubs (/ev/<make>/<model>). One file for all 246 of them: a hub's
// cars are spread across every shard, so serving them from the packed feed
// would cost ~50 MB per hub render. See lib/listings/hubIndex.ts.
await upload("hubs", JSON.stringify(buildHubIndex(rows)));
// The public read API (/api/v1, /api/mcp): one query index of every car, one
// full-record partition per make, and a manifest the routes gate on — built
// from the same listings and enrichment as the shards, so the API can never
// say something the grid does not (lib/api/records.ts). Partitions and index
// first, api-manifest after them, for the same reason the feed manifest goes
// last: readers gate on the manifest, so a publish that dies halfway leaves
// the previous coherent set in place.
const publishedAt = new Date().toISOString();
const api = buildApiArtifacts(listings, enriched, rows, publishedAt);
for (const [slug, recs] of api.partitions) await upload(`api-make-${slug}`, JSON.stringify(recs));
await upload("api-index", JSON.stringify(api.index));
await upload("api-manifest", JSON.stringify(api.manifest));
await upload(
  "manifest",
  JSON.stringify({ v: 1, publishedAt, total: rows.length, shardCounts })
);
console.error(`publish-feed: published ${rows.length} cars across ${SHARDS} shards in ${((Date.now() - t0) / 1000).toFixed(0)}s total`);
