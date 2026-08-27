import test from "node:test";
import assert from "node:assert/strict";
import { priceOf } from "../lib/recheck-price.mjs";

const VIN = "1FT6W3LU6SWG26144";
const URL = "https://www.suntrupfordwest.com/new-St+Louis-2025-Ford-F+150+Lightning-Flash-1FT6W3LU6SWG26144";
const NEW_2025 = { condition: "new", year: "2025" };

// Verbatim from that VDP, 2026-08-26: the dotagging element's price attributes
// and the schema.org offer that sat on the same page. The dealer's own JSON-LD
// publishes the SAVINGS line (15021) where the price belongs; MSRP is 72965
// and the rendered Final Price is 57944. Ford's window sticker for this VIN
// agrees: TOTAL MSRP $72,965.
const DOTAGGING = `<div data-vin="${VIN}"
     data-price="57944"
     data-msrp="72965"
     data-pricelib="TVNSUDo3Mjk2NS4wO0ludGVybmV0IFByaWNlOjU3OTQ0LjA7U2VsbGluZyBQcmljZTo1Nzk0NC4wO0NvbmRpdGlvbmFsOjMyNTAuMDtjYWxjX01TUlA6NzI5NjUuMDtjYWxjX0RlYWxlciBEaXNjb3VudDoxNTAyMS4wO2NhbGNfRGVhbGVyIERpc2NvdW50IG1pbnVzIFJlYmF0ZXM6MTUwMjEuMDtjYWxjX0lOVEVSTkVUIFBSSUNFOjU3OTQ0LjA7Y2FsY19GSU5BTCBQUklDRTo1Nzk0NC4wO2NhbGNfWW91IFNhdmU6MTUwMjEuMDtjYWxjX09FTSBTYXZpbmdzIENvbmRpdGlvbmFsOjMyNTAuMDtjYWxjX0NvbmRpdGlvbmFsIEZpbmFsIFByaWNlOjU0Njk0LjA7Y2FsY19Db25kaXRpb25hbCBZb3UgU2F2ZToxODI3MS4wO2NhbGNfdG90YWwgc2F2aW5nczoxNTAyMS4w"
     data-dotagging-item-id="${VIN}"
     data-dotagging-item-price="72965"
     data-dotagging-item-variant="Flash"
     data-dotagging-item-number="T25362"
     data-odometer="91"></div>`;

const offer = (price) => `<script type="application/ld+json">${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "Car",
  vehicleIdentificationNumber: VIN,
  offers: { "@type": "Offer", price, priceCurrency: "USD" },
})}</script>`;

test("a DealerOn offer price that is really the dealer discount is not published", () => {
  // The bug: 15021 clears the $15,000 new-car floor by $21, so the floor alone
  // let it through and the site printed a $15,021 asking price on a $57,944
  // truck. The page's own MSRP is the only thing that can see it.
  const r = priceOf(offer(15021.0) + DOTAGGING, VIN, URL, NEW_2025);
  assert.equal(r.price, 57944);
});

test("both lanes read the same field, so the pair is not a phantom price cut", async () => {
  // The crawl already resolved this page to 57944 (commit 5ebca37). Recheck
  // reading 15021 and tagging it `jsonld` — the tag the crawl's answer also
  // carries — is what let the two PAIR into a -$42,923 cut nobody made.
  const { resolveDealerOnPriceTagged, extractDealerOn } = await import("../lib/platforms/dealeron.mjs");
  const v = extractDealerOn(DOTAGGING).dotagging.get(VIN);
  const crawl = resolveDealerOnPriceTagged(
    { vin: VIN, ...NEW_2025, priceUsd: 15021, priceProvenance: "jsonld" },
    v,
  );
  const recheck = priceOf(offer(15021.0) + DOTAGGING, VIN, URL, NEW_2025);
  assert.equal(recheck.price, crawl.priceUsd);
  assert.equal(recheck.provenance, crawl.provenance);
});

test("a healthy DealerOn offer is still the price, and keeps its tag", () => {
  const r = priceOf(offer(57944.0) + DOTAGGING, VIN, URL, NEW_2025);
  assert.deepEqual(r, { price: 57944, provenance: "jsonld" });
});

test("a page with no MSRP to anchor against keeps the offer, floor-gated", () => {
  assert.deepEqual(priceOf(offer(31741), VIN, URL, { condition: "certified", year: "2022" }), {
    price: 31741,
    provenance: "jsonld",
  });
  // Sub-floor proves nothing about the price: leave the stored one alone
  // rather than write a false cut into listing_price_history.
  assert.equal(priceOf(offer(1990), VIN, URL, { condition: "used", year: "2019" }).price, null);
});

test("a junk offer with no other price to fall back on writes nothing", () => {
  // Strip the price library and the selling price and the discount is all the
  // page has left. The remaining rung is data-dotagging-item-price, which on
  // this truck is the $72,965 STICKER — publishing it would overstate by the
  // whole discount, so the resolver suppresses it once the page has been
  // caught contradicting itself and abstains. Recheck must then write nothing
  // and leave the stored price alone; an abstain is not a price claim.
  const stripped = DOTAGGING.replace('data-price="57944"', 'data-price=""')
    .replace(/data-pricelib="[^"]*"/, 'data-pricelib=""');
  const r = priceOf(offer(15021.0) + stripped, VIN, URL, NEW_2025);
  assert.equal(r.price, null);
  assert.equal(r.provenance, undefined);
});
