import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isAutoCorner,
  isSitemap,
  autoCornerSitemapUrl,
  sitemapLocs,
  parseAutoCornerSlug,
  autoCornerVehicles,
  autoCornerNeedsVdp,
  autoCornerDetails,
  autoCornerPrice,
  autoCornerVdpFacts,
  applyAutoCornerVdp,
  enrichFromAutoCorner,
} from "../lib/platforms/autocorner.mjs";
import { fingerprint } from "../lib/fingerprint.mjs";
import { classifyEv } from "../lib/ev.mjs";
import { normalize } from "../lib/normalize.mjs";
import { publishedCondition } from "../lib/condition.mjs";
import { isKnownMake } from "../lib/makes.mjs";
import { AUTOCORNER_PRICE } from "../lib/price-provenance.mjs";

// ── Fixtures ───────────────────────────────────────────────────────────────
// Every URL below is a live <loc> copied out of the rooftop's own
// /sitemap.xml on 2026-08-31, except the two marked CONSTRUCTED.
const LOCS = {
  // madisonmotors.com — the recon rooftop.
  f150: "https://www.madisonmotors.com/vehicles/1ftex1epxgfb94914-2016-ford-f-150/C14AC492-A32E-11F1-B82A-12A0F78B64F0",
  bmw1: "https://www.madisonmotors.com/vehicles/wbaup9c5xcvs94133-2012-bmw-1-series/98CAEAE0-A259-11F1-816B-97A0F78B64F0",
  // sandiegocarforsale.com — the cohort's one battery-electric car.
  leaf: "https://www.sandiegocarforsale.com/vehicles/1n4az1cp7jc304876-2018-nissan-leaf/198A587E-6D43-11F1-8CA9-DD83E6D934A4",
  // westsidecars.com — the platform's noisiest slug tail: trim and drivetrain
  // words run on after the model, and "i4" here is an engine label.
  rav4: "https://www.westsidecars.com/vehicles/jtmdf4dv7ad025453-2010-toyota-rav4-limited-i4-4wd-4-speed-automatic/04FD8B5DD634BB5CF20FA1FEDB03D17FB73114425ABCC4FDFA301C0BAD68B62A",

  // ── The VIN-less pile. All five live, all refused. ──
  // madisonmotors.com: not a vehicle at all.
  camper: "https://www.madisonmotors.com/vehicles/discount-camper-shells/A978A37A-44C4-11F1-95E7-8AEF1B981250",
  // westsidecars.com: year-first, no VIN in the slug.
  silverado: "https://www.westsidecars.com/vehicles/2007-chevrolet-silverado-lt/30F0328D7CC7B419B7D285C41080B8D296B3319853CA1F44194D84CD73D0D983",
  // palmbeachexotic.com: a stock number where the VIN goes.
  bentley: "https://www.palmbeachexotic.com/vehicles/drb15872-1973-bentley-cornish/48F47F1A-324C-11EF-A0C5-77B94EC952D4",
  // palmbeachexotic.com: a real 15-character pre-1981-format VIN.
  ferrari: "https://www.palmbeachexotic.com/vehicles/zff76zfa2f02117-2015-ferrari-la-ferrari/9824CD246FC3454B763FD53EF45A5214F9E3D5FD4514654B685BF78349B98909",
  // dandnautosales.com: EIGHTEEN characters — a mistyped VIN, and the one that
  // would parse as a real one without the trailing anchor.
  equinox: "https://www.dandnautosales.com/vehicles/2gnnaldek4c1126598-2012-chevrolet-equinox/B7FE2600-91F3-11F1-8798-661266ADD044",

  // CONSTRUCTED, in the platform's own slug grammar: no cohort rooftop
  // currently stocks a two-word make or a hyphen-spelled EV nameplate, and
  // both are the cases the parser exists to get right.
  eqe: "https://www.example-autocorner-rooftop.com/vehicles/w1kbg0db4pa000123-2023-mercedes-benz-eqe-350/AAAAAAAA-0000-11F1-0000-000000000000",
  etron: "https://www.example-autocorner-rooftop.com/vehicles/wa1vaaage9b000456-2021-audi-e-tron/BBBBBBBB-0000-11F1-0000-000000000000",
};

const sitemap = (urls) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  `<url><loc>https://www.madisonmotors.com/</loc></url>\n` +
  `<url><loc>https://www.madisonmotors.com/docs/vehicle_search.html</loc></url>\n` +
  urls.map((u) => `<url><loc>${u}</loc><lastmod>2026-08-30</lastmod></url>`).join("\n") +
  `\n</urlset>`;

// The details table exactly as madisonmotors.com renders it (2026-08-31): one
// long line, both spans adjacent, the whole block wrapped in Tailwind soup.
const detailsTable = (rows) =>
  `<div class="[&>div]:w-full [&>div]:flex">` +
  rows
    .map(
      ([k, v]) =>
        `<div class="details_item"><span class="details_item_span1">${k}</span><span class="details_item_span2">${v}</span></div>`,
    )
    .join("\n\t\t\t\t\t\t") +
  `</div>`;

const vdp = ({ rows, image = "https://photos.autocorner.com/640x480/hlIrHYZT85RPN9ZeqY28rX9oJnBt91Ex.jpg", desc = "" }) =>
  `<!doctype html><html><head>
<link rel="stylesheet" href="https://js-include.autocorner.com/css/pannellum.css?1747161921">
<script src="https://js-include.autocorner.com/javascript/return_search.js?999"></script>
<meta property="og:image" content="${image}">
<meta property="og:description" content="${desc}">
</head><body>
<h2>Vehicle Information</h2>
${detailsTable(rows)}
</body></html>`;

// madisonmotors.com's 2016 F-150, every row as served.
const F150_ROWS = [
  ["Price", "$23,850"],
  ["VIN", "1FTEX1EPXGFB94914"],
  ["Year", "2016"],
  ["Make", "Ford"],
  ["Model", "F-150"],
  ["Stock #", "MF23680"],
  ["Odometer", "61,890 Miles"],
  ["Exterior Color", "Blue"],
  ["Interior Color", "Tan"],
  ["Engine", "2.7L V6 DOHC 24V"],
  ["Transmission", "6-Speed Automatic"],
  ["Drive Train", "4WD"],
  ["Body", "Extended Cab"],
  ["Doors", "4"],
  ["MPG City", "18"],
  ["MPG Highway", "23"],
  ["Title", "clean"],
];

// sandiegocarforsale.com's 2018 Leaf. Note what is MISSING: no Transmission,
// no Drive Train, no MPG, no Doors — the row set varies per car.
const LEAF_ROWS = [
  ["Price", "$5,995"],
  ["VIN", "1N4AZ1CP7JC304876"],
  ["Year", "2018"],
  ["Make", "Nissan"],
  ["Model", "LEAF"],
  ["Stock #", "GGleaf"],
  ["Odometer", "137,000 Miles"],
  ["Exterior Color", "Pearl White/Super Black"],
  ["Interior Color", "Black"],
  ["Engine", "Electric 147hp 236ft. lbs."],
  ["Body", "Hatchback"],
];

// palmbeachexotic.com's 2015 LaFerrari — the live "Call For Price".
const FERRARI_ROWS = [
  ["Price", "Call For Price"],
  ["VIN", "ZFF76ZFA2F02117"],
  ["Year", "2015"],
  ["Make", "Ferrari"],
  ["Model", "LA FERRARI"],
  ["Odometer", "401 Miles"],
];

// ── Fingerprint ────────────────────────────────────────────────────────────

test("fingerprint and isAutoCorner agree, and anchor on the vendor's script host", () => {
  const page = vdp({ rows: F150_ROWS });
  assert.equal(fingerprint(page), "autocorner");
  assert.equal(isAutoCorner(page), true);

  // Each mark on its own, as it appears in the live markup.
  for (const mark of [
    '<link href="https://js-include.autocorner.com/css/pannellum.css?1747161921" rel="stylesheet"/>',
    '<script src="https://js-include.autocorner.com/javascript/return_search.js?999??1698178991"></script>',
  ]) {
    assert.equal(isAutoCorner(mark), true);
    assert.equal(fingerprint(mark), "autocorner");
  }
});

test("the bare vendor word is not the signal", () => {
  // kingautocorner.com is a real dealer domain in registry.json and is NOT on
  // this platform. Its name must not fingerprint as one.
  const page = '<html><body><a href="https://www.kingautocorner.com/">King Auto Corner</a></body></html>';
  assert.equal(isAutoCorner(page), false);
  assert.notEqual(fingerprint(page), "autocorner");
  assert.equal(isAutoCorner(undefined), false);
  assert.equal(isAutoCorner(null), false);
  assert.equal(isAutoCorner(12), false);
});

// ── Slug parsing ───────────────────────────────────────────────────────────

test("a VIN-led slug yields the car it names", () => {
  assert.deepEqual(parseAutoCornerSlug(LOCS.f150), {
    vin: "1FTEX1EPXGFB94914",
    year: "2016",
    make: "Ford",
    model: "F 150",
    name: "2016 Ford F 150",
    slug: "1ftex1epxgfb94914-2016-ford-f-150",
  });

  const leaf = parseAutoCornerSlug(LOCS.leaf);
  assert.equal(leaf.vin, "1N4AZ1CP7JC304876");
  assert.equal(leaf.year, "2018");
  assert.equal(leaf.make, "Nissan");
  assert.equal(leaf.model, "Leaf");

  // The slug erases the difference between a model hyphen and a word hyphen,
  // so "1-series" comes back spaced. Good enough to screen and to classify;
  // the VDP's own Model row replaces it for anything that gets published.
  assert.equal(parseAutoCornerSlug(LOCS.bmw1).model, "1 Series");

  // The noisy tail is kept whole rather than cut at a guessed trim boundary.
  assert.equal(parseAutoCornerSlug(LOCS.rav4).model, "Rav4 Limited I4 4wd 4 Speed Automatic");
});

test("a two-word make is one make, spelled the way the allowlist spells it", () => {
  const eqe = parseAutoCornerSlug(LOCS.eqe);
  assert.equal(eqe.make, "Mercedes-Benz");
  assert.equal(eqe.model, "Eqe 350");
  assert.equal(eqe.name, "2023 Mercedes-Benz Eqe 350");
  // The point of the canonical spelling: "Mercedes Benz" is not a known make.
  assert.equal(isKnownMake(eqe.make), true);
});

test("an unknown make is handed over as the slug wrote it, not invented", () => {
  // CONSTRUCTED in the platform's grammar. MG is not in KNOWN_MAKES, so the
  // first word is read as the make and vpic-enrich repairs it from the VIN.
  const p = parseAutoCornerSlug(
    "https://www.example-autocorner-rooftop.com/vehicles/sarrdnbm8ad000789-1980-mg-mgb-roadster/CCCCCCCC-0000-11F1-0000-000000000000",
  );
  assert.equal(p.make, "Mg");
  assert.equal(p.model, "Mgb Roadster");
});

test("every VIN-less slug in the cohort is refused", () => {
  for (const key of ["camper", "silverado", "bentley", "ferrari", "equinox"]) {
    assert.equal(parseAutoCornerSlug(LOCS[key]), undefined, key);
  }
});

test("junk in, nothing out", () => {
  for (const bad of [
    undefined,
    null,
    "",
    "not a url",
    "https://www.madisonmotors.com/",
    "https://www.madisonmotors.com/docs/vehicle_search.html",
    // A 17-character run that is not at the start of the slug.
    "https://www.madisonmotors.com/vehicles/stock-1ftex1epxgfb94914/UUID",
    // I, O and Q are not VIN characters.
    "https://www.madisonmotors.com/vehicles/1ftexiepxgfbo4914-2016-ford-f-150/UUID",
  ]) {
    assert.equal(parseAutoCornerSlug(bad), undefined, String(bad));
  }
  assert.deepEqual(autoCornerVehicles(undefined), []);
  assert.deepEqual(autoCornerVehicles(""), []);
  assert.deepEqual(autoCornerVehicles("<html><body>404 Not Found</body></html>"), []);
  assert.deepEqual(sitemapLocs(null), []);
  assert.equal(isSitemap("<html><body>Not Found</body></html>"), false);
  assert.equal(isSitemap(undefined), false);
  assert.deepEqual(autoCornerDetails(null), {});
  assert.deepEqual(autoCornerDetails("<html><body>no table here</body></html>"), {});
  assert.equal(autoCornerPrice(null), undefined);
  assert.equal(autoCornerPrice("<html></html>"), undefined);
  assert.deepEqual(autoCornerVdpFacts(null), {});
});

// ── Sitemap → whole lot ────────────────────────────────────────────────────

test("the sitemap is the whole lot, VIN'd entries only", () => {
  const xml = sitemap([LOCS.f150, LOCS.bmw1, LOCS.camper, LOCS.silverado, LOCS.ferrari, LOCS.equinox]);
  const v = autoCornerVehicles(xml, "https://madisonmotors.com");
  assert.equal(v.length, 2);
  assert.deepEqual(
    v.map((x) => x.vehicleIdentificationNumber),
    ["1FTEX1EPXGFB94914", "WBAUP9C5XCVS94133"],
  );
  // Nothing the sitemap does not say. No price above all.
  assert.equal(v[0].offers.url, LOCS.f150);
  assert.equal(v[0].offers.price, undefined);
  assert.equal(v[0].itemCondition, undefined);
  assert.equal(normalize(v[0], { sourceUrl: LOCS.f150, dealerDomain: "madisonmotors.com" }).priceUsd, undefined);
});

test("a duplicate VIN is listed once, and another host's cars are not this dealer's", () => {
  const xml = sitemap([LOCS.f150, LOCS.f150, LOCS.leaf]);
  const mine = autoCornerVehicles(xml, "https://www.madisonmotors.com");
  assert.deepEqual(
    mine.map((x) => x.vehicleIdentificationNumber),
    ["1FTEX1EPXGFB94914"],
  );
  // Same document read for the other rooftop: only its own car.
  assert.deepEqual(
    autoCornerVehicles(xml, "https://sandiegocarforsale.com").map((x) => x.vehicleIdentificationNumber),
    ["1N4AZ1CP7JC304876"],
  );
});

test("sitemap url is built off the origin the crawl already has", () => {
  assert.equal(autoCornerSitemapUrl("https://madisonmotors.com"), "https://madisonmotors.com/sitemap.xml");
  assert.equal(autoCornerSitemapUrl("https://www.madisonmotors.com/"), "https://www.madisonmotors.com/sitemap.xml");
});

// ── Candidate rule ─────────────────────────────────────────────────────────

test("only cars that could be electrified earn a VDP request", () => {
  const of = (loc) => autoCornerVehicles(sitemap([loc]))[0];

  assert.equal(autoCornerNeedsVdp(of(LOCS.leaf), false), true);
  // The hyphenated nameplate the spaced `name` destroys: "E Tron" matches no
  // list, "e-tron" matches EVISH_RE — which is why the raw slug rides along.
  const etron = of(LOCS.etron);
  assert.equal(etron.name, "2021 Audi E Tron");
  assert.equal(autoCornerNeedsVdp(etron, false), true);
  assert.equal(autoCornerNeedsVdp(of(LOCS.eqe), false), true);

  // classifyEv's verdict always wins, whatever the slug looks like.
  assert.equal(autoCornerNeedsVdp(of(LOCS.f150), true), true);
  assert.equal(autoCornerNeedsVdp(of(LOCS.f150), false), false);
  assert.equal(autoCornerNeedsVdp(of(LOCS.bmw1), false), false);

  // An EV-only WMI with a nameplate nothing recognises.
  assert.equal(
    autoCornerNeedsVdp({ vehicleIdentificationNumber: "5YJ3E1EA7JF000111", name: "2018 Sedan" }, false),
    true,
  );

  // The measured cost of the wide net: an engine label reads as a nameplate.
  assert.equal(autoCornerNeedsVdp(of(LOCS.rav4), false), true);

  assert.equal(autoCornerNeedsVdp({}, false), false);
  assert.equal(autoCornerNeedsVdp(undefined, false), false);
});

// ── The details table ──────────────────────────────────────────────────────

test("the labelled table is read row by row", () => {
  const d = autoCornerDetails(vdp({ rows: F150_ROWS }));
  assert.equal(d.price, "$23,850");
  assert.equal(d.vin, "1FTEX1EPXGFB94914");
  assert.equal(d.model, "F-150");
  assert.equal(d.stock, "MF23680");
  assert.equal(d.odometer, "61,890 Miles");
  assert.equal(d["exterior color"], "Blue");
  assert.equal(d["drive train"], "4WD");
  assert.equal(d["mpg city"], "18");
  assert.equal(d.title, "clean");

  // The Leaf renders fewer rows, and an absent row is absent — not "".
  const leaf = autoCornerDetails(vdp({ rows: LEAF_ROWS }));
  assert.equal(leaf.transmission, undefined);
  assert.equal(leaf["drive train"], undefined);
  assert.equal(leaf.engine, "Electric 147hp 236ft. lbs.");

  // Entities and nbsp, which this platform prints inside values.
  const e = autoCornerDetails(
    detailsTable([["Exterior&nbsp;Color", "Black&nbsp;&amp;&nbsp;Silver"]]),
  );
  assert.equal(e["exterior color"], "Black & Silver");
});

// ── Price ──────────────────────────────────────────────────────────────────

test("one dollar amount in the Price row is the ask", () => {
  assert.equal(autoCornerPrice(vdp({ rows: F150_ROWS })), 23850);
  assert.equal(autoCornerPrice(vdp({ rows: LEAF_ROWS })), 5995);
});

test("anything that is not one dollar amount abstains", () => {
  // Live on palmbeachexotic.com.
  assert.equal(autoCornerPrice(vdp({ rows: FERRARI_ROWS })), undefined);
  // No Price row at all.
  assert.equal(autoCornerPrice(vdp({ rows: F150_ROWS.filter(([k]) => k !== "Price") })), undefined);
  // Two different amounts — a ladder nobody has characterised.
  assert.equal(autoCornerPrice(vdp({ rows: [["Price", "$25,000 $22,500"]] })), undefined);
  // The same amount twice is still one amount.
  assert.equal(autoCornerPrice(vdp({ rows: [["Price", "$22,500 $22,500"]] })), 22500);
  // A bare number with no dollar sign is not a price claim.
  assert.equal(autoCornerPrice(vdp({ rows: [["Price", "23850"]] })), undefined);
  // A payment is never an ask.
  for (const v of ["$360/mo", "$360 per month", "$116 Weekly", "$399 monthly O.A.C."]) {
    assert.equal(autoCornerPrice(vdp({ rows: [["Price", v]] })), undefined, v);
  }
});

test("a price below the model year's floor is not this car's ask", () => {
  // No Price row: abstain, and the car keeps its listing.
  const none = autoCornerVdpFacts(vdp({ rows: F150_ROWS.filter(([k]) => k !== "Price") }), {});
  assert.equal(none.priceUsd, 0);
  assert.equal(none.priceProvenance, undefined);
  // 2016 → the $1,000 used floor; $850 does not clear it.
  const cheap = autoCornerVdpFacts(
    vdp({ rows: F150_ROWS.map(([k, v]) => (k === "Price" ? [k, "$850"] : [k, v])) }),
    {},
  );
  assert.equal(cheap.priceUsd, 0);
  assert.equal(cheap.priceProvenance, undefined);
  // 2018 → the $4,000 recent-used floor; the Leaf's $5,995 clears it.
  const leaf = autoCornerVdpFacts(vdp({ rows: LEAF_ROWS }), {});
  assert.equal(leaf.priceUsd, 5995);
  assert.equal(leaf.priceProvenance, AUTOCORNER_PRICE);
});

// ── VDP facts and the merge ────────────────────────────────────────────────

test("the VDP's own rows replace the slug's guesses", () => {
  const node = autoCornerVehicles(sitemap([LOCS.f150]), "https://madisonmotors.com")[0];
  assert.equal(node.model, "F 150");
  const facts = autoCornerVdpFacts(vdp({ rows: F150_ROWS, desc: "2016 Ford F-150 XLT SuperCab" }), {
    year: node.vehicleModelDate,
  });
  assert.equal(facts.vin, "1FTEX1EPXGFB94914");
  assert.equal(facts.priceUsd, 23850);
  assert.equal(facts.priceProvenance, AUTOCORNER_PRICE);
  assert.equal(facts.mileage, 61890);
  assert.equal(facts.exteriorColor, "Blue");
  assert.equal(facts.interiorColor, "Tan");
  assert.equal(facts.driveLine, "4WD");
  assert.equal(facts.stockNumber, "MF23680");
  assert.deepEqual(facts.images, ["https://photos.autocorner.com/640x480/hlIrHYZT85RPN9ZeqY28rX9oJnBt91Ex.jpg"]);

  const merged = applyAutoCornerVdp(node, facts);
  assert.equal(merged.model, "F-150");
  assert.equal(merged.brand, "Ford");
  assert.equal(merged.name, "2016 Ford F-150");
  assert.equal(merged.mileageFromOdometer.value, 61890);
  // The Engine row rides as a name and nothing infers a fuel from it.
  assert.equal(merged.vehicleEngine.name, "2.7L V6 DOHC 24V");
  assert.equal(merged.vehicleEngine.fuelType, undefined);
  assert.equal(merged.fuelType, undefined);
});

test("the Title row is a title brand, not a condition, and nothing is certified", () => {
  const facts = autoCornerVdpFacts(vdp({ rows: F150_ROWS }), {});
  assert.equal(facts.condition, undefined);
  assert.equal(facts.certified, undefined);
  const node = applyAutoCornerVdp(autoCornerVehicles(sitemap([LOCS.f150]))[0], facts);
  assert.equal(node.itemCondition, undefined);
  let rec = normalize(node, { sourceUrl: LOCS.f150, dealerDomain: "madisonmotors.com" });
  rec = enrichFromAutoCorner(rec, facts);
  assert.equal(rec.condition, undefined);
  assert.equal(rec.certified, undefined);
  // /vehicles/ states nothing either, so the row publishes no condition.
  assert.equal(publishedCondition({ condition: rec.condition, sourceUrl: rec.vdpUrl }), undefined);
});

test("a page that is a different car is not merged onto this VIN", () => {
  // pullAutoCorner compares the page's own VIN row against the slug's before
  // it merges; this is the reading that check is built on.
  const facts = autoCornerVdpFacts(vdp({ rows: LEAF_ROWS }), {});
  assert.equal(facts.vin, "1N4AZ1CP7JC304876");
  assert.notEqual(facts.vin, parseAutoCornerSlug(LOCS.f150).vin);
  // A page with no VIN row at all makes no claim either way.
  assert.equal(autoCornerVdpFacts(vdp({ rows: [["Price", "$9,999"], ["Year", "2019"]] }), {}).vin, undefined);
});

// ── End to end ─────────────────────────────────────────────────────────────

test("a sitemap Leaf plus its VDP publishes one priced BEV and no condition", () => {
  const xml = sitemap([LOCS.leaf, LOCS.f150]);
  const all = autoCornerVehicles(xml, "https://sandiegocarforsale.com");
  assert.equal(all.length, 1);

  const node = all[0];
  assert.equal(autoCornerNeedsVdp(node, classifyEv(node).isEv), true);

  const facts = autoCornerVdpFacts(vdp({ rows: LEAF_ROWS, desc: "2018 Nissan LEAF" }), {
    year: node.vehicleModelDate,
  });
  const merged = applyAutoCornerVdp(node, facts);

  const cls = classifyEv(merged);
  assert.equal(cls.isEv, true);
  // On the NAMEPLATE, not on the Engine row — vPIC confirms it downstream.
  assert.equal(cls.kind, "BEV?");
  assert.equal(cls.confidence, "name_match");

  let rec = normalize(merged, { sourceUrl: merged.offers.url, dealerDomain: "sandiegocarforsale.com" });
  rec = enrichFromAutoCorner(rec, facts);
  assert.equal(rec.vin, "1N4AZ1CP7JC304876");
  assert.equal(rec.year, 2018);
  assert.equal(rec.make, "Nissan");
  assert.equal(rec.model, "LEAF");
  assert.equal(rec.priceUsd, 5995);
  assert.equal(rec.priceProvenance, AUTOCORNER_PRICE);
  assert.equal(rec.mileage, 137000);
  assert.equal(rec.exteriorColor, "Pearl White/Super Black");
  assert.equal(rec.stockNumber, "GGleaf");
  assert.equal(rec.vdpUrl, LOCS.leaf);
  assert.equal(rec.platform, "autocorner");
  assert.equal(rec.condition, undefined);
});

test("a Call For Price car stays listed with no price claim", () => {
  const facts = autoCornerVdpFacts(vdp({ rows: FERRARI_ROWS }), {});
  assert.equal(facts.priceUsd, 0);
  assert.equal(facts.priceProvenance, undefined);
  const node = {
    "@type": "Vehicle",
    vehicleIdentificationNumber: "1N4AZ1CP7JC304876",
    offers: { "@type": "Offer", priceCurrency: "USD", url: LOCS.leaf },
  };
  let rec = normalize(node, { sourceUrl: LOCS.leaf, dealerDomain: "x.com" });
  rec = enrichFromAutoCorner(rec, facts);
  // 0, not null: ingest.mjs drops a null price and keeps a 0.
  assert.equal(rec.priceUsd, 0);
  assert.equal(rec.priceProvenance, undefined);
});
