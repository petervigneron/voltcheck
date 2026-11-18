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

// Audit, 2026-11-18: 8.8% of API titles restated the feed's raw trim string
// ("2027 Toyota bZ Woodland New 2027 Toyota bZ Woodland  AWD") while `trim`
// was clean or absent. The title is year, make, model and the record's own
// trim, whatever else the feed wrote.
test("title: year, make, model and the record's trim — never the feed's raw trim string", () => {
  const bz: Listing = { ...model3, make: "Toyota", model: "bZ Woodland", year: 2027, trim: "New 2027 Toyota bZ Woodland  AWD" };
  assert.equal(toApiListing(enrichListing(bz), { realPrice: true }).title, "2027 Toyota bZ Woodland");
  assert.equal(toApiListing(enrichListing(model3), { realPrice: true, trim: "Standard Range Plus" }).title, "2021 Tesla Model 3 Standard Range Plus");
});

// Audit, 2026-11-18: 1,921 sampled cars carried a ZIP and no city; some had no
// state either. The state comes from the ZIP table, exact ZIPs only; no city
// is ever made up.
test("location: a missing state is filled from the ZIP table; a stated one is never replaced; no city is invented", () => {
  const noState = { ...model3, city: undefined, state: undefined, zip: "33023" };
  const enriched = new Map([[model3.vin, enrichListing(noState)]]);
  const rows: CardRow[] = [{ id: model3.id, hay: "", year: 2021, make: "Tesla", model: "Model 3", title: "", priceUsd: 23990, realPrice: true, tiles: [] }];
  const table = { "33023": "FL", "75201": "TX" };
  const rec = buildApiArtifacts([noState], enriched, rows, "2026-11-18T00:00:00Z", table).partitions.get("tesla")![0];
  assert.deepEqual(rec.location, { state: "FL", zip: "33023" });
  // The listing's own state stands, even where the table disagrees.
  const stated = { ...noState, state: "GA" };
  const rec2 = buildApiArtifacts([stated], new Map([[model3.vin, enrichListing(stated)]]), rows, "2026-11-18T00:00:00Z", table).partitions.get("tesla")![0];
  assert.equal(rec2.location.state, "GA");
  // A ZIP the table does not have, and no table at all: nothing.
  const unknown = { ...noState, zip: "00000" };
  assert.equal(buildApiArtifacts([unknown], new Map([[model3.vin, enrichListing(unknown)]]), rows, "x", table).partitions.get("tesla")![0].location.state, undefined);
  assert.equal(buildApiArtifacts([noState], enriched, rows, "x").partitions.get("tesla")![0].location.state, undefined);
  // The index row's state filter sees the filled state too.
  assert.equal(buildApiArtifacts([noState], enriched, rows, "x", table).index.r[0][7], "FL");
});

test("image_url: a seller's placeholder is omitted; a photo or a maker's render is kept", () => {
  const rec = (imageUrl: string) => toApiListing(enrichListing({ ...model3, imageUrl }), { realPrice: true }).image_url;
  assert.equal(rec("https://images.dealer.com/unavailable_stockphoto.png"), undefined);
  assert.equal(rec("https://images.dealersync.com/2074/Photos/comingsoon/62a1c0cae8e9459ab266df104e53e0ac.jpg"), undefined);
  assert.equal(rec("https://pictures.dealer.com/t/texascars/1234/abc.jpg"), "https://pictures.dealer.com/t/texascars/1234/abc.jpg");
  assert.equal(rec("https://cgi.cadillac.com/mmgprod-us/dynres/prove/image.gen?i=2025/6DE26/6DE26__3LT/GBA_0ST_1SG.jpg"), "https://cgi.cadillac.com/mmgprod-us/dynres/prove/image.gen?i=2025/6DE26/6DE26__3LT/GBA_0ST_1SG.jpg");
});
