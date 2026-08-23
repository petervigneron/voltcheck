// node --test scraper/test/price-provenance.test.mjs
//
// The provenance tag decides whether a price CLAIM reaches a shopper: two
// history rows pair into a "price cut $X" only when their tags match
// (migration 0041). So these tests are about two failure directions, and they
// are not symmetric — see lib/price-provenance.mjs.
//
//   * Two DIFFERENT served fields sharing a tag manufactures a false cut. That
//     is the 2026-08-19 incident (7,036 of 9,154 chip-eligible cards standing
//     on a cross-lane step) and the expensive direction.
//   * One field wearing two tags only makes the claim go quiet.
//
// The last block is the incident itself, as a regression test.
import test from "node:test";
import assert from "node:assert/strict";
import {
  JSONLD, DDC_INTERNET, DDC_SALE, DDC_MSRP, DEOL_SELLING, DEOL_MSRP,
  TV_SELLING, isProvenance, offerProvenance, pickTaggedPrice, oemField,
} from "../lib/price-provenance.mjs";
import { normalize } from "../lib/normalize.mjs";
import { resolveDdcPriceTagged, PRICE_ABSTAIN } from "../lib/platforms/dealercom.mjs";
import { priceFromLibraryTagged } from "../lib/platforms/dealeron-api.mjs";

const vehicle = (offers) => ({
  "@type": "Vehicle",
  vehicleIdentificationNumber: "5YJ3E1EA7KF000000",
  vehicleModelDate: "2019",
  brand: "Tesla",
  model: "Model 3",
  offers,
});
const norm = (offers) => normalize(vehicle(offers), { sourceUrl: "https://x.test/vdp", dealerDomain: "x.test" });

// ── the vocabulary guard ────────────────────────────────────────────────────

test("isProvenance accepts our tags and the oem-<lane>-<field> shape", () => {
  assert.ok(isProvenance(JSONLD));
  assert.ok(isProvenance(DDC_INTERNET));
  assert.ok(isProvenance("oem-hyundai-dealer-internet-price"));
  assert.ok(isProvenance("oem-gm-carbravo-net-price"));
});

test("isProvenance rejects anything we did not mint", () => {
  // A tag can arrive on the generic path inside JSON-LD a dealer's site
  // served. Page-controlled text must not be able to name a provenance — least
  // of all one that would pair with a real field's and publish a cut.
  for (const junk of ["", "  ", "JSONLD", "oem-", "oem-x/../y", "'; drop", null, undefined, 7, {}, ["jsonld"]]) {
    assert.equal(isProvenance(junk), false, `should reject ${JSON.stringify(junk)}`);
  }
});

test("offerProvenance reads the declared tag, array-wrapped offers included", () => {
  // schema.org lets offers be a node or a list, and the platform builders emit
  // both shapes; the tag has to survive either.
  assert.equal(offerProvenance({ priceProvenance: TV_SELLING }), TV_SELLING);
  assert.equal(offerProvenance([{ priceProvenance: DDC_INTERNET }]), DDC_INTERNET);
  assert.equal(offerProvenance({ price: 1 }), undefined);
  assert.equal(offerProvenance(undefined), undefined);
  assert.equal(offerProvenance({ priceProvenance: "made-up" }), undefined);
});

// ── normalize(): what a parsed page offer is, and what it is not ────────────

test("a price read off a dealer's own JSON-LD offer is tagged jsonld", () => {
  assert.equal(norm({ "@type": "Offer", price: "31995" }).priceProvenance, JSONLD);
});

test("a platform's synthesized offer keeps the field it declares, not jsonld", () => {
  // Team Velocity assembles this node from an API record; offers.price is
  // sellingPrice, which has never been checked equal to the page's JSON-LD.
  const rec = norm({ "@type": "Offer", price: 31995, priceProvenance: TV_SELLING });
  assert.equal(rec.priceUsd, 31995);
  assert.equal(rec.priceProvenance, TV_SELLING);
});

test("a provenance a dealer's page tried to declare is dropped, not trusted", () => {
  const rec = norm({ "@type": "Offer", price: 31995, priceProvenance: "totally-legit" });
  assert.equal(rec.priceUsd, 31995);
  assert.equal(rec.priceProvenance, JSONLD); // what the reading actually is
});

test("no price read means no provenance — an absent price is not an observation", () => {
  assert.equal(norm({ "@type": "Offer", price: undefined }).priceProvenance, undefined);
  assert.equal(norm(undefined).priceProvenance, undefined);
});

test("a lease payment beside the sale offer supplies neither price nor tag", () => {
  // paymentFrequency sits on the offer itself — the "$1,990/mo" Model X shape.
  const rec = norm([{ "@type": "Offer", price: 499, paymentFrequency: "MONTH" }]);
  assert.equal(rec.priceUsd, undefined);
  assert.equal(rec.priceProvenance, undefined);
});

// ── the dealer.com resolver names the branch it took ────────────────────────

test("resolver: the JSON-LD offer it took is tagged jsonld (VW ID.Buzz)", () => {
  const r = resolveDdcPriceTagged(
    { priceUsd: 59110, condition: "new", year: 2025 },
    { msrp: 72385, internetPrice: 66610, salePrice: 72385, newOrUsed: "new" }
  );
  assert.deepEqual(r, { priceUsd: 59110, provenance: JSONLD });
});

test("resolver: when JSON-LD only echoes MSRP, the DDC field that wins is named (bZ4X)", () => {
  const r = resolveDdcPriceTagged(
    { priceUsd: 29995, condition: "new", year: 2023 },
    { msrp: 29995, internetPrice: 24511, newOrUsed: "new" }
  );
  assert.deepEqual(r, { priceUsd: 24511, provenance: DDC_INTERNET });
});

test("resolver: the tag follows the field, not the position — salePrice can win", () => {
  const r = resolveDdcPriceTagged(
    { priceUsd: 48000, condition: "new", year: 2024 },
    { msrp: 48000, internetPrice: 47000, salePrice: 44000, newOrUsed: "new" }
  );
  assert.deepEqual(r, { priceUsd: 44000, provenance: DDC_SALE }); // lowest below MSRP
});

test("resolver: junk-low JSON-LD falls back to the lowest plausible DDC field, named", () => {
  // vanhyundai.com, 2026-08-14: offers.price was a $2,293 accessories total.
  const r = resolveDdcPriceTagged(
    { priceUsd: 2293, condition: "new", year: 2024 },
    { msrp: 50273, internetPrice: 47500, newOrUsed: "new" }
  );
  assert.deepEqual(r, { priceUsd: 47500, provenance: DDC_INTERNET });
});

test("resolver: MSRP standing alone is tagged as MSRP, not as an advertised price", () => {
  const r = resolveDdcPriceTagged({ priceUsd: undefined, condition: "new", year: 2024 }, { msrp: 50273, newOrUsed: "new" });
  assert.deepEqual(r, { priceUsd: 50273, provenance: DDC_MSRP });
});

test("an abstain carries no provenance — it never reaches price history at all", () => {
  // A discount too deep to be unconditional: 0039 keeps zero-price rows out of
  // listing_price_history, so tagging one would claim a field we could not read.
  const r = resolveDdcPriceTagged(
    { priceUsd: 89530, condition: "new", year: 2025 },
    { msrp: 89530, internetPrice: 30399, newOrUsed: "new" }
  );
  assert.equal(r.priceUsd, PRICE_ABSTAIN);
  assert.equal(r.provenance, undefined);
});

// ── DealerOn's price library: only the verified rung claims to be jsonld ────

test("only calc_INTERNET PRICE claims jsonld; the rungs below it do not", () => {
  const b64 = (s) => Buffer.from(s, "utf8").toString("base64");
  assert.deepEqual(
    priceFromLibraryTagged(b64("MSRP:54998.0;Selling Price:53998.0;calc_INTERNET PRICE:54083.0")),
    { price: 54083, provenance: JSONLD } // verified byte-for-byte, dublinchevrolet OPTIQ
  );
  assert.deepEqual(priceFromLibraryTagged(b64("MSRP:41000.0;Selling Price:39500.0")), {
    price: 39500,
    provenance: DEOL_SELLING,
  });
  assert.deepEqual(priceFromLibraryTagged(b64("MSRP:41000.0")), { price: 41000, provenance: DEOL_MSRP });
  assert.deepEqual(priceFromLibraryTagged(""), { price: undefined, provenance: undefined });
});

// ── OEM ladders: the rung is the tag ────────────────────────────────────────

test("an OEM ladder names the rung that supplied the number", () => {
  assert.deepEqual(
    pickTaggedPrice("hyundai", [["dealerInternetPrice", 41500], ["msrp", 44000]]),
    { priceUsd: 41500, priceProvenance: "oem-hyundai-dealer-internet-price" }
  );
  // The same car once its dealer stops publishing an internet price: same
  // lane, same run source, DIFFERENT field — 0040 could not see this.
  assert.deepEqual(
    pickTaggedPrice("hyundai", [["dealerInternetPrice", null], ["msrp", 44000]]),
    { priceUsd: 44000, priceProvenance: "oem-hyundai-msrp" }
  );
});

test("an OEM ladder that matches nothing yields no price and no tag", () => {
  assert.deepEqual(pickTaggedPrice("kia", [["dealerPrice", null], ["msrp", undefined]]), {
    priceUsd: undefined,
    priceProvenance: undefined,
  });
});

test("oemField and the ladder agree on how a field name becomes a tag", () => {
  assert.equal(oemField("hyundai-cpo", "SortablePrice"), "oem-hyundai-cpo-sortable-price");
  assert.equal(pickTaggedPrice("hyundai-cpo", [["SortablePrice", 1]]).priceProvenance, oemField("hyundai-cpo", "SortablePrice"));
});

// ── the regression this whole column exists for ─────────────────────────────

test("the 2026-08-19 field flip cannot pair: jsonld and ddc-internet differ", () => {
  // mcgovernhyundai.com Ioniq 5 published "$53,770 → $29,495" as a price cut.
  // Both numbers were on the VDP at the same instant: the crawl's resolver took
  // the JSON-LD offer, recheck read DDC's internetPrice, and the lane swapped.
  const crawl = resolveDdcPriceTagged(
    { priceUsd: 53770, condition: "used", year: 2023 },
    { internetPrice: 29495, newOrUsed: "used" }
  );
  const recheckTag = DDC_INTERNET; // recheck.mjs's dealer.com leg
  assert.equal(crawl.provenance, JSONLD);
  assert.notEqual(crawl.provenance, recheckTag); // → no pair → no cut published
});

test("the same field seen by two lanes DOES pair — the half 0040 could not do", () => {
  // A dealer genuinely marks a car down. The nightly crawl read the old price
  // off the page's JSON-LD offer; recheck reads the new one off the same node.
  // Under 0040 this was suppressed for being cross-lane (27,139 such steps).
  const crawlTag = norm({ "@type": "Offer", price: 44990 }).priceProvenance;
  const recheckTag = JSONLD; // recheck.mjs's generic JSON-LD leg
  assert.equal(crawlTag, recheckTag);
});
