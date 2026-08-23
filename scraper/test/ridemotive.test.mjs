import { test } from "node:test";
import assert from "node:assert/strict";
import { isRideMotive, rideMotiveConfig, apiVehicleNode, vdpPath } from "../lib/platforms/ridemotive.mjs";
import { classifyEv } from "../lib/ev.mjs";
import { normalize } from "../lib/normalize.mjs";
import { MOTIVE_PRICE, isProvenance } from "../lib/price-provenance.mjs";

// A trimmed but structurally faithful Motive homepage. The config appears
// twice on a real page — once as JSON in a <script>, once backslash-escaped
// inside the RSC flight payload — so both forms are here.
const HOME = `<!doctype html><html><head>
<link href="https://images.app.ridemotive.com/qhcpzgngbc5zt0x3h39cdnxtyimp" rel="shortcut icon"/>
<style>--srp-lizard-image-url:url("https://assets.app.ridemotive.com/tumble-weed.svg")</style>
</head><body>
<script>self.__next_f.push([1,"{\\"env\\":{\\"ALGOLIA_APP_ID\\":\\"G58LKO3ETJ\\",\\"ALGOLIA_API_KEY\\":\\"cc3dce06acb2d9fc715bc10c9a624d80\\",\\"ALGOLIA_INVENTORY_INDEX\\":\\"production-inventory-\\",\\"API_URL\\":\\"https://api.app.ridemotive.com\\",\\"IMAGE_BASE_URL\\":\\"https://images.app.ridemotive.com\\"},\\"analyticsTags\\":[{\\"id\\":6519,\\"dealer_id\\":9999}],\\"is_group\\":true,\\"child_ids\\":[2970],\\"dealer\\":{\\"id\\":2766,\\"name\\":\\"Rusty Drewing Pre-Owned\\",\\"domain\\":\\"rustydrewingpreowned.com\\"}}"])</script>
</body></html>`;

// One record, field-for-field as the live index serves it (2026-08-23).
const REC = {
  vin: "WBY43HD08SFU66131",
  car_condition: "Used",
  car_trim: "xDrive40",
  make: "BMW",
  model: "i4",
  make_year: 2025,
  fuel_type: "Electric",
  standardized_fuel_type: "Electric",
  odometer: 4484,
  price: 55286,
  feed_price: 54987,
  msrp: null,
  cpo: true,
  oem_certified: false,
  exterior_color: "Black Sapphire Metallic",
  interior_color: "Cognac",
  drivetrain: "AWD",
  stock_number: "BU3385",
  dealership: "Rusty Drewing Pre-Owned",
  images: ["zamf8ocw2m2502s5dav4z8gt5262", "rp7m8e6ykqrtxm8kaiqgnmkwczn9"],
};

const ORIGIN = "https://rustydrewingpreowned.com";

test("isRideMotive fires on the platform's app hosts, not on the word motive", () => {
  assert.equal(isRideMotive(HOME), true);
  assert.equal(isRideMotive('<html>Motive Auto Group | ridemotive is our vendor</html>'), false);
  assert.equal(isRideMotive(undefined), false);
});

test("rideMotiveConfig reads the Algolia client config and the rooftop's own dealer id", () => {
  const cfg = rideMotiveConfig(HOME);
  assert.equal(cfg.appId, "G58LKO3ETJ");
  assert.equal(cfg.apiKey, "cc3dce06acb2d9fc715bc10c9a624d80");
  assert.equal(cfg.index, "production-inventory-global_make_year_desc");
  // Not 9999 (an analytics tag's dealer_id) and not 2970 (a child rooftop):
  // both are in the payload, and only the `dealer` block is this site.
  assert.equal(cfg.dealerId, 2766);
  assert.equal(cfg.dealerDomain, "rustydrewingpreowned.com");
});

test("rideMotiveConfig returns null rather than build a request from junk", () => {
  assert.equal(rideMotiveConfig("<html>not a motive site</html>"), null);
  // A page that names the platform but carries no dealer id is not pullable.
  assert.equal(rideMotiveConfig('<html><img src="https://images.app.ridemotive.com/x"></html>'), null);
  // An app id that could steer the hostname is refused outright.
  const evil = HOME.replace("G58LKO3ETJ", "evil.example.com/");
  assert.equal(rideMotiveConfig(evil), null);
  const evilKey = HOME.replace("cc3dce06acb2d9fc715bc10c9a624d80", "../../admin");
  assert.equal(rideMotiveConfig(evilKey), null);
});

test("vdpPath builds the site's own canonical slug, hyphen in the make preserved", () => {
  assert.equal(vdpPath(REC), "/inventory/Used-2025-BMW-i4-xDrive40-WBY43HD08SFU66131");
  // Every character that is not a letter, digit or hyphen becomes "_" —
  // measured against the site's own 308 target for the noisiest trim in a lot.
  assert.equal(
    vdpPath({ ...REC, vin: "KMHL64JA8PA251763", make: "Hyundai", model: "Sonata", car_trim: "SEL 2.5L *Ltd Avail*", make_year: 2023 }),
    "/inventory/Used-2023-Hyundai-Sonata-SEL_2_5L__Ltd_Avail_-KMHL64JA8PA251763",
  );
  // A missing component falls back to the VIN path, which the site 308s to
  // the canonical slug — a real URL, not a guess at one.
  assert.equal(vdpPath({ ...REC, car_trim: "" }), "/inventory/WBY43HD08SFU66131");
  assert.equal(vdpPath({ ...REC, vin: "U62T1112886" }), null); // a UTV serial is not a VIN
});

test("apiVehicleNode carries the dealer's own fuel string and nothing pre-judged", () => {
  const node = apiVehicleNode(REC, ORIGIN);
  assert.equal(node.fuelType, "Electric");
  assert.equal(node.vehicleEngine.fuelType, "Electric");
  assert.deepEqual(classifyEv(node), { isEv: true, kind: "BEV", confidence: "high" });
  // A hybrid stays a hybrid: the rolled-up standardized_fuel_type says
  // "Electric" for these records and is deliberately not read.
  const hev = apiVehicleNode({ ...REC, fuel_type: "HEV", standardized_fuel_type: "Electric", model: "Camry" }, ORIGIN);
  assert.equal(hev.fuelType, "HEV");
  assert.equal(classifyEv(hev).isEv, false);
});

test("apiVehicleNode takes the final price, never the pre-fee feed_price", () => {
  const node = apiVehicleNode(REC, ORIGIN);
  assert.equal(node.offers.price, 55286);
  assert.equal(node.offers.priceProvenance, MOTIVE_PRICE);
  assert.equal(isProvenance(MOTIVE_PRICE), true);
  // "Call for price" is an abstention, not a zero.
  assert.equal(apiVehicleNode({ ...REC, price: 0 }, ORIGIN).offers.price, undefined);
  assert.equal(apiVehicleNode({ ...REC, price: null }, ORIGIN).offers.price, undefined);
});

test("apiVehicleNode reads condition as a token and certification only from the CPO flag", () => {
  assert.equal(apiVehicleNode(REC, ORIGIN).itemCondition, "used");
  assert.equal(apiVehicleNode(REC, ORIGIN).certified, true);
  assert.equal(apiVehicleNode({ ...REC, cpo: false, oem_certified: false }, ORIGIN).certified, undefined);
  assert.equal(apiVehicleNode({ ...REC, car_condition: "New", odometer: 0 }, ORIGIN).itemCondition, "new");
  // An unrecognised value is not a "used" claim.
  assert.equal(apiVehicleNode({ ...REC, car_condition: "" }, ORIGIN).itemCondition, undefined);
});

test("apiVehicleNode normalizes into the record the pipeline stores", () => {
  const node = apiVehicleNode(REC, ORIGIN);
  const rec = normalize(node, { sourceUrl: node.offers.url, dealerDomain: "rustydrewingpreowned.com" });
  assert.equal(rec.vin, "WBY43HD08SFU66131");
  assert.equal(rec.year, 2025);
  assert.equal(rec.make, "BMW");
  assert.equal(rec.model, "i4");
  assert.equal(rec.trim, "xDrive40");
  assert.equal(rec.mileage, 4484);
  assert.equal(rec.priceUsd, 55286);
  assert.equal(rec.priceProvenance, MOTIVE_PRICE);
  assert.equal(rec.driveLine, "AWD");
  assert.equal(rec.stockNumber, "BU3385");
  assert.equal(rec.vdpUrl, "https://rustydrewingpreowned.com/inventory/Used-2025-BMW-i4-xDrive40-WBY43HD08SFU66131");
  assert.deepEqual(rec.images, [
    "https://images.app.ridemotive.com/zamf8ocw2m2502s5dav4z8gt5262",
    "https://images.app.ridemotive.com/rp7m8e6ykqrtxm8kaiqgnmkwczn9",
  ]);
});

test("apiVehicleNode refuses an image base that is not the platform's CDN", () => {
  const node = apiVehicleNode(REC, ORIGIN, "https://evil.example.com");
  assert.equal(node.image[0], "https://images.app.ridemotive.com/zamf8ocw2m2502s5dav4z8gt5262");
});
