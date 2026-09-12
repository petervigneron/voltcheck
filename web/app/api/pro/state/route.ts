import { currentPass } from "@/lib/pro";

// Is this browser holding a live pass? Answered for the browse grid, which is
// a static client component reading a CDN-cached index and cannot read the
// vc_pro cookie itself (HttpOnly, and the page has no request context).
//
// Answers the entitlement and one more bit since 0087: whether this browser's
// own account or cookie holds a pass that ENDED. The grid has to tell those
// apart — ?deal=1 for a stranger is an offer, and for someone whose pass ran
// out yesterday it is an explanation. The tier and the date still belong to
// /pro. Nothing here is a way of learning who holds a pass: the cookie or the
// session is the question, a browser with neither gets "false" without the
// database being asked at all (lib/pro.ts currentPass short-circuits on no
// token), and the answer is only ever about the asker's own credential.
//
// no-store, private: an entitlement must never be served from a shared cache
// to the next visitor, and a pass that expired must stop working on its own.

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  let active = false;
  let expired = false;
  try {
    const pass = await currentPass();
    active = pass.active;
    expired = !pass.active && pass.expired === true;
  } catch {
    active = false;
    expired = false;
  }
  return Response.json({ active, expired }, { headers: { "Cache-Control": "private, no-store" } });
}
