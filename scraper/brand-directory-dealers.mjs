#!/usr/bin/env node
// Grow the registry from a manufacturer's OWN published dealer directory.
//
//   node brand-directory-dealers.mjs [host …] [--write] [--dump file.json]
//
// Every Stellantis US brand site publishes a dealer directory and names it in
// its robots.txt sitemap index: https://www.jeep.com/dealers_sitemap.xml lists
// ~2,250 /directory/<state>/<city>.html pages, and each city page server-renders
// a <div data-component="DealersList" data-props="…"> whose JSON carries, per
// rooftop: dealerCode, dealerName, street address, city, state, ZIP, sales
// phone — and `website`, the dealer's own domain as the MANUFACTURER states it.
//
// That last field is why this source exists. The registry's other two growth
// paths each have to work for a domain: harvest-dealers.mjs can only see a
// rooftop whose car linked to its own site (the Stellantis new-inventory lane
// links to jeep.com, so it harvests nothing), and resolve-dealers.mjs GUESSES
// candidate domains from a licensed name and then has to verify the identity on
// the page it lands on — 69% recall, and the 31% it misses are exactly the
// dealers whose domain doesn't look like their name. Here nobody guesses:
// Stellantis publishes the pairing. Rows still land as status "discovered", the
// same contract as every other source — probe.mjs validates extraction before
// anything joins the crawl — and this script only ever APPENDS.
//
// WHY THIS LANE, MEASURED (2026-08-29): against Autotrader, Wrangler 4xe
// coverage sat at ≤56%, the worst of any nameplate, and the registry held only
// ~411 CDJR-named domains against roughly 2,400 CDJR rooftops nationally. The
// Stellantis inventory API cannot close that: its result rows carry dealerCode
// and dealerZipCode and NOTHING else about the seller (verified live — the row
// keys are llp/match/options/…/dealerCode/dealerZipCode, no name, no site), so
// the cars it finds can never name a rooftop to go crawl.
//
// FORD HAS NO EQUIVALENT and is deliberately not attempted here. ford.com's
// robots.txt Disallows /finder, /finder* and /finder/* — the dealer locator —
// and www.ford.com/dealerships/ renders its list client-side off that same
// service. Its sitemap index publishes no dealers_sitemap.xml (404) and its
// localsitemap.xml is 38 regional marketing markets with no rooftop roster.
// That is policy, not a wall to route around. Ford rooftops reach the registry
// through the Ford Blue Advantage marketplace instead (see fba-dealers, and
// harvest-dealers.mjs on the nightly).
//
// ROBOTS: /directory/ is not disallowed on any of these hosts, and the pages
// are the ones each brand's own sitemap publishes for crawlers. fetchPage()
// re-checks robots per host anyway.
import { readFile, writeFile } from "node:fs/promises";
import { fetchPage, setCacheTtl } from "./lib/http.mjs";

const args = process.argv.slice(2);
const WRITE = args.includes("--write");
const DUMP = (() => { const i = args.indexOf("--dump"); return i >= 0 ? args[i + 1] : null; })();
const hosts = args.filter((a) => !a.startsWith("--") && a !== DUMP);
// All four CDJR brands by default: the rooftops overlap heavily but not
// completely — a Ram-only commercial store or a Chrysler/Dodge point without a
// Jeep franchise appears in one directory and not the others.
const HOSTS = hosts.length ? hosts : ["www.jeep.com", "www.ramtrucks.com", "www.dodge.com", "www.chrysler.com"];

// A week: the directory changes on the timescale of franchise transfers, and a
// warm cache makes a re-run (or a second brand covering the same city) free.
setCacheTtl(7 * 24 * 3600_000);

const decode = (s) =>
  s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#34;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

// Hosts that appear in a `website` field but are not a rooftop's own site: the
// brand storefronts themselves and the marketplaces with their own lanes.
// (Same intent as harvest-dealers.mjs's NOT_A_ROOFTOP, narrowed to what a
// dealer directory can actually emit.)
const NOT_A_ROOFTOP =
  /(^|\.)(jeep|dodge|chrysler|ramtrucks|ram|fiatusa|alfaromeousa|mopar|stellantis|driveway|carvana|carmax|autotrader|cargurus|cars|edmunds|kbb|truecar)\.(com|net|us)$/i;

const normalize = (site) => {
  const s = String(site ?? "").trim();
  if (!s) return null;
  try {
    return new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
};

// ── sweep ───────────────────────────────────────────────────────────────────
const found = new Map(); // domain -> { name, city, state, zip, brands:Set, codes:Set }
for (const host of HOSTS) {
  const idx = await fetchPage(`https://${host}/dealers_sitemap.xml`);
  if (idx.status !== 200 || !idx.body) { console.error(`${host}: dealers_sitemap.xml → ${idx.status}, skipping`); continue; }
  const cityPages = [...idx.body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)]
    .map((m) => m[1])
    .filter((u) => /\/directory\/[^/]+\/[^/]+\.html$/.test(u));
  console.error(`${host}: ${cityPages.length} city pages`);

  let done = 0, failed = 0, rooftops = 0;
  for (const url of cityPages) {
    const r = await fetchPage(url);
    done++;
    if (r.status !== 200 || !r.body) { failed++; continue; }
    const m = /data-component="DealersList"[^>]*?data-props="([^"]*)"/.exec(r.body);
    if (!m) continue;
    let props;
    try { props = JSON.parse(decode(m[1])); } catch { failed++; continue; }
    for (const d of props.dealersList ?? []) {
      rooftops++;
      const domain = normalize(d.website);
      if (!domain || !domain.includes(".") || NOT_A_ROOFTOP.test(domain)) continue;
      if (!found.has(domain)) {
        found.set(domain, {
          name: String(d.dealerName ?? "").replace(/\s+/g, " ").trim(),
          city: d.dealerCity || undefined,
          state: d.dealerState || undefined,
          zip: String(d.dealerZipCode ?? "").slice(0, 5) || undefined,
          brands: new Set(),
          codes: new Set(),
        });
      }
      const f = found.get(domain);
      f.brands.add(host.replace(/^www\./, "").replace(/\.com$/, ""));
      if (d.dealerCode) f.codes.add(String(d.dealerCode));
    }
  }
  console.error(`${host}: ${done} pages (${failed} failed), ${rooftops} directory rows, ${found.size} distinct rooftop domains so far`);
}

console.error(`\ntotal distinct rooftop domains across ${HOSTS.length} directories: ${found.size}`);
if (DUMP) await writeFile(DUMP, JSON.stringify([...found.entries()].map(([d, f]) => ({ domain: d, ...f, brands: [...f.brands], codes: [...f.codes] })), null, 2));

// ── append ──────────────────────────────────────────────────────────────────
const regUrl = new URL("./registry/registry.json", import.meta.url);
const raw = await readFile(regUrl, "utf-8");
const registry = JSON.parse(raw);
// Same guard harvest-dealers.mjs uses: if the file no longer round-trips,
// appending would rewrite every line as a side effect. The registry is
// hand-curated; refuse rather than reformat it.
if (JSON.stringify(registry, null, 2) !== raw) {
  console.error("brand-directory-dealers: registry does not round-trip JSON.stringify(…, 2) — refusing to append");
  process.exit(1);
}
const known = new Set(registry.sites.map((s) => s.domain.replace(/^www\./, "").toLowerCase()));

const today = new Date().toISOString().slice(0, 10);
const additions = [];
for (const [domain, f] of [...found.entries()].sort()) {
  if (known.has(domain)) continue;
  const brands = [...f.brands].sort().join("/");
  additions.push({
    domain,
    name: f.name || "Dealership Website",
    kind: "rooftop",
    platform: "unknown",
    robots: "unknown",
    status: "discovered",
    notes: `Listed by Stellantis in its own ${brands} dealer directory (/directory/<state>/<city>.html), which states this rooftop's website — the domain is the manufacturer's, not generated from the name${f.codes.size ? `; dealer code ${[...f.codes].sort().join("/")}` : ""} (${today})`,
    ...(f.city || f.state || f.zip ? { location: { city: f.city, state: f.state, zip: f.zip } } : {}),
  });
}

console.error(`already tracked: ${found.size - additions.length}, new: ${additions.length}`);
if (!additions.length) process.exit(0);

if (WRITE) {
  registry.sites.push(...additions);
  await writeFile(regUrl, JSON.stringify(registry, null, 2));
  console.error(`appended ${additions.length} discovered rows`);
} else {
  console.error("dry run (--write to append). First 30:");
  for (const a of additions.slice(0, 30)) console.error(`  ${a.domain}  ${a.name}  ${a.location?.state ?? ""}`);
}
