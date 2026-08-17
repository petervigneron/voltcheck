import { alertRpc, sendEmail, siteOrigin } from "@/lib/alerts";

// Alert signup: body {email, params, label?} from components/AlertSignup.tsx.
// Validates sizes (the RPC re-checks them — these are the polite refusal, the
// database's are the backstop), calls alert_subscribe with the site's secret,
// and mails the confirm link when the RPC minted one. Double opt-in: nothing
// is live until the address owner clicks /alerts/confirm.
//
// The response never distinguishes "new" from "already subscribed" from
// "rejected" beyond ok/disabled — an enumeration-shaped question deserves a
// flat answer.

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
    if (!EMAIL_RE.test(email) || email.length > 254 || params.length > 1024) {
      return Response.json({ ok: false }, { status: 400 });
    }

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
          `Confirm to get an email when new cars match ${what}:\n\n${confirmUrl}\n\n` +
          `If you didn't ask for this, ignore it — nothing will be sent.`,
        html:
          `<p>Confirm to get an email when new cars match ${escapeHtml(what)}:</p>` +
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
