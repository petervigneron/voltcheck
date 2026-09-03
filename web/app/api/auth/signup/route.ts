import { isEmail, isSecure, PASSWORD_MAX, PASSWORD_MIN, sessionCookies, signUp, withCookies } from "@/lib/auth";
import { readJsonBody, safeNext } from "@/lib/apiBody";

// Create an account: body {email, password, next?}. Confirmation is required
// (Supabase: mailer_autoconfirm off), so the normal answer is {confirm:true}
// — a confirmation mail went out through the Send Email hook and nothing is
// signed in yet. An address that already has an account gets the SAME
// answer: GoTrue returns an obfuscated user rather than an error in that
// case, on purpose, and this route keeps it that way.
//
// Body errors are the shopper's to fix (400); GoTrue refusing (rate limit,
// weak password) is reported by reason; GoTrue unreachable is a 502.

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const b = await readJsonBody(req);
  const email = typeof b?.email === "string" ? b.email.trim().toLowerCase() : "";
  const password = typeof b?.password === "string" ? b.password : "";
  if (!isEmail(email)) return Response.json({ ok: false, reason: "email" }, { status: 400 });
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    return Response.json({ ok: false, reason: "password" }, { status: 400 });
  }
  const next = safeNext(b?.next);
  const origin = new URL(req.url).origin;
  const redirectTo = `${origin}/account/verify?next=${encodeURIComponent(next)}`;

  const r = await signUp(email, password, redirectTo);
  if (!r.ok) {
    if (r.error.code === "weak_password") return Response.json({ ok: false, reason: "password" }, { status: 400 });
    if (r.error.status === 429 || r.error.code === "over_email_send_rate_limit") {
      return Response.json({ ok: false, reason: "slow_down" }, { status: 429 });
    }
    console.error("[auth] signup failed:", r.error.status, r.error.code, r.error.message);
    return Response.json({ ok: false, reason: "unavailable" }, { status: 502 });
  }

  // Only when confirmation is switched off would a session come back here.
  if (r.value.access_token && r.value.refresh_token) {
    const headers = withCookies(new Headers(), sessionCookies({ access_token: r.value.access_token, refresh_token: r.value.refresh_token }, isSecure(req)));
    return Response.json({ ok: true, signedIn: true, next }, { headers });
  }
  return Response.json({ ok: true, confirm: true });
}
