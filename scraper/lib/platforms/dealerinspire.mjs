// Dealer Inspire (Cars Commerce) — the largest dealer-website vendor in the
// 2026-09-02 walled pile: 1,496 rooftops, 60% of it. Rooftops CNAME to
// pod{N}.dealerinspire.com (or sit as bare A records in Cars Commerce's
// 74.119.99.0/24), and every path — homepage, SRP, sitemap, wp-json —
// answers our plain fetcher with Cloudflare's "Attention Required" firewall
// page. That page is a verdict on the CLIENT: their robots.txt allows
// every crawler with a one-second delay, and a real Chrome (lib/browser.mjs,
// plain headless) loaded the same SRP at 200 with 20 VINs in it.
//
// WHERE THE CARS ARE, MEASURED 2026-09-02 (faricykia.com, kendall stores)
//
// The SRP is /used-vehicles/ and /new-vehicles/, paged by ?_p=N (the next
// link is the only pager mark; a page with no `_p=N+1` link is the last).
// It is server-rendered — no inventory XHR at all; the Algolia plugin loads
// and never calls out — and every card carries the VIN as a `data-vin`
// attribute (div.vin-row, data-testid="vin-number") plus a VDP link whose
// slug ends in the VIN: /inventory/{used|new}-{year}-{make}-{model}-{trim}-{vin}/.
// The card's price rows are dealer-configured prose ("Selling Price
// $5,303 / Delivery & Handling $695 / Faricy Sales Price $5,998") and are
// not read. The VDP publishes a schema.org Product+Car node: VIN, fuelType,
// mileageFromOdometer, itemCondition, offers.price — and that price is the
// fee-inclusive one on rooftops that fold their D&H in (5,998 above), which
// errs toward OVER, the direction this house tolerates (a false bargain is
// the expensive error). It carries the JSONLD provenance like any other
// dealer page's own offer.
//
// TWO TEMPLATES BEHIND ONE CNAME (measured on the first 58 promoted rooftops,
// 2026-09-02): the classic WordPress theme above, and Cars Commerce's newer
// Motive template (mentornissan.com, lexusofeaston.com, platinumvw.com,
// genesiscfl.com …) — no /used-vehicles/ cards, sometimes no /used-vehicles/
// at all (404), the lot in Algolia behind api.app.ridemotive.com. That is
// the platform lib/platforms/ridemotive.mjs already reads: its config
// (Algolia app id, key, index, dealer id) sits on the homepage, and the
// Algolia host is open to a plain fetch. The only thing the wall costs a
// Motive rooftop is the homepage read, so this lane reads it with the
// browser and hands the config to the Motive lane. One browser load, then
// the ordinary API pull; the row keeps platform "dealerinspire" because the
// crawl's own Motive block reads the homepage with http.mjs and would hit
// the wall.
//
// COST SHAPE
//
// Browser loads are ~30x a fetch, so the lane spends them where the cars are:
// one load per SRP page (20 cards each), then one per EV CANDIDATE — VIN in
// an EV-only WMI or an EV/PHEV word in the card's title/slug, the same net
// the HTML crawl throws — and never on the rest of the lot. A typical
// franchise rooftop is 2–8 SRP pages and 5–30 candidates.
//
// THE FUEL FACET FIRST (2026-09-08). The cohort crawl of 2026-09-08 01:27
// read 448 classic rooftops and 209 of them stopped at the 12-minute domain
// cap with 3,677 candidates never opened; the capped lots held a median 360
// cars against 118 for the ones that finished. A 370-car Ford store spent
// its 35 loads on eleven SRP pages and half its candidates, and a 2022
// Lightning on page three of its used list was one of the 14 it never
// reached. Halving the walk's share of the budget (below) turned a certain
// zero into half the candidates; it could not make the lot smaller.
//
// The classic theme's SRP takes its own facet in the URL, server-rendered:
// /used-vehicles/?_dFR[fueltype][0]=Electric+Fuel+System&_dFR[fueltype][1]=
// Plug-In+Electric%2FGas answers that store with 47 cars over three pages
// instead of 171 over five, and the Lightning is on page three of it. The
// spellings are the vendor feed's (Chrome-style: "Electric Fuel System",
// "Plug-In Electric/Gas", "Gas/Electric Hybrid", "Gasoline/Mild Electric
// Hybrid", "Gasoline Fuel"), the same on every rooftop read: the filtered
// used list at kerbeckcadillacs.com answered exactly the 28 EVs a complete
// unfiltered walk had admitted, and landrovervannuys.net's seven used
// plug-ins all carried one of the two. Two things measured that shape the
// code below:
//   - A spelling the index does not know returns ZERO cars, not the lot
//     ("Bogus Fuel Type" → "0 Used Cars"). So the filtered walk can never be
//     the completeness claim: a rooftop whose feed spells electric some
//     third way would read as having no EVs and db-sync would delist them.
//     Only VERIFIED spellings go in the URL, and the unfiltered walk still
//     runs after it — the filtered walk is a fast path, not the walk.
//   - Every real result card carries a `data-vehicle` JSON blob (vin, year,
//     make, model, trim, price, msrp, type, fueltype); the "featured" block
//     some rooftops repeat on every page carries data-vin only. That blob is
//     a second candidate net (a Corsair Grand Touring has no EV word in its
//     slug and "Plug-In Electric/Gas" in its blob) and the place a new
//     spelling would show up: one seen in an unfiltered walk that reads as
//     electrified and is not in the list is reported, so the list grows from
//     evidence and never from a guess.
//
// Order of spend, so the budget goes to cars first: homepage, the filtered
// used and new lists (a page or three each), the VDPs of their REAL results,
// then the VDPs of the block cards those pages carried, then the plain used
// and new walks with the title/WMI/blob net and their VDPs until the budget
// ends. A big lot still reports partial (no delisting), as before — but with
// every EV the dealer's own fuel field names already read.
//
// Real results first, measured the hard way on 2026-09-08 03:45 (run
// 34184195495): the filtered pages' "you may also like" block is not one
// fixed set but a different handful of new Mach-Es on every page, each a
// candidate by title, and read in page order they came before page two's
// results. The Lightning on page three was the 50th load; the runner's cap
// fell at 48. The block cars are in the new list anyway.
//
// The read order ROTATES by day. A group site's filtered list can be the
// size of a small lot — germain.com answered 364 used plug-ins, victory
// automotivegroup.com 455 — and a visit reads ~40-55 VDPs before the cap.
// In a fixed order every visit re-reads the same first fifty and the rest
// are never reached; rotated by a day-stride of 40 (about one visit's worth
// of VDPs on a shared runner) each visit starts where the last one roughly
// left off and a 364-car list is covered in nine. Cars not reached keep
// their last read (the pull is partial, nothing delists); recheck verifies
// liveness on its own clock.
//
// The walk gets the FULL remaining budget once the fast path has read cars:
// the half-budget reserve below exists to keep VDP loads back from a walk
// that used to run first, and with the cars already read it only starved
// the walk — kerbeckcadillacs.com, complete in 38 loads before, came back
// partial at 46 with its 29 EVs all read and its 9 walk pages unfinished.
// The reserve still applies when the fast path found nothing (a rooftop
// whose facet answers zero), because then the walk is the only path.
import { browserFetch } from "../browser.mjs";
import { isRideMotive, rideMotiveConfig, pullRideMotiveApi, countRideMotiveApi } from "./ridemotive.mjs";
import { extractVehicles } from "../jsonld.mjs";
import { evish } from "../sitemap.mjs";
import { EV_ONLY_WMIS } from "../ev.mjs";
import { decodeEntities } from "../normalize.mjs";

// The vendor's own hosts and theme names on a served page. Never the bare
// word: fingerprint.mjs's /dealerinspire/i is for pages we already read.
const DI_RE = /\b(?:assets|ref|di-uploads-[a-z0-9]+|di-shared-assets|vehicle-sprites|gtmassets)\.dealerinspire\.com\b|DealerInspire(?:Dealer|Common)Theme|\bvehicle-images\.carscommerce\.inc\b/i;
const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;

export function isDealerInspire(html) {
  return typeof html === "string" && DI_RE.test(html);
}

export const DEALERINSPIRE_SRPS = ["/used-vehicles/", "/new-vehicles/"];
export const DEALERINSPIRE_MAX_PAGES = 40; // 800 cards; a runaway guard, not a budget

// The vendor feed's electrified fuel spellings, as VERIFIED on served pages
// (see the header): a value the index does not know zeroes the result, so
// nothing goes here on a guess. Conventional hybrids ("Gas/Electric Hybrid",
// "Gasoline/Mild Electric Hybrid") are deliberately absent.
export const DEALERINSPIRE_EV_FUELTYPES = ["Electric Fuel System", "Plug-In Electric/Gas"];
// What reads as electrified in a card's own fueltype — the candidate net and
// the new-spelling detector — minus the hybrids that merely contain "Electric".
const EV_FUEL_RE = /electric|plug|hydrogen|fuel cell|\bbev\b|\bphev\b/i;
const NOT_PLUG_RE = /gas\/electric hybrid|electric\/gas hybrid|mild/i;
export const dealerInspireFuelIsEv = (fuel) => Boolean(fuel) && EV_FUEL_RE.test(fuel) && !NOT_PLUG_RE.test(fuel);

/** The same list filtered to the electrified fuel facet, page 1. Paging goes
 *  through dealerInspireNextUrl, which keeps the query. */
export function dealerInspireFuelSrpUrl(origin, path, fuels = DEALERINSPIRE_EV_FUELTYPES) {
  const u = new URL(`${origin.replace(/\/$/, "")}${path}`);
  fuels.forEach((f, i) => u.searchParams.set(`_dFR[fueltype][${i}]`, f));
  return u.toString();
}

export function dealerInspireSrpUrl(origin, path, page = 1) {
  return `${origin.replace(/\/$/, "")}${path}${page > 1 ? `?_p=${page}` : ""}`;
}

/** Cards on an SRP: VIN from data-vin, the VDP href whose slug ends in that
 *  VIN, and the title text near it (for candidacy only). */
export function dealerInspireCards(html, base) {
  const out = [];
  const seen = new Set();
  const src = String(html ?? "");
  // Two card markups in the classic theme (measured 2026-09-02: 322 of 1,496
  // rooftops carry no data-vin at all — tonkinchevrolet.com, hondaofslidell
  // .com, nucarchevroletwoburn.com …). The VDP href's slug ends in the VIN on
  // both, so the href is the identity read and data-vin is only the first
  // place to look.
  const vins = [];
  // The result card's own record: `data-vehicle` holds entity-encoded JSON
  // with vin, fueltype, price, msrp, type. Present on every real result card
  // of both classic markups read so far (kerbeckcadillacs.com carries it
  // with no data-vin at all); absent on the repeated "featured" block.
  const blobs = new Map();
  for (const m of src.matchAll(/data-vehicle=["'](\{[^"']*\})["']/gi)) {
    try {
      const b = JSON.parse(decodeEntities(m[1]));
      const v = String(b?.vin ?? "").toUpperCase();
      if (VIN_RE.test(v)) {
        blobs.set(v, b);
        vins.push(v);
      }
    } catch {}
  }
  for (const m of src.matchAll(/data-vin=["']([A-HJ-NPR-Z0-9]{17})["']/gi)) vins.push(m[1]);
  for (const m of src.matchAll(/href=["'][^"']*\/inventory\/[^"']*?([A-HJ-NPR-Z0-9]{17})\/?["']/gi)) vins.push(m[1]);
  for (const raw of vins) {
    const vin = raw.toUpperCase();
    if (!/\d/.test(vin) || seen.has(vin)) continue;
    seen.add(vin);
    const blob = blobs.get(vin);
    const hrefRe = new RegExp(`href=["']([^"']*?/inventory/[^"']*?${vin}/?)["']`, "i");
    const h = hrefRe.exec(src);
    let url = null;
    if (h) {
      try {
        url = new URL(decodeEntities(h[1]), base).toString();
      } catch {}
    }
    // The card's title sits in the VDP slug ("used-2010-ford-focus-se-…"),
    // which is the most stable place to read it from — the visible heading
    // markup varies by theme.
    const slug = url ? url.replace(/^.*\/inventory\//, "").replace(new RegExp(`-?${vin}/?$`, "i"), "") : "";
    const card = { vin, url, title: slug.replace(/-/g, " ") };
    if (blob) {
      card.fuel = String(blob.fueltype ?? "").trim() || undefined;
      card.result = true; // a real result, not the featured block
    }
    out.push(card);
  }
  return out;
}

/** Is a 200 actually this vendor's SRP? A page carrying no cards AND none of
 *  Dealer Inspire's own marks is not an empty lot — it is somebody else's
 *  page. temeculanissan.com answered a GitHub runner with a 25 KB "Checking
 *  your browser - reCAPTCHA" interstitial at HTTP 200 on 2026-09-06 and
 *  served the real SRP to a laptop the same hour; crownbmw.com has left the
 *  vendor for a /cars/used-inventory site altogether. Counting either as a
 *  walked page made the pull COMPLETE with zero cars, and a complete pull is
 *  what licenses db-sync to delist a rooftop — the lane would have reported
 *  that every car on that lot was gone. A page that fails this ends the walk
 *  with `url` still set, so the pull is partial and the cars stay. */
export function isDealerInspireSrpPage(html, cards = []) {
  return cards.length > 0 || isDealerInspire(html);
}

/** The next SRP page, or null on the last one. DI's only pager mark is the
 *  `?_p=N+1` link; the page number is in the current url. */
export function dealerInspireNextUrl(html, currentUrl) {
  let page = 1;
  try {
    page = Number(new URL(currentUrl).searchParams.get("_p") ?? 1) || 1;
  } catch {}
  const next = page + 1;
  // `&amp;` as well as `&`: a filtered list's pager keeps the facet query,
  // so its next link reads `…Gas&amp;_p=2` in served HTML, and the plain
  // `[?&]` form saw no page two at kengrodyfordorangecounty.com on
  // 2026-09-08 03:22 — the fast path read page one of 47 cars and stopped.
  if (!new RegExp(`(?:[?&]|&amp;)_p=${next}\\b`).test(String(html ?? ""))) return null;
  try {
    const u = new URL(currentUrl);
    u.searchParams.set("_p", String(next));
    return u.toString();
  } catch {
    return null;
  }
}

/** Same net as the HTML crawl's evishEntry — an EV-only WMI, or an EV/PHEV
 *  word — plus the card's own fueltype when its blob carries one. */
export function dealerInspireIsCandidate(card) {
  if (card.vin && VIN_RE.test(card.vin) && EV_ONLY_WMIS.has(card.vin.slice(0, 3).toUpperCase())) return true;
  if (dealerInspireFuelIsEv(card.fuel)) return true;
  return evish(`${card.title ?? ""} ${card.url ?? ""}`);
}

/** The VDP's own Vehicle node for this VIN, or null. */
export function dealerInspireVdpVehicle(html, vin) {
  for (const v of extractVehicles(html ?? "")) {
    if (String(v.vehicleIdentificationNumber ?? "").toUpperCase() === vin) return v;
  }
  return null;
}

// The crawl's own limits, honoured between browser loads: the per-domain
// clock (crawl.mjs --domain-cap-min) and the row's page budget. Measured
// 2026-09-03: the first rolling-crawl run after 1,458 Dealer Inspire rooftops
// were promoted lost ALL 48 slices to the 28-minute job timeout before their
// sync step — this lane ran 60–160 Chrome loads per rooftop and nothing
// inside it looked at the clock. A lane that stops here returns what it has
// with complete=false, which db-sync reads as "do not delist", and the next
// slice picks the rooftop up again.
// Half the load budget for the SRP walk, half kept back for candidate VDPs.
// The walk used to have the whole budget and the VDPs got the remainder, so a
// big lot spent every load enumerating cars it then never read:
// dickhannahford.com's 800-car lot came back "60 candidate(s), 0 EV(s)
// admitted in 80 browser load(s)" (2026-09-05, four rooftops in one sample),
// and covinakia.com's 479-car lot admitted 1 of 119. Neither rooftop is walled
// or broken — the budget simply ran out on the wrong side of the lane.
// Splitting it turns a guaranteed zero into roughly half the candidates, and
// the pull is reported partial either way (`stopped`), so db-sync delists
// nothing and the next visit starts over. Rooftops small enough to finish
// inside half a budget are unaffected: the reserve is a ceiling on the walk,
// not a quota it has to spend.
//
// THE CLOCK IS RESERVED THE SAME WAY, and it has to be, because on a GitHub
// runner the clock is the only limit that ever binds. That reading was wrong
// when this reserve was written ("the deadline is NOT halved — a clock the
// walk shares with the VDPs would just move the same starvation to the slow
// rooftops") and the 2026-09-06 04:41 rolling run measured it: 364 rooftops
// bailed on the DI lane, every one of them at the 8-minute --domain-cap-min
// (wall p50 490 s against a 480 s cap) and NONE of them at the 40-load SRP
// reserve (loads p50 22, max 52). A load costs ~22 s of a rooftop's own wall
// time on the runner — eight Chromium pages shared by 13-18 Dealer Inspire
// domains at once — so the walk always ran out of clock first, the load
// reserve never engaged, and the VDPs got nothing: 296 of those 364 rooftops
// admitted zero EVs, and the whole lane returned 405 EVs for 8,595 browser
// loads (0.047 per load, against 0.221 on the Motive-template rooftops that
// read an API instead).
//
// Every EV this lane admits comes from a VDP. A walk that spends the whole
// clock enumerating cards it then never reads is worth exactly zero, so half
// the REMAINING clock is now kept back too, on the same terms as the loads: a
// ceiling on the walk, not a quota, so the rooftops that finish inside it are
// untouched, and the pull is reported partial either way, so db-sync delists
// nothing.
export function srpLoadLimits(limits, now = Date.now()) {
  if (!limits) return null;
  if (!limits.maxLoads && !limits.deadlineAt) return limits;
  const out = { ...limits };
  if (limits.maxLoads) out.maxLoads = Math.max(2, Math.ceil(limits.maxLoads / 2));
  // Math.max(0, …) so a deadline already in the past stays in the past rather
  // than being pushed forward by half a negative remainder.
  if (limits.deadlineAt) out.deadlineAt = now + Math.max(0, Math.ceil((limits.deadlineAt - now) / 2));
  return out;
}

export function dealerInspireLimitsExhausted(limits, loads) {
  if (!limits) return false;
  if (limits.deadlineAt && Date.now() > limits.deadlineAt) return true;
  if (limits.maxLoads && loads >= limits.maxLoads) return true;
  return false;
}

// An SRP is read once its RESULT CARDS exist, not once a timer says so.
// `data-vehicle` is the real-result marker this file already keys on — the
// repeated "featured" block carries only data-vin, so waiting on that would
// return before the lot rendered, which is the same wrong answer with extra
// steps. A rooftop whose theme emits no blob at all waits out waitForMs and
// its body is read anyway; nothing here decides a lot is empty on a timer.
const SRP_LOAD = { waitFor: "[data-vehicle]", waitForMs: 30000 };

// A VDP is read for exactly one thing — its schema.org Product+Car node — and
// that node is in the served HTML. Waiting for it instead of for the page's
// load event is what makes a big lot affordable: measured 2026-09-10, a
// Dealer Inspire VDP does not fire `domcontentloaded` inside 45 s (chat and
// analytics subresources stay open), so every candidate cost the full
// navigation timeout — 220 candidates at sunroadauto.com would have been two
// and a half hours of waiting for an event that carries no cars. The JSON-LD
// is there in about a second.
const VDP_LOAD = { waitForText: "vehicleIdentificationNumber", waitForMs: 30000, settleMs: 0 };

async function readSrp(origin, path, { maxPages = DEALERINSPIRE_MAX_PAGES, limits = null, loadsSoFar = 0, startUrl = null, fetch = browserFetch } = {}) {
  const cards = [];
  const seen = new Set();
  let url = startUrl || dealerInspireSrpUrl(origin, path);
  let requests = 0;
  let pages = 0;
  let status = null;
  while (url && pages < maxPages) {
    if (dealerInspireLimitsExhausted(limits, loadsSoFar + requests)) return { cards, requests, pages, status, complete: false, exhausted: true };
    let res = await fetch(url, SRP_LOAD);
    requests++;
    // One more try on a failed page. Measured 2026-09-02: faricykia.com's 24
    // used pages walk clean one at a time, and the same walk under six
    // concurrent Chrome pages lost a page to a timeout and stopped at 116 of
    // 472 cars. A page that fails twice ends the walk honestly (partial).
    if (res.status !== 200 || !res.body) {
      await new Promise((r) => setTimeout(r, 4000));
      res = await fetch(url, SRP_LOAD);
      requests++;
    }
    status = res.status;
    if (res.status !== 200 || !res.body) break;
    const page = dealerInspireCards(res.body, res.finalUrl || url);
    if (!isDealerInspireSrpPage(res.body, page)) {
      status = "not-dealerinspire";
      break;
    }
    pages++;
    let fresh = 0;
    for (const c of page) {
      if (seen.has(c.vin)) continue;
      seen.add(c.vin);
      cards.push(c);
      fresh++;
    }
    if (!fresh) {
      // A pager that loops back serves the same cards again: that IS the end
      // of the lot, not a hole in the walk (78 of the first 78 batch-2 walks
      // read "partial" for want of this line).
      url = null;
      break;
    }
    url = dealerInspireNextUrl(res.body, res.finalUrl || url);
  }
  return { cards, requests, pages, status, complete: pages > 0 && !url };
}

/** Whole lot across both SRPs, candidate VDPs by browser. Raw JSON-LD nodes
 *  out; crawl.mjs classifies and normalizes. */
/** The homepage by browser: a Motive config when the rooftop is on Cars
 *  Commerce's Motive template, else null (classic theme, or unreadable). */
async function motiveConfigByBrowser(origin, fetch = browserFetch) {
  const home = await fetch(`${origin.replace(/\/$/, "")}/`);
  if (home.status === "browser_unavailable") return { unavailable: true };
  if (home.status !== 200 || !home.body || !isRideMotive(home.body)) return { config: null };
  return { config: rideMotiveConfig(home.body), requests: 1 };
}

/** The fast path's read order for one visit: the list rotated by a day
 *  stride, so a capped lot is covered across visits (see the header). `day`
 *  is injectable for the test. */
export const DEALERINSPIRE_ROTATE_STRIDE = 40;
export function dealerInspireRotate(cards, day = Math.floor(Date.now() / 86_400_000)) {
  const n = cards.length;
  if (n < 2) return cards;
  const k = ((day * DEALERINSPIRE_ROTATE_STRIDE) % n + n) % n;
  return [...cards.slice(k), ...cards.slice(0, k)];
}

export async function pullDealerInspire(origin, { srps = DEALERINSPIRE_SRPS, deadlineAt = 0, maxLoads = 0, fetch = browserFetch, day = undefined } = {}) {
  const limits = deadlineAt || maxLoads ? { deadlineAt, maxLoads } : null;
  const motive = await motiveConfigByBrowser(origin, fetch);
  if (motive.unavailable) return { ok: false, complete: false, found: 0, candidates: 0, vehicles: [], requests: 1, vdpFailures: 0, why: "browser_unavailable" };
  if (motive.config) {
    const r = await pullRideMotiveApi(motive.config, origin, { deadlineAt });
    return { ok: Boolean(r.ok), complete: Boolean(r.ok && r.complete), found: r.found ?? 0, vehicles: r.vehicles ?? [], requests: 1 + (r.requests ?? 0), vdpFailures: 0, template: "motive" };
  }
  const seen = new Set(); // every card, either walk
  const read = new Set(); // VDPs opened
  const vehicles = [];
  const notes = [];
  let requests = 1; // the homepage read above
  let stopped = false;
  let vdpFailures = 0;
  let candidates = 0;

  // One VDP per candidate, within the limits. Returns false when the browser
  // went away (the caller returns at once).
  const readVdps = async (cands) => {
    for (const c of cands) {
      if (read.has(c.vin)) continue;
      candidates++;
      if (!c.url) {
        vdpFailures++;
        continue;
      }
      if (dealerInspireLimitsExhausted(limits, requests)) {
        stopped = true;
        vdpFailures++;
        continue;
      }
      read.add(c.vin);
      let res = await fetch(c.url, VDP_LOAD);
      requests++;
      if (res.status === "browser_unavailable") return false;
      if (res.status !== 200 || !res.body) {
        await new Promise((r) => setTimeout(r, 4000));
        res = await fetch(c.url, VDP_LOAD);
        requests++;
      }
      const v = res.status === 200 && res.body ? dealerInspireVdpVehicle(res.body, c.vin) : null;
      if (!v) {
        vdpFailures++;
        continue;
      }
      vehicles.push(v);
    }
    return true;
  };
  const gone = () => ({ ok: false, complete: false, found: seen.size, candidates, vehicles, requests, vdpFailures, why: "browser_unavailable" });

  // 1. THE FAST PATH: each list filtered to the electrified fuel facet. The
  //    real results (blob-carrying cards) are candidates by the dealer's own
  //    field and are read first, in an order that rotates by day; the block
  //    cards the pages carried go through the net and are read after them.
  //    Under the full limits, not the walk's reserve: these loads ARE the cars.
  let fast = 0;
  const real = [];
  const block = new Map(); // by VIN: a block card is promoted when its real result turns up in the other list
  for (const path of srps) {
    const r = await readSrp(origin, path, { limits, loadsSoFar: requests, startUrl: dealerInspireFuelSrpUrl(origin, path), fetch });
    requests += r.requests;
    if (r.status === "browser_unavailable") return gone();
    if (r.exhausted) stopped = true;
    for (const c of r.cards) {
      if (c.result && block.has(c.vin)) {
        block.delete(c.vin);
        real.push(c);
        continue;
      }
      if (seen.has(c.vin)) continue;
      seen.add(c.vin);
      if (c.result) real.push(c);
      else if (dealerInspireIsCandidate(c)) block.set(c.vin, c);
    }
  }
  fast = real.length + block.size;
  if (!(await readVdps(dealerInspireRotate(real, day)))) return gone();
  if (!(await readVdps([...block.values()]))) return gone();

  // 2. THE WALK: both lists unfiltered under the half-budget reserve, the
  //    title/WMI/blob net, their VDPs. This is what completeness means; the
  //    fast path only made sure the cars came before the lot.
  let complete = true;
  let anySrp = false;
  const srpStatus = [];
  const srpLimits = fast ? limits : srpLoadLimits(limits);
  const unknownFuel = new Set();
  for (const path of srps) {
    const r = await readSrp(origin, path, { limits: srpLimits, loadsSoFar: requests, fetch });
    requests += r.requests;
    srpStatus.push(`${path} ${r.exhausted && r.status === null ? "not tried" : (r.status ?? "no response")}`);
    if (r.exhausted) stopped = true;
    if (r.status === "browser_unavailable") return gone();
    if (r.pages === 0) {
      // A rooftop with no /new-vehicles/ (independents on DI exist) is not a
      // failure; a rooftop with NO SRP at all is.
      continue;
    }
    anySrp = true;
    if (!r.complete) complete = false;
    const cands = [];
    for (const c of r.cards) {
      if (c.fuel && dealerInspireFuelIsEv(c.fuel) && !DEALERINSPIRE_EV_FUELTYPES.includes(c.fuel)) unknownFuel.add(c.fuel);
      if (seen.has(c.vin)) continue;
      seen.add(c.vin);
      if (dealerInspireIsCandidate(c)) cands.push(c);
    }
    if (!(await readVdps(cands))) return gone();
  }
  // NO SRP AT ALL, AND SAY WHICH. This return used to carry no `why`, so
  // crawl.mjs printed the bare "dealerinspire browser lane failed" — the shape
  // 26 rooftops came back as on 2026-09-06 — and the log could not distinguish
  // a firewall from a 404. Every one of the ten checked turned out to be a
  // path or a platform question rather than a wall (criswellauto.com and
  // hersonskia.com answer 404 on both paths from a laptop as well as from a
  // runner; crownbmw.com and temeculanissan.com have left the vendor). The
  // statuses are what says so. The fast path's filtered lists answer on the
  // same paths, so a rooftop with no SRP answers nothing there either.
  if (!anySrp && !fast)
    return { ok: false, complete: false, found: 0, candidates, vehicles, requests, vdpFailures: 0, why: `no SRP answered (${srpStatus.join(", ")})` };
  if (unknownFuel.size) notes.push(`fueltype spelling(s) not in the facet list: ${[...unknownFuel].join(", ")} — verify on a served page before adding`);
  return {
    ok: true,
    complete: complete && anySrp && vdpFailures === 0 && !stopped,
    found: seen.size,
    candidates,
    fast,
    vehicles,
    requests,
    vdpFailures,
    notes,
    ...(stopped ? { why: "stopped at the crawl's time cap or page budget" } : {}),
  };
}

/** For probe: the first used SRP page by browser. `found` is that page's
 *  card count (a floor, not the lot), hasVin is what the cards carry. */
export async function countDealerInspire(origin) {
  const motive = await motiveConfigByBrowser(origin);
  if (motive.unavailable) return { ok: false, found: 0, hasVin: false, why: "browser_unavailable" };
  if (motive.config) {
    const c = await countRideMotiveApi(motive.config);
    return { ...c, template: "motive" };
  }
  const res = await browserFetch(dealerInspireSrpUrl(origin, DEALERINSPIRE_SRPS[0]));
  if (res.status === "browser_unavailable") return { ok: false, found: 0, hasVin: false, why: "browser_unavailable" };
  if (res.status !== 200 || !res.body) return { ok: false, found: 0, hasVin: false, status: res.status };
  const cards = dealerInspireCards(res.body, res.finalUrl || origin);
  return { ok: true, found: cards.length, hasVin: cards.length > 0, candidates: cards.filter(dealerInspireIsCandidate).length };
}
