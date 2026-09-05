// DriveTime (drivetime.com), the national buy-here-pay-here used chain —
// ~140 dealerships, one national stock, ~7.8k cars available.
//
// Like enterprise.mjs and echopark.mjs this is a merchant, not an OEM: every
// car DriveTime lists is its own reconditioned stock, so one sweep IS the
// whole national inventory and there is no other rooftop where these VINs
// could appear. The registry has carried drivetime.com as
// needs-investigation since 2026-08-14 ("0 VIN vehicles in 12 fetches") —
// true of the served HTML, which is an Angular shell, and beside the point:
// the inventory lives in an open Azure Cognitive Search wrapper the page
// itself calls.
//
// A 2026-08-16 census found ZERO battery-electric cars here and no lane was
// built. That reading was right about BEVs and wrong about the conclusion:
// DriveTime's plug-in hybrids were never counted. This lane exists so that
// the answer re-computes itself nightly instead of being a note in a file.
//
// WHAT IS OPEN (measured 2026-09-05, plain Node through lib/http.mjs, the
// crawler's declared UA and x-crawler header on every request)
//
// robots.txt on www.drivetime.com disallows only /status* and /error/*;
// search.ext.drivetime.cloud serves no robots.txt at all (404). Nothing here
// is robots-excluded, and no bot wall was met in ~40 requests.
//
// POST https://search.ext.drivetime.cloud/api/vehicle/search with the page's
// own body shape — `origin` and a `referer` to /used-cars, `filters` as a
// LIST of single-field objects (operator 1 = equals, 7 = not-equals;
// `conjunction` 2 = OR *within* one object's `items`, `filterConjunction` 1 =
// AND *between* objects). Two not-equals objects exclude sold ("SL") and
// layaway ("LA"); omitting lat/lng/mileRadius is what makes the answer
// nationwide (the site sends them with a 250-mile radius). The response is
// OData: `@odata.count`, `@search.facets`, `value`.
//
// THE FUEL FACET CANNOT DRIVE THIS LANE, AND THAT IS THE WHOLE FINDING
//
// The obvious build is one filtered request on NormalizedFuelDescription =
// Hybrid: 67 cars today, 28 of them plug-ins. It would have shipped 28 and
// silently lost 19 — 40% of the yield. Measured against a full walk of the
// same lot on the same day: 16 Jeep Grand Cherokee 4xe, a 2017 Chevrolet
// Volt, a 2022 Lincoln Corsair Grand Touring and a 2024 Dodge Hornet R/T
// Plus are all filed by DriveTime as `Gas` or `Flex Fuel`. Their own
// FuelDescription agrees with the mistake ("Gas"), so this is not a
// normalisation artefact we could reach around; the plug-ins are simply
// mis-coded in the index, and there is no reason to think a Bolt or a Leaf
// would be coded any better the day one arrives.
//
// So the lane WALKS THE WHOLE AVAILABLE LOT and classifies every row through
// the shared lib/ev.mjs vocabulary. 7,822 cars is 8 requests at pageSize
// 1000 (~58 MB, ~15 s). That is more bytes than a filtered pull and it is
// the only shape that cannot lose a car to a wrong fuel code.
//
// The fuel mix is still FACETED every run and written into report.notes, so
// the night an "Electric" value appears in DriveTime's vocabulary the
// nightly log says so — it just isn't what selects the rows. That costs one
// extra request rather than riding along on page 1: a body carrying `facets`
// comes back with the facet counts and an EMPTY `value`, whatever pageSize
// asks for (measured 2026-09-05 — the first run of this lane walked 0 of
// 7,809 cars for exactly that reason).
//
// WHAT WAS TRIED AND REJECTED
//
//   - `select`. It is a real parameter (an array is a 400: "could not be
//     converted to System.String"; a comma-separated string is a 200), but
//     it does not shrink the wire: the serialiser still emits all 182 keys
//     and merely nulls the unselected ones, so a 1,000-row page goes 7.39 MB
//     → 6.88 MB, 7%. Worse, a field name the index does not know comes back
//     as nulls rather than an error, so a renamed column would silently
//     blank itself instead of failing. Not worth 7%.
//   - `orderBy` for deterministic paging. The page's own model is
//     {columnName, direction}; both {columnName:"Vin"} and
//     {columnName:"StockNumber"} answer 400, and the UI's sortable columns
//     are distance/price/mileage — none of them a unique key. So paging
//     stability is proved the same way completeness is: the VIN SET the walk
//     collected is compared against the count the API itself reports, and a
//     short or overlapping read fails the run.
//   - Filtering on MakeDisplayName (the facet's "Make|Model" pairs) instead
//     of walking. It recovers the mis-coded 4xe and the Volt, but a plug-in
//     whose badge lives in the TRIM is invisible to a make/model facet — it
//     lost the Hornet R/T Plus and the Corsair Grand Touring, 2 of 47.
//
// WHAT THE RECORD CARRIES (182 fields; the ones used here)
//   Vin, Year, Make, Model, DisplayName, Trim, BodyType, StockNumber,
//   StickerPrice, OriginalStickerPrice, OdometerValue, DriveType,
//   NormalizedFuelDescription, FuelDescription, NormalizedExtColor,
//   NormalizedIntColor, City, StateAbbreviation, DealershipName, StatusKey,
//   VehicleTierKey, PrimaryPhotoJson, VehiclePhotoJson.
// Cross-checked against the rendered VDP for 1C4RJYB65N8715725 on
// 2026-09-05: StickerPrice 28295 = the page's "Guaranteed Price $28,295",
// OdometerValue 44263 = "Miles 44,263". No ZIP is served (the VDP has one,
// the search record does not), so rows carry city + state only.
//
// CONDITION. DriveTime publishes no condition token — there is no "new" to
// distinguish, VehicleTierKey is "DriveTime" on all 7,822 rows and StatusKey
// is "AV" on all of them. So "used" is read from what the merchant IS, the
// same call echopark.mjs makes, and it is corroborated rather than assumed:
// the lot's minimum odometer is 2,147 miles and NOT ONE row has a zero or
// absent odometer. A row that ever arrives without one is counted into
// report.notes so the assumption is watched instead of buried.
//
// PRICE. StickerPrice is the advertised vehicle price ("Guaranteed Price" on
// the VDP; the disclaimer excludes tax, finance charges and up to $599 doc).
// OriginalStickerPrice is a PREVIOUS ask — it is what the "Reduced Price"
// badge counts down from (16 of today's 47 hits sit below theirs, 3 above) —
// so it is not published as an MSRP, exactly as echopark's originalPrice is
// not. Every published number still has to clear the year-tiered junk floor.
//
// recheck.mjs skips this domain. The reason is sharper than the usual "the
// sweep is its own liveness check": a DriveTime VDP is an Angular shell that
// serves the same 64 kB of markup for every car and carries no VIN, price or
// title in its HTML, so a recheck could only ever produce a false "gone".
// The nightly walk's truncated:false is what retires sold VINs — and it can:
// of 165 SOLD Grand Cherokee 4xe pulled as a control on 2026-09-05, exactly
// 0 appeared in the available lot the same minute.
import { politePostJson } from "../http.mjs";
import { classifyEv } from "../ev.mjs";
import { pickTaggedPrice } from "../price-provenance.mjs";
import { priceFloor } from "../price-floor.mjs";
import { titleCaseIfShouty } from "./title-case.mjs";

export const DRIVETIME = {
  key: "drivetime",
  domain: "drivetime.com",
  searchUrl: "https://search.ext.drivetime.cloud/api/vehicle/search",
  origin: "https://www.drivetime.com",
  referer: "https://www.drivetime.com/used-cars",
  pageSize: 1000, // 8 pages for today's 7,822; the server honours it exactly
  minExpected: 15, // 47 plug-ins on the first full run; alert well below that
  minLot: 4000, // the lot ran 7,822; a walk that small means something broke
};

// recheck.mjs skips this domain — see the header (the VDP is a VIN-less SPA
// shell, so a recheck could only manufacture a false "gone").
export const OEM_LOCATOR_DOMAINS = new Set([DRIVETIME.domain]);

const MAX_PAGES = 30; // 30k cars — ~4x today's lot, pure runaway guard
const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;
const CURRENT_YEAR = new Date().getFullYear();
const PHOTO_CDN = "https://dtstockphotos.azureedge.net/stockitems";

// The two statuses the query excludes, and the one it keeps. Read from the
// site's own enum (StatusKey ne Sold, ne Layaway) rather than inferred: the
// whole index is 34,054 rows, of which 25,956 are sold and 262 on layaway.
const STATUS_SOLD = "SL";
const STATUS_LAYAWAY = "LA";
const STATUS_AVAILABLE = "AV";

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

const drive = (v) => {
  const s = String(v ?? "").toUpperCase();
  if (/AWD|4WD|ALL.?WHEEL|FOUR.?WHEEL/.test(s)) return "AWD";
  if (/RWD|REAR/.test(s)) return "RWD";
  if (/FWD|FRONT/.test(s)) return "FWD";
  return undefined;
};

/** drivetime.com's own path slug, transcribed from StringUtils.slug in the
 *  site bundle: trim, spaces → "-", "&" → "-and-", drop everything outside
 *  [\w-], collapse repeats, lowercase. Reproduced rather than approximated
 *  because the VDP path is built from it and a URL we cannot load is worse
 *  than no URL at all. */
export const dtSlug = (s) =>
  String(s ?? "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/&/g, "-and-")
    .replace(/[^\w-]+/g, "")
    .replace(/--+/g, "-")
    .toLowerCase();

/** The car's own page. The site's router declares
 *  `used-cars/:state/:city/:make/:model/:year/:stockNumber` and its card
 *  components call vehicleDetailsPage(StateAbbreviation, City, Make,
 *  DisplayName, Year, StockNumber) — DisplayName, not Model, which is why
 *  this takes the record and not six strings. Verified live on 2026-09-05:
 *  .../tx/dallas/jeep/grand-cherokee-4xe/2022/1040312886 renders the 2022
 *  Grand Cherokee 4xe whose VIN is 1C4RJYB65N8715725. Returns undefined
 *  rather than a half-built path if any segment is missing — a broken VDP
 *  link is a claim we cannot stand behind. */
export function vdpUrl(v) {
  const parts = [
    dtSlug(v?.StateAbbreviation),
    dtSlug(v?.City),
    dtSlug(v?.Make),
    dtSlug(v?.DisplayName || v?.Model),
    dtSlug(v?.Year),
    dtSlug(v?.StockNumber),
  ];
  if (parts.some((p) => !p)) return undefined;
  return `${DRIVETIME.origin}/used-cars/${parts.join("/")}`;
}

/** Photo URLs, built the way the site's LinkHelper.photoUrl does:
 *  {cdn}/stockitems/{StockNumber}/{PhotoUID}_{Size}.webp. Only Small, Medium
 *  and Full exist — Large/Thumbnail/XLarge/Original all 404 (probed
 *  2026-09-05); Medium is what the card and gallery use. */
export function photoUrls(v) {
  const stock = String(v?.StockNumber ?? "").trim();
  if (!stock) return [];
  const uids = [];
  const push = (raw) => {
    const uid = String(raw ?? "").trim();
    if (/^[0-9a-f-]{36}$/i.test(uid) && !uids.includes(uid)) uids.push(uid);
  };
  // PrimaryPhotoJson first so it stays images[0] — it is the card's photo.
  push(parseJson(v?.PrimaryPhotoJson)?.PhotoUID);
  for (const p of parseJson(v?.VehiclePhotoJson)?.Photos ?? []) push(p?.PhotoUID);
  return uids.slice(0, 8).map((uid) => `${PHOTO_CDN}/${stock}/${uid}_Medium.webp`);
}

function parseJson(s) {
  if (typeof s !== "string" || !s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/** One search record → a listing, or null. `report` collects the reasons a
 *  row was refused so a shape change shows up as a number rather than as
 *  cars quietly going missing. */
export function toRecord(v, report) {
  const vin = String(v?.Vin ?? "").toUpperCase();
  if (!VIN_RE.test(vin)) return null;

  // Structural guard, not belt-and-braces: the query already excludes SL and
  // LA, so a row arriving with any other status means the filter stopped
  // binding — and admitting a sold car is the failure this lane exists to
  // avoid. Counted, never kept.
  if (String(v.StatusKey ?? "").toUpperCase() !== STATUS_AVAILABLE) {
    report.notAvailable++;
    return null;
  }

  const year = Number(v.Year);
  if (!(year >= 1981 && year <= CURRENT_YEAR + 2)) return null;
  const make = String(v.Make ?? "").trim();
  const model = String(v.Model ?? "").trim();
  if (!make || !model) return null;
  const trim = String(v.Trim ?? "").trim() || undefined;

  // The shared classifier decides, not a nameplate list kept here: a Prius
  // and a Prius Prime differ by VIN and by the maker's own badge, and both
  // of those live in lib/ev.mjs. DriveTime's fuel string is handed over as
  // the source's own claim even though the header shows it is wrong on 40%
  // of the plug-ins — a wrong "Hybrid" cannot promote anything on its own,
  // and withholding it would hide the one field a future "Electric" value
  // would arrive in.
  const ev = classifyEv({
    name: `${year} ${make} ${model}`,
    model,
    vehicleConfiguration: trim,
    fuelType: v.NormalizedFuelDescription,
    vehicleModelDate: String(year),
    vehicleIdentificationNumber: vin,
  });
  if (!ev.isEv) return null;

  const price = num(v.StickerPrice);
  // Every DriveTime car is used (see the header), so the floor is the used
  // ladder. Nothing on the first full run fell below it — the cheapest hit
  // was $16,095 — but a feed that starts publishing a payment in the price
  // slot is one change away and abstaining costs nothing.
  const priced = price != null && price >= priceFloor({ isNew: false, year }) ? price : undefined;
  if (price != null && priced == null) report.belowFloor++;

  const mileage = num(v.OdometerValue);
  if (mileage == null) report.noOdometer++;

  const images = photoUrls(v);
  const store = titleCaseIfShouty(String(v.DealershipName ?? "").trim());

  return {
    vin,
    year,
    make,
    model,
    trim,
    ...pickTaggedPrice("drivetime", [["StickerPrice", priced]]),
    mileage,
    driveLine: drive(v.DriveType),
    exteriorColor: String(v.NormalizedExtColor ?? "").trim() || undefined,
    interiorColor: String(v.NormalizedIntColor ?? "").trim() || undefined,
    dealerName: store ? `DriveTime ${store}` : "DriveTime",
    city: titleCaseIfShouty(String(v.City ?? "").trim()) || undefined,
    state: String(v.StateAbbreviation ?? "").trim().toUpperCase() || undefined,
    stockNumber: String(v.StockNumber ?? "").trim() || undefined,
    condition: "used",
    imageUrl: images[0],
    images,
    sourceUrl: vdpUrl(v),
    dealerDomain: DRIVETIME.domain,
    evKind: ev.kind,
    evConfidence: ev.confidence,
    // DriveTime's own fuel string, restated per row. Kept for the record
    // even where it is wrong: it is what the source said.
    fuelType: String(v.NormalizedFuelDescription ?? "").trim() || undefined,
    platform: "drivetime-locator",
    fromVdp: false,
    scrapedAt: new Date().toISOString(),
  };
}

/** The request the site's own page makes, minus lat/lng/mileRadius (that is
 *  what makes it nationwide). `withFacets` is mutually exclusive with rows —
 *  the server answers a faceted body with counts and an empty `value` — so
 *  the fuel census is its own request. */
export function searchBody({ pageNumber, pageSize, withFacets = false }) {
  return {
    facets: withFacets ? [{ value: "NormalizedFuelDescription", count: null }] : [],
    returnCount: true,
    pageSize,
    pageNumber,
    filters: [
      { name: "StatusKey", operator: 7, type: 1, conjunction: 2, items: [STATUS_SOLD] },
      { name: "StatusKey", operator: 7, type: 1, conjunction: 2, items: [STATUS_LAYAWAY] },
    ],
    filterConjunction: 1,
    queryType: 0,
  };
}

async function searchPage(pageNumber, withFacets, report) {
  const body = searchBody({ pageNumber, pageSize: DRIVETIME.pageSize, withFacets });
  let last = "no attempt";
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await politePostJson(DRIVETIME.searchUrl, {
      headers: { origin: DRIVETIME.origin, referer: DRIVETIME.referer },
      body,
      timeoutMs: 90000,
    });
    report.fetched++;
    if (res.status === "robots_disallowed") {
      report.errors.push("robots disallows the search endpoint");
      return null;
    }
    if (res.status === 200 && Array.isArray(res.json?.value)) return res.json;
    const transient = String(res.status).startsWith("error:") || res.status === 429 || res.status >= 500;
    if (!transient) {
      report.errors.push(`page ${pageNumber}: ${res.status}`);
      return null;
    }
    last = String(res.status);
    await new Promise((r) => setTimeout(r, 5000));
  }
  report.errors.push(`page ${pageNumber}: ${last} after 3 attempts`);
  return null;
}

/** Pull DriveTime's complete national available stock and keep what
 *  lib/ev.mjs can settle. crawl.mjs-shaped report; truncated:false certifies
 *  drivetime.com fully covered, which is what licenses db-sync to retire the
 *  VINs that stopped appearing. */
export async function pullDriveTime({ log = () => {} } = {}) {
  const report = {
    domain: DRIVETIME.domain, kind: "oem-locator", budget: null, fetched: 0,
    vehiclePages: 0, itemListVdps: 0, evs: [], errors: [], notes: [],
    notAvailable: 0, belowFloor: 0, noOdometer: 0,
  };

  const byVin = new Map();
  const seen = new Set(); // every VIN walked, EV or not — the completeness unit
  let count = 0;

  // The fuel census: its own request, because a faceted body returns no rows.
  const facetJson = await searchPage(1, true, report);
  const fuelMix = facetJson?.["@search.facets"]?.NormalizedFuelDescription ?? [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    const json = await searchPage(page, false, report);
    if (!json) break; // error recorded; truncated follows
    count = Number(json["@odata.count"]) || count;
    const rows = json.value;
    for (const v of rows) {
      const vin = String(v?.Vin ?? "").toUpperCase();
      if (VIN_RE.test(vin)) seen.add(vin);
      const rec = toRecord(v, report);
      if (rec) byVin.set(rec.vin, rec);
    }
    log(`drivetime: page ${page}, ${seen.size}/${count} cars walked, ${byVin.size} plug-ins`);
    if (rows.length === 0) break;
    if (count > 0 && seen.size >= count) break;
  }

  report.evs = [...byVin.values()];
  report.vehiclePages = report.fetched;
  report.notes.push(`walked ${seen.size} of ${count} available cars; ${report.evs.length} electrified kept`);
  // The fuel mix is logged, not used to select rows (see the header). This
  // note is how a new value — an "Electric" bucket — announces itself.
  if (fuelMix.length) {
    report.notes.push(`fuel mix: ${fuelMix.map((f) => `${f.value} ${f.count}`).join(", ")}`);
  } else {
    report.notes.push("fuel facet came back empty — the field may have been renamed");
  }
  if (report.notAvailable) report.errors.push(`${report.notAvailable} row(s) arrived with a non-available status — the sold/layaway filter stopped binding`);
  if (report.belowFloor) report.notes.push(`${report.belowFloor} price(s) below the year's junk floor, published without a price`);
  if (report.noOdometer) report.notes.push(`${report.noOdometer} kept row(s) carry no odometer — the used-condition reading rests on the merchant alone for those`);

  // Two independent completeness checks, same contract as echopark.mjs. The
  // walk has to cover the lot the source itself counted, and the lot has to
  // be a plausible size — a sweep that returns 40 cars and calls itself
  // complete would licence db-sync to delist everything else DriveTime has.
  if (count > 0 && seen.size < count) report.errors.push(`walked ${seen.size} of ${count} — paging shortfall`);
  if (seen.size < DRIVETIME.minLot) report.errors.push(`only ${seen.size} cars in the whole lot — expected >= ${DRIVETIME.minLot}`);
  report.truncated = report.errors.length > 0 || byVin.size < DRIVETIME.minExpected;
  return report;
}
