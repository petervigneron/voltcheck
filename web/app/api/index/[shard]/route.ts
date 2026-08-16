import { buildCardIndex } from "@/lib/listings/buildIndex";
import { SHARDS, packIndex, shardOf } from "@/lib/listings/pack";

// The browse grid's dataset: CDN-cached JSON the client filters locally. Static
// + hourly revalidate matches the data's actual cadence (nightly sync, recheck,
// price audit) — visitors hit the edge cache, Supabase sees one rebuild an hour,
// and every filter click after first load is zero-network.
//
// Served in SHARDS files rather than one. Vercel refuses to store a prerendered
// response over ~19 MB, so a single file made that cap a hard limit on how many
// cars the site could carry; the packed form (lib/listings/pack.ts) bought room
// but the ceiling would have come back with the next season of inventory.
//
// buildCardIndex runs once per shard, but its Supabase reads are the same
// fetches with the same revalidate, so Next serves them from the data cache and
// the database is read once per hour however many shards there are.
export const dynamic = "force-static";
export const revalidate = 3600;

export function generateStaticParams() {
  return Array.from({ length: SHARDS }, (_, i) => ({ shard: String(i) }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ shard: string }> }) {
  const { shard } = await params;
  const n = Number(shard);
  if (!Number.isInteger(n) || n < 0 || n >= SHARDS) {
    return Response.json({ error: "no such shard" }, { status: 404 });
  }
  const rows = await buildCardIndex();
  return Response.json(packIndex(rows.filter((_, i) => shardOf(i) === n)));
}
