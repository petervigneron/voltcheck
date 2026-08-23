// EchoPark (Sonic Automotive's national used-car retailer), the whole lot in
// 13 requests.
//
// EchoPark buys, reconditions and retails its own used cars from 17 stores; a
// car it lists is its own stock, so — like enterprise.mjs and driveway.mjs —
// one sweep IS the merchant's complete national inventory and there is no
// other rooftop where these VINs could appear. The registry has carried
// echopark.com as blocked since 2026-08-11 ("Akamai edge accepts TLS then
// stalls, 0 bytes, no HTTP response"), which was true of the apex and is
// still true of most of the site; this lane is the one door that is open.
//
// WHAT IS OPEN AND WHAT IS NOT (re-measured 2026-08-23, declared identity,
// every request through lib/http.mjs)
//
// robots.txt allows the search path outright: `Allow: /used-cars/*`, and the
// only Disallow lines are /checkout/*, /used-cars1*, /used-cars2*,
// /tactical-fleet and two ?gen=1 offer paths. Nothing here is robots-excluded.
//
// Three of the four doors are shut by Akamai, and they answer a flat 403
// "Access Denied" with an Akamai reference id — not a challenge to solve, so
// they are simply recorded and left alone:
//   - https://www.echopark.com/api/vehicle-inventory-search  (the JSON API
//     the page itself calls) — 403 on every attempt;
//   - https://www.echopark.com/car/{VIN} (the VDPs) — 403 on all 7 sampled;
//   - https://www.echopark.com/used-cars/{make} (the faceted paths) — 403.
// The control that makes those readings mean something: in the same session,
// on the same host, with the same identity, https://www.echopark.com/used-cars
// answered 200 thirteen times in a row and returned 6,163 cars. The block is
// per-path bot management, not a host-wide refusal and not rate limiting.
//
// SO THE SRP IS THE SOURCE, AND IT CARRIES JSON
//
// /used-cars is server-rendered (Sitecore JSS + Vue) and embeds the search
// response verbatim in a <script id="__STORE__"> block:
// vehicleSearch.srpVehiclesData = {resultCount, currentPage, pages, items[],
// facets, _links}. Each item is the API's own record — vin, year, make,
// model, trim, miles, sellingPrice/basePrice/originalPrice, feeBreakdown,
// images[], url, dealership, stockNumber, inventoryStatus. Reading that JSON
// rather than the rendered cards matters for more than tidiness: the card
// prints "72K mi" where the JSON says 72,464, so the HTML would have cost us
// three digits of odometer on every car.
//
// PAGING: `page` and `take` are honoured server-side, facets are not.
// `?take=500` is clamped to 498 (the server echoes the effective value in
// _links._self), so the lot is 13 pages instead of the 281 the default 22
// would need. Bigger pages are also far cheaper per car: the page chrome is a
// fixed ~565 kB, so 22 cars cost 25 kB each and 498 cost ~6.9 kB each — the
// whole walk moves ~40 MB, not the ~160 MB a default-size walk would.
//
// Facet filtering is CLIENT-side only, which was worth establishing rather
// than assuming, because a server-side `enginedescription=Electric` filter
// would have turned this lane into two requests. Measured with a control:
// `?facets=drivetype:AWD` left resultCount at 6,163 when the facet's own
// count says 2,209, and so did every spelling of the engine filter — while
// `?dealer=EchoParkAtlanta` correctly cut it to 524, exactly the dealerid
// facet's count. So query parameters DO reach the API; the facet ones are
// simply not applied to a server-rendered response. Hence: walk the whole
// lot. At 13 requests and ~60 s that is cheap enough that no checkpoint or
// resume machinery is warranted.
//
// COMPLETENESS is the payload's own arithmetic-free signal: `resultCount`
// (6,163) and `pages` (13) come back on every page, the last page is short
// (187 of 498), and page 13 returns an empty items array. We stop on the
// short/empty page and then check the VIN count we actually collected
// against resultCount, so a silent short read fails the same way a missing
// page does. First full run: 6,163 of 6,163, zero duplicates, zero malformed
// VINs.
//
// WHAT THE SOURCE DOES NOT SAY, AND WHAT THAT COSTS
//
// The SRP record carries no fuel type, no engine, no drivetrain and no
// colour, and the VDP that would carry them is the 403 above. So this lane
// classifies from year/make/model/trim + VIN through classifyEv, which means
// Tesla/Lucid VINs land at high confidence off the WMI and everything else
// arrives as name_match "BEV?" for vpic-enrich to confirm — the normal
// contract for a source with no structured fuel field.
//
// The measured cost of that is PHEVs. EV_MODEL_RE has no plug-in nameplates
// and classifyEv's fuel path needs the word "plug", so on today's lot 135
// cars whose own model name says plug-in — 65 Mazda CX-90 PHEV, 48 Jeep
// Grand Cherokee 4xe, 5 Prius Prime, 2 Clarity Plug-In, 2 Niro Plug-In, a
// RAV4 Prime, a CX-70 PHEV, an Outlander PHEV, a Fusion Energi, a Volt and
// others — cannot be emitted by this lane at all. Seven Toyota bZ (the 2026
// rename of the bZ4X, a BEV) are missed the same way. Both gaps are in
// lib/ev.mjs, which is shared by every lane and owned elsewhere; synthesising
// a fuel string here from the model name would launder a name match into a
// "high" confidence the source never gave us, which is exactly what
// fuelTextOnly exists to catch. The honest fix is a plug-in vocabulary in
// ev.mjs, and it is worth ~135 cars on this lane alone.
//
// THE MODEL/TRIM SEAM. classifyEv reads one name string, so the lane has to
// choose what to put in it. Model alone loses real cars whose nameplate lives
// in the trim (9 Lexus RZ — model "RZ", trim "RZ 450e Premium"; 2 MINI
// Cooper SE). Model+trim concatenated invents cars that are not there: "Jeep
// Grand Wagoneer" + "Series II" reads as "Wagoneer S", Jeep's BEV, on 4
// petrol Wagoneers. So both are tried and a match is only kept when it lands
// inside the model or inside the trim — never straddling the join between
// them. A genuine Wagoneer S would be model "Wagoneer S" and survives. The
// rows this rule rejects are counted into report.notes, so if EchoPark ever
// starts splitting nameplates across the two fields ("IONIQ" + "5 SEL") the
// number jumps and someone sees it instead of the cars quietly vanishing.
import { fetchPage } from "../http.mjs";
import { classifyEv } from "../ev.mjs";
import { pickTaggedPrice } from "../price-provenance.mjs";
import { priceFloor } from "../price-floor.mjs";

export const ECHOPARK = {
  key: "echopark",
  domain: "echopark.com",
  srpUrl: "https://www.echopark.com/used-cars",
  // Requested page size. The server clamps 500 → 498 and reports the
  // effective value in _links._self; we never rely on the number, only on
  // items.length and resultCount.
  take: 500,
  minExpected: 250, // 437 EVs on the first full run; alert well below that
  minLot: 3000, // the whole lot ran 6,163; a walk that small means something broke
};

// recheck.mjs skips this domain, and here the reason is sharper than the
// usual "the sweep is its own liveness check": every /car/{VIN} VDP answers
// 403 to us, so rechecking one could only ever produce a false "gone". The
// nightly sweep's truncated:false is what retires sold VINs.
export const OEM_LOCATOR_DOMAINS = new Set([ECHOPARK.domain]);

const MAX_PAGES = 40; // ~20k cars — 3x today's lot, pure runaway guard
const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;
const CURRENT_YEAR = new Date().getFullYear();

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

const httpsUrl = (u) => (typeof u === "string" && u.startsWith("https://") ? u : undefined);

// The __STORE__ block is the page's own Vuex state, serialised as JSON in a
// type="application/json" script (so no HTML-entity unescaping is needed —
// unlike the JSS state block beside it).
// Returns {store} or {why} — the reason matters, because "no script tag at
// all" would mean the page changed shape while "tag present, JSON truncated"
// is a short read to retry, and one full sweep hit exactly that (page 10 of
// 13 came back a 200 with no usable payload, then the same URL answered
// correctly four times in a row at 3,478,165 bytes each).
function readStore(html) {
  const m = html.match(/<script[^>]*id="__STORE__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return { why: `no __STORE__ script in ${html.length} bytes` };
  try {
    return { store: JSON.parse(m[1]) };
  } catch (e) {
    return { why: `__STORE__ JSON unparseable (${html.length} bytes, ${e.message.slice(0, 60)})` };
  }
}

// EchoPark's 17 stores, read off the same page we are already fetching rather
// than hardcoded, so a new store's zip and state arrive the night it opens.
// The vehicle record names its store only by dealerId ("EchoParkAtlanta"),
// and the display name is not the city ("EchoPark Duluth" in Duluth, GA).
function storeIndex(store) {
  const byId = new Map();
  for (const d of store?.common?.dealerships ?? []) {
    const id = String(d?.dealerId ?? "").trim();
    if (!id) continue;
    const zipRaw = String(d.zip ?? "");
    byId.set(id, {
      name: String(d.marketingDisplayName || d.storeName || "EchoPark").trim(),
      city: String(d.city ?? "").trim() || undefined,
      state: String(d.state ?? "").trim().toUpperCase() || undefined,
      zip: /^\d{5}/.test(zipRaw) ? zipRaw.slice(0, 5) : undefined,
    });
  }
  return byId;
}

// classifyEv, asked twice, and only believed when the match sits inside one
// field. See the seam note in the header for the four petrol Wagoneers this
// rejects and the nine Lexus RZ it keeps.
export function classifyItem(item) {
  const model = [item.year, item.make, item.model].filter(Boolean).join(" ");
  const onModel = classifyEv({ name: model, model: item.model, vehicleIdentificationNumber: item.vin });
  if (onModel.isEv) return onModel;
  const trim = String(item.trim ?? "").trim();
  if (!trim) return { isEv: false };
  const onTrim = classifyEv({ name: `${item.make} ${trim}`, model: trim, vehicleIdentificationNumber: item.vin });
  if (onTrim.isEv) return onTrim;
  // Did it only match across the join? Counted, not kept.
  const joined = classifyEv({ name: `${model} ${trim}`, model: item.model, vehicleIdentificationNumber: item.vin });
  return { isEv: false, seamOnly: joined.isEv };
}

function toRecord(item, stores, report) {
  const vin = String(item?.vin ?? "").toUpperCase();
  if (!VIN_RE.test(vin)) return null;
  const year = Number(item.year);
  if (!(year >= 1981 && year <= CURRENT_YEAR + 2)) return null;
  const make = String(item.make ?? "").trim();
  const model = String(item.model ?? "").trim();
  if (!make || !model) return null;

  const ev = classifyItem(item);
  if (!ev.isEv) {
    if (ev.seamOnly) report.seamRejected++;
    return null;
  }

  // sellingPrice is what the card prints as "Total": basePrice plus the
  // store's document fee (basePrice + feeBreakdown.documentFee, exact on all
  // 5,083 rows that carry one — $85 in Sacramento to $899 in Nashville).
  // We publish the higher, all-in number the shopper actually sees rather
  // than basePrice, because the house rule's caution is asymmetric: a price
  // that reads $699 low against sold comps manufactures a false bargain,
  // and that is the error that costs a shopper money. originalPrice is a
  // PREVIOUS ask (it is what the "price drop" badge counts down from), not
  // an MSRP, so it is not published as one.
  const price = num(item.sellingPrice);
  // Every EchoPark car is used, so the floor is the used ladder. Nothing on
  // the first full run fell below it (cheapest car in the whole 6,163-car lot
  // was $3,982, a 2004), but a lane that publishes a payment as a price is
  // one feed change away and abstaining costs nothing.
  const priced = price != null && price >= priceFloor({ isNew: false, year }) ? price : undefined;
  if (price != null && priced == null) report.belowFloor++;

  const st = stores.get(String(item.dealership ?? "").trim());
  const images = (item.images ?? []).map(httpsUrl).filter(Boolean).slice(0, 8);

  return {
    vin,
    year,
    make,
    model,
    trim: String(item.trim ?? "").trim() || undefined,
    ...pickTaggedPrice("echopark", [["sellingPrice", priced]]),
    mileage: num(item.miles),
    dealerName: st?.name ?? "EchoPark",
    city: st?.city,
    state: st?.state,
    zip: st?.zip,
    stockNumber: String(item.stockNumber ?? "").trim() || undefined,
    // EchoPark retails only used cars — the lot is served at /used-cars and
    // its own heading reads "6,163 used cars at EchoPark". There is no CPO
    // programme and no condition token in the record, so "used" is read from
    // what the merchant is rather than guessed per row.
    condition: "used",
    imageUrl: images[0],
    images,
    sourceUrl: `https://www.echopark.com/car/${vin}`,
    dealerDomain: ECHOPARK.domain,
    evKind: ev.kind,
    evConfidence: ev.confidence,
    platform: "echopark-locator",
    fromVdp: false,
    scrapedAt: new Date().toISOString(),
  };
}

async function srpPage(page, report) {
  const url = `${ECHOPARK.srpUrl}?page=${page}&take=${ECHOPARK.take}`;
  let last = "no attempt";
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetchPage(url);
    report.fetched++;
    if (res.status === "robots_disallowed") {
      report.errors.push("robots disallows /used-cars");
      return null;
    }
    if (res.status === 200 && res.body) {
      const { store, why } = readStore(res.body);
      const data = store?.vehicleSearch?.srpVehiclesData;
      if (data?.items) return { data, store };
      // A 200 whose payload we cannot read is retried, not believed: giving
      // up here is what turned one short read into a "walked 4,980 of 6,163"
      // shortfall that failed an otherwise clean sweep.
      last = why ?? "200 with no search payload";
    } else {
      // Akamai intermittently accepts the connection and drops it (4 of ~30
      // probe requests came back as a transport error, then the same URL
      // answered on the next try). A 403 is final — that is the bot wall, and
      // this lane does not try to get around it.
      const transient = String(res.status).startsWith("error:") || res.status === 429 || res.status >= 500;
      if (!transient) {
        report.errors.push(`page ${page}: ${res.status}`);
        return null;
      }
      last = String(res.status);
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  report.errors.push(`page ${page}: ${last} after 3 attempts`);
  return null;
}

// Pull EchoPark's complete national used stock and keep what classifyEv can
// settle. crawl.mjs-shaped report; see gm.mjs/enterprise.mjs for the
// completeness contract (truncated:false certifies echopark.com fully
// covered, licensing db-sync to retire the VINs that stopped appearing).
export async function pullEchoPark({ log = () => {} } = {}) {
  const report = { domain: ECHOPARK.domain, kind: "oem-locator", budget: null, fetched: 0, vehiclePages: 0, itemListVdps: 0, evs: [], errors: [], notes: [], seamRejected: 0, belowFloor: 0 };

  const byVin = new Map();
  const seen = new Set(); // every VIN walked, EV or not — the completeness unit
  let stores = new Map();
  let resultCount = 0;
  let pages = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    const got = await srpPage(page, report);
    if (!got) break; // error recorded; truncated follows
    const { data, store } = got;
    if (page === 0) stores = storeIndex(store);
    resultCount = Number(data.resultCount) || resultCount;
    pages = Number(data.pages) || pages;
    const items = data.items ?? [];
    for (const item of items) {
      const vin = String(item?.vin ?? "").toUpperCase();
      if (VIN_RE.test(vin)) seen.add(vin);
      const rec = toRecord(item, stores, report);
      if (rec) byVin.set(rec.vin, rec);
    }
    log(`echopark: page ${page}, ${seen.size}/${resultCount} cars walked, ${byVin.size} EVs`);
    // A short or empty page is the end of the lot — the count is a
    // cross-check afterwards, never the stop condition.
    if (items.length === 0) break;
    if (seen.size >= resultCount && resultCount > 0) break;
    if (pages > 0 && page + 1 >= pages) break;
  }

  report.evs = [...byVin.values()];
  report.vehiclePages = report.fetched;
  report.notes.push(`walked ${seen.size} of ${resultCount} cars in ${pages} pages; ${report.evs.length} EVs kept`);
  if (report.seamRejected) report.notes.push(`${report.seamRejected} name match(es) rejected for straddling the model/trim seam`);
  if (report.belowFloor) report.notes.push(`${report.belowFloor} price(s) below the year's junk floor, published without a price`);
  if (!stores.size) report.notes.push("store directory missing from the page — rows carry no city/state/zip");

  // Two independent completeness checks. The walk has to have covered the lot
  // the source itself counted, and the lot has to be a plausible size: a sweep
  // that returns 40 cars and calls itself complete would licence db-sync to
  // delist everything else EchoPark has.
  if (resultCount > 0 && seen.size < resultCount) report.errors.push(`walked ${seen.size} of ${resultCount} — paging shortfall`);
  if (seen.size < ECHOPARK.minLot) report.errors.push(`only ${seen.size} cars in the whole lot — expected >= ${ECHOPARK.minLot}`);
  report.truncated = report.errors.length > 0 || byVin.size < ECHOPARK.minExpected;
  return report;
}
