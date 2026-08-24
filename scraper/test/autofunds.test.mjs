import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isAutoFunds,
  isAutoFundsFeed,
  autoFundsFeedUrl,
  autoFundsVehicles,
  autoFundsNeedsVdp,
  autoFundsTrim,
  autoFundsPriceReadings,
  resolveAutoFundsPrice,
  autoFundsMicrodataCondition,
  autoFundsPathCondition,
  autoFundsVdpFacts,
  applyAutoFundsVdp,
  enrichFromAutoFunds,
} from "../lib/platforms/autofunds.mjs";
import { classifyEv } from "../lib/ev.mjs";
import { normalize } from "../lib/normalize.mjs";
import { publishedCondition } from "../lib/condition.mjs";
import { AUTOFUNDS_INTERNET, AUTOFUNDS_REDUCED } from "../lib/price-provenance.mjs";

// A trimmed but structurally faithful /rss.aspx: the platform's own namespace
// and three items — the live greenlightautocorona.com 530e (whose engine field
// says nothing about a plug), a petrol Elantra, and a Leaf whose engine field
// does name the powertrain.
const item = (fields) => `<item>${fields}</item>`;
const FEED = `<?xml version="1.0" encoding="UTF-8" ?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:addItem="https://www.greenlightautocorona.com/Dealer-Websites/Green-Light-Auto-CA"><channel><title><![CDATA[Used cars for sale in Corona | CA]]></title>
${item(
  `<title><![CDATA[2018 BMW 5 Series Hybrid Sedan]]></title><description><![CDATA[2018 BMW 5 Series Hybrid Sedan 4 Cylinder Engine Exterior Color: Black 77840]]></description><link>https://www.greenlightautocorona.com/2018-BMW-5-Series-Hybrid-Corona-CA/used_car/mbSe3Hx17ys%3d</link><addItem:year>2018</addItem:year><addItem:make>BMW</addItem:make><addItem:model><![CDATA[5 Series Hybrid]]></addItem:model><addItem:trim><![CDATA[530e iPerformance Plug-In Hybrid]]></addItem:trim><addItem:vin>WBAJA9C54JE032661</addItem:vin><addItem:engine><![CDATA[2 4 Cylinder Engine]]></addItem:engine><addItem:transmission>Automatic</addItem:transmission><addItem:miles>77840</addItem:miles><addItem:images><addItem:image>https://images.autofunds.net/InventoryImages/2026/08/a.jpg</addItem:image><addItem:image>https://images.autofunds.net/InventoryImages/2026/08/b.jpg</addItem:image></addItem:images>`,
)}
${item(
  `<title><![CDATA[2012 Hyundai Elantra Sedan]]></title><link>https://www.greenlightautocorona.com/2012-Hyundai-Elantra-Corona-CA/used_car/aaa%3d</link><addItem:year>2012</addItem:year><addItem:make>Hyundai</addItem:make><addItem:model><![CDATA[Elantra]]></addItem:model><addItem:trim><![CDATA[4dr Sdn Auto GLS PZEV]]></addItem:trim><addItem:vin>5NPDH4AE3CH118241</addItem:vin><addItem:engine><![CDATA[1.8 4 Cylinder Engine]]></addItem:engine><addItem:miles>124000</addItem:miles>`,
)}
${item(
  `<title><![CDATA[2019 Nissan Leaf Hatchback]]></title><link>https://www.greenlightautocorona.com/2019-Nissan-Leaf-Corona-CA/used_car/bbb%3d</link><addItem:year>2019</addItem:year><addItem:make>Nissan</addItem:make><addItem:model><![CDATA[Leaf]]></addItem:model><addItem:trim><![CDATA[SV Hatchback]]></addItem:trim><addItem:vin>1N4AZ1CP4KC308001</addItem:vin><addItem:engine><![CDATA[Electric]]></addItem:engine><addItem:miles>41000</addItem:miles>`,
)}
</channel></rss>`;

// The VDP's price block as the platform renders it: a CompoundPriceSpecification
// whose second priceComponent is the estimated MONTHLY PAYMENT — $360 next to a
// $15,990 car (greenlightautocorona.com, 2026-08-23).
const priceArea = (price, monthly) => `
<div id="htmDivInvDetailsPriceArea" class="price-group" itemprop="offers" itemscope="" itemtype="http://schema.org/Offer"><div itemscope='' id='InvDetailsPriceDiv' itemprop='priceSpecification' itemtype='http://schema.org/CompoundPriceSpecification'><div class='pricetag50'><div class='inv-price internet-price DWInvListPriceSpan' id='DWInvPriceSpan' itemscope='' itemprop='priceComponent' itemtype='http://schema.org/UnitPriceSpecification'><span class='DwNoDisplay' itemprop='name'>Internet Price</span><span itemprop='priceCurrency' content='USD'>$</span><span itemprop='price' content='${price}'>${price}</span></div></div><a class='dwHrefPaymentPrice' href="/finance.aspx"><div class="pricetag50"><div class="monthly-Ins DWPayment" id="monthly-Ins" itemscope='' itemprop='priceComponent' itemtype='http://schema.org/UnitPriceSpecification'><span itemprop='priceCurrency' content='USD'>$</span><span id='monthly-Ins-Price' itemprop='price' content='${monthly}'>${monthly}</span><p id='monthly-Ins-PriceSet' itemprop='unitText'>Monthly</p></div></div></a><span class='DwNoDisplay' itemprop='price' content='${price}'></span></div><span class='dw-none DwNoDisplay'><link itemprop='availability' href='http://schema.org/InStock'>In stock</span><div Class='DwNoDisplay' itemprop='price' content='${price}'></div></div>`;

const condSpan = (kind) =>
  `<h1><span itemprop='name'><span class='Vstatus DwNoDisplay' itemprop='itemCondition' itemscope='' itemtype='https://schema.org/OfferItemCondition'><link itemprop='url' href='https://schema.org/${kind}Condition'>${kind}&nbsp;</span><span itemprop='vehicleModelDate'>2018</span></span></h1>`;

const vdp = ({ price = 15990, monthly = 360, cond = "Used", fuel = "Plug-In Electric/Gas", internet = price, extra = "" }) => `<!doctype html><html><head>
<link href="/2/aspx/HttpCombiner.ashx?s=DW_Common&amp;t=css" rel="stylesheet"/></head><body>
${condSpan(cond)}
${priceArea(price, monthly)}
<input type="hidden" id="hdnInventoryVin" value="WBAJA9C54JE032661" />
<input type="hidden" id="hdnInventoryNewOrUsed" value="true" />
<input type="hidden" id="hdnFuelType" value="${fuel}" />
<input type="hidden" id="hdnStock" value="032661" />
<input type="hidden" id="hdnExteriorColor" value="Black" />
<input type="hidden" id="hdnMilesOut" value="77840" />
<input type="hidden" id="hdnInternetPrice" value="${internet}" />
<input type="hidden" id="hdnReducedPrice" value="0" />
<input type="hidden" id="hdnDealerName" value="Green Light Auto" />
<input type="hidden" id="hdnDealerCity" value="Corona" />
<input type="hidden" id="hdnDealerState" value="CA" />
${extra}
</body></html>`;

// sunriseautosales.com's marked-down shape, live 2026-08-23: the Internet
// Price struck through, a "Now Only" Reduced Price beside it, the Offer's own
// bare price repeating the reduced one, and a WEEKLY payment estimate.
const MARKDOWN_VDP = `<!doctype html><html><head><link href="/2/aspx/HttpCombiner.ashx?s=DW_Common" rel="stylesheet"/></head><body>
${condSpan("Used")}
<div id="htmDivInvDetailsPriceArea" class="price-group" itemprop="offers" itemscope="" itemtype="http://schema.org/Offer"><div itemscope='' itemprop='priceSpecification' itemtype='http://schema.org/CompoundPriceSpecification'><div class='pricetag invv-priceStrike'><div class='inv-price DWInvListPriceSpan' id='DWInvPriceSpan' itemscope='' itemprop='priceComponent' itemtype='http://schema.org/UnitPriceSpecification'><span class='DwNoDisplay' itemprop='name'>Internet Price</span><span itemprop='priceCurrency' content='USD'>$</span><span itemprop='price' content='32995'>32,995</span></div></div><div class="pricetag" id='DwInvPriceReduced'><p id='DwInvPriceReducedNowOnly'> Now Only</p><div class="internet-price iRprice" id='DwInvPriceReducedPrice' itemscope='' itemprop='priceComponent' itemtype='http://schema.org/UnitPriceSpecification' > <span class='DwNoDisplay' itemprop='name'>Reduced Price</span><span itemprop='priceCurrency' content='USD'>$</span><span itemprop='price' content='29995'>29,995</span></div></div><span class='DwNoDisplay' itemprop='price' content='29995'></span><a class='dwHrefPaymentPrice' href="/Get-Financing.aspx"><div class="pricetag"><div class="monthly-Ins DWPayment" id="monthly-Ins" itemscope='' itemprop='priceComponent' itemtype='http://schema.org/UnitPriceSpecification'><span itemprop='priceCurrency' content='USD'>$</span><span id='monthly-Ins-Price' itemprop='price' content='116'>116</span><p id='monthly-Ins-PriceSet' itemprop='unitText'>Weekly</p></div></div></a></div><span class='dw-none DwNoDisplay'><link itemprop='availability' href="https://schema.org/InStock">In stock</span></div>
<input type="hidden" id="hdnInternetPrice" value="32995" />
<input type="hidden" id="hdnReducedPrice" value="29995" />
<input type="hidden" id="hdnFuelType" value="Electric Fuel System" />
</body></html>`;

// nolimitautosales.com, live 2026-08-23: no price published at all, and the
// whole (used) lot flagged NewCondition.
const CALL_FOR_PRICE_VDP = `<!doctype html><html><head><link href="/2/aspx/HttpCombiner.ashx?s=DW_Common" rel="stylesheet"/></head><body>
${condSpan("New")}
<div id="htmDivInvDetailsPriceArea" class="price-group" itemprop="offers" itemscope="" itemtype="http://schema.org/Offer"><div class="pricetag pricetag100 financeonly0"><div class='DwNoDisplay' itemprop='price' content='0'></div><div class='DwNoDisplay' itemscope='' itemprop='priceSpecification' itemtype='http://schema.org/UnitPriceSpecification'><span itemprop='name' content='Internet Price'></span><span itemprop='price' content='0'>0</span></div><div class='callnowprice' id='DWDetailsNoPrice'>CALL FOR PRICE!</div></div></div>
<input type="hidden" id="hdnInventoryNewOrUsed" value="true" />
<input type="hidden" id="hdnFuelType" value="Electric Fuel" />
<input type="hidden" id="hdnInternetPrice" value="0" />
</body></html>`;

const VDP_URL = "https://www.greenlightautocorona.com/2018-BMW-5-Series-Hybrid-Corona-CA/used_car/mbSe3Hx17ys%3d";

test("the platform is recognised by its own hosts and its feed by its own namespace", () => {
  assert.equal(isAutoFunds(vdp({})), true);
  assert.equal(isAutoFunds("<html>we fund autos</html>"), false);
  assert.equal(isAutoFunds(undefined), false);
  assert.equal(isAutoFundsFeed(FEED), true);
  // Any other CMS answering /rss.aspx with a blog is not this platform.
  assert.equal(isAutoFundsFeed(`<rss version="2.0"><channel><item><title>Blog</title></item></channel></rss>`), false);
  assert.equal(autoFundsFeedUrl("https://www.stsautos.com"), "https://www.stsautos.com/rss.aspx");
  assert.equal(autoFundsFeedUrl("https://www.stsautos.com/"), "https://www.stsautos.com/rss.aspx");
});

test("the feed yields one node per VIN, with the fields it actually carries", () => {
  const vehicles = autoFundsVehicles(FEED);
  assert.equal(vehicles.length, 3);
  const [bmw] = vehicles;
  assert.equal(bmw.vehicleIdentificationNumber, "WBAJA9C54JE032661");
  assert.equal(bmw.vehicleModelDate, "2018");
  assert.equal(bmw.brand, "BMW");
  assert.equal(bmw.model, "5 Series Hybrid");
  assert.equal(bmw.vehicleConfiguration, "530e iPerformance Plug-In Hybrid");
  assert.equal(bmw.mileageFromOdometer.value, 77840);
  assert.deepEqual(bmw.image, [
    "https://images.autofunds.net/InventoryImages/2026/08/a.jpg",
    "https://images.autofunds.net/InventoryImages/2026/08/b.jpg",
  ]);
  assert.equal(bmw.offers.url, VDP_URL);
  // The feed has no price and the node must not invent one.
  assert.equal(bmw.offers.price, undefined);
  assert.equal(autoFundsVehicles("<html>not a feed</html>").length, 0);
});

test("a car with no VIN, or the same VIN twice, is not two cars", () => {
  const dup = FEED.replace("5NPDH4AE3CH118241", "WBAJA9C54JE032661").replace(
    "<addItem:vin>1N4AZ1CP4KC308001</addItem:vin>",
    "",
  );
  assert.deepEqual(
    autoFundsVehicles(dup).map((v) => v.vehicleIdentificationNumber),
    ["WBAJA9C54JE032661"],
  );
});

test("the monthly payment in the price slot is never read as a price", () => {
  // $360 is the estimated payment on the same $15,990 car. Taking it — as
  // "lowest price" or "first itemprop=price" would — is the false bargain
  // lib/price-floor.mjs exists for, on this platform's entire priced inventory.
  const readings = autoFundsPriceReadings(vdp({}));
  assert.deepEqual(readings.internet, [15990]);
  assert.deepEqual(readings.payments, [360]);
  assert.deepEqual(readings.reduced, []);
  assert.deepEqual(readings.bare, [15990]);
  const facts = autoFundsVdpFacts(vdp({}), VDP_URL, { year: 2018 });
  assert.equal(facts.priceUsd, 15990);
  assert.equal(facts.priceProvenance, AUTOFUNDS_INTERNET);
});

test("a marked-down car asks its 'Now Only' price, never the struck-through one", () => {
  // sunriseautosales.com's 2021 Model Y, live 2026-08-23: Internet Price
  // 32,995 wrapped in invv-priceStrike, "Now Only" 29,995, and the Offer's own
  // bare price 29,995. Publishing 32,995 would overstate a car the dealer has
  // marked down; the rung gets its own provenance so the markdown cannot pair
  // with the old reading into a price cut computed across two fields.
  const readings = autoFundsPriceReadings(MARKDOWN_VDP);
  assert.deepEqual(readings.internet, [32995]);
  assert.deepEqual(readings.reduced, [29995]);
  assert.deepEqual(readings.bare, [29995]);
  assert.deepEqual(readings.payments, [116]);
  assert.deepEqual(resolveAutoFundsPrice(MARKDOWN_VDP), {
    priceUsd: 29995,
    priceProvenance: AUTOFUNDS_REDUCED,
  });
  assert.notEqual(AUTOFUNDS_REDUCED, AUTOFUNDS_INTERNET);
});

test("a 'reduction' that is not one, or that reduces nothing, abstains", () => {
  const higher = MARKDOWN_VDP.replace(/content='29995'/g, "content='39995'").replace(/29,995/g, "39,995");
  assert.equal(resolveAutoFundsPrice(higher).priceUsd, 0);
  // A "Now Only" with no price above it to have come down from: the page is
  // claiming a reduction it does not show, so we claim nothing.
  const orphan = MARKDOWN_VDP.replace(
    /<div class='pricetag invv-priceStrike'>[\s\S]*?<\/div><\/div>/,
    "",
  );
  assert.deepEqual(autoFundsPriceReadings(orphan).internet, []);
  assert.equal(resolveAutoFundsPrice(orphan).priceUsd, 0);
});

test("the Offer's own price has to be the price we picked", () => {
  // A bare Offer price naming a third figure means the page is a shape nobody
  // has characterised — not an invitation to choose.
  const mismatch = vdp({}).replace(
    "<div Class='DwNoDisplay' itemprop='price' content='15990'></div>",
    "<div Class='DwNoDisplay' itemprop='price' content='13990'></div>",
  );
  assert.equal(resolveAutoFundsPrice(mismatch).priceUsd, 0);
});

test("no published price is an abstain, not a zero-dollar car and not the hidden field", () => {
  const facts = autoFundsVdpFacts(CALL_FOR_PRICE_VDP, "https://www.nolimitautosales.com/x/used_car/y", { year: 2021 });
  // 0 keeps the car and makes no claim (ingest.mjs drops null, keeps 0).
  assert.equal(facts.priceUsd, 0);
  assert.equal(facts.priceProvenance, undefined);
});

test("the hidden back-office price is not consulted, in either direction", () => {
  // huntingtonautomall.net's 2021 Model 3 renders "Internet Price 26,999 / Now
  // Only 25,500" while hdnInternetPrice holds 23,900 — a number no shopper
  // sees. Reading it would publish a $23,900 ask; requiring it to agree would
  // abstain on a car whose ask the page states twice.
  const facts = autoFundsVdpFacts(vdp({ price: 15990, internet: 13900 }), VDP_URL, { year: 2018 });
  assert.equal(facts.priceUsd, 15990);
  assert.equal(facts.priceProvenance, AUTOFUNDS_INTERNET);
});

test("two prices under one label are a ladder nobody has characterised", () => {
  const ladder = vdp({}).replace(
    "<span itemprop='price' content='15990'>15990</span></div></div>",
    "<span itemprop='price' content='15990'>15990</span></div></div><div class='inv-price DWInvListPriceSpan'><span itemprop='price' content='17990'>17,990</span></div>",
  );
  assert.equal(autoFundsPriceReadings(ladder).internet.length, 2);
  assert.equal(autoFundsVdpFacts(ladder, VDP_URL, { year: 2018 }).priceUsd, 0);
});

test("a sub-floor number in the price slot is a payment or a fee, not an ask", () => {
  // $1,280 on a late-model car is the live dealer.com case in price-floor.mjs.
  const facts = autoFundsVdpFacts(vdp({ price: 1280, internet: 1280 }), VDP_URL, { year: 2021 });
  assert.equal(facts.priceUsd, 0);
  assert.equal(facts.priceProvenance, undefined);
});

test("condition needs both machine signals to agree", () => {
  assert.equal(autoFundsMicrodataCondition(vdp({})), "used");
  assert.equal(autoFundsPathCondition(VDP_URL), "used");
  assert.equal(autoFundsVdpFacts(vdp({}), VDP_URL, { year: 2018 }).condition, "used");

  // nolimitautosales.com: NewCondition stamped on a used lot the platform
  // itself routes under /used_car/. Neither signal wins; the row says nothing
  // and publishedCondition falls back to the path, which matched the cars.
  const facts = autoFundsVdpFacts(CALL_FOR_PRICE_VDP, "https://www.nolimitautosales.com/2020-Acura-TLX/used_car/z", {
    year: 2020,
  });
  assert.equal(facts.condition, undefined);
  assert.equal(publishedCondition({ condition: facts.condition, sourceUrl: "https://x/2020-Acura-TLX/used_car/z" }), "used");

  // A genuinely new car — both signals saying new — is published as new.
  const newFacts = autoFundsVdpFacts(vdp({ cond: "New" }), "https://x/2026-Kia-EV9/new_car/q", { year: 2026 });
  assert.equal(newFacts.condition, "new");
});

test("the VDP's fuel field decides the powertrain, and can only ever weaken a name match", () => {
  const [bmw] = autoFundsVehicles(FEED);
  // The feed alone: the nameplate carries it, and only as a name match.
  assert.deepEqual(classifyEv(bmw), { isEv: true, kind: "PHEV?", confidence: "name_match" });
  const merged = applyAutoFundsVdp(bmw, autoFundsVdpFacts(vdp({}), VDP_URL, { year: 2018 }));
  assert.deepEqual(classifyEv(merged), { isEv: true, kind: "PHEV", confidence: "high" });

  // …and a VDP that says petrol sends the same car back to the name match for
  // vPIC to settle, rather than shipping on the nameplate's say-so.
  const petrol = applyAutoFundsVdp(bmw, autoFundsVdpFacts(vdp({ fuel: "Gasoline Fuel" }), VDP_URL, { year: 2018 }));
  assert.equal(classifyEv(petrol).confidence, "name_match");
});

test("a sales pitch in the trim column is not a version of the car", () => {
  // All live strings from the cohort's feeds, 2026-08-23.
  assert.equal(autoFundsTrim("CLEAN CARFAX"), undefined);
  assert.equal(autoFundsTrim("1 OWNER * FACTORY SERVICED"), undefined);
  assert.equal(autoFundsTrim("*CLEAN CARFAX * ALL THE OPTIONS"), undefined);
  assert.equal(autoFundsTrim(". CLEAN CARFAX! 71K ORIGINAL MILES!"), undefined);
  // …and where a real version comes first, the version survives.
  assert.equal(autoFundsTrim("Touring L CLEAN CARFAX! LOADED VEHICLE!"), "Touring L");
  assert.equal(autoFundsTrim("EX AWD  CLEAN CARFAX!!!"), "EX AWD");
  assert.equal(autoFundsTrim("S CVT  LOW MILES!!!"), "S CVT");
  // The catalogue's own availability annotation is not part of the name.
  assert.equal(autoFundsTrim("Overland 4x4 *Ltd Avail*"), "Overland 4x4");
  assert.equal(autoFundsTrim("Performance AWD *Ltd Avail*"), "Performance AWD");
  // An ordinary trim is untouched, including the plug-in badge classifyEv reads.
  assert.equal(autoFundsTrim("530e iPerformance Plug-In Hybrid"), "530e iPerformance Plug-In Hybrid");
  assert.equal(autoFundsTrim("4dr Sdn 2.4L Auto GLS"), "4dr Sdn 2.4L Auto GLS");
  assert.equal(autoFundsTrim(""), undefined);
  assert.equal(autoFundsTrim(undefined), undefined);
});

test("only cars that could be electrified earn a VDP fetch", () => {
  const [bmw, elantra, leaf] = autoFundsVehicles(FEED);
  assert.equal(autoFundsNeedsVdp(bmw, classifyEv(bmw).isEv), true);
  assert.equal(autoFundsNeedsVdp(leaf, classifyEv(leaf).isEv), true);
  // A petrol Elantra whose trim says PZEV is not a plug-in and costs nothing.
  assert.equal(autoFundsNeedsVdp(elantra, classifyEv(elantra).isEv), false);
  // A nameplate this project does not know still gets its VDP read, because
  // the feed carries no fuel field and only the VDP can settle it.
  const focus = {
    name: "2016 Ford Focus Electric Hatchback",
    model: "Focus Electric",
    vehicleEngine: { name: "" },
  };
  assert.equal(classifyEv(focus).isEv, false);
  assert.equal(autoFundsNeedsVdp(focus, false), true);
});

test("a feed row plus its VDP becomes the record the pipeline stores", () => {
  const [bmw] = autoFundsVehicles(FEED);
  const facts = autoFundsVdpFacts(vdp({}), VDP_URL, { year: 2018 });
  const rec = enrichFromAutoFunds(
    normalize(applyAutoFundsVdp(bmw, facts), { sourceUrl: VDP_URL, dealerDomain: "greenlightautocorona.com" }),
    facts,
  );
  assert.equal(rec.vin, "WBAJA9C54JE032661");
  assert.equal(rec.year, 2018);
  assert.equal(rec.make, "BMW");
  assert.equal(rec.model, "5 Series Hybrid");
  assert.equal(rec.trim, "530e iPerformance Plug-In Hybrid");
  assert.equal(rec.mileage, 77840);
  assert.equal(rec.priceUsd, 15990);
  assert.equal(rec.priceProvenance, AUTOFUNDS_INTERNET);
  assert.equal(rec.exteriorColor, "Black");
  assert.equal(rec.stockNumber, "032661");
  assert.equal(rec.dealerName, "Green Light Auto");
  assert.equal(rec.city, "Corona");
  assert.equal(rec.state, "CA");
  assert.equal(rec.platform, "autofunds");
  assert.equal(rec.vdpUrl, VDP_URL);
  assert.equal(publishedCondition(rec), "used");
  assert.equal(rec.images.length, 2);
});
