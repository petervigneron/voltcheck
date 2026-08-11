#!/usr/bin/env node
// Registry discovery via OpenStreetMap Overpass (ODbL; attribution kept in
// registry meta). Finds car dealers with website tags in a bbox, probes each
// domain, fingerprints its platform, and merges rows into registry.json.
//   node discover.mjs <south> <west> <north> <east>
import { readFile, writeFile } from "node:fs/promises";
import { fetchRaw } from "./lib/http.mjs";
import { fingerprint } from "./lib/fingerprint.mjs";

// --file <path> reuses a saved Overpass response instead of querying live
const fileIdx = process.argv.indexOf("--file");
const fromFile = fileIdx >= 0 ? process.argv[fileIdx + 1] : null;
const coordArgs = process.argv.slice(2).filter((a, i) => i !== fileIdx - 2 && i !== fileIdx - 1);
const [s, w, n, e] = coordArgs.map(Number);
if (!fromFile && [s, w, n, e].some((x) => !Number.isFinite(x))) {
  console.error("usage: node discover.mjs <south> <west> <north> <east> [--file overpass.json]");
  process.exit(1);
}

const query = `[out:json][timeout:30];nwr[shop=car]["website"](${s},${w},${n},${e});out tags 200;`;
const MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
let osm = null;
if (fromFile) {
  osm = JSON.parse(await readFile(fromFile, "utf-8"));
}
for (const endpoint of MIRRORS) {
  if (osm) break;
  for (let attempt = 0; attempt < 2 && !osm; attempt++) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "data=" + encodeURIComponent(query),
      });
      const text = await res.text();
      if (res.status === 200 && text.trimStart().startsWith("{")) {
        osm = JSON.parse(text);
      } else {
        // rate-limited or HTML error page — back off and retry/move on
        await new Promise((r) => setTimeout(r, 15000));
      }
    } catch {
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  if (osm) break;
}
if (!osm) {
  console.error("Overpass unavailable on all mirrors right now — try again later.");
  process.exit(2);
}

const found = new Map();
for (const el of osm.elements ?? []) {
  const t = el.tags ?? {};
  const site = t.website ?? t["contact:website"];
  if (!site || !t.name) continue;
  const domain = site.replace(/^https?:\/\/(www\.)?/, "").split("/")[0].toLowerCase();
  if (!domain.includes(".")) continue;
  // National chains get dedicated connectors, not per-rooftop crawl rows
  if (/carmax|carvana|tesla|echopark|autonation\.com/.test(domain)) continue;
  if (!found.has(domain)) found.set(domain, { name: t.name, brand: t.brand });
}
console.error(`${found.size} candidate domains from OSM`);

const regUrl = new URL("./registry/registry.json", import.meta.url);
const registry = JSON.parse(await readFile(regUrl, "utf-8"));
const known = new Set(registry.sites.map((x) => x.domain));

for (const [domain, info] of found) {
  if (known.has(domain)) continue;
  let status = "unreachable";
  let platform = "unknown";
  try {
    const r = await fetchRaw(`https://${domain}/`, { timeoutMs: 12000 });
    if (r.status === 200) {
      status = "discovered";
      platform = fingerprint(r.body);
    } else {
      status = `http-${r.status}`;
    }
  } catch {
    /* stays unreachable */
  }
  registry.sites.push({
    domain,
    name: info.name,
    kind: "rooftop",
    platform,
    robots: "unknown",
    status,
    notes: `Discovered via OSM Overpass${fromFile ? " (cached query)" : ` bbox (${s},${w},${n},${e})`}${info.brand ? `; brand: ${info.brand}` : ""}`,
  });
  console.error(`  ${domain} → ${status} (${platform})`);
}

registry._sources = registry._sources ?? [];
if (!registry._sources.some((x) => x.startsWith("OpenStreetMap"))) {
  registry._sources.push("OpenStreetMap via Overpass API (ODbL) — © OpenStreetMap contributors");
}
await writeFile(regUrl, JSON.stringify(registry, null, 2));
console.error(`registry now has ${registry.sites.length} sites`);
