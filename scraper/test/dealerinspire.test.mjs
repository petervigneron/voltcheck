import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isDealerInspire,
  dealerInspireCards,
  dealerInspireNextUrl,
  dealerInspireIsCandidate,
  dealerInspireVdpVehicle,
  dealerInspireSrpUrl,
} from "../lib/platforms/dealerinspire.mjs";

// Card markup as served on faricykia.com/used-vehicles/ 2026-09-02, trimmed
// to the marks the lane reads.
const SRP = `<html><body>
<div class="hit-content" data-testid="vehicle-card-grid-view">
  <a href="http://www.faricykia.com/inventory/used-2010-ford-focus-se-front-wheel-drive-4-door-sedan-1fahp3fn9aw282033/">Pre-Owned 2010 Ford Focus SE</a>
  <div class="vin-row vin" data-testid="vin-number" data-vin="1FAHP3FN9AW282033">VIN: 1FAHP3FN9AW282033</div>
  <div class="price">Selling Price $5,303 Delivery &amp; Handling $695 Faricy Sales Price $5,998</div>
</div>
<div class="hit-content">
  <a href="/inventory/used-2023-hyundai-ioniq-5-sel-all-wheel-drive-km8kndaf5pu123456/">Pre-Owned 2023 Hyundai IONIQ 5 SEL</a>
  <div class="vin-row vin" data-vin="KM8KNDAF5PU123456"></div>
</div>
<div class="hit-content">
  <a href="/inventory/used-2022-tesla-model-3-long-range-5yjsa1e29mf427349/">Pre-Owned 2022 Tesla Model 3</a>
  <div class="vin-row vin" data-vin="5YJSA1E29MF427349"></div>
  <div class="vin-row vin" data-vin="5YJSA1E29MF427349"></div>
</div>
<a href="/used-vehicles/?_p=2">Next</a>
</body></html>`;

test("isDealerInspire keys on the vendor's own hosts or theme, never the word", () => {
  assert.ok(isDealerInspire('<link href="https://www.x.com/wp-content/themes/DealerInspireDealerTheme/css/lvrp.css">'));
  assert.ok(isDealerInspire('<img src="https://vehicle-images.carscommerce.inc/ed41/x.webp">'));
  assert.ok(isDealerInspire('<script src="https://assets.dealerinspire.com/x.js">'));
  assert.equal(isDealerInspire("Powered by Dealer Inspire"), false);
  assert.equal(isDealerInspire("a dealer named inspire motors, dealerinspire in prose"), false);
});

test("cards: VIN from data-vin, VDP href by VIN slug, title from the slug, deduped", () => {
  const cards = dealerInspireCards(SRP, "https://www.faricykia.com/used-vehicles/");
  assert.equal(cards.length, 3);
  assert.equal(cards[0].vin, "1FAHP3FN9AW282033");
  assert.equal(cards[0].url, "http://www.faricykia.com/inventory/used-2010-ford-focus-se-front-wheel-drive-4-door-sedan-1fahp3fn9aw282033/");
  assert.equal(cards[0].title, "used 2010 ford focus se front wheel drive 4 door sedan");
  assert.equal(cards[1].url, "https://www.faricykia.com/inventory/used-2023-hyundai-ioniq-5-sel-all-wheel-drive-km8kndaf5pu123456/");
  assert.equal(cards[2].vin, "5YJSA1E29MF427349");
});

test("candidacy: EV-only WMI or an EV word; the Focus is never read", () => {
  const cards = dealerInspireCards(SRP, "https://www.faricykia.com/");
  assert.deepEqual(cards.map(dealerInspireIsCandidate), [false, true, true]);
});

test("pager: ?_p=N+1 present → next url; absent → last page", () => {
  assert.equal(dealerInspireNextUrl(SRP, "https://www.faricykia.com/used-vehicles/"), "https://www.faricykia.com/used-vehicles/?_p=2");
  assert.equal(dealerInspireNextUrl(SRP, "https://www.faricykia.com/used-vehicles/?_p=2"), null); // no _p=3 link
  assert.equal(dealerInspireNextUrl("<html></html>", "https://www.faricykia.com/used-vehicles/"), null);
  assert.equal(dealerInspireSrpUrl("https://www.faricykia.com/", "/new-vehicles/", 3), "https://www.faricykia.com/new-vehicles/?_p=3");
});

test("VDP: the Product+Car node for this VIN, and only this VIN", () => {
  const vdp = `<script type="application/ld+json">{"@context":"https://schema.org/","@type":["Product","Car"],"@id":"AW282033","name":"Pre-Owned 2010 Ford Focus SE","vehicleIdentificationNumber":"1FAHP3FN9AW282033","fuelType":"Gasoline Fuel","vehicleModelDate":"2010","brand":{"@type":"Brand","name":"Ford"},"model":"Focus","mileageFromOdometer":{"@type":"QuantitativeValue","value":"134147","unitCode":"SMI"},"offers":{"@type":"Offer","url":"https://www.faricykia.com/inventory/used-2010-ford-focus-se-front-wheel-drive-4-door-sedan-1fahp3fn9aw282033/","priceCurrency":"USD","price":"5998","itemCondition":"https://schema.org/UsedCondition","availability":"https://schema.org/InStock"}}</script>`;
  const v = dealerInspireVdpVehicle(vdp, "1FAHP3FN9AW282033");
  assert.equal(v.offers.price, "5998");
  assert.equal(v.mileageFromOdometer.value, "134147");
  assert.equal(dealerInspireVdpVehicle(vdp, "KM8KNDAF5PU123456"), null);
});

test("cards without data-vin are read off the VDP hrefs (the second classic markup)", () => {
  const html = `<div class="vehicle"><a href="https://www.tonkinchevrolet.com/inventory/used-2023-chevrolet-bolt-euv-lt-front-wheel-drive-1G1FY6S06P4123456/">2023 Bolt EUV</a>
  <a href="/inventory/used-2023-chevrolet-bolt-euv-lt-front-wheel-drive-1G1FY6S06P4123456/#photos">photos</a></div>
  <a href="/inventory/used-2019-ford-f-150-xlt-1FTEW1EP5KFA00001/">F-150</a> <a href="/inventory/new-vehicles/">all new</a>`;
  const cards = dealerInspireCards(html, "https://www.tonkinchevrolet.com/used-vehicles/");
  assert.deepEqual(cards.map((c) => c.vin), ["1G1FY6S06P4123456", "1FTEW1EP5KFA00001"]);
  assert.equal(cards[0].url, "https://www.tonkinchevrolet.com/inventory/used-2023-chevrolet-bolt-euv-lt-front-wheel-drive-1G1FY6S06P4123456/");
  assert.equal(dealerInspireIsCandidate(cards[0]), true);
  assert.equal(dealerInspireIsCandidate(cards[1]), false);
});
