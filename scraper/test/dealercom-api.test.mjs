import { test } from "node:test";
import assert from "node:assert/strict";
import { dealerComApiConfig, mapRecord } from "../lib/platforms/dealercom-api.mjs";
import { enrichFromDdc, PRICE_ABSTAIN } from "../lib/platforms/dealercom.mjs";
import { JSONLD } from "../lib/price-provenance.mjs";
import { normalize } from "../lib/normalize.mjs";
import { classifyEv } from "../lib/ev.mjs";

const ORIGIN = "https://www.concordtoyota.com";

// A structurally faithful getInventoryAndFacets record: the split attribute
// lists (display strings vs machine values), the trackingPricing fields, and a
// dprice stack whose isFinalPrice row is $3k under the advertised price because
// it folds in a conditional "Offers" incentive — the exact shape that makes
// resolveDdcPrice load-bearing.
const REC = {
  vin: "JTMBCAEB4TA012215",
  year: 2026,
  make: "Toyota",
  model: "BZ",
  trim: "XLE",
  condition: "New",
  certified: false,
  stockNumber: "T12215",
  accountId: "sonicconcordtoyota",
  fuelType: "Battery Electric",
  link: "/new/Toyota/2026-Toyota-BZ-05f0.htm",
  title: ["New 2026 Toyota", "BZ XLE"],
  images: [{ uri: "https://pictures.dealer.com/x.jpg" }, { uri: "https://pictures.dealer.com/y.jpg" }],
  attributes: [
    { name: "exteriorColor", value: "Wind Chill Pearl" },
    { name: "interiorColor", value: "Black" },
    { name: "odometer", value: "9 miles" },
  ],
  trackingAttributes: [
    { name: "odometer", value: "9" },
    { name: "driveLine", value: "FWD" },
    { name: "normalFuelType", value: "Electric" },
  ],
  trackingPricing: { internetPrice: "38745", salePrice: "37745", askingPrice: "$38,745", msrp: "$39,939" },
  pricing: {
    retailPrice: "$39,939",
    dprice: [
      { label: "Total SRP", typeClass: "msrp", value: "$39,939" },
      { label: "Advertised Price", typeClass: "askingPrice", value: "$38,745" },
      { label: "Offers", typeClass: "SICRule", value: "$3,000" },
      { label: "Transparent Price", typeClass: "SIFRule", value: "$35,745", isFinalPrice: true },
    ],
  },
};

const ACCOUNTS = {
  sonicconcordtoyota: {
    name: "Concord Toyota",
    address: { accountName: "Concord Toyota", city: "Concord", state: "CA", postalCode: "94520" },
  },
};

// The full crawl.mjs path for one API record: map → normalize → enrichFromDdc.
function pipeline(rec, accounts = ACCOUNTS) {
  const mapped = mapRecord(rec, accounts, ORIGIN);
  let out = normalize(mapped.node, { sourceUrl: mapped.node.offers.url, dealerDomain: "concordtoyota.com" });
  out = enrichFromDdc(out, mapped.ddc);
  return out;
}

test("dealerComApiConfig reads siteId off a ws-inv-data page", () => {
  const html = `<div data-widget-name="inventory-listing-ws-inv-data-service"></div><script>var x={"siteId":"sonicconcordtoyota"}</script>`;
  assert.deepEqual(dealerComApiConfig(html), { siteId: "sonicconcordtoyota" });
});

test("dealerComApiConfig requires the ws-inv-data widget marker", () => {
  // A siteId alone, on a page that is not a dealer.com storefront, is ignored.
  assert.equal(dealerComApiConfig(`<script>var siteId="acme"</script>`), null);
});

test("dealerComApiConfig rejects a page with no siteId", () => {
  assert.equal(dealerComApiConfig(`<div>ws-inv-data</div>`), null);
});

test("the resolved price is the rendered final price, not the advertised price", () => {
  // isFinalPrice ($35,745) folds a $3k incentive under the $38,745 ask. The old
  // HTML path published $35,745 (JSON-LD offers.price), and resolveDdcPrice
  // reproduces it here from the mapped fields — no VDP fetch.
  const rec = pipeline(REC);
  assert.equal(rec.priceUsd, 35745);
});

test("the whole dealer.com path carries a provenance onto the record", () => {
  // The end this change had to reach: normalize() tags the mapped offer jsonld,
  // and enrichFromDdc REPLACES that with whatever resolveDdcPriceTagged
  // actually took — here the rendered final price, which is the JSON-LD offer.
  // Without this the record reaches ingest untagged and the whole column stays
  // null, which is exactly the state 0041 shipped into (100% null, every day).
  const rec = pipeline(REC);
  assert.equal(rec.priceProvenance, JSONLD);
});

test("a dealer.com abstain reaches the record with no provenance at all", () => {
  // A price stack with nothing plausible in it: the resolver abstains (0), and
  // the tag must not survive the number it described. 0039 keeps zero-price
  // rows out of listing_price_history, so a tag here would name a field for a
  // price that never becomes an observation.
  const rec = pipeline({
    ...REC,
    pricing: {},
    trackingPricing: { internetPrice: "0", msrp: "0", askingPrice: "0", salePrice: "0" },
  });
  assert.equal(rec.priceUsd, PRICE_ABSTAIN);
  assert.equal(rec.priceProvenance, undefined);
});

test("odometer, trim, drivetrain and colours survive the map", () => {
  const rec = pipeline(REC);
  assert.equal(rec.mileage, 9);
  assert.equal(rec.trim, "XLE");
  assert.equal(rec.driveLine, "FWD");
  assert.equal(rec.exteriorColor, "Wind Chill Pearl");
  assert.equal(rec.interiorColor, "Black");
});

test("dealer identity comes from the accounts block, not the crawl domain", () => {
  const rec = pipeline(REC);
  assert.equal(rec.dealerName, "Concord Toyota");
  assert.equal(rec.city, "Concord");
  assert.equal(rec.state, "CA");
  assert.equal(rec.zip, "94520");
});

test("the mapped node classifies as a BEV on its declared fuel", () => {
  const { node } = mapRecord(REC, ACCOUNTS, ORIGIN);
  assert.deepEqual(classifyEv(node), { isEv: true, kind: "BEV", confidence: "high" });
});

test("the VDP link resolves to an absolute url", () => {
  const rec = pipeline(REC);
  assert.equal(rec.vdpUrl, "https://www.concordtoyota.com/new/Toyota/2026-Toyota-BZ-05f0.htm");
});

test("a record with no valid VIN maps to null", () => {
  assert.equal(mapRecord({ ...REC, vin: "NOTAVIN" }, ACCOUNTS, ORIGIN), null);
});

test("a used record with a real discount takes the lower advertised field, not the sticker", () => {
  // No MSRP anchor echo: jsonld sits below msrp, so it stands as the price.
  const used = {
    ...REC,
    condition: "Used",
    trackingPricing: { internetPrice: "45000", salePrice: "44000", askingPrice: "$45,000", msrp: "$50,000" },
    pricing: { retailPrice: "$50,000", dprice: [{ typeClass: "SIFRule", value: "$44,000", isFinalPrice: true }] },
  };
  assert.equal(pipeline(used).priceUsd, 44000);
});

// ---------------------------------------------------------------------------
// The zero-record lot. This endpoint's silence and a genuinely empty rooftop
// look identical from here — 200, totalCount 0, an empty inventory array — and
// reading it as "empty" certifies a crawl that found nothing, which is a
// licence for db-sync to delist the whole rooftop. omearaford.com and
// omearagmc.com answer exactly that while their own used-inventory page
// server-renders 28 cars (2026-09-05). ok=false hands the domain back to the
// HTML extractor.
import { pullDealerComApi } from "../lib/platforms/dealercom-api.mjs";

function stubFetch(payload) {
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/robots.txt")) return new Response("", { status: 200 });
    return new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
  };
  return () => {
    globalThis.fetch = real;
  };
}

test("a lot the endpoint answers with zero records is not a certified empty lot", async () => {
  const restore = stubFetch({ pageInfo: { totalCount: 0, pageSize: 48, pageStart: 0 }, inventory: [], accounts: {} });
  try {
    const r = await pullDealerComApi({ siteId: "omearacenterfordfd" }, "https://www.omearaford-test.invalid");
    assert.equal(r.ok, false, "ok=false is what makes crawl.mjs fall back to the HTML walk");
    assert.equal(r.complete, false);
    assert.equal(r.vehicles.length, 0);
  } finally {
    restore();
  }
});

test("a lot with records still completes on a short page", async () => {
  const restore = stubFetch({ pageInfo: { totalCount: 1, pageSize: 48, pageStart: 0 }, inventory: [REC], accounts: {} });
  try {
    const r = await pullDealerComApi({ siteId: "x" }, "https://www.ddc-test.invalid");
    assert.equal(r.ok, true);
    assert.equal(r.complete, true);
    assert.equal(r.vehicles.length, 1);
  } finally {
    restore();
  }
});
