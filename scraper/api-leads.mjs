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
  "twilio", "podium", "gubagoo", "cloudinary", "woodsidecredit",
];

// Hosts we already cover, so the tool never sends anyone to rebuild a lane that
// exists (it nearly did: omnigraph.audi.com read "UNBUILT" until this list knew
// lib/oem/audi.mjs already pulls the whole Audi network's BEVs nationally).
// Two kinds of "covered":
//   oem  — a national OEM lane already ingests these rooftops' EVs under a
//          synthetic domain; the parked dealer-domain rows are redundant for EV
//          coverage, NOT a gap. Grep lib/oem/ before adding a build here.
//   site — a per-site extractor exists; a parked lead is a re-probe target whose
//          verdict predates the lane, not a new build.
const HAVE_LANE = [
  { re: /omnigraph\.audi\.com|renderer\.one\.audi/i, lane: "oem:audi", kind: "oem" },
  { re: /shop\.ford\.com|mps\.ford\.com|foundational\.ford\.com/i, lane: "oem:ford", kind: "oem" },
  { re: /teamvelocityportal/i, lane: "team-velocity", kind: "site" },
  { re: /dealr\.cloud/i, lane: "dealrcloud", kind: "site" },
  { re: /overfuel/i, lane: "overfuel", kind: "site" },
  { re: /typesense|dealervenom/i, lane: "dealervenom", kind: "site" },
  { re: /app\.ridemotive\.com/i, lane: "ridemotive", kind: "site" },
];

// Hosts a rooftop names that are NOT its inventory, beyond the widget list
// above — each one checked by reading what the page actually does with it, so
// nobody spends a day building a lane for a login button.
//
//   websites.api.remora.inc — Remora's OAuth endpoint (/oauth/google,
//   /oauth/apple). It ranked 6 rooftops here and looked like a platform API.
//   Remora server-renders its whole SRP and its VDPs carry full schema.org
//   Car JSON-LD; all 6 of those rooftops were parked for a different reason
//   entirely (their registry domain redirects to another host, so the probe
//   was asking the wrong origin) and all 6 promote without any new extractor.
//
//   api.connectcdk.com — CDK's service-appointment app. Every reference on
//   both rooftops read (subaruyakima.com and tristatenissan.com, 2026-08-23)
//   is the same "Schedule Service" link to
//   /api/nc-cosa-consumer-ui/v1/?cid=…, in the nav, a button and a widget
//   config. No inventory passes through it.
NOT_INVENTORY.push("remora.inc", "remorainc.com", "connectcdk.com");

const registry = JSON.parse(await readFile(new URL("./registry/registry.json", import.meta.url), "utf-8"));

// The hosts one row names. probe.mjs writes them as a list on `probe.apiHosts`
// (since 2026-08-23); older rows only ever had them inside the note's prose,
// which is what this tool used to parse — finding #1 above. Read the field
// when it is there and keep the prose reader for the rows written before it,
// which is most of the pile until a full re-probe.
function hostsOf(site) {
  if (Array.isArray(site.probe?.apiHosts)) return site.probe.apiHosts;
  const out = [];
  for (const m of (site.notes ?? "").matchAll(/api-hosts?:\s*([^|)]+)/gi)) out.push(...m[1].split(/[+,]/));
  return out;
}

// host -> Set(domains). One row can name several hosts; each is counted once.
const byHost = new Map();
for (const s of registry.sites) {
  if (!PARKED.test(s.status)) continue;
  for (const raw of hostsOf(s)) {
    const host = raw.trim().toLowerCase().replace(/[.,;]+$/, "");
    if (!host || !host.includes(".")) continue; // "nextjs"/"algolia" tokens
    if (NOT_INVENTORY.some((n) => host.includes(n))) continue;
    if (!byHost.has(host)) byHost.set(host, new Set());
    byHost.get(host).add(s.domain);
  }
}

const rows = [...byHost.entries()]
  .map(([host, domains]) => {
    const hit = HAVE_LANE.find((l) => l.re.test(host));
    return {
      host,
      rooftops: domains.size,
      lane: hit?.lane ?? null,
      kind: hit?.kind ?? "unbuilt",
      sample: [...domains].slice(0, 5),
    };
  })
  .filter((r) => r.rooftops >= MIN)
  .sort((a, b) => b.rooftops - a.rooftops);

if (asJson) {
  await mkdir(new URL("./out/", import.meta.url), { recursive: true });
  await writeFile(new URL("./out/api-leads.json", import.meta.url), JSON.stringify(rows, null, 2));
  console.error(`wrote scraper/out/api-leads.json (${rows.length} hosts)`);
} else {
  const totalRooftops = new Set([...byHost.values()].flatMap((s) => [...s])).size;
  const unbuilt = rows.filter((r) => r.kind === "unbuilt");
  console.log(`API-host leads across ${totalRooftops} parked rooftops (hosts on ≥${MIN}, widgets filtered).`);
  console.log(`Tags: [oem:*] already ingested nationally (not a gap) · [name] have a per-site lane (re-probe) · [BUILD] genuinely unbuilt.`);
  console.log(`${unbuilt.length} hosts are genuinely unbuilt.\n`);
  console.log("rooftops  status         host / sample");
  for (const r of rows) {
    const tag = r.kind === "unbuilt" ? "[BUILD]" : `[${r.lane}]`;
    console.log(`${String(r.rooftops).padStart(6)}  ${tag.padEnd(13)} ${r.host}`);
    console.log(`${" ".repeat(22)}${r.sample.join(", ")}`);
  }
}
