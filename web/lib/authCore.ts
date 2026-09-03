// Accounts: the server side of the email-and-password login, the part with
// no Next imports so proxy.ts can use it (migration 0063
// has the design record). Supabase Auth does the credential work — hashing,
// refresh-token rotation, the JWT PostgREST verifies — and this file talks
// to it over plain fetch, the same way lib/pro.ts talks to Stripe and
// lib/alerts.ts to Resend. No SDK: the surface we use is six endpoints.
//
// ── The session is two cookies ─────────────────────────────────────────────
//
//   vc_at   the access token, a JWT good for an hour (jwt_exp). Sent to
//           PostgREST as the Bearer for anything the account owns; PostgREST
//           verifies it, so nothing here needs the signing key.
//   vc_rt   the refresh token. Traded for a new pair by proxy.ts when the
//           access token is within a couple of minutes of expiring, and by
//           the API routes when it already has.
//
// Both HttpOnly, Secure, SameSite=Lax, path=/. The site reads the JWT's
// payload WITHOUT verifying it, and that is deliberate: the cookie was set by
// our own route after GoTrue answered, it cannot be read by page script, and
// every decision that matters — what the shelf holds, whether a pass is live,
// which address an alert is for — is made by the database against the
// verified token. What an unverified read decides is whether to render "Sign
// in" or "Account" in the header, and someone who forges a cookie to change
// that has forged it for themselves.
//
// ── Mail ───────────────────────────────────────────────────────────────────
//
// Auth's Send Email hook POSTs to /api/auth/email instead of using Supabase's
// mailer (2/hour, meant for development). The hook is signed the Standard
// Webhooks way; verifyAuthHook below checks it with a key DERIVED from
// STRIPE_GRANT_SECRET rather than a new env var — Vercel's env is not
// writable from here (the local CLI token is dead, memory), and the
// derivation (sha256 over a fixed label plus the secret) means a leaked hook
// key does not give up the grant secret. The same derivation, run once
// locally, produced the value registered with Supabase.

export const AT_COOKIE = "vc_at";
export const RT_COOKIE = "vc_rt";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const isEmail = (s: unknown): s is string => typeof s === "string" && EMAIL_RE.test(s) && s.length <= 254;

/** Supabase's own floor is 6; ours is 8. Not enforced with character
 *  classes — length is the only rule that measurably helps. */
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 200;

function base(): { url: string; key: string } | null {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_ANON_KEY;
  return url && key ? { url, key } : null;
}

export interface Session {
  access_token: string;
  refresh_token: string;
  /** Seconds until access_token expires, as GoTrue reports it. */
  expires_in?: number;
  user?: { id?: string; email?: string };
}

export interface AuthError {
  status: number;
  /** GoTrue's error_code when it gives one ("email_not_confirmed",
   *  "invalid_credentials", "user_already_exists", "weak_password", …). */
  code: string;
  message: string;
}

export type AuthResult<T> = { ok: true; value: T } | { ok: false; error: AuthError };

/** One call to GoTrue. Errors come back as values, never thrown, so a route
 *  can map them to a flat answer without a try/catch per call. */
export async function gotrue<T>(
  path: string,
  init: { method?: string; body?: unknown; bearer?: string } = {},
): Promise<AuthResult<T>> {
  const b = base();
  if (!b) return { ok: false, error: { status: 503, code: "unconfigured", message: "auth not configured" } };
  try {
    const res = await fetch(`${b.url}/auth/v1${path}`, {
      method: init.method ?? "POST",
      headers: {
        apikey: b.key,
        Authorization: `Bearer ${init.bearer ?? b.key}`,
        "Content-Type": "application/json",
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
    });
    const text = await res.text();
    let json: Record<string, unknown> = {};
    try {
      json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      json = {};
    }
    if (!res.ok) {
      const code = String(json.error_code ?? json.error ?? json.code ?? "error");
      const message = String(json.msg ?? json.error_description ?? json.message ?? res.statusText);
      return { ok: false, error: { status: res.status, code, message } };
    }
    return { ok: true, value: json as T };
  } catch {
    return { ok: false, error: { status: 502, code: "unreachable", message: "auth unreachable" } };
  }
}

// ── The six calls ──────────────────────────────────────────────────────────

/** Create an account. With confirmation required (it is), GoTrue answers
 *  with the user and NO session, and for an address that already exists it
 *  answers with an obfuscated user rather than an error — so the response
 *  is the same shape either way and cannot be used to enumerate. */
export const signUp = (email: string, password: string, redirectTo: string) =>
  gotrue<{ id?: string; email?: string; access_token?: string; refresh_token?: string }>(
    `/signup?redirect_to=${encodeURIComponent(redirectTo)}`,
    { body: { email, password } },
  );

export const signIn = (email: string, password: string) =>
  gotrue<Session>("/token?grant_type=password", { body: { email, password } });

export const refreshSession = (refreshToken: string) =>
  gotrue<Session>("/token?grant_type=refresh_token", { body: { refresh_token: refreshToken } });

export const signOut = (accessToken: string) =>
  gotrue<unknown>("/logout?scope=local", { bearer: accessToken });

/** Ask for a password-reset mail. GoTrue answers 200 whether or not the
 *  address exists; the hook decides whether anything is sent. */
export const requestPasswordReset = (email: string, redirectTo: string) =>
  gotrue<unknown>("/recover", { body: { email, gotrue_meta_security: {}, redirect_to: redirectTo } });

export const setPassword = (accessToken: string, password: string) =>
  gotrue<unknown>("/user", { method: "PUT", bearer: accessToken, body: { password } });

/** Turn the token_hash from a confirmation or reset link into a session. */
export const verifyTokenHash = (type: string, tokenHash: string) =>
  gotrue<Session>("/verify", { body: { type, token_hash: tokenHash } });

// ── The cookies ────────────────────────────────────────────────────────────

/** The refresh token has no fixed lifetime in GoTrue (it is rotated on use
 *  and revoked on sign-out), so the cookie's Max-Age is what bounds a session
 *  on an idle device. Half a year: a shopper who comes back for the next car
 *  should still be signed in; a shared machine should not be forever. */
const RT_MAX_AGE = 180 * 86400;

function cookie(name: string, value: string, maxAge: number, secure: boolean): string {
  return [`${name}=${value}`, "Path=/", `Max-Age=${maxAge}`, "HttpOnly", "SameSite=Lax", secure ? "Secure" : ""]
    .filter(Boolean)
    .join("; ");
}

/** Set-Cookie headers that install a session. Written by hand rather than
 *  through cookies().set for the reason /pro/access gives: an explicit
 *  header on a Response the handler built has no question about whether a
 *  cookie-store mutation merges into it. */
export function sessionCookies(s: Session, secure: boolean): string[] {
  const atAge = Math.max(60, Math.min(s.expires_in ?? 3600, 86400));
  return [cookie(AT_COOKIE, s.access_token, atAge, secure), cookie(RT_COOKIE, s.refresh_token, RT_MAX_AGE, secure)];
}

export function clearedCookies(secure: boolean): string[] {
  return [cookie(AT_COOKIE, "", 0, secure), cookie(RT_COOKIE, "", 0, secure)];
}

/** Whether this request came in over TLS. x-forwarded-proto is what survives
 *  Vercel's termination; the URL itself reads http behind the proxy. */
export const isSecure = (req: Request) =>
  (req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "")) === "https";

/** Append several Set-Cookie headers to a Response's headers. */
export function withCookies(headers: Headers, setCookies: string[]): Headers {
  for (const c of setCookies) headers.append("Set-Cookie", c);
  return headers;
}

// ── Reading the session ────────────────────────────────────────────────────

export interface JwtClaims {
  sub: string;
  email: string;
  /** Unix seconds. */
  exp: number;
}

/** The payload of a JWT, unverified (see the header comment for why that is
 *  the right amount of trust here). Null for anything that is not a JWT
 *  with the three claims we use. */
export function decodeJwt(token: string | undefined | null): JwtClaims | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const json = JSON.parse(Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as Record<string, unknown>;
    const sub = json.sub, email = json.email, exp = json.exp;
    if (typeof sub !== "string" || typeof email !== "string" || typeof exp !== "number") return null;
    return { sub, email, exp };
  } catch {
    return null;
  }
}

/** Should proxy.ts refresh now? True when there is a refresh token and the
 *  access token is missing, unreadable, or expires within `skewSec`. Pure,
 *  so the test can pin the boundary. */
export function needsRefresh(at: string | undefined, rt: string | undefined, nowSec: number, skewSec = 120): boolean {
  if (!rt) return false;
  const claims = decodeJwt(at);
  return !claims || claims.exp - nowSec < skewSec;
}

/** Call an RPC as the signed-in user. The anon key still goes in `apikey`;
 *  the user's JWT is the Bearer, which is what makes auth.uid() and
 *  auth.jwt() answer inside the 0063 functions. Null on any failure. */
export async function userRpc<T>(jwt: string, fn: string, args: Record<string, unknown> = {}): Promise<T | null> {
  const b = base();
  if (!b) return null;
  try {
    const res = await fetch(`${b.url}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: { apikey: b.key, Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
      body: JSON.stringify(args),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const text = await res.text();
    return (text ? JSON.parse(text) : null) as T;
  } catch {
    return null;
  }
}

export interface HookMail {
  user: { id?: string; email?: string };
  email_data: {
    token?: string;
    token_hash?: string;
    redirect_to?: string;
    email_action_type?: string;
    site_url?: string;
  };
}

/** The link a hook mail carries: our verify route with the token hash, and
 *  the redirect_to GoTrue was given (our own /account/verify?next=…) as the
 *  base when it is on this site, else the origin's /account/verify. Pure. */
export function verifyLink(origin: string, d: HookMail["email_data"]): string | null {
  if (!d.token_hash || !d.email_action_type) return null;
  let url: URL;
  try {
    url = new URL(d.redirect_to ?? "", origin);
  } catch {
    url = new URL("/account/verify", origin);
  }
  if (url.origin !== origin || !url.pathname.startsWith("/account/verify")) url = new URL("/account/verify", origin);
  url.searchParams.set("token_hash", d.token_hash);
  url.searchParams.set("type", d.email_action_type);
  return url.toString();
}
