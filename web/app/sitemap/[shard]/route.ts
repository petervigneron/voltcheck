import { feedWalkFailedRecently } from "@/lib/listings/db";
import { allListingsWithOrigin } from "@/lib/listings/source";
import { FACT_SHEETS } from "@/lib/facts/registry";
import { MODEL_HUBS, hubPath } from "@/lib/listings/modelHubs";
import { BASE, SITEMAP_SHARDS, type SitemapEntry, renderUrlset, sitemapShardOf } from "@/lib/sitemap";

// The listing sitemap, one shard per file at /sitemap/0.xml … /sitemap/11.xml
// (lib/sitemap.ts SITEMAP_SHARDS).
//
// This used to be Next's `app/sitemap.ts` metadata convention. It isn't any
// more, and lib/sitemap.ts carries the full reason: that convention
// prerenders every shard during `next build` with no way to opt out, so four
// production builds died on 2026-08-22 walking the whole feed three times
// (plus a fourth for robots.txt) against a database that was answering
// PostgREST 500s. Nothing else in that build failed — TypeScript compiled in
// 7.2s and all 21 real pages generated.
//
// The caching shape below is copied deliberately from the browse index
// (app/api/index/[shard]/route.ts), which has been running it in production
// since the same class of failure took out five deploys on 2026-08-16:
// force-static + a day's revalidate + an EMPTY generateStaticParams, so each
// shard renders on its first request and is CDN-cached from then on. Cost:
// the first crawler after a deploy pays the render — nightly.yml warms them
// alongside the index shards, as do CLAUDE.md's deploy steps. A slow
// database now delays a sitemap instead of failing a deploy.
// A regeneration of this route is a full feed walk, and on 2026-08-24 that
// walk got big enough to be killed by the platform's default function
// ceiling: six shards cached a 32,250-row mid-ingest snapshot, and every
// background regeneration against the healed 129k-row database died silently
// — ISR serves the stale body forever when the regen never completes, which
// is quieter than the fallback-throw this route uses for a sick database.
// 800 s (the Pro-plan ceiling; was 300, the Hobby cap): on a drained IO
// budget the walk alone runs 250-300s+ and renders died at ~280s all night
// on 2026-08-26 while their walks were still alive underneath — the ceiling,
// not the database, was the binding constraint. The walk still measures
// ~52 s from outside on a healthy Nano; the headroom is for the sick nights.
export const maxDuration = 800;
export const dynamic = "force-static";
// The same day as the feed itself (FEED_REVALIDATE_SECONDS) and the index
// routes, expired early by /api/revalidate when the nightly actually changes
// the data. A sitemap a day behind the feed is a sitemap exactly as fresh as
// the pages it points at.
export const revalidate = 86400;

// Empty on purpose — see the caching note above. This is the whole fix.
export function generateStaticParams(): { shard: string }[] {
  return [];
}

function staticRoutes(now: Date): SitemapEntry[] {
  return [
    { url: `${BASE}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${BASE}/vin`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE}/bot`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${BASE}/facts`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    // Each fact sheet's lastModified tracks its audit record's last-checked
    // date (lib/facts/registry.ts dateModified), not build time — same
    // freshness signal its FAQPage JSON-LD carries.
    ...FACT_SHEETS.map((s) => ({
      url: `${BASE}/facts/${s.make}/${s.model}/${s.topic}`,
      lastModified: new Date(s.dateModified),
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
    // The model hubs (lib/listings/modelHubs.ts). Ranked above the fact
    // sheets and below the home page: a hub is the page a model search should
    // land on, and it is the only crawlable route into the listing corpus —
    // every one of which was an orphan until these existed. Daily, because a
    // hub's cars turn over with the feed.
    { url: `${BASE}/ev`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    ...MODEL_HUBS.map((h) => ({
      url: `${BASE}${hubPath(h)}`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.7,
    })),
  ];
}

export async function GET(_req: Request, { params }: { params: Promise<{ shard: string }> }) {
  const { shard } = await params;
  const m = /^(\d+)\.xml$/.exec(shard);
  const n = m ? Number(m[1]) : NaN;
  if (!Number.isInteger(n) || n < 0 || n >= SITEMAP_SHARDS) {
    return new Response("Not Found", { status: 404 });
  }

  // Fail fast while the database is known to be down, without paying for
  // another walk to find out. This route throws on anything but a live feed
  // (below), so a walk it starts during an outage is spent on nothing — and
  // because a throw is never cached, an unbounded version would re-walk on
  // every crawler request for the outage's whole duration.
  //
  // Measured against a PostgREST that answers 500 to everything (at the
  // then-current six shards): one crawler pass over all shards costs 27
  // database requests and ~18 seconds with this breaker, against 162
  // requests and ~108 seconds without it. (A failed
  // walk is cheaper than a successful one — 27 requests, not the 226 a full
  // 100,297-row walk takes — because the retry ladder gives up and the walk
  // aborts on its first bucket. The 18 seconds is that ladder, and it is
  // function time paid per crawler request.)
  //
  // The browse grid deliberately does NOT do this: it has a shopper waiting,
  // and a stale grid beats an empty one. Nobody is waiting on a sitemap, and
  // a crawler retries a 503 by design.
  if (feedWalkFailedRecently()) {
    return new Response("Feed unavailable", { status: 503, headers: { "Retry-After": "300" } });
  }

  const { listings, origin } = await allListingsWithOrigin();
  // A sitemap is a claim to a crawler about what exists on this site, and it
  // is a claim with a long half-life: Google keeps the URL set it was given.
  // The bundled snapshot is 58,730 cars where the live feed has ~100,300, so
  // publishing it would both omit 40,000 real listings and advertise cars
  // that sold weeks ago. There is no honest partial answer here, and unlike
  // the browse grid there is no shopper waiting on this response — so when
  // the feed didn't come from the database, this route fails instead of
  // serving. A 5xx is what a crawler is built to retry; a wrong sitemap is
  // not. Next keeps serving the previously cached shard while a revalidation
  // throws, so a sick database costs freshness, not coverage.
  //
  // "unconfigured" (no SUPABASE_URL — local dev, CI) is a different thing
  // entirely and serves the snapshot as intended.
  if (origin === "fallback") {
    throw new Error(
      `[sitemap] refusing to publish shard ${n}: the feed fell back to the bundled snapshot, which is not live inventory`
    );
  }

  const now = new Date();
  // Real inventory only: a live listing's id is its 17-character lowercase
  // VIN, so the sitemap never points a crawler at a URL that vanishes as
  // coverage grows.
  //
  // Matched on the SHAPE of a VIN, not just its length. The old test was
  // `id.length === 17`, and the demo row "bolt18-premier-dc" is 17 characters
  // — so a hand-written listing was in the published sitemap the whole time.
  // (Those rows are gone as of 2026-09-02: lib/listings/sample.ts is deleted
  // and source.ts no longer merges anything hand-written into the feed.)
  // Alphanumeric rather than the 33 characters a VIN may legally use, for the
  // same reason the feed walk buckets over the full 36 (lib/listings/db.ts):
  // a feed that ignores the standard should still be read.
  //
  // A shape test is all this can be, and it is not enough on its own — which
  // is the 2026-09-02 lesson from the other direction: a dealer's "ON ORDER"
  // placeholder, written 0N0RDER3333333857, is 17 alphanumerics and passed
  // every check in the repo. That one is caught upstream now, at intake
  // (scraper/lib/vin-placeholder.mjs), because by the time a row reaches a
  // sitemap it is already in the database and on the browse grid.
  const listingRoutes: SitemapEntry[] = listings
    .filter((l) => /^[a-z0-9]{17}$/.test(l.id) && sitemapShardOf(l.id) === n)
    // Sorted so a shard's body depends only on which cars are in it, not on
    // the order a parallel bucket walk happened to finish in.
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((l) => ({
      url: `${BASE}/listing/${l.id}`,
      lastModified: l.listedOn ? new Date(l.listedOn) : now,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));

  // The static routes — home, /vin, /bot, /facts and the fact sheets, /ev and
  // the 246 model hubs — ride in shard 0 so they are always in a file a
  // crawler is being pointed at, and so they appear once rather than twelve
  // times.
  const entries = n === 0 ? [...staticRoutes(now), ...listingRoutes] : listingRoutes;
  return new Response(renderUrlset(entries, `sitemap/${n}.xml`), {
    headers: { "Content-Type": "application/xml" },
  });
}
