// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/pro-page.test.tsx
//
// /pro is the page a paying shopper lands on from their email, and the page
// that explains how to get back in when that email is gone. It is therefore
// the one route that must not fall over when the pass lookup does — a 500
// here strands exactly the person who has already paid.
//
// Rendering it here with no request context at all is the harshest version of
// that: next/headers' cookies() throws outside a request, which stands in for
// every way the lookup can fail (a sick database, a missing anon key, a
// cookie store that will not open). The page must come back with the
// logged-out view rather than an exception.
//
// The second pair of tests is the "never a broken button" rule, checked from
// both sides: nothing on sale must render no button at all, and the button
// must appear the moment there is genuinely something to sell.

import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import ProPage from "@/app/pro/page";
import { PRO_BENEFITS } from "@/lib/proOffer";

/** An async server component is an async function returning an element; its
 *  children here are all synchronous, so static markup is the whole page. */
async function render(searchParams: Record<string, string> = {}): Promise<string> {
  const el = await ProPage({ searchParams: Promise.resolve(searchParams) });
  return renderToStaticMarkup(el);
}

test("renders the logged-out page when the pass lookup cannot run at all", async () => {
  const html = await render();
  assert.match(html, /Pay for the push/);
  assert.match(html, /Free forever, for everyone|free forever/i);
  // No claim about a pass it could not look up.
  assert.doesNotMatch(html, /active\s*through/i);
});

test("a failed access link is explained rather than 404'd", async () => {
  assert.match(await render({ access: "expired" }), /pass behind it has run out/);
  assert.match(await render({ access: "invalid" }), /trim a long link/);
  // An unrecognised value falls through to the plain page rather than
  // inventing a state for it.
  const odd = await render({ access: "banana" });
  assert.doesNotMatch(odd, /run out|trim a long link/);
});

test("the recovery form is on the page in every one of those states", async () => {
  const states: Record<string, string>[] = [{}, { access: "expired" }, { access: "invalid" }];
  for (const sp of states) {
    assert.match(await render(sp), /Send my link/i);
  }
});

function withKey(value: string | undefined, fn: () => Promise<void>): Promise<void> {
  const had = Object.hasOwn(process.env, "STRIPE_SECRET_KEY");
  const prev = process.env.STRIPE_SECRET_KEY;
  if (value === undefined) delete process.env.STRIPE_SECRET_KEY;
  else process.env.STRIPE_SECRET_KEY = value;
  return fn().finally(() => {
    if (had) process.env.STRIPE_SECRET_KEY = prev;
    else delete process.env.STRIPE_SECRET_KEY;
  });
}

test("without a live-mode key, both passes are priced but neither can be bought", async () => {
  // No key at all, and — the case production sat in from 2026-08-27 — a
  // test-mode key. Both must read as "opens soon": a button in front of a
  // sk_test_ checkout rejects every real card.
  for (const key of [undefined, "sk_test_configured"]) {
    await withKey(key, async () => {
      const html = await render();
      assert.match(html, /\$2\.99/);
      assert.match(html, /\$9/);
      assert.match(html, /Purchasing opens soon/i);
      assert.match(html, /Opens soon/);
      // Not "no <button> anywhere" — the recovery form has one, and it works.
      // The thing that must not exist is a way to start paying.
      assert.doesNotMatch(html, /Get the [0-9]/, `no purchase button may render with key=${key}`);
    });
  }
});

test("the button appears exactly when there is something to sell and a live key to charge with", async () => {
  await withKey("sk_live_configured", async () => {
    const open = await render();
    assert.match(open, /Get the 7-day pass/);
    assert.match(open, /Get the 90-day pass/);
    assert.doesNotMatch(open, /Purchasing opens soon/i);
    // Every unbuilt benefit keeps its "coming" mark; every built one loses it.
    const coming = PRO_BENEFITS.filter((b) => !b.live).length;
    assert.equal((open.match(/Coming</g) ?? []).length, coming);
    assert.equal((open.match(/Live</g) ?? []).length, PRO_BENEFITS.length - coming);
  });
});

test("the lineup is the owner's (2026-08-26, 2026-09-02): cadence and screener live, tracking coming, no alert-count tier", () => {
  const titles = PRO_BENEFITS.map((b) => b.title.toLowerCase());
  // "Unlimited alerts" was cut: free alerts are already effectively unlimited
  // and shrinking them to sell the difference is the retraction §1 forbids.
  assert.equal(titles.some((t) => t.includes("unlimited")), false);
  assert.equal(PRO_BENEFITS.find((b) => b.title === "Valuation tracking")?.live, false);
  assert.equal(PRO_BENEFITS.filter((b) => b.live).length, 3);
});
