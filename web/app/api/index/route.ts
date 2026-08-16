import { buildCardIndex } from "@/lib/listings/buildIndex";
import { packIndex } from "@/lib/listings/pack";

// The browse grid's dataset: one CDN-cached JSON the client filters locally.
// Static + hourly revalidate matches the data's actual cadence (nightly sync,
// recheck, price audit) — visitors hit the edge cache, Supabase sees one
// rebuild an hour, and every filter click after first load is zero-network.
//
// Shipped in the packed form (lib/listings/pack.ts), which the browser unpacks
// back into CardRows. Plain rows crossed Vercel's ~19 MB prerender ceiling at
// 39k cars and blocked every deploy; the packing is what keeps this a static
// response instead of a per-request database read.
export const dynamic = "force-static";
export const revalidate = 3600;

export async function GET() {
  return Response.json(packIndex(await buildCardIndex()));
}
