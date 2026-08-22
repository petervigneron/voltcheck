import { checkPass, PRO_COOKIE } from "@/lib/pro";

// The access link from the purchase email lands here. Verifies the token,
// parks it in a cookie so the shopper does not need the email again on this
// device, and sends them back to /pro.
//
// The cookie holds the TOKEN and nothing else — never "pro=true", never an
// expiry the client could edit. Every entitlement decision re-asks the
// database (lib/pro.ts currentPass), so the worst a forged cookie achieves is
// a lookup that misses.
//
// The Set-Cookie header is written by hand rather than through next/headers'
// cookies().set(). Setting a cookie and returning a redirect are both
// supported, but whether a mutation made through the cookie store is merged
// into a Response the handler constructed itself is not something the 16.3
// docs state, and this is the one request in the paid flow that must not
// silently half-work. An explicit header has no such question.
//
// A bad token redirects rather than errors. The overwhelmingly likely cause is
// an expired pass or a link mangled by an email client, and someone who paid
// deserves the page explaining how to get a new link, not a 404.

export const dynamic = "force-dynamic";

function setCookie(name: string, value: string, maxAge: number, secure: boolean): string {
  return [
    `${name}=${value}`,
    "Path=/",
    `Max-Age=${maxAge}`,
    "HttpOnly",
    // The shopper arrives by following a link out of their email client, so a
    // Strict cookie would not be sent on that first navigation.
    "SameSite=Lax",
    secure ? "Secure" : "",
  ].filter(Boolean).join("; ");
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const token = url.searchParams.get("t") ?? "";
  const back = new URL("/pro", url.origin);

  // x-forwarded-proto is what survives Vercel's TLS termination; the URL's own
  // protocol reads http behind the proxy. Omitting Secure on plain-http local
  // dev is what lets this be tested at all.
  const secure = (req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "")) === "https";

  const fail = (why: string) => {
    back.searchParams.set("access", why);
    return new Response(null, { status: 303, headers: { Location: back.toString() } });
  };

  if (!/^[0-9a-f-]{36}$/i.test(token)) return fail("invalid");

  const state = await checkPass(token);
  if (!state?.active) return fail("expired");

  // Outlive the pass a little, so an expired cookie still resolves to an
  // honest "your pass ended" rather than looking like it was never bought.
  const maxAge = state.expires_at
    ? Math.max(60, Math.floor((Date.parse(state.expires_at) - Date.now()) / 1000) + 7 * 86_400)
    : 30 * 86_400;

  back.searchParams.set("access", "ok");
  return new Response(null, {
    status: 303,
    headers: {
      Location: back.toString(),
      "Set-Cookie": setCookie(PRO_COOKIE, token, maxAge, secure),
    },
  });
}
