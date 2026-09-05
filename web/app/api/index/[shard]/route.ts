import { buildCardIndex } from "@/lib/listings/buildIndex";
import { FEED_CACHE_TAG } from "@/lib/listings/db";
import { buildFirstPaint } from "@/lib/listings/firstPaint";
import { SHARDS, packIndex, shardOfId } from "@/lib/listings/pack";
import type { FeedOrigin } from "@/lib/listings/source";
import { worthTrimTally } from "@/lib/listings/tally";
import { publicRows } from "@/lib/listings/proSignals";

// The browse grid's dataset: CDN-cached JSON the client filters locally.
// Visitors hit the edge cache, and every filter click after first load is
// zero-network. The route output is cached a full DAY and refreshed by
// /api/revalidate + the nightly's warming curls when the data actually
// changes — the route cache is the layer that has to carry this, because
// the fetch-level data cache does NOT survive in production: a full feed
// walk is ~175 MB of stringified entries, which blows the Vercel Data
// Cache's allowance and evicts itself; measured 2026-08-17 20:55 UTC, when
// all seven bodies' hourly route caches expired together and each re-render
// walked the whole feed (998 pages in one minute, the same page fetched
// 9x). An hourly route TTL therefore means ~5 full walks an hour, not
// "compute against a warm data cache". Day-long output + nightly warm means
// the walk happens once, at night — the in-process memo in db.ts is what
// lets the seven sequential warm renders share it.
//
// Served in SHARDS files rather than one. Vercel refuses to store a prerendered
// response over ~19 MB, so a single file made that cap a hard limit on how many
// cars the site could carry; the packed form (lib/listings/pack.ts) bought room
// but the ceiling would have come back with the next season of inventory — and
// did, on 2026-08-24, through a different door: a COLD (MISS-path) render is
// capped at ~4.5 MB, far below the store cap. The count lives on pack.ts's
// SHARDS and its comment carries that incident.
//
// buildCardIndex runs once per shard, but its Supabase reads are the same
// fetches with the same cache entries, so Next serves them from the data cache
// and the database is walked once per nightly however many shards there are.
// A shard render can be a full feed walk when the data-cache entries have
// expired, and at 129k cars that walk measures 90-177 s from inside a
// function (2026-08-24) — over some platform defaults. (This constant was
// first added mid-incident with a comment blaming killed regenerations for
// stale shards; the real story that day was the 6→24 shard change and a
// checker still summing six — see the CLAUDE.md deploy notes.)
//
// 800 s (the Pro-plan ceiling; was 300, the Hobby cap): on a drained IO
// budget the walk alone runs 250-300s+, and on 2026-08-26 the /api/index/
// first render died at ~280s all night with its walk still alive underneath
// — the ceiling, not the database, was the binding constraint on warming a
// fresh deployment. ~52 s from outside on a healthy Nano; the headroom is
// for the sick nights.
export const maxDuration = 800;
export const dynamic = "force-static";
export const revalidate = 86400;

// Empty on purpose — same pattern as the listing pages: each shard renders on
// its first request and is CDN-cached from then on, instead of prerendering at
// build time. Prerendering put the whole deploy at the database's mercy: six
// shards, each walking the full feed inside Next's 60-second prerender
// timeout, against a Nano instance that other lanes were loading — 2026-08-16
// every shard timed out three times and five straight deploys died. Runtime
// rendering has no such coupling, and it demonstrably fits the function
// budget: hourly revalidation has been re-running this exact build in
// production since the egress fix. Cost: the first browse visit after a
// deploy pays the render once per shard — warm them (CLAUDE.md deploy steps)
// rather than making every deploy gamble on database weather.
export function generateStaticParams(): { shard: string }[] {
  return [];
}

// A car's shard is a property of the car, never of its position in the build
// — shardOfId in pack.ts, moved there 2026-08-26 so the feed publisher and
// this route cannot drift; its comment carries the positional-membership
// incident (8,133 cars doubled).

// ------------------------------------------------------------- artifacts
// The way OUT of the walk (2026-08-26). scripts/publish-feed.mjs walks the
// database ONCE — off-peak, retryable, on a runner with time to spare — and
// publishes the exact bodies this route serves (built by the same functions)
// to the public `feed` storage bucket. This route serves those files first
// and only falls back to walking when the artifact is missing or stale. What
// that buys, mechanically: a cold render stops costing a 140k-row walk at
// 8-lane concurrency (the thing that drains a burstable instance's CPU
// credits and produced the 08-21→08-26 incident class) and starts costing
// one CDN file fetch. Deploys stop depending on database weather entirely.
//
// The freshness gate is the artifact-lane version of refuseFallback below:
// an artifact older than ARTIFACT_MAX_AGE_MS is treated as absent, not
// served — quietly serving week-old inventory because a publisher died is
// the bundled-snapshot incident with extra steps. 36h = one missed nightly
// publish plus slack; two missed publishes fall through to the walk path,
// which either serves live data or fails loudly. The manifest is fetched
// with the `feed` cache tag, so /api/revalidate expires route bodies and
// manifest together — a republish becomes visible at the next revalidation
// exactly like a walk would have.
const ARTIFACT_MAX_AGE_MS = 36 * 60 * 60 * 1000;

interface FeedManifest {
  v: 1;
  publishedAt: string;
  total: number;
}

async function artifactResponse(name: string): Promise<Response | null> {
  const base = process.env.SUPABASE_URL;
  if (!base) return null;
  try {
    const mRes = await fetch(`${base}/storage/v1/object/public/feed/manifest.json`, {
      next: { revalidate: 86400, tags: [FEED_CACHE_TAG] },
    });
    if (!mRes.ok) return null;
    const m = (await mRes.json()) as FeedManifest;
    if (m.v !== 1 || !Number.isFinite(Date.parse(m.publishedAt))) return null;
    if (Date.now() - Date.parse(m.publishedAt) > ARTIFACT_MAX_AGE_MS) return null;
    // Declared cacheable (a no-store fetch is refused inside a force-static
    // render — the same trap escapeFeedCache documents), but a shard body is
    // ~2.7 MB, over the data cache's item cap, so Next skips storing it and
    // the route-level cache is the layer that actually carries it — same as
    // it carries the walk-rendered bodies today.
    const bRes = await fetch(`${base}/storage/v1/object/public/feed/${name}.json`, {
      next: { revalidate: 86400, tags: [FEED_CACHE_TAG] },
    });
    if (!bRes.ok) return null;
    const text = await bRes.text();
    if (!text.startsWith("{")) return null;
    return new Response(text, { headers: { "content-type": "application/json" } });
  } catch {
    return null;
  }
}

// The browse grid's version of the sitemap route's refusal, and it exists
// because the two protections that were supposed to cover this both turn out
// to be no-ops in the one render context that matters. Traced 2026-08-22:
//
//   refuseDuringBuild()  fires ONLY in the build phase, by design — at
//                        runtime it returns immediately.
//   escapeFeedCache()    calls revalidateTag, which Next REFUSES inside a
//                        force-static render; the call throws, db.ts's catch
//                        swallows it and logs "best-effort, not fatal".
//
// and the handler below used to return unconditionally without ever looking
// at `origin`. So at expiry a sick database produced a completed render
// carrying the 58,730-row bundled snapshot, answered 200, and that became the
// cached truth for another 86,400 seconds. Nothing in the path could refuse
// it. That is the 2026-08-21 incident's mechanism, and it needed no deploy and
// no crawler to happen — just the clock.
//
// Throwing is what the sitemap route already does on an IDENTICAL caching
// shape (force-static + revalidate 86400), and the semantics were verified
// here rather than assumed, because the whole fix rests on them. A temporary
// force-static route with revalidate=5 under `next start`: while healthy its
// timestamp advanced every cycle, so regeneration was genuinely running; once
// every render threw, the timestamp FROZE and all five subsequent requests
// still got 200 with the last good body, with ten throws in the server log.
// Next retains a stale entry when a revalidation throws and never replaces
// it. So a sick database now costs FRESHNESS, not COVERAGE.
//
// The cost, stated plainly because it changes an operating rule rather than
// just this file: this protects an entry that ALREADY EXISTS. A fresh
// deployment has none, so a warm that hits a sick database 500s the grid
// instead of quietly serving it thin. "Never deploy while Supabase is
// erroring" (CLAUDE.md) stops being advice and becomes load-bearing — which
// is the right way round, because a 500 is loud, self-healing and gone the
// moment a walk succeeds, where a thin grid is silent, sticky for a day, and
// hid 34,000 cars for most of 2026-08-21 before anyone noticed.
function refuseFallback(origin: FeedOrigin, what: string): void {
  if (origin !== "fallback") return;
  throw new Error(
    `[index] refusing to cache ${what}: the feed fell back to the bundled snapshot, which is not live inventory`
  );
}

export async function GET(_req: Request, { params }: { params: Promise<{ shard: string }> }) {
  const { shard } = await params;
  // The seventh body under this route: the first-paint payload — the top page
  // of featured cards plus the band, suggestions, and counts, a couple dozen
  // KB against the shards' megabytes (lib/listings/firstPaint.ts). It lives here
  // rather than in its own route so it inherits this file's exact caching
  // shape: render-on-first-request, never prerendered at build (the 2026-08-16
  // lesson above), CDN-cached for the same day as the shards it fronts. Same
  // walk memo, so it adds no database load — one more render per nightly.
  if (shard === "first") {
    const art = await artifactResponse("first");
    if (art) return art;
    const { rows, origin } = await buildCardIndex();
    // "first" gets the same refusal as the numbered shards, and needs it just
    // as much: it carries the grid's total car count and its featured cards,
    // so a thin one understates the whole site's inventory on the first paint
    // of every visit.
    refuseFallback(origin, "the first-paint payload");
    return Response.json(buildFirstPaint(publicRows(rows)));
  }
  // The eighth body: the trim facets behind /worth's trim dropdown
  // (lib/listings/tally.ts worthTrimTally). Its own body rather than a field
  // on `first` because the browse landing page never needs it — `first` is
  // sized for the first paint of every visit, and this is fetched only when
  // someone opens the valuation form. Same caching shape, same walk memo,
  // same refusal, for the same reasons as `first`.
  if (shard === "trims") {
    const art = await artifactResponse("trims");
    if (art) return art;
    const { rows, origin } = await buildCardIndex();
    refuseFallback(origin, "the trim facets");
    return Response.json(worthTrimTally(rows));
  }
  const n = Number(shard);
  if (!Number.isInteger(n) || n < 0 || n >= SHARDS) {
    return Response.json({ error: "no such shard" }, { status: 404 });
  }
  const art = await artifactResponse(`shard-${n}`);
  if (art) return art;
  const { rows, origin } = await buildCardIndex();
  refuseFallback(origin, `shard ${n}`);
  return Response.json(packIndex(publicRows(rows).filter((r) => shardOfId(r.id) === n)));
}
