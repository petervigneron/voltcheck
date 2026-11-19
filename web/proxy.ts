import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { aiAgentLabel, fetchedCar, onBehalfOfPerson, pageKind } from "@/lib/aiAgents";
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
// static files, which are excluded by path as well. Nor /img/<vin>
// (lib/img.ts): a CDN-cached photo must never carry a Set-Cookie.
//
// A refresh that GoTrue refuses (a revoked or already-rotated token — refresh
// token rotation is on, with a 10-second reuse window) clears both cookies:
// the shopper is signed out rather than left with a session that will fail
// on every write. A refresh that fails because GoTrue is unreachable leaves
// the cookies alone; the access token may still be good for a while, and if
// it is not, the page renders signed out for this one request.
//
// It also runs, by the matcher's second entry, when the user-agent names a
// known AI assistant (lib/aiAgents.ts) — and for those it does one thing:
// counts the fetch by assistant and page kind (migration 0127) after the
// response has gone, and passes the request through exactly as it came.
// NextResponse.next() with no arguments: no cookie, no header, no rewrite,
// so the CDN serves whatever it would have served without the proxy. The
// session logic below is skipped for them outright, so a sitemap or a feed
// shard fetched by a crawler that happens to carry vc_rt can never pick up a
// Set-Cookie here.

/** One count per fetch, after the response. Short timeout, never throws: a
 *  lost count is a smaller cost than a slower page for the assistant. */
async function bump(fn: string, args: Record<string, string>): Promise<void> {
  const base = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_ANON_KEY;
  if (!base || !key) return;
  try {
    await fetch(`${base}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(args),
      cache: "no-store",
      signal: AbortSignal.timeout(1500),
    });
  } catch {
    // Fail soft by design.
  }
}

/** The fetch by assistant and page kind, always; and, when an assistant
 *  fetched one car's page for a person asking it, that car (migration 0128).
 *  A crawler's fetch of the same page counts the kind and never the car. */
async function countAgentFetch(agent: string, pathname: string): Promise<void> {
  const counts = [bump("agent_fetch_bump", { _agent: agent, _kind: pageKind(pathname) })];
  const vin = onBehalfOfPerson(agent) ? fetchedCar(pathname) : null;
  if (vin) counts.push(bump("agent_car_fetch_bump", { _agent: agent, _vin: vin }));
  await Promise.all(counts);
}

export async function proxy(req: NextRequest, event?: NextFetchEvent): Promise<NextResponse> {
  const agent = aiAgentLabel(req.headers.get("user-agent"));
  if (agent) {
    event?.waitUntil(countAgentFetch(agent, req.nextUrl.pathname));
    return NextResponse.next();
  }

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
        "/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap|img/|api/(?:index|events|zip|whereami|revalidate|stripe|auth/email)|.*\\.(?:png|jpg|jpeg|gif|svg|ico|txt|xml|webmanifest)$).*)",
      has: [{ type: "cookie", key: "vc_rt" }],
    },
    // Known AI assistants only (lib/aiAgents.ts AI_AGENT_TOKENS — keep in
    // step; tests/ai-agents.test.ts holds the two together). Next anchors the
    // value as ^…$ and matches case-sensitively, hence the leading/trailing
    // .* and Meta's spelled-out case: its user-agents are lower-case. Assets
    // are excluded by path so a page's images and scripts are not counted;
    // robots.txt, llms.txt and the sitemaps are counted on purpose.
    {
      source:
        "/((?!_next/|img/|favicon\\.ico$|.*(?:opengraph|twitter)-image|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|avif|woff2?|ttf|otf|css|js|map|webmanifest)$).*)",
      has: [
        {
          type: "header",
          key: "user-agent",
          value:
            ".*(?:GPTBot|OAI-SearchBot|ChatGPT-User|ClaudeBot|Claude-SearchBot|Claude-User|PerplexityBot|Perplexity-User|Google-Extended|GoogleOther|Applebot-Extended|Amazonbot|[Mm]eta-[Ee]xternal(?:[Aa]gent|[Ff]etcher)|Bytespider|CCBot|MistralAI-User|DuckAssistBot|cohere-ai).*",
        },
      ],
    },
  ],
};
