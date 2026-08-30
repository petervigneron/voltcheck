#!/usr/bin/env node
// Grow the registry from a manufacturer's OWN national dealer roster — the
// API shape, where brand-directory-dealers.mjs is the HTML-directory shape.
//
//   node oem-dealer-rosters.mjs [brand …] [--write] [--dump file.json]
//
// Same claim, same contract, different transport. A maker that runs a dealer
// locator has to hand the browser a roster, and several of them put the
// rooftop's OWN site in it: lexus.com's /rest/lexus/dealers carries
// `dealerSiteUrl` next to every dealer's name and address. That field is the
// whole point — the registry's other growth paths each have to work for a
// domain (harvest-dealers.mjs needs a car that linked to its own site;
// resolve-dealers.mjs GUESSES a domain from a licensed name and then has to
// verify the identity on the page it lands on, 69% recall). Here nobody
// guesses: the manufacturer publishes the pairing, so a rooftop whose domain
// looks nothing like its name is as findable as one whose domain is its name.
//
// Rows land as status "discovered", the same contract as every other
// discovery source — probe.mjs validates extraction before anything joins the
// crawl — and this script only ever APPENDS.
//
// ── RECORDED NEGATIVES ──────────────────────────────────────────────────────
// Written down so nobody re-derives them. A robots verdict is policy, not a
// wall to route around, and none of these were pushed on further.
//
//   toyota.com — DISALLOWED. Its sitemap index publishes sitemap-dealers.xml
//     (30,799 URLs, /dealers/<state>/<city>/dealers/ and per-rooftop pages),
//     but robots.txt `User-agent: *` carries `Disallow: /dealers*`. The
//     sitemap and the robots file disagree; robots wins. Toyota rooftops
//     reach the registry through the dealer crawl and the license rolls
//     instead. (Toyota also has no /rest/…/dealers twin of the Lexus
//     endpoint: /rest/tcom/dealers and /rest/dealers 301 to the marketing
//     shell, /rest/toyota/dealers/ 404s into it.)
//
//   ford.com — DISALLOWED, and already written down in
//     brand-directory-dealers.mjs: robots Disallows /finder*, the locator,
//     and there is no dealers_sitemap.xml. Ford rooftops come from the Ford
//     Blue Advantage marketplace (fba-dealers.mjs) instead.
//
//   chevrolet.com, gmc.com — DISALLOWED. All four GM brands run the same
//     "quantum dealer locator" backend at /bypass/pcf/quantum-dealer-locator/
//     v1/getDealers, and it does carry `dealerUrl`. But chevrolet.com's
//     robots.txt says `Disallow: /bypass/` and gmc.com's says
//     `Disallow: /bypass/*`. The service is reachable from cadillac.com and
//     buick.com — which carry no /bypass rule — and `makeCodes` is a request
//     parameter rather than a property of the host, so a Chevrolet roster can
//     literally be fetched from the Cadillac host. We do not do that. Asking
//     a sibling hostname for the bytes Chevrolet's robots.txt declines to
//     serve is routing around the verdict, not respecting it. Chevrolet and
//     GMC rooftops therefore come from the dealer crawl and the license rolls;
//     only Cadillac and Buick are swept here, each from its own host.
//
//   fiatusa.com / alfaromeo.com / wagoneer.com — no Stellantis-style dealer
//     directory: /dealers_sitemap.xml is 404, 403 and a redirect to a
//     non-sitemap respectively. Not pursued: those rooftops are almost
//     entirely co-located with the CDJR stores brand-directory-dealers.mjs
//     already sweeps.
//
import { readFile, writeFile } from "node:fs/promises";
import { politeGetJson, politePostJson, fetchPage, setCacheTtl } from "./lib/http.mjs";

const args = process.argv.slice(2);
const WRITE = args.includes("--write");
const DUMP = (() => { const i = args.indexOf("--dump"); return i >= 0 ? args[i + 1] : null; })();

// A week, like the Stellantis directory sweep: a franchise roster changes on
// the timescale of a franchise transfer, and a warm cache makes a re-run free.
setCacheTtl(7 * 24 * 3600_000);

const UA_HEADERS = { accept: "application/json, text/plain, */*" };

// Hosts that turn up in a `website` field but are not a rooftop's own site:
// the brand storefronts themselves, and the marketplaces that have their own
// lanes. Same intent as harvest-dealers.mjs's NOT_A_ROOFTOP.
const NOT_A_ROOFTOP =
  /(^|\.)(lexus|toyota|honda|acura|nissanusa|infinitiusa|subaru|mazdausa|vw|volkswagen|chevrolet|gmc|cadillac|buick|hyundaiusa|kia|genesis|bmwusa|miniusa|mbusa|volvocars|audiusa|porsche|mitsubishicars|jaguar|jaguarusa|landrover|landroverusa|jeep|dodge|chrysler|ramtrucks|ford|driveway|carvana|carmax|autotrader|cargurus|cars|edmunds|kbb|truecar|dealeron|dealer)\.(com|net|us|org)$/i;

export const normalizeDomain = (site) => {
  const s = String(site ?? "").trim();
  if (!s) return null;
  try {
    const h = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`).hostname.toLowerCase().replace(/^www\./, "");
    return h.includes(".") ? h : null;
  } catch {
    return null;
  }
};

const US_STATE = /^[A-Z]{2}$/;

// ── brand adapters ──────────────────────────────────────────────────────────
// Each returns { rooftops: [{ domain, name, city, state, zip, code }], total,
// note } — `total` is the DENOMINATOR the source itself publishes, so the
// coverage table below reports what fraction of a brand we hold rather than
// just how many rows we added. A brand that cannot be enumerated returns null
// and says why; it does not guess.

/** Lexus: one call, no parameters, the complete national directory.
 *
 *  Verified national rather than local by toyota.mjs (which uses this same
 *  endpoint for its inventory cover): the response is byte-identical for
 *  zipCode=90045, for zipCode=04101, and for no zipCode at all — same 246
 *  ids, same byte count. It is a static directory the query does not touch.
 *  robots.txt is `Allow: /` with two /build/ exceptions, so /rest/ is open.
 *
 *  `dealerSiteUrl` is Lexus's own statement of the rooftop's website — every
 *  one of the 246 carries it (measured 2026-08-29, 246/246, zero blanks). */
async function lexus() {
  const res = await politeGetJson("https://www.lexus.com/rest/lexus/dealers", { headers: UA_HEADERS, timeoutMs: 60000 });
  if (res.status !== 200 || !Array.isArray(res.json?.dealers)) return null;
  const rooftops = [];
  for (const d of res.json.dealers) {
    const a = d?.dealerAddress ?? {};
    const state = String(a.state ?? "").toUpperCase();
    rooftops.push({
      domain: normalizeDomain(d?.dealerSiteUrl),
      name: String(d?.dealerName ?? "").replace(/\s+/g, " ").trim(),
      city: a.city || undefined,
      state: US_STATE.test(state) ? state : undefined,
      zip: String(a.zipCodeFive ?? "").slice(0, 5) || undefined,
      code: d?.id ? String(d.id) : undefined,
    });
  }
  return {
    rooftops,
    total: res.json.dealers.length,
    note: "Listed by Lexus in its own national dealer directory (www.lexus.com/rest/lexus/dealers), whose `dealerSiteUrl` states this rooftop's website — the domain is the manufacturer's, not generated from the name",
  };
}

/** Kia: one POST, the complete national roster — 800 rooftops, `url` on every
 *  one of them.
 *
 *  Verified national by the same control the Lexus endpoint gets: the request
 *  takes a ZIP, but ZIP 66101 (Kansas City) and ZIP 04101 (Portland, Maine)
 *  return the IDENTICAL set of 800 dealer codes — zero symmetric difference.
 *  The ZIP only orders the list by distance. numberOfDealers=5000 still
 *  returns 800, so 800 is the roster and not a page cap.
 *
 *  It is POST-only; a GET answers 405, which is what a first pass mistook for
 *  a wall. robots.txt disallows `*​/search/` (trailing slash — does not match
 *  this path) and `/*dealer-master*`; neither touches it. */
async function kia() {
  const res = await politePostJson("https://www.kia.com/us/services/en/dealers/search", {
    // Origin/Referer are load-bearing: without them the edge answers 403.
    headers: { origin: "https://www.kia.com", referer: "https://www.kia.com/us/en/dealer-locator" },
    body: { type: "zip", zipCode: "66101", dealerCertifications: [], dealerServices: [], numberOfDealers: 5000 },
    timeoutMs: 60000,
  });
  const list = res.json?.dealers ?? res.json?.result?.dealers ?? (Array.isArray(res.json) ? res.json : null);
  if (res.status !== 200 || !Array.isArray(list)) return null;
  const rooftops = list.map((d) => {
    const a = d?.location ?? {};
    const state = String(a.state ?? "").toUpperCase();
    return {
      domain: normalizeDomain(d?.url),
      name: String(d?.name ?? "").replace(/\s+/g, " ").trim(),
      city: a.city || undefined,
      state: US_STATE.test(state) ? state : undefined,
      zip: String(a.zipCode ?? "").slice(0, 5) || undefined,
      code: d?.code ? String(d.code) : undefined,
    };
  });
  return {
    rooftops,
    total: list.length,
    note: "Listed by Kia in its own national dealer roster (www.kia.com/us/services/en/dealers/search), whose `url` states this rooftop's website — the domain is the manufacturer's, not generated from the name",
  };
}

/** Subaru: one call. `query=` is a case-insensitive SUBSTRING match on the
 *  retailer name, so a single letter that every name contains returns the
 *  whole country — measured, not assumed: `query=a` and `query=subaru` return
 *  byte-identical 361,349-byte payloads carrying the same 643 ids. (`count=`
 *  left empty defaults to 5 records, and an empty `query=` is a 500 — both
 *  are why this endpoint looked small when subaru.mjs first used it.)
 *
 *  642 of the 643 carry `siteUrl`. */
async function subaru() {
  const res = await politeGetJson("https://www.subaru.com/services/dealers/query?query=a&count=2000&type=", { headers: UA_HEADERS, timeoutMs: 60000 });
  const list = Array.isArray(res.json) ? res.json : res.json?.dealers ?? res.json?.results;
  if (res.status !== 200 || !Array.isArray(list)) return null;
  const rooftops = list.map((d) => {
    const a = d?.address ?? {};
    const state = String(a.state ?? "").toUpperCase();
    return {
      domain: normalizeDomain(d?.siteUrl),
      name: String(d?.name ?? "").replace(/\s+/g, " ").trim(),
      city: a.city || undefined,
      state: US_STATE.test(state) ? state : undefined,
      zip: String(a.zipcode ?? "").slice(0, 5) || undefined,
      code: d?.id ? String(d.id) : undefined,
    };
  });
  return {
    rooftops,
    total: list.length,
    note: "Listed by Subaru in its own national retailer roster (www.subaru.com/services/dealers/query), whose `siteUrl` states this rooftop's website — the domain is the manufacturer's, not generated from the name",
  };
}

/** Mazda: the roster mazda.mjs already walks for inventory, read for the one
 *  field that lane throws away. Six pages at ps=100 (the server caps there);
 *  `total` is the roster's own count, so a short read is visible rather than
 *  silently certifying a partial country.
 *
 *  536 of 548 carry `webUrl`. `inventoryUrl` is a RELATIVE mazdausa.com path,
 *  not the dealer's own site — do not mistake it for one. */
async function mazda() {
  const rows = [];
  let reported = null;
  for (let page = 1; page <= 40; page++) {
    const res = await politeGetJson(`https://www.mazdausa.com/handlers/dealer.ajax?ps=100&p=${page}`, { headers: UA_HEADERS, timeoutMs: 60000 });
    if (res.status !== 200) return null;
    const body = res.json?.body ?? res.json ?? {};
    const batch = Array.isArray(body.results) ? body.results : [];
    if (reported === null) reported = Number(body.total) || null;
    rows.push(...batch);
    if (!batch.length) break;
    if (reported && rows.length >= reported) break;
  }
  if (!rows.length) return null;
  if (reported && rows.length < reported) return null; // a partial roster certifies a partial country
  const rooftops = rows.map((d) => {
    const state = String(d?.state ?? "").toUpperCase();
    return {
      domain: normalizeDomain(d?.webUrl),
      name: String(d?.name ?? "").replace(/\s+/g, " ").trim(),
      city: d?.city || undefined,
      state: US_STATE.test(state) ? state : undefined,
      zip: String(d?.zip ?? "").slice(0, 5) || undefined,
      code: d?.id ? String(d.id) : undefined,
    };
  });
  return {
    rooftops,
    total: rows.length,
    note: "Listed by Mazda in its own national dealer roster (www.mazdausa.com/handlers/dealer.ajax), whose `webUrl` states this rooftop's website — the domain is the manufacturer's, not generated from the name",
  };
}

/** Mitsubishi: not an API — the whole national roster is server-rendered into
 *  `window.__APOLLO_STATE__` on the locator page, one fetch for 294 rooftops,
 *  all 294 carrying `url`. robots.txt is a bare `Disallow:` (nothing).
 *
 *  ADDRESS TRAP: the field literally named `city` holds a region code ("W2").
 *  The city is `addressLine2`, the state is `addressLine3`, the ZIP is
 *  `postalArea`. Reading `city` as a city would put every Mitsubishi rooftop
 *  in a town that does not exist. */
async function mitsubishi() {
  const r = await fetchPage("https://www.mitsubishicars.com/car-dealerships-near-me");
  if (r.status !== 200 || !r.body) return null;
  // Brace-match rather than regex to the end: the state object is ~750 KB of
  // JSON containing both `};` and escaped `</script>` sequences, so any
  // non-greedy "up to the closing tag" pattern stops in the wrong place.
  const at = r.body.indexOf("__APOLLO_STATE__");
  if (at < 0) return null;
  const start = r.body.indexOf("{", at);
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false, end = -1;
  for (let i = start; i < r.body.length; i++) {
    const c = r.body[i];
    if (esc) { esc = false; continue; }
    if (inStr) { if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) { end = i + 1; break; }
  }
  if (end < 0) return null;
  let state;
  try { state = JSON.parse(r.body.slice(start, end)); } catch { return null; }
  const rooftops = [];
  for (const [key, d] of Object.entries(state)) {
    if (!/^Dealer_\d+$/.test(key)) continue;
    const a = state[`$${key}.address`] ?? d?.address ?? {};
    const st = String(a.addressLine3 ?? "").toUpperCase();
    rooftops.push({
      domain: normalizeDomain(d?.url),
      name: String(d?.name ?? "").replace(/\s+/g, " ").trim(),
      city: a.addressLine2 || undefined,
      state: US_STATE.test(st) ? st : undefined,
      zip: String(a.postalArea ?? "").slice(0, 5) || undefined,
      code: d?.id != null ? String(d.id) : undefined,
    });
  }
  if (!rooftops.length) return null;
  return {
    rooftops,
    total: rooftops.length,
    note: "Listed by Mitsubishi in its own national dealer directory (www.mitsubishicars.com/car-dealerships-near-me), whose per-rooftop record states this dealer's website — the domain is the manufacturer's, not generated from the name",
  };
}

/** Volkswagen: one call for 956 rooftops, 950 of them carrying
 *  `contact.website`.
 *
 *  Two things here rot on a VW release and so are read at run time rather than
 *  hardcoded: the feature-app HOST carries a version pin (v3-89-3…), and the
 *  API key is a public front-end key published in en.feature-apps.json. Both
 *  come out of the dealer-search page and that manifest on every run. If
 *  either lookup fails this returns null rather than guessing a stale pin —
 *  the alternative is a lane that fails silently the day VW deploys.
 *
 *  The US host rewrite is the part nobody would guess: the page advertises
 *  `…ds.dcc.feature-app.io`, and the bundle's own createBffUrl rewrites `.ds.`
 *  to `.ds-us.` for country US. A call to the advertised host just fails.
 *  `name: " "` is the bundle's own blank search, which returns the whole
 *  tenant. */
async function volkswagen() {
  const page = await fetchPage("https://www.vw.com/en/dealer-search.html");
  if (page.status !== 200 || !page.body) return null;
  const host = (/https:\/\/(v3[\w.-]*?\.ds)\.dcc\.feature-app\.io/.exec(page.body) ?? [])[1];
  if (!host) return null;
  const manifest = await politeGetJson("https://www.vw.com/en.feature-apps.json", { headers: UA_HEADERS, timeoutMs: 30000 });
  const key = manifest.json?.featureAppApiKey ?? (/"featureAppApiKey"\s*:\s*"([^"]+)"/.exec(JSON.stringify(manifest.json ?? "")) ?? [])[1];
  if (!key) return null;
  const q = encodeURIComponent(JSON.stringify({ type: "DEALER", name: " ", usePrimaryTenant: true }));
  const cfg = encodeURIComponent(JSON.stringify({ type: "publish", country: "us", language: "en", content: "onehub_pkw", envName: "prod" }));
  const url = `https://${host.replace(".ds", ".ds-us")}.dcc.feature-app.io/bff-search/dealers?query=${q}&serviceConfigEndpoint=${cfg}&lufthansaApiKey=${encodeURIComponent(key)}`;
  const res = await politeGetJson(url, { headers: { ...UA_HEADERS, origin: "https://www.vw.com", referer: "https://www.vw.com/" }, timeoutMs: 60000 });
  const list = res.json?.dealers ?? (Array.isArray(res.json) ? res.json : null);
  if (res.status !== 200 || !Array.isArray(list)) return null;
  const rooftops = list.map((d) => {
    const a = d?.address ?? {};
    const st = String(a.province ?? "").toUpperCase();
    return {
      domain: normalizeDomain(d?.contact?.website),
      name: String(d?.name ?? "").replace(/\s+/g, " ").trim(),
      city: a.city || undefined,
      state: US_STATE.test(st) ? st : undefined,
      zip: String(a.postalCode ?? "").slice(0, 5) || undefined,
      code: d?.id ? String(d.id) : undefined,
    };
  });
  return {
    rooftops,
    total: list.length,
    note: "Listed by Volkswagen in its own national dealer roster (the vw.com dealer-search BFF), whose `contact.website` states this rooftop's website — the domain is the manufacturer's, not generated from the name",
  };
}

/** Genesis: two calls' worth of shape, 199 calls' worth of work.
 *
 *  /bin/api/v2/alldealers takes NO location parameter at all — there is no
 *  scoping question to control for — and returns the complete 199-retailer US
 *  list, but only code/name/state. The domain lives one call deeper, at
 *  /bin/api/v2/dealer/bydealercode. So 199 polite calls buys the whole brand.
 *  (The parameter is `dealerCode`; `dealerCd`, the name the index uses, 400s
 *  with a message demanding brand/model/lang — which `dealerCode` alone does
 *  not actually need.) */
async function genesis() {
  const idx = await politeGetJson("https://www.genesis.com/bin/api/v2/alldealers", { headers: UA_HEADERS, timeoutMs: 60000 });
  const list = idx.json?.result?.dealers ?? idx.json?.dealers ?? (Array.isArray(idx.json) ? idx.json : null);
  if (idx.status !== 200 || !Array.isArray(list) || !list.length) return null;
  const rooftops = [];
  for (const row of list) {
    const code = String(row?.DealerCd ?? row?.dealerCd ?? "").trim();
    if (!code) continue;
    const r = await politeGetJson(`https://www.genesis.com/bin/api/v2/dealer/bydealercode?dealerCode=${encodeURIComponent(code)}`, { headers: UA_HEADERS, timeoutMs: 30000 });
    const d = r.json?.result?.dealers?.[0] ?? r.json?.result?.dealer ?? r.json;
    if (r.status !== 200 || !d) continue;
    const st = String(d.state ?? "").toUpperCase();
    rooftops.push({
      domain: normalizeDomain(d.dealerUrl),
      name: String(d.dealerNm ?? row?.DealerNm ?? "").replace(/\s+/g, " ").trim(),
      city: d.city || undefined,
      state: US_STATE.test(st) ? st : undefined,
      zip: String(d.zipCd ?? "").slice(0, 5) || undefined,
      code,
    });
  }
  if (!rooftops.length) return null;
  return {
    rooftops,
    total: list.length,
    totalSource: "published",
    note: "Listed by Genesis in its own national retailer directory (genesis.com /bin/api/v2/alldealers, then /dealer/bydealercode), whose `dealerUrl` states this rooftop's website — the domain is the manufacturer's, not generated from the name",
  };
}

/** A capped locator has no national call, so the country is covered by
 *  sweeping the shared CONUS grid (lib/oem/grid.mjs — one representative ZIP
 *  per ~1.4x1.6-degree cell, the same construction hyundai.mjs and nissan.mjs
 *  use) and deduping on the maker's own dealer code.
 *
 *  A sweep count is NOT a published denominator and this says so: `total` here
 *  is what the sweep found, and the coverage table labels it `swept`. Every
 *  cell that comes back exactly at the cap is counted and reported — a cap-hit
 *  means that cell may be hiding rooftops behind the ceiling, so the number is
 *  a floor on what was missed, not a certificate. Nobody downstream may read a
 *  swept count as a brand's rooftop count. */
async function sweepGrid({ cellUrl, parse, cap, note, label, headers = {}, extraZips = [] }) {
  const { coveringGrid } = await import("./lib/oem/grid.mjs");
  const g = coveringGrid();
  if (!g) { console.error(`${label}: no ZCTA table (web/data/zips.json) — cannot sweep`); return null; }
  // The grid's bbox stops at the lower 48; a national roster should not. A
  // locator whose reach comfortably exceeds a metro area can cover Hawaii and
  // Alaska from one anchor each (the ZCTA table itself is national).
  const anchors = [...g.cells.values()].map((c) => c.zip);
  for (const z of extraZips) if (g.zips[z]) anchors.push(z);
  const byCode = new Map();
  let cells = 0, capped = 0, failed = 0;
  for (const zip of anchors) {
    const [lat, lng] = g.zips[zip];
    const rows = await parse(await politeGetJson(cellUrl({ zip, lat, lng }), { headers: { ...UA_HEADERS, ...headers }, timeoutMs: 45000 }));
    cells++;
    if (rows === null) { failed++; continue; }
    if (cap && rows.length >= cap) capped++;
    for (const d of rows) if (d.code && !byCode.has(d.code)) byCode.set(d.code, d);
    if (cells % 50 === 0) console.error(`  ${label}: ${cells}/${anchors.length} cells, ${byCode.size} rooftops`);
  }
  if (!byCode.size) return null;
  console.error(`  ${label}: swept ${cells} cells (${failed} failed, ${capped} hit the ${cap}-row cap), ${byCode.size} distinct rooftops`);
  return { rooftops: [...byCode.values()], total: byCode.size, totalSource: "swept", cells, capped, failed, note };
}

const nissanQuery = (brand, lat, lng) =>
  `{ getDealersByLatLng(isMarketingDealer:false, location:{latitude:${lat}, longitude:${lng}}, market:{application:inventory, brand:${brand}, lang:en, region:us}, radius:400, size:100) { id name websiteURL address { addressLine1 city stateCode postalCode } } }`;

/** Nissan and Infiniti share one GraphQL host (graphql.infinitiusa.com does
 *  not resolve) and differ only by the `brand` enum — which is lowercase and
 *  UNQUOTED; quoting it or upper-casing it fails validation. The server caps
 *  hard at 100 rows and ~458 mi per call whatever `size` and `radius` ask for,
 *  so this sweeps.
 *
 *  Nissan's denominator is independently known: its dealer sitemap publishes
 *  1,042 rooftop pages. Those pages themselves are unreachable — Akamai 302s
 *  them to /nissandealers/location/ which then 403s, with an unvalidated
 *  `_abck` bot-manager cookie, identically with full Chrome client hints. That
 *  is a WAF, not a robots rule (robots.txt does not disallow /nissandealers/),
 *  and it is moot here because the GraphQL path carries `websiteURL` anyway.
 *  `websiteURL` comes back UPPER-CASED on many rows — normalizeDomain lowers
 *  it, but do not key on the raw string. */
function nissanish(brand, label, note) {
  return async () => {
    const { coveringGrid } = await import("./lib/oem/grid.mjs");
    const g = coveringGrid();
    if (!g) return null;
    const byCode = new Map();
    let cells = 0, capped = 0, failed = 0;
    for (const cell of g.cells.values()) {
      const [lat, lng] = g.zips[cell.zip];
      const res = await politePostJson("https://graphql.nissanusa.com/graphql", {
        headers: { origin: `https://www.${brand === "infiniti" ? "infinitiusa" : "nissanusa"}.com`, referer: `https://www.${brand === "infiniti" ? "infinitiusa" : "nissanusa"}.com/` },
        body: { query: nissanQuery(brand, lat.toFixed(4), lng.toFixed(4)) },
        timeoutMs: 45000,
      });
      cells++;
      const rows = res.json?.data?.getDealersByLatLng;
      if (res.status !== 200 || !Array.isArray(rows)) { failed++; continue; }
      if (rows.length >= 100) capped++;
      for (const d of rows) {
        const code = String(d?.id ?? "");
        if (!code || byCode.has(code)) continue;
        const a = d?.address ?? {};
        const st = String(a.stateCode ?? "").toUpperCase();
        byCode.set(code, {
          domain: normalizeDomain(d?.websiteURL),
          name: String(d?.name ?? "").replace(/\s+/g, " ").trim(),
          city: a.city || undefined,
          state: US_STATE.test(st) ? st : undefined,
          zip: String(a.postalCode ?? "").slice(0, 5) || undefined,
          code,
        });
      }
      if (cells % 50 === 0) console.error(`  ${label}: ${cells}/${g.cells.size} cells, ${byCode.size} rooftops`);
    }
    if (!byCode.size) return null;
    console.error(`  ${label}: swept ${cells} cells (${failed} failed, ${capped} at the 100-row cap), ${byCode.size} rooftops`);
    return { rooftops: [...byCode.values()], total: byCode.size, totalSource: "swept", note };
  };
}

/** Hyundai: ZIP-scoped and capped at 45 rows — measured, not assumed
 *  (maxdealers=9999 changes nothing, and an undocumented `distance` that does
 *  work still tops out at 45). So it sweeps. `dealerUrl` is a bare domain with
 *  no scheme.
 *
 *  The path matters: /var/hyundai/services/dealer/dealers.json (and
 *  .../alldealers.json) sit behind Cloudflare and 403 — a first pass read that
 *  as Hyundai being walled. The `.service` path below is open, and robots.txt
 *  disallows only /archived/, /us/en/unsubscribe and /us/en/hyundai-pay-faq. */
const hyundai = () =>
  sweepGrid({
    label: "hyundai",
    cap: 45,
    cellUrl: ({ zip }) => `https://www.hyundaiusa.com/var/hyundai/services/dealer.dealerByZipV2.service?brand=hyundai&model=all&lang=en&zip=${zip}&maxdealers=500`,
    // Referer is load-bearing here: without it the edge answers 403.
    headers: { referer: "https://www.hyundaiusa.com/us/en/dealer-locator" },
    parse: (res) => {
      const list = res.json?.dealers ?? (Array.isArray(res.json) ? res.json : null);
      if (res.status !== 200 || !Array.isArray(list)) return null;
      return list.map((d) => {
        const st = String(d?.state ?? "").toUpperCase();
        return {
          domain: normalizeDomain(d?.dealerUrl),
          name: String(d?.dealerNm ?? "").replace(/\s+/g, " ").trim(),
          city: d?.city || undefined,
          state: US_STATE.test(st) ? st : undefined,
          zip: String(d?.zipCd ?? "").slice(0, 5) || undefined,
          code: d?.dealerCd ? String(d.dealerCd) : undefined,
        };
      });
    },
    note: "Listed by Hyundai in its own dealer locator (hyundaiusa.com dealerByZipV2), whose `dealerUrl` states this rooftop's website — the domain is the manufacturer's, not generated from the name",
  });

/** Honda and Acura: one platform locator shape on two hosts, and the HOST is
 *  the brand — `productDivisionCode` is decorative (division B asked of the
 *  Honda host still answers Honda rooftops; acura.com needs no division at
 *  all). Everything below is measured 2026-08-30, written down so the next
 *  pass does not re-derive it:
 *
 *  - The bare endpoint is 10-NEAREST, not a radius. A first pass read it as
 *    "ZIP-local, ~27 mi" because ten dealers span ~27 mi in a metro — but the
 *    same ten span 300 mi around Miles City, MT. k-nearest, k=10.
 *  - Of every count parameter the obvious names suggest (maxDealers,
 *    numberOfDealers, count, limit, top, pageSize, rows, take…), exactly one
 *    is real: `maxResults`. And it has a silent cliff: 500 works, 501 and up
 *    returns an EMPTY ARRAY — a 200 that reads as "no dealers anywhere near
 *    this ZIP". Never raise it.
 *  - At maxResults=500 the response is every dealer within a ~300 mi server
 *    radius (298 mi max measured at LA; sparse Kansas returns 25 rows —
 *    radius-bound, not count-bound). The shared grid's ~100 mi cells sit
 *    comfortably inside that, so the sweep is a covering, not a sample; 500
 *    coming back exactly would mean a cell hid rooftops, and is counted as
 *    capped. Honolulu and Anchorage anchors cover the two off-grid states.
 *  - The v3 inventoryAndDealers endpoint (the honda.mjs inventory lane) is the
 *    wider-radius cousin, but it REQUIRES modelGroup+modelYear and scopes its
 *    dealer list to that model's availability — a roster built from it would
 *    be a union of model availability, not the franchise. Unnecessary once
 *    maxResults surfaced.
 *  - `webAddress` is Honda's own statement of the rooftop's site (~100% fill
 *    in every probe). Rows flagged isServiceCenter are not selling rooftops
 *    and are dropped.
 *  - robots: automobiles.honda.com disallows /platform/admin/ but not
 *    /platform/api/; acura.com's robots does not touch /platform/ at all.
 *    Both hosts TLS-fingerprint-block curl (Akamai, like bmwusa.com); Node's
 *    fetch is not blocked. */
function hondaish(host, division, label, note) {
  return () =>
    sweepGrid({
      label,
      cap: 500,
      extraZips: ["96813", "99501"], // Honolulu, Anchorage
      cellUrl: ({ zip }) => `https://${host}/platform/api/v1/dealers?${division ? `productDivisionCode=${division}&` : ""}zipCode=${zip}&maxResults=500`,
      parse: (res) => {
        if (res.status !== 200 || !Array.isArray(res.json)) return null;
        return res.json
          .filter((d) => d?.isServiceCenter !== true)
          .map((d) => {
            const state = String(d?.state ?? "").toUpperCase();
            return {
              domain: normalizeDomain(d?.webAddress),
              name: String(d?.name ?? "").replace(/\s+/g, " ").trim(),
              city: d?.city || undefined,
              state: US_STATE.test(state) ? state : undefined,
              zip: /^\d{5}/.test(String(d?.zipCode ?? "")) ? String(d.zipCode).slice(0, 5) : undefined,
              code: d?.dealerNumber ? String(d.dealerNumber) : undefined,
            };
          });
      },
      note,
    });
}

/** Jaguar and Land Rover: one lambda serves every JLR market
 *  (retailerlocator.jaguarlandrover.com — the stack traces name it
 *  NationalDealerSearchLambda), brand chosen by query param. Measured
 *  2026-08-30:
 *
 *  - The brand values are "Jaguar" and "Land Rover", verbatim, space and all.
 *    The locator page's own data-brand="jdx" is a UI skin name and the API
 *    answers it "No results found" — as it does lowercase region codes'
 *    uppercase twins' brands ldx/landrover/LandRover.
 *  - The NATIONAL call is silently capped. A latitude/longitude search at any
 *    radius (tested to 10,000 mi) answers exactly 72 rows for Jaguar and 71
 *    for Land Rover — while California alone holds 28 Land Rover rooftops and
 *    six states sum to 63 of Jaguar's 72. (The 2026-08-30 discovery sweep saw
 *    184 on another national variant; the number varies, the silence doesn't.)
 *    No error, no truncation flag. Never trust an uncapped-looking JLR total.
 *  - `region=` (lowercase state abbr) enumerates a state completely and
 *    ignores `radius`. A region with no rooftops answers 200 whose body is a
 *    WRAPPED error — {"errorMessage":"…\"httpStatus\":404… No results
 *    found"} — which is a zero, not a failure (Wyoming really has no Jaguar
 *    rooftop). Any other failure aborts the brand: the state list is a closed
 *    enumeration, so one missing state would silently drop its rooftops in a
 *    way a spatial sweep's `failed` counter at least confesses.
 *  - Required params: requestMarketLocale=en_us, unitOfMeasure, radius, brand,
 *    country=us, plus filter — filter=dealer,approvedPreOwned is the site's
 *    own default (selling rooftops and approved-pre-owned stores).
 *  - Fields: `ciCode` is the dealer code, `homePage` the rooftop's own site
 *    (17/17 and 28/28 fill in the CA probes), address is town/county/postCode
 *    with the STATE in `county`.
 *  - robots: jaguarusa.com disallows /search.html and /resources/ (not the
 *    locator), landroverusa.com disallows nothing, and the API host publishes
 *    no robots.txt (403 JSON) — nothing declines this read. */
const JLR_REGIONS = (
  "al ak az ar ca co ct de fl ga hi id il in ia ks ky la me md ma mi mn ms mo " +
  "mt ne nv nh nj nm ny nc nd oh ok or pa ri sc sd tn tx ut vt va wa wv wi wy " +
  "dc pr vi gu"
).split(" ");
function jlrBrand(brand, site, label, note) {
  return async () => {
    const byCode = new Map();
    let empty = 0;
    for (const region of JLR_REGIONS) {
      const url =
        `https://retailerlocator.jaguarlandrover.com/dealers?brand=${encodeURIComponent(brand)}&region=${region}` +
        `&requestMarketLocale=en_us&unitOfMeasure=Miles&country=us&radius=50&filter=${encodeURIComponent("dealer,approvedPreOwned")}&fetchOpeningTimes=false`;
      const res = await politeGetJson(url, { headers: { ...UA_HEADERS, origin: `https://${site}`, referer: `https://${site}/` }, timeoutMs: 45000 });
      const rows = res.json?.dealers;
      if (!Array.isArray(rows)) {
        if (res.status === 200 && String(res.json?.errorMessage ?? "").includes("No results found")) { empty++; continue; }
        console.error(`${label}: region=${region} failed (${res.status}) — aborting, a missing state is a silent hole`);
        return null;
      }
      for (const d of rows) {
        const code = String(d?.ciCode ?? "");
        if (!code || byCode.has(code)) continue;
        const a = d?.address ?? {};
        const st = String(a.county ?? "").toUpperCase();
        byCode.set(code, {
          domain: normalizeDomain(d?.homePage),
          name: String(d?.name ?? "").replace(/\s+/g, " ").trim(),
          city: a.town || undefined,
          state: US_STATE.test(st) ? st : undefined,
          zip: /^\d{5}/.test(String(a.postCode ?? "")) ? String(a.postCode).slice(0, 5) : undefined,
          code,
        });
      }
    }
    if (!byCode.size) return null;
    console.error(`  ${label}: swept ${JLR_REGIONS.length} regions (${empty} with no rooftops), ${byCode.size} rooftops`);
    return { rooftops: [...byCode.values()], total: byCode.size, totalSource: "swept", note };
  };
}

/** Cadillac and Buick only, and that restriction is the point — see the
 *  RECORDED NEGATIVES at the top of this file. All four GM brands share this
 *  backend, but chevrolet.com and gmc.com robots-disallow /bypass/, and
 *  fetching a Chevrolet roster from the Cadillac host because `makeCodes` is a
 *  query parameter would be routing around that verdict rather than
 *  respecting it. Each brand here is asked of its own host, for its own
 *  makeCode.
 *
 *  The three headers below are load-bearing: without them the service answers
 *  a Spring 400 regardless of UA, cookies, referer or encoding. Results cap at
 *  50 per call (desiredCount=6000&distance=5000 still returns exactly 50), so
 *  this sweeps. Website field is `dealerUrl`. */
function gmBrand(host, makeCode, label) {
  return () =>
    sweepGrid({
      label,
      cap: 50,
      cellUrl: ({ lat, lng }) =>
        `https://${host}/bypass/pcf/quantum-dealer-locator/v1/getDealers?desiredCount=50&distance=1000&makeCodes=${makeCode}&serviceCodes=&latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&searchType=latLongSearch`,
      parse: (res) => {
        const list = res.json?.payload?.dealers ?? res.json?.dealers ?? (Array.isArray(res.json) ? res.json : null);
        if (res.status !== 200 || !Array.isArray(list)) return null;
        return list.map((d) => {
          const a = d?.address ?? {};
          const st = String(a.countrySubdivisionCode ?? "").toUpperCase();
          return {
            domain: normalizeDomain(d?.dealerUrl),
            name: String(d?.dealerName ?? "").replace(/\s+/g, " ").trim(),
            city: a.cityName || undefined,
            state: US_STATE.test(st) ? st : undefined,
            zip: String(a.postalCode ?? "").slice(0, 5) || undefined,
            code: d?.bac ? String(d.bac) : d?.dealerCode ? String(d.dealerCode) : undefined,
          };
        });
      },
      note: `Listed by GM in its own ${label[0].toUpperCase()}${label.slice(1)} dealer locator (${host}), whose \`dealerUrl\` states this rooftop's website — the domain is the manufacturer's, not generated from the name`,
    });
}

/** Mercedes-Benz: one call, the whole country. The ZIP orders the results but
 *  does not scope them — `radius` defaults to `all` and the response echoes
 *  that back in `requestParameters` — and `totalCount` (387) equals what comes
 *  back, so a short read is visible rather than silently partial.
 *
 *  This is the host scraper/lib/oem/mercedes.mjs already uses for inventory.
 *  386 of 387 carry `url`. */
async function mercedes() {
  const res = await politeGetJson("https://nafta-service.mbusa.com/api/dlrsrv/v1/us/search?zip=66952&start=0&count=1000&filter=mbdealer", {
    headers: { ...UA_HEADERS, origin: "https://www.mbusa.com", referer: "https://www.mbusa.com/" },
    timeoutMs: 60000,
  });
  const list = res.json?.results ?? res.json?.dealers ?? (Array.isArray(res.json) ? res.json : null);
  if (res.status !== 200 || !Array.isArray(list) || !list.length) return null;
  const reported = Number(res.json?.totalCount) || null;
  if (reported && list.length < reported) return null; // a partial roster certifies a partial country
  const rooftops = list.map((d) => {
    const a = (Array.isArray(d?.address) ? d.address.find((x) => x.type === "primary") ?? d.address[0] : d?.address) ?? {};
    const st = String(a.state ?? "").toUpperCase();
    return {
      domain: normalizeDomain(d?.url),
      name: String(d?.name ?? "").replace(/\s+/g, " ").trim(),
      city: a.city || undefined,
      state: US_STATE.test(st) ? st : undefined,
      zip: String(a.zip ?? "").slice(0, 5) || undefined,
      code: d?.id ? String(d.id) : undefined,
    };
  });
  return {
    rooftops,
    total: reported ?? list.length,
    totalSource: "published",
    note: "Listed by Mercedes-Benz in its own national dealer directory (nafta-service.mbusa.com/api/dlrsrv), whose `url` states this rooftop's website — the domain is the manufacturer's, not generated from the name",
  };
}

/** BMW and MINI share one BMW Group servlet shape. A single big-radius call
 *  from a central ZIP returns the country: 441 centres for BMW, of which 368
 *  carry a `newVehicleSales` block — that block, not the centre, is the
 *  selling rooftop, and it is what holds `dealerURL`.
 *
 *  Two anchors are unioned because one Kansas anchor reached only 47 states:
 *  the shortfall is measured, and Alaska and Hawaii are the obvious suspects,
 *  so Anchorage and Honolulu are asked as well rather than assuming.
 *
 *  MINI TRAP, and it is exactly the house rule: MINI of Manhattan's
 *  `dealerURL` is the string "www.mininyc" — no TLD. That is the source's own
 *  defect, and appending ".com" would be guessing a domain. normalizeDomain
 *  returns null for a host with no dot, so the row is dropped. Abstain, never
 *  repair.
 *
 *  bmwusa.com robots disallows /api, /search-results.html and /errors/;
 *  /bin/ is not disallowed. miniusa.com disallows only /search-results.
 *  (curl is TLS-fingerprint-blocked on bmwusa.com; Node's fetch — what
 *  lib/http.mjs uses — is not.) */
function bmwish(urlFor, label, note) {
  return async () => {
    const byCode = new Map();
    let reached = 0;
    for (const zip of ["66952", "99501", "96813"]) {
      const res = await politeGetJson(urlFor(zip), { headers: { ...UA_HEADERS, referer: "https://www.bmwusa.com/dealer-locator.html" }, timeoutMs: 90000 });
      if (res.status !== 200) continue;
      const centres = res.json?.dataContent?.dealerDetails?.dealerDetailsObjects;
      if (!Array.isArray(centres)) continue;
      reached++;
      for (const c of centres) {
        for (const d of c?.newVehicleSales ?? []) {
          const code = String(d?.agCode ?? c?.centerID ?? "");
          if (!code || byCode.has(code)) continue;
          const a = (Array.isArray(d?.address) ? d.address[0] : d?.address) ?? {};
          const st = String(a.state ?? "").toUpperCase();
          byCode.set(code, {
            domain: normalizeDomain(d?.dealerURL),
            name: String(d?.dealerName ?? "").replace(/\s+/g, " ").trim(),
            city: a.city || undefined,
            state: US_STATE.test(st) ? st : undefined,
            zip: String(a.zipcode ?? "").slice(0, 5) || undefined,
            code,
          });
        }
      }
    }
    if (!reached || !byCode.size) return null;
    return { rooftops: [...byCode.values()], total: byCode.size, totalSource: "swept", note };
  };
}

/** Volvo and Porsche publish their whole US retailer list inside the locator
 *  PAGE rather than behind an API — Volvo as a Next.js RSC flight payload,
 *  Porsche as an Astro-serialized island. Neither has a stable JSON envelope
 *  to address, so both are read by scanning the page for the maker's own
 *  per-rooftop object shape and requiring the identifying key to be present.
 *  If the page stops carrying that shape this returns null rather than a
 *  partial country.
 *
 *  Volvo: robots' `User-agent: *` group does not touch /us/dealers/; the
 *  AI-crawler group disallows /api/*, which this is not. Porsche: robots
 *  disallows /api/, /search/ and /*​/search/; /us/en-US/dealersearch/ is
 *  allowed. (finder.porsche.com, the inventory finder, serves a Vercel bot
 *  challenge — recorded negative, not pursued, and unnecessary here.) */
function embeddedPage(url, idKey, pick, label, note) {
  return async () => {
    const r = await fetchPage(url);
    if (r.status !== 200 || !r.body) return null;
    // Unescape the two encodings these payloads use, then pull every balanced
    // object that carries the identifying key.
    const text = r.body.replace(/&quot;/g, '"').replace(/\\"/g, '"');
    const byCode = new Map();
    // The key sits somewhere inside a big object, and the nearest preceding
    // "{" is usually a NESTED one (Volvo's phoneNumbers, Porsche's address).
    // So walk outwards: try each earlier "{" in turn and keep the first whose
    // balanced parse actually carries the key as a DIRECT property.
    const marker = `"${idKey}"`;
    for (let i = text.indexOf(marker); i >= 0; i = text.indexOf(marker, i + 1)) {
      let start = i;
      for (let attempt = 0; attempt < 12; attempt++) {
        start = text.lastIndexOf("{", start - 1);
        if (start < 0) break;
        let depth = 0, inStr = false, esc = false, end = -1;
        for (let j = start; j < text.length && j < start + 60000; j++) {
          const c = text[j];
          if (esc) { esc = false; continue; }
          if (inStr) { if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
          if (c === '"') inStr = true;
          else if (c === "{") depth++;
          else if (c === "}" && --depth === 0) { end = j + 1; break; }
        }
        if (end < 0 || end < i) continue; // closed before the key — wrong object
        let o;
        try { o = JSON.parse(text.slice(start, end)); } catch { continue; }
        if (!(idKey in o)) continue;
        const row = pick(o);
        if (row?.code && !byCode.has(row.code)) byCode.set(row.code, row);
        break;
      }
    }
    if (!byCode.size) { console.error(`${label}: locator page carried no recognisable rooftop objects`); return null; }
    return { rooftops: [...byCode.values()], total: byCode.size, totalSource: "published", note };
  };
}

// GM's locator needs three headers or it answers 400; sweepGrid sends
// UA_HEADERS, so they are folded in there.
Object.assign(UA_HEADERS, { clientapplicationid: "quantum", locale: "en-US" });

const ADAPTERS = {
  lexus,
  kia,
  subaru,
  mazda,
  mitsubishi,
  volkswagen,
  genesis,
  hyundai,
  honda: hondaish(
    "automobiles.honda.com",
    "A",
    "honda",
    "Listed by Honda in its own dealer locator (automobiles.honda.com/platform/api/v1/dealers), whose `webAddress` states this rooftop's website — the domain is the manufacturer's, not generated from the name",
  ),
  acura: hondaish(
    "www.acura.com",
    null,
    "acura",
    "Listed by Acura in its own dealer locator (www.acura.com/platform/api/v1/dealers), whose `webAddress` states this rooftop's website — the domain is the manufacturer's, not generated from the name",
  ),
  jaguar: jlrBrand(
    "Jaguar",
    "www.jaguarusa.com",
    "jaguar",
    "Listed by Jaguar in JLR's own retailer locator (retailerlocator.jaguarlandrover.com, per-state region sweep), whose `homePage` states this rooftop's website — the domain is the manufacturer's, not generated from the name",
  ),
  landrover: jlrBrand(
    "Land Rover",
    "www.landroverusa.com",
    "landrover",
    "Listed by Land Rover in JLR's own retailer locator (retailerlocator.jaguarlandrover.com, per-state region sweep), whose `homePage` states this rooftop's website — the domain is the manufacturer's, not generated from the name",
  ),
  nissan: nissanish("nissan", "nissan", "Listed by Nissan in its own dealer locator (graphql.nissanusa.com), whose `websiteURL` states this rooftop's website — the domain is the manufacturer's, not generated from the name"),
  infiniti: nissanish("infiniti", "infiniti", "Listed by Infiniti in its own dealer locator (graphql.nissanusa.com, brand:infiniti), whose `websiteURL` states this rooftop's website — the domain is the manufacturer's, not generated from the name"),
  cadillac: gmBrand("www.cadillac.com", "006", "cadillac"),
  buick: gmBrand("www.buick.com", "004", "buick"),
  mercedes,
  bmw: bmwish(
    (zip) => `https://www.bmwusa.com/bin/dealerLocatorServlet?getdealerdetailsByRadius/${zip}/3000?includeSatelliteDealers=true`,
    "bmw",
    "Listed by BMW in its own national dealer locator (bmwusa.com dealerLocatorServlet), whose `dealerURL` states this rooftop's website — the domain is the manufacturer's, not generated from the name",
  ),
  mini: bmwish(
    (zip) => `https://www.miniusa.com/bin/services/gateway.dealerLocator.json/v1/mini-dealerlocator/getdealerdetailsByRadius/${zip}/3000`,
    "mini",
    "Listed by MINI in its own national dealer locator (miniusa.com dealer locator), whose `dealerURL` states this rooftop's website — the domain is the manufacturer's, not generated from the name",
  ),
  volvo: embeddedPage(
    "https://www.volvocars.com/us/dealers/dealer-locator/",
    "parmaPartnerCode",
    (o) => {
      const m = /,\s*([A-Z]{2})\s+(\d{5})/.exec(String(o.addressLine2 ?? ""));
      return o.parmaPartnerCode
        ? { domain: normalizeDomain(o.url), name: String(o.name ?? "").trim(), city: o.city || undefined, state: m?.[1], zip: m?.[2], code: String(o.parmaPartnerCode) }
        : null;
    },
    "volvo",
    "Listed by Volvo in its own national retailer locator (volvocars.com/us/dealers/dealer-locator), whose `url` states this rooftop's website — the domain is the manufacturer's, not generated from the name",
  ),
  porsche: embeddedPage(
    "https://www.porsche.com/us/en-US/dealersearch/",
    "ppnOrgId",
    (raw) => {
      // Astro serialises EVERY value as [0, value] (or [1, array]), so the
      // record has to be unwrapped before any field can be read. Reading it
      // raw is how a first pass got 218 rooftops and zero domains.
      const un = (v) => (Array.isArray(v) && v.length === 2 && (v[0] === 0 || v[0] === 1) ? un(v[1]) : Array.isArray(v) ? v.map(un) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, un(x)])) : v);
      const o = un(raw);
      const a = o.address ?? {};
      const st = String(a.state ?? o.state ?? "").toUpperCase();
      return o.ppnOrgId
        ? { domain: normalizeDomain(o.contactDetails?.homepage ?? o.homepage), name: String(o.name ?? "").trim(), city: a.city ?? o.city ?? undefined, state: US_STATE.test(st) ? st : undefined, zip: String(a.postalCode ?? o.zip ?? "").slice(0, 5) || undefined, code: String(o.ppnOrgId) }
        : null;
    },
    "porsche",
    "Listed by Porsche in its own national dealer search (porsche.com/us/en-US/dealersearch), whose `homepage` states this rooftop's website — the domain is the manufacturer's, not generated from the name",
  ),
};

// ── run ─────────────────────────────────────────────────────────────────────
const want = args.filter((a) => !a.startsWith("--") && a !== DUMP);
const brands = want.length ? want : Object.keys(ADAPTERS);

const found = new Map(); // domain -> { name, city, state, zip, brands:Set, codes:Set }
const coverage = []; // per-brand denominator/overlap, half the deliverable
const notes = new Map(); // brand -> provenance sentence

for (const brand of brands) {
  const fn = ADAPTERS[brand];
  if (!fn) { console.error(`${brand}: no adapter — known: ${Object.keys(ADAPTERS).join(", ")}`); continue; }
  let r;
  try { r = await fn(); } catch (e) { console.error(`${brand}: ${e.message}`); continue; }
  if (!r) { console.error(`${brand}: roster unavailable — skipping (a partial roster would certify a partial country)`); continue; }
  notes.set(brand, r.note);
  let withSite = 0;
  for (const d of r.rooftops) {
    if (!d.domain || NOT_A_ROOFTOP.test(d.domain)) continue;
    withSite++;
    if (!found.has(d.domain)) found.set(d.domain, { ...d, brands: new Set(), codes: new Set() });
    const f = found.get(d.domain);
    f.brands.add(brand);
    if (d.code) f.codes.add(d.code);
  }
  coverage.push({ brand, total: r.total, withSite });
  console.error(`${brand}: ${r.total} rooftops published, ${withSite} state a usable own-site domain`);
}

if (!found.size) { console.error("no rooftops harvested"); process.exit(0); }
console.error(`\ntotal distinct rooftop domains across ${coverage.length} rosters: ${found.size}`);

if (DUMP) {
  await writeFile(DUMP, JSON.stringify([...found.entries()].map(([d, f]) => ({ ...f, domain: d, brands: [...f.brands], codes: [...f.codes] })), null, 2));
}

// ── append ──────────────────────────────────────────────────────────────────
const regUrl = new URL("./registry/registry.json", import.meta.url);
const raw = await readFile(regUrl, "utf-8");
const registry = JSON.parse(raw);
// Same guard harvest-dealers.mjs and brand-directory-dealers.mjs use: if the
// file no longer round-trips, appending would rewrite every line as a side
// effect. The registry is hand-curated; refuse rather than reformat it.
if (JSON.stringify(registry, null, 2) !== raw) {
  console.error("oem-dealer-rosters: registry does not round-trip JSON.stringify(…, 2) — refusing to append");
  process.exit(1);
}
const known = new Set(registry.sites.map((s) => s.domain.replace(/^www\./, "").toLowerCase()));

const today = new Date().toISOString().slice(0, 10);
const additions = [];
for (const [domain, f] of [...found.entries()].sort()) {
  if (known.has(domain)) continue;
  const brand = [...f.brands].sort().join("/");
  additions.push({
    domain,
    name: f.name || "Dealership Website",
    kind: "rooftop",
    platform: "unknown",
    robots: "unknown",
    status: "discovered",
    notes: `${notes.get([...f.brands][0]) ?? "Listed by the manufacturer in its own national dealer roster, which states this rooftop's website"}${f.codes.size ? `; dealer code ${[...f.codes].sort().join("/")}` : ""} (${today})`,
    ...(f.city || f.state || f.zip ? { location: { city: f.city, state: f.state, zip: f.zip } } : {}),
  });
  void brand;
}

// The per-brand coverage table: denominator the maker publishes, how much of
// it the registry already held, how much this run adds.
console.error("\nbrand            published  states-site  already-known  new");
for (const c of coverage) {
  const mine = [...found.entries()].filter(([, f]) => f.brands.has(c.brand));
  const already = mine.filter(([d]) => known.has(d)).length;
  console.error(
    `${c.brand.padEnd(16)} ${String(c.total).padStart(9)}  ${String(c.withSite).padStart(11)}  ${String(already).padStart(13)}  ${String(mine.length - already).padStart(3)}`,
  );
}

console.error(`\nalready tracked: ${found.size - additions.length}, new: ${additions.length}`);
if (!additions.length) process.exit(0);

if (WRITE) {
  registry.sites.push(...additions);
  await writeFile(regUrl, JSON.stringify(registry, null, 2));
  console.error(`appended ${additions.length} discovered rows`);
} else {
  console.error("dry run (--write to append). First 30:");
  for (const a of additions.slice(0, 30)) console.error(`  ${a.domain}  ${a.name}  ${a.location?.state ?? ""}`);
}

void fetchPage; // adapters that sweep HTML directories use this
