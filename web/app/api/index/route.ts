import { buildCardIndex } from "@/lib/listings/buildIndex";

// The browse grid's dataset: one CDN-cached JSON the client filters locally.
// Static + hourly revalidate matches the data's actual cadence (nightly sync,
// recheck, price audit) — visitors hit the edge cache, Supabase sees one
// rebuild an hour, and every filter click after first load is zero-network.
export const dynamic = "force-static";
export const revalidate = 3600;

export async function GET() {
  return Response.json(await buildCardIndex());
}
