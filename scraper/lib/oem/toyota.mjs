// Toyota Motor North America inventory — the Lexus half, which is reachable,
// and the Toyota half, which is not. Read the negative before re-probing it.
//
// ============================================================================
// TOYOTA (bZ4X): NOT BUILDABLE. Do not re-probe. Probed 2026-08-15, re-probed
// in full 2026-08-18 with control tests. Two independent stops, either alone
// sufficient:
//
//  1. BOT WALL. Toyota and Lexus share ONE inventory backend,
//     api.search-inventory.toyota.com/graphql (the endpoint is published in
//     both toyota.com's and lexus.com's page HTML as REACT_APP_GRAPHQL_ENDPOINT
//     with an empty API key). A plain Node POST gets a stable
//         202, zero-length body, x-amzn-waf-action: challenge,
//         x-amzn-errortype: ForbiddenException
//     — an AWS WAF CAPTCHA challenge. Both sites ship the awswaf jsapi
//     (REACT_APP_SIT_AWS_CAPTCHA_URL) to solve it in-browser. We do not solve
//     challenges, so that door is shut by the owner's rule, not by our skill.
//
//     CONTROL, because "202 with no body" could equally have been us sending a
//     malformed request: five different request shapes were sent — a valid
//     `{__typename}` query, a syntactically INVALID query, an empty JSON object
//     with no `query` field at all, and the valid query again with lexus.com
//     and with toyota.com Origin/Referer. All five returned the identical
//     202/challenge/zero bytes. A GraphQL server that had actually seen the
//     invalid query would have answered with a parse error; identical responses
//     to valid and invalid input prove the WAF replies before the application
//     ever parses anything. So it is a wall, not a request-shape mistake.
//     Second half of the control: the very same Node client, same headers, gets
//     200 and 621 KB of JSON from www.lexus.com/rest/... (below). The client is
//     fine; that one host refuses it.
//
//  2. ROBOTS POLICY, which stands even if the WAF were lifted tomorrow.
//     www.toyota.com/robots.txt disallows, for `User-agent: *`:
//         Disallow: /search-inventory*      <- the inventory search itself
//         Disallow: /dealer-inventory/
//         Disallow: /vehicles/
//     There is no crawlable Toyota inventory surface left to build on.
//
// Every other Toyota-family route was walked to its end, so nobody has to
// repeat it:
//   - www.toyotacertified.com (Toyota Certified Used Vehicles) — robots.txt is
//     `Disallow: /rest/*`, which is exactly where its inventory service lives.
//     Policy-closed; not probed further, on purpose.
//   - api.toyotainventory.com — the host TCUV's page config still names. It
//     resolves (CNAME toyotaus-inventory-api-prod.azurewebsites.net) but its
//     TLS certificate is EXPIRED, so it fails handshake for any correct client.
//     A dead legacy host, not a wall, and not something to work around.
//   - www.buyatoyota.com (the regional dealer-association network; robots is
//     an Allow-list with no Disallow, so policy was fine) — its per-region
//     /{region}/inventory/ 301s straight to www.toyota.com/search-inventory/,
//     i.e. back into both stops above. No separate regional inventory API.
//   - smartpath.toyota.com — Angular shell; its robots.txt is an S3
//     AccessDenied, and it carries no inventory API of its own.
//   - www.toyota.com/rest/{toyota,tcom}/inventorySearch/... and /rest/*/dealers
//     — Toyota's AEM has no same-origin REST proxy mirroring the Lexus one
//     below; all shapes return the AEM 404 page.
// Toyota's bZ4X therefore reaches us only through the dealer crawl, the same
// as before. Subaru's Solterra is the same car on the same platform and gets
// the same answer.
//
// ============================================================================
// LEXUS RZ: BUILDABLE, and this is the lane. The way in is NOT the walled
// GraphQL — it is a second, older, same-origin REST endpoint that lexus.com's
// own search page still names in its inline config:
//     REACT_APP_INVENTORY_API_BASE = /rest/lexus/inventorySearch/cpo
// It answers a plain Node GET on www.lexus.com with 200 + JSON, no token, no
// challenge header, no captcha. Same shape as the Ford Blue Advantage find:
// the branded front door is walled while a proxy under the site's own origin
// answers normally.
//
// Fair game: www.lexus.com/robots.txt is `Allow: /` with only /build/*/summary
// and /build/*/*/* disallowed — /rest/ and /search-inventory are permitted, and
// politeGetJson checks that on every call anyway. Nothing is being bypassed;
// this is a documented endpoint of a site whose robots.txt invites us in. (The
// walled GraphQL host's own robots.txt is itself a 403, i.e. it states no
// policy — but we are not touching that host at all.)
//
// The param that unlocks it is `zip`, not `zipCode`. `zipCode` is silently
// ignored and the service answers {"message":{"id":"cpo-inventory-search-
// service-down"}} — which reads like an outage and is why an earlier pass
// wrote this endpoint off. It is not down; it is being asked the wrong word.
//
// What the endpoint will and will not do, all measured 2026-08-18:
//   - `model=RZ` is the BEV filter, and it is a real server-side filter.
//     `series=`, `seriesId=`, `fuel=`, `fuelType=` are all ignored.
//   - There is NO paging. `start`, `rows`, `pageSize`, `count`, `limit` are
//     every one of them ignored: `start=1000` returns start:0 and the same
//     first 100 rows. The result window is a hard 100.
//   - `radius` is bounded by how much inventory falls inside the circle, not by
//     response size: unfiltered r=1500 works from Los Angeles (1,835 found) but
//     504s from Denver, whose circle covers far more of the dealer body.
//   - A zero-result response has `numFound: 0` and NO `docs` key at all.
//   - The `dealerInfo` block is DROPPED from records whose dealer is far from
//     the query ZIP, even though the car is inside the radius and its dealer
//     code is still there. So the same VIN comes back richer from a near anchor
//     than from a far one — see keepRicher() and the geo fallback in toRecord().
// So the enumeration cannot be a walk, and it cannot be one big query.
//
// How this lane is nevertheless PROVABLY EXHAUSTIVE — which matters more here
// than anywhere else, see the recheck note below. Two facts do it:
//   (a) www.lexus.com/rest/lexus/dealers returns the complete national Lexus
//       dealer directory — 246 rooftops, every one with lat/lng and a 5-digit
//       ZIP. Verified national, not local: the response is byte-identical for
//       zipCode=90045, for zipCode=04101 (Portland, Maine) and for no zipCode
//       at all — same 246 ids, same 2,060,286 bytes. It is a static directory
//       the query does not touch.
//   (b) `radius` filters on the DEALER's distance from the query ZIP
//       (dealerInfo.distance <= radius; distanceSearched echoes the radius).
// Given both, a greedy set cover over the live directory that puts every one of
// the 246 dealers within COVER_RADIUS_MI of some chosen anchor means every RZ
// at every Lexus rooftop must appear in at least one anchor's result. That is a
// geometric guarantee about the whole population, not a per-radius sample like
// honda.mjs's grid. The cover is recomputed from the directory each run, so a
// new rooftop is covered the night it opens.
// The remaining way it could still lie is a cell overflowing the 100-row
// window, so every response is checked for numFound === docs.length and any
// cell that overflows is re-queried per-dealer at PER_DEALER_RADIUS_MI (a
// single rooftop cannot hold 100 CPO RZs). If that fallback also fails to
// resolve, the lane refuses to certify rather than delisting on a guess.
// Checked empirically as well as argued: a SECOND, finer cover (44 anchors at
// 150mi) returns the identical 115-VIN set with zero truncated cells — the
// 300mi cover misses nothing the finer one finds. If a future stock level
// starts overflowing cells, that shows up as the split path in the notes long
// before it could show up as a wrong delisting.
//
// CONTROL that `model=RZ` does not silently drop cars: at five separate ZIPs
// where the UNFILTERED result is untruncated (numFound === docs.length, so the
// whole local set is visible), the RZ rows inside that unfiltered set are
// exactly the rows `model=RZ` returns — 7/7, 6/6, 6/6, 5/5, 5/5, identical VIN
// sets. A filter that dropped cars would have disagreed at least once.
//
// RECHECK MUST SKIP lexus.com, and that is a control test, not a preference —
// the same call vw.mjs makes, for the same reason, and it is the reason the
// completeness proof above had to be real. There is no per-VIN dealer VDP in
// the payload (the richest link the record carries is the dealer's whole
// L/Certified listing page), and lexus.com's own per-car view is a client-
// rendered shell: /search-inventory/{details,vehicle}/{vin} returns 200 with
// byte-identical 31,591-byte HTML for a REAL VIN and for a FABRICATED one, and
// the VIN appears nowhere in the body. recheck's "200 but no VIN" soft-gone
// rule would therefore fire on every row and delist this entire lane. So
// lexus.com goes in OEM_LOCATOR_DOMAINS, delisting rides on this pull being
// exhaustive, and `truncated` is false only when it provably is.
// (honda.mjs and audi.mjs go the other way because their rows carry real dealer
// VDPs that 404 when the car is gone. The mechanism follows the evidence.)
//
// CPO ONLY, and deliberately so. /rest/lexus/inventorySearch/ has no `new`,
// `used`, `all` or `preowned` sibling — every variant 404s; new-car inventory
// goes through the walled GraphQL. So this is Lexus's L/Certified lot and
// nothing else, which is the half we actually want: it is used stock, with real
// mileage and a real asking price, in a channel that is ~94.5% new everywhere
// else. Single-marque, too — every row is a Lexus at a Lexus rooftop, so there
// are no other makes' trade-ins to harvest the way audi.mjs does.
import { politeGetJson } from "../http.mjs";
import { richness } from "../normalize.mjs";
import { EV_MODEL_RE, EV_ONLY_WMIS } from "../ev.mjs";
import { pickTaggedPrice } from "../price-provenance.mjs";

export const LEXUS = {
  key: "lexus",
  // Real domain: lexus.com publishes this index, the pull is provably complete,
  // and delisting depends on both of those (see the recheck note in the header).
  domain: "lexus.com",
  make: "Lexus",
  search: "https://www.lexus.com/rest/lexus/inventorySearch/cpo",
  dealers: "https://www.lexus.com/rest/lexus/dealers",
  // RZ is Lexus's only battery-electric nameplate in the US. Confirmed against
  // the endpoint itself rather than from memory: every series it carries is
  // ES/ESh/GX/IS/LS/NX/NXh/RC/RX/RXh/UX/UXh/RZ, and of those only RZ is a BEV
  // (the "h" series are hybrids; the UX 300e was never sold in the US).
  models: ["RZ"],
  // Floor. Observed ~70 nationally; this fires only if the model filter or the
  // endpoint itself moves, not on ordinary stock swings in a small CPO lot.
  minExpected: 20,
};

// recheck.mjs SKIPS this domain — see the header. Removing it from this set
// would delist the whole lane on the first recheck pass.
export const OEM_LOCATOR_DOMAINS = new Set([LEXUS.domain]);

const COVER_RADIUS_MI = 300; // 246 dealers -> ~19 anchors; measured 2-5s/call, no cell near the 100 window
const PER_DEALER_RADIUS_MI = 25; // fallback when a cover cell overflows the window
const RESULT_WINDOW = 100; // hard cap on docs per response; numFound above this means truncation
const REQUEST_BUDGET = 120; // ceiling incl. the per-dealer fallback; ~19 in the normal case
const TIMEOUT_MS = 45000; // a dense anchor measured 18s; the endpoint 504s rather than hanging
const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;
const HEADERS = {
  origin: "https://www.lexus.com",
  referer: "https://www.lexus.com/search-inventory",
};

const num = (v) => {
  const n = Number(String(v ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

const US_STATES = new Set(
  ("AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO " +
    "MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC")
    .split(" ")
);

// The payload shouts its colours ("IRIDIUM", "CIRCUIT RED") and its dealer
// cities are already mixed case. Title-case only what arrives all-caps.
const titleCase = (s) => {
  const t = String(s ?? "").trim();
  if (!t) return undefined;
  return t === t.toUpperCase()
    ? t.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase())
    : t;
};

// spec.drivetrain arrives as "AWD" on the RZ and as "Front-Wheel Drive" on the
// older combustion stock. Anything we do not recognise stays undefined rather
// than defaulting to a guess.
function driveOf(s) {
  const t = String(s ?? "").toUpperCase();
  if (/\bAWD\b|ALL.?WHEEL/.test(t)) return "AWD";
  if (/\bFWD\b|FRONT.?WHEEL/.test(t)) return "FWD";
  if (/\bRWD\b|REAR.?WHEEL/.test(t)) return "RWD";
  return undefined;
}

// "RZ 450e LUXURY AWD" -> model "RZ 450e", trim "Luxury".
//
// The trailing drive token is stripped rather than kept as part of the trim:
// it is a drivetrain, which the record already carries in its own field, and
// "AWD" is not a trim level. When nothing is left after stripping it — e.g.
// "RZ 450e AWD", which states no trim at all — the trim comes back undefined.
// Inventing one from the drivetrain is exactly the guess the house rule
// forbids, and the trim-less Lightnings are the standing example of what it
// costs when a resolver fills that blank in anyway.
function nameParts(modelname) {
  const raw = String(modelname ?? "").trim();
  const m = /^(RZ\s*\d{3}e?)\s*(.*)$/i.exec(raw);
  if (!m) return { model: undefined, trim: undefined };
  const model = m[1].replace(/\s+/g, " ").toUpperCase().replace(/E$/, "e");
  const rest = m[2].replace(/\b(AWD|FWD|RWD|4WD)\b/gi, " ").replace(/\s+/g, " ").trim();
  return { model, trim: rest ? titleCase(rest) : undefined };
}

// EV claim, by the project's own rule and nothing softer: BEV-high only when
// the VIN's WMI belongs to a maker that builds nothing else, or the nameplate
// matches EV_MODEL_RE. Lexus's WMI (JTJ) is shared with its combustion cars, so
// every RZ here rests on the nameplate arm — which is honest, because RZ is a
// battery-electric-only nameplate in every variant Lexus has sold (300e, 350e,
// 450e, 550e). Anything the regex does not recognise drops to name_match and
// vpic-enrich.mjs promotes or refutes it; this lane never asserts around it.
function evClaim(vin, model) {
  if (EV_ONLY_WMIS.has(vin.slice(0, 3))) return { evKind: "BEV", evConfidence: "high" };
  if (EV_MODEL_RE.test(`${LEXUS.make} ${model ?? ""}`)) return { evKind: "BEV", evConfidence: "high" };
  return { evKind: "BEV?", evConfidence: "name_match" };
}

// The car's page on lexus.com. Human-facing only — it is the client-rendered
// shell that recheck must not be pointed at (header). The `?zip=&vin=` shape is
// how the app itself builds this link (its search-inventory bundle navigates by
// appending a vin to the current search string, not by a path segment), and the
// dealer's own ZIP is carried so the page's zip-gate is already satisfied when
// a shopper lands on it.
const vdpUrl = (vin, zip) =>
  `https://www.lexus.com/search-inventory?${zip ? `zip=${encodeURIComponent(zip)}&` : ""}vin=${encodeURIComponent(vin)}`;

// `dealerById` is the national directory keyed by dealer code — see the geo
// note inside.
function toRecord(doc, drops, dealerById) {
  const bad = (reason) => {
    drops[reason] = (drops[reason] ?? 0) + 1;
    return null;
  };
  const ov = doc?.overview ?? {};
  const vin = String(ov.vin ?? "").toUpperCase();
  if (!VIN_RE.test(vin)) return bad("bad vin");
  // Structural gate on the record itself, not just on the query facet — the
  // same belt-and-suspenders honda.mjs applies with its Transmission "ELE"
  // check. `series` is the endpoint's own structured field; the nameplate has
  // to agree with it before we call anything an EV. (Some older combustion
  // rows carry no `series` at all, which is another reason not to trust the
  // query alone.)
  const series = String(ov.series ?? "").toUpperCase();
  const { model, trim } = nameParts(ov.modelname);
  if (series !== "RZ" || !model) return bad("not an RZ record");
  const year = Number(ov.year);
  if (!(year >= 1981 && year <= new Date().getFullYear() + 2)) return bad("implausible year");

  // Dealer geo. A handful of rows arrive with `dealerInfo` missing entirely
  // while still carrying `overview.dealer`, the dealer code — and that code is
  // a key into the national directory this lane already holds, which is Lexus's
  // own published address for the rooftop. Resolving through it is not a guess;
  // it is the same data by a second route. Anything still without a location
  // after that is WITHHELD below: the owner's standing rule is that a car is
  // never listed without one (bmw.mjs enforces the same rule the same way), and
  // a car a shopper cannot locate is worse than a car we did not list.
  const d = doc.dealerInfo ?? {};
  const a = d.address ?? {};
  const dir = dealerById?.get(String(ov.dealer ?? "")) ?? {};
  const st = (v) => (US_STATES.has(String(v ?? "").toUpperCase()) ? String(v).toUpperCase() : undefined);
  const zp = (v) => (/^\d{5}$/.test(String(v ?? "")) ? String(v) : undefined);
  const state = st(a.state) ?? st(dir.state);
  const zip = zp(a.zipCodeFive) ?? zp(dir.zip);
  const city = titleCase(a.city) ?? titleCase(dir.city);
  const dealerName = d.name || dir.name || undefined;
  if (!state || !zip) return bad("no dealer location (withheld)");
  const images = (doc.inventoryData?.inventoryUrl?.image ?? [])
    .filter((u) => typeof u === "string" && u.startsWith("https://"))
    .slice(0, 12);

  return {
    vin,
    year,
    make: LEXUS.make,
    model,
    trim,
    ...pickTaggedPrice("toyota", [
      ["lotPrice", num(ov.lotPrice)],
    ]),
    mileage: num(ov.miles),
    driveLine: driveOf(doc.spec?.drivetrain),
    exteriorColor: titleCase(doc.color?.exteriorcolorname),
    interiorColor: titleCase(doc.color?.interiorcolorname),
    dealerName,
    city,
    state,
    zip,
    // Every row in this lot is L/Certified — that is what the endpoint is.
    condition: "certified",
    imageUrl: images[0],
    images,
    sourceUrl: vdpUrl(vin, zip),
    dealerDomain: LEXUS.domain,
    ...evClaim(vin, model),
    platform: "lexus-locator",
    fromVdp: false,
    scrapedAt: new Date().toISOString(),
    // performance.mpgCombined on these rows is not an MPG figure (it reads
    // "5143" on an RZ), so no efficiency or range value is carried out of this
    // lane at all. An unlabelled number of unknown units is exactly how an
    // aggregate quietly becomes a false fact.
  };
}

// Cells overlap, so a car is normally seen more than once — and the copies are
// NOT interchangeable. The endpoint drops the whole `dealerInfo` block from
// records whose dealer is far from the query ZIP, while still returning the car
// and its dealer code: VIN JTJABABB6SA011386 came back from the Shreveport
// anchor with full dealer geo and from the Houston anchor with `dealerInfo`
// undefined (measured 2026-08-18). A plain last-wins `set()` therefore quietly
// kept whichever copy happened to be queried last. Keep the richer one, by the
// project's own richness() so this lane ranks records the way merge-shards
// does. (The geo fallback in toRecord() closes the same hole from the other
// side; both are wanted — one keeps the row, the other keeps its best copy.)
function keepRicher(byVin, rec) {
  const prev = byVin.get(rec.vin);
  if (!prev || richness(rec) > richness(prev)) byVin.set(rec.vin, rec);
}

// Great-circle miles.
function milesBetween(a, b) {
  const R = 3958.8, t = Math.PI / 180;
  const dla = (b.lat - a.lat) * t, dln = (b.lng - a.lng) * t;
  const h = Math.sin(dla / 2) ** 2 +
    Math.cos(a.lat * t) * Math.cos(b.lat * t) * Math.sin(dln / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Greedy set cover: pick anchors (from the dealers themselves, so an anchor ZIP
// is always somewhere the endpoint has stock to talk about) until every dealer
// is within `radius` of one. Returns anchors, each carrying the dealers it
// covers so a cell that overflows the window can be split back into them.
function coverDealers(dealers, radius) {
  const remaining = new Set(dealers.map((d) => d.id));
  const byId = new Map(dealers.map((d) => [d.id, d]));
  const anchors = [];
  while (remaining.size) {
    let best = null, bestCovered = null;
    for (const cand of dealers) {
      const covered = [];
      for (const id of remaining) if (milesBetween(cand, byId.get(id)) <= radius) covered.push(id);
      if (!bestCovered || covered.length > bestCovered.length) { best = cand; bestCovered = covered; }
    }
    // A dealer with no usable coordinates can cover nothing, including itself;
    // drop it from the frontier so the loop terminates, and let the caller
    // count it as an uncovered rooftop (which withholds certification).
    if (!bestCovered.length) break;
    anchors.push({ zip: best.zip, dealerIds: bestCovered });
    for (const id of bestCovered) remaining.delete(id);
  }
  return { anchors, uncovered: [...remaining] };
}

// One search call, with a single retry on a transient failure. Returns
// { docs, numFound } or null. The endpoint's "service-down" message body and a
// 504 are both treated as failures, never as an empty lot — reading either as
// "no cars here" is how a complete-certified lane delists real inventory.
async function search(zip, radius, model, report) {
  const url = `${LEXUS.search}?zip=${encodeURIComponent(zip)}&radius=${radius}&model=${encodeURIComponent(model)}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await politeGetJson(url, { headers: HEADERS, timeoutMs: TIMEOUT_MS });
    report.fetched++;
    if (res.status === "robots_disallowed") {
      report.errors.push("robots disallows /rest/lexus/inventorySearch/cpo");
      return null;
    }
    if (res.status === 200 && typeof res.json?.numFound === "number") {
      // A zero-result response carries no `docs` key at all.
      return { numFound: res.json.numFound, docs: res.json.docs ?? [] };
    }
    if (res.status === 200 && res.json?.message?.id) {
      // e.g. cpo-inventory-search-service-down — a real upstream failure.
      if (attempt === 0) { await new Promise((r) => setTimeout(r, 5000)); continue; }
      report.errors.push(`service message "${res.json.message.id}" at zip=${zip} r=${radius}`);
      return null;
    }
    const transient = String(res.status).startsWith("error:") || res.status === 429 || res.status >= 500;
    if (attempt === 0 && transient) { await new Promise((r) => setTimeout(r, 5000)); continue; }
    report.errors.push(`HTTP ${res.status} at zip=${zip} r=${radius}`);
    return null;
  }
  return null;
}

// The national dealer directory. One call, no parameters — it ignores them.
async function fetchDealers(report) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await politeGetJson(LEXUS.dealers, { headers: HEADERS, timeoutMs: TIMEOUT_MS });
    report.fetched++;
    if (res.status === "robots_disallowed") {
      report.errors.push("robots disallows /rest/lexus/dealers");
      return null;
    }
    if (res.status === 200 && Array.isArray(res.json?.dealers)) {
      const out = [];
      // Every rooftop the directory names, keyed by dealer code — the geo
      // fallback in toRecord() reads this even for dealers that lack the
      // coordinates the cover needs.
      const byId = new Map();
      for (const d of res.json.dealers) {
        const a = d?.dealerAddress ?? {};
        const zip = String(a.zipCodeFive ?? "");
        byId.set(String(d?.id), { name: d?.dealerName || undefined, city: a.city, state: a.state, zip });
        const lat = Number(d?.dealerLatitude), lng = Number(d?.dealerLongitude);
        if (!/^\d{5}$/.test(zip) || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
        out.push({ id: String(d.id), zip, lat, lng });
      }
      return { usable: out, byId, total: res.json.dealers.length };
    }
    if (attempt === 0) { await new Promise((r) => setTimeout(r, 5000)); continue; }
    report.errors.push(`dealer directory: HTTP ${res.status}`);
    return null;
  }
  return null;
}

// Pull Lexus's national L/Certified BEV (RZ) inventory. crawl.mjs-shaped report
// on the real lexus.com domain; certifies complete — and so drives delisting,
// since recheck skips this domain — only when the dealer directory loaded, the
// cover reached every rooftop, every cell came back inside the result window,
// and nothing errored. See the header for why the proof has to hold.
export async function pullLexus({ log = () => {} } = {}) {
  const report = {
    domain: LEXUS.domain, kind: "oem-locator", budget: null, fetched: 0,
    vehiclePages: 0, itemListVdps: 0, evs: [], errors: [], notes: [],
  };
  const byVin = new Map();
  const drops = {};
  let complete = true;

  const dir = await fetchDealers(report);
  if (!dir) {
    report.notes.push("no dealer directory — the covering proof is unavailable, so nothing is certified");
    report.truncated = true;
    return report;
  }
  if (dir.usable.length < dir.total) {
    report.notes.push(`${dir.total - dir.usable.length} of ${dir.total} dealers lack usable coordinates`);
  }

  const { anchors, uncovered } = coverDealers(dir.usable, COVER_RADIUS_MI);
  if (uncovered.length) {
    complete = false;
    report.errors.push(`${uncovered.length} dealers could not be covered — cannot certify`);
  }
  log(`lexus: ${dir.usable.length} dealers -> ${anchors.length} anchors at ${COVER_RADIUS_MI}mi`);

  for (const model of LEXUS.models) {
    for (const anchor of anchors) {
      if (report.fetched >= REQUEST_BUDGET) {
        complete = false;
        report.errors.push(`request budget ${REQUEST_BUDGET} hit mid-sweep — cannot certify`);
        break;
      }
      const r = await search(anchor.zip, COVER_RADIUS_MI, model, report);
      if (!r) { complete = false; continue; }
      if (r.numFound > r.docs.length || r.numFound > RESULT_WINDOW) {
        // The cell overflowed the 100-row window: the cars beyond it are
        // invisible from this anchor. Split it into the rooftops it covered and
        // ask each one directly — a single dealer cannot hold 100 CPO RZs.
        report.notes.push(`cell ${anchor.zip} overflowed (${r.numFound} found, ${r.docs.length} returned) — splitting to ${anchor.dealerIds.length} dealers`);
        const byId = new Map(dir.usable.map((d) => [d.id, d]));
        for (const id of anchor.dealerIds) {
          if (report.fetched >= REQUEST_BUDGET) { complete = false; break; }
          const d = byId.get(id);
          const sub = await search(d.zip, PER_DEALER_RADIUS_MI, model, report);
          if (!sub) { complete = false; continue; }
          if (sub.numFound > sub.docs.length) {
            complete = false;
            report.errors.push(`dealer ${id} (zip ${d.zip}) still overflows at ${PER_DEALER_RADIUS_MI}mi — cannot certify`);
          }
          for (const doc of sub.docs) { const rec = toRecord(doc, drops, dir.byId); if (rec) keepRicher(byVin, rec); }
        }
        continue;
      }
      for (const doc of r.docs) { const rec = toRecord(doc, drops, dir.byId); if (rec) keepRicher(byVin, rec); }
    }
  }

  report.evs = [...byVin.values()];
  report.vehiclePages = report.fetched;
  const states = new Set(report.evs.map((r) => r.state).filter(Boolean));
  const dealerships = new Set(report.evs.map((r) => r.dealerName).filter(Boolean));
  const dropped = Object.entries(drops).map(([k, v]) => `${v} ${k}`).join(", ") || "none";
  report.notes.push(
    `${anchors.length} anchors at ${COVER_RADIUS_MI}mi covering ${dir.usable.length} dealers; ` +
    `${byVin.size} RZ VINs across ${dealerships.size} dealers in ${states.size} states; dropped ${dropped}`
  );
  if (byVin.size < LEXUS.minExpected) {
    complete = false;
    report.errors.push(`collected ${byVin.size} < floor ${LEXUS.minExpected} — the model filter or the endpoint may have moved`);
  }
  // Certify only on the full chain of evidence. Anything less and db-sync must
  // not delist, because recheck cannot (header).
  report.truncated = !complete || report.errors.length > 0;
  log(`lexus: ${byVin.size} RZ in ${report.fetched} requests, ${report.errors.length} errors, ${report.truncated ? "TRUNCATED" : "COMPLETE"}`);
  return report;
}
