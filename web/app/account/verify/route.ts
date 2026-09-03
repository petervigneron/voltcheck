import { isSecure, sessionCookies, verifyTokenHash } from "@/lib/auth";
import { safeNext } from "@/lib/apiBody";

// Where every link in an account email lands: ?token_hash=…&type=…&next=…
// (built by lib/authCore.ts verifyLink for the Send Email hook). Trades the
// token hash for a session, installs the two cookies, and sends the shopper
// on: a confirmation to wherever they were going (the `next` the signup
// form carried), a password reset to /account/password.
//
// A token that does not verify — used already, expired, trimmed by a mail
// client — goes to /account with ?verify=failed, where the page explains and
// offers the form again. Never a 404 at someone who did what the mail said.

export const dynamic = "force-dynamic";

const VERIFY_TYPES = new Set(["signup", "recovery", "magiclink", "email_change", "invite", "email"]);

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const tokenHash = url.searchParams.get("token_hash") ?? "";
  const type = url.searchParams.get("type") ?? "";
  const next = safeNext(url.searchParams.get("next"));

  const to = (path: string) => new Response(null, { status: 303, headers: { Location: new URL(path, url.origin).toString() } });

  if (!/^[A-Za-z0-9_-]{16,256}$/.test(tokenHash) || !VERIFY_TYPES.has(type)) {
    return to("/account?verify=failed");
  }
  const r = await verifyTokenHash(type, tokenHash);
  if (!r.ok || !r.value.access_token || !r.value.refresh_token) {
    return to("/account?verify=failed");
  }
  const headers = new Headers({ Location: new URL(type === "recovery" ? "/account/password" : next, url.origin).toString() });
  for (const c of sessionCookies(r.value, isSecure(req))) headers.append("Set-Cookie", c);
  return new Response(null, { status: 303, headers });
}
