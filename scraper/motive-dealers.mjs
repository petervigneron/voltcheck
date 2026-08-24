#!/usr/bin/env node
// Turn Motive's national inventory index into registry dealers.
//
//   node motive-dealers.mjs --stage index     # enumerate every dealership
//   node motive-dealers.mjs --stage harvest   # id → public domain, from the
//                                             # platform's own published records
//   node motive-dealers.mjs --stage sniff     # what dealers print about
//                                             # themselves in their own copy
//   node motive-dealers.mjs --stage resolve   # name → domain for what harvest missed
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
import { fetchPage, politePostJson } from "./lib/http.mjs";
import { rideMotiveConfig } from "./lib/platforms/ridemotive.mjs";
import { motiveDealerRecords, isPublicDealerDomain, apex } from "./lib/platforms/ridemotive-dealers.mjs";
import { candidates } from "./lib/dealer-names.mjs";

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
      if (f.records === 0 && published.has(dom)) { fetched.delete(dom); dropped++; }
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
          let res;
          try { res = await fetchPage(`https://${domain}/`); } catch (e) { res = { status: `error:${e.name}` }; }
          REQUESTS++;
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
  const prio = (dom) => Math.max(...[...want.get(dom)].map((id) => evOf.get(id) ?? 0)) + (sniffed.has(dom) ? 1e6 : 0);
  live.sort((a, b) => prio(b) - prio(a) || (a.endsWith(".com") ? 0 : 1) - (b.endsWith(".com") ? 0 : 1));
  console.error(`resolve: ${live.length} of ${doms.length} candidates resolve in DNS`);

  let next = 0, hits = 0, done = 0;
  const budget = Math.min(live.length, BUDGET);
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (next < budget) {
      const domain = live[next++];
      let res;
      try { res = await fetchPage(`https://${domain}/`); } catch (e) { res = { status: `error:${e.name}` }; }
      REQUESTS++;
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
  await writeJson("motive-domains.json", { fetched: Object.fromEntries(fetched), records: Object.fromEntries(records) });
  console.error(`resolve: ${done} fetches, ${hits} pages published a dealer id we asked for`);
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
  const fresh = [...byDomain.values()]
    .filter((r) => !isKnown(r) && r.total > 0)
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
      `${r.ids.length > 1 ? `; ${r.ids.length} dealer ids share this domain (${r.ids.join(", ")})` : ""} (${today})`,
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

  await writeJson("motive-new-sites.json", rows);
  const sum = (list, k) => list.reduce((a, r) => a + r[k], 0);
  console.error(
    `emit: ${byDomain.size} domains mapped to live inventory — ${known.length} already in the registry (confirmations, ${sum(known, "ev")} EVs), ${rows.length} new rows`,
  );
  console.error(
    `emit: new rows carry ${sum(fresh, "total")} vehicles, ${sum(fresh, "ev")} EVs and ${sum(fresh, "plugin")} plug-in-stated; ` +
      `${fresh.filter((r) => r.ev > 0).length} rows list at least one EV`,
  );
  const conf = known.map((r) => ({ domain: r.domain, ids: r.ids, total: r.total, ev: r.ev, inRegistryAs: knownWorking.has(r.domain) ? "working" : "other" }));
  await writeJson("motive-confirmations.json", conf);
}

const cfg = ["index", "emit", "sniff"].includes(STAGE) ? await algoliaConfig() : null;
if (STAGE === "index") await stageIndex(cfg);
else if (STAGE === "sniff") await stageSniff(cfg);
else if (STAGE === "harvest") await stageHarvest();
else if (STAGE === "resolve") await stageResolve();
else if (STAGE === "emit") await stageEmit(cfg);
else throw new Error(`unknown --stage ${STAGE}`);
console.error(`requests this run: ${REQUESTS}`);
