#!/usr/bin/env node
// Turn the probe's captured "api-hosts:" leads into a ranked worklist.
//
// When probe.mjs can't extract a site, spaSignals records WHERE the inventory
// actually lives — "client-rendered or API-backed; leads: api-hosts:api.overfuel.com,
// nextjs". That lead is the escape hatch: a client-rendered site that names its
// own inventory API in the page is exactly what the Overfuel and DealerVenom
// lanes were built against (find the inline API config, page the endpoint). But
// the lead was only ever prose in a notes field, so the same opportunity sat
// unmined across hundreds of rows — api.overfuel.com was logged for days before
// anyone read it, and omnigraph.audi.com is logged on 263 Audi rooftops now.
//
// This reads those leads back out, drops the third-party widget hosts (chat,
// reviews, maps, analytics — not inventory), dedupes by host, and ranks by how
// many distinct rooftops point at each one. A host at the top with no extractor
// yet is the next lane to build; one we already cover is a re-probe target.
//
//   node api-leads.mjs [--min 3] [--json]
import { readFile, writeFile, mkdir } from "node:fs/promises";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const MIN = Number(arg("--min", 3)); // ignore hosts on fewer than N rooftops
const asJson = process.argv.includes("--json");

// A parked row is one we failed to extract — the pile where a live API lead is
// a missed opportunity rather than redundant with a working crawl.
const PARKED = /^(needs-investigation|unreachable|blocked|http-\d+)$/;

// Third-party hosts that appear in dealer pages but never serve the inventory:
// chat widgets, review badges, maps, tag managers, CRMs, the CMS's own core
// API. Matched as a substring of the host, so "judge.me" catches "api.judge.me".
const NOT_INVENTORY = [
  "whatsapp", "judge.me", "trustindex", "mapbox", "visitor.chat", "wixapps",
  "cargurus", "leadconnectorhq", "seoparadox", "expireddomains", "tinybird",
  "mykaarma", "w.org", "gstatic", "googleapis", "google.com", "facebook",
  "doubleclick", "cloudflare", "jsdelivr", "cookielaw", "onetrust", "hotjar",
  "recaptcha", "youtube", "vimeo", "gravatar", "wp.com", "sentry", "segment",
  "twilio", "podium", "gubagoo", "cloudinary",
];

// Hosts we already have an extractor/lane for — a lead here is a re-probe
// target (the verdict predates the lane), not a new build.
const HAVE_LANE = [
  { re: /teamvelocityportal/i, lane: "team-velocity" },
  { re: /dealr\.cloud/i, lane: "dealrcloud" },
  { re: /overfuel/i, lane: "overfuel" },
  { re: /typesense|dealervenom/i, lane: "dealervenom" },
];

const registry = JSON.parse(await readFile(new URL("./registry/registry.json", import.meta.url), "utf-8"));

// host -> Set(domains). One row can name several hosts; each is counted once.
const byHost = new Map();
for (const s of registry.sites) {
  if (!PARKED.test(s.status)) continue;
  const notes = s.notes ?? "";
  for (const m of notes.matchAll(/api-hosts?:\s*([^|)]+)/gi)) {
    for (const raw of m[1].split(/[+,]/)) {
      const host = raw.trim().toLowerCase().replace(/[.,;]+$/, "");
      if (!host || !host.includes(".")) continue; // "nextjs"/"algolia" tokens
      if (NOT_INVENTORY.some((n) => host.includes(n))) continue;
      if (!byHost.has(host)) byHost.set(host, new Set());
      byHost.get(host).add(s.domain);
    }
  }
}

const rows = [...byHost.entries()]
  .map(([host, domains]) => ({
    host,
    rooftops: domains.size,
    lane: HAVE_LANE.find((l) => l.re.test(host))?.lane ?? null,
    sample: [...domains].slice(0, 5),
  }))
  .filter((r) => r.rooftops >= MIN)
  .sort((a, b) => b.rooftops - a.rooftops);

if (asJson) {
  await mkdir(new URL("./out/", import.meta.url), { recursive: true });
  await writeFile(new URL("./out/api-leads.json", import.meta.url), JSON.stringify(rows, null, 2));
  console.error(`wrote scraper/out/api-leads.json (${rows.length} hosts)`);
} else {
  const totalRooftops = new Set([...byHost.values()].flatMap((s) => [...s])).size;
  console.log(`API-host leads across ${totalRooftops} parked rooftops (hosts on ≥${MIN}, widgets filtered):\n`);
  console.log("rooftops  lane          host / sample");
  for (const r of rows) {
    const tag = r.lane ? `[${r.lane}]` : "[UNBUILT]";
    console.log(`${String(r.rooftops).padStart(6)}  ${tag.padEnd(13)} ${r.host}`);
    console.log(`${" ".repeat(22)}${r.sample.join(", ")}`);
  }
}
