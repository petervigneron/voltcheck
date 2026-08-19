import type { MetadataRoute } from "next";
import { generateSitemaps } from "./sitemap";

// Tells crawlers what to index and where the sitemaps are. Everything public is
// crawlable; the two disallowed paths are per-user or token surfaces with no
// index value — /saved is a client-only local list, /alerts/* are one-shot
// email-token pages. /api is left crawlable on purpose: Googlebot fetches
// /api/index/* when it renders the client browse grid.
//
// The listing sitemap is sharded (50k-URL cap), and Next serves no combined
// index at /sitemap.xml, so we emit one Sitemap line per shard from the same
// generateSitemaps that produces them — the shard count stays a single source
// of truth as inventory grows.
export default async function robots(): Promise<MetadataRoute.Robots> {
  const shards = await generateSitemaps();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/saved", "/alerts/"],
    },
    sitemap: shards.map((s) => `https://voltcheck.net/sitemap/${s.id}.xml`),
    host: "https://voltcheck.net",
  };
}
