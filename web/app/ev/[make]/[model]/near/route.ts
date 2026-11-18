import { findModelHub } from "@/lib/listings/modelHubs";
import { nearPath, parseNearParams, typedZip } from "@/lib/listings/near";

// GET /ev/<make>/<model>/near?zip=60614&… → 307 to /ev/<make>/<model>/near/60614?…
//
// The model page's "Near a ZIP" form lands here: a plain <form method="get">
// can only write a query string, and the results page keeps the ZIP in its
// path. The other parameters are re-written in nearQuery()'s one order, with
// empty and unreadable ones dropped, so a form submission and a typed URL for
// the same search are one CDN entry. Reads nothing; costs one tiny function
// call, and the redirect itself is CDN-cacheable for the same hour.
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ make: string; model: string }> }): Promise<Response> {
  const { make, model } = await ctx.params;
  const hub = findModelHub(make, model);
  const q = new URL(req.url).searchParams;
  const zip = typedZip(q.get("zip"));
  if (!hub || !zip) {
    return new Response("Not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  return new Response(null, {
    status: 307,
    headers: {
      location: nearPath(hub, zip, parseNearParams(q)),
      "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
