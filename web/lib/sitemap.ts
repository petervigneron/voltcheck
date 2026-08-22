// The sitemap's shape and serializer, shared by the shard routes, the sitemap
// index and robots.txt so the three can never disagree about how many shards
// exist or what a car's shard is.
//
// Why this file exists at all — i.e. why the sitemaps are plain Route
// Handlers instead of Next's `app/sitemap.ts` metadata convention:
//
// The metadata convention generates a route whose `generateStaticParams` IS
// `generateSitemaps` (see next-metadata-route-loader.js,
// getDynamicSitemapRouteCode) — every shard it announces is prerendered
// during `next build`, and there is no way to opt out: the generated GET
// re-runs generateSitemaps on every request to validate the id, so returning
// an empty list to skip prerendering would 404 the sitemaps at runtime
// instead. Each of those prerenders walked the whole live feed inside Next's
// 60-second-per-attempt budget, and robots.txt walked it a fourth time to
// count the shards. On 2026-08-22 four production builds died in a row that
// way: TypeScript compiled in 7.2s, all 21 real pages generated, and only the
// sitemap export failed — against a database that was returning PostgREST
// 500s to a single count request. A file that changes at most once a day had
// made every deploy a bet on database weather.
//
// As ordinary Route Handlers the shards get the same treatment the browse
// index already runs on in production (app/api/index/[shard]/route.ts, the
// 2026-08-16 lesson): `dynamic = "force-static"` + `revalidate` + an empty
// generateStaticParams, so each shard renders on its first request and is
// CDN-cached from then on. A starved database can now delay a sitemap. It
// can no longer fail a deploy.
//
// The cost of leaving the convention is this file: ~40 lines of XML we now
// write ourselves. Next's own serializer lives at an internal path
// (next/dist/build/webpack/loaders/metadata/resolve-route-data) that is not
// public API and would break on a minor upgrade; the sitemaps.org format we
// actually use is four elements deep.

export const BASE = "https://voltcheck.net";

/**
 * How many files the listing sitemap is split across.
 *
 * The sitemaps.org cap is 50,000 URLs (and 50 MB uncompressed) per file.
 * Live inventory is ~100,300 cars and growing, so one file has been
 * impossible for a while. Six puts ~16,700 URLs in each — two thirds under
 * the cap with room for inventory to triple before it matters, and it is the
 * same warm-up loop shape (`for s in 0 1 2 3 4 5`) the index shards already
 * use in nightly.yml.
 *
 * This is deliberately a CONSTANT rather than a count derived from the feed.
 * Deriving it meant robots.txt had to walk the entire database just to learn
 * how many <sitemap> lines to print — the fourth of the four walks that were
 * failing builds, and the one with the least excuse.
 */
export const SITEMAP_SHARDS = 6;

/**
 * Warn well before the 50,000-URL cap. At six shards this fires around
 * 270,000 live listings — early enough to raise SITEMAP_SHARDS in a normal
 * commit rather than after a crawler has started rejecting a file.
 */
const SHARD_URL_WARN = 45_000;

/**
 * Which shard a URL belongs to — a property of the car, never of its position
 * in the feed.
 *
 * The old positional form (`ids.slice(n * 40_000, ...)`) had two faults that
 * only show up now that the shards render independently. First, the order it
 * sliced was the order `allListings()` happened to return, which is the
 * completion order of a parallel bucket walk — not stable between renders.
 * Second, and worse: six shards on independent revalidate timers can be built
 * from two different nights' feeds at once, and any insertion between them
 * shifts every position after it, so a car ends up in two shards or in none.
 * That exact failure cost the browse index 7,300 invisible cars on its first
 * live-database deploy (app/api/index/[shard]/route.ts). Hashing the car's own
 * id means a mixed-vintage shard set can carry a stale lastmod, but never a
 * doubled or a dropped URL.
 *
 * FNV-1a, the same recipe as the index route's shardOf and card.ts's hash01.
 */
export function sitemapShardOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % SITEMAP_SHARDS;
}

export type ChangeFrequency = "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";

export interface SitemapEntry {
  url: string;
  lastModified?: Date;
  changeFrequency?: ChangeFrequency;
  priority?: number;
}

// Only the five characters XML actually reserves. Our URLs are VINs and
// slugs, so in practice nothing is escaped — but a sitemap that silently
// truncates at the first stray & is the kind of failure that would read as a
// coverage gap, so the serializer does not rely on the input being tame.
function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// W3C Datetime, which is what sitemaps.org asks for and what Next emitted
// before this. An unparseable date is dropped rather than printed as
// "Invalid Date" — lastmod is a hint, and a wrong one is worse than none.
function lastmod(d: Date | undefined): string {
  if (!d) return "";
  const t = d.getTime();
  if (!Number.isFinite(t)) return "";
  return `<lastmod>${d.toISOString()}</lastmod>`;
}

/** One `<urlset>` file. Warns if it is approaching the 50,000-URL cap. */
export function renderUrlset(entries: SitemapEntry[], label: string): string {
  if (entries.length > SHARD_URL_WARN) {
    console.warn(
      `[sitemap] ${label} holds ${entries.length} URLs — approaching the 50,000-URL cap; raise SITEMAP_SHARDS (currently ${SITEMAP_SHARDS})`
    );
  }
  const urls = entries
    .map(
      (e) =>
        `<url><loc>${xmlEscape(e.url)}</loc>${lastmod(e.lastModified)}` +
        (e.changeFrequency ? `<changefreq>${e.changeFrequency}</changefreq>` : "") +
        (e.priority !== undefined ? `<priority>${e.priority}</priority>` : "") +
        `</url>`
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
}

/** The `<sitemapindex>` at /sitemap.xml — the URL every crawler and audit
 *  tool probes first, and which returned 404 for as long as the sitemaps
 *  were sharded (Next's metadata convention serves no combined index). */
export function renderSitemapIndex(shardUrls: string[]): string {
  const items = shardUrls.map((u) => `<sitemap><loc>${xmlEscape(u)}</loc></sitemap>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${items}</sitemapindex>`;
}

/** The shard files, in the order robots.txt and the index list them. */
export function shardUrls(): string[] {
  return Array.from({ length: SITEMAP_SHARDS }, (_, i) => `${BASE}/sitemap/${i}.xml`);
}
