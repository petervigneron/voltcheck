#!/usr/bin/env node
// Turn Motive's national inventory index into registry dealers.
//
//   node motive-dealers.mjs --stage index     # enumerate every dealership
//   node motive-dealers.mjs --stage harvest   # id → public domain, from the
//                                             # platform's own published records
//   node motive-dealers.mjs --stage sniff     # what dealers print about
//                                             # themselves in their own copy
//   node motive-dealers.mjs --stage resolve   # name → domain for what harvest missed
//   node motive-dealers.mjs --stage osm       # OSM shop=car domains as candidates
//   node motive-dealers.mjs --stage groups    # who reaches the rooftops with no site
//   node motive-dealers.mjs --stage cover     # what a crawled group already pulls
//   node motive-dealers.mjs --stage vins      # the EV ledger, counted in VINs
//   node motive-dealers.mjs --stage emit      # → out/motive-new-sites.json
//
// harvest ⇄ resolve is a loop, not a pipeline: every domain resolve lands on
// publishes its whole group, so a second harvest walks the groups the first
// one could not reach.
//
// WHY THIS EXISTS. ridemotive.mjs crawls a Motive rooftop by filtering the
// platform's national Algolia index on the dealer id that rooftop publishes
// about itself. The index holds ~322,000 active vehicles across >1,000
// dealerships and the registry knows 15 of them, so the coverage sitting
// behind a dealer-id → public-domain mapping is most of a platform. The
// platform's own /dealers/{id} endpoint answers 401 to our declared identity
// (measured 2026-08-23), so that mapping had to come from somewhere else.
//
// It came from the dealers themselves. Every Motive page ships its
// store-switcher inline, and that data is the full dealer record — id, name,
// domain, street, city, state, zip, phone (see lib/platforms/ridemotive-
// dealers.mjs). One fetch of kunesbuickgmc.com publishes 40 sibling rooftops
// with addresses. So the mapping is harvested by walking the dealer graph the
// platform publishes, not guessed: a crawl of ONE page per domain, breadth
// first, seeded from the rooftops the registry already has.
//
// WHAT WAS REJECTED. The obvious route was the one the discovery lane already
// owns: hand the dealership NAMES to resolve-dealers.mjs, which guesses domains
// from a name and verifies with lib/dealer-identity.mjs's zip-gated rules. It
// cannot work here as-is, and the reason is worth writing down: the Algolia
// records carry `dealership` (a name) and `dealer_id` and NO location at all —
// no city, no state, no zip, no phone (checked against the index's full facet
// list and a record's 200 keys). identityRule() needs the roll's own zip, city
// or phone printed on the page; with none of them it can never clear, and the
// only rule a name alone could support is name-only matching, which is exactly
// the rule that put a Manhattan apparel maker under a Marysville WA dealer.
// So the resolve stage below still generates candidates from the name — that
// machinery is good and is reused — but the GATE is not a name match at all:
// it is the dealer id. A candidate domain is accepted only when the page
// itself publishes the dealer record for the id we are resolving. That is the
// platform's own primary key asserted by the site that serves it, which is a
// strictly stronger claim than name+zip, and it needs no location to work.
//
// This script never emits a vehicle. It counts them, per dealer, so a
// discovered row can say how much coverage it is worth.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { Resolver } from "node:dns/promises";
import { fetchPage, politePostJson, CRAWLER_DECLARATION } from "./lib/http.mjs";
import { rideMotiveConfig } from "./lib/platforms/ridemotive.mjs";
import { motiveDealerRecords, isPublicDealerDomain, apex } from "./lib/platforms/ridemotive-dealers.mjs";
import { candidates, squash } from "./lib/dealer-names.mjs";

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const num = (n, d) => { const v = flag(n, null); return v == null ? d : Number(v); };
const STAGE = flag("--stage", "emit");
const CONC = num("--concurrency", 12);
const BUDGET = num("--budget", 4000);
const OUT = new URL("./out/", import.meta.url);
const path = (f) => new URL(f, OUT);
await mkdir(OUT, { recursive: true });

const readJson = async (f, fallback = null) => {
  try { return JSON.parse(await readFile(path(f), "utf-8")); } catch { return fallback; }
};
const writeJson = (f, v) => writeFile(path(f), JSON.stringify(v, null, 2));
const today = new Date().toISOString().slice(0, 10);

// ── the platform's Algolia client config, read off a rooftop that publishes it
// Never hard-coded: the key is the site's own public search key and the lane
// takes it the same way ridemotive.mjs does, from a page that ships it.
const registry = JSON.parse(await readFile(new URL("./registry/registry.json", import.meta.url), "utf-8"));
const knownDomains = new Set(registry.sites.map((s) => apex(s.domain)));
const knownWorking = new Set(registry.sites.filter((s) => s.status === "working").map((s) => apex(s.domain)));
const seedDomains = registry.sites.filter((s) => s.platform === "ridemotive").map((s) => apex(s.domain));

let REQUESTS = 0;

// ── the answer that looks like an empty page and is not ─────────────────────
// Motive's edge intermittently answers a reCAPTCHA interstitial — HTTP 200,
// ~20 KB, `<title>Checking your browser - reCAPTCHA</title>` — in place of the
// page. It carries no dealer record and no Algolia config, so to every check
// in this lane it was indistinguishable from a rooftop that publishes nothing,
// and it was recorded as one. That is how a dealership joins the "never
// reached" pile without anyone deciding it should: measured 2026-08-24, 83% of
// the first harvest's fetches at concurrency 10 and 29% at concurrency 2 were
// this page, including 193 of the 231 Motive rooftops the registry ALREADY
// crawls — sites we know publish their records, so those 193 are a control:
// the empty answer was ours, not theirs.
//
// It is not a policy statement and it is not path-specific: the same URL, same
// declared identity, seconds apart, answers the full page (gregoryinfiniti.com
// / → challenge, then 810 KB with 7 records twice; subaruoftwinfalls.com
// /privacy-policy → challenge while its own homepage answered). It tracks our
// aggregate rate against the platform, which is one origin behind hundreds of
// hostnames, so the per-host rate limit in http.mjs never sees it.
//
// The response is to slow down and ask again, with the same identity and the
// same URL — not to work around anything: no proxy, no UA change, no attempt
// to answer the challenge, and a hard cap of two retries. A domain still
// challenged after those is recorded as `challenge`, which is an honest
// negative the next run can re-queue, rather than a silent "publishes
// nothing".
const CHALLENGE_RE = /recaptcha\/challengepage|Checking your browser - reCAPTCHA/i;
const isChallenge = (body) => typeof body === "string" && body.length < 200000 && CHALLENGE_RE.test(body);
const CHALLENGE_BACKOFF_MS = [3000, 8000];

async function fetchMotive(url) {
  for (let attempt = 0; ; attempt++) {
    let res;
    try { res = await fetchPage(url); } catch (e) { res = { status: `error:${e.name}`, body: null }; }
    REQUESTS++;
    if (!isChallenge(res.body)) return res;
    if (attempt >= CHALLENGE_BACKOFF_MS.length) return { ...res, status: "challenge", body: null };
    await new Promise((r) => setTimeout(r, CHALLENGE_BACKOFF_MS[attempt]));
  }
}

async function algoliaConfig() {
  const cached = await readJson("motive-config.json");
  if (cached?.appId) return cached;
  for (const dom of seedDomains) {
    const res = await fetchPage(`https://${dom}/`);
    REQUESTS++;
    const cfg = rideMotiveConfig(res.body ?? "");
    if (cfg) { await writeJson("motive-config.json", cfg); return cfg; }
  }
  throw new Error("no registry ridemotive rooftop published an Algolia config");
}

// ── stage: index ────────────────────────────────────────────────────────────
// Enumerate every dealership in the index EXACTLY, with its inventory counts.
//
// Faceting cannot do this and the failure is silent: `facets:["dealer_id"]`
// caps at 1,000 values and answers `exhaustiveFacetsCount:false`, and on the
// EV slice its facet counts summed to 11,163 against an nbHits of 9,238 —
// Algolia is approximating both numbers, so neither the dealer list nor any
// per-dealer count taken that way can be trusted or even checked. The search
// key's ACL is ["search","browse"], so the browse endpoint pages the whole
// filtered set with a cursor and no 1,000-hit ceiling. Completeness is then
// not an argument: the walk ends when the platform stops handing back a
// cursor, and the row count it returned is the count.
const EV_STATED = /^(battery\s+)?electric(\s+(fuel\s+system|vehicle|motor))?$|^ev$|^bev$/i;
const PLUGIN = /plug.?in|phev/i;

async function stageIndex(cfg) {
  const url =
    `https://${cfg.appId.toLowerCase()}-dsn.algolia.net/1/indexes/${encodeURIComponent(cfg.index)}/browse` +
    `?x-algolia-api-key=${encodeURIComponent(cfg.apiKey)}&x-algolia-application-id=${encodeURIComponent(cfg.appId)}`;
  const dealers = new Map();
  let cursor = null, pages = 0, rows = 0;
  for (;;) {
    const body = {
      query: "",
      filters: "is_active:true",
      hitsPerPage: 1000,
      attributesToRetrieve: ["dealer_id", "dealership", "standardized_fuel_type", "fuel_type"],
      ...(cursor ? { cursor } : {}),
    };
    const { status, json } = await politePostJson(url, { body });
    REQUESTS++;
    if (status !== 200 || !json || !Array.isArray(json.hits)) {
      throw new Error(`browse failed at page ${pages}: ${status} ${json?.message ?? ""}`);
    }
    for (const h of json.hits) {
      const id = Number(h.dealer_id);
      if (!Number.isFinite(id) || id <= 0) continue;
      let d = dealers.get(id);
      if (!d) dealers.set(id, (d = { id, names: {}, total: 0, ev: 0, evStated: 0, plugin: 0 }));
      d.total++;
      if (h.dealership) d.names[h.dealership] = (d.names[h.dealership] ?? 0) + 1;
      if (h.standardized_fuel_type === "Electric") d.ev++;
      const ft = String(h.fuel_type ?? "").trim();
      if (EV_STATED.test(ft)) d.evStated++;
      if (PLUGIN.test(ft)) d.plugin++;
      rows++;
    }
    pages++;
    cursor = json.cursor ?? null;
    if (pages % 25 === 0) console.error(`  browse page ${pages}, ${rows} rows, ${dealers.size} dealers`);
    if (!cursor) break;
  }
  const list = [...dealers.values()]
    .map((d) => ({
      id: d.id,
      name: Object.entries(d.names).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "",
      names: Object.keys(d.names).length,
      total: d.total,
      ev: d.ev,
      evStated: d.evStated,
      plugin: d.plugin,
    }))
    .sort((a, b) => b.ev - a.ev || b.total - a.total);
  const out = {
    measured: today,
    index: cfg.index,
    pages,
    rows,
    dealers: list.length,
    withEv: list.filter((d) => d.ev > 0).length,
    evRows: list.reduce((a, d) => a + d.ev, 0),
    pluginRows: list.reduce((a, d) => a + d.plugin, 0),
    list,
  };
  await writeJson("motive-index.json", out);
  console.error(
    `index: ${out.rows} active vehicles, ${out.dealers} dealerships, ${out.withEv} with EVs, ${out.evRows} EV rows, ${out.pluginRows} plug-in-stated rows (${pages} browse pages)`,
  );
}

// ── stage: harvest ──────────────────────────────────────────────────────────
// Breadth-first over the dealer graph the platform publishes. One fetch per
// domain; every fetch both VERIFIES that domain (the page asserts the dealer
// id it serves) and expands the frontier (the page publishes its siblings).
async function stageHarvest() {
  const idx = await readJson("motive-index.json");
  if (!idx) throw new Error("run --stage index first");
  const evRank = new Map(idx.list.map((d) => [d.id, d.ev]));

  const state = (await readJson("motive-domains.json")) ?? { fetched: {}, records: {} };
  const records = new Map(Object.entries(state.records).map(([k, v]) => [Number(k), v]));
  const fetched = new Map(Object.entries(state.fetched));
  // EVERY domain that published a record for this id, not just the winning
  // one. A dealer with no public domain of its own still reaches shoppers if
  // one of its siblings' public sites lists its cars, and the only way to know
  // which sites those could be is to keep the whole publisher set: `records`
  // holds one `via` and overwrites it whenever a better record arrives.
  const publishers = new Map(Object.entries(state.publishers ?? {}).map(([k, v]) => [Number(k), new Set(v)]));
  const publish = (id, domain) => {
    if (!publishers.has(id)) publishers.set(id, new Set());
    publishers.get(id).add(domain);
  };

  // --refetch: try again on the domains that answered but published nothing,
  // and on the ones that never answered at all. This is not optimism — it is
  // that a page fetched while a wide resolve pass was in flight can come back
  // truncated or not at all, and a domain recorded once as "0 records" is
  // never re-queued, so a whole group can be lost to one bad minute. Re-run it
  // at low concurrency with nothing else running.
  if (args.includes("--refetch")) {
    // Only domains the platform itself named as some dealer's website: a
    // guessed candidate that answered nothing is just a wrong guess, and
    // re-fetching those would spend the budget on other people's servers for
    // no reason.
    const published = new Set([...records.values()].map((r) => apex(r.domain)));
    let dropped = 0;
    for (const [dom, f] of fetched) {
      // A domain the platform's edge challenged is re-queued whatever named
      // it: the challenge says nothing about whether the domain is a dealer's,
      // so leaving it in `fetched` retires a question that was never asked.
      if (f.status === "challenge" || (f.records === 0 && published.has(dom))) { fetched.delete(dom); dropped++; }
    }
    console.error(`harvest: re-queueing ${dropped} published dealer domains that answered with no dealer record`);
  }

  const queue = new Map(); // domain -> priority (EV count of the dealer it belongs to)
  const enqueue = (domain, prio) => {
    const d = apex(domain);
    if (!isPublicDealerDomain(d) || fetched.has(d)) return;
    queue.set(d, Math.max(queue.get(d) ?? 0, prio));
  };
  for (const d of seedDomains) enqueue(d, 1e9);
  for (const r of records.values()) enqueue(r.domain, evRank.get(r.id) ?? 0);

  let done = 0;
  while (queue.size && done < BUDGET) {
    const batch = [...queue.entries()].sort((a, b) => b[1] - a[1]).slice(0, Math.max(CONC * 4, 40));
    for (const [d] of batch) queue.delete(d);
    let next = 0;
    await Promise.all(
      Array.from({ length: CONC }, async () => {
        while (next < batch.length) {
          const [domain] = batch[next++];
          const res = await fetchMotive(`https://${domain}/`);
          done++;
          const recs = res.status === 200 && res.body ? motiveDealerRecords(res.body) : new Map();
          const cfg = res.status === 200 && res.body ? rideMotiveConfig(res.body) : null;
          fetched.set(domain, {
            status: String(res.status),
            selfId: cfg?.dealerId ?? null,
            records: recs.size,
            date: today,
          });
          for (const [id, rec] of recs) {
            const prev = records.get(id);
            // A record is upgraded when it names a public domain and the one
            // we held did not, or when it carries an address the old one
            // lacked. `self` marks the record a site published about ITSELF —
            // the site asserting its own dealer id, which is the strongest
            // form of the mapping and the one the emit stage prefers.
            const self = cfg?.dealerId === id;
            const better =
              !prev ||
              (isPublicDealerDomain(rec.domain) && !isPublicDealerDomain(prev.domain)) ||
              (self && !prev.self) ||
              (!prev.zip && rec.zip);
            if (better) records.set(id, { ...rec, self: self || Boolean(prev?.self), via: domain });
            publish(id, domain);
            enqueue(rec.domain, evRank.get(id) ?? 0);
          }
        }
      }),
    );
    console.error(
      `  harvest: ${done} domains fetched, ${records.size} dealer records, ${queue.size} queued`,
    );
    await writeJson("motive-domains.json", {
      fetched: Object.fromEntries(fetched),
      records: Object.fromEntries(records),
      publishers: Object.fromEntries([...publishers].map(([k, v]) => [k, [...v]])),
    });
  }
  const pub = [...records.values()].filter((r) => isPublicDealerDomain(r.domain));
  const withInv = pub.filter((r) => evRank.has(r.id));
  console.error(
    `harvest: fetched ${fetched.size} domains → ${records.size} dealer records, ${pub.length} with a public domain, ${withInv.length} of them holding live inventory`,
  );
}

// ── stage: sniff ────────────────────────────────────────────────────────────
// What the dealers say about themselves inside their own vehicle copy.
//
// The index carries no dealer address and no dealer domain — but `description`
// is the dealer's own boilerplate, and dealers put their website, their phone
// and their street address in it ("CALL NOW FOR YOU VIP APPOINTMENT
// 513-682-2500", "www.smpchev.ca"). A host taken from there is not a guess: it
// is a URL the dealer published. A city taken from there is not used as
// evidence of anything — it only widens candidate generation, which the id
// gate then accepts or rejects on its own terms.
const HOST_RE = /(?:https?:\/\/|www\.)([a-z0-9-]+(?:\.[a-z0-9-]+)+)/gi;
const PHONE_RE = /\(?\b(\d{3})\)?[-.\s]?(\d{3})[-.\s]?(\d{4})\b/g;
const CITY_STATE_RE =
  /([A-Z][a-zA-Z.'\- ]{2,24}),\s*(A[LKZR]|C[AOT]|D[EC]|FL|GA|HI|I[ADLN]|K[SY]|LA|M[ADEINOST]|N[CDEHJMVY]|O[HKR]|PA|RI|S[CD]|T[NX]|UT|V[AT]|W[AIVY])\b[,\s]*(\d{5})?/g;
// Hosts that turn up in dealer copy and are nobody's dealership: vendors,
// social networks, and the regulators dealers are required to link
// (p65warnings.ca.gov appears in the boilerplate of every California store).
// The id gate would reject them anyway — this only stops us spending a fetch
// on them, and it is the reason a noisy sniff is safe: a dealer that pasted a
// rival's boilerplate hands us the rival's domain, which fails the gate.
const NOT_A_DEALER =
  /(ridemotive|motivehq|carfax|kbb|edmunds|autotrader|cars\.com|facebook|instagram|youtube|twitter|linkedin|tiktok|google|bing|apple|android|schema\.org|w3\.org|flickfusion|spincar|impel|dealer(?:socket|inspire|on|track)|cdn|googleapis|gstatic|wistia|vimeo|youtu\.be|p65warnings|ca\.gov|\.gov$|nhtsa|safercar|fueleconomy|iihs|jdpower|nadaguides|ally\.com|creditbureauconnection)/i;

async function stageSniff(cfg) {
  const idx = await readJson("motive-index.json");
  const state = (await readJson("motive-domains.json")) ?? { records: {} };
  const records = new Map(Object.entries(state.records).map(([k, v]) => [Number(k), v]));
  const targets = idx.list
    .filter((d) => {
      const r = records.get(d.id);
      return !r || !isPublicDealerDomain(r.domain);
    })
    .sort((a, b) => b.ev - a.ev);
  const out = (await readJson("motive-sniff.json")) ?? {};
  const want = targets.filter((d) => !(d.id in out));
  console.error(`sniff: ${targets.length} unmapped dealerships, ${want.length} not yet sniffed`);
  const url =
    `https://${cfg.appId.toLowerCase()}-dsn.algolia.net/1/indexes/*/queries` +
    `?x-algolia-api-key=${encodeURIComponent(cfg.apiKey)}&x-algolia-application-id=${encodeURIComponent(cfg.appId)}`;
  for (let i = 0; i < want.length; i += 12) {
    const batch = want.slice(i, i + 12);
    const { status, json } = await politePostJson(url, {
      body: {
        requests: batch.map((d) => ({
          indexName: cfg.index,
          query: "",
          filters: `is_active:true AND dealer_id:${Number(d.id)}`,
          hitsPerPage: 8,
          attributesToRetrieve: ["description"],
        })),
      },
    });
    REQUESTS++;
    if (status !== 200 || !Array.isArray(json?.results)) { console.error(`  sniff: batch ${i} → ${status}`); continue; }
    batch.forEach((d, k) => {
      const text = (json.results[k]?.hits ?? []).map((h) => String(h.description ?? "")).join("\n");
      const hosts = new Set(), phones = new Set(), places = [];
      for (const m of text.matchAll(HOST_RE)) {
        const h = apex(m[1]);
        if (isPublicDealerDomain(h) && !NOT_A_DEALER.test(h)) hosts.add(h);
      }
      for (const m of text.matchAll(PHONE_RE)) phones.add(m[1] + m[2] + m[3]);
      for (const m of text.matchAll(CITY_STATE_RE)) places.push({ city: m[1].trim(), state: m[2], zip: m[3] ?? "" });
      out[d.id] = { hosts: [...hosts].slice(0, 6), phones: [...phones].slice(0, 4), places: places.slice(0, 4) };
    });
    if ((i / 12) % 10 === 0) console.error(`  sniff: ${Math.min(i + 12, want.length)}/${want.length}`);
    if ((i / 12) % 25 === 0) await writeJson("motive-sniff.json", out);
  }
  await writeJson("motive-sniff.json", out);
  const vals = Object.values(out);
  console.error(
    `sniff: ${vals.length} dealerships — ${vals.filter((v) => v.hosts.length).length} published a website in their own copy, ` +
      `${vals.filter((v) => v.places.length).length} a city+state, ${vals.filter((v) => v.phones.length).length} a phone`,
  );
}

// ── stage: osm ──────────────────────────────────────────────────────────────
// A candidate source that owes NOTHING to the Motive graph.
//
// The dealerships the harvest never reached are unreachable by construction:
// no sibling site published a record for them, so walking the graph harder
// cannot find them, and the index gives only a name. resolve generates domains
// by permuting that name, which is a good generator and still a generator —
// it measures 69% recall from a name alone. OpenStreetMap's `shop=car` nodes
// carry a `website` tag written by a human who stood in front of the store,
// plus a `name`, usually an address and often a `phone`. That is a national
// list of real dealer domains keyed on the same thing the index gives us.
//
// It is a CANDIDATE source and nothing else. A name match here never makes a
// row: the domains it produces go through the same id gate resolve uses — the
// page must publish the Motive dealer record for the id being resolved — and a
// name that matches the wrong store costs one fetch and produces nothing. The
// phone match is stronger evidence than the name (the number in the dealer's
// own vehicle copy against the number on the OSM node), so it ranks first, but
// it is not treated as proof either: the gate is the gate.
//
// Pulled per state rather than as one national query: `[shop=car][website]`
// over the whole US times out on every mirror, and a per-state area query is
// both reliable and resumable. ODbL — the registry already carries the
// attribution discover.mjs added.
const OVERPASS_MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA",
  "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM",
  "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA",
  "WV", "WI", "WY",
];

async function overpassState(code) {
  const query =
    `[out:json][timeout:180];area["ISO3166-2"="US-${code}"][admin_level=4];` +
    `nwr[shop=car]["website"](area);out tags;`;
  for (const endpoint of OVERPASS_MIRRORS) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            // Overpass answers 406 to a request with no user-agent, and this
            // lane declares itself everywhere else, so it declares itself here.
            "user-agent": CRAWLER_DECLARATION,
            accept: "application/json",
          },
          body: "data=" + encodeURIComponent(query),
        });
        REQUESTS++;
        const text = await res.text();
        if (res.status === 200 && text.trimStart().startsWith("{")) {
          const parsed = JSON.parse(text);
          // Zero elements from a US state is the signature of a regional or
          // degraded mirror, not a state with no car dealers (discover.mjs
          // learned this from overpass.osm.ch). Try the next mirror.
          if (parsed.elements?.length) return parsed.elements;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 15000 * 2 ** attempt));
    }
  }
  return null;
}

async function osmPull() {
  const cached = await readJson("motive-osm.json");
  const out = cached ?? { measured: today, states: {}, nodes: [] };
  const byState = new Map(Object.entries(out.states));
  const nodes = out.nodes;
  const todo = US_STATES.filter((s) => !byState.has(s));
  if (!todo.length) return out;
  console.error(`osm: pulling ${todo.length} states from Overpass`);
  for (const code of todo) {
    const els = await overpassState(code);
    if (els == null) { console.error(`  osm: ${code} — every mirror refused, will retry on the next run`); continue; }
    let kept = 0;
    for (const el of els) {
      const t = el.tags ?? {};
      const site = t.website ?? t["contact:website"];
      if (!site || !t.name) continue;
      const domain = apex(String(site).replace(/^https?:\/\//i, "").split(/[/?#]/)[0]);
      if (!isPublicDealerDomain(domain) || NOT_A_DEALER.test(domain)) continue;
      nodes.push({
        domain,
        name: String(t.name),
        brand: t.brand ? String(t.brand) : "",
        city: t["addr:city"] ? String(t["addr:city"]) : "",
        state: code,
        phone: String(t.phone ?? t["contact:phone"] ?? "").replace(/\D/g, "").slice(-10),
      });
      kept++;
    }
    byState.set(code, kept);
    out.states = Object.fromEntries(byState);
    out.nodes = nodes;
    await writeJson("motive-osm.json", out);
    console.error(`  osm: ${code} → ${kept} dealers with a website (${nodes.length} so far)`);
  }
  return out;
}

// Token overlap, not string equality: OSM writes "Buena Park Honda" where the
// index writes "Buena Park Honda Inc", and either may carry the brand as a
// separate tag. Two shared significant tokens is the floor — one is how
// "Toyota" matches every Toyota store in the country.
const NAME_STOP = new Set([
  "the", "of", "and", "inc", "llc", "ltd", "co", "company", "corp", "auto", "autos", "automotive",
  "motor", "motors", "car", "cars", "sales", "sale", "group", "dealer", "dealership", "center",
  "centre", "superstore", "outlet", "dealership website", "used", "new", "preowned", "pre",
  "owned", "certified", "inventory",
]);
const nameTokens = (s) => new Set(squash(s).split(" ").filter((w) => w && !NAME_STOP.has(w)));
function namesMatch(a, b) {
  if (!a.size || !b.size) return false;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  if (shared < 2) return false;
  const union = new Set([...a, ...b]).size;
  return shared === a.size || shared === b.size || shared / union >= 0.5;
}

async function stageOsm() {
  // The pull first, and on its own with `--pull`: it is 51 sequential
  // Overpass queries against a public mirror and it touches none of this
  // lane's state, so it can run while a harvest is still writing that state.
  const osm = await osmPull();
  if (args.includes("--pull")) {
    console.error(`osm: ${osm.nodes.length} US dealer nodes with a website, ${Object.keys(osm.states).length}/51 states`);
    return;
  }
  const idx = await readJson("motive-index.json");
  const state = await readJson("motive-domains.json");
  if (!idx || !state) throw new Error("run --stage index and --stage harvest first");
  const records = new Map(Object.entries(state.records).map(([k, v]) => [Number(k), v]));
  const fetched = new Map(Object.entries(state.fetched));
  const sniff = (await readJson("motive-sniff.json")) ?? {};

  // Only the dealerships nothing has mapped yet: an id whose record already
  // names a public domain is done, and a domain already fetched is already
  // answered.
  const missing = idx.list.filter((d) => {
    const r = records.get(d.id);
    return !r || !isPublicDealerDomain(r.domain);
  });

  const byPhone = new Map();
  const nodesByToken = new Map();
  for (const n of osm.nodes) {
    if (n.phone.length === 10) {
      if (!byPhone.has(n.phone)) byPhone.set(n.phone, []);
      byPhone.get(n.phone).push(n);
    }
    n.tokens = nameTokens(`${n.name} ${n.brand}`);
    for (const t of n.tokens) {
      if (!nodesByToken.has(t)) nodesByToken.set(t, []);
      nodesByToken.get(t).push(n);
    }
  }

  // Registry domains are KEPT as candidates, and that is the opposite of what
  // the resolve stage does with a guessed name. Measured 2026-08-24: 5,353 of
  // the 5,447 OSM dealer domains are already registry rows, so filtering them
  // out would have thrown away almost the whole source. And a registry row is
  // not the same as reached: the harvest seeds only from rows labelled
  // `platform: ridemotive`, so a Motive rooftop sitting in the registry under
  // another platform label — or under `discovered` / `needs-investigation`,
  // which the nightly does not crawl — is invisible to this lane and its cars
  // are not ours. Putting those domains through the id gate is what tells the
  // two apart, and it costs one fetch each.
  const cands = {}; // domain -> { ids: [], how: "phone" | "name", inRegistry }
  const add = (dom, id, how) => {
    const d = apex(dom);
    if (!isPublicDealerDomain(d) || NOT_A_DEALER.test(d)) return;
    if (fetched.has(d)) return;
    if (!cands[d]) cands[d] = { ids: [], how, inRegistry: knownDomains.has(d) };
    if (!cands[d].ids.includes(id)) cands[d].ids.push(id);
    if (how === "phone") cands[d].how = "phone";
  };
  let phoneHits = 0, nameHits = 0;
  for (const d of missing) {
    const tok = nameTokens(d.name);
    const seen = new Set();
    for (const p of sniff[d.id]?.phones ?? []) {
      for (const n of byPhone.get(p) ?? []) { add(n.domain, d.id, "phone"); seen.add(n.domain); phoneHits++; }
    }
    const pool = new Map();
    for (const t of tok) for (const n of nodesByToken.get(t) ?? []) pool.set(n, true);
    for (const n of pool.keys()) {
      if (seen.has(n.domain)) continue;
      if (!namesMatch(tok, n.tokens)) continue;
      add(n.domain, d.id, "name");
      nameHits++;
    }
  }
  // The registry's own 21,000 named rows, matched the same way. This is the
  // same idea as the OSM pull and a bigger corpus: rows the discovery lanes
  // already wrote from license rolls and metro sweeps, most of which nobody
  // has ever identified as Motive — a Motive rooftop renders no inventory in
  // HTML, so a static probe scores it "0 VIN vehicles" and it lands in
  // needs-investigation looking like a dead site. Fourteen of them sat there
  // until this platform was understood. Matching by name and asking the site
  // for its dealer id is how the rest are found, and a row that turns out to
  // be Motive is worth more than a new one: the domain is already known, so
  // the only thing standing between its cars and the feed is its status.
  const REG_NAME_CAP = 3;
  const regByToken = new Map();
  for (const s of registry.sites) {
    const dom = apex(s.domain);
    if (!s.name || !isPublicDealerDomain(dom) || fetched.has(dom)) continue;
    const tokens = nameTokens(s.name);
    if (tokens.size < 2) continue; // a bare brand name matches the whole country
    s._tokens = tokens;
    for (const t of tokens) {
      if (!regByToken.has(t)) regByToken.set(t, []);
      regByToken.get(t).push(s);
    }
  }
  let regHits = 0;
  for (const d of missing) {
    const tok = nameTokens(d.name);
    const pool = new Set();
    for (const t of tok) for (const s of regByToken.get(t) ?? []) pool.add(s);
    let taken = 0;
    for (const s of pool) {
      if (taken >= REG_NAME_CAP) break;
      if (!namesMatch(tok, s._tokens)) continue;
      add(s.domain, d.id, "registry");
      taken++;
      regHits++;
    }
  }
  await writeJson("motive-osm-candidates.json", cands);
  const inReg = Object.values(cands).filter((c) => c.inRegistry).length;
  console.error(
    `osm: ${osm.nodes.length} US dealer nodes with a website; ${missing.length} unmapped dealerships ` +
      `(${missing.filter((d) => d.ev > 0).length} with EVs) → ${Object.keys(cands).length} candidate domains ` +
      `(${phoneHits} phone matches, ${nameHits} OSM name matches, ${regHits} registry name matches; ` +
      `${inReg} of the domains are already registry rows) to put through the id gate`,
  );
}

// ── stage: resolve ──────────────────────────────────────────────────────────
// The dealers harvest never reached: no sibling published them. Guess domains
// from the name with lib/dealer-names.mjs (the license-roll generator), DNS
// them, and accept ONLY a page that publishes the dealer record for the id
// being resolved. A wrong guess costs a fetch and can never produce a row.
async function stageResolve() {
  const idx = await readJson("motive-index.json");
  const state = await readJson("motive-domains.json");
  if (!idx || !state) throw new Error("run --stage index and --stage harvest first");
  const records = new Map(Object.entries(state.records).map(([k, v]) => [Number(k), v]));
  const fetched = new Map(Object.entries(state.fetched));
  const publishers = new Map(Object.entries(state.publishers ?? {}).map(([k, v]) => [Number(k), new Set(v)]));

  const missing = idx.list.filter((d) => {
    const r = records.get(d.id);
    return !r || !isPublicDealerDomain(r.domain);
  });
  const targets = missing.filter((d) => d.ev > 0).concat(missing.filter((d) => d.ev === 0)).slice(0, num("--dealers", 400));
  console.error(`resolve: ${missing.length} dealerships unmapped (${missing.filter((d) => d.ev > 0).length} with EVs); trying ${targets.length}`);

  // The index has no location, so candidate generation gets whatever the
  // sniff stage found in the dealer's own vehicle copy and nothing else. That
  // matters for recall — the generator measures 69% from a name alone against
  // 83% when a state is known — and not at all for safety: the id gate below
  // never consults the name, the city or the state.
  const sniff = (await readJson("motive-sniff.json")) ?? {};
  const want = new Map(); // domain -> Set(dealer id)
  const addDomain = (dom, id) => {
    if (!isPublicDealerDomain(dom) || NOT_A_DEALER.test(dom) || fetched.has(dom) || knownDomains.has(dom)) return;
    if (!want.has(dom)) want.set(dom, new Set());
    want.get(dom).add(id);
  };
  for (const d of targets) {
    const s = sniff[d.id];
    // A host the dealer printed in its own copy is tried first and is not a
    // guess at all; the rest of the candidates are.
    for (const h of s?.hosts ?? []) addDomain(h, d.id);
    const place = s?.places?.[0];
    for (const c of candidates(d.name, place?.city ?? null, place?.state ?? null)) {
      for (const tld of [".com", ".net"]) addDomain(c + tld, d.id);
    }
  }
  // --from-osm: the domains the osm stage matched to these same dealerships.
  // They enter as candidates and nothing more — the gate below is unchanged,
  // so an OSM node that names the wrong store costs one fetch and produces no
  // row. Kept separate from `sniffed` only for the priority order: a domain a
  // dealer printed in its own copy and a domain a mapper wrote down in front
  // of the store are both evidence, and both outrank a permutation of a name.
  const osmCands = args.includes("--from-osm") ? ((await readJson("motive-osm-candidates.json")) ?? {}) : {};
  const osmDomains = new Set();
  for (const [dom, c] of Object.entries(osmCands)) {
    // Deliberately past the knownDomains filter above: a registry domain is
    // exactly the interesting case here (see the osm stage), and it can only
    // be answered by asking the site. The gate is unchanged.
    if (!isPublicDealerDomain(dom) || NOT_A_DEALER.test(dom) || fetched.has(dom)) continue;
    if (!want.has(dom)) want.set(dom, new Set());
    for (const id of c.ids) want.get(dom).add(id);
    osmDomains.add(dom);
  }
  if (args.includes("--from-osm")) console.error(`resolve: ${osmDomains.size} of ${Object.keys(osmCands).length} OSM candidate domains are new and unfetched`);
  console.error(`resolve: ${want.size} candidate domains to DNS-check`);

  const resolver = new Resolver();
  resolver.setServers(["1.1.1.1", "8.8.8.8"]);
  const doms = [...want.keys()];
  const live = [];
  {
    let next = 0;
    await Promise.all(Array.from({ length: 200 }, async () => {
      while (next < doms.length) {
        const dom = doms[next++];
        try { await resolver.resolve4(dom); live.push(dom); } catch {}
      }
    }));
  }
  // Spend the fetch budget on the dealers that carry the most EVs, .com
  // first. Without this the order is whatever DNS answered in, which on a
  // truncated run means the budget lands on an arbitrary corner of the list.
  // A host the dealer itself printed outranks every guessed one: it is the
  // only candidate class that is evidence rather than a permutation.
  const sniffed = new Set(targets.flatMap((d) => sniff[d.id]?.hosts ?? []));
  const evOf = new Map(targets.map((d) => [d.id, d.ev]));
  const evAll = new Map(idx.list.map((d) => [d.id, d.ev]));
  const prio = (dom) =>
    Math.max(...[...want.get(dom)].map((id) => evOf.get(id) ?? evAll.get(id) ?? 0)) +
    (sniffed.has(dom) ? 1e6 : 0) +
    (osmDomains.has(dom) ? 1e6 : 0) +
    (osmCands[dom]?.how === "phone" ? 1e6 : 0);
  live.sort((a, b) => prio(b) - prio(a) || (a.endsWith(".com") ? 0 : 1) - (b.endsWith(".com") ? 0 : 1));
  console.error(`resolve: ${live.length} of ${doms.length} candidates resolve in DNS`);

  let next = 0, hits = 0, done = 0;
  const budget = Math.min(live.length, BUDGET);
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (next < budget) {
      const domain = live[next++];
      const res = await fetchMotive(`https://${domain}/`);
      done++;
      const recs = res.status === 200 && res.body ? motiveDealerRecords(res.body) : new Map();
      const cfg = res.status === 200 && res.body ? rideMotiveConfig(res.body) : null;
      fetched.set(domain, { status: String(res.status), selfId: cfg?.dealerId ?? null, records: recs.size, date: today, via: "resolve" });
      // THE GATE: this page publishes the dealer record for an id we asked
      // about. Nothing here matches a name, a city or a phone.
      const wanted = want.get(domain);
      let matched = false;
      for (const [id, rec] of recs) {
        if (wanted.has(id)) matched = true;
        if (!publishers.has(id)) publishers.set(id, new Set());
        publishers.get(id).add(domain);
        const prev = records.get(id);
        const self = cfg?.dealerId === id;
        if (!prev || (isPublicDealerDomain(rec.domain) && !isPublicDealerDomain(prev.domain)) || (self && !prev.self)) {
          records.set(id, { ...rec, self: self || Boolean(prev?.self), via: domain, from: "resolve" });
        }
      }
      if (matched) hits++;
      if (done % 200 === 0) console.error(`  resolve: fetched ${done}/${budget}, ${hits} id matches`);
    }
  }));
  await writeJson("motive-domains.json", {
    fetched: Object.fromEntries(fetched),
    records: Object.fromEntries(records),
    publishers: Object.fromEntries([...publishers].map(([k, v]) => [k, [...v]])),
  });
  console.error(`resolve: ${done} fetches, ${hits} pages published a dealer id we asked for`);
}

// ── stage: groups ───────────────────────────────────────────────────────────
// The dealerships that HAVE no public site, and what reaches their cars.
//
// Hundreds of Motive rooftops are addressed only as `something.app.ridemotive
// .com`: the platform's own host for a dealer with no domain of its own. A
// registry row for one of those would be a row pointing at Motive, not at a
// dealer — the shopper's link would not be the seller's site — so this lane
// refuses to write them (isPublicDealerDomain). That is not the same as the
// cars being unreachable, and the difference is worth measuring rather than
// assuming: those rooftops belong to GROUPS, and a group's public site lists
// the cars its children share up to it. ridemotive.mjs crawls a domain by
// filtering the national index on the dealer id that domain publishes about
// itself, so the question "is this dark rooftop's inventory already ours?" has
// an exact answer in the index:
//
//   is_active:true AND dealer_id:{child} AND dealer_ids:"{group}"
//
// — the child's OWN cars (dealer_id is the selling dealer, and it partitions
// the index) that also carry the group's id in their dealer_ids array, which
// is exactly the set a crawl of the group's domain pulls. Anything short of
// the child's full count is reported short; nothing is rounded up to
// "covered".
//
// Publishers, not the record's `via`: `records` keeps one publishing domain
// and overwrites it whenever a better record arrives, so the group that
// actually covers a child can be overwritten by a group that does not. The
// harvest keeps the whole publisher set for this stage.
async function stageGroups(cfg) {
  const idx = await readJson("motive-index.json");
  const state = await readJson("motive-domains.json");
  if (!idx || !state) throw new Error("run --stage index and --stage harvest first");
  const records = new Map(Object.entries(state.records).map(([k, v]) => [Number(k), v]));
  const publishers = new Map(Object.entries(state.publishers ?? {}).map(([k, v]) => [Number(k), v]));
  const fetched = new Map(Object.entries(state.fetched));
  const byId = new Map(idx.list.map((d) => [d.id, d]));

  // The bucket: an id the index has live inventory for, whose platform record
  // exists and names a platform-internal host.
  const dark = idx.list
    .filter((d) => d.total > 0)
    .map((d) => ({ d, rec: records.get(d.id) }))
    .filter(({ rec }) => rec && !isPublicDealerDomain(rec.domain))
    .sort((a, b) => b.d.ev - a.d.ev);
  console.error(`groups: ${dark.length} dealerships with live inventory and no public domain (${dark.filter((x) => x.d.ev > 0).length} with EVs)`);

  // Candidate covering sites: every public domain that published this child's
  // record AND answered with a dealer id of its own (that id is the filter a
  // crawl of it would use).
  const rows = [];
  const pairs = []; // [childId, groupId] to measure
  for (const { d, rec } of dark) {
    const cands = [];
    for (const dom of publishers.get(d.id) ?? []) {
      const f = fetched.get(apex(dom));
      if (!f || !Number.isFinite(f.selfId)) continue;
      if (!isPublicDealerDomain(dom)) continue;
      cands.push({
        domain: apex(dom),
        groupId: f.selfId,
        registry: knownWorking.has(apex(dom)) ? "working" : knownDomains.has(apex(dom)) ? "other" : "absent",
      });
    }
    for (const c of cands) pairs.push([d.id, c.groupId]);
    rows.push({ id: d.id, name: d.name, platformHost: rec.domain, ev: d.ev, total: d.total, candidates: cands });
  }

  // Measure every (child, group) pair once.
  const cache = (await readJson("motive-group-cover.json")) ?? {};
  const key = (c, g) => `${c}:${g}`;
  const want = [...new Map(pairs.map((p) => [key(p[0], p[1]), p])).values()].filter((p) => !(key(p[0], p[1]) in cache));
  const url =
    `https://${cfg.appId.toLowerCase()}-dsn.algolia.net/1/indexes/*/queries` +
    `?x-algolia-api-key=${encodeURIComponent(cfg.apiKey)}&x-algolia-application-id=${encodeURIComponent(cfg.appId)}`;
  console.error(`groups: measuring ${want.length} child→group cover pairs`);
  for (let i = 0; i < want.length; i += 10) {
    const batch = want.slice(i, i + 10);
    const requests = batch.flatMap(([c, g]) => [
      { indexName: cfg.index, query: "", filters: `is_active:true AND dealer_id:${Number(c)} AND dealer_ids:"${Number(g)}"`, hitsPerPage: 0 },
      {
        indexName: cfg.index,
        query: "",
        filters: `is_active:true AND dealer_id:${Number(c)} AND dealer_ids:"${Number(g)}" AND standardized_fuel_type:Electric`,
        hitsPerPage: 0,
      },
    ]);
    const { status, json } = await politePostJson(url, { body: { requests } });
    REQUESTS++;
    if (status !== 200 || !Array.isArray(json?.results)) { console.error(`  groups: batch ${i} → ${status}`); continue; }
    batch.forEach(([c, g], k) => {
      const t = json.results[k * 2], e = json.results[k * 2 + 1];
      cache[key(c, g)] = {
        total: t?.nbHits ?? null,
        ev: e?.nbHits ?? null,
        exhaustive: t?.exhaustiveNbHits !== false && e?.exhaustiveNbHits !== false,
      };
    });
    if ((i / 10) % 10 === 0) {
      console.error(`  groups: ${Math.min(i + 10, want.length)}/${want.length}`);
      await writeJson("motive-group-cover.json", cache);
    }
  }
  await writeJson("motive-group-cover.json", cache);

  // A child counts as reached only through a domain the registry actually
  // crawls: a covering site we do not have a working row for reaches nobody
  // today, and is reported as the row to add instead.
  for (const r of rows) {
    for (const c of r.candidates) {
      const m = cache[key(r.id, c.groupId)] ?? {};
      c.evCovered = m.ev ?? null;
      c.totalCovered = m.total ?? null;
      c.exhaustive = m.exhaustive ?? null;
    }
    r.candidates.sort((a, b) => (b.evCovered ?? -1) - (a.evCovered ?? -1) || (b.totalCovered ?? -1) - (a.totalCovered ?? -1));
    const crawled = r.candidates.filter((c) => c.registry === "working");
    const best = crawled[0] ?? null;
    const anyBest = r.candidates[0] ?? null;
    r.evReached = best?.evCovered ?? 0;
    r.totalReached = best?.totalCovered ?? 0;
    r.reachedVia = best ? best.domain : null;
    r.bestUncrawled = !best && anyBest?.evCovered ? anyBest : null;
    r.verdict = r.ev === 0
      ? (r.totalReached >= r.total ? "reached (no EVs)" : r.totalReached > 0 ? "partial (no EVs)" : "dark (no EVs)")
      : r.evReached >= r.ev ? "reached"
      : r.evReached > 0 ? "partial"
      : "dark";
  }

  const sum = (list, k) => list.reduce((a, r) => a + (r[k] ?? 0), 0);
  const withEv = rows.filter((r) => r.ev > 0);
  const out = {
    measured: today,
    index: idx.measured,
    method:
      "A dealership with no public domain is counted REACHED only where a domain the registry crawls as working " +
      "publishes its record and the index answers that the child's own cars (dealer_id) carry that domain's " +
      'dealer id in dealer_ids — the exact filter ridemotive.mjs crawls with. Nothing is inferred from group membership.',
    dealerships: rows.length,
    dealershipsWithEv: withEv.length,
    evInBucket: sum(withEv, "ev"),
    evReached: sum(withEv, "evReached"),
    reached: withEv.filter((r) => r.verdict === "reached").length,
    partial: withEv.filter((r) => r.verdict === "partial").length,
    dark: withEv.filter((r) => r.verdict === "dark").length,
    rows,
  };
  await writeJson("motive2-reached-via-group.json", out);
  console.error(
    `groups: ${out.dealershipsWithEv} EV-holding dealerships with no public site hold ${out.evInBucket} EVs — ` +
      `${out.evReached} of them are already pulled by a working registry domain (${out.reached} fully, ${out.partial} partly, ${out.dark} not at all)`,
  );
}

// ── stage: cover ────────────────────────────────────────────────────────────
// The question the groups stage answers only for the rooftops we could map,
// asked of every dealership in the index: is this dealer's inventory ALREADY
// pulled by a domain the registry crawls?
//
// groups walks child→parent pairs the platform published, so it can say
// nothing about the 936 dealerships no page ever published a record for — and
// those hold 6,800 of the 11,318 EVs. Being unmapped does not mean being
// unreached: a car carries every dealer id that lists it in `dealer_ids`, so
// if a crawled group site lists it, ridemotive.mjs has already been pulling it
// under that group's domain, unmapped or not. Counting those as missing would
// overstate the hole, which is the same error in the opposite direction from
// the one this project guards hardest against.
//
// Asked in two steps so the answer is exact rather than approximate:
//   1. facet `dealer_ids` over this dealer's own EV slice — who else lists
//      these cars. Small slices, and `exhaustiveFacetsCount` is checked rather
//      than trusted (the lane already knows this index approximates facets on
//      big sets).
//   2. for the ids from step 1 that belong to a domain the registry crawls,
//      one count with those ids OR-ed together — the exact size of the union,
//      not the biggest of them, and not their sum (a car listed by two of them
//      would be counted twice).
async function stageCover(cfg) {
  const idx = await readJson("motive-index.json");
  const state = await readJson("motive-domains.json");
  if (!idx || !state) throw new Error("run --stage index and --stage harvest first");
  const records = new Map(Object.entries(state.records).map(([k, v]) => [Number(k), v]));
  const fetched = new Map(Object.entries(state.fetched));

  // The ids a nightly crawl actually filters on: the id each WORKING registry
  // domain publishes about itself. Nothing else is crawled — a discovered row
  // is not crawled, and a domain we mapped but never rowed is not either.
  const crawledId = new Map(); // dealer id -> domain
  for (const [dom, f] of fetched) {
    if (!knownWorking.has(dom)) continue;
    if (!Number.isFinite(f.selfId)) continue;
    if (!crawledId.has(f.selfId)) crawledId.set(f.selfId, dom);
  }
  console.error(`cover: ${crawledId.size} dealer ids are crawled today (working registry domains that publish a Motive id)`);

  const targets = idx.list.filter((d) => d.ev > 0 && !crawledId.has(d.id)).sort((a, b) => b.ev - a.ev);
  const url =
    `https://${cfg.appId.toLowerCase()}-dsn.algolia.net/1/indexes/*/queries` +
    `?x-algolia-api-key=${encodeURIComponent(cfg.apiKey)}&x-algolia-application-id=${encodeURIComponent(cfg.appId)}`;
  const out = (await readJson("motive-cover.json")) ?? {};
  const want = targets.filter((d) => !(d.id in out));
  console.error(`cover: ${targets.length} EV-holding dealerships are not themselves crawled; ${want.length} to measure`);

  for (let i = 0; i < want.length; i += 10) {
    const batch = want.slice(i, i + 10);
    const { status, json } = await politePostJson(url, {
      body: {
        requests: batch.map((d) => ({
          indexName: cfg.index,
          query: "",
          filters: `is_active:true AND dealer_id:${Number(d.id)} AND standardized_fuel_type:Electric`,
          hitsPerPage: 0,
          facets: ["dealer_ids"],
          maxValuesPerFacet: 100,
        })),
      },
    });
    REQUESTS++;
    if (status !== 200 || !Array.isArray(json?.results)) { console.error(`  cover: batch ${i} → ${status}`); continue; }
    batch.forEach((d, k) => {
      const r = json.results[k] ?? {};
      const facet = r.facets?.dealer_ids ?? {};
      const sharers = Object.entries(facet)
        .map(([id, n]) => ({ id: Number(id), n }))
        .filter((x) => x.id !== d.id && crawledId.has(x.id));
      out[d.id] = {
        ev: r.nbHits ?? null,
        exhaustive: r.exhaustiveFacetsCount !== false && r.exhaustiveNbHits !== false,
        sharers,
      };
    });
    if ((i / 10) % 20 === 0) { console.error(`  cover: ${Math.min(i + 10, want.length)}/${want.length}`); await writeJson("motive-cover.json", out); }
  }
  await writeJson("motive-cover.json", out);

  // Step 2: the exact union, for the dealers where a crawled id shares cars.
  const needUnion = Object.entries(out).filter(([, v]) => v.sharers?.length && v.union == null);
  console.error(`cover: ${needUnion.length} dealerships share EVs with a crawled id — measuring the exact union`);
  for (let i = 0; i < needUnion.length; i += 10) {
    const batch = needUnion.slice(i, i + 10);
    const { status, json } = await politePostJson(url, {
      body: {
        requests: batch.map(([id, v]) => ({
          indexName: cfg.index,
          query: "",
          filters:
            `is_active:true AND dealer_id:${Number(id)} AND standardized_fuel_type:Electric AND (` +
            v.sharers.map((s) => `dealer_ids:"${Number(s.id)}"`).join(" OR ") +
            ")",
          hitsPerPage: 0,
        })),
      },
    });
    REQUESTS++;
    if (status !== 200 || !Array.isArray(json?.results)) { console.error(`  cover: union batch ${i} → ${status}`); continue; }
    batch.forEach(([id], k) => {
      const r = json.results[k] ?? {};
      out[id].union = r.nbHits ?? null;
      out[id].unionExhaustive = r.exhaustiveNbHits !== false;
    });
    if ((i / 10) % 20 === 0) await writeJson("motive-cover.json", out);
  }
  await writeJson("motive-cover.json", out);

  const byId = new Map(idx.list.map((d) => [d.id, d]));
  let reachedEv = 0, reachedDealers = 0, partial = 0;
  const rows = [];
  for (const [id, v] of Object.entries(out)) {
    const u = v.union ?? 0;
    if (u <= 0) continue;
    const d = byId.get(Number(id));
    reachedEv += Math.min(u, d?.ev ?? u);
    reachedDealers++;
    if (u < (d?.ev ?? 0)) partial++;
    rows.push({
      id: Number(id),
      name: d?.name ?? "",
      ev: d?.ev ?? null,
      evReached: u,
      full: u >= (d?.ev ?? 0),
      via: v.sharers.map((s) => ({ groupId: s.id, domain: crawledId.get(s.id) ?? null, evShared: s.n })),
    });
  }
  rows.sort((a, b) => b.evReached - a.evReached);
  await writeJson("motive2-reached-via-crawl.json", {
    measured: today,
    index: idx.measured,
    method:
      "For every EV-holding dealership the registry does not crawl directly: facet dealer_ids over its own EV slice " +
      "to find which other rooftops list those cars, keep only the ids a WORKING registry domain publishes about " +
      "itself (the id ridemotive.mjs filters on), and count the exact union with those ids OR-ed together. " +
      "Nothing is inferred from group membership and no count is a sum of overlapping filters.",
    dealershipsMeasured: Object.keys(out).length,
    dealershipsReached: reachedDealers,
    evReached: reachedEv,
    partiallyReached: partial,
    rows,
  });
  console.error(
    `cover: ${reachedEv} EVs at ${reachedDealers} un-crawled dealerships are already pulled by a crawled group domain ` +
      `(${partial} of those dealerships only partly)`,
  );
}

// ── stage: vins ─────────────────────────────────────────────────────────────
// 11,318 EV rows in the index are not 11,318 cars, and a coverage number that
// assumes they are overstates the hole.
//
// The dealership list carries "BMW Staging", "Chris BMW Test", "Motive BMW",
// "Motive Hyundai", "Motive Mitsubishi" — the platform's own demo and staging
// rooftops, each holding a copy of a real dealer's inventory (the lane already
// found Schomp BMW appearing four times with the same 729 vehicles). Group
// rooftops re-list their children's cars under their own dealer_id too. So the
// only honest unit for "how many EVs are we missing" is the VIN.
//
// One browse of the EV slice answers it — ~12 pages for the whole thing,
// retrieving nothing but vin and dealer_id — and the intersection is then
// local: a VIN is REACHED if any row carrying it sits under a dealer id a
// working registry domain crawls, whoever else also lists it.
async function stageVins(cfg) {
  const idx = await readJson("motive-index.json");
  const state = await readJson("motive-domains.json");
  if (!idx || !state) throw new Error("run --stage index and --stage harvest first");
  const fetched = new Map(Object.entries(state.fetched));
  const crawledId = new Map();
  for (const [dom, f] of fetched) {
    if (knownWorking.has(dom) && Number.isFinite(f.selfId) && !crawledId.has(f.selfId)) crawledId.set(f.selfId, dom);
  }

  const url =
    `https://${cfg.appId.toLowerCase()}-dsn.algolia.net/1/indexes/${encodeURIComponent(cfg.index)}/browse` +
    `?x-algolia-api-key=${encodeURIComponent(cfg.apiKey)}&x-algolia-application-id=${encodeURIComponent(cfg.appId)}`;
  let cursor = null, pages = 0, rows = 0;
  const byVin = new Map(); // vin -> Set(dealer_id)
  const noVin = new Map(); // dealer id -> rows with no VIN
  for (;;) {
    const { status, json } = await politePostJson(url, {
      body: {
        query: "",
        filters: "is_active:true AND standardized_fuel_type:Electric",
        hitsPerPage: 1000,
        attributesToRetrieve: ["vin", "dealer_id", "dealer_ids"],
        ...(cursor ? { cursor } : {}),
      },
    });
    REQUESTS++;
    if (status !== 200 || !Array.isArray(json?.hits)) throw new Error(`browse failed at page ${pages}: ${status}`);
    for (const h of json.hits) {
      rows++;
      const id = Number(h.dealer_id);
      const vin = String(h.vin ?? "").trim().toUpperCase();
      if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) { noVin.set(id, (noVin.get(id) ?? 0) + 1); continue; }
      if (!byVin.has(vin)) byVin.set(vin, { selling: new Set(), listed: new Set() });
      const v = byVin.get(vin);
      v.selling.add(id);
      // `dealer_ids` is the array of every rooftop that LISTS this car, which
      // is the filter a crawl runs; `dealer_id` is only the selling rooftop.
      // Keying reachability on the selling dealer alone undercounted by 792
      // VINs — every car a child shares up to a crawled group site.
      for (const g of Array.isArray(h.dealer_ids) ? h.dealer_ids : []) {
        const n = Number(g);
        if (Number.isFinite(n)) v.listed.add(n);
      }
    }
    pages++;
    cursor = json.cursor ?? null;
    if (!cursor) break;
  }

  let reached = 0, dark = 0;
  const darkByDealer = new Map();
  // Per dealer id, how many of the EV VINs it LISTS nothing we crawl already
  // yields. This is what makes a discovered row's note a claim about cars the
  // feed does not have, rather than about rows in someone else's index:
  // espanol.bouldernissan.com is a Motive rooftop of its own with 37 EVs and
  // its own dealer id, and all 66 of its VINs are the 66 VINs of
  // bouldernissan.com, which the registry already crawls (measured
  // 2026-08-24). A row for it would have added a second domain, a second
  // crawl, a Spanish-language condition string — and no car.
  const perDealer = new Map();
  const bump = (id, key) => {
    let r = perDealer.get(id);
    if (!r) perDealer.set(id, (r = { evVins: 0, darkVins: 0 }));
    r[key]++;
  };
  const byId = new Map(idx.list.map((d) => [d.id, d]));
  for (const [vin, v] of byVin) {
    const ids = new Set([...v.selling, ...v.listed]);
    for (const id of ids) bump(id, "evVins");
    if ([...ids].some((id) => crawledId.has(id))) { reached++; continue; }
    dark++;
    for (const id of ids) bump(id, "darkVins");
    // Attribute a dark VIN to the dealership that would be rowed for it: the
    // one holding the most inventory, so a group is named rather than one of
    // its children.
    const owner = [...ids].sort((a, b) => (byId.get(b)?.total ?? 0) - (byId.get(a)?.total ?? 0))[0];
    darkByDealer.set(owner, (darkByDealer.get(owner) ?? 0) + 1);
  }
  const out = {
    measured: today,
    evRows: rows,
    distinctVins: byVin.size,
    rowsWithoutVin: [...noVin.values()].reduce((a, b) => a + b, 0),
    duplicateRows: rows - byVin.size - [...noVin.values()].reduce((a, b) => a + b, 0),
    crawledIds: crawledId.size,
    vinsReached: reached,
    vinsDark: dark,
    darkTop: [...darkByDealer.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 60)
      .map(([id, n]) => ({ id, name: byId.get(id)?.name ?? "", darkVins: n, evRows: byId.get(id)?.ev ?? 0, vehicles: byId.get(id)?.total ?? 0 })),
    perDealer: Object.fromEntries(perDealer),
  };
  await writeJson("motive2-ev-vin-ledger.json", out);
  console.error(
    `vins: ${rows} EV rows → ${byVin.size} distinct VINs (${out.duplicateRows} duplicate rows, ${out.rowsWithoutVin} without a VIN); ` +
      `${reached} VINs are already pulled by a crawled domain, ${dark} are not`,
  );
}

// ── the count a discovered row should carry ─────────────────────────────────
// The browse above counts by `dealer_id`, the SELLING dealer. What a crawl of
// a domain will actually pull is `dealer_ids`, the array — ridemotive.mjs
// filters on `dealer_ids:"{id}"` because a group rooftop lists the cars its
// children share up to it (244 cars against the 94 whose own dealer_id is
// 2766, measured on rustydrewingpreowned.com). Selling-dealer counts therefore
// understate a group rooftop and, worse, DOUBLE-COUNT when several ids share
// one domain — Schomp BMW appears in the index four times (a staging rooftop
// and a test rooftop beside the two real ones), each with the same 729
// vehicles, and summing them would have put 2,916 cars in one row's note.
//
// So the number in the note is asked of the index under the crawl's own
// filter, for the id the site publishes about itself. nbHits is checked for
// exhaustiveness rather than trusted: the whole-index query answers
// `exhaustiveNbHits:false`, and a note is a claim.
async function crawlCounts(cfg, ids) {
  const cached = (await readJson("motive-counts.json")) ?? {};
  const want = ids.filter((id) => !(id in cached));
  const url =
    `https://${cfg.appId.toLowerCase()}-dsn.algolia.net/1/indexes/*/queries` +
    `?x-algolia-api-key=${encodeURIComponent(cfg.apiKey)}&x-algolia-application-id=${encodeURIComponent(cfg.appId)}`;
  for (let i = 0; i < want.length; i += 10) {
    const batch = want.slice(i, i + 10);
    const requests = batch.flatMap((id) => [
      { indexName: cfg.index, query: "", filters: `is_active:true AND dealer_ids:"${Number(id)}"`, hitsPerPage: 0 },
      {
        indexName: cfg.index,
        query: "",
        filters: `is_active:true AND dealer_ids:"${Number(id)}" AND standardized_fuel_type:Electric`,
        hitsPerPage: 0,
      },
    ]);
    const { status, json } = await politePostJson(url, { body: { requests } });
    REQUESTS++;
    if (status !== 200 || !Array.isArray(json?.results)) {
      console.error(`  counts: batch at ${i} failed (${status})`);
      continue;
    }
    batch.forEach((id, k) => {
      const t = json.results[k * 2], e = json.results[k * 2 + 1];
      cached[id] = {
        total: t?.nbHits ?? null,
        ev: e?.nbHits ?? null,
        exhaustive: t?.exhaustiveNbHits !== false && e?.exhaustiveNbHits !== false,
      };
    });
    if ((i / 10) % 5 === 0) console.error(`  counts: ${Math.min(i + 10, want.length)}/${want.length}`);
  }
  await writeJson("motive-counts.json", cached);
  return cached;
}

// ── stage: emit ─────────────────────────────────────────────────────────────
async function stageEmit(cfg) {
  const idx = await readJson("motive-index.json");
  const state = await readJson("motive-domains.json");
  if (!idx || !state) throw new Error("run --stage index and --stage harvest first");
  const records = new Map(Object.entries(state.records).map(([k, v]) => [Number(k), v]));
  const byId = new Map(idx.list.map((d) => [d.id, d]));
  // Harvest fetched every public domain it learned of, so a row can be held to
  // the domain having actually answered. Four of the first 197 had not: they
  // were dealers the platform had parked (`adfasdfas.churned.com`) and their
  // DNS does not resolve. A discovered row for a domain we already know is
  // dead is a row someone re-measures for nothing.
  const answered = new Set(Object.entries(state.fetched).filter(([, f]) => f.status === "200").map(([d]) => d));
  // Dedupe on the DEALER, not only on the domain. A registry domain often
  // redirects to the rooftop's canonical one — columbia-preowned.com serves
  // rustydrewingpreowned.com, southbaygenesis.com serves genesisofsouthbay.com
  // — and the platform's record names the canonical, so a domain-only check
  // called six rooftops we already crawl "new". The dealer id the registry
  // domain publishes about itself is the key that catches them, and it is the
  // same key the crawl filters on, so a match means the same cars.
  const trackedIds = new Set(
    Object.entries(state.fetched)
      .filter(([d, f]) => knownDomains.has(d) && Number.isFinite(f.selfId))
      .map(([, f]) => f.selfId),
  );

  // One row per domain. Several dealer ids can name the same domain — a group
  // rooftop and its children, or a store that also runs a staging and a test
  // rooftop — so the row records every id it covers but takes its COUNT from
  // one of them: the id the site publishes about itself, which is the id
  // ridemotive.mjs will filter on when it crawls that domain. Falling back to
  // the biggest id is for the domains no site self-asserted.
  const byDomain = new Map();
  for (const [id, rec] of records) {
    const inv = byId.get(id);
    // A dealer record with no live inventory in the index is a churned or
    // not-yet-launched rooftop; a registry row for it would be a row for an
    // empty lot. The index is the test of whether it sells anything today.
    if (!inv || inv.total === 0) continue;
    if (!isPublicDealerDomain(rec.domain)) continue;
    if (!answered.has(apex(rec.domain))) continue;
    const d = apex(rec.domain);
    let row = byDomain.get(d);
    if (!row) byDomain.set(d, (row = { domain: d, ids: [], rec, self: false, crawlId: id }));
    row.ids.push(id);
    if (rec.self && !row.self) { row.self = true; row.rec = rec; row.crawlId = id; }
    else if (!row.self && (byId.get(id).total > (byId.get(row.crawlId)?.total ?? 0))) row.crawlId = id;
    if (!row.rec.zip && rec.zip) row.rec = rec;
  }

  const counts = await crawlCounts(cfg, [...byDomain.values()].map((r) => r.crawlId));
  for (const row of byDomain.values()) {
    const c = counts[row.crawlId];
    const sold = byId.get(row.crawlId);
    // If the index would not answer exhaustively, the row falls back to the
    // selling-dealer count the browse produced — which is a floor, and says so.
    row.exact = Boolean(c?.exhaustive && Number.isFinite(c.total));
    row.total = row.exact ? c.total : sold.total;
    row.ev = row.exact ? c.ev : sold.ev;
    row.plugin = sold.plugin;
  }

  const isKnown = (r) => knownDomains.has(r.domain) || r.ids.some((id) => trackedIds.has(id));
  const known = [...byDomain.values()].filter(isKnown);
  // What a row would actually ADD, counted in VINs by the vins stage: EV VINs
  // this domain lists that no domain the registry already crawls yields. A row
  // whose every EV is already in the feed under someone else's domain is not
  // coverage — it is a second crawl of the same cars, and its note would be a
  // claim about cars we already have. espanol.bouldernissan.com is the case
  // that found this: a Motive rooftop with its own dealer id and 37 EVs, whose
  // 66 VINs are the 66 VINs of bouldernissan.com, a working registry row
  // (measured 2026-08-24). Dropped, with the reason printed.
  const ledger = await readJson("motive2-ev-vin-ledger.json");
  const perDealer = ledger?.perDealer ?? null;
  const novelty = (r) => (perDealer ? (perDealer[r.crawlId]?.darkVins ?? null) : null);
  const all = [...byDomain.values()].filter((r) => !isKnown(r) && r.total > 0);
  const duplicates = all.filter((r) => r.ev > 0 && novelty(r) === 0);
  const fresh = all
    .filter((r) => !(r.ev > 0 && novelty(r) === 0))
    .sort((a, b) => b.ev - a.ev || b.total - a.total);

  const rows = fresh.map((r) => ({
    domain: r.domain,
    name: r.rec.name,
    kind: r.ids.length > 1 ? "group" : "rooftop",
    platform: "unknown",
    robots: "unknown",
    status: "discovered",
    notes:
      `Motive national index, ${r.total} vehicles / ${r.ev} EVs listed${r.exact ? "" : " (at least — the index would not count exhaustively)"} ` +
      `under the crawl's own dealer_ids:"${r.crawlId}" filter${r.plugin ? `, ${r.plugin} of them plug-in-stated` : ""} (${idx.measured}); ` +
      `domain from the platform's own dealer record, published by ${r.self ? "the site itself" : `https://${r.rec.via}`}` +
      `${r.ids.length > 1 ? `; ${r.ids.length} dealer ids share this domain (${r.ids.join(", ")})` : ""}` +
      `${novelty(r) != null && r.ev > 0 ? `; ${novelty(r)} of its EV VINs are listed by no domain we already crawl` : ""} (${today})`,
    // Only what the dealer record actually carried: a location block of empty
    // strings reads like a location and is not one.
    ...(r.rec.city || r.rec.state || r.rec.zip
      ? {
          location: Object.fromEntries(
            Object.entries({ city: r.rec.city, state: r.rec.state, zip: r.rec.zip }).filter(([, v]) => v),
          ),
        }
      : {}),
  }));

  await writeJson(flag("--out", "motive-new-sites.json"), rows);
  const sum = (list, k) => list.reduce((a, r) => a + r[k], 0);
  console.error(
    `emit: ${byDomain.size} domains mapped to live inventory — ${known.length} already in the registry (confirmations, ${sum(known, "ev")} EVs), ${rows.length} new rows`,
  );
  console.error(
    `emit: new rows carry ${sum(fresh, "total")} vehicles, ${sum(fresh, "ev")} EVs and ${sum(fresh, "plugin")} plug-in-stated; ` +
      `${fresh.filter((r) => r.ev > 0).length} rows list at least one EV`,
  );
  if (duplicates.length) {
    console.error(
      `emit: dropped ${duplicates.length} row(s) whose EVs are all already crawled under another domain — ` +
        duplicates.map((r) => `${r.domain} (${r.ev} EVs, dealer ${r.crawlId})`).join(", "),
    );
  }
  const conf = known.map((r) => ({ domain: r.domain, ids: r.ids, total: r.total, ev: r.ev, inRegistryAs: knownWorking.has(r.domain) ? "working" : "other" }));
  await writeJson(flag("--confirmations", "motive-confirmations.json"), conf);
}

const cfg = ["index", "emit", "sniff", "groups", "cover", "vins"].includes(STAGE) ? await algoliaConfig() : null;
if (STAGE === "index") await stageIndex(cfg);
else if (STAGE === "sniff") await stageSniff(cfg);
else if (STAGE === "harvest") await stageHarvest();
else if (STAGE === "osm") await stageOsm();
else if (STAGE === "resolve") await stageResolve();
else if (STAGE === "groups") await stageGroups(cfg);
else if (STAGE === "cover") await stageCover(cfg);
else if (STAGE === "vins") await stageVins(cfg);
else if (STAGE === "emit") await stageEmit(cfg);
else throw new Error(`unknown --stage ${STAGE}`);
console.error(`requests this run: ${REQUESTS}`);
