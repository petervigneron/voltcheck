// The data key's rules, kept free of next/headers, fetch and env so the
// tests can hold them (tests/data-key.test.ts). lib/dataKey.ts is the half
// that talks to the database and to Stripe.
//
// A data key is the paid tier of the public API (migration 0117): $29 a
// month, renewing, sold to people who want the data rather than a car.

export const DATA_PLAN = {
  amountCents: 2900,
  /** Stripe's line-item name and the label on /account. */
  label: "Census data key",
} as const;

export const KEY_RE = /^cev_[0-9a-f]{64}$/;

/** Our three states (0117). */
export type KeyStatus = "active" | "canceling" | "ended";

export interface KeyRow {
  api_key: string;
  status: KeyStatus;
  /** ISO. The end of the period the last Stripe check saw. */
  current_period_end: string;
  stripe_subscription_id?: string;
  checked_at?: string;
  email?: string;
}

/**
 * The key a request presents, or null. `Authorization: Bearer cev_…` or
 * `X-Api-Key: cev_…` — headers only. A key in a query string ends up in
 * access logs, browser history and referrers, so it is not accepted there
 * even though it would be the easiest thing to paste.
 *
 * Returns "malformed" when a credential was clearly offered but is not a
 * key: the caller answers 401 rather than quietly serving the free tier to
 * someone who believes they are using what they paid for.
 */
export function presentedKey(headers: Headers): string | "malformed" | null {
  const x = headers.get("x-api-key")?.trim();
  if (x) return KEY_RE.test(x) ? x : "malformed";
  const auth = headers.get("authorization")?.trim();
  if (!auth) return null;
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  if (!m) return null;
  const token = m[1].trim();
  // Another scheme's bearer token (a browser extension, a proxy) is not ours
  // to judge; only something shaped like our key is held to being one.
  if (!token.startsWith("cev_")) return null;
  return KEY_RE.test(token) ? token : "malformed";
}

/** The fields of a Stripe subscription this code reads. */
export interface StripeSubscription {
  id?: string;
  status?: string;
  cancel_at_period_end?: boolean;
  /** Where the period end lived until Stripe's 2025 API versions… */
  current_period_end?: number | null;
  /** …and where it lives since: on each item. */
  items?: { data?: { current_period_end?: number | null }[] } | null;
  ended_at?: number | null;
  metadata?: Record<string, string> | null;
}

/** Unix seconds of the current period's end, wherever this API version keeps it. */
export function periodEnd(sub: StripeSubscription): number | null {
  const top = sub.current_period_end;
  if (typeof top === "number" && top > 0) return top;
  const ends = (sub.items?.data ?? []).map((i) => i.current_period_end).filter((n): n is number => typeof n === "number" && n > 0);
  return ends.length ? Math.max(...ends) : null;
}

/**
 * Stripe's word for a subscription, as ours.
 *
 * `past_due` stays "active": Stripe is still retrying the card, the period
 * end it reports is the one that lapsed, and the grace window in entitled()
 * is what decides how long a late payment keeps the key working. Cutting a
 * customer off on the first failed retry is how you lose the ones who
 * would have paid on the second.
 */
export function stripeToState(sub: StripeSubscription): { status: KeyStatus; periodEnd: string | null } {
  const end = periodEnd(sub);
  const iso = end ? new Date(end * 1000).toISOString() : null;
  const s = sub.status;
  if (s === "active" || s === "trialing" || s === "past_due") {
    return { status: sub.cancel_at_period_end ? "canceling" : "active", periodEnd: iso };
  }
  // canceled, unpaid, incomplete, incomplete_expired, paused, or a status
  // this code has never heard of: not something to sell access on.
  const ended = typeof sub.ended_at === "number" && sub.ended_at > 0 ? new Date(sub.ended_at * 1000).toISOString() : null;
  return { status: "ended", periodEnd: ended ?? iso };
}

/** How long past its period a key still works. Covers Stripe's own renewal
 *  lag (an invoice finalises about an hour after the period rolls) and a
 *  card that fails once and succeeds on a retry. */
export const GRACE_MS = 3 * 24 * 60 * 60 * 1000;
/** Do not ask Stripe about the same lapsed key more often than this. */
export const RECHECK_MS = 10 * 60 * 1000;

/** Does this row, as stored, open the paid tier right now? */
export function entitled(row: Pick<KeyRow, "status" | "current_period_end">, now: number): boolean {
  const end = Date.parse(row.current_period_end);
  if (!Number.isFinite(end)) return false;
  if (row.status === "ended") return false;
  // A cancelled key runs to the end of what was paid for and not a day
  // longer; a renewing one gets the grace.
  return row.status === "canceling" ? now < end : now < end + GRACE_MS;
}

/**
 * Should the server ask Stripe before trusting this row? Only once the
 * stored period is over — a renewal or a lapse has happened and the row
 * does not know which — and not if it asked moments ago.
 */
export function needsRefresh(row: Pick<KeyRow, "status" | "current_period_end" | "checked_at">, now: number): boolean {
  if (row.status === "ended") return false;
  const end = Date.parse(row.current_period_end);
  if (!Number.isFinite(end) || now < end) return false;
  const checked = row.checked_at ? Date.parse(row.checked_at) : NaN;
  return !Number.isFinite(checked) || now - checked >= RECHECK_MS;
}

/** The one-line state /account prints. */
export function keyLine(row: Pick<KeyRow, "status" | "current_period_end">, now: number, day: (iso: string) => string): string {
  const d = day(row.current_period_end);
  if (row.status === "ended" || !entitled(row, now)) return `ended ${d}`;
  return row.status === "canceling" ? `ends ${d}` : `renews ${d}`;
}
