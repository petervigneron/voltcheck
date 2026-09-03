import { AT_COOKIE, clearedCookies, isSecure, signOut, withCookies } from "@/lib/auth";
import { cookies } from "next/headers";

// Sign out: revoke this device's refresh token at GoTrue (best effort — a
// GoTrue that is down must not keep someone signed in) and clear both
// cookies. The client then clears its local shelves and navigates home; see
// components/AccountPanel.tsx for why the shelves go too.

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  try {
    const at = (await cookies()).get(AT_COOKIE)?.value;
    if (at) await signOut(at);
  } catch {
    // nothing to revoke, or no cookie store — the cookies still get cleared
  }
  const headers = withCookies(new Headers(), clearedCookies(isSecure(req)));
  return Response.json({ ok: true }, { headers });
}
