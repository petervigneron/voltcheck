import { json, options } from "@/lib/api/http";
import { searchListings } from "@/lib/api/search";

// GET /api/v1/listings?make=&model=&zip=&… — the search endpoint. Every
// parameter is documented in /api/v1/openapi.json; lib/api/query.ts is the
// one parser both this route and the MCP tool use.
//
// Dynamic (it reads the query string) but CDN-cached per URL for an hour:
// the function pays for a query once and the edge answers the repeats. The
// data behind it moves once a night (lib/api/artifacts.ts), so an hour of
// edge caching costs no freshness a shopper could notice.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const OPTIONS = options;
export async function GET(req: Request): Promise<Response> {
  const r = await searchListings(new URL(req.url).searchParams);
  if ("error" in r) return json(r, { status: r.details ? 400 : 503 });
  return json(r, { maxAge: 3600, asOf: r.as_of });
}
