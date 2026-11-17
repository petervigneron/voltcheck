import { clearedCookies, currentUser, isSecure, PASSWORD_MAX, signIn, userRpc, withCookies } from "@/lib/auth";
import { readJsonBody } from "@/lib/apiBody";

// Delete the signed-in account (migration 0123 account_delete_mine).
//
// The password is asked for again and checked by signing in with it. The
// cookie alone is not enough for something that cannot be undone: an
// unlocked laptop or a shared computer holds a session for up to 180 days.
// The fresh session from that sign-in is also the one the deletion runs
// under, so an access token a few minutes from expiry cannot fail halfway.
//
// On success the session cookies are cleared here; the user row they named
// is gone, and GoTrue's own sessions went with it.
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const user = await currentUser();
  if (!user) return Response.json({ ok: false, reason: "signin" }, { status: 401 });
  const b = await readJsonBody(req);
  const password = typeof b?.password === "string" ? b.password : "";
  if (!password || password.length > PASSWORD_MAX) {
    return Response.json({ ok: false, reason: "password" }, { status: 401 });
  }

  const s = await signIn(user.email, password);
  if (!s.ok) {
    if (s.error.status === 429) return Response.json({ ok: false, reason: "slow_down" }, { status: 429 });
    if (s.error.status === 400 || s.error.status === 401 || s.error.status === 403) {
      return Response.json({ ok: false, reason: "password" }, { status: 401 });
    }
    console.error("[account] delete: sign-in check failed:", s.error.status, s.error.code);
    return Response.json({ ok: false, reason: "unavailable" }, { status: 502 });
  }
  if (!s.value.access_token) return Response.json({ ok: false, reason: "unavailable" }, { status: 502 });

  const r = await userRpc<{ deleted?: boolean; reason?: string }>(s.value.access_token, "account_delete_mine");
  if (!r) {
    console.error("[account] delete: account_delete_mine did not answer");
    return Response.json({ ok: false, reason: "unavailable" }, { status: 502 });
  }
  if (!r.deleted) {
    return Response.json({ ok: false, reason: r.reason === "data_key_active" ? "data_key" : "unavailable" }, { status: 409 });
  }
  const headers = withCookies(new Headers(), clearedCookies(isSecure(req)));
  return Response.json({ ok: true }, { headers });
}
