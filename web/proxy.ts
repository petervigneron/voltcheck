import { NextResponse, type NextRequest } from "next/server";
import { AT_COOKIE, RT_COOKIE, clearedCookies, needsRefresh, refreshSession, sessionCookies } from "@/lib/authCore";

// Keeps a signed-in shopper signed in. The access token (vc_at) lasts an
// hour; the refresh token (vc_rt) outlives it. When a request arrives with a
// refresh token and an access token that is missing or about to expire, this
// trades the refresh token for a new pair before the page renders, sets the
// new cookies on the response, and hands the new access token to the render
// so lib/auth.ts currentUser() sees a live session on the same request.
//
// It runs ONLY on requests that carry vc_rt — the matcher's `has` clause —
// so a visitor who never signed in costs nothing here, and it never touches
// the cached feed routes (/api/index/*), the sitemaps, the Stripe webhook or
// static files, which are excluded by path as well.
//
// A refresh that GoTrue refuses (a revoked or already-rotated token — refresh
// token rotation is on, with a 10-second reuse window) clears both cookies:
// the shopper is signed out rather than left with a session that will fail
// on every write. A refresh that fails because GoTrue is unreachable leaves
// the cookies alone; the access token may still be good for a while, and if
// it is not, the page renders signed out for this one request.

export async function proxy(req: NextRequest): Promise<NextResponse> {
  const at = req.cookies.get(AT_COOKIE)?.value;
  const rt = req.cookies.get(RT_COOKIE)?.value;
  if (!needsRefresh(at, rt, Math.floor(Date.now() / 1000))) return NextResponse.next();

  const secure = (req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "")) === "https";
  const r = await refreshSession(rt!);

  if (!r.ok) {
    if (r.error.status >= 400 && r.error.status < 500) {
      req.cookies.delete(AT_COOKIE);
      req.cookies.delete(RT_COOKIE);
      const res = NextResponse.next({ request: req });
      for (const c of clearedCookies(secure)) res.headers.append("Set-Cookie", c);
      return res;
    }
    return NextResponse.next();
  }

  // The render downstream reads the request's cookies, so the new access
  // token has to be on the request as well as on the response.
  req.cookies.set(AT_COOKIE, r.value.access_token);
  req.cookies.set(RT_COOKIE, r.value.refresh_token);
  const res = NextResponse.next({ request: req });
  for (const c of sessionCookies(r.value, secure)) res.headers.append("Set-Cookie", c);
  return res;
}

export const config = {
  matcher: [
    {
      source:
        "/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap|api/(?:index|events|zip|whereami|revalidate|stripe|auth/email)|.*\\.(?:png|jpg|jpeg|gif|svg|ico|txt|xml|webmanifest)$).*)",
      has: [{ type: "cookie", key: "vc_rt" }],
    },
  ],
};
