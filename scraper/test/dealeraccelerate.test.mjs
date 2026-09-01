import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isDealerAccelerate,
  isSoldRoute,
  isDealerAccelerateSold,
  slugName,
  dealerAccelerateSeeds,
  dealerAccelerateEntries,
  dealerAccelerateNextPageUrl,
  DEALERACCELERATE_SRP_PATH,
} from "../lib/platforms/dealeraccelerate.mjs";
import { fingerprint } from "../lib/fingerprint.mjs";
import { extractItemListEntries } from "../lib/jsonld.mjs";

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures. All markup below is copied from live pages on 2026-08-31 and
// trimmed to the shapes under test; nothing is invented. The four rooftops are
// four different themes of the same platform, which is the point.
// ─────────────────────────────────────────────────────────────────────────────

const pager = (cls, links) =>
  `<ul class="${cls}"><li class="prev previous_page disabled"><a href="#">&laquo;</a></li>${links}` +
  `<li class="next next_page "><a rel="next" href="/vehicles?page=2">&raquo;</a></li></ul>`;

// gatewayclassiccars.com/vehicles — "vehicle-grid" theme, 26 cars a page,
// 68 pages, 1,755 cars. The pager lists 1 2 3 … 68.
const GATEWAY_SRP = `<!doctype html><html><head>
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[
{"@type":"ItemList","name":"Gateway Classic Cars Inventory","numberOfItems":1755,"itemListElement":[
{"@type":"ListItem","position":1,"item":{"@type":["Product","Vehicle"],"name":"1983 Mercedes-Benz 380 SL","url":"https://www.gatewayclassiccars.com/vehicles/san/1300/1983-mercedes-benz-380-sl","offers":{"@type":"Offer","price":22500,"priceCurrency":"USD"}}}]}]}</script>
</head><body>
<nav><ul><li><a title="Click to Visit Recently Sold" href="/vehicles/sold">Recently Sold</a></li>
<li><a href="/vehicles/new_arrivals">New Arrival</a></li></ul></nav>
<div class='vehicle-grid' id='vehicle-grid' role='list'>
<article class='vehicle-grid__item'>
<a class="vehicle-phone-placeholder" title="Call our San Antonio showroom" href="tel:+1-8303762154"></a>
<a class="vehicle-grid__link " title="1983 Mercedes-Benz 380 SL" href="https://www.gatewayclassiccars.com/vehicles/san/1300/1983-mercedes-benz-380-sl"><div class='vlp-ribbon new'> New Arrival </div>
<img alt="1983 Mercedes-Benz 380 SL first image" src="https://cdn.dealeraccelerate.com/gatewayclassiccars/18/53795/1120072/790x1024/w39/1983-mercedes-benz-380-sl.avif" />
<div class='vehicle-grid__price'> <span class='price'>$22,500</span> </div></a></article>
<article class='vehicle-grid__item'>
<a class="vehicle-grid__link " title="1939 Packard 110" href="/vehicles/tul/867/1939-packard-110">
<img alt="1939 Packard 110 first image" src="https://cdn.dealeraccelerate.com/gatewayclassiccars/20/53768/1090996/790x1024/w45/1939-packard-110.avif" />
<div class='vehicle-grid__price'> <span class='price'>$53,000</span> </div></a></article>
</div>
<div class='pagination-row'><span>Pages</span>${pager(
  "pagination",
  `<li class="active"><a href="/vehicles?page=1">1</a></li> <li><a rel="next" href="/vehicles?page=2">2</a></li> <li><a href="/vehicles?page=3">3</a></li> <li class="disabled"><a href="#">&hellip;</a></li> <li><a href="/vehicles?page=68">68</a></li> `,
)}</div>
<footer><ul><li><a href="/vehicles/sold">Recently Sold</a></li></ul></footer>
</body></html>`;

const GATEWAY_URL = "https://www.gatewayclassiccars.com/vehicles";

// gatewayclassiccars.com/vehicles?page=68 — the last page. Its pager lists
// 1 … 66 67 68 and the "next" arrow is disabled, so the highest number in the
// block is the page we are standing on.
const GATEWAY_LAST = GATEWAY_SRP.replace(
  /<div class='pagination-row'>[\s\S]*?<\/div>/,
  `<div class='pagination-row'><ul class="pagination"><li><a href="/vehicles?page=1">1</a></li> <li class="disabled"><a href="#">&hellip;</a></li> <li><a href="/vehicles?page=66">66</a></li> <li><a href="/vehicles?page=67">67</a></li> <li class="active"><a href="/vehicles?page=68">68</a></li> <li class="next next_page disabled"><a href="#">&raquo;</a></li></ul></div>`,
);

// gatewayclassiccars.com/vehicles/sold — the sold archive. Same theme, same
// pager, same tiles; the ItemList still publishes each car's price and still
// carries no availability field.
const GATEWAY_SOLD = `<!doctype html><html><body>
<div class='vehicle-grid' id='vehicle-grid' role='list'>
<article class='vehicle-grid__item'>
<a class="vehicle-phone-placeholder" href="tel:+1-9133080192"></a>
<a class="vehicle-grid__link vehicle-grid__link-sold" title="1966 Dodge Charger" href="https://www.gatewayclassiccars.com/vehicles/kcm/1440/1966-dodge-charger"><div class='vlp-ribbon sold'> Sold </div>
<img alt="1966 Dodge Charger first image" src="https://cdn.dealeraccelerate.com/gatewayclassiccars/9/53147/1002167/790x1024/w22/1966-dodge-charger.avif" />
<div class='sold vehicle-grid__price'> <span class='price'>Sold</span> </div></a></article>
</div>
${pager("pagination", `<li class="active"><a href="/vehicles/sold?page=1">1</a></li> <li><a href="/vehicles/sold?page=2">2</a></li> `)}
</body></html>`;

// streetsideclassics.com/vehicles — "inventory-item" theme. No JSON-LD on the
// page at all, microdata instead, and — the reason the sold flag exists — SOLD
// CARS ON THE LIVE LIST, each still printing its full asking price. Tile 2 is
// the live 1955 Bel Air, tile 3 the sold 1973 F-100 ($62,995).
const STREETSIDE_SRP = `<!doctype html><html><body>
<nav><a href="/vehicles/new_arrivals">New Arrivals</a><a href="/vehicles/featured">Featured</a>
<a href="/vehicles/coming-soon">Coming Soon</a><a class="soldlink" href="/vehicles/sold">Sold</a></nav>
<div class='inventory-list'>
<a class="inventory-item" itemscope="itemscope" itemtype="https://schema.org/Car" href="/vehicles/8471-dfw/1955-chevrolet-bel-air-resto-mod-show-car"><div alt='1955 Chevrolet Bel Air' class='inventory-image' style='background-image: url(https://cdn.dealeraccelerate.com/streetside/6/52353/4861000/790x1024/1955-chevrolet-bel-air-resto-mod-show-car)'></div>
<div class='inventory-name'><div class='top'><span><span itemprop='productionDate'>1955</span> <span itemprop='manufacturer'>Chevrolet</span></span> <span class='inventory-price'>$67,995</span></div>
<div class='bottom-stock'><span class='stock'> Stock # </span> <span itemprop='productID'> 9352-ATL </span></div></div></a>
<a class="inventory-item" itemscope="itemscope" itemtype="https://schema.org/Car" href="/vehicles/5252-phx/1973-ford-f-100-ls3-restomod"><div alt='1973 Ford F-100' class='inventory-image' style='background-image: url(https://cdn.dealeraccelerate.com/streetside/6/52353/4862012/790x1024/1973-ford-f-100-ls3-restomod)'>
<div class='caption'> <span class='inventory-price'>SOLD</span> </div></div>
<div class='inventory-name'><div class='top'><span><span itemprop='productionDate'>1973</span> <span itemprop='manufacturer'>Ford</span></span> <span class='inventory-price sold'>$62,995</span></div>
<div class='bottom-stock'><span class='stock'> Stock # </span> <span itemprop='productID'> 5252-PHX </span></div></div></a>
</div>
<div class='text-center ss-pagination'>${pager(
  "pagination",
  `<li class="active"><a href="/vehicles?page=1">1</a></li> <li><a rel="next" href="/vehicles?page=2">2</a></li> <li class="disabled"><a href="#">&hellip;</a></li> <li><a href="/vehicles?page=49">49</a></li> `,
)}</div></body></html>`;

const STREETSIDE_URL = "https://www.streetsideclassics.com/vehicles";

// classicautomall.com/vehicles — "cam" theme. No ItemList; a per-tile Car
// JSON-LD carrying the VIN, the price, availability and condition. The sold
// tile's structured data is dropped by the platform itself — the page says so
// in a comment — leaving the banner as the only mark.
const CAM_SRP = `<!doctype html><html><body>
<nav><a href="/vehicles/sold">Sold</a></nav>
<div class='cam-inventory-block-wrap'><div class='row'>
<a href="/vehicles/8718/2017-mercedes-benz-slc-43-amg-roadster"><div class='cam-vehicle-block'><div class='cam-vehicle-item'>
<div class='cam-lead-photo lazy' style='background-image: url(https://cdn.dealeraccelerate.com/cam/34/9069/687638/790x1024/2017-mercedes-benz-slc-43-amg-roadster)'></div>
<div class='cam-vehicle-item-name'><h3> 2017 Mercedes-Benz </h3><h2> SLC 43 AMG Roadster </h2>
<div class='cam-vehicle-price-vlp'><div class='cam-price'>$30,000</div></div></div></div>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Car","name":"2017 Mercedes-Benz SLC 43 AMG Roadster","url":"https://www.classicautomall.com/vehicles/8718/2017-mercedes-benz-slc-43-amg-roadster","vehicleIdentificationNumber":"WDDPK6GA4HF132655","vehicleModelDate":"2017","model":"SLC 43 AMG","offers":{"@type":"Offer","availability":"https://schema.org/InStock","price":"30000","priceCurrency":"USD"},"itemCondition":"https://schema.org/UsedCondition","mileageFromOdometer":{"@type":"QuantitativeValue","value":"67466","unitCode":"SMI"}}</script>
</div></a>
<a href="/vehicles/8400/1966-chevrolet-malibu-chevelle-convertible"><div class='cam-vehicle-block'><div class='cam-vehicle-item'>
<div class='cam-lead-photo lazy' style='background-image: url(https://cdn.dealeraccelerate.com/cam/34/8802/653381/790x1024/1966-chevrolet-malibu-chevelle-convertible)'></div>
<div class='cam-vehicle-item-name'><h3> 1966 Chevrolet </h3><h2> Malibu Chevelle Convertible </h2>
<div class='cam-vehicle-price-vlp'><div class='cam-sold-banner'> <span> SOLD </span> </div></div></div></div>
<!-- Structured data for this vehicle is skipped because the following required fields are missing: offers -->
</div></a>
</div>${pager(
  "pagination",
  `<li class="active"><a href="/vehicles?page=1">1</a></li> <li><a rel="next" href="/vehicles?page=2">2</a></li> <li class="disabled"><a href="#">&hellip;</a></li> <li><a href="/vehicles?page=26">26</a></li> `,
)}</div></body></html>`;

const CAM_URL = "https://www.classicautomall.com/vehicles";

// motorcarstudio.com/vehicles — a 6-car rooftop on the "motorcar" theme. One
// page, so no pager at all.
const MOTORCARSTUDIO_SRP = `<!doctype html><html><body>
<nav><a href="/vehicles/sold">Sold</a></nav>
<a class="motorcar-inventory-link" href="/vehicles/1531/1995-acura-nsx-t"><div class='inventory-list-view'>
<h3 class='price'>$198,900</h3>
<img class="img-thumbnail" alt="1995 Acura NSX-T" src="https://cdn.dealeraccelerate.com/motorcar/1/1561/50339/790x1024/1995-acura-nsx-t" />
<div class='details'><h3><span class='year'>1995</span> <span class='make'>Acura</span> <span class='model'>NSX-T</span></h3></div>
</div></a></body></html>`;

// craftsportsjdm.com/vehicles — the rooftop that settles the link rule. Same
// platform, same tile shape, but its cars are mounted at /inventory, and it
// links its own stock on a marketplace from the same page.
const CRAFT_SRP = `<!doctype html><html><body>
<nav><a href="https://buy.motorious.com/inventory/dealer/Craft+Sports+Inc.">Motorious</a>
<a href="/inventory">Inventory</a><a href="/inventory/r34">R34</a>
<a href="/vehicles?q%5Bs%5D%5B0%5D%5Bname_dir%5D=year.desc">Year - New to Old</a></nav>
<div class='vehicle-grid'>
<a itemscope="itemscope" itemtype="https://schema.org/Car" class="inventory-grid-item full-width-grid" title="1995 Nissan SKYLINE GT-R" href="/inventory/476/1995-nissan-skyline-gt-r-r33-bcnr33-gt-r"><div class='vehicle-thumb' style="background-image:url('https://cdn.dealeraccelerate.com/craft/1/432/39624/790x1024/1995-nissan-skyline-gt-r-r33-bcnr33-gt-r');">
<div class='craft-vehicle-show-label left'><div class='craft-label-vehicle new'> New </div></div></div></a>
</div></body></html>`;

// gatewayclassiccars.com/vehicles/kcm/1440/1966-dodge-charger — a VDP whose
// car has sold. Note the VIN: 13 characters, which is what a 1966 car has.
const GATEWAY_SOLD_VDP = `<!doctype html><html><body>
<img src="https://cdn.dealeraccelerate.com/gatewayclassiccars/9/53147/1002167/790x1024/w22/1966-dodge-charger.avif"/>
<script type="application/ld+json">{"@context":"https://schema.org","@type":["Product","Vehicle"],"name":"1966 Dodge Charger","vehicleIdentificationNumber":"XP29E61188575","offers":{"@type":"Offer","url":"https://www.gatewayclassiccars.com/vehicles/kcm/1440/1966-dodge-charger","price":33000,"priceCurrency":"USD","availability":"https://schema.org/SoldOut","itemCondition":"https://schema.org/UsedCondition"}}</script>
</body></html>`;

// …/vehicles/san/1300/1983-mercedes-benz-380-sl — the same page for a car that
// has not, carrying a related-vehicles rail whose tiles are SRP markup, sold
// ribbons and all.
const GATEWAY_LIVE_VDP = `<!doctype html><html><body>
<img src="https://cdn.dealeraccelerate.com/gatewayclassiccars/18/53795/1120072/790x1024/w39/1983-mercedes-benz-380-sl.avif"/>
<script type="application/ld+json">{"@context":"https://schema.org","@type":["Product","Vehicle"],"name":"1983 Mercedes-Benz 380 SL","vehicleIdentificationNumber":"WDB10704512019953","offers":{"@type":"Offer","price":22500,"priceCurrency":"USD","availability":"https://schema.org/InStock","itemCondition":"https://schema.org/UsedCondition"}}</script>
<section class='related'><article class='vehicle-grid__item'><a class="vehicle-grid__link vehicle-grid__link-sold" href="/vehicles/kcm/1440/1966-dodge-charger"><div class='vlp-ribbon sold'> Sold </div></a></article></section>
</body></html>`;

// streetsideclassics.com sold VDP — this rooftop publishes no JSON-LD on a VDP
// at all, sold or live, so the theme's class is the only answer there is.
const STREETSIDE_SOLD_VDP = `<!doctype html><html><body>
<img src="https://cdn.dealeraccelerate.com/streetside/9/52402/4861724/790x1024/1931-ford-model-a"/>
<h1>1931 Ford Model A</h1><span class='price sold'>$44,995</span></body></html>`;

const STREETSIDE_LIVE_VDP = `<!doctype html><html><body>
<img src="https://cdn.dealeraccelerate.com/streetside/6/52353/4862012/790x1024/1961-chevrolet-corvette"/>
<h1>1961 Chevrolet Corvette</h1><span class='price'>$79,995</span></body></html>`;

// ─────────────────────────────────────────────────────────────────────────────
// Detection
// ─────────────────────────────────────────────────────────────────────────────

test("isDealerAccelerate fires on the vendor's CDN and agrees with fingerprint()", () => {
  for (const [name, html] of [
    ["gateway", GATEWAY_SRP],
    ["streetside", STREETSIDE_SRP],
    ["classicautomall", CAM_SRP],
    ["motorcarstudio", MOTORCARSTUDIO_SRP],
  ]) {
    assert.equal(isDealerAccelerate(html), true, name);
    assert.equal(fingerprint(html), "dealeraccelerate", name);
  }
  // The dev CDN and the .net apex are in the fingerprint's pattern too, so
  // they have to be in this one.
  assert.equal(isDealerAccelerate('<img src="https://cdn-dev.dealeraccelerate.net/x/1.jpg">'), true);
});

test("naming the platform is not running on it", () => {
  // The signal is the vendor's host, never the words. A rooftop is free to
  // credit its website vendor in its footer, and a page that does is not a
  // page this lane may seed, paginate or read.
  const namedropped = "<html><footer>Website by Dealer Accelerate. Powered by dealeraccelerate.</footer></html>";
  assert.equal(isDealerAccelerate(namedropped), false);
  assert.notEqual(fingerprint(namedropped), "dealeraccelerate");
  assert.equal(isDealerAccelerate(undefined), false);
  assert.equal(isDealerAccelerate(null), false);
});

// ─────────────────────────────────────────────────────────────────────────────
// Seeds
// ─────────────────────────────────────────────────────────────────────────────

test("dealerAccelerateSeeds names the one SRP path", () => {
  assert.equal(DEALERACCELERATE_SRP_PATH, "/vehicles");
  assert.deepEqual(dealerAccelerateSeeds("https://www.gatewayclassiccars.com"), [
    "https://www.gatewayclassiccars.com/vehicles",
  ]);
  assert.deepEqual(dealerAccelerateSeeds("https://www.motorcarstudio.com"), [
    "https://www.motorcarstudio.com/vehicles",
  ]);
});

// ─────────────────────────────────────────────────────────────────────────────
// Pagination
// ─────────────────────────────────────────────────────────────────────────────

test("dealerAccelerateNextPageUrl walks ?page=N to the last page the pager lists", () => {
  assert.equal(dealerAccelerateNextPageUrl(GATEWAY_SRP, GATEWAY_URL), `${GATEWAY_URL}?page=2`);
  assert.equal(dealerAccelerateNextPageUrl(GATEWAY_SRP, `${GATEWAY_URL}?page=2`), `${GATEWAY_URL}?page=3`);
  // A middle page: the pager prints 1 2 3 … 68 from every page, so 34 → 35.
  assert.equal(dealerAccelerateNextPageUrl(GATEWAY_SRP, `${GATEWAY_URL}?page=34`), `${GATEWAY_URL}?page=35`);
  // The last page stops the walk — on the real page 68 the pager's highest
  // number is the one we are standing on.
  assert.equal(dealerAccelerateNextPageUrl(GATEWAY_LAST, `${GATEWAY_URL}?page=68`), null);
  assert.equal(dealerAccelerateNextPageUrl(STREETSIDE_SRP, STREETSIDE_URL), `${STREETSIDE_URL}?page=2`);
  assert.equal(dealerAccelerateNextPageUrl(CAM_SRP, CAM_URL), `${CAM_URL}?page=2`);
});

test("no pager, no next page", () => {
  // A one-page rooftop (motorcarstudio.com, 6 cars) prints no pagination block
  // and no ?page= anywhere.
  assert.equal(dealerAccelerateNextPageUrl(MOTORCARSTUDIO_SRP, "https://www.motorcarstudio.com/vehicles"), null);
  assert.equal(dealerAccelerateNextPageUrl("<html>not a dealer page</html>", GATEWAY_URL), null);
  assert.equal(dealerAccelerateNextPageUrl(GATEWAY_SRP, "not a url"), null);
  assert.equal(dealerAccelerateNextPageUrl(undefined, GATEWAY_URL), null);
  // A page number the URL cannot be read as, and one past the end, both stop
  // rather than restart the walk.
  assert.equal(dealerAccelerateNextPageUrl(GATEWAY_SRP, `${GATEWAY_URL}?page=abc`), null);
  assert.equal(dealerAccelerateNextPageUrl(GATEWAY_SRP, `${GATEWAY_URL}?page=99`), null);
});

test("only ?page= is ever emitted — every other query key is robots-disallowed here", () => {
  // gateway's robots.txt is a literal `Disallow: /*?` with `Allow: /*?page=`
  // re-opening exactly one key; Classic Auto Mall blocks each facet by name.
  // Carrying a stray parameter forward walks us into a disallowed URL, so the
  // next URL is rebuilt from the path rather than mutated.
  const next = dealerAccelerateNextPageUrl(GATEWAY_SRP, `${GATEWAY_URL}?q%5Bmake_eq%5D=Tesla&page=2`);
  assert.equal(next, `${GATEWAY_URL}?page=3`);
  assert.equal(new URL(next).search, "?page=3");
});

test("the sold archive does not paginate", () => {
  // /vehicles/sold pages exactly like /vehicles and holds nothing publishable,
  // so walking its 68 pages would spend the budget on cars that must be
  // dropped on arrival.
  assert.equal(dealerAccelerateNextPageUrl(GATEWAY_SOLD, "https://www.gatewayclassiccars.com/vehicles/sold"), null);
  assert.equal(isSoldRoute("https://www.gatewayclassiccars.com/vehicles/sold"), true);
  assert.equal(isSoldRoute("https://www.gatewayclassiccars.com/vehicles/sold?page=2"), true);
  assert.equal(isSoldRoute("https://www.classicautomall.com/vehicles"), false);
  // A car whose slug happens to start with the word is not the archive.
  assert.equal(isSoldRoute("https://www.gatewayclassiccars.com/vehicles/kcm/1440/1966-dodge-charger"), false);
  assert.equal(isSoldRoute("not a url"), false);
});

// ─────────────────────────────────────────────────────────────────────────────
// Entries
// ─────────────────────────────────────────────────────────────────────────────

test("the generic ItemList bridge reads nothing here, which is why entries exist", () => {
  // The platform's ListItem nodes carry no `url` of their own — it is one
  // level down in `item.url` — so extractItemListEntries returns nothing on a
  // page that plainly lists cars. Measured on the live gateway SRP; this is
  // the control that keeps the lane honest if the generic reader ever changes.
  assert.deepEqual(extractItemListEntries(GATEWAY_SRP), []);
  assert.ok(dealerAccelerateEntries(GATEWAY_SRP, GATEWAY_URL).length > 0);
});

test("entries are the tiles' links, resolved absolute, on every theme", () => {
  assert.deepEqual(dealerAccelerateEntries(GATEWAY_SRP, GATEWAY_URL), [
    {
      url: "https://www.gatewayclassiccars.com/vehicles/san/1300/1983-mercedes-benz-380-sl",
      name: "1983 mercedes benz 380 sl",
      vin: undefined,
      sold: false,
    },
    {
      url: "https://www.gatewayclassiccars.com/vehicles/tul/867/1939-packard-110",
      name: "1939 packard 110",
      vin: undefined,
      sold: false,
    },
  ]);
  assert.deepEqual(
    dealerAccelerateEntries(MOTORCARSTUDIO_SRP, "https://www.motorcarstudio.com/vehicles").map((e) => e.url),
    ["https://www.motorcarstudio.com/vehicles/1531/1995-acura-nsx-t"],
  );
});

test("a rooftop that mounts its cars somewhere other than /vehicles is still read", () => {
  // craftsportsjdm.com serves its SRP at /vehicles and links every car at
  // /inventory/{id}/{year-slug}. A rule anchored on the "/vehicles/" mount saw
  // 0 of its 128 cars; the id segment is what carries the precision. The
  // marketplace link and the facet links on the same page are not cars.
  assert.deepEqual(dealerAccelerateEntries(CRAFT_SRP, "https://www.craftsportsjdm.com/vehicles"), [
    {
      url: "https://www.craftsportsjdm.com/inventory/476/1995-nissan-skyline-gt-r-r33-bcnr33-gt-r",
      name: "1995 nissan skyline gt r r33 bcnr33 gt r",
      vin: undefined,
      sold: false,
    },
  ]);
});

test("the platform's other /vehicles/* routes are not cars", () => {
  // /vehicles/sold, /vehicles/featured, /vehicles/new_arrivals and
  // /vehicles/coming-soon are linked from the nav of every page on every
  // rooftop. A car's last path segment leads with its model year; none of
  // those do.
  const urls = dealerAccelerateEntries(STREETSIDE_SRP, STREETSIDE_URL).map((e) => e.url);
  assert.deepEqual(urls, [
    "https://www.streetsideclassics.com/vehicles/8471-dfw/1955-chevrolet-bel-air-resto-mod-show-car",
    "https://www.streetsideclassics.com/vehicles/5252-phx/1973-ford-f-100-ls3-restomod",
  ]);
});

test("a tile's 17-character VIN is carried; a classic's short one is not invented", () => {
  const [live, sold] = dealerAccelerateEntries(CAM_SRP, CAM_URL);
  assert.equal(live.vin, "WDDPK6GA4HF132655");
  // The sold 1966 Chevelle's tile has no structured data at all — the platform
  // drops it — so there is no VIN to read, and none is guessed.
  assert.equal(sold.vin, undefined);
  // Pre-1981 cars have VINs shorter than 17 characters ("XP29E61188575" is the
  // 1966 Charger's). The 17-char gate leaves them undefined rather than
  // emitting a string the rest of the pipeline would half-accept.
  const shortVin = CAM_SRP.replace("WDDPK6GA4HF132655", "XP29E61188575");
  assert.equal(dealerAccelerateEntries(shortVin, CAM_URL)[0].vin, undefined);
});

test("entries are empty on a page this platform did not serve", () => {
  assert.deepEqual(dealerAccelerateEntries("<html><a href='/vehicles/1/2020-tesla-model-3'>x</a></html>", CAM_URL), []);
  assert.deepEqual(dealerAccelerateEntries(undefined, CAM_URL), []);
});

// ─────────────────────────────────────────────────────────────────────────────
// Sold — the whole reason this lane is more than a pager
// ─────────────────────────────────────────────────────────────────────────────

test("sold cars sit on the LIVE list, still printing their asking price", () => {
  // streetsideclassics.com/vehicles page 1 carried 2 of these in 40 on
  // 2026-08-31. The sold 1973 F-100 still shows $62,995; nothing but the
  // markup says the car is gone.
  const entries = dealerAccelerateEntries(STREETSIDE_SRP, STREETSIDE_URL);
  assert.deepEqual(
    entries.map((e) => e.sold),
    [false, true],
  );
  assert.equal(entries.filter((e) => !e.sold).length, 1);
});

test("each theme words its sold marker differently and all of them are read", () => {
  // gateway: vehicle-grid__link-sold / vlp-ribbon sold / sold vehicle-grid__price
  assert.equal(
    dealerAccelerateEntries(GATEWAY_SOLD, "https://www.gatewayclassiccars.com/vehicles/sold")[0].sold,
    true,
  );
  // classicautomall: cam-sold-banner
  assert.equal(dealerAccelerateEntries(CAM_SRP, CAM_URL)[1].sold, true);
  // streetside: inventory-price sold
  assert.equal(dealerAccelerateEntries(STREETSIDE_SRP, STREETSIDE_URL)[1].sold, true);
});

test("the nav's link to the sold archive does not retire the car beside it", () => {
  // Every page on every rooftop links href="/vehicles/sold" from its nav and
  // again from its footer — and the last tile on a page has no tile after it
  // to bound its slice. The sold test reads CLASS attributes only, and stops
  // 4,000 characters past the tile's opening tag, so neither can reach it.
  assert.equal(
    dealerAccelerateEntries(GATEWAY_SRP, GATEWAY_URL).every((e) => e.sold === false),
    true,
  );
  assert.equal(
    dealerAccelerateEntries(MOTORCARSTUDIO_SRP, "https://www.motorcarstudio.com/vehicles")[0].sold,
    false,
  );
});

test("every car on the sold archive is sold, marked or not", () => {
  const entries = dealerAccelerateEntries(GATEWAY_SOLD, "https://www.gatewayclassiccars.com/vehicles/sold");
  assert.equal(entries.length, 1);
  assert.equal(entries.every((e) => e.sold), true);
  // Even a tile the theme forgot to mark: the route is the answer.
  const unmarked = GATEWAY_SOLD.replace(/\bsold\b/g, "x").replace(/\bSold\b/g, "X");
  assert.equal(
    dealerAccelerateEntries(unmarked, "https://www.gatewayclassiccars.com/vehicles/sold").every((e) => e.sold),
    true,
  );
});

test("isDealerAccelerateSold reads a sold VDP on each rooftop's terms", () => {
  // gateway keeps the Vehicle node and flips availability to SoldOut.
  assert.equal(
    isDealerAccelerateSold(GATEWAY_SOLD_VDP, "https://www.gatewayclassiccars.com/vehicles/kcm/1440/1966-dodge-charger"),
    true,
  );
  // streetside publishes no JSON-LD on any VDP, so the theme's class is it.
  assert.equal(
    isDealerAccelerateSold(STREETSIDE_SOLD_VDP, "https://www.streetsideclassics.com/vehicles/9185-atl/1931-ford-model-a"),
    true,
  );
  // Any page on the archive route, whatever it says.
  assert.equal(isDealerAccelerateSold("<html></html>", "https://www.classicautomall.com/vehicles/sold"), true);
});

test("a live VDP is not retired by the sold car in its related-vehicles rail", () => {
  // The rail is SRP markup — sold ribbon and all — dropped under a live car.
  // The platform's own availability decides both ways, so InStock wins over a
  // neighbour's class. Losing a live car here would cost coverage; publishing
  // a sold one would cost a shopper.
  assert.equal(
    isDealerAccelerateSold(GATEWAY_LIVE_VDP, "https://www.gatewayclassiccars.com/vehicles/san/1300/1983-mercedes-benz-380-sl"),
    false,
  );
  assert.equal(
    isDealerAccelerateSold(STREETSIDE_LIVE_VDP, "https://www.streetsideclassics.com/vehicles/5450-nsh/1961-chevrolet-corvette"),
    false,
  );
  assert.equal(isDealerAccelerateSold(undefined, "https://www.classicautomall.com/vehicles/8718/2017-mercedes-benz-slc"), false);
});

// ─────────────────────────────────────────────────────────────────────────────
// slugName
// ─────────────────────────────────────────────────────────────────────────────

test("slugName reads the platform's own year-led identity, trim included", () => {
  // The trim is where a plug-in's badge lives, and this slug is the only place
  // every theme prints it.
  assert.equal(
    slugName("https://www.gatewayclassiccars.com/vehicles/tul/882/1984-pontiac-fiero-se-indy-pace-car-limited-edition"),
    "1984 pontiac fiero se indy pace car limited edition",
  );
  assert.equal(slugName("https://www.streetsideclassics.com/vehicles/5252-phx/1973-ford-f-100-ls3-restomod"), "1973 ford f 100 ls3 restomod");
  assert.equal(slugName("https://www.gatewayclassiccars.com/vehicles/sold"), undefined);
  assert.equal(slugName(undefined), undefined);
});
