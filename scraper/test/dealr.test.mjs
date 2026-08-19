import { test } from "node:test";
import assert from "node:assert/strict";
import { isDealr, dealrCards } from "../lib/platforms/dealr.mjs";
import { classifyEv } from "../lib/ev.mjs";

// A trimmed but structurally faithful Dealr `list` (the JSON API's card HTML),
// stock theme: three cards — an EV (Recurrent + inquiry badge), an ICE (CarGurus
// badge), and a card carrying no VIN badge at all, which must be dropped.
const card = ({ slug, id, title, price, cgVin, dataVin, inquiry, mileage, engine }) => `
<div class="dealr-inventory-list__vehicle theme-border-radius theme-border-width-2 ">
  <a class="dealr-inventory-list__vehicle__photo-container" href="inventory/${slug}/${id}">
    <img src="https://cdn.dealrimages.com/AA/BB/CC/${id}.jpg?w=900" alt="${title}">
  </a>
  <div class="dealr-inventory-list__vehicle__container">
    <a class="dealr-inventory-vehicle__info__header" href="inventory/${slug}/${id}"><h2>${title}</h2></a>
    <div class="dealr-inventory-vehicle__info__details"><ul>
      <li><div class="dealr-inventory-vehicle__info__details__item__key">Mileage</div>
          <div class="dealr-inventory-vehicle__info__details__item__value">${mileage}</div></li>
      <li><div class="dealr-inventory-vehicle__info__details__item__key">Drivetrain</div>
          <div class="dealr-inventory-vehicle__info__details__item__value">AWD</div></li>
      <li><div class="dealr-inventory-vehicle__info__details__item__key">Engine</div>
          <div class="dealr-inventory-vehicle__info__details__item__value">${engine}</div></li>
    </ul></div>
    <div class="dealr-inventory-vehicle__price-and-badges">
      <a href="inventory/${slug}/${id}" class="dealr-inventory-vehicle__info__header__price dealr-inventory-price theme-font-extra-bold "> ${price} </a>
      ${cgVin ? `<span data-cg-vin="${cgVin}" data-cg-price="${String(price).replace(/[$,]/g, "")}" class="cargurus-badge"></span>` : ""}
      ${dataVin ? `<span class="recurrent_badge_container" data-vin="${dataVin}"></span>` : ""}
    </div>
    <div class="dealr-inventory-vehicle__cta-buttons">
      ${inquiry ? `<a href="#vehicleInquiryModal" vehicle-inquiry="${inquiry}">Inquire</a>` : ""}
    </div>
  </div>
</div>`;

const LIST = `<div>${[
  card({
    slug: "2024-kia-ev9-gt-line",
    id: "109958",
    title: "2024 Kia EV9 GT-Line",
    price: "$48,495",
    dataVin: "KNDAEFS54R6045180",
    inquiry: "KNDAEFS54R6045180|2024|Kia|EV9",
    mileage: "25,314",
    engine: "0cyl - 0.0L", // Dealr's EV engine string — NOT the word "Electric"
  }),
  card({
    slug: "2016-honda-accord-ex",
    id: "100200",
    title: "2016 Honda Accord EX",
    price: "$14,950",
    cgVin: "1HGCR2F79GA126544",
    mileage: "80,005",
    engine: "4cyl - 2.4L",
  }),
  card({
    slug: "2015-mystery-car",
    id: "100300",
    title: "2015 Mystery Car",
    price: "$5,000",
    mileage: "120,000",
    engine: "4cyl - 2.0L", // no cg-vin / data-vin / inquiry -> no VIN -> dropped
  }),
].join("\n")}</div>`;

test("isDealr fires on the platform markers, not on arbitrary pages", () => {
  assert.equal(isDealr('<script src="https://cdn.dealrcloud.com/x.js"></script>'), true);
  assert.equal(isDealr('<div class="dealr-inventory-list__vehicle theme">'), true);
  assert.equal(isDealr("<html><body>a dealer.com page</body></html>"), false);
  assert.equal(isDealr(undefined), false);
});

test("dealrCards parses stock-theme cards and drops the VIN-less one", () => {
  const cars = dealrCards(LIST, { origin: "https://www.example.com" });
  assert.equal(cars.length, 2, "the card with no VIN badge is skipped");

  const ev9 = cars.find((c) => c.vehicleIdentificationNumber === "KNDAEFS54R6045180");
  assert.ok(ev9);
  assert.equal(ev9.vehicleModelDate, "2024");
  assert.equal(ev9.brand, "Kia");
  assert.equal(ev9.model, "EV9");
  assert.equal(ev9.offers.price, 48495); // advertised price off the price anchor
  assert.equal(ev9.mileageFromOdometer.value, 25314);
  assert.equal(ev9.itemCondition, "used");
  assert.equal(ev9.offers.url, "https://www.example.com/inventory/2024-kia-ev9-gt-line/109958");
});

test("a Dealr EV engine string is passed through as spec text, never as fuelType", () => {
  const [ev9] = dealrCards(LIST, { origin: "https://www.example.com" }).filter(
    (c) => c.vehicleIdentificationNumber === "KNDAEFS54R6045180"
  );
  // "0cyl - 0.0L" must not be laundered into a fuelType of "Electric" — classifyEv
  // decides EV-ness from the nameplate/VIN, not from a zero-cylinder engine.
  assert.equal(ev9.vehicleEngine.name, "0cyl - 0.0L");
  assert.equal(ev9.vehicleEngine.fuelType, undefined);
});

test("the EV among the cards classifies; the ICE does not", () => {
  const cars = dealrCards(LIST, { origin: "https://www.example.com" });
  const evs = cars.filter((c) => classifyEv(c).isEv);
  assert.equal(evs.length, 1);
  assert.equal(evs[0].vehicleIdentificationNumber, "KNDAEFS54R6045180");
});

test("the CarGurus-badge card recovers its VIN and price with no inquiry attr", () => {
  const accord = dealrCards(LIST, { origin: "https://www.example.com" }).find(
    (c) => c.vehicleIdentificationNumber === "1HGCR2F79GA126544"
  );
  assert.ok(accord, "VIN read from data-cg-vin");
  assert.equal(accord.offers.price, 14950);
});

// Custom-theme fallback: no stock card container and no <h2> title — only the
// VDP-id link (slug), the price-container, and the inquiry attr. The theme-
// independent byId split must still recover a valid, classifiable node.
const CUSTOM = `<div>
  <div class="listing-card">
    <a href="inventory/2023-tesla-model-y-long-range/1151837"><img src="x.jpg"></a>
    <div class="price-container ">$29,995</div>
    <a href="#vehicleInquiryModal" vehicle-inquiry="7SAYGDEE0RF157653|2023|Tesla|Model Y">Inquire</a>
  </div>
  <div class="listing-card">
    <a href="inventory/2018-honda-civic-lx/1151999"><img src="y.jpg"></a>
    <div class="price-container ">$16,000</div>
    <a href="#vehicleInquiryModal" vehicle-inquiry="2HGFC2F5XJH000000|2018|Honda|Civic">Inquire</a>
  </div>
</div>`;

test("byId split handles a custom theme with no card container", () => {
  const cars = dealrCards(CUSTOM, { origin: "https://www.example.com", byId: true });
  assert.equal(cars.length, 2);
  const tesla = cars.find((c) => c.vehicleIdentificationNumber === "7SAYGDEE0RF157653");
  assert.ok(tesla);
  assert.equal(tesla.brand, "Tesla"); // from the inquiry attr
  assert.equal(tesla.model, "Model Y");
  assert.equal(tesla.offers.price, 29995); // from price-container
  assert.equal(tesla.offers.url, "https://www.example.com/inventory/2023-tesla-model-y-long-range/1151837");
  assert.equal(classifyEv(tesla).isEv, true); // Tesla WMI
});
