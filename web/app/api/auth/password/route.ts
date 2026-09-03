import { currentUser, PASSWORD_MAX, PASSWORD_MIN, setPassword } from "@/lib/auth";
import { readJsonBody } from "@/lib/apiBody";

// Set a new password for the signed-in account: body {password}. Reached
// from /account/password, which is where a reset link lands (already signed
// in by /account/verify) and where a signed-in shopper changes theirs.

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const user = await currentUser();
  if (!user) return Response.json({ ok: false, reason: "signin" }, { status: 401 });
  const b = await readJsonBody(req);
  const password = typeof b?.password === "string" ? b.password : "";
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    return Response.json({ ok: false, reason: "password" }, { status: 400 });
  }
  const r = await setPassword(user.jwt, password);
  if (!r.ok) {
    if (r.error.code === "weak_password") return Response.json({ ok: false, reason: "password" }, { status: 400 });
    if (r.error.code === "same_password") return Response.json({ ok: true, unchanged: true });
    if (r.error.status === 401) return Response.json({ ok: false, reason: "signin" }, { status: 401 });
    console.error("[auth] password update failed:", r.error.status, r.error.code, r.error.message);
    return Response.json({ ok: false, reason: "unavailable" }, { status: 502 });
  }
  return Response.json({ ok: true });
}
