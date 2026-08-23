import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isAutoManager,
  autoManagerSeeds,
  autoManagerVehicles,
  autoManagerNextPageUrl,
  tilePrices,
} from "../lib/platforms/automanager.mjs";
import { classifyEv } from "../lib/ev.mjs";
import { normalize } from "../lib/normalize.mjs";
import { AUTOMANAGER_PRICE } from "../lib/price-provenance.mjs";

// A trimmed but structurally faithful AutoManager SRP: the asset host, the
// pager, and two tiles — one with the CarGurus badge disagreeing with the
// rendered price (the live crescentauto.net case), one priced "Call for
// Price" like every car on concoursnj.com.
const tile = (attrs, inner) =>
  `<div class="clearfix inventory-panel inv-fluid palette-bg2 vehicle lot-00" ${attrs}>${inner}</div>`;

const SRP = `<!doctype html><html><head>
<link href="https://automanagerprodcdn.azureedge.net/wmthemes/fluid/default.css" rel="stylesheet"/>
</head><body>
<div id="inv-list" class="grid-view">
${tile(
  `data-id="2da335a0bc82478291cd19df195290f4" data-displaytitle="2020 Kia Sportage LX SUV" data-displayprice="$" data-displaymake="Kia" data-displaytrim="LX" data-displaymodel="Sportage" data-displayyear="2020" data-displayengine="2.4L I4 181hp" data-displaytransmission="Automatic" data-displaymileage="147759" data-displayextcolor="White" data-displayintcolor="Black" data-displaydrivetrain="AWD" data-displayfuel="Gasoline" data-displayphoto="https://automanager.blob.core.windows.net/wmphotos/012532/a.jpg"`,
  `<a href="https://www.crescentauto.net/vehicle-details/2020-kia-sportage-lx-suv-2da335a0bc82478291cd19df195290f4">View</a>
   <div class="inventory-details"><div><span class="vin">KNDPMCAC5L7809535</span></div><div><span class="stocknumber">809535</span></div></div>
   <div class="pricelabel internetpricelabel">Internet Price</div>
   <div class="pricevalue1 accent-color1"><b><span class="currency-symbol">$</span>10,500</b></div>
   <div class="carguru"><span data-cg-vin="KNDPMCAC5L7809535" data-cg-price="10990.0000"></span></div>`,
)}
${tile(
  `data-id="ff0011" data-displaytitle="2019 Tesla Model 3" data-displaymake="Tesla" data-displaymodel="Model 3" data-displaytrim="" data-displayyear="2019" data-displaymileage="61234" data-displayfuel="Electric" data-displaydrivetrain="RWD"`,
  `<a href="/vehicle-details/2019-tesla-model-3-ff0011">View</a>
   <div class="inventory-details"><div><span class="vin">5YJ3E1EB2KF510708</span></div></div>
   <div class="pricelabel">Call for Price</div>
   <div class="carguru"><span data-cg-vin="5YJ3E1EB2KF510708" data-cg-price=""></span></div>`,
)}
</div>
<div class="pagination"><a href="?page=1">1</a><a href="?page=2">2</a><a href="?page=3">3</a></div>
</body></html>`;

const PAGE_URL = "https://www.crescentauto.net/view-inventory";

test("isAutoManager fires on the platform's own hosts", () => {
  assert.equal(isAutoManager(SRP), true);
  assert.equal(isAutoManager('<html>we use an auto manager to run the lot</html>'), false);
  assert.equal(isAutoManager(undefined), false);
});

test("autoManagerSeeds names the one SRP path", () => {
  assert.deepEqual(autoManagerSeeds("https://www.crescentauto.net"), ["https://www.crescentauto.net/view-inventory"]);
});

test("autoManagerNextPageUrl walks ?page=N to the last page the pager lists", () => {
  assert.equal(autoManagerNextPageUrl(SRP, PAGE_URL), "https://www.crescentauto.net/view-inventory?page=2");
  assert.equal(
    autoManagerNextPageUrl(SRP, `${PAGE_URL}?page=2`),
    "https://www.crescentauto.net/view-inventory?page=3",
  );
  assert.equal(autoManagerNextPageUrl(SRP, `${PAGE_URL}?page=3`), null);
  assert.equal(autoManagerNextPageUrl("<html>no pager</html>", PAGE_URL), null);
});

test("the rendered price wins, never the CarGurus badge beside it", () => {
  const [kia] = autoManagerVehicles(SRP, PAGE_URL);
  // $10,500 is what the dealer prints; 10990.0000 is the badge's number, and
  // publishing that would be a $490 claim the dealer never made.
  assert.equal(kia.offers.price, 10500);
  assert.equal(kia.offers.priceProvenance, AUTOMANAGER_PRICE);
});

test("a lot that prints no price gets no price, not the badge's blank or a guess", () => {
  const tesla = autoManagerVehicles(SRP, PAGE_URL)[1];
  assert.equal(tesla.offers.price, undefined);
  assert.equal(tesla.offers.priceProvenance, undefined);
});

test("tilePrices abstains by reporting every distinct figure it saw", () => {
  assert.deepEqual(tilePrices('<div class="pricevalue1"><b>$10,500</b></div>'), [10500]);
  assert.deepEqual(
    tilePrices('<div class="pricevalue1">$12,000</div><div class="pricevalue2">$10,500</div>'),
    [12000, 10500],
  );
  // The same figure twice is one figure, not a ladder.
  assert.deepEqual(tilePrices('<div class="pricevalue1">$10,500</div><div class="pricevalue1">$10,500</div>'), [10500]);
});

test("tiles carry the dealer's own fuel string through to classifyEv", () => {
  const [kia, tesla] = autoManagerVehicles(SRP, PAGE_URL);
  assert.equal(kia.fuelType, "Gasoline");
  assert.equal(classifyEv(kia).isEv, false);
  assert.equal(tesla.fuelType, "Electric");
  assert.deepEqual(classifyEv(tesla), { isEv: true, kind: "BEV", confidence: "high" });
});

test("a tile normalizes into the record the pipeline stores, and claims no condition", () => {
  const rec = normalize(autoManagerVehicles(SRP, PAGE_URL)[0], {
    sourceUrl: PAGE_URL,
    dealerDomain: "crescentauto.net",
  });
  assert.equal(rec.vin, "KNDPMCAC5L7809535");
  assert.equal(rec.year, 2020);
  assert.equal(rec.make, "Kia");
  assert.equal(rec.model, "Sportage");
  assert.equal(rec.trim, "LX");
  assert.equal(rec.mileage, 147759);
  assert.equal(rec.priceUsd, 10500);
  assert.equal(rec.driveLine, "AWD");
  assert.equal(rec.stockNumber, "809535");
  assert.equal(rec.exteriorColor, "White");
  assert.equal(
    rec.vdpUrl,
    "https://www.crescentauto.net/vehicle-details/2020-kia-sportage-lx-suv-2da335a0bc82478291cd19df195290f4",
  );
  // The platform states no new/used token anywhere, so the row states none.
  assert.equal(rec.condition, undefined);
});

test("the theme's coming-soon graphic is not a photo of the car", () => {
  const withPlaceholder = SRP.replace(
    "https://automanager.blob.core.windows.net/wmphotos/012532/a.jpg",
    "https://automanagerprodcdn.azureedge.net/wmthemes/images/palette/light/comingsoon_105.png",
  );
  assert.equal(autoManagerVehicles(withPlaceholder, PAGE_URL)[0].image, undefined);
  assert.deepEqual(autoManagerVehicles(SRP, PAGE_URL)[0].image, [
    "https://automanager.blob.core.windows.net/wmphotos/012532/a.jpg",
  ]);
});

test("a relative VDP href resolves against the page it was found on", () => {
  const tesla = autoManagerVehicles(SRP, PAGE_URL)[1];
  assert.equal(tesla.offers.url, "https://www.crescentauto.net/vehicle-details/2019-tesla-model-3-ff0011");
});

test("a tile with no VIN is dropped rather than keyed by the page it shares", () => {
  const noVin = `<html><link href="https://automanagerprodcdn.azureedge.net/x.css"/>${tile(
    'data-id="zz" data-displaytitle="2018 Ford Focus" data-displayyear="2018"',
    '<div class="pricevalue1">$5,000</div>',
  )}</html>`;
  assert.deepEqual(autoManagerVehicles(noVin, PAGE_URL), []);
  // …and a page that is not AutoManager at all yields nothing.
  assert.deepEqual(autoManagerVehicles("<html>dealer.com</html>", PAGE_URL), []);
});
