// eBizAutos — an old ASP.NET dealer-website vendor whose rooftops are Miami/
// Fort Lauderdale exotic and luxury lots (The Collection alone lists 914 cars,
// including multiple Taycans, Teslas and Panamera e-hybrids). The registry
// rows are the dealers' OWN domains, and those are shells: thecollection.com
// is WordPress whose /inventory/ renders client-side, which is why the whole
// cohort sat in needs-investigation as "0 VIN vehicles".
//
// The inventory lives on a SEPARATE HOST the shell links to — usually the
// vendor's own ({slug}.ebizautos.com: the-collection, sanfer-sports-cars),
// sometimes a second custom domain (luckydrivermiami.com's cars are on
// www.luckydriversportcars.com). On that host everything is honest and
// server-rendered (verified 2026-08-31 on the-collection.ebizautos.com):
//
//   - robots.txt allows the VDPs and names /sitemap.xml. It disallows
//     /inventory.aspx* and /inventory-*.html — the SRPs — so the sitemap is
//     the enumeration and the SRP is never fetched.
//   - the sitemap lists every VDP as
//       /details-{year}-{make}-{model}[-{trim}]-{new|used}-{vin}.html
//     with the 17-char VIN and the platform's own new/used routing token in
//     the slug. Fields are single-hyphen separated; spaces inside a field are
//     underscores and hyphens are tildes ("alfa_romeo", "panamera_e~hybrid"),
//     so a split on "-" is unambiguous.
//   - each VDP carries a complete schema.org Vehicle JSON-LD (VIN, price,
//     itemCondition, odometer, colors, availability) that the generic
//     extractor already reads — extractVehicles() returned the whole car on
//     the first page tried. This lane therefore adds no field parsing of its
//     own: it finds the host, walks the sitemap, and fetches candidate VDPs.
//
// Shape and semantics mirror pullAutoFunds: the sitemap is the whole-lot VIN
// set (found/complete are its), and only cars that could be electrified earn
// a VDP request — the slug's own name plus the VIN's WMI decide, and a VDP
// that fails costs that car its details, not the run its completeness.
import { fetchPage } from "../http.mjs";
import { extractVehicles } from "../jsonld.mjs";
import { classifyEv, EV_ONLY_WMIS } from "../ev.mjs";

const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;

// The vendor's own hosts, never the brand word. cdn/images/stockphotos
// .ebizautos.media serve the photos; {slug}.ebizautos.com serves the site
// itself; www.ebizautos.com is the vendor's footer credit. Kept byte-identical
// to the fingerprint.mjs entry (the test asserts agreement).
const ASSET_RE = /\b(?:cdn|images|stockphotos)\.ebizautos\.media\b|\b[a-z0-9-]+\.ebizautos\.com\b/i;

export function isEBizAutos(html) {
  return typeof html === "string" && ASSET_RE.test(html);
}

/** Candidate inventory origins, best first, read off the shell page:
 *  hosts that already serve /details-…html links (the custom-domain case),
 *  then the {slug}.ebizautos.com subdomain the page references. The vendor's
 *  shared hosts (www, images, cdn) are not inventory sites. */
export function ebizAutosOrigins(html, origin) {
  if (typeof html !== "string") return [];
  const out = [];
  for (const m of html.matchAll(/href=["'](?:https?:)?\/\/([a-z0-9.-]+)\/details-[a-z0-9_~-]+\.html/gi)) {
    const h = `https://${m[1].toLowerCase()}`;
    if (!out.includes(h)) out.push(h);
  }
  for (const m of html.matchAll(/\b([a-z0-9-]+)\.ebizautos\.com\b/gi)) {
    const slug = m[1].toLowerCase();
    if (["www", "images", "cdn", "stockphotos"].includes(slug)) continue;
    const h = `https://${slug}.ebizautos.com`;
    if (!out.includes(h)) out.push(h);
  }
  // The rooftop itself may BE the inventory host (a details- link with a
  // relative href would not have matched above).
  if (/href=["']\/details-[a-z0-9_~-]+\.html/i.test(html) && origin && !out.includes(origin)) out.unshift(origin);
  return out.slice(0, 3);
}

const word = (s) => s.replace(/_/g, " ").replace(/~/g, "-");

/** One sitemap slug → the identity the URL itself states, or null. VIN-less
 *  slugs are real on these lots (pre-1981 classics carry the stock number
 *  where the VIN goes) and are skipped: the site is VIN-keyed. */
export function ebizAutosSlugRecord(url) {
  const m = String(url ?? "").match(/\/details-(\d{4})-([a-z0-9_~-]+)-(new|used)-([a-z0-9]{17})\.html$/i);
  if (!m) return null;
  const vin = m[4].toUpperCase();
  if (!VIN_RE.test(vin)) return null;
  const name = `${m[1]} ${m[2].split("-").map(word).join(" ")}`;
  return { url, vin, year: m[1], name, condition: m[3].toLowerCase() };
}

/** A car whose VDP is worth one request: already classifiable as an EV from
 *  the slug, from an EV-only WMI, or naming electrification at all — the
 *  autoFundsNeedsVdp rule, on the only text a slug has. */
const ELECTRIFIED_TEXT_RE = /electric|\bev\b|\bphev\b|plug[\s-]?in|hybrid|\bkwh\b|\bbev\b/i;
export function ebizAutosNeedsVdp(rec) {
  if (EV_ONLY_WMIS.has(rec.vin.slice(0, 3))) return true;
  if (classifyEv({ name: rec.name, vehicleIdentificationNumber: rec.vin }).isEv) return true;
  return ELECTRIFIED_TEXT_RE.test(rec.name);
}

/** Minimal node for a car we did not fetch: exactly what the slug states. */
function slugVehicle(rec) {
  return {
    "@type": "Vehicle",
    vehicleIdentificationNumber: rec.vin,
    vehicleModelDate: rec.year,
    name: rec.name,
    // The platform's own routing token, same standing as AutoFunds' path
    // segment. Stated by the URL the platform minted, not inferred.
    itemCondition: rec.condition,
    offers: { "@type": "Offer", priceCurrency: "USD", url: rec.url },
  };
}

async function readSitemap(origin) {
  const res = await fetchPage(`${origin.replace(/\/$/, "")}/sitemap.xml`);
  if (res.status !== 200 || !res.body) return null;
  const urls = [...res.body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);
  const recs = [];
  const seen = new Set();
  for (const u of urls) {
    const rec = ebizAutosSlugRecord(u);
    if (rec && !seen.has(rec.vin)) {
      seen.add(rec.vin);
      recs.push(rec);
    }
  }
  return recs;
}

/**
 * One rooftop's whole lot off the inventory host's sitemap, with a VDP fetch
 * for each car that could be electrified. `origins` come from
 * ebizAutosOrigins(); the first whose sitemap yields VIN'd details URLs wins.
 *
 * `complete` = a sitemap answered and parsed. A failed candidate VDP costs
 * that car its price and details, never the run its completeness — the VIN
 * set is the sitemap's (the autofunds rule). A VDP whose own Offer says the
 * car is no longer InStock is dropped: the sitemap lags sales, and recheck
 * must not inherit a car the page already calls gone.
 */
export async function pullEBizAutos(origins, { keep = ebizAutosNeedsVdp } = {}) {
  let requests = 0;
  for (const origin of origins) {
    const recs = await readSitemap(origin);
    requests++;
    if (!recs) continue; // host did not answer; try the next candidate
    if (!recs.length) continue; // a live host with no inventory URLs (a rooftop that left the platform 301-loops here)
    const vehicles = [];
    let vdpFailures = 0;
    for (const rec of recs) {
      if (!keep(rec)) {
        vehicles.push(slugVehicle(rec));
        continue;
      }
      const vdp = await fetchPage(rec.url);
      requests++;
      if (vdp.status !== 200 || !vdp.body) {
        vdpFailures++;
        vehicles.push(slugVehicle(rec));
        continue;
      }
      const full = extractVehicles(vdp.body).find(
        (v) => String(v.vehicleIdentificationNumber ?? "").toUpperCase() === rec.vin,
      );
      if (!full) {
        // A 200 that shows a different car (or none) is the platform's own
        // way of saying this one is gone; the slug node must not stand in.
        vdpFailures++;
        continue;
      }
      const offer = Array.isArray(full.offers) ? full.offers[0] : full.offers;
      if (offer?.availability && !/InStock/i.test(String(offer.availability))) continue;
      // Condition: the VDP's schema enum and the slug's routing token are two
      // independent machine signals; where they disagree, neither is claimed
      // (the autofunds two-signal rule — one rooftop there stamped
      // NewCondition across a used lot).
      const ldCond = /UsedCondition/i.test(String(full.itemCondition))
        ? "used"
        : /NewCondition/i.test(String(full.itemCondition))
          ? "new"
          : undefined;
      if (ldCond && ldCond !== rec.condition) full.itemCondition = undefined;
      vehicles.push(full);
    }
    return { ok: true, complete: true, found: recs.length, vehicles, requests, vdpFailures, origin };
  }
  return { ok: false, complete: false, found: 0, vehicles: [], requests };
}

/** Probe settle: does any candidate origin's sitemap carry VIN'd inventory? */
export async function countEBizAutos(origins) {
  for (const origin of origins) {
    const recs = await readSitemap(origin);
    if (recs?.length) return { ok: true, found: recs.length, hasVin: true, origin };
  }
  return { ok: false, found: 0, hasVin: false };
}
