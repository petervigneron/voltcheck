import { alertRpc, sendEmail, siteOrigin } from "@/lib/alerts";
import { watchlistIds } from "@/lib/watchlist";

// The free alert: price drops on the cars a shopper has starred. Body
// {email, ids: string[]} from lib/watchlist.ts; the whole shelf every time,
// and migration 0060 replaces the address's one watch-list row in place, so
// a shopper confirms once and the list follows their stars. An empty list
// removes the row (the "turn off" path).
//
// Same posture as /api/alerts: sizes checked here politely and again in the
// RPC, the subscribe secret proves the caller is this route, and the answer
// never says more than a status word — "created" (a confirm mail went out),
// "updated", "removed", "pending" (a confirm mail already went out today),
// or a flat failure.

const MAX_BODY = 8192;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

interface WatchlistResult {
  status: string;
  confirm_token?: string;
}

export async function POST(req: Request): Promise<Response> {
  if (!process.env.ALERTS_SUBSCRIBE_SECRET || !process.env.RESEND_API_KEY) {
    return Response.json({ ok: false, reason: "disabled" }, { status: 503 });
  }
  try {
    const raw = await req.text();
    if (!raw || raw.length > MAX_BODY) return Response.json({ ok: false }, { status: 400 });
    const b = JSON.parse(raw) as Record<string, unknown>;
    const email = typeof b.email === "string" ? b.email.trim() : "";
    const ids = Array.isArray(b.ids) ? watchlistIds(b.ids.filter((x): x is string => typeof x === "string")) : null;
    if (!EMAIL_RE.test(email) || email.length > 254 || ids === null) {
      return Response.json({ ok: false }, { status: 400 });
    }

    const r = await alertRpc<WatchlistResult>("alert_watchlist_set", {
      _email: email,
      _params: `ids=${ids.join(",")}`,
      _secret: process.env.ALERTS_SUBSCRIBE_SECRET,
    });
    if (!r || r.status === "rejected") return Response.json({ ok: false }, { status: 400 });

    if (r.status === "created" && r.confirm_token) {
      const confirmUrl = `${siteOrigin()}/alerts/confirm?token=${r.confirm_token}`;
      await sendEmail({
        to: email,
        subject: "Confirm your Voltcheck alert",
        text:
          `Confirm to turn on this alert for your saved cars:\n\n${confirmUrl}\n\n` +
          `If you didn't ask for this, ignore it — nothing will be sent.`,
        html:
          `<p>Confirm to turn on this alert for your saved cars:</p>` +
          `<p><a href="${confirmUrl}">Turn on this alert</a></p>` +
          `<p style="color:#666">If you didn't ask for this, ignore it — nothing will be sent.</p>`,
      });
    }
    return Response.json({ ok: true, status: r.status });
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }
}
