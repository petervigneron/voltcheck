// Rivian's own pre-owned inventory (rivian.com).
//
// WHY THIS EXISTS NOW, AFTER "NOT BUILDABLE"
//
// oem-locator.mjs carried a Rivian negative from 2026-08-11, and the registry
// row said the same: "data is GraphQL under robots-disallowed /api/. Posture:
// no compliant data route." That was true of the site as it stood. It is not
// true of the site as it stands on 2026-09-05, and the difference is not a
// wall coming down — Rivian never walled the crawler, plain Node gets 200 on
// every path here — it is that the shop moved its own data plane.
//
// The shop SPA is now a React Router app served under /configurations, and it
// talks to server routes of its OWN, not to the GraphQL gateway:
//
//   POST /configurations/api/v1/shop/search      the inventory list
//   POST /configurations/api/v1/vehicle-ruleset  the option vocabulary
//   GET  /configurations/inventory/pre-owned/<configId>/build   the car's page
//
// robots.txt (read 2026-09-05, plain fetch, 200 — nothing about this host is
// walled) says, for user-agent *:
//
//   allow: /
//   disallow: /404
//   disallow: /api/
//   disallow: /experience/r1t
//   disallow: /experience/r1s
//   disallow: /trip-visualizer
//   disallow: /auth/api/
//   disallow: /account/api/
//   disallow: /demo-drive/api/
//   disallow: /experience/api/
//   disallow: /quad/api/
//   disallow: /root/api/
//
// `/api/` is a prefix rule: it matches /api/gql/orders/graphql and stops
// there. It does not reach /configurations/api/..., and that is not a
// technicality this lane is leaning on — Rivian enumerated six OTHER app
// prefixes with their own /api/ subtrees (auth, account, demo-drive,
// experience, quad, root) and left the shop's out. The paths this lane reads
// are the ones robots.txt allows; the ones it disallows are not read, and the
// browser probe that discovered the shape ran with lib/browser.mjs's robots
// gate on, which ABORTED every /api/gql/... call the page made. Nothing in
// this file has ever seen a byte from a disallowed URL.
//
// THE VIN IS ON THE PAGE, NOT IN THE LIST. shop/search answers with configId,
// price, odometer, model, model year, the option codes and the delivery
// centre's city/state — and no VIN. Voltcheck is VIN-keyed, so that answer
// alone is unusable. The VIN is on the car's own page, which React Router
// server-renders: /configurations/inventory/pre-owned/<configId>/build embeds
// the whole shopVehicle result — vin, listingPrice, odometerReading,
// dcLocationDetails, dateFirstSold, the Monroney PDF and the Carfax PDF — as a
// turbo-stream payload in the HTML, and serves the same payload on its
// `.data` sibling. A plain polite GET reads it. No browser is used by this
// lane at runtime.
//
// That page is pool-scoped too, and the first build of this lane learned it
// the expensive way: asked without ?postalCode, it resolves the car against
// the pool of whoever is asking, which for us is the requester's IP. Every
// California car then answers 200 with a page that has no car on it — 43 of
// 145 cars gone, and not one error, because "200 and a well-formed payload"
// is what a missing car looks like here. The detail fetch now asks from the
// anchor ZIP the configId was FOUND in, and a page with no car on it is an
// error rather than a shrug.
//
// TWO POOLS, MEASURED, NOT ASSUMED. shop/search takes a postalCode and caps
// every answer at 30 rows, so the naive read is "sweep the country". It is not
// that shape. Measured 2026-09-05, R1S/2022 (7 rows — under the cap, so each
// answer is a complete pool, not a truncated one) from 53 ZIPs, one or more
// per state: 48 non-California ZIPs returned the IDENTICAL 7 cars, every
// California ZIP (LA, SF, San Diego, Sacramento) returned a DIFFERENT 3, and
// Massachusetts returned 0 — Rivian does not sell pre-owned into MA. Not one
// ZIP held a car no other ZIP in its pool held. So the shop serves two
// national pools, California and everywhere else, and the useful axis is not
// geography at all.
//
// The axis that IS load-bearing is the model-year facet, because it is what
// gets an answer under the 30-row cap. Unsliced, 74 of 78 (ZIP, model) queries
// in a 39-cell national grid sweep came back capped at exactly 30 and the
// sweep saw 145 cars in 78 requests. Sliced by model year at two anchor ZIPs —
// one in each pool — 20 requests saw the SAME 145 cars with no slice anywhere
// near the cap. That equality is the completeness control test, and this lane
// re-runs a version of it every night (CHECK_ZIPS below) rather than trusting
// the 2026-09-05 reading: if a third ZIP outside the two anchors ever shows a
// car the anchors did not, the pool model is wrong, the report goes truncated
// and nothing is delisted.
//
// NOT CERTIFIED PRE-OWNED, whatever the shopping press calls it. Rivian's own
// copy says "Pre-owned" everywhere and never "certified": the word appears
// once on /experience/pre-owned and it is about winter tyres, and zero times
// on a car's page. So every row here is condition "used". Claiming certified
// would be inventing a warranty.
//
// TRIM comes from the ruleset group Rivian itself labels "Trim" (PKG:
// Adventure Package / Launch Edition / Ascend trim), not from the build group
// (BLD: "R1S Quad", "R1S Dual Standard") that the card headlines. Both are the
// maker's own tokens; PKG is the one the rest of the corpus already speaks —
// of the 552 live Rivian rows carrying a trim from the dealer lanes, 501 name
// Adventure, Launch Edition or Ascend and exactly 1 is BLD-shaped. Rivian's
// group label leaks into two of its own option labels ("Adventure Package",
// "Ascend trim"), and only those two literal suffixes are stripped.
//
// PRICE is shopVehicle.listingPrice, tagged oem-rivian-listing-price. There is
// no ladder: the pre-owned detail type publishes exactly one price field, so
// there is no rung for a row to slide between.
//
// RECHECK DOES NOT SKIP THIS DOMAIN — control-tested 2026-09-05, and it is the
// opposite of the Lucid/VW result. A real configId's page carries exactly one
// VIN (256,410 bytes); a fabricated configId and a real one with its last
// character changed both answer 200 with 249,027 bytes and ZERO VINs. So
// recheck's "200 but no VIN" soft-gone rule reads a sold Rivian correctly, and
// rivian.com must stay OUT of recheck's OEM_LOCATOR_DOMAINS skip list.
import { politePostJson, fetchPage } from "../http.mjs";
import { oemField } from "../price-provenance.mjs";

const SITE = "https://rivian.com";
const SEARCH = `${SITE}/configurations/api/v1/shop/search`;
const RULESET = `${SITE}/configurations/api/v1/vehicle-ruleset`;
const LIST_PAGE = `${SITE}/configurations/list?INVENTORY_TYPE=PRE_OWNED_VEHICLE`;
const HEADERS = { origin: SITE, referer: LIST_PAGE };

// The shop's own pre-owned nameplates. Rivian's shop knows exactly three —
// asking for "R3" or "EDV" is a 500, asking for R2 is a clean 200 with an
// empty list, because the R2 is new-only today. WATCHED below is that third
// name: one query a night, so the day a used R2 appears the report says so
// rather than the lane silently not looking.
const MODELS = ["R1S", "R1T"];
const WATCHED = ["R2"];
const RULESET_VERSION = "PREOWNED_VEHICLE_SHOP_2.0";

// One anchor per pool (see the header). Houston is an arbitrary member of the
// national pool; Los Angeles is the California one.
const ANCHORS = ["77040", "90012"];
// Third-party ZIPs the nightly run re-proves the pool model against: one from
// each pool, far from its anchor. A car either of these holds that the anchors
// did not means the two-pool reading has stopped being true.
const CHECK_ZIPS = ["10001", "94103"];

const CAP = 30; // the service's per-answer row ceiling, measured
const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : undefined);

export const RIVIAN = {
  key: "rivian",
  domain: "rivian.com",
  make: "Rivian",
  minExpected: 60,
};

/** One shop/search answer, or null on an error the caller records. */
async function search({ model, zip, year }, report) {
  const filters = year ? [{ groupKey: "MODEL_YEAR", options: [String(year)] }] : [];
  const body = {
    input: {
      filters,
      models: [model],
      postalCode: zip,
      shopType: "PRE_OWNED_VEHICLE",
      options: { transferFeesFilter: "ALL_MATCHES" },
    },
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await politePostJson(SEARCH, { headers: HEADERS, body });
    report.fetched++;
    if (res.status === "robots_disallowed") {
      report.errors.push("robots disallows /configurations/api/v1/shop/search — the rules moved, stop");
      return null;
    }
    const rows = res.json?.shopSearch?.results;
    if (res.status === 200 && Array.isArray(rows)) return rows;
    const transient = String(res.status).startsWith("error:") || res.status === 429 || res.status >= 500;
    if (attempt === 0 && transient) {
      await new Promise((r) => setTimeout(r, 4000));
      continue;
    }
    report.errors.push(`${model}/${zip}/${year ?? "all"}: HTTP ${res.status}`);
    return null;
  }
  return null;
}

/** The option vocabulary for one nameplate: optionId → its own en-US name,
 *  plus the model years the shop knows about. Read from the ruleset rather
 *  than hard-coded so a new model year or a renamed trim follows the site. */
async function vocabulary(model, report) {
  const res = await politePostJson(RULESET, {
    headers: HEADERS,
    body: { country: "US", sku: model, version: RULESET_VERSION },
  });
  report.fetched++;
  const rs = res.json?.vehicleProduct?.ruleset;
  if (res.status !== 200 || !rs) {
    report.errors.push(`${model}: ruleset unreadable (${res.status})`);
    return null;
  }
  const names = new Map();
  for (const [id, o] of Object.entries(rs.options ?? {})) {
    const n = o?.fullName?.["en-US"] ?? o?.name;
    if (typeof n === "string" && n.trim()) names.set(id, n.trim());
  }
  const years = (rs.groups?.MODEL_YEAR?.options ?? []).map(Number).filter((y) => y >= 2020 && y <= 2100);
  if (!years.length) report.errors.push(`${model}: ruleset states no model years`);
  return { names, years };
}

// React Router's turbo-stream payload: a flat array where {"_a":b} is an
// object whose key is the value at index a and whose value is the value at
// index b, and a bare array is a list of indices. -5 is undefined, -7 is null.
// Cyclic by construction, so every index is memoised before its children are
// walked.
export function decodeTurboStream(flat) {
  const memo = new Map();
  const at = (i) => {
    if (i === -5) return undefined;
    if (i === -7) return null;
    if (!Number.isInteger(i) || i < 0 || i >= flat.length) return undefined;
    if (memo.has(i)) return memo.get(i);
    const v = flat[i];
    if (Array.isArray(v)) {
      const out = [];
      memo.set(i, out);
      for (const k of v) out.push(at(k));
      return out;
    }
    if (v && typeof v === "object") {
      const out = {};
      memo.set(i, out);
      for (const [k, val] of Object.entries(v)) {
        if (!k.startsWith("_")) {
          out[k] = val;
          continue;
        }
        out[String(at(Number(k.slice(1))))] = at(val);
      }
      return out;
    }
    memo.set(i, v);
    return v;
  };
  return at(0);
}

/** First value under `key` anywhere in a decoded payload. The route id the
 *  shop nests its data under has changed once already this year; searching for
 *  the field is what survives the next rename. */
function pluck(o, key, depth = 0, seen = new Set()) {
  if (depth > 16 || o == null || typeof o !== "object" || seen.has(o)) return undefined;
  seen.add(o);
  if (!Array.isArray(o) && Object.prototype.hasOwnProperty.call(o, key)) return o[key];
  for (const v of Object.values(o)) {
    const r = pluck(v, key, depth + 1, seen);
    if (r !== undefined) return r;
  }
  return undefined;
}

export const pdpUrl = (configId) =>
  `${SITE}/configurations/inventory/pre-owned/${encodeURIComponent(String(configId))}/build`;

/** The car's own page, decoded. Returns the shopVehicle object or null.
 *
 *  `postalCode` is not decoration. The page resolves the car against the
 *  viewer's pool exactly as the list does, and its default pool comes from the
 *  requester's IP — so asking for a California car from anywhere else answers
 *  200 with a page that has no car on it at all. The first build of this lane
 *  did that and lost all 43 California cars of 145 without a single error:
 *  the pool the configId was FOUND in is what has to be asked from. */
async function detail(configId, postalCode, report) {
  const res = await fetchPage(`${pdpUrl(configId)}.data?postalCode=${encodeURIComponent(postalCode)}`);
  report.fetched++;
  if (res.status === "robots_disallowed") {
    report.errors.push("robots disallows /configurations/inventory/ — the rules moved, stop");
    return null;
  }
  if (res.status !== 200 || !res.body) {
    report.errors.push(`${configId}: detail HTTP ${res.status}`);
    return null;
  }
  let flat;
  try {
    flat = JSON.parse(res.body);
  } catch {
    report.errors.push(`${configId}: detail payload is not the turbo-stream array`);
    return null;
  }
  if (!Array.isArray(flat)) {
    report.errors.push(`${configId}: detail payload is not the turbo-stream array`);
    return null;
  }
  const v = pluck(decodeTurboStream(flat), "shopVehicle");
  if (!v) {
    // A page that 200s with no car on it. Silent when this lane was first
    // run, and it hid a third of the inventory (see the postalCode note), so
    // it is an error now and not a shrug.
    report.errors.push(`${configId}: page has no car on it from ${postalCode}`);
    return null;
  }
  return v;
}

// Rivian's own label for the group it calls "Trim", with the two places its
// group label leaks into an option label removed. Nothing else is rewritten.
function trimOf(marketingOptions, names) {
  const pkg = (marketingOptions ?? []).find((o) => o?.groupId === "PKG")?.optionId;
  const raw = pkg ? names.get(pkg) : undefined;
  if (!raw) return undefined;
  return raw.replace(/\s+(Package|trim)$/i, "").trim() || raw;
}

// Motor code → driveline. Rivian's own option names state it ("Quad-Motor
// AWD", "Enduro Single-motor RWD"); a code whose name says neither abstains
// rather than assuming a Rivian is always AWD — the single-motor R1T is not.
function driveOf(marketingOptions, names) {
  const mot = (marketingOptions ?? []).find((o) => o?.groupId === "MOT")?.optionId;
  const n = mot ? names.get(mot) : undefined;
  if (!n) return undefined;
  if (/\bAWD\b/i.test(n)) return "AWD";
  if (/\bRWD\b/i.test(n)) return "RWD";
  if (/\bFWD\b/i.test(n)) return "FWD";
  return undefined;
}

const optName = (marketingOptions, group, names) => {
  const id = (marketingOptions ?? []).find((o) => o?.groupId === group)?.optionId;
  return id ? names.get(id) : undefined;
};

/** One shopVehicle detail -> a listing record, or null with the reason
 *  counted in `drops`. Exported for the test that pins the abstentions. */
export function toRecord(v, { names, drops = {} }) {
  const bad = (why) => {
    drops[why] = (drops[why] ?? 0) + 1;
    return null;
  };
  const vin = String(v?.vin ?? "").toUpperCase();
  if (!VIN_RE.test(vin)) return bad("no VIN on the detail page");
  const year = num(v.modelYear);
  if (!(year >= 2020 && year <= new Date().getFullYear() + 2)) return bad("implausible model year");

  const loc = v.dcLocationDetails ?? {};
  const state = String(loc.state ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(state)) return bad("no delivery-centre state"); // never list a car without a location

  const price = num(v.listingPrice);
  if (!(price > 0)) return bad("no stated price");

  // The payload states its own odometer unit. Anything but miles is left
  // blank rather than silently treated as miles.
  const mileage = /^miles$/i.test(String(v.odometerUnit ?? "")) ? num(v.odometerReading) : undefined;

  const meta = v.shopVehicleMetadata ?? {};
  const images = (Array.isArray(meta.cloudinaryImageUrls) ? meta.cloudinaryImageUrls : [])
    .filter((u) => typeof u === "string" && u.startsWith("https://"))
    .slice(0, 12);

  const zip = /^\d{5}/.test(String(loc.postalCode ?? "")) ? String(loc.postalCode).slice(0, 5) : undefined;

  return {
    vin,
    year,
    make: RIVIAN.make,
    model: String(v.model ?? "").trim() || undefined,
    trim: trimOf(v.marketingOptions, names),
    priceUsd: price,
    priceProvenance: oemField("rivian", "listingPrice"),
    mileage,
    driveLine: driveOf(v.marketingOptions, names),
    exteriorColor: optName(v.marketingOptions, "EXP", names),
    interiorColor: optName(v.marketingOptions, "INT", names),
    // Direct sale: Rivian is the seller, and the delivery centre is where the
    // car sits. The centre has no public trade name in the payload, so the
    // seller is named as itself rather than as an address.
    dealerName: "Rivian",
    city: String(loc.city ?? "").trim() || undefined,
    state,
    zip,
    // Rivian never says "certified" about these cars (header), so neither
    // does this.
    condition: "used",
    imageUrl: images[0],
    images,
    sourceUrl: pdpUrl(v.configId),
    dealerDomain: RIVIAN.domain,
    // Rivian builds nothing but BEVs; the shop is scoped to R1S/R1T, both of
    // which vPIC decodes BEV.
    evKind: "BEV",
    evConfidence: "high",
    platform: "rivian-preowned-shop",
    fromVdp: true,
    scrapedAt: new Date().toISOString(),
  };
}

/**
 * Pull Rivian's national pre-owned inventory.
 *
 * crawl.mjs-shaped report on the real rivian.com domain. Certifies complete —
 * and so lets db-sync retire sold cars — only when every model-year slice came
 * back under the service's row cap, the nightly pool check found nothing the
 * anchors missed, no request errored, and the yield cleared the floor.
 */
export async function pullRivian({ log = () => {} } = {}) {
  const report = {
    domain: RIVIAN.domain, kind: "oem-locator", budget: null, fetched: 0,
    vehiclePages: 0, itemListVdps: 0, evs: [], errors: [], notes: [],
  };

  const vocab = new Map();
  for (const m of MODELS) {
    const v = await vocabulary(m, report);
    if (v) vocab.set(m, v);
  }
  if (!vocab.size) {
    report.errors.push("no ruleset vocabulary — cannot enumerate or name anything");
    report.truncated = true;
    return report;
  }
  const names = new Map();
  for (const v of vocab.values()) for (const [k, n] of v.names) names.set(k, n);

  // Enumeration: every (anchor, model, model year) slice. The year facet is
  // what keeps an answer under the 30-row cap; the anchors are the two pools.
  // configId → the anchor ZIP it was found from. That ZIP is the car's pool,
  // and the detail page has to be asked from inside it.
  const configs = new Map();
  const capped = [];
  for (const zip of ANCHORS) {
    for (const model of MODELS) {
      const years = vocab.get(model)?.years ?? [];
      for (const year of years) {
        const rows = await search({ model, zip, year }, report);
        if (rows === null) continue;
        if (rows.length >= CAP) capped.push(`${zip}/${model}/${year}`);
        for (const r of rows) if (r?.configId && !configs.has(String(r.configId))) configs.set(String(r.configId), zip);
      }
    }
  }
  if (capped.length) {
    report.errors.push(`slices at the ${CAP}-row cap, so they are cut and this pull is not exhaustive: ${capped.join(", ")}`);
  }
  report.notes.push(`enumeration: ${ANCHORS.length} pool anchors x ${MODELS.length} models x model-year slices -> ${configs.size} configurations, ${report.fetched} requests`);
  log(`rivian: ${configs.size} pre-owned configurations from ${ANCHORS.length} anchors`);

  // The pool check: a ZIP the anchors do not stand in for must not know a car
  // the anchors missed. Unsliced is enough here — a check ZIP that comes back
  // at the cap is compared only on what it did return.
  let poolsHold = true;
  for (const zip of CHECK_ZIPS) {
    for (const model of MODELS) {
      const rows = await search({ model, zip }, report);
      if (rows === null) {
        poolsHold = false;
        continue;
      }
      const unseen = rows.filter((r) => r?.configId && !configs.has(String(r.configId)));
      if (unseen.length) {
        poolsHold = false;
        report.errors.push(`pool check: ${zip}/${model} holds ${unseen.length} cars the anchors never saw — the two-pool reading has stopped being true`);
        for (const r of unseen) configs.set(String(r.configId), zip);
      }
    }
  }
  report.notes.push(poolsHold ? `pool check: ${CHECK_ZIPS.join(", ")} saw nothing the anchors missed` : "pool check FAILED — see errors");

  // The nameplate watch: a model the shop knows but has never had used stock
  // for. An empty answer is the expected one and says nothing; a non-empty one
  // is a nameplate this lane is not enumerating, and the report has to say so.
  for (const model of WATCHED) {
    const rows = await search({ model, zip: ANCHORS[0] }, report);
    if (rows?.length) {
      report.errors.push(`${model} now has ${rows.length} pre-owned cars and this lane does not enumerate it — add it to MODELS`);
    }
  }

  // Detail: the VIN, and everything else worth publishing, is on the car's own
  // page. One page per configuration.
  const byVin = new Map();
  const drops = {};
  for (const [configId, zip] of configs) {
    const v = await detail(configId, zip, report);
    if (!v) continue;
    const rec = toRecord(v, { names, drops });
    if (rec) byVin.set(rec.vin, rec);
  }

  report.evs = [...byVin.values()];
  report.vehiclePages = report.fetched;
  const dropped = Object.entries(drops).map(([k, n]) => `${n} ${k}`).join(", ");
  if (dropped) report.notes.push(`withheld: ${dropped}`);
  const states = new Set(report.evs.map((r) => r.state));
  const cities = new Set(report.evs.map((r) => `${r.city}, ${r.state}`));
  report.notes.push(`${report.evs.length} pre-owned BEVs at ${cities.size} delivery centres in ${states.size} states`);
  if (byVin.size < RIVIAN.minExpected) {
    report.errors.push(`collected ${byVin.size} < floor ${RIVIAN.minExpected} — the shop's routes may have moved`);
  }
  report.truncated = !poolsHold || capped.length > 0 || report.errors.length > 0 || byVin.size < RIVIAN.minExpected;
  log(`rivian: ${report.evs.length} cars, ${report.fetched} requests, ${report.errors.length} errors, ${report.truncated ? "TRUNCATED" : "complete"}`);
  return report;
}
