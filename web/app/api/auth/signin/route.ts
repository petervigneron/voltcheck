import { isEmail, isSecure, PASSWORD_MAX, sessionCookies, signIn, withCookies } from "@/lib/auth";
import { readJsonBody, safeNext } from "@/lib/apiBody";

// Sign in: body {email, password, next?}. On success the two session
// cookies are set and the client does a full navigation to `next`, so every
// component's cached "who am I" starts over on the new page.
//
// Two refusals are told apart, because GoTrue tells them apart and the
// shopper needs different things: wrong email or password (401, "bad") and
// an address that has not clicked its confirmation mail yet (403,
// "unconfirmed"). Everything else is a 502.

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const b = await readJsonBody(req);
  const email = typeof b?.email === "string" ? b.email.trim().toLowerCase() : "";
  const password = typeof b?.password === "string" ? b.password : "";
  if (!isEmail(email) || !password || password.length > PASSWORD_MAX) {
    return Response.json({ ok: false, reason: "bad" }, { status: 401 });
  }
  const next = safeNext(b?.next);

  const r = await signIn(email, password);
  if (!r.ok) {
    if (r.error.code === "email_not_confirmed") return Response.json({ ok: false, reason: "unconfirmed" }, { status: 403 });
    if (r.error.status === 400 || r.error.status === 401 || r.error.status === 403) {
      return Response.json({ ok: false, reason: "bad" }, { status: 401 });
    }
    if (r.error.status === 429) return Response.json({ ok: false, reason: "slow_down" }, { status: 429 });
    console.error("[auth] signin failed:", r.error.status, r.error.code, r.error.message);
    return Response.json({ ok: false, reason: "unavailable" }, { status: 502 });
  }
  if (!r.value.access_token || !r.value.refresh_token) {
    return Response.json({ ok: false, reason: "unavailable" }, { status: 502 });
  }
  const headers = withCookies(new Headers(), sessionCookies(r.value, isSecure(req)));
  return Response.json({ ok: true, next }, { headers });
}
