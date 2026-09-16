#!/usr/bin/env node
// How many browser-lane cars the site is withholding right now, by rooftop.
//
//   node browser-lane-dark.mjs [--json out/dark.json] [--label before]
//                              [--domains-file /tmp/domains.txt]
//
// The measurement the browser crawl takes before and after every run: the
// live rows on the browser-lane rooftops (lib/browser-lane-domains.mjs —
// Dealer Inspire by default, since the Porsche rooftops became a residential
// runner's on 2026-09-16; ask for those with --domains-file over
// `browser-lane-domains.mjs --platforms porsche`, which is what
// porsche-crawl.yml does) that have not been seen or confirmed in 36 hours — the owner's acceptance
// query, in lib/browser-lane-dark.mjs. With SUPABASE_SERVICE_ROLE_KEY it
// reads listing_seen directly (0026 revoked anon's select on it); with only
// the anon key it asks live_listings_feed which of the live VINs it serves,
// which is the same rule from the other side for a dealer-site rooftop (the
// view's rule 2 names only the four marketplace lanes). Both are said in the
// output, so a number is never read without knowing which door it came in.
//
// Cost: ~13,000 rows read in pages of 1,000 by domain chunk, plus (anon) the
// view by VIN in chunks of 200. Measured 2026-09-13 from a laptop over anon:
// 6 s for the rows, 12 s for the view. Not a walk; safe beside a deploy.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fetchWithRetry } from "./lib/retry.mjs";
import { browserLaneDomains } from "./lib/browser-lane-domains.mjs";
import { isDark, summarizeDark } from "./lib/browser-lane-dark.mjs";

async function loadEnv(url) {
  try {
    const text = await readFile(url, "utf-8");
    for (const line of text.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !line.trimStart().startsWith("#") && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}
await loadEnv(new URL("./.env", import.meta.url));

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : fallback;
};
const jsonOut = flag("--json", "");
const label = flag("--label", "now");
const domainsFile = flag("--domains-file", "");

const { SUPABASE_URL, SUPABASE_ANON_KEY: ANON, SUPABASE_SERVICE_ROLE_KEY: SERVICE } = process.env;
if (!SUPABASE_URL || !(SERVICE || ANON)) {
  console.error("browser-lane-dark: no Supabase credentials (scraper/.env) — nothing to measure.");
  process.exit(0);
}
const KEY = SERVICE ?? ANON;
const via = SERVICE ? "listing_seen (service key)" : "live_listings_feed (anon)";

const registry = JSON.parse(await readFile(new URL("./registry/registry.json", import.meta.url), "utf-8"));
const platformOf = new Map(registry.sites.map((s) => [s.domain, s.platform]));
let domains = browserLaneDomains(registry);
if (domainsFile) domains = (await readFile(domainsFile, "utf-8")).split(/\s+/).filter(Boolean);

async function get(path, what) {
  const res = await fetchWithRetry(`browser-lane-dark: ${what}`, () =>
    fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Accept-Encoding": "gzip" } })
  );
  if (!res.ok) throw new Error(`${what}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

const t0 = Date.now();
const rows = [];
let noSeenRow = 0;
const embed = SERVICE ? ",listing_seen(last_seen_at,last_confirmed_at)" : "";
for (let i = 0; i < domains.length; i += 100) {
  const chunk = domains.slice(i, i + 100);
  for (let after = ""; ; ) {
    const page = await get(
      `listings?select=vin,dealer_domain${embed}&delisted_at=is.null&dealer_domain=in.(${chunk.join(",")})` +
        (after ? `&vin=gt.${encodeURIComponent(after)}` : "") +
        `&order=vin.asc&limit=1000`,
      `rows for domains ${i}-${i + chunk.length}`
    );
    for (const r of page) {
      const seen = Array.isArray(r.listing_seen) ? r.listing_seen[0] : r.listing_seen;
      if (SERVICE && !seen) {
        noSeenRow++; // the owner's query inner-joins listing_seen; so does this
        continue;
      }
      rows.push({ vin: String(r.vin).toUpperCase(), dealerDomain: r.dealer_domain, dark: SERVICE ? isDark(seen, t0) : null });
    }
    if (page.length < 1000) break;
    after = page[page.length - 1].vin;
  }
}
if (!SERVICE) {
  const served = new Set();
  const vins = rows.map((r) => r.vin);
  for (let i = 0; i < vins.length; i += 200) {
    const page = await get(`live_listings_feed?select=vin&vin=in.(${vins.slice(i, i + 200).join(",")})`, `served VINs ${i}-${i + 200}`);
    for (const r of page) served.add(String(r.vin).toUpperCase());
  }
  for (const r of rows) r.dark = !served.has(r.vin);
}

const summary = summarizeDark(rows, (d) => platformOf.get(d));
const out = { label, at: new Date(t0).toISOString(), via, browserLaneRooftops: domains.length, noSeenRow, ...summary, seconds: Math.round((Date.now() - t0) / 1000) };
console.error(
  `browser-lane-dark (${label}, ${via}): ${domains.length} browser-lane rooftops, ${out.rooftopsWithLiveRows} with live rows; ` +
    `${out.live} live cars, ${out.dark} dark on ${out.darkRooftops} rooftops (${out.fullyDarkRooftops} fully dark)` +
    (noSeenRow ? `; ${noSeenRow} rows with no listing_seen row skipped` : "") +
    ` — ${out.seconds}s`
);
for (const [p, b] of Object.entries(summary.byPlatform)) console.error(`  ${p}: ${b.dark}/${b.live} cars dark on ${b.darkRooftops}/${b.rooftops} rooftops (${b.fullyDark} fully dark)`);
console.error(`  top: ${summary.top.map((t) => `${t.domain} ${t.dark}/${t.live}`).join(", ")}`);
if (jsonOut) {
  await mkdir(new URL(jsonOut.replace(/[^/]*$/, ""), `file://${process.cwd()}/`), { recursive: true }).catch(() => {});
  await writeFile(jsonOut, JSON.stringify(out, null, 2) + "\n");
}
