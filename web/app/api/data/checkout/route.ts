import { createDataCheckout, holdsKey } from "@/lib/dataKey";
import { currentUser } from "@/lib/auth";
import { checkoutConfigured } from "@/lib/proOffer";

// Start a data-key subscription: returns the Stripe-hosted Checkout URL.
// Nothing is granted here — only the signed webhook mints a key
// (app/api/stripe/webhook/route.ts).
//
// Sign-in is required for the same reason a pass requires it (0063): the key
// is granted to the address on the Stripe session, and the account's address
// is pinned there, so the key is on /account the moment the webhook lands.
//
// An account that already holds a working key is refused. Checkout would
// happily sell a second subscription to the same address, the grant would
// revive the one row, and the customer would be paying twice for one key.

export async function POST(req: Request): Promise<Response> {
  if (!checkoutConfigured()) return Response.json({ ok: false, reason: "disabled" }, { status: 503 });
  const user = await currentUser();
  if (!user) return Response.json({ ok: false, reason: "signin" }, { status: 401 });

  try {
    if (await holdsKey(user.email)) {
      return Response.json({ ok: false, reason: "active" }, { status: 409 });
    }
  } catch {
    // Could not check: do not sell what may be a second subscription.
    return Response.json({ ok: false, reason: "unavailable" }, { status: 503 });
  }

  // This request's own origin, so a preview deployment returns to itself.
  const url = await createDataCheckout(new URL(req.url).origin, user.email);
  if (!url) return Response.json({ ok: false }, { status: 502 });
  return Response.json({ ok: true, url });
}
