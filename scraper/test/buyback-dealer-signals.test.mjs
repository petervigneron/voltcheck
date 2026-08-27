import test from "node:test";
import assert from "node:assert/strict";
import { readBuybackSignals } from "../lib/buyback-dealer-signals.mjs";

// Verbatim from sneedford.com's nav, 2026-08-27 — the rooftop that prompted
// this. 210 of the 260 cars on its used lot disclose a buyback individually.
const SNEED_NAV = `<nav><a href="/used-inventory.html">Used</a>
  <a href="/manufacturer-buyback.html">Manufacturer Buyback</a>
  <a href="/value-your-trade.html">Value Your Trade</a></nav>`;

test("finds a rooftop that builds a section around buybacks", () => {
  const r = readBuybackSignals(SNEED_NAV);
  assert.equal(r.hit, true);
  assert.equal(r.evidence[0].href, "/manufacturer-buyback.html");
  assert.equal(r.evidence[0].where, "link");
});

test("finds the programme described without a link", () => {
  const r = readBuybackSignals(
    "<p>Dennis Sneed Ford is a proud participant in Ford's Manufacturer Buy-Back Program.</p>",
  );
  assert.equal(r.hit, true);
  assert.equal(r.evidence[0].where, "text");
});

test("an ordinary dealer's homepage says nothing", () => {
  for (const html of [
    `<nav><a href="/new-inventory.html">New</a><a href="/used-inventory.html">Used</a></nav>`,
    `<p>Clean CARFAX one-owner trade-ins, certified pre-owned, and factory warranties.</p>`,
    "",
  ]) {
    assert.equal(readBuybackSignals(html).hit, false);
  }
});

test("warranty fine print is not an advertisement", () => {
  // The exact shape migration 0024 named as a false positive. It reaches this
  // detector too, because dealers print it site-wide in the footer.
  const r = readBuybackSignals(
    "<p>Coverage does not apply to as-is, tax tow, salvage, or lemon law vehicles.</p>",
  );
  assert.equal(r.hit, false);
});

test("a dealer promising they do NOT sell buybacks is not a buyback dealer", () => {
  const r = readBuybackSignals(
    "<p>We never sell a manufacturer buyback or a lemon law vehicle. Every car is a clean-title trade.</p>",
  );
  assert.equal(r.hit, false);
  assert.equal(r.denied, true);
});

test("the Font Awesome lemon icon is not a lemon law", () => {
  // A first pass matched bare /lemon/ and hit `.fa-lemon-o` in the stylesheet
  // on sneedford.com — a true positive for the wrong reason, which on any
  // other rooftop would have been a false one.
  const r = readBuybackSignals(
    `<style>.fa-lemon-o:before{content:"\\f094"}</style><nav><a href="/used.html">Used</a></nav>`,
  );
  assert.equal(r.hit, false);
});

test("evidence is capped and de-duplicated, since a nav repeats itself", () => {
  // Sneed's nav renders twice (desktop + mobile), so the same href appears
  // four times on the page.
  const r = readBuybackSignals(SNEED_NAV.repeat(4));
  assert.equal(r.evidence.filter((e) => e.where === "link").length, 1);
});

test("a buy-back GUARANTEE is a return policy, not a manufacturer repurchase", () => {
  // hertzcarsales.com, found by the 2026-08-27 sweep. An offer to the shopper.
  const r = readBuybackSignals(`<a href="/hertz-buy-back-guarantee.htm">Buy Back Guarantee</a>`);
  assert.equal(r.hit, false);
});

test("a LEASE buyback is the customer buying their own lease", () => {
  // larrygreenchevrolet.com, same sweep.
  assert.equal(readBuybackSignals(`<a href="/lease-buyback.htm">Lease Buyback</a>`).hit, false);
});

test("excluding those does not cost the real inventory categories", () => {
  for (const href of [
    "/used-inventory/manufacturer-buy-back-vehicles-springfield-il.htm", // landmarkfordtrucks.net
    "/like-new---reacquired---save-thousands.html",                      // allamericanfordinoldbridge.com
    "/manufacture-buyback",                                              // atlantabestusedcars.com
    "/manufacturer-buyback-in-boston-ma.htm",                            // bostonforeignmotor.com
  ]) {
    assert.equal(readBuybackSignals(`<a href="${href}">See inventory</a>`).hit, true, href);
  }
});
