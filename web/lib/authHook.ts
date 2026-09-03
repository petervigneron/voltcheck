import { createHmac, createHash, timingSafeEqual } from "node:crypto";

// ── The Send Email hook ────────────────────────────────────────────────────

const HOOK_LABEL = "voltcheck-auth-hook:";

/** The hook's HMAC key, derived from the grant secret. Registered with
 *  Supabase as `v1,whsec_<base64 of these bytes>` — see hookSecretForSupabase. */
export function hookKey(grantSecret: string | undefined): Buffer | null {
  if (!grantSecret) return null;
  return createHash("sha256").update(HOOK_LABEL + grantSecret, "utf8").digest();
}

/** What to paste into Supabase's hook config for a given grant secret. Used
 *  once, from a local shell, to register the hook; kept here so the two
 *  sides cannot drift. */
export const hookSecretForSupabase = (grantSecret: string) => `v1,whsec_${hookKey(grantSecret)!.toString("base64")}`;

/** Standard Webhooks verification: HMAC-SHA256 over `${id}.${timestamp}.${body}`,
 *  base64, presented as one or more "v1,<sig>" in webhook-signature. The
 *  timestamp is bounded so a captured delivery cannot be replayed to make us
 *  send the same mail again later. Constant-time compare, as with Stripe. */
export function verifyAuthHook(
  raw: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  key: Buffer | null,
  nowSec = Math.floor(Date.now() / 1000),
  toleranceSec = 300,
): boolean {
  if (!key || !headers.id || !headers.timestamp || !headers.signature) return false;
  const ts = Number(headers.timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowSec - ts) > toleranceSec) return false;
  const expected = createHmac("sha256", key).update(`${headers.id}.${headers.timestamp}.${raw}`, "utf8").digest();
  return headers.signature.split(/\s+/).some((entry) => {
    const [version, sig] = entry.split(",", 2);
    if (version !== "v1" || !sig) return false;
    let got: Buffer;
    try {
      got = Buffer.from(sig, "base64");
    } catch {
      return false;
    }
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
}


