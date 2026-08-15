import { zipCoords } from "@/lib/zips";

// Resolves the shopper's "near ZIP" to a centroid for client-side distance
// filtering. Listing coordinates ship in the card index; only the visitor's
// own zip needs a lookup. Census centroids are effectively permanent, so the
// CDN may hold each zip's answer for a year.
export async function GET(_req: Request, ctx: RouteContext<"/api/zip/[zip]">) {
  const { zip } = await ctx.params;
  const loc = (await zipCoords(zip)) ?? null;
  return Response.json(loc, {
    headers: { "Cache-Control": "public, max-age=86400, s-maxage=31536000" },
  });
}
