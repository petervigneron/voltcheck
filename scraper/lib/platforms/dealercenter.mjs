// DealerCenter Web Sites (Nowcom) — the website product of the DealerCenter
// DMS, used by independents (199 rooftops in the 2026-09-02 walled pile:
// jordanmotors.co, autoelitemotors.com, royaltymotorspdx.com …). Rooftops
// CNAME www → alpha.dcdws.net → dealers.dealercenterwebsite.net behind
// Cloudflare, and every path answers our plain fetcher with the "Attention
// Required" firewall page — robots.txt too, so the crawler reads no rules
// there. (dcdws is DealerCenter. An earlier note filed dealercenter as "a DMS
// image host, per-dealer custom sites"; the CNAME says otherwise.)
//
// WHERE THE CARS ARE, MEASURED 2026-09-02
//
// A WordPress page, /inventory/, whose settings block
// <script id="DWS_Async_Vehicle_Listing_Settings_N" type="application/json">
// names a `serviceUrl`:
//
//   /inv-scripts-v2/inv/vehicles?vc=a&f=id|sn|ye|ma|mo|tr|…|vin|…&ps=10&pn=0
//                                &sb=pr|d&sp=n&cb=dws_inventory_listing_N
//                                &dcid=3759769&h=f07a3729…
//
// which the page loads as JSONP: dws_inventory_listing_N({"TotalRecordCount":31,
// "Vehicles":[{Vin, Year, Make, Model, Trim, Odometer, VehiclePrice,
// AskingPrice, TotalPrice, DealerFees, FuelType, Drivetrain, ExteriorColor,
// InteriorColor, StockNumber, …}]}). Ten records a page.
//
// The `h` is a signature over the query: change `ps` or `pn` and the
// endpoint answers 401 (or 403 to a fetch() from the page itself). So this
// lane never composes that URL. It loads the SRP page the way a shopper does
// — /inventory/?page_no=N, the pager's own links — and reads the JSONP body
// the page's own script tag fetched, off the browser's response log
// (browserFetch's `capture`). One browser load per ten cars; a 31-car lot is
// four loads. No VDP is needed: the record is complete, and the VDP url is
// read off the rendered card (/inventory/{make}/{model}/{stock}/) so it is
// the dealer's own link, not a guess. Paging: see pullDealerCenter — the
// site blocks a session after its first page, so this lane reads one.
//
// CLOSED BY THE VENDOR'S OWN ROBOTS.TXT, 2026-09-05. The file the plain
// fetcher could never read (the wall answers /robots.txt too) is readable in
// Chrome, and it says, for every crawler:
//
//   Disallow: /inv-scripts-v2/*      — the inventory JSONP this lane captured
//   Disallow: /*?page_no=            — the pager it followed
//   Disallow: /*?fuel_type= …        — every inventory facet
//
// (jordanmotors.co/robots.txt, read 2026-09-05; the same file also names
// GPTBot, PerplexityBot, CCBot and thirty other AI crawlers and disallows
// them everything.) /inventory/ itself is allowed, but its cars arrive only
// through the disallowed script, and a resource the site's robots.txt
// refuses to crawlers is not ours to read off the page's own request any
// more than it is ours to fetch — lib/browser.mjs now reads a walled host's
// robots.txt through Chrome and refuses the page's sub-requests by the same
// rules. So this lane answers `robots_disallowed` before the first load, the
// rooftops report partial (never a delisting), and the 75 cars it landed on
// 2026-09-03 retire through recheck. The code below is kept in case
// DealerCenter opens the endpoint; nothing here works around the rule.
//
// PRICE: VehiclePrice (== AskingPrice on every record seen), tagged
// DEALERCENTER_ASKING. TotalPrice folds the doc fee in and is never read.
// CONDITION: the record's VehicleClass/VehicleType are undocumented
// integers, so condition abstains (the house rule: read the machine token
// or say nothing). These are used-car lots, but that is not a field.
// FUEL: FuelType is the vendor's enum ("GASOLINE", "DIESEL", "ELECTRIC",
// "HYBRID", "PLUG-IN HYBRID"…); mapped to the words classifyEv reads and
// otherwise passed through, so vpic-enrich's fuelTextOnly guard applies.
import { browserFetch, browserRobotsAllows } from "../browser.mjs";
import { DEALERCENTER_ASKING } from "../price-provenance.mjs";
import { decodeEntities } from "../normalize.mjs";

const DC_RE = /\b(?:cdn\.dealercenterwsstatic\.net|imagescf\.dealercenter\.net|dwssecuredforms\.dealercenter\.net|chat-cf\.dealercenter\.net)\b|DWS_Async_Vehicle_Listing_Settings/i;
const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;
export const DEALERCENTER_JSONP_RE = /\/inv-scripts-v2\/inv\/vehicles\?/;
export const DEALERCENTER_SRP_PATH = "/inventory/";
const MAX_PAGES = 60; // 600 cars; a runaway guard for a lane of 10–40-car lots

export function isDealerCenter(html) {
  return typeof html === "string" && DC_RE.test(html);
}

export function dealerCenterSrpUrl(origin, page = 1) {
  return `${origin.replace(/\/$/, "")}${DEALERCENTER_SRP_PATH}${page > 1 ? `?page_no=${page}` : ""}`;
}

/** The inventory endpoint's path, for the robots check only — never fetched. */
export function dealerCenterJsonpUrl(origin) {
  return `${origin.replace(/\/$/, "")}/inv-scripts-v2/inv/vehicles`;
}

/** The JSONP body → { total, vehicles } (raw vendor records), or null. */
export function parseDealerCenterJsonp(text) {
  const s = String(text ?? "");
  const i = s.indexOf("{");
  const j = s.lastIndexOf("}");
  if (i < 0 || j <= i) return null;
  let d;
  try {
    d = JSON.parse(s.slice(i, j + 1));
  } catch {
    return null;
  }
  if (!d || !Array.isArray(d.Vehicles)) return null;
  return { total: Number(d.TotalRecordCount) || d.Vehicles.length, vehicles: d.Vehicles };
}

/** The page's own settings block: pageSize (so the lane knows how many
 *  loads a lot takes) — read, never composed into a request. */
export function dealerCenterPageSize(html) {
  const m = /<script[^>]+id=["']DWS_Async_Vehicle_Listing_Settings[^"']*["'][^>]*>([\s\S]*?)<\/script>/i.exec(String(html ?? ""));
  if (!m) return null;
  try {
    const n = Number(JSON.parse(m[1]).pageSize);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/** VDP hrefs on the rendered page, keyed by stock number:
 *  /inventory/{make}/{model}/{stock}/ is the card's own link. */
export function dealerCenterVdpLinks(html, base) {
  const out = new Map();
  for (const m of String(html ?? "").matchAll(/href=["']([^"']*\/inventory\/[^"'?#]+\/([^"'/?#]+)\/?)["']/gi)) {
    const stock = m[2];
    if (out.has(stock)) continue;
    try {
      out.set(stock, new URL(decodeEntities(m[1]), base).toString());
    } catch {}
  }
  return out;
}

function fuelWords(f) {
  const s = String(f ?? "").toUpperCase();
  if (!s) return undefined;
  if (/PLUG/.test(s)) return "Plug-in Hybrid Electric";
  if (/ELECTRIC|^EV$|BEV/.test(s)) return "Electric";
  return String(f);
}
const DRIVES = new Set(["AWD", "4WD", "FWD", "RWD", "4X4", "2WD"]);

/** One vendor record → the JSON-LD-shaped node normalize() reads. */
export function dealerCenterVehicle(r, { vdpUrl } = {}) {
  const vin = String(r?.Vin ?? "").toUpperCase();
  if (!VIN_RE.test(vin)) return null;
  const price = Number(r.VehiclePrice ?? r.AskingPrice);
  const miles = Number(r.Odometer);
  const drive = String(r.Drivetrain ?? "").toUpperCase().replace(/^4MATIC\s+/, "");
  return {
    "@type": "Vehicle",
    vehicleIdentificationNumber: vin,
    vehicleModelDate: r.Year != null ? String(r.Year) : undefined,
    brand: r.Make || undefined,
    model: r.Model || undefined,
    vehicleConfiguration: r.Trim || undefined,
    name: [r.Year, r.Make, r.Model, r.Trim].filter(Boolean).join(" ") || undefined,
    mileageFromOdometer: Number.isFinite(miles) && miles > 0 ? { "@type": "QuantitativeValue", value: miles } : undefined,
    color: r.ExteriorColor || undefined,
    vehicleInteriorColor: r.InteriorColor || undefined,
    driveWheelConfiguration: DRIVES.has(drive) ? drive : undefined,
    sku: r.StockNumber ? String(r.StockNumber) : undefined,
    fuelType: fuelWords(r.FuelType),
    vehicleEngine: r.FuelType ? { "@type": "EngineSpecification", fuelType: fuelWords(r.FuelType) } : undefined,
    // condition abstains: VehicleClass/VehicleType are undocumented integers
    offers: {
      "@type": "Offer",
      price: Number.isFinite(price) && price > 0 ? price : undefined,
      priceProvenance: Number.isFinite(price) && price > 0 ? DEALERCENTER_ASKING : undefined,
      priceCurrency: "USD",
      url: vdpUrl,
    },
  };
}

/** THE FIRST PAGE ONLY, on purpose. Measured 2026-09-02 on jordanmotors.co,
 *  autoelitemotors.com, royaltymotorspdx.com: a fresh Chrome session gets
 *  /inventory/ (and, on its own, /inventory/?page_no=2 or /inventory/bmw/) at
 *  200 with the JSONP; the SECOND load in the same session — the pager link
 *  clicked, a facet, anything — answers Cloudflare's "Attention Required".
 *  The site's bot verdict lands after the first page's scripts run (plain
 *  headless Chrome says what it is), and everything after that is blocked.
 *  A fresh session per page would read the whole lot, and it would be
 *  reading around a verdict the site has already given — the line
 *  lib/browser.mjs draws. So this lane reads what one session is served,
 *  stops when blocked, and never certifies the lot complete unless the lot
 *  fits on that page. Ten cars of a thirty-one-car lot, honestly partial;
 *  recheck retires per VIN, db-sync never delists on this lane's silence. */
export async function pullDealerCenter(origin) {
  if (!(await browserRobotsAllows(dealerCenterJsonpUrl(origin)))) return { ok: false, complete: false, found: 0, vehicles: [], requests: 0, why: "robots_disallowed" };
  const run = await browserFetch(dealerCenterSrpUrl(origin, 1), { capture: DEALERCENTER_JSONP_RE, settleMs: 3000 });
  if (run.status === "browser_unavailable") return { ok: false, complete: false, found: 0, vehicles: [], requests: 1, why: "browser_unavailable" };
  if (run.status !== 200 || !run.body) return { ok: false, complete: false, found: 0, vehicles: [], requests: 1, status: run.status };
  const body = run.captured.map((c) => parseDealerCenterJsonp(c.text)).find(Boolean);
  if (!body) return { ok: false, complete: false, found: 0, vehicles: [], requests: 1, status: "no-jsonp" };
  const links = dealerCenterVdpLinks(run.body, run.finalUrl || origin);
  const vehicles = [];
  const seen = new Set();
  let noVdp = 0;
  for (const r of body.vehicles) {
    const vdpUrl = links.get(String(r.StockNumber ?? "")) ?? null;
    if (!vdpUrl) noVdp++;
    const v = dealerCenterVehicle(r, { vdpUrl: vdpUrl ?? undefined });
    if (!v || seen.has(v.vehicleIdentificationNumber)) continue;
    seen.add(v.vehicleIdentificationNumber);
    vehicles.push(v);
  }
  const pageSize = dealerCenterPageSize(run.body) ?? body.vehicles.length ?? 10;
  const complete = body.total <= pageSize && noVdp === 0;
  return { ok: true, complete, found: body.total, vehicles, requests: 1, noVdp, pageSize, ...(complete ? {} : { why: `first page only (${body.vehicles.length} of ${body.total})` }) };
}

/** For probe: the first page — the lot's own total and whether VINs came back. */
export async function countDealerCenter(origin) {
  if (!(await browserRobotsAllows(dealerCenterJsonpUrl(origin)))) return { ok: false, found: 0, hasVin: false, why: "robots_disallowed" };
  const res = await browserFetch(dealerCenterSrpUrl(origin, 1), { capture: DEALERCENTER_JSONP_RE, settleMs: 3000 });
  if (res.status === "browser_unavailable") return { ok: false, found: 0, hasVin: false, why: "browser_unavailable" };
  if (res.status !== 200) return { ok: false, found: 0, hasVin: false, status: res.status };
  const body = res.captured.map((c) => parseDealerCenterJsonp(c.text)).find(Boolean);
  if (!body) return { ok: false, found: 0, hasVin: false, status: "no-jsonp" };
  return { ok: true, found: body.total, hasVin: body.vehicles.some((r) => VIN_RE.test(String(r.Vin ?? "").toUpperCase())), requests: 1 };
}
