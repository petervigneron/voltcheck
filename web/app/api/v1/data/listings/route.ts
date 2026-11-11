import { json, options } from "@/lib/api/http";
import { paidSignals, paidUnavailable, requireKey } from "@/lib/api/paid";
import { withPaidFields } from "@/lib/api/paidFields";
import { searchListings } from "@/lib/api/search";

// GET /api/v1/data/listings?… — the search endpoint for a data key: the same
// parameters and records as /api/v1/listings, plus ask_vs_similar and
// incentive on every car that has one (lib/api/paidFields.ts). Its own path
// so it can never share a CDN entry with the free route (lib/api/paid.ts).
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const OPTIONS = options;
export async function GET(req: Request): Promise<Response> {
  const refused = await requireKey(req);
  if (refused) return refused;
  const r = await searchListings(new URL(req.url).searchParams);
  if ("error" in r) return json(r, { status: r.details ? 400 : 503, keyed: true });
  const signals = await paidSignals();
  if (!signals) return paidUnavailable();
  return json({ ...r, results: withPaidFields(r.results, signals) }, { asOf: r.as_of, keyed: true });
}
