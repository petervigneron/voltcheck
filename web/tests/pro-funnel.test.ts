// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/pro-funnel.test.ts
//
// Two properties of the paid funnel that are invisible when they break.
//
// 1. The recovery form must not be an oracle. It takes an email address and
//    answers; if that answer varies at all with whether the address bought a
//    pass, anyone with a list of addresses can find out which of them are
//    Voltcheck customers. The failure is silent — the form still works — so
//    the only way to hold the line is to assert the responses are identical
//    BYTES across every outcome, including the ones nobody thinks about (the
//    database down, the secret rejected, the mail refused by Resend).
//
// 2. The page must never show a purchase button that cannot honestly take
//    money. Two independent reasons it can't: no processor configured, and —
//    the one that outlives an env var — nothing built yet that a buyer would
//    receive. lib/proOffer.ts settles that, and it settles it for the
//    endpoint too, so the button and /api/checkout cannot drift apart.

import test from "node:test";
import assert from "node:assert/strict";
import {
  handleRecover,
  __resetRecoverThrottleForTest,
  type RecoverDeps,
  type RecoverResult,
} from "@/lib/proRecover";
import { PRO_BENEFITS, offerState, checkoutConfigured, type ProBenefit } from "@/lib/proOffer";
import { POST as checkoutPOST } from "@/app/api/checkout/route";

// ── 1. Recovery is not an enumeration oracle ────────────────────────────

const TOKEN = "11111111-2222-3333-4444-555555555555";

interface Sent {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Deps that record what happened without doing any of it. */
function deps(
  answer: RecoverResult | null,
  opts: { sendOk?: boolean } = {},
): RecoverDeps & { sent: Sent[]; logged: unknown[][] } {
  const sent: Sent[] = [];
  const logged: unknown[][] = [];
  return {
    sent,
    logged,
    recover: async () => answer,
    send: async (m) => {
      sent.push(m);
      return opts.sendOk ?? true;
    },
    origin: () => "https://voltcheck.net",
    log: (...a: unknown[]) => logged.push(a),
  };
}

const body = (raw: string) => JSON.stringify({ email: raw });

/** status + exact body text, which is what a caller can actually observe. */
async function observable(res: Response): Promise<string> {
  return `${res.status} ${await res.text()}`;
}

// The four outcomes the RPC can produce, plus a mailer that refuses. Every
// one of them is a different world on the server and must be the same answer
// on the wire.
const OUTCOMES: [string, RecoverResult | null, { sendOk?: boolean }][] = [
  ["a live pass exists", { status: "found", access_token: TOKEN, expires_at: "2026-11-23T00:00:00Z" }, {}],
  ["no pass for that address", { status: "none" }, {}],
  ["the grant secret was rejected", { status: "denied" }, {}],
  ["the database did not answer", null, {}],
  ["a pass exists but Resend refused the mail", { status: "found", access_token: TOKEN }, { sendOk: false }],
];

test("every recovery outcome returns the same bytes", async () => {
  const seen = new Set<string>();
  for (const [, answer, opts] of OUTCOMES) {
    __resetRecoverThrottleForTest();
    const res = await handleRecover(body("someone@example.com"), deps(answer, opts));
    seen.add(await observable(res));
  }
  assert.equal(
    seen.size,
    1,
    `recovery answered ${seen.size} different ways: ${[...seen].join(" | ")}`,
  );
  assert.equal([...seen][0], '200 {"ok":true}');
});

test("the access token never reaches the response", async () => {
  __resetRecoverThrottleForTest();
  const d = deps({ status: "found", access_token: TOKEN, expires_at: "2026-11-23T00:00:00Z" });
  const text = await (await handleRecover(body("someone@example.com"), d)).text();
  assert.equal(text.includes(TOKEN), false);
  // Control: the token IS in the email, so the assertion above is testing
  // where it went rather than that it was never minted.
  assert.equal(d.sent.length, 1);
  assert.equal(d.sent[0].text.includes(`/pro/access?t=${TOKEN}`), true);
});

test("the link goes only to the address that was typed", async () => {
  __resetRecoverThrottleForTest();
  const d = deps({ status: "found", access_token: TOKEN });
  await handleRecover(body("Someone@Example.com"), d);
  assert.equal(d.sent.length, 1);
  assert.equal(d.sent[0].to, "Someone@Example.com");
});

test("no mail goes out when there is no live pass", async () => {
  for (const answer of [{ status: "none" }, { status: "denied" }, null] as (RecoverResult | null)[]) {
    __resetRecoverThrottleForTest();
    const d = deps(answer);
    await handleRecover(body("someone@example.com"), d);
    assert.equal(d.sent.length, 0);
  }
});

test("a repeat within the floor sends once but answers the same", async () => {
  __resetRecoverThrottleForTest();
  const d = deps({ status: "found", access_token: TOKEN });
  const first = await observable(await handleRecover(body("someone@example.com"), d));
  const second = await observable(await handleRecover(body("someone@example.com"), d));
  assert.equal(d.sent.length, 1, "the second post should not mail again");
  assert.equal(second, first, "…and must not say so");
});

test("the throttle keys on the address case-insensitively, and lets go later", async () => {
  __resetRecoverThrottleForTest();
  let clock = 1_000_000;
  const d = { ...deps({ status: "found", access_token: TOKEN }), now: () => clock };
  await handleRecover(body("someone@example.com"), d);
  await handleRecover(body("SOMEONE@EXAMPLE.COM"), d);
  assert.equal(d.sent.length, 1, "same mailbox, different capitals");
  clock += 11 * 60_000;
  await handleRecover(body("someone@example.com"), d);
  assert.equal(d.sent.length, 2, "past the floor it should send again");
});

test("a different address is not throttled by the first one's send", async () => {
  __resetRecoverThrottleForTest();
  const d = deps({ status: "found", access_token: TOKEN });
  await handleRecover(body("one@example.com"), d);
  await handleRecover(body("two@example.com"), d);
  assert.equal(d.sent.length, 2);
});

test("a malformed request is refused without ever asking about an address", async () => {
  for (const raw of ["", "not json", body("nope"), body("no@at"), JSON.stringify({}), JSON.stringify({ email: 12 })]) {
    __resetRecoverThrottleForTest();
    let asked = 0;
    const d = deps({ status: "found", access_token: TOKEN });
    const res = await handleRecover(raw, {
      ...d,
      recover: async () => {
        asked++;
        return { status: "found", access_token: TOKEN };
      },
    });
    assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(raw)}`);
    assert.equal(asked, 0, "a bad shape must not reach the database");
  }
});

test("an oversized body is refused before it is parsed", async () => {
  __resetRecoverThrottleForTest();
  const res = await handleRecover(body("a".repeat(600) + "@example.com"), deps(null));
  assert.equal(res.status, 400);
});

// ── 2. No button that cannot honestly take money ────────────────────────

const live = (n: number): ProBenefit[] =>
  [0, 1].map((i) => ({ title: `b${i}`, detail: "", live: i < n }));

function withEnv(key: string, value: string | undefined, fn: () => void): void {
  const had = Object.hasOwn(process.env, key);
  const prev = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
  try {
    fn();
  } finally {
    if (had) process.env[key] = prev;
    else delete process.env[key];
  }
}

test("nothing live means nothing to sell, whatever Stripe is doing", () => {
  withEnv("STRIPE_SECRET_KEY", "sk_test_configured", () => {
    assert.equal(offerState(live(0)), "nothing-to-sell");
  });
  withEnv("STRIPE_SECRET_KEY", undefined, () => {
    assert.equal(offerState(live(0)), "nothing-to-sell");
  });
});

test("something live but no processor is 'no-processor', not 'open'", () => {
  withEnv("STRIPE_SECRET_KEY", undefined, () => {
    assert.equal(checkoutConfigured(), false);
    assert.equal(offerState(live(1)), "no-processor");
  });
});

test("something live plus a configured processor is the only way to 'open'", () => {
  withEnv("STRIPE_SECRET_KEY", "sk_test_configured", () => {
    assert.equal(checkoutConfigured(), true);
    assert.equal(offerState(live(1)), "open");
  });
});

// A tripwire, not a preference. It is expected to be changed by the same
// commit that ships the first Pro feature — and if it ever fails without one
// having shipped, /pro is offering to sell something that does not exist.
test("as shipped today, /pro will not offer to sell anything", () => {
  assert.equal(
    PRO_BENEFITS.some((b) => b.live),
    false,
    "a benefit is marked live — is it really, and does /pro now sell passes?",
  );
  assert.equal(offerState(), "nothing-to-sell");
});

test("/api/checkout refuses in exactly the case the page hides the button", async () => {
  const had = Object.hasOwn(process.env, "STRIPE_SECRET_KEY");
  const prev = process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_SECRET_KEY;
  try {
    const res = await checkoutPOST(
      new Request("https://voltcheck.net/api/checkout", {
        method: "POST",
        body: JSON.stringify({ tier: "quarter" }),
      }),
    );
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { ok: false, reason: "disabled" });
  } finally {
    if (had) process.env.STRIPE_SECRET_KEY = prev;
  }
});
