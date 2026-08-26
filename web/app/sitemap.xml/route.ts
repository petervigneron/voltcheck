import { renderSitemapIndex, shardUrls } from "@/lib/sitemap";

// The sitemap index: the file every crawler and SEO audit tool probes first.
// Until now /sitemap.xml was a 404 — Next's metadata convention serves no
// combined index for a sharded sitemap, so robots.txt had to list each shard
// by hand and anything that only looked at the conventional path found
// nothing. It is a static list of six URLs and reads no data at all, so it
// costs a deploy nothing and cannot fail.
//
// robots.txt still lists the shards individually as well: both forms are
// valid, and a crawler that already has the shard URLs shouldn't lose them.
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

export function GET() {
  return new Response(renderSitemapIndex(shardUrls()), {
    headers: { "Content-Type": "application/xml" },
  });
}
