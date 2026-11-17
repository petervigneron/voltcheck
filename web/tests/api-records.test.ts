// The API record (lib/api/records.ts): built from the same enrichment as the
// cards, marks what is estimated, and never carries a note, a Pro signal, or
// a number the page would not print.
import { test } from "node:test";
import assert from "node:assert/strict";
import { enrichListing } from "../lib/listings/enrich";
import { buildApiArtifacts, makeSlug, toApiListing, slimRow } from "../lib/api/records";
import type { Listing } from "../lib/listings/types";
import { foldModels } from "../lib/api/search";
import type { CardRow } from "../lib/listings/card";

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
  assert.equal(rec.url, "https://censusev.com/listing/5yj3e1ea4mf099936");
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

// Audit, 2026-11-17: 18,917 cars had no kind because no enrichment row
// matched them, and `kind=BEV` hid every one. NHTSA's decode of the VIN
// settles it where the row cannot — and only then.
test("kind: the enrichment row's answer, else NHTSA's decode of the VIN, else absent", () => {
  const unmatched = { ...model3, make: "Nomake", model: "Nomodel", trim: undefined };
  const kind = (l: Listing) => toApiListing(enrichListing(l), { realPrice: true }).kind;
  assert.equal(kind(unmatched), undefined);
  assert.equal(kind({ ...unmatched, vpicEvLevel: "BEV" }), "BEV");
  assert.equal(kind({ ...unmatched, vpicEvLevel: "PHEV" }), "PHEV");
  // A matched row speaks first.
  assert.equal(kind({ ...model3, vpicEvLevel: "PHEV" }), "BEV");
  const e = enrichListing({ ...unmatched, vpicEvLevel: "PHEV" });
  assert.equal(slimRow(toApiListing(e, { realPrice: true }), e)[10], 1);
});

test("the model list has one entry per model, in the spelling most sellers use", () => {
  const folded = foldModels({ "Prius Plug-in Hybrid": 1679, "Prius Plug-In Hybrid": 439, "PRIUS PLUG-IN HYBRID": 2, "Prius Prime": 605, "PRIUS PRIME": 7, bZ: 3168 });
  assert.deepEqual(folded, { bZ: 3168, "Prius Plug-in Hybrid": 2120, "Prius Prime": 612 });
  assert.deepEqual(Object.keys(folded), ["bZ", "Prius Plug-in Hybrid", "Prius Prime"]);
  // Different cars stay apart: the plus is identity (lib/listings/modelName.ts).
  assert.deepEqual(foldModels({ "EQS 450+": 3, "EQS 450": 2 }), { "EQS 450+": 3, "EQS 450": 2 });
});
