import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isDealerClick,
  dealerClickSeeds,
  dealerClickItemLists,
  dealerClickVehicles,
} from "../lib/platforms/dealerclick.mjs";
import { fingerprint } from "../lib/fingerprint.mjs";

// The flight-stream shape, trimmed from blueridgemotorworks.com/inventory and
// donjoseautosales.com/inventory (2026-08-31): the page's ItemList JSON-LD
// arrives escaped inside self.__next_f.push([1,"…"]).
const MARK = '<img src="https://www.dealernetwork.com/images/inventory/2361/2367/WBA7E4C36HGV23360-0.jpg">';

const flight = (json) =>
  `<script>self.__next_f.push([1,${JSON.stringify(json)}])</script>`;

const list = (cars) =>
  JSON.stringify(
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: "Vehicle Inventory",
      itemListElement: cars.map((c, i) => ({ "@type": "ListItem", position: i + 1, item: c })),
    },
    null,
    2,
  );

const car = (over = {}) => ({
  "@type": "Car",
  name: "2017 Bmw 7 Series 740i Xdrive",
  vehicleIdentificationNumber: "WBA7E4C36HGV23360",
  brand: "Bmw",
  model: "7 Series",
  vehicleModelDate: "2017",
  mileageFromOdometer: { "@type": "QuantitativeValue", value: 11360, unitCode: "SMI" },
  offers: {
    "@type": "Offer",
    price: 24995,
    priceCurrency: "USD",
    availability: "https://schema.org/InStock",
    itemCondition: "https://schema.org/UsedCondition",
  },
  url: "https://blueridgemotorworks.com/inventory/2017-bmw-7-series-wba7e4c36hgv23360",
  ...over,
});

const PAGE = "https://blueridgemotorworks.com/inventory";

test("fingerprinted on the vendor's hosts, never the brand word", () => {
  assert.ok(isDealerClick(MARK));
  assert.ok(isDealerClick('<link href="https://goroutes.dealerclick.com">'));
  assert.ok(isDealerClick('<img src="https://res.cloudinary.com/x/dealerclick/image/upload/v1/a.jpg">'));
  assert.equal(isDealerClick("<p>Powered by Dealer Click</p>"), false);
  assert.equal(fingerprint(MARK), "dealerclick");
});

test("the escaped ItemList parses out of the flight stream", () => {
  const html = MARK + flight("prefix junk " + list([car()]) + " suffix");
  const lists = dealerClickItemLists(html);
  assert.equal(lists.length, 1);
  const [v] = dealerClickVehicles(html, PAGE);
  assert.equal(v.vehicleIdentificationNumber, "WBA7E4C36HGV23360");
  assert.equal((Array.isArray(v.offers) ? v.offers[0] : v.offers).price, 24995);
  assert.equal((Array.isArray(v.offers) ? v.offers[0] : v.offers).url, v.url);
});

test("a vendor-misconfigured localhost url is rebased onto the fetched page", () => {
  // donjoseautosales publishes every url as https://localhost:3000/… .
  const html = MARK + flight(list([car({ url: "https://localhost:3000/inventory/2020-kia-optima-5xxgt4l3xlg424548", vehicleIdentificationNumber: "5XXGT4L3XLG424548" })]));
  const [v] = dealerClickVehicles(html, "https://donjoseautosales.com/inventory");
  assert.equal(v.url, "https://donjoseautosales.com/inventory/2020-kia-optima-5xxgt4l3xlg424548");
});

test("not-InStock and VIN-less nodes never become listings; dupes collapse", () => {
  const html =
    MARK +
    flight(
      list([
        car({ offers: { "@type": "Offer", price: 1, availability: "https://schema.org/SoldOut" } }),
        car({ vehicleIdentificationNumber: "NOTAVIN" }),
        car({ vehicleIdentificationNumber: "5XXGT4L3XLG424548" }),
        car({ vehicleIdentificationNumber: "5XXGT4L3XLG424548" }),
      ]),
    );
  const vs = dealerClickVehicles(html, PAGE);
  assert.equal(vs.length, 1);
  assert.equal(vs[0].vehicleIdentificationNumber, "5XXGT4L3XLG424548");
});

test("junk in, nothing out", () => {
  assert.deepEqual(dealerClickVehicles(undefined, PAGE), []);
  assert.deepEqual(dealerClickVehicles("<html>no marks</html>", PAGE), []);
  assert.deepEqual(dealerClickVehicles(MARK + flight("{broken json"), PAGE), []);
  assert.deepEqual(dealerClickSeeds("https://x.com/"), ["https://x.com/inventory"]);
});
