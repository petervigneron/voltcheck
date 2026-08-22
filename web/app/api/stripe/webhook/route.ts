import { grantPass, isTierId, verifyStripeSignature, TIERS } from "@/lib/pro";
import { sendEmail, siteOrigin } from "@/lib/alerts";

// Stripe → us: the only thing in the system allowed to mint paid access.
//
// Order matters here and the order is: verify the signature, THEN read the
// body. Nothing derived from an unverified payload may reach the database,
// which is why the tier is pulled from metadata on the verified event rather
// than from anything the client sent us earlier.
//
// Idempotency is not optional. Stripe delivery is at-least-once and it retries
// on any non-2xx, so this handler WILL be called more than once for a single
// payment. pro_grant keys on the session id and returns the existing token on
// a replay (0045), so a retry re-sends the same access link instead of
// granting a second pass. That also means: return 200 for anything we have
// successfully handled or deliberately ignored, and non-2xx ONLY when a retry
// might genuinely succeed — a 500 on an event we can never process turns into
// days of pointless retries.

export const dynamic = "force-dynamic";

interface CheckoutSession {
  id?: string;
  amount_total?: number | null;
  customer?: string | null;
  customer_details?: { email?: string | null } | null;
  customer_email?: string | null;
  metadata?: { tier?: string } | null;
  payment_status?: string | null;
}

export async function POST(req: Request): Promise<Response> {
  // The raw text, not the parsed body: the signature covers the exact bytes
  // Stripe sent, and JSON.parse + re-stringify would not reproduce them.
  const raw = await req.text();

  if (!verifyStripeSignature(raw, req.headers.get("stripe-signature"))) {
    // Deliberately terminal. A bad signature is never worth retrying, and
    // saying more than "no" would help someone probing the endpoint.
    return new Response("bad signature", { status: 400 });
  }

  let event: { type?: string; data?: { object?: CheckoutSession } };
  try {
    event = JSON.parse(raw);
  } catch {
    return new Response("unparseable", { status: 400 });
  }

  if (event.type !== "checkout.session.completed") {
    return Response.json({ ok: true, ignored: event.type });
  }

  const s = event.data?.object ?? {};
  const email = s.customer_details?.email || s.customer_email || "";
  const tier = s.metadata?.tier;

  // An async payment method can complete the session before the money
  // settles. Only 'paid' buys access; the unpaid case resolves later via
  // checkout.session.async_payment_succeeded, which we do not grant on today.
  if (s.payment_status && s.payment_status !== "paid") {
    console.warn("[pro] session completed but not paid:", s.id, s.payment_status);
    return Response.json({ ok: true, pending: true });
  }
  if (!s.id || !email || !isTierId(tier)) {
    // Nothing a retry can fix — a session we cannot attribute stays
    // un-granted, and it is louder in the log than it is in the response.
    console.error("[pro] unusable session:", s.id, { hasEmail: !!email, tier });
    return Response.json({ ok: true, unusable: true });
  }

  const granted = await grantPass({
    email,
    tier,
    sessionId: s.id,
    customerId: s.customer ?? null,
    amountCents: s.amount_total ?? null,
  });

  // This one IS worth retrying: the payment is real and the database is not
  // answering, so a 500 buys us Stripe's retry ladder rather than a paying
  // shopper with nothing to show for it.
  if (!granted || !granted.access_token) {
    console.error("[pro] grant failed for session", s.id, granted?.status);
    return new Response("grant failed", { status: 500 });
  }

  const link = `${siteOrigin()}/pro/access?t=${granted.access_token}`;
  const until = granted.expires_at
    ? new Date(granted.expires_at).toLocaleDateString("en-US",
        { year: "numeric", month: "long", day: "numeric" })
    : "";
  const label = TIERS[tier].label;

  const ok = await sendEmail({
    to: email,
    subject: `Your Voltcheck Pro ${label}`,
    text:
      `Your ${label} is active${until ? ` through ${until}` : ""}.\n\n` +
      `Open it here — this link is your access, so keep the email:\n${link}\n\n` +
      `It does not renew and you will not be charged again.\n`,
    html:
      `<p>Your <strong>${label}</strong> is active${until ? ` through ${until}` : ""}.</p>` +
      `<p><a href="${link}">Open Voltcheck Pro</a></p>` +
      `<p style="color:#555">This link is your access — keep the email. ` +
      `The pass does not renew and you will not be charged again.</p>`,
  });

  // The pass exists either way; only the delivery failed, and /pro has a
  // "re-send my link" path for exactly this. Retrying the whole webhook would
  // not help, so this is a 200 with a loud log.
  if (!ok) console.error("[pro] pass granted but access email failed:", s.id);

  return Response.json({ ok: true, status: granted.status, emailed: ok });
}
