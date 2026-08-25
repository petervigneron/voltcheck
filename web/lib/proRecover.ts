// "Re-send my access link." The pass is a capability token mailed to the
// buyer (migration 0045) and there are no accounts, so a lost email is a lost
// product — this is the whole recovery path.
//
// ── The one invariant ──────────────────────────────────────────────────────
//
// The answer is the same bytes whether the address bought a pass, never
// bought one, or is misspelled. Anything else is an oracle: point it at a
// list of addresses and it tells you which of them are Voltcheck customers.
// 0045's pro_recover is already secret-gated for this reason; the route in
// front of it must not undo that by leaking the same fact through its status
// code, its body, or how long it takes to answer.
//
// That is why the handler below never branches on the RPC's answer for
// anything the caller can observe, and why a failed send is logged rather
// than reported. It is also why this lives in lib/ rather than inside
// route.ts: the deps are injected, so a test can drive the found case, the
// none case, the denied case and the send-failure case and assert they are
// byte-identical. app/api/pro/recover/route.ts is the thin wiring.

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MAX_BODY = 512;

/** Best-effort floor between two link mails to one address. */
const RESEND_FLOOR_MS = 10 * 60_000;
/** Bound on the throttle map, so a spray cannot grow it without limit. */
const THROTTLE_CAP = 5_000;

export interface RecoverResult {
  status: string;
  access_token?: string;
  expires_at?: string;
}

export interface RecoverDeps {
  /** lib/pro.ts recoverPass. Returns null when the database is unreachable. */
  recover: (email: string) => Promise<RecoverResult | null>;
  /** lib/alerts.ts sendEmail. Returns whether Resend accepted it. */
  send: (msg: { to: string; subject: string; text: string; html: string }) => Promise<boolean>;
  /** Absolute origin for the access link. */
  origin: () => string;
  now?: () => number;
  log?: (...args: unknown[]) => void;
}

// Per-instance and therefore BEST EFFORT — serverless gives us no shared
// memory, so a determined caller spread across cold starts gets through. It
// is here because the realistic abuse is a hundred rapid posts of one real
// customer's address, and this stops that from becoming a hundred emails out
// of a 3,000/month Resend allowance. The durable version is a sent_at column
// on pro_passes, checked inside pro_recover the way 0029 checks
// confirm_sent_at; that is a migration and is not taken here.
const lastSent = new Map<string, number>();

/** Test seam: the throttle is module state and tests must not inherit it. */
export function __resetRecoverThrottleForTest(): void {
  lastSent.clear();
}

/** The flat answer. Exported so the test asserts against one constant rather
 *  than a literal it could drift from. */
export const RECOVER_OK_BODY = { ok: true } as const;

export async function handleRecover(raw: string, deps: RecoverDeps): Promise<Response> {
  const now = deps.now ?? Date.now;
  const log = deps.log ?? console.error;

  // Shape refusals are about the input, not about any address, so they are
  // allowed to differ: a caller learns only that they typed something that is
  // not an email address, which they already knew.
  if (!raw || raw.length > MAX_BODY) return Response.json({ ok: false }, { status: 400 });
  let email: string;
  try {
    const b = JSON.parse(raw) as { email?: unknown };
    email = typeof b.email === "string" ? b.email.trim() : "";
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return Response.json({ ok: false }, { status: 400 });
  }

  // Everything from here on returns the same response. The work is done
  // before returning rather than after, so the answer does not become a
  // timing oracle by being fast for unknown addresses and slow for known
  // ones — the RPC runs either way, and the mail is the only extra step.
  const key = email.toLowerCase();
  const t = now();
  const recent = lastSent.get(key);
  const throttled = recent !== undefined && t - recent < RESEND_FLOOR_MS;

  const found = await deps.recover(email);

  if (found?.status === "found" && found.access_token && !throttled) {
    if (lastSent.size >= THROTTLE_CAP) lastSent.clear();
    lastSent.set(key, t);

    const link = `${deps.origin()}/pro/access?t=${found.access_token}`;
    const until = found.expires_at
      ? new Date(found.expires_at).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : "";
    const ok = await deps.send({
      to: email,
      subject: "Your Voltcheck Pro access link",
      text:
        `Here is your access link again${until ? ` — your pass runs through ${until}` : ""}.\n\n` +
        `${link}\n\n` +
        `This link is your access, so keep the email. The pass does not renew ` +
        `and you will not be charged again.\n\n` +
        `If you did not ask for this, nothing has changed — you can ignore it.\n`,
      html:
        `<p>Here is your access link again${until ? ` — your pass runs through ${until}` : ""}.</p>` +
        `<p><a href="${link}">Open Voltcheck Pro</a></p>` +
        `<p style="color:#555">This link is your access — keep the email. The pass does not ` +
        `renew and you will not be charged again.</p>` +
        `<p style="color:#555">If you did not ask for this, nothing has changed.</p>`,
    });
    // Loud in the log, invisible in the response: telling the caller the send
    // failed would tell them the address has a pass.
    if (!ok) log("[pro] recover: pass found but link email failed");
  }

  return Response.json(RECOVER_OK_BODY);
}
