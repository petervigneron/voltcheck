import { test } from "node:test";
import assert from "node:assert/strict";
import { extractMicrodataVehicles, extractVehicles } from "../lib/jsonld.mjs";
import { classifyEv } from "../lib/ev.mjs";
import { normalize } from "../lib/normalize.mjs";

// A trimmed but structurally faithful schema.org Vehicle microdata card, shaped
// the way AutoFunds/DealerClick render it: itemprop=name wrapped in the VDP
// anchor, a nested itemCondition scope carrying a schema.org enum URL first, and
// the offer price as an itemprop.
const card = ({ vin, year, make, model, trim, price, vdp, fuel }) => `
<div itemscope itemtype="http://schema.org/Vehicle">
  <a class="listitemlink" title="Used ${year} ${make} ${model}" href="${vdp}">
    <span itemprop="name">
      <span itemprop="itemCondition" itemscope itemtype="https://schema.org/OfferItemCondition">
        <link itemprop="url" href="https://schema.org/UsedCondition">Used</span>
      <span itemprop="vehicleModelDate">${year}</span>
      <span itemprop="manufacturer">${make}</span>
      <span itemprop="model">${model}</span>
      <span itemprop="vehicleConfiguration">${trim}</span>
    </span>
  </a>
  <span itemprop="vehicleIdentificationNumber">${vin}</span>
  <span itemprop="mileageFromOdometer">42,000</span>
  ${fuel ? `<span itemprop="vehicleEngine" itemscope itemtype="http://schema.org/EngineSpecification"><span itemprop="fuelType">${fuel}</span></span>` : ""}
  <div itemprop="offers" itemscope itemtype="http://schema.org/Offer">
    <span itemprop="priceCurrency" content="USD"></span>
    <span itemprop="price" content="${price}">$${price}</span>
  </div>
</div>`;

const PAGE = `<html><body>
${card({ vin: "5YJ3E1EB5KF193393", year: 2019, make: "Tesla", model: "Model 3", trim: "Long Range", price: 25995, vdp: "https://dealer.test/2019-Tesla-Model-3/abc", fuel: "Electric" })}
${card({ vin: "1HGCR2F79GA126544", year: 2016, make: "Honda", model: "Accord", trim: "EX", price: 14950, vdp: "https://dealer.test/2016-Honda-Accord/def" })}
</body></html>`;

test("extractMicrodataVehicles reads schema.org Vehicle microdata", () => {
  const vs = extractMicrodataVehicles(PAGE);
  assert.equal(vs.length, 2);
  const tesla = vs.find((v) => v.vehicleIdentificationNumber === "5YJ3E1EB5KF193393");
  assert.ok(tesla);
  assert.equal(tesla.vehicleModelDate, "2019");
  assert.equal(tesla.manufacturer, "Tesla");
  assert.equal(tesla.model, "Model 3");
  assert.equal(tesla.offers.price, 25995);
  assert.equal(tesla.mileageFromOdometer.value, 42000);
});

test("the VDP url is the vehicle's anchor, not the schema.org condition enum", () => {
  const [tesla] = extractMicrodataVehicles(PAGE).filter((v) => v.vehicleIdentificationNumber === "5YJ3E1EB5KF193393");
  // The nested itemCondition scope's <link itemprop=url href=schema.org/...>
  // must not win over the card's own detail link.
  assert.equal(tesla.offers.url, "https://dealer.test/2019-Tesla-Model-3/abc");
});

test("microdata nodes normalize and classify like JSON-LD ones", () => {
  const vs = extractMicrodataVehicles(PAGE);
  const evs = vs.filter((v) => classifyEv(v).isEv);
  assert.equal(evs.length, 1); // the Tesla (WMI + fuelType), not the Accord
  assert.equal(evs[0].vehicleIdentificationNumber, "5YJ3E1EB5KF193393");
  const rec = normalize(evs[0], { sourceUrl: "x", dealerDomain: "dealer.test" });
  assert.equal(rec.make, "Tesla");
  assert.equal(rec.priceUsd, 25995);
  assert.equal(rec.vdpUrl, "https://dealer.test/2019-Tesla-Model-3/abc");
});

test("a JSON-LD-only page is untouched by the microdata reader (no double-count)", () => {
  const jsonld = `<html><script type="application/ld+json">
    {"@type":"Vehicle","vehicleIdentificationNumber":"5YJ3E1EB5KF193393","offers":{"@type":"Offer","price":25995}}
    </script></html>`;
  assert.equal(extractMicrodataVehicles(jsonld).length, 0);
  assert.equal(extractVehicles(jsonld).length, 1);
});
