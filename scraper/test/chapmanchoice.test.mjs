import { test } from "node:test";
import assert from "node:assert/strict";
import { isChapmanChoice, isChapmanChoiceOrigin, chapmanChoiceEntries, chapmanChoiceCandidates, chapmanChoiceVdpVehicle } from "../lib/platforms/chapmanchoice.mjs";
import { normalize } from "../lib/normalize.mjs";
import { classifyEv } from "../lib/ev.mjs";

const SITEMAP = `<urlset><url><loc>https://www.chapmanaz.com/</loc></url>
<url><loc>https://www.chapmanaz.com/detail/cpo/2014/Chevrolet/Silverado%2B1500/G9857AA/CYC</loc></url>
<url><loc>https://www.chapmanaz.com/detail/used/2016/Mitsubishi/i-MiEV/A2670307/CAO</loc></url>
<url><loc>https://www.chapmanaz.com/detail/used/2016/Mitsubishi/i-MiEV/A2670307/CAO</loc></url>
<url><loc>https://www.chapmanaz.com/detail/new/2026/Hyundai/IONIQ%2B5/H12345/CAS</loc></url></urlset>`;
// The Car node as served on the i-MiEV page 2026-09-02 (trimmed).
const VDP = `<script type="application/ld+json">{"@context":"https://schema.org","@type":"Car","vehicleEngine":{"@type":"EngineSpecification","fuelType":"Electric"},"vehicleIdentificationNumber":"JA3215H40GU000317","vehicleModelDate":"2016","brand":"Mitsubishi","itemCondition":"UsedCondition","model":"i-MiEV","name":"2016 Mitsubishi i-MiEV ES","url":"https://www.chapmanaz.com/detail/used/2016/Mitsubishi/i-MiEV/A2670307/CAO","offers":{"@type":"Offer","availability":"InStock","priceCurrency":"USD","price":8588,"offeredBy":{"@type":"AutomotiveBusiness","name":"Chapman AZ","address":{"@type":"PostalAddress","addressLocality":"Tucson","addressRegion":"AZ","postalCode":"85711"}}},"mileageFromOdometer":{"@type":"QuantitativeValue","unitCode":"SMI","value":27567}}</script>`;

test("isChapmanChoice keys on the chapmanchoice.com asset hosts", () => {
  assert.ok(isChapmanChoice('<img src="https://photos.chapmanchoice.com/vehicles/CAO/640/x.jpg">'));
  assert.equal(isChapmanChoice("Chapman Automotive Group"), false);
  assert.ok(isChapmanChoiceOrigin("https://www.chapmanaz.com"));
  assert.equal(isChapmanChoiceOrigin("https://www.chapmanlasvegas.com"), false);
});

test("sitemap entries: one per stock+store, decoded make/model, condition from the path", () => {
  const e = chapmanChoiceEntries(SITEMAP);
  assert.equal(e.length, 3);
  assert.deepEqual(e[0], { url: "https://www.chapmanaz.com/detail/cpo/2014/Chevrolet/Silverado%2B1500/G9857AA/CYC", cond: "cpo", year: "2014", make: "Chevrolet", model: "Silverado 1500", stock: "G9857AA", store: "CYC", name: "2014 Chevrolet Silverado 1500" });
  assert.deepEqual(chapmanChoiceCandidates(e).map((x) => x.stock), ["A2670307", "H12345"]);
});

test("VDP: the Car node for the stock asked for, offeredBy exposed as seller, price = the page's Total Price", () => {
  const v = chapmanChoiceVdpVehicle(VDP, { stock: "A2670307", origin: "https://www.chapmanaz.com" });
  assert.equal(v.vehicleIdentificationNumber, "JA3215H40GU000317");
  assert.equal(chapmanChoiceVdpVehicle(VDP, { stock: "OTHER", origin: "https://www.chapmanaz.com" }), null);
  const rec = normalize(v, { sourceUrl: v.url, dealerDomain: "chapmanaz.com" });
  assert.equal(rec.priceUsd, 8588);
  assert.equal(rec.priceProvenance, "jsonld");
  assert.equal(rec.city, "Tucson");
  assert.equal(rec.state, "AZ");
  assert.equal(rec.mileage, 27567);
  assert.equal(rec.condition, "UsedCondition");
  assert.equal(classifyEv(v).isEv, true);
});
