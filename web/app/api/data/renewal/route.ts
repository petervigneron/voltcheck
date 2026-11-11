import { setRenewal } from "@/lib/dataKey";
import { currentUser } from "@/lib/auth";

// Stop a data key from renewing, or let it renew again: body {renew}.
//
// Cancelling is one click on /account and takes effect at Stripe before this
// answers. It never ends access early — the key works to the end of the
// month already paid for. A cancel that Stripe did not accept answers 502,
// and the page says so: showing "cancelled" over a subscription that will
// charge again next month is the one failure this route must not have.

export async function POST(req: Request): Promise<Response> {
  const user = await currentUser();
  if (!user) return Response.json({ ok: false, reason: "signin" }, { status: 401 });
  let renew: unknown;
  try {
    const raw = await req.text();
    if (raw.length > 128) return Response.json({ ok: false }, { status: 400 });
    renew = (JSON.parse(raw) as { renew?: unknown }).renew;
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }
  if (typeof renew !== "boolean") return Response.json({ ok: false }, { status: 400 });

  const row = await setRenewal(user.email, renew);
  if (!row) return Response.json({ ok: false }, { status: 502 });
  return Response.json({ ok: true, status: row.status, current_period_end: row.current_period_end });
}
