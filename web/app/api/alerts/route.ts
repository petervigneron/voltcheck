import { alertRpc, sendEmail, siteOrigin } from "@/lib/alerts";
import { currentUser, userRpc } from "@/lib/auth";

// Alert signup: body {email, params, label?} from components/AlertSignup.tsx.
// Validates sizes (the RPC re-checks them — these are the polite refusal, the
// database's are the backstop), calls alert_subscribe with the site's secret,
// and mails the confirm link when the RPC minted one. Double opt-in: nothing
// is live until the address owner clicks /alerts/confirm.
//
// The response never distinguishes "new" from "already subscribed" from
// "rejected" beyond ok/disabled — an enumeration-shaped question deserves a
// flat answer.
//
// Signed in (0063): the subscription goes under the account's address via
// alert_subscribe_mine, confirmed at once — the address was confirmed at
// sign-up — and the answer carries status "confirmed" so the form can say
// "on" instead of "check your inbox". A body email that differs from the
// account's is still honoured the old way (someone subscribing a partner's
// address gets the confirm mail there, as before).

const MAX_BODY = 4096;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

interface SubscribeResult {
  status: string;
  confirm_token?: string;
  unsubscribe_token?: string;
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
    const params = typeof b.params === "string" ? b.params : "";
    const label = typeof b.label === "string" && b.label ? b.label.slice(0, 200) : null;
    if (params.length > 1024) return Response.json({ ok: false }, { status: 400 });
    if (email && (!EMAIL_RE.test(email) || email.length > 254)) {
      return Response.json({ ok: false }, { status: 400 });
    }

    const user = await currentUser();
    if (user && (!email || email.toLowerCase() === user.email.toLowerCase())) {
      const mine = await userRpc<{ status?: string }>(user.jwt, "alert_subscribe_mine", { _params: params, _label: label });
      if (!mine || mine.status === "rejected" || mine.status === "unauthenticated") {
        return Response.json({ ok: false }, { status: mine ? 400 : 502 });
      }
      return Response.json({ ok: true, status: "confirmed" });
    }

    if (!email) return Response.json({ ok: false }, { status: 400 });
    const r = await alertRpc<SubscribeResult>("alert_subscribe", {
      _email: email,
      _params: params,
      _label: label,
      _secret: process.env.ALERTS_SUBSCRIBE_SECRET,
    });
    if (!r || r.status === "rejected") return Response.json({ ok: false }, { status: 400 });

    if (r.status === "created" && r.confirm_token) {
      const origin = siteOrigin();
      const confirmUrl = `${origin}/alerts/confirm?token=${r.confirm_token}`;
      const what = label ? `your search — ${label}` : "your search";
      await sendEmail({
        to: email,
        subject: "Confirm your Voltcheck alert",
        text:
          `Confirm to turn on this alert for ${what}:\n\n${confirmUrl}\n\n` +
          `If you didn't ask for this, ignore it — nothing will be sent.`,
        html:
          `<p>Confirm to turn on this alert for ${escapeHtml(what)}:</p>` +
          `<p><a href="${confirmUrl}">Turn on this alert</a></p>` +
          `<p style="color:#666">If you didn't ask for this, ignore it — nothing will be sent.</p>`,
      });
    }
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
