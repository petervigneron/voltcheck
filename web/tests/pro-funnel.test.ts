// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/pro-funnel.test.ts
//
// The paid funnel's one property that is invisible when it breaks: the page
// must never show a purchase button that cannot honestly take money. Two
// independent reasons it can't: no processor configured, and — the one that
// outlives an env var — nothing built yet that a buyer would receive.
// lib/proOffer.ts settles that, and it settles it for the endpoint too, so
// the button and /api/checkout cannot drift apart.
//
// (Until 2026-09-03 this file also pinned the "send my link again" form as
// a non-oracle. That form left with the account login — 0063 — and the
// forgot-password route inherits the same flat-answer rule; see
// tests/auth-core.test.ts.)

import test from "node:test";
import assert from "node:assert/strict";
import { PRO_BENEFITS, offerState, checkoutConfigured, type ProBenefit } from "@/lib/proOffer";
import { POST as checkoutPOST } from "@/app/api/checkout/route";

// ── 2. No button that cannot honestly take money ────────────────────────

const live = (n: number): ProBenefit[] =>
  ([0, 1] as const).map((i) => ({
    id: (["market-trends", "deals-filter"] as const)[i],
    title: `b${i}`,
    detail: "",
    live: i < n,
  }));

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

test("a test-mode key is 'no-processor': it cannot take a real card", () => {
  // Production held sk_test_ keys from 2026-08-27. The day a benefit went
  // live, this is what kept the page from showing a button whose checkout
  // fails every real shopper.
  withEnv("STRIPE_ALLOW_TEST_CHECKOUT", undefined, () => {
    withEnv("STRIPE_SECRET_KEY", "sk_test_configured", () => {
      assert.equal(checkoutConfigured(), false);
      assert.equal(offerState(live(1)), "no-processor");
    });
    // …unless a local/preview run says so explicitly, which is how the funnel
    // is exercised end to end with Stripe's test cards.
    withEnv("STRIPE_ALLOW_TEST_CHECKOUT", "1", () => {
      withEnv("STRIPE_SECRET_KEY", "sk_test_configured", () => {
        assert.equal(offerState(live(1)), "open");
      });
    });
  });
});

test("something live plus a LIVE key is the only way to 'open'", () => {
  for (const key of ["sk_live_configured", "rk_live_restricted"]) {
    withEnv("STRIPE_SECRET_KEY", key, () => {
      assert.equal(checkoutConfigured(), true, key);
      assert.equal(offerState(live(1)), "open", key);
    });
  }
});

// The tripwire that used to sit here ("as shipped today, /pro will not offer
// to sell anything") was retired by the commit that shipped the first three
// benefits (2026-09-02). Its successor: the page must not offer to sell on a
// key that cannot charge, however many benefits are live.
test("as shipped today, /pro sells only on a live-mode key", () => {
  assert.equal(PRO_BENEFITS.some((b) => b.live), true, "the built benefits must be marked live");
  withEnv("STRIPE_ALLOW_TEST_CHECKOUT", undefined, () => {
    withEnv("STRIPE_SECRET_KEY", "sk_test_configured", () => assert.equal(offerState(), "no-processor"));
    withEnv("STRIPE_SECRET_KEY", undefined, () => assert.equal(offerState(), "no-processor"));
    withEnv("STRIPE_SECRET_KEY", "sk_live_configured", () => assert.equal(offerState(), "open"));
  });
});

test("/api/checkout refuses in exactly the cases the page hides the button", async () => {
  const post = () =>
    checkoutPOST(
      new Request("https://voltcheck.net/api/checkout", {
        method: "POST",
        body: JSON.stringify({ tier: "quarter" }),
      }),
    );
  const hadAllow = Object.hasOwn(process.env, "STRIPE_ALLOW_TEST_CHECKOUT");
  const prevAllow = process.env.STRIPE_ALLOW_TEST_CHECKOUT;
  delete process.env.STRIPE_ALLOW_TEST_CHECKOUT;
  const had = Object.hasOwn(process.env, "STRIPE_SECRET_KEY");
  const prev = process.env.STRIPE_SECRET_KEY;
  try {
    for (const key of [undefined, "sk_test_configured"]) {
      if (key === undefined) delete process.env.STRIPE_SECRET_KEY;
      else process.env.STRIPE_SECRET_KEY = key;
      const res = await post();
      assert.equal(res.status, 503, `key=${key}`);
      assert.deepEqual(await res.json(), { ok: false, reason: "disabled" });
    }
    // Open for business but nobody signed in (this test has no request
    // context, so currentUser() is null): the endpoint asks for sign-in
    // rather than minting a session for an address it does not know.
    process.env.STRIPE_SECRET_KEY = "sk_live_configured";
    const res = await post();
    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), { ok: false, reason: "signin" });
  } finally {
    if (had) process.env.STRIPE_SECRET_KEY = prev;
    else delete process.env.STRIPE_SECRET_KEY;
    if (hadAllow) process.env.STRIPE_ALLOW_TEST_CHECKOUT = prevAllow;
  }
});
