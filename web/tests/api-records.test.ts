// The API record (lib/api/records.ts): built from the same enrichment as the
// cards, marks what is estimated, and never carries a note, a Pro signal, or
// a number the page would not print.
import { test } from "node:test";
import assert from "node:assert/strict";
import { enrichListing } from "../lib/listings/enrich.ts";
import { buildApiArtifacts, makeSlug, toApiListing, slimRow } from "../lib/api/records.ts";
import type { Listing } from "../lib/listings/types.ts";
import type { CardRow } from "../lib/listings/card.ts";

const model3: Listing = {
  id: "5yj3e1ea4mf099936",
  vin: "5YJ3E1EA4MF099936",
  year: 2021,
  make: "Tesla",
  model: "Model 3",
  trim: "Standard Range Plus",
  priceUsd: 23990,
  prevPriceUsd: 24990,
  priceChangedAt: "2026-09-01T00:00:00Z",
  mileage: 41000,
  city: "Dallas",
  state: "TX",
  zip: "75201",
  sellerType: "dealer",
  condition: "used",
  dealerName: "Texas Cars Direct",
  dealerDomain: "texascarsdirect.com",
  sourceUrl: "https://www.texascarsdirect.com/inventory/5YJ3E1EA4MF099936",
  firstSeenAt: "2026-08-20T03:00:00Z",
  lastSeenAt: "2026-09-05T03:00:00Z",
  priceHistory: [{ priceUsd: 24990, observedAt: "2026-08-20T03:00:00Z" }, { priceUsd: 23990, observedAt: "2026-09-01T00:00:00Z" }],
};

test("a record carries the listing, the seller's own page, and marked facts — and nothing it should not", () => {
  const e = enrichListing(model3);
  const rec = toApiListing(e, { realPrice: true, loc: [32.78, -96.8], body: "sedan", trim: "Standard Range Plus" });
  assert.equal(rec.vin, "5YJ3E1EA4MF099936");
  assert.equal(rec.url, "https://voltcheck.net/listing/5yj3e1ea4mf099936");
  assert.equal(rec.price_usd, 23990);
  assert.equal(rec.previous_price_usd, 24990);
  assert.equal(rec.seller.url, model3.sourceUrl);
  assert.equal(rec.seller.domain, "texascarsdirect.com");
  assert.deepEqual(rec.location, { city: "Dallas", state: "TX", zip: "75201", lat: 32.78, lng: -96.8 });
  assert.equal(rec.first_seen, "2026-08-20");
  assert.equal(rec.kind, "BEV");
  if (rec.range) assert.equal(typeof rec.range.estimated, "boolean");
  if (rec.battery) assert.equal(typeof rec.battery.estimated, "boolean");
  const text = JSON.stringify(rec);
  for (const forbidden of ['"note"', "askVsSold", "askVsMarket", "ask_vs", "incentive", "rebate", "tiles"]) {
    assert.equal(text.includes(forbidden), false, `record must not carry ${forbidden}`);
  }
});

test("no real price means null, never the number the seller printed", () => {
  const rec = toApiListing(enrichListing({ ...model3, priceUsd: 399 }), { realPrice: false });
  assert.equal(rec.price_usd, null);
  assert.equal(rec.previous_price_usd, undefined);
});

test("a lane name in dealer_domain is not a domain", () => {
  const rec = toApiListing(enrichListing({ ...model3, dealerDomain: "ford-blue-advantage" }), { realPrice: true });
  assert.equal(rec.seller.domain, undefined);
});

test("artifacts: one partition per make, a slim row per car, a manifest with counts", () => {
  const rows: CardRow[] = [
    { id: model3.id, hay: "", year: 2021, make: "Tesla", model: "Model 3", title: "2021 Tesla Model 3 Standard Range Plus", priceUsd: 23990, realPrice: true, mileage: 41000, condition: "used", state: "TX", loc: [32.78, -96.8], body: "sedan", trim: "Standard Range Plus", tiles: [] },
  ];
  const enriched = new Map([[model3.vin, enrichListing(model3)]]);
  const a = buildApiArtifacts([model3], enriched, rows, "2026-09-05T00:00:00Z");
  assert.deepEqual([...a.partitions.keys()], ["tesla"]);
  assert.equal(a.index.r.length, 1);
  const s = a.index.r[0];
  assert.equal(s[0], model3.id);
  assert.equal(s[1], "tesla");
  assert.equal(s[2], "model3");
  assert.equal(s[4], 23990);
  assert.equal(s[6], 1);
  assert.equal(s[7], "TX");
  assert.equal(s[10], 0, "BEV");
  assert.equal(s[17], Math.floor(Date.parse("2026-08-20T03:00:00Z") / 86400000));
  assert.deepEqual(a.manifest.makes, [{ make: "Tesla", slug: "tesla", count: 1, models: { "Model 3": 1 } }]);
  assert.equal(makeSlug("Mercedes-Benz"), "mercedes-benz");
  assert.equal(makeSlug("Land rover"), "land-rover");
  assert.equal(slimRow(a.partitions.get("tesla")![0], enriched.get(model3.vin)!)[16], "sedan");
});
