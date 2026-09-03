import { hookKey, verifyAuthHook } from "@/lib/authHook";
import { verifyLink, type HookMail } from "@/lib/authCore";
import { sendEmail, siteOrigin } from "@/lib/alerts";

// Supabase Auth's Send Email hook. Every mail the login needs — confirm this
// address, reset this password — arrives here as a signed POST carrying the
// user and a token hash, and goes out through Resend from the alerts sender,
// with a link onto this site. Supabase's own mailer is not used at all
// (2/hour, meant for development); the hook is what lets a real signup
// volume through and keeps every mail the site sends in one place.
//
// The signature is the Standard Webhooks scheme, checked with a key derived
// from STRIPE_GRANT_SECRET (lib/authHook.ts explains the derivation). An
// unsigned or stale delivery is refused before anything is sent — an open
// version of this route would be a way to mail anyone from our sender.
//
// Answering non-2xx makes GoTrue report the failure to the caller (a signup
// that cannot mail its confirmation fails loudly rather than leaving an
// account that can never be confirmed), so a refused send is a 500.

export const dynamic = "force-dynamic";

const SUBJECT: Record<string, string> = {
  signup: "Confirm your Voltcheck email",
  recovery: "Reset your Voltcheck password",
  magiclink: "Your Voltcheck sign-in link",
  email_change: "Confirm your new Voltcheck email",
  invite: "Your Voltcheck account",
};

const LEAD: Record<string, string> = {
  signup: "Confirm this address to finish creating your Voltcheck account:",
  recovery: "Choose a new password for your Voltcheck account:",
  magiclink: "Sign in to Voltcheck:",
  email_change: "Confirm this as the new address for your Voltcheck account:",
  invite: "Create your Voltcheck account:",
};

export async function POST(req: Request): Promise<Response> {
  const raw = await req.text();
  const ok = verifyAuthHook(
    raw,
    {
      id: req.headers.get("webhook-id"),
      timestamp: req.headers.get("webhook-timestamp"),
      signature: req.headers.get("webhook-signature"),
    },
    hookKey(process.env.STRIPE_GRANT_SECRET),
  );
  if (!ok) return Response.json({ error: { http_code: 401, message: "bad signature" } }, { status: 401 });

  let mail: HookMail;
  try {
    mail = JSON.parse(raw) as HookMail;
  } catch {
    return Response.json({ error: { http_code: 400, message: "bad body" } }, { status: 400 });
  }
  const to = mail.user?.email;
  const type = mail.email_data?.email_action_type ?? "";
  const link = verifyLink(siteOrigin(), mail.email_data ?? {});
  if (!to || !link) return Response.json({ error: { http_code: 400, message: "unusable" } }, { status: 400 });

  const subject = SUBJECT[type] ?? "Voltcheck";
  const lead = LEAD[type] ?? "Continue on Voltcheck:";
  const sent = await sendEmail({
    to,
    subject,
    text: `${lead}\n\n${link}\n\nIf you didn't ask for this, ignore it — nothing changes.\n`,
    html:
      `<p>${lead}</p>` +
      `<p><a href="${link}">${type === "recovery" ? "Choose a new password" : "Continue"}</a></p>` +
      `<p style="color:#666">If you didn't ask for this, ignore it — nothing changes.</p>`,
  });
  if (!sent) {
    console.error("[auth] hook mail refused by Resend:", type);
    return Response.json({ error: { http_code: 500, message: "mail not sent" } }, { status: 500 });
  }
  return Response.json({});
}
