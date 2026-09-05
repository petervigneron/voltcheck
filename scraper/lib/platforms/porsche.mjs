// Porsche's own US dealer-website platform, read with a real browser.
//
// WHY IT NEEDS THE BROWSER
//
// Every request from lib/http.mjs's plain client — the homepage, the
// inventory search, the sitemap, robots.txt itself — comes back 429 with a
// "Vercel Security Checkpoint" page and these headers:
//
//   server: Vercel
//   x-vercel-mitigated: challenge
//   x-vercel-challenge-token: 2.1788579085.60.…
//
// That is Vercel Attack Challenge Mode: a JavaScript proof-of-work check
// served WITH a 429 status. It is not a rate limit, which is why probing
// these rooftops in series answered 429 exactly as readily as probing them in
// parallel, and why 77 of the registry's 106 http-429 rows resolve to a
// single Vercel deployment id (0c67b2dc443e4824.vercel-dns-013.com, measured
// 2026-09-05). Classified `transient`, they were re-probed nightly and
// re-failed nightly, for ever.
//
// Plain headless Chrome — lib/browser.mjs, nothing patched, no stealth, the
// same UA every request in this project already sends — loads them at 200.
// That is the tier-2 JS check of the 2026-09-02 taxonomy, the side of the
// owner's line that is in policy. Nothing here disguises the browser.
//
// ROBOTS
//
// robots.txt is behind the challenge too, so lib/http.mjs cannot read it and
// would treat it as "no rules". It is read HERE, through the browser, and
// honoured. What it actually says (bend.porsche.com, 2026-09-05) is one
// structural rule — `Disallow: */inventory/porsche/*/contact` — plus a long
// list of disallowed FILTER query parameters (drivetrain, priceMax,
// modelYearMin, orderBy, …). The two paths this lane uses, the bare search
// page and `?page=N`, are not among them; `page` is not a disallowed
// parameter and the contact rule is not a path this lane visits.
//
// WHY IT READS THE WHOLE LOT AND NOT THE EV FILTER
//
// The platform offers `?modelSeries=taycan`, `?modelSeries=macan&
// engineType=ELECTRIC` and the Cayenne/Panamera PLUG_IN_HYBRID equivalents,
// and robots allows all of them. This lane does not use them, for the reason
// the dealer.com and DealerOn API lanes do not use their fuel filters: a
// server-side fuel filter means the crawl never sees the whole lot, so it can
// certify nothing, and a car the filter drops for any reason reads as sold.
// A rooftop here is 45-150 cars at 15 a page — three to ten browser loads —
// so reading everything and classifying locally is affordable.
//
// THE NAMEPLATE TRAP, AND WHY THIS LANE DOES NOT TOUCH IT
//
// "2026 Porsche Macan" is a PETROL car. "2026 Porsche Macan 4 Electric" is
// not. Same nameplate, same rooftop, same page — the separator is
// `vehicleEngine.fuelType` (ELECTRIC / PLUG_IN_HYBRID / PETROL /
// MILD_HYBRID), and `model` is useless for it because Porsche publishes its
// internal platform code there: J1 = Taycan, H1 III = petrol Macan, H2 =
// electric Macan, E3 II = Cayenne, E4 = electric Cayenne.
//
// classifyEv already gets this right and is left to do it. Control-tested
// 2026-09-05 with fuelType removed: a bare "Macan" and a bare "Cayenne"
// classify FALSE (no name match), while "Taycan" and "Cayenne E-Hybrid"
// classify true on the name — which is correct, those nameplates are
// electrified in every configuration. So this lane repairs the node's
// identity fields and passes fuelType through untouched. It never decides
// electric-ness itself, and it must never synthesise a name that would.
import { browserFetch } from "../browser.mjs";
import { stabilizeImages } from "../images.mjs";

const SEARCH = "/en/inventory/porsche/search";
// The vehicle JSON-LD is server-rendered: measured on boston.porsche.com
// 2026-09-05, settleMs 0 and settleMs 6000 both return the same 15 Car nodes,
// at 2.4 s and 7.0 s a load. A second of grace is insurance against a slower
// rooftop, not a wait for scripts — at 82 rooftops and ~5 loads each, the six
// seconds this replaces was 40 minutes of a sweep spent watching a finished
// page.
const SETTLE_MS = 1000;
const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;
// 15 cars a page is what the platform serves; the cap is a runaway guard, not
// a budget — 30 pages is 450 cars, comfortably past the biggest rooftop
// measured (orlando.porsche.com, 232).
const MAX_PAGES = 30;

/** Every application/ld+json block on a page, parsed, unparseable ones dropped. */
function ldBlocks(html) {
  const out = [];
  for (const m of String(html ?? "").matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      out.push(JSON.parse(m[1]));
    } catch {}
  }
  return out;
}
const typesOf = (j) => [].concat(j?.["@type"] ?? []);

/**
 * Porsche's schema.org node, with the three fields it gets wrong repaired.
 * Returns null for anything without a real VIN — the same bar every other
 * lane uses.
 *
 * What is repaired, and nothing else:
 *   brand  — a bare @id reference to porsche.com, carrying no `name`, so
 *            normalize.mjs's `text(vehicle.brand ?? vehicle.manufacturer)`
 *            reads through it to nothing and every car came out make-less
 *            (measured on the first live run, 2026-09-05). Named here. It is
 *            a Porsche dealer platform; the marque is not in doubt.
 *   model  — the internal platform code ("H1 III"). `vehicleConfiguration` is
 *            Porsche's own configuration string ("Macan 4 Electric",
 *            "Cayenne Coupe Electric", "Taycan 4S Cross Turismo") and is what
 *            a shopper is looking at.
 *   itemCondition — a schema.org URL, which normalize.mjs reduces to
 *            "UsedCondition" and conditionToken then cannot read. Today the
 *            right answer still arrives, but only because the VDP slug
 *            happens to carry "-preowned-"/"-new-"; a slug change would take
 *            condition silently to undefined. The machine token is right
 *            here, so use it. Anything that is neither stays UNSET — never
 *            defaulted to used, which is the recorded bug this rule exists
 *            for (see ../condition.mjs).
 */
export function porscheNode(car, origin) {
  const vin = String(car?.vehicleIdentificationNumber ?? "").toUpperCase();
  if (!VIN_RE.test(vin)) return null;

  const cond = /schema\.org\/UsedCondition/i.test(String(car.itemCondition))
    ? "used"
    : /schema\.org\/NewCondition/i.test(String(car.itemCondition))
      ? "new"
      : undefined;

  const url = car.offers?.url || car["@id"]?.replace(/#car$/, "") || origin;
  const node = {
    ...car,
    "@type": "Car",
    // `brand`, not a bare `make` key: normalize.mjs reads the schema.org
    // shape, and a `make` field it does not look at is a field that does
    // nothing.
    brand: { "@type": "Brand", name: "Porsche" },
    model: car.vehicleConfiguration || undefined,
    itemCondition: cond,
    image: stabilizeImages([car.image].flat().filter((s) => typeof s === "string")),
    offers: { ...(car.offers ?? {}), url },
  };
  if (!node.model) delete node.model;
  if (!cond) delete node.itemCondition;
  return node;
}

/** The rooftop's total, from the page's own ItemList. */
function totalFrom(blocks) {
  const list = blocks.find((j) => typesOf(j).includes("ItemList"));
  const n = list?.numberOfItems;
  return Number.isFinite(n) ? n : null;
}

function carsFrom(blocks, origin) {
  return blocks.filter((j) => typesOf(j).includes("Car")).map((c) => porscheNode(c, origin)).filter(Boolean);
}

/**
 * Read a Porsche rooftop's whole lot.
 *
 *   { ok, complete, found, vehicles, requests, why? }
 *
 * `complete` is true only when every page the ItemList promised was read.
 * A short read — the deadline, the load cap, a page that would not load —
 * returns complete:false so crawl.mjs reports truncated and db-sync will not
 * delist behind it.
 */
export async function pullPorsche(origin, { deadlineAt = 0, maxLoads = 0 } = {}) {
  const out = new Map();
  let requests = 0;
  const budget = maxLoads > 0 ? Math.min(maxLoads, MAX_PAGES) : MAX_PAGES;

  const first = await browserFetch(`${origin}${SEARCH}`, { settleMs: SETTLE_MS });
  requests++;
  if (first.status === "browser_unavailable") return { ok: false, complete: false, found: 0, vehicles: [], requests, why: "browser_unavailable" };
  if (first.status === "robots_disallowed") return { ok: false, complete: false, found: 0, vehicles: [], requests, why: "robots_disallowed" };
  if (first.status !== 200 || !first.body) return { ok: false, complete: false, found: 0, vehicles: [], requests, why: `search ${first.status}` };

  // The rooftop answers on its own canonical host (porschebend.com redirects
  // to bend.porsche.com); page 2 onward must be built on where we LANDED, or
  // every one of them is a fresh redirect.
  let base = origin;
  try {
    base = new URL(first.finalUrl).origin;
  } catch {}

  const firstBlocks = ldBlocks(first.body);
  for (const v of carsFrom(firstBlocks, base)) out.set(v.vehicleIdentificationNumber, v);
  const total = totalFrom(firstBlocks);
  const perPage = out.size;
  if (!perPage) return { ok: false, complete: false, found: total ?? 0, vehicles: [], requests, why: "no Car nodes on the search page" };

  const pages = total ? Math.ceil(total / perPage) : 1;
  let complete = true;
  if (pages > budget) complete = false;

  for (let page = 2; page <= Math.min(pages, budget); page++) {
    if (deadlineAt && Date.now() > deadlineAt) {
      complete = false;
      break;
    }
    const r = await browserFetch(`${base}${SEARCH}?page=${page}`, { settleMs: SETTLE_MS });
    requests++;
    if (r.status !== 200 || !r.body) {
      complete = false;
      break;
    }
    const cars = carsFrom(ldBlocks(r.body), base);
    if (!cars.length) {
      complete = false;
      break;
    }
    for (const v of cars) out.set(v.vehicleIdentificationNumber, v);
  }

  // The ItemList said how many there are; anything less is a short read, and a
  // short read must not certify a lot.
  if (total && out.size < total) complete = false;
  return { ok: true, complete, found: total ?? out.size, vehicles: [...out.values()], requests };
}

/**
 * Is this origin on the Porsche platform? Answered from the page, not DNS,
 * because a rooftop may sit on either its vanity domain or its
 * <city>.porsche.com canonical and both land on the same app. crawl.mjs
 * reaches this lane by the registry's platform field; this is for probe.mjs
 * and for tests.
 */
export function isPorschePlatform(html) {
  const s = String(html ?? "");
  return /\/en\/inventory\/porsche\/search/.test(s) && /porsche\.com/.test(s);
}

/**
 * probe.mjs's cheap check: one browser load, does this rooftop serve VIN'd
 * inventory? Same shape as countDealerInspire.
 *
 * `origin` may arrive as `https://www.<domain>` (probe builds it that way for
 * every vendor) and half this fleet's registry rows are already subdomains —
 * barrington.porsche.com, cary.porsche.com — where a `www.` prefix resolves to
 * nothing. So a failed load falls back to the bare host once, rather than
 * writing off a live rooftop over a hostname the probe guessed.
 */
export async function countPorsche(origin) {
  const tries = [origin];
  try {
    const u = new URL(origin);
    if (u.hostname.startsWith("www.")) tries.push(`${u.protocol}//${u.hostname.slice(4)}`);
  } catch {}
  let last = null;
  for (const o of tries) {
    const r = await pullPorsche(o, { maxLoads: 1 });
    if (r.why === "browser_unavailable") return { ok: false, found: 0, hasVin: false, why: "browser_unavailable" };
    if (r.ok && r.vehicles.length) return { ok: true, found: r.found, hasVin: true };
    last = r;
  }
  return { ok: false, found: last?.found ?? 0, hasVin: false, why: last?.why };
}
