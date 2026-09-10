import type { PackedIndex } from "./pack";

/**
 * Every index shard a DEPLOYED site serves, read until the route's 404 past
 * its last one (app/api/index/[shard]/route.ts). For scripts that read
 * voltcheck.net: the count that matters is the deployment's, not this
 * checkout's pack.ts SHARDS, and the two differ for as long as a SHARDS raise
 * is on main but not yet deployed. On 2026-09-10 (24 → 48) send-alerts
 * fanned out over pack.ts's 48 against a production still serving 24, got
 * 404 on shard 24, and failed a round of alert digests.
 *
 * Fetched in parallel batches; any failure other than the end-of-range 404
 * fails the whole read, as in useCardIndex — a script working from a feed
 * quietly missing a shard is worse than one that stops.
 */
export async function fetchServedShards(
  origin: string,
  { batch = 8, timeoutMs = 120_000, max = 256 }: { batch?: number; timeoutMs?: number; max?: number } = {}
): Promise<PackedIndex[]> {
  const out: PackedIndex[] = [];
  for (let start = 0; start < max; start += batch) {
    const got = await Promise.all(
      Array.from({ length: Math.min(batch, max - start) }, async (_, k) => {
        const n = start + k;
        const res = await fetch(`${origin}/api/index/${n}`, { signal: AbortSignal.timeout(timeoutMs) });
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`index shard ${n}: HTTP ${res.status}`);
        return (await res.json()) as PackedIndex;
      })
    );
    const end = got.indexOf(null);
    out.push(...((end === -1 ? got : got.slice(0, end)) as PackedIndex[]));
    if (end !== -1) break;
  }
  if (out.length === 0) throw new Error(`${origin} serves no index shards`);
  return out;
}
