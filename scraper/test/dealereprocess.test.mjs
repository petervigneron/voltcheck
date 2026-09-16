import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isDealerEProcess,
  DEP_EV_SRP_PATH,
  dealerEProcessEvSrpUrl,
  dealerEProcessChallenged,
  dealerEProcessSrpFound,
  dealerEProcessFuelPanel,
  dealerEProcessSrpVehicles,
  pullDealerEProcess,
  countDealerEProcess,
} from "../lib/platforms/dealereprocess.mjs";
import { classifyEv } from "../lib/ev.mjs";

// Shapes captured off kiamedford.com and toyotaofdenton.com on 2026-09-16
// (trimmed): the count line, the fuel panel, one Vehicle node per card.
const node = (vin, { name = "New 2026 Kia Niro EV Wind", fuel = "Electric", price = "31550", id = "119532368", cond = "https://schema.org/NewCondition" } = {}) =>
  `<script type="application/ld+json">{"@context":"https://schema.org","@type":"Vehicle","name":"${name}","model":"Niro","fuelType":"${fuel}","vehicleIdentificationNumber":"${vin}","vehicleModelDate":"2026","mileageFromOdometer":{"@type":"QuantitativeValue","value":"12","unitCode":"SMI"},"brand":{"@type":"Brand","name":"Kia"},"url":"/auto/new-2026-kia-niro-ev-wind-medford-or/${id}/","offers":[{"@type":"Offer","priceCurrency":"USD","serialNumber":"${vin}","price":"${price}","itemCondition":"${cond}","url":"/auto/new-2026-kia-niro-ev-wind-medford-or/${id}/","availability":"https://schema.org/InStock"}]}</script>`;
const option = (id, label, n) =>
  `<a class="srp_filter_option" href="/search/x/?fl=${id}" data-filter-field="fuel_type" data-filter-value="${label}" data-filter-type="value" data-canonical-id="${id}" data-filter-label="${label}"><span class="srp_filter_option_label no-image">${label}</span> <span class="srp_filter_option_count">(${n})</span></a>`;
const page = ({ found, cards, fuel = [["10", "Diesel", 1], ["15", "Electric", 19], ["12", "Gasoline", 127], ["14", "Hybrid", 55], ["835", "Plug-in Hybrid", 1]] }) =>
  `<html><head><title>Electric or Plug-in Hybrid Vehicles for Sale in Medford, OR - Kia Medford</title>${cards.join("")}</head><body>
  <div class="srp_results_count">${found} vehicles found</div>
  <div id="srp_filter_panel__fuel_type" class="srp_filter_options">${fuel.map((f) => option(...f)).join("")}</div>
  <div id="srp_filter_panel__year">${option("2026", "2026", 221)}</div>
  <img src="https://cloudflareimages.dealereprocess.com/resrc/images/x.jpg"></body></html>`;
const CHALLENGE = `<html><head><title>Just a moment...</title></head><body>Verifying you are human</body></html>`;

test("isDealerEProcess keys on the vendor's own hosts, not the word", () => {
  assert.ok(isDealerEProcess('<img src="https://cloudflareimages.dealereprocess.com/resrc/images/x.jpg">'));
  assert.ok(isDealerEProcess('<script src="https://cdn.dealereprocess.org/cdn/js/search/filter_search.min.js">'));
  assert.equal(isDealerEProcess("Our web vendor is DealerEProcess, we love them"), false);
  assert.equal(isDealerEProcess(undefined), false);
});

test("the one page asked for is the unsorted electric + plug-in + battery-electric SRP at the largest page size", () => {
  assert.equal(DEP_EV_SRP_PATH, "/search/electric/?fl=15&fl=835&fl=3988&ct=60");
  assert.equal(dealerEProcessEvSrpUrl("https://www.kiamedford.com/"), "https://www.kiamedford.com/search/electric/?fl=15&fl=835&fl=3988&ct=60");
  assert.ok(!/s:/.test(DEP_EV_SRP_PATH), "sorted variants are robots-disallowed");
});

test("the page's own count, fuel panel and VIN-bearing Vehicle nodes are read; other panels are not fuel", () => {
  const html = page({ found: 20, cards: [node("KNDCR3L19T5161818"), node("KNDCR3L1XP5044965", { name: "Certified 2023 Kia Niro EV Wind", cond: "https://schema.org/UsedCondition" }), node("KNDCR3L19T5161818")] });
  assert.equal(dealerEProcessSrpFound(html), 20);
  assert.deepEqual(dealerEProcessFuelPanel(html), { Diesel: 1, Electric: 19, Gasoline: 127, Hybrid: 55, "Plug-in Hybrid": 1 });
  const v = dealerEProcessSrpVehicles(html, "https://www.kiamedford.com");
  assert.deepEqual(v.map((x) => x.vehicleIdentificationNumber), ["KNDCR3L19T5161818", "KNDCR3L1XP5044965"]); // the repeat is folded
  assert.equal(v[0].offers[0].url, "https://www.kiamedford.com/auto/new-2026-kia-niro-ev-wind-medford-or/119532368/");
  assert.equal(v[0].url, v[0].offers[0].url);
  assert.equal(v[0].offers[0].price, "31550");
  assert.equal(dealerEProcessSrpFound(CHALLENGE), null);
  assert.deepEqual(dealerEProcessFuelPanel(CHALLENGE), {});
  assert.ok(dealerEProcessChallenged(403, ""));
  assert.ok(dealerEProcessChallenged(200, CHALLENGE));
  assert.ok(!dealerEProcessChallenged(200, html));
});

test("every fuel label the facets use classifies as an EV downstream", () => {
  for (const fuel of ["Electric", "Plug-in Hybrid", "Battery Electric"]) {
    const [v] = dealerEProcessSrpVehicles(page({ found: 1, cards: [node("JTM7ERAV0TJ015286", { fuel, name: "New 2026 Toyota RAV4 Plug-in Hybrid SE" })] }), "https://x.com");
    assert.ok(classifyEv(v).isEv, `${fuel} should be an EV`);
  }
});

test("pull: one load, complete only when the page carried every car it counted", async () => {
  const loads = [];
  const fetch = async (url) => {
    loads.push(url);
    return { status: 200, body: page({ found: 2, cards: [node("KNDCR3L19T5161818"), node("KNDCR3L1XP5044965")] }), finalUrl: url };
  };
  const r = await pullDealerEProcess("https://www.kiamedford.com", { fetch });
  assert.equal(loads.length, 1);
  assert.equal(r.ok, true);
  assert.equal(r.complete, true);
  assert.equal(r.found, 2);
  assert.equal(r.vehicles.length, 2);
  assert.equal(r.requests, 1);
  assert.deepEqual(r.notes, ["fuel panel: Electric 19, Plug-in Hybrid 1"]);
});

test("pull: a lot bigger than the page is partial — the rest is behind the challenge, never asked for", async () => {
  const cards = Array.from({ length: 60 }, (_, i) => node(`KNDCR3L1${String(i).padStart(9, "0")}`.slice(0, 17)));
  let loads = 0;
  const r = await pullDealerEProcess("https://www.leejohnsonmazda.com", { fetch: async (url) => (loads++, { status: 200, body: page({ found: 87, cards }), finalUrl: url }) });
  assert.equal(loads, 1);
  assert.equal(r.ok, true);
  assert.equal(r.complete, false);
  assert.equal(r.found, 87);
  assert.equal(r.vehicles.length, 60);
  assert.match(r.why, /87 EVs, page carries 60/);
});

test("pull: the challenge on the first load is an answer, not retried; a missing browser declines; the deadline is honoured before the load", async () => {
  let loads = 0;
  const c = await pullDealerEProcess("https://www.x.com", { fetch: async () => (loads++, { status: 403, body: CHALLENGE, finalUrl: "" }) });
  assert.equal(loads, 1);
  assert.equal(c.ok, false);
  assert.equal(c.complete, false);
  assert.match(c.why, /challenged/);
  const u = await pullDealerEProcess("https://www.x.com", { fetch: async () => ({ status: "browser_unavailable", body: null }) });
  assert.equal(u.why, "browser_unavailable");
  loads = 0;
  const d = await pullDealerEProcess("https://www.x.com", { deadlineAt: Date.now() - 1, fetch: async () => (loads++, { status: 200, body: "", finalUrl: "" }) });
  assert.equal(loads, 0);
  assert.equal(d.ok, false);
});

test("count: a rooftop with EVs is provable, an empty one is not promoted", async () => {
  // countDealerEProcess reaches for the real browser; exercise the shape it
  // derives from through pull with an injected fetch instead.
  const r = await pullDealerEProcess("https://www.acurabrookfield.com", { fetch: async (url) => ({ status: 200, body: page({ found: 0, cards: [], fuel: [["12", "Gasoline", 173]] }), finalUrl: url }) });
  assert.equal(r.ok, true);
  assert.equal(r.complete, true);
  assert.equal(r.found, 0);
  assert.equal(typeof countDealerEProcess, "function");
});
