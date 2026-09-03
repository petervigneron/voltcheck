// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/auth-core.test.ts
//
// The pure parts of the login (lib/authCore.ts, lib/apiBody.ts): the JWT
// reader the header and the proxy decide on, the refresh boundary, the
// cookies a session becomes, the link an account mail carries, and the
// `next` path a sign-in returns to. Each is a place where a wrong answer is
// quiet — a session that silently never refreshes, a link that bounces a
// shopper off the site — so each boundary is pinned here.

import test from "node:test";
import assert from "node:assert/strict";
import { decodeJwt, needsRefresh, sessionCookies, clearedCookies, verifyLink, isEmail } from "@/lib/authCore";
import { safeNext } from "@/lib/apiBody";

const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (claims: Record<string, unknown>) => `${b64url({ alg: "ES256", typ: "JWT" })}.${b64url(claims)}.sig`;

test("decodeJwt reads sub, email and exp and refuses anything else", () => {
  const t = jwt({ sub: "u1", email: "a@b.co", exp: 1_800_000_000, role: "authenticated" });
  assert.deepEqual(decodeJwt(t), { sub: "u1", email: "a@b.co", exp: 1_800_000_000 });
  assert.equal(decodeJwt(undefined), null);
  assert.equal(decodeJwt(""), null);
  assert.equal(decodeJwt("not.a.jwt.at.all"), null);
  assert.equal(decodeJwt(jwt({ sub: "u1", exp: 1 })), null, "no email");
  assert.equal(decodeJwt(jwt({ sub: "u1", email: "a@b.co", exp: "soon" })), null, "exp not a number");
  assert.equal(decodeJwt("a.%%%.c"), null, "payload not base64 JSON");
});

test("needsRefresh: only with a refresh token, and only near or past expiry", () => {
  const now = 1_700_000_000;
  const fresh = jwt({ sub: "u", email: "a@b.co", exp: now + 3000 });
  const soon = jwt({ sub: "u", email: "a@b.co", exp: now + 60 });
  const gone = jwt({ sub: "u", email: "a@b.co", exp: now - 1 });
  assert.equal(needsRefresh(fresh, "rt", now), false);
  assert.equal(needsRefresh(soon, "rt", now), true, "inside the 120s skew");
  assert.equal(needsRefresh(gone, "rt", now), true);
  assert.equal(needsRefresh(undefined, "rt", now), true, "no access token at all");
  assert.equal(needsRefresh("garbage", "rt", now), true, "unreadable access token");
  // Nothing to refresh with: never, whatever the access token says.
  assert.equal(needsRefresh(gone, undefined, now), false);
  assert.equal(needsRefresh(undefined, undefined, now), false);
});

test("a session becomes two HttpOnly cookies; clearing zeroes both", () => {
  const set = sessionCookies({ access_token: "AT", refresh_token: "RT", expires_in: 3600 }, true);
  assert.equal(set.length, 2);
  assert.match(set[0], /^vc_at=AT; Path=\/; Max-Age=3600; HttpOnly; SameSite=Lax; Secure$/);
  assert.match(set[1], /^vc_rt=RT; Path=\/; Max-Age=\d+; HttpOnly; SameSite=Lax; Secure$/);
  // Plain http (local dev) drops Secure and nothing else.
  assert.doesNotMatch(sessionCookies({ access_token: "a", refresh_token: "b" }, false)[0], /Secure/);
  const cleared = clearedCookies(true);
  assert.match(cleared[0], /^vc_at=; Path=\/; Max-Age=0; HttpOnly/);
  assert.match(cleared[1], /^vc_rt=; Path=\/; Max-Age=0; HttpOnly/);
  // A silly expires_in is clamped rather than trusted.
  assert.match(sessionCookies({ access_token: "a", refresh_token: "b", expires_in: 1 }, true)[0], /Max-Age=60;/);
  assert.match(sessionCookies({ access_token: "a", refresh_token: "b", expires_in: 10 ** 9 }, true)[0], /Max-Age=86400;/);
});

test("verifyLink lands on this site's /account/verify whatever redirect_to said", () => {
  const origin = "https://voltcheck.net";
  const ours = verifyLink(origin, {
    token_hash: "abc123",
    email_action_type: "signup",
    redirect_to: "https://voltcheck.net/account/verify?next=%2Fpro",
  });
  assert.equal(ours, "https://voltcheck.net/account/verify?next=%2Fpro&token_hash=abc123&type=signup");
  // Another origin, or another path on ours, is not followed.
  for (const redirect_to of ["https://evil.example/account/verify", "https://voltcheck.net/pro", "not a url", undefined]) {
    const link = verifyLink(origin, { token_hash: "abc123", email_action_type: "recovery", redirect_to });
    assert.equal(link, "https://voltcheck.net/account/verify?token_hash=abc123&type=recovery", String(redirect_to));
  }
  // Without a token hash there is no link — and so no mail.
  assert.equal(verifyLink(origin, { email_action_type: "signup" }), null);
  assert.equal(verifyLink(origin, { token_hash: "x" }), null);
});

test("safeNext keeps a shopper on the site", () => {
  assert.equal(safeNext("/pro"), "/pro");
  assert.equal(safeNext("/saved?tab=cars"), "/saved?tab=cars");
  assert.equal(safeNext("https://evil.example/"), "/account");
  assert.equal(safeNext("//evil.example/"), "/account");
  assert.equal(safeNext("/\\evil.example"), "/account");
  assert.equal(safeNext(undefined, "/saved"), "/saved");
  assert.equal(safeNext(42), "/account");
});

test("isEmail is the same shape the database checks", () => {
  assert.equal(isEmail("a@b.co"), true);
  assert.equal(isEmail("a@b"), false);
  assert.equal(isEmail("a b@c.co"), false);
  assert.equal(isEmail("a@b.co".padEnd(260, "x")), false);
});
