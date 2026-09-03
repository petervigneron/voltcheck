import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";

// Voltcheck Pro: the paid side. Backed by migration 0045 (pro_passes), which
// holds the whole design rationale — no accounts, no passwords, no recurring
// billing; the access token IS the credential and expires_at is fixed at
// purchase.
//
// Stripe is spoken to over plain fetch, the same way lib/alerts.ts speaks to
// Resend. The SDK would be a large dependency in web/ for two endpoints and a
// signature check, and the signature check is the only subtle part — it is
// forty lines below, and it is better to have it visible than vendored.
//
// We never see a card. Checkout is Stripe-hosted: we create a session, send
// the shopper to Stripe's page, and learn the outcome from a signed webhook.
// No card detail ever touches this origin.

export const PRO_COOKIE = "vc_pro";

/** The two passes from docs/MONETIZATION.md §2. Non-recurring, both.
 *
 *  Owner, 2026-09-03: $3 for the week, and the $9 pass runs 60 days rather
 *  than 90. The `quarter` key is kept as-is — it is the value stored in
 *  pro_passes.tier (0045's check constraint) and in every Stripe session's
 *  metadata, so renaming it would orphan sold passes for a nicer name. The
 *  blurb is Stripe's line-item description only; the page no longer prints
 *  it, and the week pass has none (Stripe rejects an empty description, so
 *  createCheckout omits the field when it is blank). */
export const TIERS = {
  week:    { label: "7-day pass",  days: 7,  amountCents: 300, blurb: "" },
  quarter: { label: "60-day pass", days: 60, amountCents: 900, blurb: "Covers the whole search, in one decision." },
} as const;

export type TierId = keyof typeof TIERS;
export const isTierId = (v: unknown): v is TierId =>
  typeof v === "string" && Object.hasOwn(TIERS, v);

// ── Database ───────────────────────────────────────────────────────────────

/** Call a pro_* RPC with the anon key. Same posture as alertRpc: web/ holds no
 *  service-role key, and 0045's security-definer functions are anon's only
 *  path to pro_passes. */
async function proRpc<T>(fn: string, args: Record<string, unknown>): Promise<T | null> {
  const base = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_ANON_KEY;
  if (!base || !key) return null;
  try {
    const res = await fetch(`${base}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(args),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export interface PassState {
  active: boolean;
  tier?: TierId;
  expires_at?: string;
}

export const checkPass = (token: string) => proRpc<PassState>("pro_check", { _token: token });

export const grantPass = (a: {
  email: string; tier: TierId; sessionId: string;
  customerId?: string | null; amountCents?: number | null;
}) =>
  proRpc<{ status: string; access_token?: string; expires_at?: string }>("pro_grant", {
    _secret: process.env.STRIPE_GRANT_SECRET ?? "",
    _email: a.email,
    _tier: a.tier,
    _days: TIERS[a.tier].days,
    _session_id: a.sessionId,
    _customer_id: a.customerId ?? null,
    _amount_cents: a.amountCents ?? null,
  });

export const recoverPass = (email: string) =>
  proRpc<{ status: string; access_token?: string; expires_at?: string }>("pro_recover", {
    _secret: process.env.STRIPE_GRANT_SECRET ?? "",
    _email: email,
  });

// ── Entitlement ────────────────────────────────────────────────────────────

/** Is the current visitor Pro? Reads the cookie set by /pro/access and asks
 *  the database, which is the only thing that knows the expiry. Deliberately
 *  NOT trusted from the cookie's own contents: the cookie carries the token,
 *  never the entitlement, so a hand-edited cookie buys nothing. */
export async function currentPass(): Promise<PassState> {
  const token = (await cookies()).get(PRO_COOKIE)?.value;
  if (!token || !/^[0-9a-f-]{36}$/i.test(token)) return { active: false };
  return (await checkPass(token)) ?? { active: false };
}

export const isPro = async () => (await currentPass()).active;

/** The address that bought the pass behind this token, or null (0059
 *  pro_email). Used to subscribe the Pro standing order under the address the
 *  sender will recognise as Pro — see the migration header for why this is a
 *  separate function from pro_check. */
export const passEmail = (token: string) => proRpc<string | null>("pro_email", { _token: token });

export async function currentPassEmail(): Promise<string | null> {
  const token = (await cookies()).get(PRO_COOKIE)?.value;
  if (!token || !/^[0-9a-f-]{36}$/i.test(token)) return null;
  const email = await passEmail(token);
  return typeof email === "string" && email.includes("@") ? email : null;
}

// ── Stripe ─────────────────────────────────────────────────────────────────

const STRIPE_API = "https://api.stripe.com/v1";

/** Stripe's API is form-encoded, including nested keys as a[0][b]. */
function form(obj: Record<string, string | number | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) p.set(k, String(v));
  return p.toString();
}

/** Create a hosted Checkout session and return where to send the shopper.
 *  Prices are inlined via price_data rather than referencing pre-made Price
 *  objects, so the ladder in TIERS is the single source of truth and changing
 *  a price is a code change, not a code change plus dashboard surgery. */
export async function createCheckout(tier: TierId, origin: string): Promise<string | null> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  const t = TIERS[tier];
  const res = await fetch(`${STRIPE_API}/checkout/sessions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: form({
      mode: "payment",
      "line_items[0][quantity]": 1,
      "line_items[0][price_data][currency]": "usd",
      "line_items[0][price_data][unit_amount]": t.amountCents,
      "line_items[0][price_data][product_data][name]": `Voltcheck Pro — ${t.label}`,
      ...(t.blurb ? { "line_items[0][price_data][product_data][description]": t.blurb } : {}),
      // The tier has to survive the round trip to Stripe and back, and the
      // webhook must not infer it from the amount — a future price change
      // would silently re-map old sessions to the wrong tier.
      "metadata[tier]": tier,
      // Stripe collects the address itself; we only ever want the email.
      billing_address_collection: "auto",
      success_url: `${origin}/pro/thanks?session={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pro`,
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    console.error("[pro] checkout session failed:", res.status, await res.text().catch(() => ""));
    return null;
  }
  return ((await res.json()) as { url?: string }).url ?? null;
}

/** Verify a Stripe webhook signature.
 *
 *  This is the security boundary of the whole paid lane: anything that clears
 *  it gets to mint access. Stripe signs `${timestamp}.${rawBody}` with the
 *  endpoint secret and sends `t=<ts>,v1=<hex>` (possibly several v1s during a
 *  secret rotation, so check them all).
 *
 *  Two things that are easy to omit and both matter: the comparison is
 *  constant-time, and the timestamp is bounded — without the age check a
 *  captured-and-replayed payload stays valid forever, and Stripe's own
 *  at-least-once delivery means replays are normal traffic rather than an
 *  exotic attack. (0045's session-id uniqueness is the second line of defence
 *  behind this one.) */
export function verifyStripeSignature(raw: string, header: string | null, toleranceSec = 300): boolean {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !header) return false;

  let ts = "";
  const sigs: string[] = [];
  for (const part of header.split(",")) {
    const [k, v] = part.split("=", 2);
    if (k?.trim() === "t") ts = v?.trim() ?? "";
    else if (k?.trim() === "v1" && v) sigs.push(v.trim());
  }
  if (!ts || !sigs.length) return false;

  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(ts));
  if (!Number.isFinite(age) || age > toleranceSec) return false;

  const expected = createHmac("sha256", secret).update(`${ts}.${raw}`, "utf8").digest();
  return sigs.some((s) => {
    let got: Buffer;
    try { got = Buffer.from(s, "hex"); } catch { return false; }
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
}
