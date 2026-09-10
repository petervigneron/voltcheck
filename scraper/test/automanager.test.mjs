import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isAutoManager,
  autoManagerSeeds,
  autoManagerVehicles,
  autoManagerVdpVehicles,
  autoManagerNextPageUrl,
  tilePrices,
  displayTrim,
} from "../lib/platforms/automanager.mjs";
import { classifyEv } from "../lib/ev.mjs";
import { normalize, keepRicher } from "../lib/normalize.mjs";
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

test("a pipe-joined displaytrim is the platform's feature line, not a trim", () => {
  // specialtiesauto.com and umcsales.com, 2026-09-07: the model restated,
  // the dealer's options, the drivetrain, a digit. Nothing in it is a trim
  // the model did not already say.
  assert.equal(displayTrim("Model 3 Long Range | w/ Hardware 4 | AWD | 0", "Model 3 Long Range"), undefined);
  assert.equal(displayTrim("Model Y Long Range | AWD | AWD | 0", "Model Y Long Range"), undefined);
  assert.equal(displayTrim("Blazer EV RS | AWD | 2", "Blazer EV RS"), undefined);
  assert.equal(displayTrim("MODEL 3  LONG RANGE | RWD | 0", "Model 3 Long Range"), undefined);
  // A first segment that says something the model does not is kept alone.
  assert.equal(displayTrim("Performance | AWD | LAUNCH PKG", "R2"), "Performance");
  // The plain case, untouched.
  assert.equal(displayTrim("LX", "Sportage"), "LX");
  assert.equal(displayTrim(undefined, "Sportage"), undefined);

  const restated = SRP.replace(
    'data-displaymodel="Model 3" data-displaytrim=""',
    'data-displaymodel="Model 3 Long Range" data-displaytrim="Model 3 Long Range | FSD Capable | AWD | 0"',
  );
  const tesla = autoManagerVehicles(restated, PAGE_URL)[1];
  assert.equal(tesla.model, "Model 3 Long Range");
  assert.equal(tesla.vehicleConfiguration, undefined);
  assert.equal(normalize(tesla, { sourceUrl: PAGE_URL, dealerDomain: "x.com" }).trim, undefined);
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

// ── The model is the dropdown, and the dropdown is short (2026-09-09) ──────

// ultimatems.com's first page, verbatim attributes: the dropdown had no
// Vistiq, so the tile says "Other" and the headline carries the name.
const OTHER_TILE = tile(
  `data-id="3834f170a7db449bba0c7cc93741852a" data-displaytitle="2026 Cadillac VISTIQ 2026 Luxury AWD NAV PANO SUPERCRUISE 6PASS 1K Mi SUV 1GYC3KML4TZ711182" data-displayprice="$" data-displaymake="Cadillac" data-displaytrim="2026 Luxury AWD NAV PANO SUPERCRUISE 6PASS 1K Mi" data-displaymodel="Other" data-displayyear="2026" data-displayengine="Electric 615hp 650ft. lbs." data-displaytransmission="1-Speed Direct-Drive" data-displaymileage="1912" data-displayextcolor="Green" data-displayintcolor="Gray" data-displaydrivetrain="AWD" data-displayfuel="Electric" data-displayphoto="https://automanager.blob.core.windows.net/wmphotos/027865/3834f170a7db449bba0c7cc93741852a/d7b5472c0c_120.jpg"`,
  `<a href="https://www.ultimatems.com/vehicle-details/2026-cadillac-vistiq-2026-luxury-awd-nav-pano-supercruise-6pass-1k-mi-suv-1gyc3kml4tz711182-3834f170a7db449bba0c7cc93741852a">View</a>
   <div class="inventory-details"><div><span class="vin">1GYC3KML4TZ711182</span></div><div><span class="stocknumber">711182</span></div></div>
   <div class="pricelabel internetpricelabel">Internet Price</div>
   <div class="pricevalue1 accent-color1"><b><span class="currency-symbol">$</span>67,770</b></div>`,
);
const OTHER_SRP = SRP.replace('<div id="inv-list" class="grid-view">', `<div id="inv-list" class="grid-view">${OTHER_TILE}`);

test("the dropdown's \"Other\" is not a model, and the headline is not one either", () => {
  const [vistiq] = autoManagerVehicles(OTHER_SRP, "https://www.ultimatems.com/view-inventory");
  assert.equal(vistiq.vehicleIdentificationNumber, "1GYC3KML4TZ711182");
  assert.equal(vistiq.model, undefined);
  // The rest of the tile is read as before — this is the record vPIC names.
  assert.equal(vistiq.brand, "Cadillac");
  assert.equal(vistiq.vehicleModelDate, "2026");
  assert.equal(vistiq.offers.price, 67770);
  assert.equal(vistiq.mileageFromOdometer.value, 1912);
  const rec = normalize(vistiq, { sourceUrl: "https://www.ultimatems.com/view-inventory", dealerDomain: "ultimatems.com" });
  assert.equal(rec.model, undefined);
  assert.equal(rec.year, 2026);
  // A dropdown that names the car still names it.
  assert.equal(autoManagerVehicles(SRP, PAGE_URL)[0].model, "Sportage");
});

// The same car's VDP, as the platform renders it: the tile's model and trim
// run together in `model`, and again in `vehicleConfiguration` with the
// drivetrain and a digit pipe-joined after.
const VDP = `<!doctype html><html><head>
<link href="https://automanagerprodcdn.azureedge.net/wmthemes/fluid/default.css" rel="stylesheet"/>
<script type="application/ld+json">${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "Vehicle",
  name: "2026 Cadillac VISTIQ 2026 Luxury AWD NAV PANO SUPERCRUISE 6PASS 1K Mi",
  brand: { "@type": "Brand", name: "Cadillac" },
  model: "VISTIQ 2026 Luxury AWD NAV PANO SUPERCRUISE 6PASS 1K Mi",
  vehicleConfiguration: "VISTIQ 2026 Luxury AWD NAV PANO SUPERCRUISE 6PASS 1K Mi | AWD | 0",
  fuelType: "Electric",
  bodyType: "SUV",
  color: "Green",
  productionDate: "2026",
  vehicleIdentificationNumber: "1GYC3KML4TZ711182",
  sku: "711182",
  description: "Ultimate Motorsport Presents 2026 Cadillac Vistiq Luxury",
  offers: { "@type": "Offer", price: "67770.00", priceCurrency: "USD", url: "https://www.ultimatems.com/vehicle-details/3834f170a7db449bba0c7cc93741852a" },
  mileageFromOdometer: { "@type": "QuantitativeValue", value: 1912, unitCode: "SMI" },
  image: ["https://automanager.blob.core.windows.net/wmphotos/1.jpg", "https://automanager.blob.core.windows.net/wmphotos/2.jpg", "https://automanager.blob.core.windows.net/wmphotos/3.jpg"],
})}</script></head><body><h1 class="pagetitle">2026 Cadillac VISTIQ 2026 Luxury AWD NAV PANO SUPERCRUISE 6PASS 1K Mi for sale in Houston TX</h1></body></html>`;

test("an AutoManager VDP's JSON-LD is read with its composed model and trim blank", () => {
  const [node] = autoManagerVdpVehicles(VDP);
  assert.equal(node.vehicleIdentificationNumber, "1GYC3KML4TZ711182");
  assert.equal(node.model, undefined);
  assert.equal(node.vehicleConfiguration, undefined);
  // Everything the node actually knows is kept.
  assert.equal(node.offers.price, "67770.00");
  assert.equal(node.mileageFromOdometer.value, 1912);
  assert.equal(node.image.length, 3);
  // Not the platform's page: nothing, so the generic reader stays in charge.
  assert.deepEqual(
    autoManagerVdpVehicles(VDP.replace(/automanagerprodcdn\.azureedge\.net|automanager\.blob\.core\.windows\.net/g, "cdn.example.com")),
    [],
  );
  // specialtiesauto.com's RDX, 2026-09-09: the composed form with no year in
  // it, which no downstream tell could catch — only the platform can.
  const rdx = VDP.replace(/VISTIQ 2026 Luxury AWD NAV PANO SUPERCRUISE 6PASS 1K Mi/g, "RDX SH-AWD w/A-SPEC");
  assert.equal(autoManagerVdpVehicles(rdx)[0].model, undefined);
});

test("when the VDP wins on richness, the tile's split model and trim come with it", () => {
  const srpUrl = "https://www.ultimatems.com/view-inventory";
  const dealerDomain = "ultimatems.com";
  // A tile whose dropdown DOES name the car, and its VDP.
  const named = OTHER_SRP.replace('data-displaymodel="Other"', 'data-displaymodel="Vistiq"');
  const tileRec = normalize(autoManagerVehicles(named, srpUrl)[0], { sourceUrl: srpUrl, dealerDomain });
  const vdpRec = { ...normalize(autoManagerVdpVehicles(VDP)[0], { sourceUrl: "https://www.ultimatems.com/vehicle-details/x", dealerDomain }), fromVdp: true };
  assert.equal(tileRec.model, "Vistiq");
  assert.equal(tileRec.trim, "2026 Luxury AWD NAV PANO SUPERCRUISE 6PASS 1K Mi");
  assert.equal(vdpRec.model, undefined);
  for (const merged of [keepRicher(tileRec, vdpRec), keepRicher(vdpRec, tileRec)]) {
    // The VDP's own reading of what it read: gallery, description, canonical URL.
    assert.equal(merged.images.length, 3);
    assert.equal(merged.sourceUrl, "https://www.ultimatems.com/vehicle-details/3834f170a7db449bba0c7cc93741852a");
    // The tile's reading of what the VDP did not read.
    assert.equal(merged.model, "Vistiq");
    assert.equal(merged.trim, "2026 Luxury AWD NAV PANO SUPERCRUISE 6PASS 1K Mi");
  }
  // An "Other" tile has nothing to give, and the merged car goes out with no
  // model for vpic-enrich to fill — never with the headline.
  const otherRec = normalize(autoManagerVehicles(OTHER_SRP, srpUrl)[0], { sourceUrl: srpUrl, dealerDomain });
  assert.equal(keepRicher(otherRec, vdpRec).model, undefined);
});
