import { currentPass } from "@/lib/pro";

// Is this browser holding a live pass? Answered for the browse grid, which is
// a static client component reading a CDN-cached index and cannot read the
// vc_pro cookie itself (HttpOnly, and the page has no request context).
//
// Answers ONLY the boolean. The tier and expiry belong to /pro, and nothing
// here can be turned into a way of learning who holds a pass: the cookie is
// the question, and a browser without one gets "false" without the database
// being asked at all (lib/pro.ts currentPass short-circuits on no token).
//
// no-store, private: an entitlement must never be served from a shared cache
// to the next visitor, and a pass that expired must stop working on its own.

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  let active = false;
  try {
    active = (await currentPass()).active;
  } catch {
    active = false;
  }
  return Response.json({ active }, { headers: { "Cache-Control": "private, no-store" } });
}
