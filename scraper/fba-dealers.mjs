#!/usr/bin/env node
// Grow the registry from the Ford Blue Advantage dealer roster.
//
//   node fba-dealers.mjs [--write] [--dump file.json] [--radius N]
//   node fba-dealers.mjs --from file.json [--write]     (append from a dump)
//
// The sweep and the append are separable because politeGetJson does not use
// the page cache: --dump writes the roster once, --from appends it without
// spending another ~750 requests on Ford's proxy to say the same thing.
//
// lib/oem/ford-blue-advantage.mjs already pulls certified Ford BEVs and PHEVs
// off the Cox proxy at fordblueadvantage.com/rest/lsc/listing, and nightly.yml
// already feeds those rows to harvest-dealers.mjs. But that harvest can only
// see a rooftop that happens to hold a certified ELECTRIFIED Ford right now:
// measured 2026-08-29 on the crawl snapshot, the whole electric lane exposed
// 193 distinct dealer hosts and every single one was already in the registry —
// the source is exhausted at that facet.
//
// Drop the fuelTypeGroup facet and the same endpoint answers for the entire
// certified Ford catalogue (31,189 cars nationally on probe day), whose
// `owner.website.href` names each selling rooftop's OWN site. A Ford franchise
// that sells no certified EV today still has a used lot full of other people's
// EVs, which is exactly the class this registry is short of.
//
// FORD'S OWN LOCATOR IS NOT AN OPTION AND IS NOT ATTEMPTED. ford.com/robots.txt
// Disallows /finder, /finder* and /finder/* — that is the dealer locator — and
// www.ford.com/dealerships/ renders its list client-side from the same service.
// ford.com publishes no dealers_sitemap.xml (404, where every Stellantis brand
// has one) and its localsitemap.xml is 38 regional marketing markets with no
// rooftop roster. Policy, respected; this lane goes through the marketplace
// whose robots.txt permits /rest/ instead.
//
// PARTITION. searchRadius=0 is nationwide and reports the true total, but the
// marketplace caps the browsable window at ~400 records (firstRecord past ~300
// returns an empty page) and offers no state or dealer facet to slice on
// (verified: state=/stateCode= are ignored, the national total comes back
// unchanged). ZIP + radius is the only knob, so this walks the shared CONUS
// covering grid (lib/oem/grid.mjs) at a 50-mile radius and pages each cell to
// the window. A cell whose reported total exceeds the window is subdivided into
// its four quadrant sub-ZIPs at 25 miles, so a dense metro cannot hide its tail
// behind the cap. Coverage of CARS is not claimed and not needed — this script
// collects DEALERS, and a rooftop is found by any one of its cars.
//
// Rows land as status "discovered": probe.mjs validates extraction before
// anything joins the crawl. Appends only; existing rows are never touched.
import { readFile, writeFile } from "node:fs/promises";
import { politeGetJson } from "./lib/http.mjs";
import { coveringGrid, subdivideZips } from "./lib/oem/grid.mjs";

const args = process.argv.slice(2);
const WRITE = args.includes("--write");
const DUMP = (() => { const i = args.indexOf("--dump"); return i >= 0 ? args[i + 1] : null; })();
const RADIUS = (() => { const i = args.indexOf("--radius"); return i >= 0 ? Number(args[i + 1]) : 50; })();
const FROM = (() => { const i = args.indexOf("--from"); return i >= 0 ? args[i + 1] : null; })();

const API = "https://www.fordblueadvantage.com/rest/lsc/listing";
const REFERER = "https://www.fordblueadvantage.com/cars-for-sale";
const PAGE = 100;             // server caps numRecords at 100 whatever you ask
const WINDOW_MAX_FIRST = 300; // firstRecord past ~300 returns an empty page
const WINDOW = 400;           // …so a slice reporting more than this has a tail
const LAT = 1.4, LNG = 1.6;   // grid.mjs's cell size, needed to place sub-centres

const hostOf = (u) => { try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ""); } catch { return null; } };

// A `website` that is not one rooftop's own site. The marketplace hosts
// themselves, and SHARED showroom hosts where many dealers sit behind one
// hostname and are told apart only by a query parameter — showroom.auction123.com
// is the one this sweep actually turned up, and a registry row for it would
// point the crawler at whichever dealer that host happens to default to.
// Per-dealer vendor SUBDOMAINS (used.duvalford.netlook.com) are kept: they name
// their own rooftop and serve only its inventory.
const NOT_A_ROOFTOP =
  /(^|\.)(auction123|fordblueadvantage|ford|lincoln|autotrader|cars|cargurus|carvana|carmax|edmunds|kbb|truecar)\.(com|net|us)$/i;

const dealers = new Map(); // domain -> { name, city, state, zip, cars }
let requests = 0;

async function get(qs) {
  for (let attempt = 0; ; attempt++) {
    const r = await politeGetJson(`${API}?${qs}`, { headers: { referer: REFERER } });
    requests++;
    if (r.status === "robots_disallowed") { console.error("fba-dealers: robots disallows /rest/lsc/listing — stopping"); process.exit(1); }
    if (r.status === 200 && r.json) return r.json;
    const transient = String(r.status).startsWith("error:") || r.status === 429 || r.status >= 500;
    if (attempt === 0 && transient) { await new Promise((res) => setTimeout(res, 5000)); continue; }
    return null;
  }
}

function collect(j) {
  for (const l of j?.listings ?? []) {
    const domain = hostOf(l.owner?.website?.href);
    if (!domain || !domain.includes(".") || NOT_A_ROOFTOP.test(domain)) continue;
    const addr = l.owner?.location?.address ?? {};
    if (!dealers.has(domain)) {
      dealers.set(domain, {
        name: String(l.owner?.name ?? "").replace(/\s+/g, " ").trim(),
        city: addr.city || undefined,
        state: /^[A-Z]{2}$/i.test(String(addr.state ?? "")) ? String(addr.state).toUpperCase() : undefined,
        zip: /^\d{5}/.test(String(addr.zip ?? "")) ? String(addr.zip).slice(0, 5) : undefined,
        cars: 0,
      });
    }
    dealers.get(domain).cars++;
  }
}

// One (zip, radius) slice paged to the window. Returns the reported total.
async function slice(zip, radius) {
  const q = `zip=${zip}&searchRadius=${radius}&makeCode=FORD&listingType=CERTIFIED&numRecords=${PAGE}`;
  const first = await get(`${q}&firstRecord=0`);
  if (!first) return 0;
  const total = first.totalResultCount ?? 0;
  collect(first);
  for (let fr = PAGE; fr <= WINDOW_MAX_FIRST && fr < total; fr += PAGE) {
    const j = await get(`${q}&firstRecord=${fr}`);
    if (!j?.listings?.length) break;
    collect(j);
  }
  return total;
}

if (FROM) {
  for (const d of JSON.parse(await readFile(FROM, "utf-8"))) {
    const domain = String(d.domain ?? "").toLowerCase().replace(/^www\./, "");
    if (!domain.includes(".") || NOT_A_ROOFTOP.test(domain)) continue;
    dealers.set(domain, { name: d.name, city: d.city, state: d.state, zip: d.zip, cars: d.cars ?? 0 });
  }
  console.error(`fba-dealers: ${dealers.size} rooftops read from ${FROM}`);
} else {
  const grid = coveringGrid();
  if (!grid) { console.error("fba-dealers: web/data/zips.json unavailable — cannot build the covering grid"); process.exit(1); }
  const cells = [...grid.cells.values()];
  console.error(`fba-dealers: ${cells.length} CONUS grid cells at ${RADIUS} mi`);
  let n = 0, subdivided = 0;
  for (const c of cells) {
    const total = await slice(c.zip, RADIUS);
    if (total > WINDOW) {
      subdivided++;
      for (const z of subdivideZips(grid.zips, (c.cx + 0.5) * LAT, (c.cy + 0.5) * LNG, 35)) await slice(z, 25);
    }
    if (++n % 25 === 0) console.error(`  ${n}/${cells.length} cells, ${dealers.size} rooftops, ${requests} requests, ${subdivided} subdivided`);
  }
  console.error(`fba-dealers: ${dealers.size} rooftops from ${requests} requests (${subdivided} cells subdivided)`);
  if (DUMP) await writeFile(DUMP, JSON.stringify([...dealers.entries()].map(([domain, d]) => ({ domain, ...d })), null, 2));
}

// ── append ──────────────────────────────────────────────────────────────────
const regUrl = new URL("./registry/registry.json", import.meta.url);
const raw = await readFile(regUrl, "utf-8");
const registry = JSON.parse(raw);
// harvest-dealers.mjs's guard: a registry that no longer round-trips would be
// rewritten line-by-line as a side effect of appending. Refuse instead.
if (JSON.stringify(registry, null, 2) !== raw) {
  console.error("fba-dealers: registry does not round-trip JSON.stringify(…, 2) — refusing to append");
  process.exit(1);
}
const known = new Set(registry.sites.map((s) => s.domain.replace(/^www\./, "").toLowerCase()));

const today = new Date().toISOString().slice(0, 10);
const additions = [];
for (const [domain, d] of [...dealers.entries()].sort()) {
  if (known.has(domain)) continue;
  additions.push({
    domain,
    name: d.name || "Dealership Website",
    kind: "rooftop",
    platform: "unknown",
    robots: "unknown",
    status: "discovered",
    notes: `Ford Blue Advantage names this rooftop's own website on its certified listings (owner.website.href, ${d.cars} certified Ford(s) seen) — the domain is the marketplace's, not generated from the name (${today})`,
    ...(d.city || d.state || d.zip ? { location: { city: d.city, state: d.state, zip: d.zip } } : {}),
  });
}

console.error(`already tracked: ${dealers.size - additions.length}, new: ${additions.length}`);
if (!additions.length) process.exit(0);

if (WRITE) {
  registry.sites.push(...additions);
  await writeFile(regUrl, JSON.stringify(registry, null, 2));
  console.error(`appended ${additions.length} discovered rows`);
} else {
  console.error("dry run (--write to append). First 30:");
  for (const a of additions.slice(0, 30)) console.error(`  ${a.domain}  ${a.name}  ${a.location?.state ?? ""}`);
}
