// /embed/<make>/<model>: the card another site frames (lib/embed/card.ts
// says what it is and why the link sits outside it).
//
// A route handler, not a page: a page would arrive wrapped in the root
// layout's header and footer, and getting a bare one means moving every
// route into a group for the sake of this one.
//
// Cached like the model page it summarises: rendered on first request, held
// for a day, never at build time. That matters more here than anywhere,
// because the traffic is someone else's — a card on a busy forum thread is
// requested by every one of their readers, and it must be the CDN that
// answers, not a function.
//
// noindex (header and tag) with a canonical to the model page: 246 thin
// near-copies of the hubs are not pages the site wants competing with the
// hubs themselves.
import { findModelHub } from "@/lib/listings/modelHubs";
import { hubIndexKey } from "@/lib/listings/hubIndex";
import { hubEntry } from "@/lib/listings/hubSource";
import { embedHtml } from "@/lib/embed/card";

export const dynamic = "force-static";
export const revalidate = 86400;

export function generateStaticParams(): { make: string; model: string }[] {
  return [];
}

export async function GET(_req: Request, ctx: { params: Promise<{ make: string; model: string }> }) {
  const { make, model } = await ctx.params;
  const hub = findModelHub(make, model);
  if (!hub) return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const { total, stats } = await hubEntry(hubIndexKey(hub));
  return new Response(embedHtml(hub, total, stats), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Robots-Tag": "noindex",
      "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}
