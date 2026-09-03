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
  assert.match(html, /Pro member benefits/);
  // The free-forever list left the page 2026-09-03; it must not creep back.
  assert.doesNotMatch(html, /free forever/i);
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

test("a visitor who is not signed in is pointed at sign-in from every state", async () => {
  // The way back in on another device is the account (0063); the old
  // "send my link again" form is gone and must not come back.
  const states: Record<string, string>[] = [{}, { access: "expired" }, { access: "invalid" }];
  for (const sp of states) {
    const html = await render(sp);
    assert.doesNotMatch(html, /Send my link/i);
  }
  assert.match(await render({ access: "invalid" }), /href="\/account\?next=%2Fpro"/);
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
      assert.match(html, /\$3</);
      assert.match(html, /\$9</);
      assert.match(html, /Purchasing opens soon/i);
      assert.match(html, /Opens soon/);
      // Not "no <button> anywhere" — the recovery form has one, and it works.
      // The thing that must not exist is a way to start paying.
      assert.doesNotMatch(html, /Get the [0-9]/, `no purchase button may render with key=${key}`);
    });
  }
});

test("with a live key, a visitor who is not signed in is offered sign-in, not a button", async () => {
  // Buying needs an account (0063: the pass is granted to the account's
  // address). This render has no request context, so nobody is signed in,
  // and the tier cell must carry a sign-in link rather than a checkout
  // button — a button here would 401 at /api/checkout.
  await withKey("sk_live_configured", async () => {
    const open = await render();
    assert.match(open, /Sign in to get the 7-day pass/);
    assert.match(open, /Sign in to get the 60-day pass/);
    assert.doesNotMatch(open, /Get the [0-9]/);
    assert.doesNotMatch(open, /Purchasing opens soon/i);
    // No live/coming chips on the page (owner, 2026-09-03); every benefit
    // is listed regardless of its state.
    assert.doesNotMatch(open, /Coming<|Live</);
    for (const b of PRO_BENEFITS) assert.match(open, new RegExp(b.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });
});

test("the lineup is the owner's (2026-09-03): four lines, deals filter and deal alert live, trends and rebates not yet", () => {
  const titles = PRO_BENEFITS.map((b) => b.title);
  assert.deepEqual(titles, ["Market trends", "Filter by deals", "Rebate eligibility", "Deal alert"]);
  // "Unlimited alerts" stays cut (2026-08-26): free price-drop alerts are
  // effectively unlimited and shrinking them would be a retraction.
  assert.equal(titles.some((t) => t.toLowerCase().includes("unlimited")), false);
  assert.equal(PRO_BENEFITS.find((b) => b.title === "Filter by deals")?.live, true);
  assert.equal(PRO_BENEFITS.find((b) => b.title === "Deal alert")?.live, true);
  assert.equal(PRO_BENEFITS.find((b) => b.title === "Market trends")?.live, true);
  assert.equal(PRO_BENEFITS.find((b) => b.title === "Rebate eligibility")?.live, false);
  // The page prints the same threshold the filter applies.
  assert.match(PRO_BENEFITS.find((b) => b.title === "Filter by deals")!.detail, /\b\d+% or more below\b/);
});
