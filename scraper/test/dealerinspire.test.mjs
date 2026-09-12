import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isDealerInspire,
  dealerInspireCards,
  dealerInspireNextUrl,
  dealerInspireIsCandidate,
  dealerInspireVdpVehicle,
  dealerInspireSrpUrl,
  srpLoadLimits,
  isDealerInspireSrpPage,
  dealerInspireFuelKnown,
} from "../lib/platforms/dealerinspire.mjs";

// Card markup as served on faricykia.com/used-vehicles/ 2026-09-02, trimmed
// to the marks the lane reads.
const SRP = `<html><body>
<div class="hit-content" data-testid="vehicle-card-grid-view">
  <a href="http://www.faricykia.com/inventory/used-2010-ford-focus-se-front-wheel-drive-4-door-sedan-1fahp3fn9aw282033/">Pre-Owned 2010 Ford Focus SE</a>
  <div class="vin-row vin" data-testid="vin-number" data-vin="1FAHP3FN9AW282033">VIN: 1FAHP3FN9AW282033</div>
  <div class="price">Selling Price $5,303 Delivery &amp; Handling $695 Faricy Sales Price $5,998</div>
</div>
<div class="hit-content">
  <a href="/inventory/used-2023-hyundai-ioniq-5-sel-all-wheel-drive-km8kndaf5pu123456/">Pre-Owned 2023 Hyundai IONIQ 5 SEL</a>
  <div class="vin-row vin" data-vin="KM8KNDAF5PU123456"></div>
</div>
<div class="hit-content">
  <a href="/inventory/used-2022-tesla-model-3-long-range-5yjsa1e29mf427349/">Pre-Owned 2022 Tesla Model 3</a>
  <div class="vin-row vin" data-vin="5YJSA1E29MF427349"></div>
  <div class="vin-row vin" data-vin="5YJSA1E29MF427349"></div>
</div>
<a href="/used-vehicles/?_p=2">Next</a>
</body></html>`;

test("isDealerInspire keys on the vendor's own hosts or theme, never the word", () => {
  assert.ok(isDealerInspire('<link href="https://www.x.com/wp-content/themes/DealerInspireDealerTheme/css/lvrp.css">'));
  assert.ok(isDealerInspire('<img src="https://vehicle-images.carscommerce.inc/ed41/x.webp">'));
  assert.ok(isDealerInspire('<script src="https://assets.dealerinspire.com/x.js">'));
  assert.equal(isDealerInspire("Powered by Dealer Inspire"), false);
  assert.equal(isDealerInspire("a dealer named inspire motors, dealerinspire in prose"), false);
});

test("cards: VIN from data-vin, VDP href by VIN slug, title from the slug, deduped", () => {
  const cards = dealerInspireCards(SRP, "https://www.faricykia.com/used-vehicles/");
  assert.equal(cards.length, 3);
  assert.equal(cards[0].vin, "1FAHP3FN9AW282033");
  assert.equal(cards[0].url, "http://www.faricykia.com/inventory/used-2010-ford-focus-se-front-wheel-drive-4-door-sedan-1fahp3fn9aw282033/");
  assert.equal(cards[0].title, "used 2010 ford focus se front wheel drive 4 door sedan");
  assert.equal(cards[1].url, "https://www.faricykia.com/inventory/used-2023-hyundai-ioniq-5-sel-all-wheel-drive-km8kndaf5pu123456/");
  assert.equal(cards[2].vin, "5YJSA1E29MF427349");
});

test("candidacy: EV-only WMI or an EV word; the Focus is never read", () => {
  const cards = dealerInspireCards(SRP, "https://www.faricykia.com/");
  assert.deepEqual(cards.map(dealerInspireIsCandidate), [false, true, true]);
});

test("pager: ?_p=N+1 present → next url; absent → last page", () => {
  assert.equal(dealerInspireNextUrl(SRP, "https://www.faricykia.com/used-vehicles/"), "https://www.faricykia.com/used-vehicles/?_p=2");
  assert.equal(dealerInspireNextUrl(SRP, "https://www.faricykia.com/used-vehicles/?_p=2"), null); // no _p=3 link
  assert.equal(dealerInspireNextUrl("<html></html>", "https://www.faricykia.com/used-vehicles/"), null);
  assert.equal(dealerInspireSrpUrl("https://www.faricykia.com/", "/new-vehicles/", 3), "https://www.faricykia.com/new-vehicles/?_p=3");
});

test("VDP: the Product+Car node for this VIN, and only this VIN", () => {
  const vdp = `<script type="application/ld+json">{"@context":"https://schema.org/","@type":["Product","Car"],"@id":"AW282033","name":"Pre-Owned 2010 Ford Focus SE","vehicleIdentificationNumber":"1FAHP3FN9AW282033","fuelType":"Gasoline Fuel","vehicleModelDate":"2010","brand":{"@type":"Brand","name":"Ford"},"model":"Focus","mileageFromOdometer":{"@type":"QuantitativeValue","value":"134147","unitCode":"SMI"},"offers":{"@type":"Offer","url":"https://www.faricykia.com/inventory/used-2010-ford-focus-se-front-wheel-drive-4-door-sedan-1fahp3fn9aw282033/","priceCurrency":"USD","price":"5998","itemCondition":"https://schema.org/UsedCondition","availability":"https://schema.org/InStock"}}</script>`;
  const v = dealerInspireVdpVehicle(vdp, "1FAHP3FN9AW282033");
  assert.equal(v.offers.price, "5998");
  assert.equal(v.mileageFromOdometer.value, "134147");
  assert.equal(dealerInspireVdpVehicle(vdp, "KM8KNDAF5PU123456"), null);
});

test("cards without data-vin are read off the VDP hrefs (the second classic markup)", () => {
  const html = `<div class="vehicle"><a href="https://www.tonkinchevrolet.com/inventory/used-2023-chevrolet-bolt-euv-lt-front-wheel-drive-1G1FY6S06P4123456/">2023 Bolt EUV</a>
  <a href="/inventory/used-2023-chevrolet-bolt-euv-lt-front-wheel-drive-1G1FY6S06P4123456/#photos">photos</a></div>
  <a href="/inventory/used-2019-ford-f-150-xlt-1FTEW1EP5KFA00001/">F-150</a> <a href="/inventory/new-vehicles/">all new</a>`;
  const cards = dealerInspireCards(html, "https://www.tonkinchevrolet.com/used-vehicles/");
  assert.deepEqual(cards.map((c) => c.vin), ["1G1FY6S06P4123456", "1FTEW1EP5KFA00001"]);
  assert.equal(cards[0].url, "https://www.tonkinchevrolet.com/inventory/used-2023-chevrolet-bolt-euv-lt-front-wheel-drive-1G1FY6S06P4123456/");
  assert.equal(dealerInspireIsCandidate(cards[0]), true);
  assert.equal(dealerInspireIsCandidate(cards[1]), false);
});

// The crawl's limits are honoured between loads: a deadline already past or
// a spent page budget stops the lane before its next load; no limits, no stop.
test("dealerInspireLimitsExhausted: deadline and page budget, pure", async () => {
  const { dealerInspireLimitsExhausted } = await import("../lib/platforms/dealerinspire.mjs");
  assert.equal(dealerInspireLimitsExhausted(null, 500), false);
  assert.equal(dealerInspireLimitsExhausted({ deadlineAt: Date.now() - 1, maxLoads: 0 }, 0), true);
  assert.equal(dealerInspireLimitsExhausted({ deadlineAt: Date.now() + 60000, maxLoads: 0 }, 999), false);
  assert.equal(dealerInspireLimitsExhausted({ deadlineAt: 0, maxLoads: 25 }, 24), false);
  assert.equal(dealerInspireLimitsExhausted({ deadlineAt: 0, maxLoads: 25 }, 25), true);
});

// The budget split. A lot big enough to fill the page budget with SRP pages
// left nothing for the VDPs the lane exists to read.
test("half the load budget is reserved for candidate VDPs", () => {
  assert.equal(srpLoadLimits({ maxLoads: 80 }).maxLoads, 40);
  assert.equal(srpLoadLimits({ maxLoads: 25 }).maxLoads, 13);
});

test("a tiny budget still buys the SRP pages a walk needs to start", () => {
  assert.equal(srpLoadLimits({ maxLoads: 1 }).maxLoads, 2);
  assert.equal(srpLoadLimits({ maxLoads: 3 }).maxLoads, 2);
});

// The clock is reserved on the same terms as the loads. It has to be: on a
// GitHub runner the 8-minute --domain-cap-min is the ONLY limit that ever
// binds (2026-09-06 rolling run: 364 rooftops bailed, wall p50 490 s against
// a 480 s cap, loads p50 22 against a 40-load reserve), so a load-only
// reserve hands the walk the whole visit and the VDPs — the only place this
// lane finds an EV — never run.
test("half the remaining clock is kept back for the candidate VDPs", () => {
  const now = 1_000_000;
  assert.equal(srpLoadLimits({ maxLoads: 80, deadlineAt: now + 480_000 }, now).deadlineAt, now + 240_000);
  assert.equal(srpLoadLimits({ deadlineAt: now + 61_000 }, now).deadlineAt, now + 30_500);
});

test("a deadline already past is not pushed forward by halving it", () => {
  const now = 1_000_000;
  assert.equal(srpLoadLimits({ maxLoads: 80, deadlineAt: now - 60_000 }, now).deadlineAt, now);
});

test("no limits at all still means no ceiling", () => {
  assert.equal(srpLoadLimits(null), null);
  assert.deepEqual(srpLoadLimits({}), {});
});

// The 25 KB page a GitHub runner got from temeculanissan.com on 2026-09-06,
// trimmed. HTTP 200, no cards, none of the vendor's marks.
const RECAPTCHA_200 = `<!DOCTYPE html><html><head><title>Checking your browser - reCAPTCHA</title></head>
<body><div id="recaptcha"></div><script src="https://www.google.com/recaptcha/api.js"></script></body></html>`;

test("a 200 that is not a Dealer Inspire page is not an empty lot", () => {
  assert.equal(isDealerInspireSrpPage(RECAPTCHA_200, []), false);
  assert.equal(isDealerInspireSrpPage("", []), false);
  assert.equal(isDealerInspireSrpPage(null, []), false);
});

test("a real SRP counts, with cards or with the vendor's own marks", () => {
  assert.equal(isDealerInspireSrpPage(SRP, dealerInspireCards(SRP, "https://www.faricykia.com/used-vehicles/")), true);
  // A genuinely empty used lot still renders the vendor's theme, and delisting
  // it is correct — the walk really did enumerate the lot.
  assert.equal(isDealerInspireSrpPage('<link href="/wp-content/themes/DealerInspireDealerTheme/css/lvrp.css">', []), true);
});

// ---------------------------------------------------------------------------
// The fuel facet first (2026-09-08): the card's own `data-vehicle` blob, the
// filtered list URL, and the order of spend under a budget.
import {
  dealerInspireFuelSrpUrl,
  dealerInspireFuelIsEv,
  dealerInspireRotate,
  DEALERINSPIRE_EV_FUELTYPES,
  DEALERINSPIRE_ROTATE_STRIDE,
  pullDealerInspire,
} from "../lib/platforms/dealerinspire.mjs";

// A result card as served on kengrodyfordorangecounty.com/used-vehicles/
// 2026-09-08: the blob is entity-encoded JSON on `data-vehicle`.
const blobCard = (vin, slug, fueltype) =>
  `<div class="result-wrap used-vehicle" data-vehicle="{&quot;vin&quot;:&quot;${vin}&quot;,&quot;type&quot;:&quot;Used&quot;,&quot;price&quot;:36485,&quot;fueltype&quot;:&quot;${fueltype}&quot;}" data-vehicle-vin="${vin}">
  <a href="/inventory/${slug}-${vin.toLowerCase()}/">card</a><div class="vin-row" data-vin="${vin}"></div></div>`;
// The "featured" block: data-vin only, no blob, repeated on every page.
const featuredCard = (vin, slug) => `<div class="featured"><a href="/inventory/${slug}-${vin.toLowerCase()}/">f</a><div data-vin="${vin}"></div></div>`;

test("cards: the data-vehicle blob gives the card its fueltype; a blob-less featured card is not a result", () => {
  // A slug with no EV signal at all: the blob is the only thing that says plug-in.
  const html = blobCard("5LMAJ5KP4NUL12345", "used-2022-lincoln-corsair-reserve-awd", "Plug-In Electric/Gas") + featuredCard("1FTBW1XMXTKA60009", "new-2026-ford-e-transit-cargo-van");
  const cards = dealerInspireCards(html, "https://www.x.com/used-vehicles/");
  assert.equal(cards.length, 2);
  assert.equal(cards[0].fuel, "Plug-In Electric/Gas");
  assert.equal(cards[0].result, true);
  assert.equal(cards[1].fuel, undefined);
  assert.equal(cards[1].result, undefined);
  // Only the blob makes it a candidate.
  assert.equal(dealerInspireIsCandidate({ ...cards[0], fuel: undefined }), false);
  assert.equal(dealerInspireIsCandidate(cards[0]), true);
});

test("fueltype: the verified spellings and any plug/electric reading count; hybrids that merely say Electric do not", () => {
  for (const f of DEALERINSPIRE_EV_FUELTYPES) assert.equal(dealerInspireFuelIsEv(f), true, f);
  assert.equal(dealerInspireFuelIsEv("Electric"), true);
  assert.equal(dealerInspireFuelIsEv("Hydrogen Fuel"), true);
  assert.equal(dealerInspireFuelIsEv("Gas/Electric Hybrid"), false);
  assert.equal(dealerInspireFuelIsEv("Gasoline/Mild Electric Hybrid"), false);
  assert.equal(dealerInspireFuelIsEv("Gasoline Fuel"), false);
  assert.equal(dealerInspireFuelIsEv(undefined), false);
});

test("fueltype: 'Electric' is a verified facet value; the served index matched it to 'electric' blobs too, so the lower case is known, not a spelling to report", () => {
  // jerryseiner.com/used-vehicles/?_dFR[fueltype][0]=Electric, 2026-09-12:
  // five cars, blobs "Electric" ×2 and "electric" ×3, none of them under
  // "Electric Fuel System".
  assert.ok(DEALERINSPIRE_EV_FUELTYPES.includes("Electric"));
  assert.equal(dealerInspireFuelKnown("Electric"), true);
  assert.equal(dealerInspireFuelKnown("electric"), true);
  assert.equal(dealerInspireFuelKnown(" electric "), true);
  assert.equal(dealerInspireFuelKnown("Battery Electric"), false, "a spelling nobody has seen served is not known");
  assert.equal(dealerInspireFuelKnown(undefined), false);
});

test("fueltype: 'Hybrid/Electric' is the feed's mild-hybrid value, not a plug-in — never a candidate, never reported as a spelling to add", () => {
  // hoehnmotors.com, 2026-09-12: the value filters to six 2027 CLA 220
  // Hybrids (48 V mild); the rooftop's RAV4 Plug-in Hybrid, Range Rover
  // Sport PHEV and Q5 TFSI e are under "Plug-In Electric/Gas".
  assert.equal(dealerInspireFuelIsEv("Hybrid/Electric"), false);
  assert.equal(dealerInspireFuelIsEv("hybrid/electric"), false);
  assert.ok(!DEALERINSPIRE_EV_FUELTYPES.includes("Hybrid/Electric"));
  assert.equal(dealerInspireIsCandidate({ vin: "W1KSJ4GB1TN123456", url: "/inventory/new-2027-mercedes-benz-cla-cla-220-hybrid-fwd-coupe-w1ksj4gb1tn123456/", title: "new 2027 mercedes benz cla cla 220 hybrid fwd coupe", fuel: "Hybrid/Electric" }), false);
  // A plug-in under the value the feed actually uses for them still counts.
  assert.equal(dealerInspireFuelIsEv("Plug-In Electric/Gas"), true);
});

test("fuel list URL: the theme's _dFR[fueltype][i] facet, one index per verified spelling", () => {
  const u = dealerInspireFuelSrpUrl("https://www.kengrodyfordorangecounty.com/", "/used-vehicles/");
  assert.equal(u, "https://www.kengrodyfordorangecounty.com/used-vehicles/?_dFR%5Bfueltype%5D%5B0%5D=Electric+Fuel+System&_dFR%5Bfueltype%5D%5B1%5D=Plug-In+Electric%2FGas&_dFR%5Bfueltype%5D%5B2%5D=Electric");
  // Paging keeps the query — and served HTML entity-encodes the ampersand.
  assert.equal(dealerInspireNextUrl(`<a href="${u}&amp;_p=2">next</a>`, u), `${u}&_p=2`);
  assert.equal(dealerInspireNextUrl(`<a href="${u}&amp;_p=3">next</a>`, `${u}&_p=2`), `${u}&_p=3`);
  assert.equal(dealerInspireNextUrl(`<a href="${u}&amp;_p=2">next</a>`, `${u}&_p=2`), null);
});

// A fake classic rooftop: 60 used cars over 3 pages, 3 EVs scattered through
// them (pages 1, 2 and 3), a featured block repeated on every page, a 20-car
// new list with one EV. The filtered lists answer only the cars whose blob
// carries a verified spelling, matched case-insensitively as the served
// index does (a lower-case "electric" Tesla is a filtered hit); one EV
// ("Battery Electric", a spelling nobody has verified, an EV word in its
// slug) is reachable only by the walk. VDPs carry the JSON-LD the lane reads.
function fakeRooftop() {
  const origin = "https://www.fake-di.example";
  const evs = [
    { vin: "1FTVW1EV3NWG10011", slug: "used-2022-ford-f-150-lightning-xlt", fuel: "Electric Fuel System", page: 3 },
    { vin: "5LMAJ5KP4NUL12345", slug: "used-2022-lincoln-corsair-grand-touring", fuel: "Plug-In Electric/Gas", page: 2 },
    { vin: "KNDC3DLC0P5119438", slug: "used-2023-kia-ev6-wind-awd", fuel: "Electric Fuel System", page: 1 },
    { vin: "5YJ3E1EB8NF359524", slug: "used-2022-tesla-model-3", fuel: "electric", page: 3 }, // the third spelling, lower case as jerryseiner.com serves it
    { vin: "7SAYGDEE4PA123456", slug: "used-2023-tesla-model-y", fuel: "Battery Electric", page: 3 }, // unknown spelling, walk-only
  ];
  const newEv = { vin: "3FMTK1R46TMA23542", slug: "new-2026-ford-mustang-mach-e-select-rwd", fuel: "Electric Fuel System", page: 1 };
  // Three more new Mach-Es: in the new list, and ALSO the "you may also like"
  // block a filtered used page carries — a different one per page, as served.
  const blockEvs = ["3FMTK1R48TMA11408", "3FMTK1R49TMA06394", "3FMTK1R45TMA22334"].map((vin, i) => ({ vin, slug: `new-2026-ford-mustang-mach-e-select-${i}`, fuel: "Electric Fuel System", page: 1 }));
  const filler = (i) => ({ vin: `1FA6P8TH${String(i).padStart(9, "0")}`.slice(0, 17), slug: `used-2019-ford-mustang-gt-${i}`, fuel: "Gasoline Fuel" });
  const usedPages = [1, 2, 3].map((p) => [...evs.filter((e) => e.page === p), ...Array.from({ length: 18 }, (_, i) => filler(p * 100 + i))]);
  const newPages = [[newEv, ...blockEvs, ...Array.from({ length: 16 }, (_, i) => ({ ...filler(900 + i), slug: `new-2026-ford-bronco-${i}` }))]];
  const featured = (p, filtered) => featuredCard("1FTBW1XMXTKA60009", "new-2026-ford-e-transit-cargo-van") + (filtered && blockEvs[p - 1] ? featuredCard(blockEvs[p - 1].vin, blockEvs[p - 1].slug) : "");
  const page = (cars, path, q, p, last) => `<html><body>${featured(p, Boolean(q))}${cars.map((c) => blobCard(c.vin, c.slug, c.fuel)).join("")}${last ? "" : `<a href="${path}${q ? q + "&amp;" : "?"}_p=${p + 1}">Next</a>`}</body></html>`;
  const vdp = (vin) => `<html><script type="application/ld+json">{"@context":"https://schema.org/","@type":["Product","Car"],"vehicleIdentificationNumber":"${vin}","offers":{"@type":"Offer","price":"36485","url":"${origin}/inventory/x-${vin.toLowerCase()}/"},"mileageFromOdometer":{"value":"63826"}}</script></html>`;
  const loads = [];
  const fetch = async (url) => {
    loads.push(url);
    const u = new URL(url);
    if (u.pathname === "/") return { status: 200, body: "<html>classic theme, no motive config</html>" };
    const p = Number(u.searchParams.get("_p") ?? 1);
    const fuels = [...u.searchParams.entries()].filter(([k]) => k.startsWith("_dFR[fueltype]")).map(([, v]) => v);
    const list = u.pathname === "/used-vehicles/" ? usedPages : u.pathname === "/new-vehicles/" ? newPages : null;
    if (list) {
      const q = fuels.length ? fuels.map((f, i) => `_dFR[fueltype][${i}]=${encodeURIComponent(f)}`).join("&").replace(/%20/g, "+") : "";
      if (fuels.length) {
        // An unknown spelling zeroes the result, as measured; the known ones
        // answer their cars two to a page, paged like the real 47-car list.
        const lc = fuels.map((f) => f.toLowerCase());
        const hits = list.flat().filter((c) => lc.includes(c.fuel.toLowerCase()));
        const per = 2;
        const slice = hits.slice((p - 1) * per, p * per);
        return { status: 200, body: page(slice, u.pathname, "?" + q, p, p * per >= hits.length) };
      }
      if (p > list.length) return { status: 200, body: page([], u.pathname, "", p, true) };
      return { status: 200, body: page(list[p - 1], u.pathname, "", p, p === list.length) };
    }
    const m = /\/inventory\/.*-([a-z0-9]{17})\/$/i.exec(u.pathname);
    if (m) return { status: 200, body: vdp(m[1].toUpperCase()) };
    return { status: 404, body: "" };
  };
  return { origin, fetch, loads, evs, newEv, blockEvs };
}

test("fast path: under a tight budget every EV the dealer's fuel field names is read before the walk, and the pull says partial", async () => {
  const { origin, fetch, loads, evs, newEv, blockEvs } = fakeRooftop();
  // homepage 1 + filtered used 2 pages + filtered new 2 + the 8 real results'
  // VDPs = 13 loads; the walk gets nothing. (The block's E-Transit carries no
  // EV word the net knows and no blob, so it is not a candidate at all.)
  const r = await pullDealerInspire(origin, { maxLoads: 13, fetch, day: 0 });
  const vins = r.vehicles.map((v) => v.vehicleIdentificationNumber).sort();
  assert.deepEqual(vins, [...evs.filter((e) => dealerInspireFuelKnown(e.fuel)).map((e) => e.vin), newEv.vin, ...blockEvs.map((b) => b.vin)].sort());
  assert.ok(vins.includes("1FTVW1EV3NWG10011"), "the page-three Lightning is read before any block card");
  assert.ok(vins.includes("5YJ3E1EB8NF359524"), "the lower-case 'electric' Tesla is a filtered hit, read on the fast path");
  assert.equal(r.fast, 8, "the eight real results; the block's E-Transit is no candidate");
  assert.equal(r.ok, true);
  assert.equal(r.complete, false, "the walk did not run, so nothing may be delisted");
  assert.match(r.why, /stopped at the crawl's time cap or page budget/);
  // Order of spend: homepage, the filtered lists, then cars — never an
  // unfiltered page before a car, and the block's E-Transit never opened.
  assert.equal(loads.length, 13);
  assert.ok(loads.slice(1, 5).every((l) => /_dFR/.test(l)), loads.join("\n"));
  assert.ok(loads.some((l) => /_dFR.*_p=2/.test(l)), "the filtered list's second page is read");
  assert.ok(loads.slice(5).every((u) => /\/inventory\//.test(u)), loads.join("\n"));
  assert.ok(!loads.some((u) => /1ftbw1xmxtka60009/i.test(u)), "the block card is never opened");
});

test("rotation: a day stride walks a capped list across visits; the block cards never rotate ahead of the real results", async () => {
  const cards = Array.from({ length: 100 }, (_, i) => ({ vin: String(i) }));
  assert.equal(dealerInspireRotate(cards, 0)[0].vin, "0");
  assert.equal(dealerInspireRotate(cards, 1)[0].vin, String(DEALERINSPIRE_ROTATE_STRIDE));
  assert.equal(dealerInspireRotate(cards, 2)[0].vin, String((2 * DEALERINSPIRE_ROTATE_STRIDE) % 100));
  assert.equal(dealerInspireRotate(cards, 3).length, 100);
  assert.deepEqual(dealerInspireRotate([{ vin: "x" }], 7), [{ vin: "x" }]);
  // Day 1 on the fake rooftop: the 8 real results start from card 40 % 8 = 0,
  // and the one VDP the budget allows is a real result, never the block's.
  const { origin, fetch, loads, evs, newEv, blockEvs } = fakeRooftop();
  await pullDealerInspire(origin, { maxLoads: 6, fetch, day: 1 });
  const first = loads.filter((u) => /\/inventory\//.test(u));
  assert.equal(first.length, 1);
  const realVins = [...evs.filter((e) => dealerInspireFuelKnown(e.fuel)), newEv, ...blockEvs].map((c) => c.vin.toLowerCase());
  assert.ok(realVins.some((v) => first[0].includes(v)), first[0]);
  assert.ok(!/1ftbw1xmxtka60009/i.test(first[0]));
});

test("walk: with budget to spare the unfiltered lists still run, catch the EV the facet could not name, and report its spelling", async () => {
  const { origin, fetch, loads, evs, newEv, blockEvs } = fakeRooftop();
  const r = await pullDealerInspire(origin, { maxLoads: 60, fetch, day: 0 });
  const vins = r.vehicles.map((v) => v.vehicleIdentificationNumber).sort();
  assert.deepEqual(vins, [...evs.map((e) => e.vin), newEv.vin, ...blockEvs.map((b) => b.vin)].sort());
  assert.equal(r.complete, true);
  assert.equal(r.fast, 8);
  assert.equal(r.candidates, 9);
  assert.equal(r.found, evs.length + 3 * 18 + 20 + 1, "the whole lot plus the featured card");
  assert.ok(r.notes.some((n) => /not in the facet list: Battery Electric —/.test(n)), r.notes.join(" | "));
  assert.ok(!r.notes.some((n) => /electric —/.test(n)), "the lower-case 'electric' the facet already returned is not a spelling to verify: " + r.notes.join(" | "));
  // Each VDP opened once, whichever path found it first.
  const vdpLoads = loads.filter((u) => /\/inventory\//.test(u));
  assert.equal(new Set(vdpLoads).size, vdpLoads.length);
  assert.equal(vdpLoads.length, 9);
});

test("walk: a rooftop that fits the budget still completes — the fast path's loads do not halve what the walk gets", async () => {
  const { origin, fetch } = fakeRooftop();
  // home 1 + filtered 4 + 8 VDPs + walk 4 pages + the walk's one VDP = 18 loads exactly.
  const r = await pullDealerInspire(origin, { maxLoads: 18, fetch, day: 0 });
  assert.equal(r.complete, true, r.why);
  assert.equal(r.requests, 18);
});

test("a list that answered 200 with no card is an unread page, not an empty lot", async () => {
  const loads = [];
  // Every list answers like the nine California rooftops did on 2026-09-10:
  // a served Dealer Inspire page, 200, and not one card in the body by the
  // time the load gave up waiting for one.
  const fetch = async (url) => {
    loads.push(url);
    if (new URL(url).pathname === "/") return { status: 200, body: "<html>classic theme, no motive config</html>" };
    return { status: 200, body: "<html><body><div id='srp-results'></div></body></html>", waited: false };
  };
  const r = await pullDealerInspire("https://www.fake-di.example", { maxLoads: 60, fetch, day: 0 });
  assert.equal(r.found, 0);
  assert.equal(r.ok, false, "a rooftop whose lists never showed a card certifies nothing");
  assert.equal(r.complete, false);
  assert.match(r.why, /no SRP answered/);
  // Homepage, then each of the four lists tried twice: a cardless page gets
  // the same second chance a failed one does, and gives up after it.
  assert.equal(loads.length, 9);
});
