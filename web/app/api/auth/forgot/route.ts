import { isEmail, requestPasswordReset } from "@/lib/auth";
import { readJsonBody } from "@/lib/apiBody";

// "Forgot your password": body {email}. GoTrue sends a reset mail through the
// Send Email hook if the address has an account, and answers 200 either way;
// this route answers {ok:true} either way too, including when GoTrue is
// unreachable (logged, not reported) — the form is an enumeration oracle
// otherwise, the same reasoning lib/proRecover.ts once carried.
//
// The link in the mail lands on /account/verify?type=recovery, which signs
// the shopper in and sends them to /account/password to choose a new one.

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const b = await readJsonBody(req);
  const email = typeof b?.email === "string" ? b.email.trim().toLowerCase() : "";
  if (!isEmail(email)) return Response.json({ ok: false, reason: "email" }, { status: 400 });

  const origin = new URL(req.url).origin;
  const r = await requestPasswordReset(email, `${origin}/account/verify?next=${encodeURIComponent("/account/password")}`);
  if (!r.ok) console.error("[auth] recover request failed:", r.error.status, r.error.code, r.error.message);
  return Response.json({ ok: true });
}
