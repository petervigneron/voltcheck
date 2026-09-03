// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/auth-hook.test.ts
//
// /api/auth/email is a route that sends mail to whoever the body names, so
// its signature check is the whole reason it is not an open relay. This
// pins the Standard Webhooks scheme the way Supabase applies it (HMAC-SHA256
// over `${id}.${timestamp}.${body}`, base64, "v1,<sig>" — several allowed),
// the replay bound, and that the key registered with Supabase is the one
// derived from the grant secret the route will hold.

import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { hookKey, hookSecretForSupabase, verifyAuthHook } from "@/lib/authHook";

const SECRET = "grant-secret-for-the-test";
const NOW = 1_700_000_000;

function sign(body: string, id: string, ts: number, key = hookKey(SECRET)!): string {
  return "v1," + createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64");
}

test("a correctly signed, timely delivery verifies", () => {
  const body = JSON.stringify({ user: { email: "a@b.co" }, email_data: { token_hash: "h", email_action_type: "signup" } });
  const sig = sign(body, "msg_1", NOW);
  assert.equal(verifyAuthHook(body, { id: "msg_1", timestamp: String(NOW), signature: sig }, hookKey(SECRET), NOW), true);
  // Several signatures in the header (Supabase sends one; the spec allows a rotation set).
  assert.equal(verifyAuthHook(body, { id: "msg_1", timestamp: String(NOW), signature: `v1,bogus ${sig}` }, hookKey(SECRET), NOW), true);
});

test("the wrong key, a tampered body, a stale timestamp, or a missing header all refuse", () => {
  const body = '{"a":1}';
  const sig = sign(body, "id", NOW);
  const h = { id: "id", timestamp: String(NOW), signature: sig };
  assert.equal(verifyAuthHook(body, h, hookKey("other-secret"), NOW), false, "wrong key");
  assert.equal(verifyAuthHook('{"a":2}', h, hookKey(SECRET), NOW), false, "tampered body");
  assert.equal(verifyAuthHook(body, { ...h, id: "id2" }, hookKey(SECRET), NOW), false, "id not the signed one");
  assert.equal(verifyAuthHook(body, h, hookKey(SECRET), NOW + 301), false, "older than the 300s bound");
  assert.equal(verifyAuthHook(body, h, hookKey(SECRET), NOW - 301), false, "from the future");
  assert.equal(verifyAuthHook(body, h, hookKey(SECRET), NOW + 299), true, "inside the bound");
  assert.equal(verifyAuthHook(body, { ...h, signature: null }, hookKey(SECRET), NOW), false);
  assert.equal(verifyAuthHook(body, { ...h, timestamp: null }, hookKey(SECRET), NOW), false);
  assert.equal(verifyAuthHook(body, { ...h, id: null }, hookKey(SECRET), NOW), false);
  assert.equal(verifyAuthHook(body, h, null, NOW), false, "no grant secret configured");
  assert.equal(verifyAuthHook(body, { ...h, signature: "v2," + sig.slice(3) }, hookKey(SECRET), NOW), false, "unknown version");
});

test("the value registered with Supabase decodes to the key the route derives", () => {
  const registered = hookSecretForSupabase(SECRET);
  assert.match(registered, /^v1,whsec_[A-Za-z0-9+/]+=*$/);
  const key = Buffer.from(registered.slice("v1,whsec_".length), "base64");
  assert.equal(key.equals(hookKey(SECRET)!), true);
  // Supabase signs with exactly those bytes; the route must accept it.
  const body = "{}";
  const sig = "v1," + createHmac("sha256", key).update(`x.${NOW}.${body}`).digest("base64");
  assert.equal(verifyAuthHook(body, { id: "x", timestamp: String(NOW), signature: sig }, hookKey(SECRET), NOW), true);
  // And the key is not the grant secret itself: a leaked hook key gives up nothing else.
  assert.equal(hookKey(SECRET)!.equals(Buffer.from(SECRET)), false);
  assert.equal(hookKey(undefined), null);
});
