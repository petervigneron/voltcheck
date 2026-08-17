import { buildCardIndex } from "@/lib/listings/buildIndex";
import { SHARDS, packIndex } from "@/lib/listings/pack";

// The browse grid's dataset: CDN-cached JSON the client filters locally.
// Visitors hit the edge cache, and every filter click after first load is
// zero-network. The route re-renders hourly, but its Supabase reads are
// cached a full day under the "feed" tag and expired by /api/revalidate when
// the nightly pipeline actually changes the data — so the hourly re-render
// is compute against a warm data cache, not a database walk.
//
// Served in SHARDS files rather than one. Vercel refuses to store a prerendered
// response over ~19 MB, so a single file made that cap a hard limit on how many
// cars the site could carry; the packed form (lib/listings/pack.ts) bought room
// but the ceiling would have come back with the next season of inventory.
//
// buildCardIndex runs once per shard, but its Supabase reads are the same
// fetches with the same cache entries, so Next serves them from the data cache
// and the database is walked once per nightly however many shards there are.
export const dynamic = "force-static";
export const revalidate = 3600;

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

// A car's shard is a property of the car, never of its position in the build.
// The six responses revalidate independently, so a browser can hold shards
// from two different hours' builds at once; when membership was positional
// (round-robin on index), any insertion between those builds shifted every
// position after it — the same car served from two shards, its neighbor from
// none. First live-DB deploy: 8,133 cars doubled, ~7,300 invisible. Keyed on
// the car's own id, a mixed-vintage shard set can serve a stale row, but
// never a doubled or dropped one. (FNV-1a, same recipe as card.ts's hash01,
// which isn't exported.)
function shardOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % SHARDS;
}

export async function GET(_req: Request, { params }: { params: Promise<{ shard: string }> }) {
  const { shard } = await params;
  const n = Number(shard);
  if (!Number.isInteger(n) || n < 0 || n >= SHARDS) {
    return Response.json({ error: "no such shard" }, { status: 404 });
  }
  const rows = await buildCardIndex();
  return Response.json(packIndex(rows.filter((r) => shardOf(r.id) === n)));
}
