import { programsForZip } from "@/lib/incentives/territory";

// The programs a shopper at this ZIP can use (lib/incentives/territory.ts),
// for the car page's rebate block, which is static and cannot read the
// shopper's ZIP at render. Cached a day on the CDN, not a year like /api/zip:
// the answer moves whenever the registry does.
export async function GET(_req: Request, ctx: RouteContext<"/api/rebates/[zip]">) {
  const { zip } = await ctx.params;
  const r = await programsForZip(zip);
  return Response.json(r, {
    headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" },
  });
}
