import { test } from "node:test";
import assert from "node:assert/strict";
import { isDealerOnApi, dealerOnTagging, priceFromLibrary, vehicleNode } from "../lib/platforms/dealeron-api.mjs";
import { normalize } from "../lib/normalize.mjs";
import { classifyEv } from "../lib/ev.mjs";

const ORIGIN = "https://www.dublinchevrolet.com";
const b64 = (s) => Buffer.from(s, "utf8").toString("base64");

// The tagging block DealerOn inlines on every SRP.
const SRP_TAG = `<script id="dealeron_tagging_data" type="application/json">{"dealerId":"25890","pageId":3160807,"pageType":"itemlist","items":["3GYK3EM50TS160759"],"itemCount":254}</script>`;

// A structurally faithful VehicleCard: the price stack lives base64-encoded in
// VehiclePriceLibrary (VehicleInternetPrice is 0, TaggingPrice is the MSRP), the
// VIN sits on the card and again inside the image carousel, photos are
// root-relative, and drivetrain can be null.
const CARD = {
  VehicleVin: "3GYK3EM50TS160759",
  VehicleYear: 2026,
  VehicleMake: "Cadillac",
  VehicleModel: "OPTIQ",
  VehicleTrim: "Sport",
  VehicleCondition: "Used",
  VehicleFuelType: "Electric Fuel System",
  VehicleMileage: 3083,
  Mileage: "3,083 mi",
  VehicleDriveTrain: null,
  VehicleStockNumber: "R67694",
  ExteriorColorLabel: "Stellar Black Metallic",
  InteriorColorLabel: "Noir",
  VehicleCpo: false,
  VehicleInternetPrice: 0,
  VehicleMsrp: 54998,
  TaggingPrice: "54998",
  VehiclePriceLibrary: b64(
    "MSRP:54998.0;Selling Price:53998.0;Invoice Price:55442.2;dealer_fee:85.0;calc_Savings:1000.0;calc_Dealer Doc Fee:85.0;calc_INTERNET PRICE:54083.0"
  ),
  VehicleDetailUrl: "https://www.dublinchevrolet.com/used-Dublin-2026-Cadillac-OPTIQ-Sport-3GYK3EM50TS160759",
  VehicleImageModel: {
    VehicleImageCarouselModel: { Vin: "3GYK3EM50TS160759", PhotoList: ["/inventoryphotos/20214/x/ip/1.jpg"] },
  },
};

test("isDealerOnApi needs both the vhcliaa storefront and the tagging block", () => {
  assert.equal(isDealerOnApi(`<div>vhcliaa</div>${SRP_TAG}`), true);
  assert.equal(isDealerOnApi(`<div>vhcliaa</div>`), false);
  assert.equal(isDealerOnApi(SRP_TAG), false);
});

test("dealerOnTagging reads dealerId and pageId from an SRP", () => {
  assert.deepEqual(dealerOnTagging(SRP_TAG), { dealerId: "25890", pageId: "3160807" });
});

test("dealerOnTagging ignores a VDP — only itemlist pages seed the SRP endpoint", () => {
  const vdp = `<script id="dealeron_tagging_data" type="application/json">{"dealerId":"25890","pageId":9999999,"pageType":"item"}</script>`;
  assert.equal(dealerOnTagging(vdp), null);
});

test("dealerOnTagging returns null when the block is absent or malformed", () => {
  assert.equal(dealerOnTagging("<html></html>"), null);
  assert.equal(dealerOnTagging(`<script id="dealeron_tagging_data">{not json}</script>`), null);
});

// BMW of Spokane (diagnosed 2026-08-20): its SRP tags itself pageType:"custom"
// instead of "itemlist" but still carries a real dealerId/pageId — the API
// path should still engage rather than falling back to the slow HTML walk.
test("dealerOnTagging accepts a custom-tagged SRP that carries real ids", () => {
  const customSrp = `<script id="dealeron_tagging_data" type="application/json">{"dealerId":"25890","pageId":3160807,"pageType":"custom","items":["3GYK3EM50TS160759"]}</script>`;
  assert.deepEqual(dealerOnTagging(customSrp), { dealerId: "25890", pageId: "3160807" });
});

test("dealerOnTagging still rejects a custom page missing dealerId or pageId", () => {
  const noIds = `<script id="dealeron_tagging_data" type="application/json">{"pageType":"custom"}</script>`;
  assert.equal(dealerOnTagging(noIds), null);
  const noPageId = `<script id="dealeron_tagging_data" type="application/json">{"dealerId":"25890","pageType":"custom"}</script>`;
  assert.equal(dealerOnTagging(noPageId), null);
  const noDealerId = `<script id="dealeron_tagging_data" type="application/json">{"pageId":3160807,"pageType":"custom"}</script>`;
  assert.equal(dealerOnTagging(noDealerId), null);
});

test("dealerOnTagging still rejects other non-SRP pageTypes even with ids present", () => {
  const other = `<script id="dealeron_tagging_data" type="application/json">{"dealerId":"25890","pageId":3160807,"pageType":"home"}</script>`;
  assert.equal(dealerOnTagging(other), null);
});

test("priceFromLibrary prefers the calc_INTERNET PRICE line", () => {
  // 54083 = selling 53998 + doc fee 85; the number the VDP JSON-LD published.
  assert.equal(priceFromLibrary(CARD.VehiclePriceLibrary), 54083);
});

test("priceFromLibrary falls back through selling price then MSRP", () => {
  assert.equal(priceFromLibrary(b64("MSRP:41000.0;Selling Price:39500.0")), 39500);
  assert.equal(priceFromLibrary(b64("MSRP:41000.0")), 41000);
});

test("priceFromLibrary is undefined for junk or an absent library", () => {
  assert.equal(priceFromLibrary(""), undefined);
  assert.equal(priceFromLibrary(undefined), undefined);
  assert.equal(priceFromLibrary(b64("dealer_fee:85.0")), undefined);
});

test("vehicleNode carries price, mileage, trim and an absolute VDP + photos", () => {
  const node = vehicleNode(CARD, ORIGIN);
  const rec = normalize(node, { sourceUrl: node.offers.url, dealerDomain: "dublinchevrolet.com" });
  assert.equal(rec.priceUsd, 54083);
  assert.equal(rec.mileage, 3083);
  assert.equal(rec.trim, "Sport");
  assert.equal(rec.vin, "3GYK3EM50TS160759");
  assert.equal(rec.vdpUrl, "https://www.dublinchevrolet.com/used-Dublin-2026-Cadillac-OPTIQ-Sport-3GYK3EM50TS160759");
  assert.equal(rec.images[0], "https://www.dublinchevrolet.com/inventoryphotos/20214/x/ip/1.jpg");
});

test("vehicleNode classifies a Cadillac OPTIQ as a BEV on its declared fuel", () => {
  assert.deepEqual(classifyEv(vehicleNode(CARD, ORIGIN)), { isEv: true, kind: "BEV", confidence: "high" });
});

test("a Gas/Electric Hybrid card is not admitted as an EV on the fuel field", () => {
  // The card is an OPTIQ, a known BEV nameplate: a hybrid fuel string no
  // longer refutes it outright (since 2026-08-23 it falls through to the
  // nameplate check, because "Hybrid" is also what dealer.com prints on a
  // Wrangler 4xe). What it must never do is admit the car at high confidence
  // on that fuel text — vPIC has to settle it.
  const node = vehicleNode({ ...CARD, VehicleFuelType: "Gas/Electric Hybrid" }, ORIGIN);
  assert.notEqual(classifyEv(node).confidence, "high");
  // And with no EV nameplate to ask about, a hybrid is simply not an EV.
  const crv = vehicleNode({ ...CARD, VehicleMake: "Honda", VehicleModel: "CR-V Hybrid", VehicleFuelType: "Gas/Electric Hybrid" }, ORIGIN);
  assert.equal(classifyEv(crv).isEv, false);
});

test("vehicleNode recovers the VIN from the image carousel when the card field is blank", () => {
  const node = vehicleNode({ ...CARD, VehicleVin: null }, ORIGIN);
  assert.equal(node.vehicleIdentificationNumber, "3GYK3EM50TS160759");
});

test("a card with no valid VIN anywhere maps to null", () => {
  const blank = { ...CARD, VehicleVin: null, VehicleImageModel: {} };
  assert.equal(vehicleNode(blank, ORIGIN), null);
});

// The dealer's own writeup. This lane dropped it until 2026-08-27, and
// migration 0024's buyback_disclosed is computed from payload->>'description'
// — so on every DealerOn rooftop that column was testing a field nothing
// filled. Dennis Sneed Ford (sneedford.com) resells Ford's Manufacturer
// Buy-Back programme: all 25 of its F-150 Lightnings disclose it in these
// comments, and 21 of them were live here as ordinary used trucks.
const SNEED_COMMENTS =
  "2023 FORD F-150 LIGHTNING LARIAT EXTENDED-RANGE POWER BUILT FOR THE ROAD! " +
  "EQUIPMENT GROUP 511A, LARIAT LIGHTNING SERIES. ORIGINAL MSRP $88,224. WE SHIP " +
  "NATIONWIDE. PART OF FORDS REACQUIRED VEHICLE BRANDED PROGRAM AND COMES WITH A " +
  "12 MONTH 12,000 MILE SPECIAL FORD MOTOR COMPANY FACTORY LIMITED BUMPER TO " +
  "BUMPER WARRANTY.";

test("vehicleNode carries the card's dealer comments as the description", () => {
  const node = vehicleNode({ ...CARD, VehicleComments: SNEED_COMMENTS }, ORIGIN);
  assert.equal(node.description, SNEED_COMMENTS);
  // And it survives into the normalized record, which is what reaches the
  // payload the generated column reads.
  const rec = normalize(node, { sourceUrl: node.offers.url, dealerDomain: "sneedford.com" });
  assert.match(rec.description, /reacquired vehicle/i);
});

test("no comments is no description, not an empty string", () => {
  // An empty description in the payload would be a claim that the dealer
  // wrote nothing; absent is the honest shape, and it is what payload_public
  // (migration 0042) keys its NULL on.
  for (const v of [undefined, null, "", "   "]) {
    assert.equal(vehicleNode({ ...CARD, VehicleComments: v }, ORIGIN).description, undefined);
  }
});

test("ShowComments false does not hide a disclosure", () => {
  // ShowComments toggles the SRP card's comments block, not whether the
  // dealer published the text: the VDP renders it either way and its own
  // JSON-LD carries the identical string. Gating on it would have kept the
  // Sneed buybacks invisible on a display preference.
  const node = vehicleNode({ ...CARD, ShowComments: false, VehicleComments: SNEED_COMMENTS }, ORIGIN);
  assert.match(node.description, /reacquired vehicle/i);
});
