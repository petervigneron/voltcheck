// node --test scraper/test/dealercom-price.test.mjs
//
// Every case is a real dealer.com VDP, read against its rendered "Final
// Price"/dominant price on 2026-08-18 (or the vanhyundai case, 2026-08-14).
// The served fields are what DDC.dataLayer + JSON-LD actually carried; `want`
// is the number a human sees on the page. If a rooftop's pricing config shifts
// under us, these are what should fail first.
import test from "node:test";
import assert from "node:assert/strict";
import { resolveDdcPrice, PRICE_ABSTAIN } from "../lib/platforms/dealercom.mjs";

// jsonld arrives on rec.priceUsd (normalize() read offers.price); the rest are
// DDC.dataLayer fields. Only the fields the page actually served are set.
const run = ({ jsonld, msrp, internet, sale, asking, newOrUsed, year }) =>
  resolveDdcPrice(
    { priceUsd: jsonld, condition: newOrUsed, year },
    {
      msrp,
      internetPrice: internet,
      salePrice: sale,
      askingPrice: asking,
      newOrUsed,
    }
  );

test("JSON-LD wins when it carries a folded-in incentive below MSRP (VW ID.Buzz)", () => {
  // internetPrice $66,610 was the pre-incentive subtotal that used to publish.
  assert.equal(
    run({ jsonld: 59110, msrp: 72385, internet: 66610, sale: 72385, asking: 72385, newOrUsed: "new" }),
    59110
  );
});

test("JSON-LD wins over an internetPrice that exceeds MSRP (GMC Hummer SUV)", () => {
  assert.equal(
    run({ jsonld: 112955, msrp: 142820, internet: 142955, sale: 112955, asking: 112820, newOrUsed: "new" }),
    112955
  );
});

test("JSON-LD wins on a used car with no MSRP anchor (Tesla Model Y)", () => {
  assert.equal(run({ jsonld: 29943, internet: 31213, sale: 29718, asking: 29718, newOrUsed: "used" }), 29943);
});

test("JSON-LD = MSRP with no lower field is the price (Escalade IQL)", () => {
  // salePrice $170,068 sat above the $169,690 sticker; not a discount.
  assert.equal(run({ jsonld: 169690, msrp: 169690, sale: 170068, newOrUsed: "new" }), 169690);
});

test("JSON-LD beats a lower internetPrice when it is the displayed ask (Ioniq 5, used)", () => {
  // We used to publish internetPrice $40,078 — a $314 understate.
  assert.equal(run({ jsonld: 40392, internet: 40078, sale: 39774, newOrUsed: "used" }), 40392);
});

test("JSON-LD above MSRP is a real dealer markup, kept (BMW X5)", () => {
  // salePrice $799 is a lease teaser; must not win.
  assert.equal(run({ jsonld: 89696, msrp: 87900, internet: 89696, sale: 799, asking: 89696, newOrUsed: "new" }), 89696);
});

test("JSON-LD merely echoing MSRP yields to a real DDC discount (bZ4X)", () => {
  // Dominant price $24,511; JSON-LD $29,995 was just the sticker.
  assert.equal(run({ jsonld: 29995, msrp: 29995, internet: 24261, sale: 24261, asking: 399, newOrUsed: "used" }), 24261);
});

test("an implausibly deep (conditional) discount abstains, not a false bargain (Ram)", () => {
  // -$59,331 off $89,530; visible $30,399 is finance-contingent.
  assert.equal(run({ jsonld: 89530, msrp: 89530, internet: 29999, sale: 30199, asking: 29999, newOrUsed: "new" }), PRICE_ABSTAIN);
});

test("junk JSON-LD far below MSRP falls back to the clean DDC field (vanhyundai)", () => {
  // The accessories total $2,293 the current guardrail was built for.
  assert.equal(run({ jsonld: 2293, msrp: 52000, internet: 50273, sale: 52000, newOrUsed: "new" }), 50273);
});

test("junk JSON-LD with no DDC field falls back to MSRP (safe high, never a bargain)", () => {
  // Nothing advertised survives; MSRP is a real ceiling, so show it rather than
  // print the $2,293 junk or hide a car we do have a defensible number for.
  assert.equal(run({ jsonld: 2293, msrp: 52000, newOrUsed: "new" }), 52000);
});

test("no usable signal at all abstains", () => {
  // Junk JSON-LD, no MSRP, no DDC fields — nothing to stand behind.
  assert.equal(run({ jsonld: 2293, newOrUsed: "new" }), PRICE_ABSTAIN);
});

test("a genuinely cheap OLD used car clears the low floor and is kept", () => {
  // A four-figure 2013 Leaf is a real car at a real price.
  assert.equal(run({ jsonld: 4200, internet: 4200, newOrUsed: "used", year: 2013 }), 4200);
});

test("a finance payment served as the price of a recent used car abstains (Wrangler 4xe)", () => {
  // beckchryslerdodgejeep.com, VIN 1C4RJXP62RW249692, verified live
  // 2026-08-19: JSON-LD offers.price carried $1,280 and every DDC price
  // field was zero. Reached production as the car's price ($1,280) before
  // the year-aware floor; same artifact shipped $1,493 on a 2023 Model Y
  // and $1,150 on a 2023 EQE from other dealer.com rooftops.
  assert.equal(
    run({ jsonld: 1280, internet: 0, sale: 0, asking: 0, msrp: 0, newOrUsed: "used", year: 2024 }),
    PRICE_ABSTAIN
  );
});

test("a payment in JSON-LD yields to a plausible DDC field on a recent used car", () => {
  // If the platform's own fields still carry the real ask while JSON-LD
  // flickers to a payment, the ask is served data we can stand behind.
  assert.equal(
    run({ jsonld: 1493, internet: 34413, sale: 34413, newOrUsed: "used", year: 2023 }),
    34413
  );
});

test("a real recent used ask is untouched by the recent-used floor", () => {
  assert.equal(run({ jsonld: 29943, internet: 31213, newOrUsed: "used", year: 2023 }), 29943);
});

test("a no-discount new car at MSRP does not get lowered or abstained", () => {
  assert.equal(run({ jsonld: 50000, msrp: 50000, internet: 50000, sale: 50000, newOrUsed: "new" }), 50000);
});
