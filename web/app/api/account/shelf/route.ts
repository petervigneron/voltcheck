import { currentUser, userRpc } from "@/lib/auth";
import { readJsonBody } from "@/lib/apiBody";
import { validShelf, type Shelf } from "@/lib/shelfMerge";

// The account's shelf — saved cars and saved searches, as one document
// (migration 0063 account_shelf). GET reads it; PUT replaces it. The client
// (components/ShelfSync.tsx) treats the account as the truth and localStorage
// as the cache, so this is the whole sync protocol: pull on load, push on
// change.
//
// Both calls run as the signed-in user — the JWT from the cookie is the
// Bearer PostgREST verifies, and account_shelf_get/set read auth.uid() —
// so there is no way to name another account here.

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(): Promise<Response> {
  const user = await currentUser();
  if (!user) return Response.json({ ok: false, reason: "signin" }, { status: 401, headers: NO_STORE });
  const r = await userRpc<{ cars?: unknown; searches?: unknown }>(user.jwt, "account_shelf_get");
  if (!r) return Response.json({ ok: false, reason: "unavailable" }, { status: 502, headers: NO_STORE });
  const shelf = validShelf({ cars: r.cars, searches: r.searches });
  return Response.json({ ok: true, ...shelf }, { headers: NO_STORE });
}

export async function PUT(req: Request): Promise<Response> {
  const user = await currentUser();
  if (!user) return Response.json({ ok: false, reason: "signin" }, { status: 401, headers: NO_STORE });
  const b = await readJsonBody(req, 262144);
  if (!b) return Response.json({ ok: false }, { status: 400 });
  const shelf: Shelf = validShelf({ cars: b.cars, searches: b.searches });
  const r = await userRpc<{ status?: string }>(user.jwt, "account_shelf_set", { _cars: shelf.cars, _searches: shelf.searches });
  if (!r || r.status !== "ok") {
    return Response.json({ ok: false, reason: r?.status ?? "unavailable" }, { status: r ? 400 : 502, headers: NO_STORE });
  }
  return Response.json({ ok: true }, { headers: NO_STORE });
}
