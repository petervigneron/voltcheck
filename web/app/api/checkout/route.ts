import { createCheckout, isTierId } from "@/lib/pro";

// Start a purchase: body {tier}. Returns the Stripe-hosted Checkout URL for
// the client to send the shopper to. Nothing is granted here — a session is
// an intent to pay, not a payment, and only the signed webhook is allowed to
// turn one into access.

export async function POST(req: Request): Promise<Response> {
  if (!process.env.STRIPE_SECRET_KEY) {
    return Response.json({ ok: false, reason: "disabled" }, { status: 503 });
  }
  try {
    const raw = await req.text();
    if (raw.length > 512) return Response.json({ ok: false }, { status: 400 });
    const { tier } = JSON.parse(raw) as { tier?: unknown };
    if (!isTierId(tier)) return Response.json({ ok: false }, { status: 400 });

    // Build the return URLs from THIS request's origin rather than a config
    // value, so a preview deployment sends the shopper back to itself instead
    // of bouncing them onto production mid-purchase.
    const origin = new URL(req.url).origin;
    const url = await createCheckout(tier, origin);
    if (!url) return Response.json({ ok: false }, { status: 502 });
    return Response.json({ ok: true, url });
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }
}
