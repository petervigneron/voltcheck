import {
  DATA_PLAN,
  entitled,
  keyLine,
  needsRefresh,
  stripeToState,
  type KeyRow,
  type KeyStatus,
  type StripeSubscription,
} from "./dataKeyCore";

// The data key's server half: the database functions of migration 0117 and
// the four Stripe calls a renewing key needs. lib/dataKeyCore.ts holds the
// rules; this file holds the I/O.
//
// Same posture as lib/pro.ts: Stripe over plain fetch, no SDK; the anon key
// plus STRIPE_GRANT_SECRET for every database write, because web/ holds no
// service-role key; never a card on this origin.
//
// HOW A RENEWAL IS NOTICED. The webhook endpoint is subscribed to
// checkout.session.completed and nothing else, so nobody tells us when a
// month rolls over. verifyKey() below is where it is noticed: a key
// presented after its stored period has ended makes one call to Stripe for
// the subscription, and the answer is written back. See 0117's header.

export * from "./dataKeyCore";

const STRIPE_API = "https://api.stripe.com/v1";

const secret = () => process.env.STRIPE_GRANT_SECRET ?? "";

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T | null> {
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

type Found = KeyRow & { found: true };
type Lookup = Found | { found: false };

const lookup = (by: { key?: string; email?: string }) =>
  rpc<Lookup>("data_key_lookup", { _secret: secret(), _key: by.key ?? null, _email: by.email ?? null });

const sync = (subscriptionId: string, status: KeyStatus, periodEnd: string | null) =>
  rpc<Lookup>("data_key_sync", { _secret: secret(), _subscription_id: subscriptionId, _status: status, _period_end: periodEnd });

export const grantKey = (a: { email: string; sessionId: string; subscriptionId: string; customerId: string | null; periodEnd: string }) =>
  rpc<{ status: string; api_key?: string; current_period_end?: string }>("data_key_grant", {
    _secret: secret(),
    _email: a.email,
    _session_id: a.sessionId,
    _subscription_id: a.subscriptionId,
    _customer_id: a.customerId,
    _period_end: a.periodEnd,
  });

// ── Stripe ─────────────────────────────────────────────────────────────────

function form(obj: Record<string, string | number | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) p.set(k, String(v));
  return p.toString();
}

async function stripe<T>(method: "GET" | "POST", path: string, body?: Record<string, string | number | undefined>): Promise<T | null> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  try {
    const res = await fetch(`${STRIPE_API}${path}`, {
      method,
      headers: { Authorization: `Bearer ${key}`, ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
      body: body ? form(body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.error("[data-key] stripe", method, path.replace(/sub_\w+/, "sub_…"), res.status, (await res.text().catch(() => "")).slice(0, 300));
      return null;
    }
    return (await res.json()) as T;
  } catch (e) {
    console.error("[data-key] stripe unreachable:", e instanceof Error ? e.message : e);
    return null;
  }
}

export const fetchSubscription = (id: string) =>
  /^sub_[A-Za-z0-9]+$/.test(id) ? stripe<StripeSubscription>("GET", `/subscriptions/${id}`) : Promise.resolve(null);

/** A hosted Checkout session for the monthly key. The price is inlined, as
 *  in lib/pro.ts, so DATA_PLAN is the one place it is written. */
export async function createDataCheckout(origin: string, email: string): Promise<string | null> {
  const s = await stripe<{ url?: string }>("POST", "/checkout/sessions", {
    mode: "subscription",
    "line_items[0][quantity]": 1,
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": DATA_PLAN.amountCents,
    "line_items[0][price_data][recurring][interval]": "month",
    "line_items[0][price_data][product_data][name]": DATA_PLAN.label,
    // The webhook tells a key purchase from a pass purchase by this, on the
    // session; the copy on the subscription is for whoever reads it in the
    // Stripe dashboard later.
    "metadata[kind]": "data",
    "subscription_data[metadata][kind]": "data",
    customer_email: email,
    billing_address_collection: "auto",
    success_url: `${origin}/account?key=new`,
    cancel_url: `${origin}/data`,
  });
  return s?.url ?? null;
}

// ── Entitlement ────────────────────────────────────────────────────────────

/** Ask Stripe about a row's subscription and store the answer. Returns the
 *  row as it now stands, or the row unchanged when Stripe did not answer —
 *  a Stripe outage must not read as a cancellation. */
async function refresh(row: Found): Promise<Found> {
  if (!row.stripe_subscription_id) return row;
  const sub = await fetchSubscription(row.stripe_subscription_id);
  if (!sub) return row;
  const next = stripeToState(sub);
  const stored = await sync(row.stripe_subscription_id, next.status, next.periodEnd);
  return stored?.found ? stored : { ...row, status: next.status, current_period_end: next.periodEnd ?? row.current_period_end };
}

const MEMO_MS = 5 * 60 * 1000;
const memo = new Map<string, { at: number; ok: boolean }>();

/**
 * Does this key open the paid tier right now? Remembered for five minutes
 * per function instance, so a client paging through results costs one
 * database call, not one per page — and a cancelled key is honoured for at
 * most five minutes past its end.
 */
export async function verifyKey(key: string): Promise<boolean> {
  const now = Date.now();
  const hit = memo.get(key);
  if (hit && now - hit.at < MEMO_MS) return hit.ok;
  let row = await lookup({ key });
  if (row === null) {
    // The database did not answer. Fail closed for a key never seen, open
    // for one this instance vouched for earlier: an outage should not lock
    // out a paying customer mid-job.
    return hit?.ok ?? false;
  }
  if (row.found && needsRefresh(row, now)) row = await refresh(row);
  const ok = row.found && entitled(row, now);
  if (memo.size > 5_000) memo.clear();
  memo.set(key, { at: now, ok });
  return ok;
}

/** The account's key as the database has it, refreshed from Stripe first if
 *  its period has ended. Null when the account has never bought one; throws
 *  when the database could not be asked. */
export async function keyForEmail(email: string): Promise<Found | null> {
  let row = await lookup({ email });
  // "The database did not answer" must not read as "has no key": the
  // checkout route asks this before selling one, and a second subscription
  // sold during an outage is a customer charged twice.
  if (row === null) throw new Error("data key lookup failed");
  if (!row.found) return null;
  if (needsRefresh(row, Date.now())) row = await refresh(row);
  return row;
}

/** Does this account hold a key that works right now? */
export async function holdsKey(email: string): Promise<boolean> {
  const row = await keyForEmail(email);
  return !!row && entitled(row, Date.now());
}

/** The account's key as /account shows it: the key, whether it works now
 *  ("ended" also covers a paid period that has run out), and the one line
 *  that says when it renews or ended. Null when there has never been one. */
export async function accountKey(
  email: string,
  day: (iso: string) => string,
): Promise<{ apiKey: string; status: KeyStatus; line: string } | null> {
  const row = await keyForEmail(email);
  if (!row) return null;
  const now = Date.now();
  return { apiKey: row.api_key, status: entitled(row, now) ? row.status : "ended", line: keyLine(row, now, day) };
}

/**
 * Stop the renewal, or undo that. Never ends access early: Stripe keeps the
 * subscription alive to the end of the paid period and so does the key.
 * Returns the row as Stripe now describes it, or null when it could not be
 * changed — the caller must say so rather than show a cancellation that
 * did not happen.
 */
export async function setRenewal(email: string, renew: boolean): Promise<Found | null> {
  const row = await lookup({ email });
  if (!row?.found || !row.stripe_subscription_id || row.status === "ended") return null;
  const sub = await stripe<StripeSubscription>("POST", `/subscriptions/${row.stripe_subscription_id}`, {
    cancel_at_period_end: renew ? "false" : "true",
  });
  if (!sub) return null;
  const next = stripeToState(sub);
  const stored = await sync(row.stripe_subscription_id, next.status, next.periodEnd);
  memo.delete(row.api_key);
  return stored?.found ? stored : null;
}
