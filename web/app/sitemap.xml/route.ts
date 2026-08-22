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
export const dynamic = "force-static";

export function GET() {
  return new Response(renderSitemapIndex(shardUrls()), {
    headers: { "Content-Type": "application/xml" },
  });
}
