import { currentUser, userRpc } from "@/lib/auth";

// The signed-in shopper's own alert subscriptions (0112): GET lists them,
// DELETE {id} removes one. Account only — an anonymous subscription has no
// account to list under and keeps its unsubscribe link. The answer carries
// what a row is (label, params, dates) and never a token.

const NO_STORE = { "Cache-Control": "private, no-store" };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Row {
  id: string;
  label: string | null;
  params: string;
  created_at: string;
  last_sent_at: string | null;
}

export async function GET(): Promise<Response> {
  const user = await currentUser();
  if (!user) return Response.json({ ok: false, reason: "signin" }, { status: 401, headers: NO_STORE });
  const rows = await userRpc<Row[]>(user.jwt, "alert_list_mine");
  if (rows === null) return Response.json({ ok: false, reason: "unavailable" }, { status: 502, headers: NO_STORE });
  const alerts = (Array.isArray(rows) ? rows : []).map((r) => ({
    id: r.id,
    label: r.label,
    params: r.params,
    createdAt: r.created_at,
    lastSentAt: r.last_sent_at,
  }));
  return Response.json({ ok: true, alerts }, { headers: NO_STORE });
}

export async function DELETE(req: Request): Promise<Response> {
  const user = await currentUser();
  if (!user) return Response.json({ ok: false, reason: "signin" }, { status: 401, headers: NO_STORE });
  let id = "";
  try {
    const raw = await req.text();
    if (!raw || raw.length > 256) return Response.json({ ok: false }, { status: 400, headers: NO_STORE });
    const b = JSON.parse(raw) as Record<string, unknown>;
    id = typeof b.id === "string" ? b.id : "";
  } catch {
    return Response.json({ ok: false }, { status: 400, headers: NO_STORE });
  }
  if (!UUID_RE.test(id)) return Response.json({ ok: false }, { status: 400, headers: NO_STORE });
  const r = await userRpc<{ status?: string }>(user.jwt, "alert_remove_mine", { _id: id });
  if (!r || r.status === "unauthenticated") {
    return Response.json({ ok: false }, { status: r ? 401 : 502, headers: NO_STORE });
  }
  return Response.json({ ok: true, status: r.status }, { headers: NO_STORE });
}
