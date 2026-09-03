import { currentUser } from "@/lib/auth";

// Who is signed in, for client components (lib/useUser.ts): the header link,
// the shelf sync, the alert controls. The email and nothing else. Private,
// no-store: an identity must never be served from a shared cache.

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const user = await currentUser();
  return Response.json({ email: user?.email ?? null }, { headers: { "Cache-Control": "private, no-store" } });
}
