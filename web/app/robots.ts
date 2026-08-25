import type { MetadataRoute } from "next";
import { BASE, shardUrls } from "@/lib/sitemap";

// Tells crawlers what to index and where the sitemaps are. Everything public is
// crawlable; the disallowed paths are per-user or token surfaces with no
// index value — /saved is a client-only local list, /alerts/* are one-shot
// email-token pages, /pro/access carries a pass token and /pro/thanks is a
// purchase dead end that would read as a confirmation to anyone who found it
// in search results. /pro itself IS crawlable: it is where the free-forever
// promise is published. /api is left crawlable on purpose: Googlebot fetches
// /api/index/* when it renders the client browse grid.
//
// The listing sitemap is sharded (50k-URL cap), so this lists the index plus
// one Sitemap line per shard, all from lib/sitemap.ts's SITEMAP_SHARDS — the
// shard count stays a single source of truth as inventory grows.
//
// It used to derive that count by calling the sitemap's generateSitemaps(),
// which walked the entire live feed just to divide by 40,000. That was the
// fourth full database walk in every production build, and on 2026-08-22 it
// was helping kill them (see lib/sitemap.ts). robots.txt now reads nothing:
// it is a constant, it prerenders in milliseconds, and it stays up whatever
// the database is doing.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/saved", "/alerts/", "/pro/access", "/pro/thanks"],
    },
    sitemap: [`${BASE}/sitemap.xml`, ...shardUrls()],
    host: BASE,
  };
}
