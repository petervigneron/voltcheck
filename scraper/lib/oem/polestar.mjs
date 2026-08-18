// Polestar's national pre-owned inventory (polestar.com/us/preowned-cars).
//
// Polestar sells its used cars itself, out of its own Spaces and partner
// retailers, and publishes them through a GraphQL API that does carry the
// 17-character VIN. 198 cars nationally on the first full sweep — 116
// certified pre-owned and 82 plain used — across 18 states, every one with a
// price, a mileage and a street address.
//
// THIS IS A DIFFERENT ENDPOINT FROM THE ONE THAT WAS REJECTED, and the
// distinction is the whole lane. The earlier probe found
// pc-api.polestar.com/eu-north-1/preconfigured-cars/ and correctly rejected
// it: `filteredStockCars` returns spec-configured pipeline cars keyed by
// configuration id, its StockEntry type has no `vin` field at all, and US
// queries need a per-retailer partnerId. All still true — re-verified, don't
// re-probe. The pre-owned side is a separate service on the same host,
// /eu-north-1/partner-rm-tool/public/, whose `searchVehicleAds` query returns
// vehicleDetails{vin} plus partnerLocation{addressLine city zipCode}. Titled
// used cars have VINs; unbuilt configurations do not. That is the difference.
//
// Discovery. www.polestar.com/us/preowned-cars/search-result/polestar-2/ is a
// 3.7 KB React shell, so the answer is in the bundle: /preowned-cars/static/
// gql-*.js carries `query SearchVehicleAds(...)` verbatim with its full
// selection set, and gql-*.js's config object names the endpoint
// (`global_PRTA`). Three traps between there and data, all worth writing down:
//   1. The blob's OTHER endpoint (remarketing-administration-api/public) is
//      also a live 200 GraphQL server but does not have searchVehicleAds on
//      its Query type — it is partner-rm-tool/public/ that serves the search.
//      Both answer {__typename}, so "the endpoint is open" is not the same
//      question as "the endpoint has the field".
//   2. Introspection is disabled (like Audi's router), so every type name had
//      to come from the bundle. SortOrder2 is `Ascending`/`Descending`, not
//      ASC/DESC, and the endpoint says so in its error.
//   3. market is LOWERCASE "us". "US" and "USA" both return HTTP 200 with
//      totalCount 0 — a silent empty answer, not an error. A sweep that
//      guessed the obvious capitalisation would have reported "Polestar has
//      no US pre-owned stock" and been believed.
//
// Fair game. www.polestar.com/robots.txt allows everything but a newsletter
// path. pc-api.polestar.com has no robots.txt (404 = no rules stated, which
// is how robotsAllows already treats every such host). The endpoint takes a
// plain Node POST with no key — the app's own config carries an empty one.
// CONTROL: the identical client still gets 403 from Tesla's inventory API,
// so no wall is being bypassed here; this host has none.
//
// POLESTAR 1 IS EXCLUDED, and this is a claims decision, not an oversight.
// modelCode 232 returns 4 cars and the Polestar 1 is a plug-in hybrid: a
// petrol engine driving the front axle. It would be listed as a BEV by our
// own shared classifier, because EV_ONLY_WMIS contains "LPS" and Polestar's
// WMI block is shared between the PHEV 1 and the BEV 2 — a real defect in
// ev.mjs that this lane sidesteps by never asking about a Polestar 1 rather
// than by relying on a WMI it knows to be wrong here. EV_MODEL_RE gets it
// right ("polestar [234]" deliberately omits 1), so the claim below rests on
// the nameplate, and 232 is simply not queried. Flag the WMI to the owner
// before any other lane leans on it.
//
// Completeness: CERTIFIES, and the enumeration is provable on both axes.
// Down each model code, paging walks to metadata.totalCount exactly with zero
// repeated VINs (136/136, 56/56, 2/2). Across model codes, the risk was
// always "is there a fifth model we don't know about" — so the whole 3-digit
// code space, 100 through 999, was swept once as recon: exactly four codes
// return any US stock, 232/359/534/814, and nothing else returns a single
// car. The lane therefore hard-codes the three BEV codes and refuses to
// certify if it ever sees a repeated VIN, the same runtime guard vw.mjs uses.
// Re-run that scan (900 requests, ~17 minutes) if Polestar launches a model.
//
// recheck SKIPS this domain, on a control test rather than a preference.
// /us/preowned-cars/product/{model}/{id} is a client-rendered shell: a real
// ad id and a fabricated all-zeroes id both return 200 with byte-identical
// 3,715-byte HTML, and neither contains a VIN. recheck's "200 but no VIN"
// soft-gone rule would therefore fire on every row and delist the whole lane.
// Delisting rides on this pull being exhaustive instead — which is why the
// certification above had to be earned rather than assumed.
//
// The domain is synthetic, and that one is load-bearing too: polestar.com is
// already a real entry in registry.json (Polestar Denver), so claiming that
// domain complete here would let one lane's certification delist the other
// lane's rows. Chunking in db-sync is per domain, so a synthetic name keeps
// the completeness claim scoped to exactly the stock this lane enumerated.
import { politePostJson } from "../http.mjs";
import { EV_MODEL_RE } from "../ev.mjs";
import { stateFromZip } from "./zip-state.mjs";

export const POLESTAR = {
  key: "polestar",
  // Synthetic: polestar.com is a registry dealer domain, and this pull is
  // Polestar's national pre-owned programme, not that site's inventory.
  domain: "polestar-preowned",
  make: "Polestar",
  api: "https://pc-api.polestar.com/eu-north-1/partner-rm-tool/public/",
  // Floor well under the 194 BEVs observed; trips if the market identifier
  // or a model code stops resolving, not on normal stock swings.
  minExpected: 60,
};

// recheck skips polestar-preowned — its per-car page cannot tell a live car
// from a gone one (see header). Delisting comes from certifying complete.
export const OEM_LOCATOR_DOMAINS = new Set([POLESTAR.domain]);

// modelCode → the URL slug the pre-owned app uses, which is also what the
// per-car page needs. Polestar 1 (232) is deliberately absent: PHEV, see
// header. The full 100-999 code sweep found no other US codes.
const MODELS = [
  { code: "534", slug: "polestar-2", name: "Polestar 2" },
  { code: "359", slug: "polestar-3", name: "Polestar 3" },
  { code: "814", slug: "polestar-4", name: "Polestar 4" },
];

const MARKET = "us"; // lowercase — "US" is a silent zero (see header)
const PAGE = 50;
const MAX_PAGES = 40; // runaway guard; the largest model is 3 pages
const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;

const HEADERS = {
  origin: "https://www.polestar.com",
  referer: "https://www.polestar.com/us/preowned-cars/",
};

// Trimmed from the app's own SearchVehicleAds selection set to the fields a
// listing needs. handoverLocation is a different GraphQL type from
// partnerLocation and has only {id name city} — asking it for an address is
// a 400, which is why the street address comes from partnerLocation.
const QUERY = `query SearchVehicleAds($modelCode:String!,$market:String!,$offset:Int!,$limit:Int!,$sortOrder:SortOrder2!,$sortProperty:SortProperty!){
  searchVehicleAds(modelCode:$modelCode,market:$market,offset:$offset,limit:$limit,sortOrder:$sortOrder,sortProperty:$sortProperty){
    metadata{limit offset resultCount totalCount}
    vehicleAds{
      id
      price{retail currency}
      partnerLocation{name city addressLine zipCode}
      handoverLocation{name city}
      mileageInfo{distance metric}
      media{data mediaType}
      vehicleDetails{
        vin cycleState
        modelDetails{code displayName modelYear model edition}
        motorInfo{value labels{locale label}}
        drivetrainInfo{label locale}
        exterior{labels{label locale}}
        interior{labels{label locale}}
      }
    }
  }
}`;

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

// Labels arrive as [{locale,label}] with the locale spelled either en_US or
// en-US depending on the field; take the US one, else the first.
const label = (labels) => {
  const arr = Array.isArray(labels) ? labels : labels ? [labels] : [];
  const us = arr.find((l) => /^en[-_]us$/i.test(String(l?.locale ?? "")));
  const t = String((us ?? arr[0])?.label ?? "").trim();
  return t || undefined;
};

const drive = (v) => {
  const s = String(v ?? "").toUpperCase();
  if (/ALL.?WHEEL|AWD/.test(s)) return "AWD";
  if (/REAR.?WHEEL|RWD/.test(s)) return "RWD";
  if (/FRONT.?WHEEL|FWD/.test(s)) return "FWD";
  return undefined;
};

const vdpUrl = (slug, id) => `https://www.polestar.com/us/preowned-cars/product/${slug}/${encodeURIComponent(String(id))}`;

function toRecord(ad, model, drops) {
  const bad = (reason) => {
    drops[reason] = (drops[reason] ?? 0) + 1;
    return null;
  };
  const d = ad?.vehicleDetails ?? {};
  const vin = String(d.vin ?? "").toUpperCase();
  if (!VIN_RE.test(vin)) return bad("bad vin");
  const year = Number(d.modelDetails?.modelYear);
  if (!(year >= 1981 && year <= new Date().getFullYear() + 2)) return bad("implausible year");
  // displayName restates the make ("Polestar 2"), and the web app builds its
  // card title as `${year} ${make} ${model}` without de-duplicating, so
  // shipping it verbatim would print "2022 Polestar Polestar 2". Strip the
  // leading make; both forms already exist in the corpus and both are handled
  // downstream (bodyType.ts carries "polestar 2" and "polestar polestar 2"),
  // but only this one reads right on a card.
  const display = String(d.modelDetails?.displayName ?? model.name).trim() || model.name;
  const name = display.replace(/^polestar\s+/i, "") || display;

  // Owner's rule: never list a car without a location.
  const loc = ad.partnerLocation ?? {};
  const zip = /^\d{5}/.test(String(loc.zipCode ?? "")) ? String(loc.zipCode).slice(0, 5) : undefined;
  const state = stateFromZip(zip);
  if (!state) return bad("no dealer state");

  // The nameplate is the claim: EV_MODEL_RE knows Polestar 2/3/4 are BEVs and
  // deliberately does not know the PHEV Polestar 1, which this lane never
  // asks for anyway. The WMI is NOT consulted here — "LPS" covers both the
  // BEV 2 and the PHEV 1 (see header).
  const isBev = EV_MODEL_RE.test(`${POLESTAR.make} ${name}`);

  const images = (ad.media ?? [])
    .filter((m) => !m?.mediaType || /image/i.test(String(m.mediaType)))
    .map((m) => m?.data)
    .filter((u) => typeof u === "string")
    .slice(0, 12);

  return {
    vin,
    year,
    make: POLESTAR.make,
    model: name,
    trim: label(d.motorInfo?.labels) ?? d.modelDetails?.edition ?? undefined,
    priceUsd: /^usd$/i.test(String(ad.price?.currency ?? "USD")) ? num(ad.price?.retail) : undefined,
    // The feed states its own unit; anything but miles is left blank rather
    // than silently treated as miles.
    mileage: /^mi$/i.test(String(ad.mileageInfo?.metric ?? "")) ? num(ad.mileageInfo?.distance) : undefined,
    driveLine: drive(label(d.drivetrainInfo)),
    exteriorColor: label(d.exterior?.labels),
    interiorColor: label(d.interior?.labels),
    dealerName: loc.name || ad.handoverLocation?.name || undefined,
    city: loc.city || ad.handoverLocation?.city || undefined,
    state,
    zip,
    condition: /certified/i.test(String(d.cycleState ?? "")) ? "certified" : "used",
    imageUrl: images[0],
    images,
    sourceUrl: vdpUrl(model.slug, ad.id),
    dealerDomain: POLESTAR.domain,
    evKind: isBev ? "BEV" : "BEV?",
    evConfidence: isBev ? "high" : "name_match",
    platform: "polestar-preowned-locator",
    fromVdp: false,
    scrapedAt: new Date().toISOString(),
  };
}

// One page, with a single retry on a transient failure.
async function fetchPage(model, offset, report) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await politePostJson(POLESTAR.api, {
      headers: HEADERS,
      body: {
        operationName: "SearchVehicleAds",
        query: QUERY,
        variables: {
          modelCode: model.code, market: MARKET, offset, limit: PAGE,
          sortOrder: "Ascending", sortProperty: "Price",
        },
      },
    });
    report.fetched++;
    if (res.status === "robots_disallowed") {
      report.errors.push("robots disallows the Polestar pre-owned search endpoint");
      return null;
    }
    const data = res.json?.data?.searchVehicleAds;
    if (res.status === 200 && data) return data;
    const transient = String(res.status).startsWith("error:") || res.status === 429 || res.status >= 500;
    if (attempt === 0 && transient) {
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }
    const why = res.json?.errors?.map((e) => e.message).join("; ") ?? `HTTP ${res.status}`;
    report.errors.push(`${model.name} offset ${offset}: ${why}`);
    return null;
  }
  return null;
}

// Walk one model to exhaustion. Returns false if it could not be walked in
// full — the caller then refuses to certify the whole domain.
async function sweep(model, byVin, report, log) {
  const drops = {};
  let seen = 0;
  let kept = 0;
  let dupes = 0;
  let total = null;
  let complete = false;
  for (let p = 0; p < MAX_PAGES; p++) {
    const data = await fetchPage(model, seen, report);
    if (!data) break;
    total ??= Number(data.metadata?.totalCount) || 0;
    const ads = data.vehicleAds ?? [];
    if (!ads.length) {
      complete = true;
      break;
    }
    seen += ads.length;
    for (const ad of ads) {
      const rec = toRecord(ad, model, drops);
      if (!rec) continue;
      if (byVin.has(rec.vin)) dupes++;
      else {
        byVin.set(rec.vin, rec);
        kept++;
      }
    }
    if (total != null && seen >= total) {
      complete = true;
      break;
    }
  }
  if (!complete) report.errors.push(`${model.name}: walked ${seen} of ${total ?? "?"} — incomplete, cannot certify`);
  // A repeated VIN means the result window shifted under the walk, and a walk
  // that repeats cars is also a walk that skips them — the condition that made
  // VW's new-car sweep unusable. Treat any repeat as proof this pull is not
  // exhaustive rather than assuming this endpoint stays well-behaved.
  if (dupes > 0) {
    complete = false;
    report.errors.push(`${model.name}: ${dupes} repeated VINs — paging shifted mid-walk, cannot certify`);
  }
  const dropped = Object.entries(drops).map(([k, v]) => `${v} ${k}`).join(", ") || "none";
  report.notes.push(`${model.name} (${model.code}): ${seen}/${total ?? "?"} rows, ${kept} kept, ${dupes} repeats, dropped ${dropped}`);
  log(`polestar/${model.slug}: ${kept} BEVs (${seen} of ${total ?? "?"} rows; ${dupes} repeats; dropped ${dropped})`);
  return complete;
}

// Pull Polestar's national pre-owned BEV inventory. crawl.mjs-shaped report on
// the synthetic polestar-preowned domain; certifies complete (and so drives
// delisting, since recheck skips this domain) only when every model walked to
// its advertised total with no repeated VINs and no errors.
export async function pullPolestar({ log = () => {} } = {}) {
  const report = {
    domain: POLESTAR.domain, kind: "oem-locator", budget: null, fetched: 0,
    vehiclePages: 0, itemListVdps: 0, evs: [], errors: [], notes: [],
  };
  const byVin = new Map();
  let complete = true;
  for (const model of MODELS) {
    if (!(await sweep(model, byVin, report, log))) complete = false;
  }
  report.evs = [...byVin.values()];
  report.vehiclePages = report.fetched;
  report.notes.push("Polestar 1 (modelCode 232) is not queried — it is a plug-in hybrid (see module header)");
  const certified = report.evs.filter((r) => r.condition === "certified").length;
  report.notes.push(`${report.evs.length} BEVs (${certified} certified pre-owned) across ${new Set(report.evs.map((r) => r.dealerName)).size} locations in ${new Set(report.evs.map((r) => r.state)).size} states`);
  if (byVin.size < POLESTAR.minExpected) {
    report.errors.push(`collected ${byVin.size} < floor ${POLESTAR.minExpected} — the market identifier or a model code may have moved`);
  }
  report.truncated = !complete || report.errors.length > 0 || byVin.size < POLESTAR.minExpected;
  return report;
}
