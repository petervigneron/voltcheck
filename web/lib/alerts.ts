// Server-only helper for the alert RPCs (migration 0029). All three run with
// the anon key — the same posture as every other web read/write: web/ holds
// no service-role key, and the RPCs are the only path anon has to the
// alert_subscriptions table. The subscribe secret (ALERTS_SUBSCRIBE_SECRET,
// Vercel env) is what lets OUR route receive confirm tokens; see 0029's
// header for why anon callers without it get none.

export async function alertRpc<T>(fn: string, args: Record<string, unknown>): Promise<T | null> {
  const base = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_ANON_KEY;
  if (!base || !key) return null;
  try {
    const res = await fetch(`${base}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export const siteOrigin = () => process.env.SITE_ORIGIN?.replace(/\/$/, "") || "https://voltcheck.net";

/** Send one email through Resend. Returns whether Resend accepted it. */
export async function sendEmail(msg: { to: string; subject: string; text: string; html: string }): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.ALERTS_FROM || "Voltcheck <alerts@voltcheck.net>",
        ...msg,
      }),
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}
