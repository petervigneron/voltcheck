import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isOverfuel,
  overfuelSeeds,
  overfuelVehicles,
  overfuelNextPageUrl,
} from "../lib/platforms/overfuel.mjs";
import { classifyEv } from "../lib/ev.mjs";

// A trimmed but structurally faithful Overfuel SRP: the asset host, a nav link
// to the per-rooftop search slug, rel=next pagination, and an ItemList whose
// items are ListItem→Product with the VIN embedded in the VDP url slug.
const SRP = `<!doctype html><html><head>
<link rel="canonical" href="https://www.712autosales.com/used-cars-albuquerque-nm"/>
<link rel="next" href="https://www.712autosales.com/used-cars-albuquerque-nm/page/2"/>
</head><body>
<img src="https://static.overfuel.com/dealers/712-auto-sales/image/logo.webp"/>
<a href="/used-cars-albuquerque-nm">Used</a>
<a href="/used-cars-albuquerque-nm/page/2">2</a>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"ItemList","numberOfItems":2,"itemListElement":[
 {"@type":"ListItem","position":1,"item":{"@type":"Product","name":"2023 RIVIAN R1S ADVENTURE","url":"https://www.712autosales.com/inventory/used-2023-rivian-r1s-adventure-7PDSGABA3PN029885-in-albuquerque-nm","image":"https://static.overfuel.com/photos/a.webp","offers":{"@type":"Offer","price":"69995","priceCurrency":"USD"}}},
 {"@type":"ListItem","position":2,"item":{"@type":"Product","name":"2016 HONDA ACCORD EX","url":"https://www.712autosales.com/inventory/used-2016-honda-accord-ex-1HGCR2F79GA126544-in-albuquerque-nm","offers":{"@type":"Offer","price":"14950","priceCurrency":"USD"}}}
]}
</script></body></html>`;

const ORIGIN = "https://www.712autosales.com/";

test("isOverfuel fires on the asset host, not on arbitrary pages", () => {
  assert.equal(isOverfuel(SRP), true);
  assert.equal(isOverfuel("<html><body>a dealer.com page</body></html>"), false);
  assert.equal(isOverfuel(undefined), false);
});

test("overfuelSeeds reads the rooftop SRP slug and skips /page/N", () => {
  const seeds = overfuelSeeds(SRP, ORIGIN);
  assert.deepEqual(seeds, ["https://www.712autosales.com/used-cars-albuquerque-nm"]);
});

test("overfuelNextPageUrl follows rel=next", () => {
  assert.equal(
    overfuelNextPageUrl(SRP, "https://www.712autosales.com/used-cars-albuquerque-nm"),
    "https://www.712autosales.com/used-cars-albuquerque-nm/page/2"
  );
  assert.equal(overfuelNextPageUrl("<html>no next</html>", ORIGIN), null);
});

test("overfuelVehicles lifts VIN-from-slug, year, make and price from each Product", () => {
  const vs = overfuelVehicles(SRP, "https://www.712autosales.com/used-cars-albuquerque-nm");
  assert.equal(vs.length, 2);
  const rivian = vs.find((v) => v.vehicleIdentificationNumber === "7PDSGABA3PN029885");
  assert.ok(rivian, "Rivian VIN recovered from the url slug");
  assert.equal(rivian.vehicleModelDate, "2023");
  assert.equal(rivian.brand, "RIVIAN");
  assert.equal(rivian.offers.price, 69995);
  assert.equal(
    rivian.offers.url,
    "https://www.712autosales.com/inventory/used-2023-rivian-r1s-adventure-7PDSGABA3PN029885-in-albuquerque-nm"
  );
});

test("the EV among the Products classifies; the ICE does not", () => {
  const vs = overfuelVehicles(SRP, ORIGIN);
  const evs = vs.filter((v) => classifyEv(v).isEv);
  assert.equal(evs.length, 1);
  assert.equal(evs[0].vehicleIdentificationNumber, "7PDSGABA3PN029885");
});

test("a page without the Overfuel asset host yields nothing", () => {
  // Same ItemList markup, no overfuel host — must not be mistaken for Overfuel.
  const foreign = SRP.replace(/static\.overfuel\.com/g, "cdn.example.com");
  assert.deepEqual(overfuelVehicles(foreign, ORIGIN), []);
});
