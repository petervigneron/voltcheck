#!/usr/bin/env node
// State EV-rebate participating-dealer lists → registry.json.
//
// States that run point-of-sale EV rebates must enrol the dealers who offer
// them, and several publish the resulting roster. That roster is a curated
// list of dealerships that demonstrably sell EVs — far better crawl seeds
// than sweeping OpenStreetMap for every car lot. Rows land as "discovered";
// probe.mjs decides which ones our extractors actually work on.
//
//   node import-dealers.mjs [--dry-run]
//
// Sources are public pages fetched with the project's polite client. Adding
// a state means adding one entry to SOURCES.
import { readFile, writeFile } from "node:fs/promises";
import { fetchRaw } from "./lib/http.mjs";

const DRY = process.argv.includes("--dry-run");

// Minimal RFC4180-ish CSV parser (quoted fields may contain commas/newlines).
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

// Hosts that appear in these pages but aren't dealers.
const NOT_DEALERS =
  /(energycenter|njcleanenergy|chargeupnj|state\.|\.gov|google|facebook|twitter|instagram|youtube|linkedin|jquery|bootstrap|cloudflare|arcgis|adobe|w3\.org|schema\.org|godaddy|wordpress)/i;

function toDomain(url) {
  if (!url) return null;
  let u = String(url).trim();
  if (!u || u === "-") return null;
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  try {
    const host = new URL(u).hostname.toLowerCase().replace(/^www\./, "");
    if (!host.includes(".") || NOT_DEALERS.test(host)) return null;
    return host;
  } catch {
    return null;
  }
}

// Rosters that are just a list of linked dealer names: take every external
// anchor and use its own text as the dealer name.
function parseAnchorRoster(text) {
  const out = [];
  for (const m of text.matchAll(/<a[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const domain = toDomain(m[1]);
    if (!domain) continue;
    const name = m[2].replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
    out.push({ name: name && !/^https?:/i.test(name) ? name : undefined, domain });
  }
  return out;
}

const SOURCES = [
  {
    state: "CO",
    program: "Vehicle Exchange Colorado",
    url: "https://docs.google.com/spreadsheets/d/1G-nzeJoPgiBLMnGAeZNzFGHpmBbSRfVzNkSfIdHf8dg/export?format=csv",
    parse(text) {
      const rows = parseCsv(text).slice(1); // header: Name, County, City, Address, Website
      return rows.map((r) => ({ name: r[0]?.trim(), city: r[2]?.trim(), domain: toDomain(r[4]) }));
    },
  },
  // Oregon DEQ publishes its roster as five regional ArcGIS CSVs, and is the
  // only state that flags whether a dealer sells new, used, or both.
  ...[
    "9d0b4d2381fc445082b874fbae5518c4",
    "c35eb1a7396245d99783a14e6a907c50",
    "22636476a8d44031b28fa84c285f3698",
    "551432d2eb1f4cfa8fb059991fbd41d2",
    "c6e2321495d04c449997b32d001dd4f4",
  ].map((id, i) => ({
    state: "OR",
    program: `Oregon Clean Vehicle Rebate (region ${i + 1})`,
    url: `https://www.arcgis.com/sharing/rest/content/items/${id}/data`,
    parse(text) {
      const rows = parseCsv(text);
      const hdr = rows[0].map((h) => h.trim().toLowerCase());
      const col = (name) => hdr.findIndex((h) => h.includes(name));
      const [iName, iSite, iAddr, iUsed] = [col("dealership"), col("website"), col("full address"), col("new or used")];
      return rows.slice(1).map((r) => ({
        name: r[iName]?.trim(),
        city: r[iAddr]?.split(",")[1]?.trim(),
        sellsUsed: /both|used/i.test(r[iUsed] ?? ""),
        domain: toDomain(r[iSite]),
      }));
    },
  })),
  // Massachusetts MOR-EV paginates its roster 9 dealers at a time. Notably
  // the only roster that clearly includes independent used lots, which is
  // where a lot of cheap EVs live.
  ...Array.from({ length: 37 }, (_, i) => ({
    state: "MA",
    program: "MOR-EV",
    url: `https://mor-ev.org/participating-dealers?page=${i}`,
    parse: parseAnchorRoster,
  })),
  {
    state: "DE",
    program: "DNREC Clean Vehicle Rebate",
    url: "https://driveelectricdelaware.org/rebate-dealership",
    parse: parseAnchorRoster,
  },
  {
    state: "NJ",
    program: "Charge Up New Jersey",
    url: "https://chargeup.njcleanenergy.com/eligible-dealerships",
    // One static HTML table; the dealer name is the anchor's own text when
    // present, else the row's first cell.
    parse(text) {
      const out = [];
      for (const m of text.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
        const cells = [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) =>
          c[1].replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim()
        );
        const href = m[1].match(/href=["'](https?:\/\/[^"']+)["']/i)?.[1];
        const domain = toDomain(href);
        if (domain) out.push({ name: cells[0] || undefined, city: cells[1] || undefined, domain });
      }
      return out;
    },
  },
];

const regUrl = new URL("./registry/registry.json", import.meta.url);
const registry = JSON.parse(await readFile(regUrl, "utf-8"));
const known = new Set(registry.sites.map((s) => s.domain));

let added = 0, seen = 0, dupes = 0;
const byDomain = new Map();

for (const src of SOURCES) {
  let res;
  try {
    res = await fetchRaw(src.url, { timeoutMs: 45000 });
  } catch (e) {
    console.error(`  ${src.state} ${src.program}: fetch failed (${e.name}) — skipped`);
    continue;
  }
  if (res.status !== 200 || !res.body) {
    console.error(`  ${src.state} ${src.program}: HTTP ${res.status} — skipped`);
    continue;
  }
  const rows = src.parse(res.body).filter((r) => r.domain);
  seen += rows.length;
  for (const r of rows) {
    if (byDomain.has(r.domain)) { dupes++; continue; }
    byDomain.set(r.domain, { ...r, state: src.state, program: src.program });
  }
  console.error(`  ${src.state} ${src.program}: ${rows.length} dealers with websites`);
}

for (const [domain, d] of byDomain) {
  if (known.has(domain)) { dupes++; continue; }
  registry.sites.push({
    domain,
    name: d.name || domain,
    kind: "rooftop",
    platform: "unknown",
    robots: "unknown",
    status: "discovered",
    notes:
      `Enrolled in ${d.program} (${d.state}) — state-published participating-dealer roster, imported ${new Date().toISOString().slice(0, 10)}` +
      (d.city ? `; ${d.city}` : "") +
      (d.sellsUsed === true ? "; sells used" : d.sellsUsed === false ? "; new only" : ""),
  });
  added++;
}

registry._sources = registry._sources ?? [];
for (const s of ["Colorado Vehicle Exchange participating dealers (CO Energy Office)",
                 "Oregon Clean Vehicle Rebate participating dealers (OR DEQ)",
                 "Charge Up New Jersey eligible dealerships (NJ BPU)"]) {
  if (!registry._sources.includes(s)) registry._sources.push(s);
}

if (!DRY) await writeFile(regUrl, JSON.stringify(registry, null, 2));
console.error(
  `\n${seen} roster rows with websites → ${byDomain.size} unique domains → ${added} new registry entries ` +
  `(${dupes} already known/duplicated)${DRY ? " [dry run, nothing written]" : ""}`
);
console.error(`registry now ${registry.sites.length} sites`);
