#!/usr/bin/env node
// Resolve license-roll dealers to their websites for free: businesses that
// want to be found register domains guessable from their names.
//
//   node resolve-dealers.mjs <roll.csv> [--write] [--limit N]
//
// The pipeline is generate → DNS → fetch → verify, and each stage is honest
// about what it proves. Candidate domains are deterministic transforms of the
// dealer's licensed name (word subsets, brand abbreviations, city combos —
// see lib/dealer-names.mjs, which owns them and is measured on its own).
// Recovery against the name→domain pairs the registry already knows was 52%
// when this shipped in 2026-08-17; re-measured 2026-08-23 on the 7,432 pairs
// this generator did not itself create, it is 69%, and 83% on the subset
// carrying a state, which every roll row does. DNS resolution is free and
// touches nobody's server. Only
// resolving candidates are fetched, politely, once per domain. And a match is
// claimed ONLY when the page itself asserts the identity: it shows the roll's
// phone number (digit-exact), or the dealer's squashed name together with its
// zip (preferred — near-unique) or, only when the roll carries no zip, its
// city alone. A parked domain, a different Eagle Auto Sales three states
// away, or a lot using its accountant's domain all fail that check and are
// dropped — matching nothing is honest, matching the wrong thing is not.
// City-alone used to be an equal fallback even when a zip was known and
// disagreed; a 30-sample hand-check on 2026-08-20 caught the failure mode
// this comment already warned about — hudsoncollision.com matched "Hudson
// Collision Center" + "Hudson" to a same-named, same-city-named shop in
// Hudson, OHIO, not the licensed one in Hudson, NY — so zip now gates first.
//
// Verified dealers are appended to the registry as "discovered", the same
// contract as every discovery source: probe.mjs validates extraction before
// anything joins the crawl.
import { readFile, writeFile } from "node:fs/promises";
import { Resolver } from "node:dns/promises";
import { fetchPage, setCacheTtl } from "./lib/http.mjs";
import { squash, candidates, BRANDS } from "./lib/dealer-names.mjs";

const args = process.argv.slice(2);
const WRITE = args.includes("--write");
const LIMIT = (() => { const i = args.indexOf("--limit"); return i >= 0 ? Number(args[i + 1]) : 0; })();
const CONC = (() => { const i = args.indexOf("--concurrency"); return i >= 0 ? Number(args[i + 1]) : 24; })();
const DUMP_UNRESOLVED = (() => { const i = args.indexOf("--dump-unresolved"); return i >= 0 ? args[i + 1] : null; })();
// A deterministic random subset of the roll, so a bounded run measures the
// whole roll rather than its alphabetical head (--limit takes the first N,
// which on every roll here means the A's).
const SAMPLE = (() => { const i = args.indexOf("--sample"); return i >= 0 ? Number(args[i + 1]) : 0; })();
const SEED = (() => { const i = args.indexOf("--seed"); return i >= 0 ? Number(args[i + 1]) : 20260823; })();
// Rolls that carry no state column (FL's HTML tables) get it from the flag.
const STATE = (() => { const i = args.indexOf("--state"); return i >= 0 ? args[i + 1] : null; })();
const csvPath = args.find((a) => !a.startsWith("--"));
setCacheTtl(24 * 3600_000);

// ── roll parsing (WA DOL shape; header-driven so other rolls can follow) ────
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (field !== "" || row.length) { row.push(field); rows.push(row); row = []; field = ""; }
      if (ch === "\r" && text[i + 1] === "\n") i++;
    } else field += ch;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  const header = rows[0];
  return rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

const digits = (s) => String(s ?? "").replace(/\D/g, "");

const rollText = await readFile(csvPath, "utf-8");
// A dumped --dump-unresolved file can be fed straight back in, so a rerun
// after a resolver change only spends fetches on rows that failed before.
const raw = csvPath.endsWith(".json") ? JSON.parse(rollText) : parseCsv(rollText);
// NY: retail classes only (DLN franchise / DLU used) — wholesalers,
// dismantlers and salvage pools hold licenses but sell nothing retail.
const filtered = raw.filter((r) => !r.business_type || ["DLN", "DLU"].includes(r.business_type));
const dealers = filtered.map((r) => ({
  // NY splits long names across an overflow column ("ACURA OF BEDFORD" + "HILLS").
  name: r.name || r.location_name || r.business_name || [r.facility_name, r.facility_name_overflow].filter(Boolean).join(" ") || r["DEALER NAME"],
  alt: r.alt ?? (r.business_name && r.business_name !== r.location_name ? r.business_name : null),
  city: r.city || r.location_city || r.facility_city || r["LOCATION CITY"],
  state: r.state || r.location_state || r.facility_state || STATE || "WA",
  zip: (r.zip || r.location_postal_code || r.facility_zip_code || r["LOCATION ZIP"] || "").slice(0, 5),
  phone: digits(r.phone || r.phone_number || r.PHONE).slice(-10),
})).filter((d) => d.name);
let work = LIMIT ? dealers.slice(0, LIMIT) : dealers;
if (SAMPLE && SAMPLE < work.length) {
  let x = SEED >>> 0;
  const rnd = () => (x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  work = work.map((d) => [rnd(), d]).sort((a, b) => a[0] - b[0]).slice(0, SAMPLE).map((p) => p[1]);
  console.error(`sampled ${work.length} of ${dealers.length} rows (seed ${SEED})`);
}
console.error(`${work.length} dealers from ${csvPath}`);

// ── stage 1+2: candidates → DNS ─────────────────────────────────────────────
const registry = JSON.parse(await readFile(new URL("./registry/registry.json", import.meta.url), "utf-8"));
const knownDomains = new Set(registry.sites.map((s) => s.domain.replace(/^www\./, "")));
const TLDS = [".com", ".net", ".biz", ".us"];
const resolver = new Resolver();
resolver.setServers(["1.1.1.1", "8.8.8.8"]);

const wantDomains = new Map(); // domain -> [dealer indices]
work.forEach((d, i) => {
  const cands = new Set([...candidates(d.name, d.city, d.state), ...(d.alt ? candidates(d.alt, d.city, d.state) : [])]);
  for (const c of cands) for (const tld of TLDS) {
    const dom = c + tld;
    if (!wantDomains.has(dom)) wantDomains.set(dom, []);
    wantDomains.get(dom).push(i);
  }
});
console.error(`${wantDomains.size} candidate domains to DNS-check`);

const resolves = new Set();
{
  const doms = [...wantDomains.keys()];
  let next = 0, done = 0;
  await Promise.all(Array.from({ length: 200 }, async () => {
    while (next < doms.length) {
      const dom = doms[next++];
      try { await resolver.resolve4(dom); resolves.add(dom); } catch {}
      if (++done % 5000 === 0) console.error(`  dns ${done}/${doms.length} (${resolves.size} resolve)`);
    }
  }));
}
console.error(`${resolves.size} of ${wantDomains.size} candidates resolve`);

// ── stage 3+4: fetch + identity verification ────────────────────────────────
// .com/.net first; a dealer that already verified stops spending fetches.
const order = [...resolves].sort((a, b) => TLDS.findIndex((t) => a.endsWith(t)) - TLDS.findIndex((t) => b.endsWith(t)));
const verified = new Map(); // dealerIdx -> {domain, how}
const already = new Map(); // dealerIdx -> domain (known registry domain)
for (const dom of order) {
  if (knownDomains.has(dom)) for (const i of wantDomains.get(dom)) if (!already.has(i)) already.set(i, dom);
}
let fetched = 0, next2 = 0;
const fetchList = order.filter((dom) => !knownDomains.has(dom) && wantDomains.get(dom).some((i) => !verified.has(i)));
console.error(`${fetchList.length} resolving domains to fetch+verify`);
await Promise.all(Array.from({ length: CONC }, async () => {
  while (next2 < fetchList.length) {
    const dom = fetchList[next2++];
    const owners = wantDomains.get(dom).filter((i) => !verified.has(i) && !already.has(i));
    if (!owners.length) continue;
    const res = await fetchPage(`https://${dom}/`);
    fetched++;
    if (fetched % 200 === 0) console.error(`  fetched ${fetched}/${fetchList.length} (${verified.size} verified)`);
    if (res.status !== 200 || !res.body) continue;
    const body = res.body.slice(0, 500_000);
    const pageDigits = body.replace(/\D+/g, "");
    const pageSquash = squash(body.replace(/<[^>]+>/g, " ")).replace(/ /g, "");
    for (const i of owners) {
      const d = work[i];
      let how = null;
      if (d.phone?.length === 10 && pageDigits.includes(d.phone)) how = "phone";
      else {
        const nm = squash(d.name).replace(/ /g, "");
        const cty = squash(d.city ?? "").replace(/ /g, "");
        // Zip beats city when we have one: a hand-check of 30 verified NY
        // matches (2026-08-20) found hudsoncollision.com — a real business,
        // just the wrong one — matched on name + "hudson" because Hudson, OH
        // has an unrelated same-named collision shop and the roll's own
        // Hudson, NY zip was never required. City names collide across
        // states constantly (Hudson, Springfield, Rome, Greenville…); a
        // 5-digit zip essentially never does. So when the roll row carries a
        // zip, require it — city alone no longer clears the gate on its own.
        if (nm.length >= 8 && pageSquash.includes(nm)) {
          if (d.zip && pageDigits.includes(d.zip)) how = "name+zip";
          else if (!d.zip && cty && pageSquash.includes(cty)) how = "name+city";
        }
      }
      if (how) verified.set(i, { domain: dom, how });
    }
  }
}));

console.error(`\nverified: ${verified.size} of ${work.length} dealers (${already.size} already tracked in registry)`);
const byHow = {};
for (const v of verified.values()) byHow[v.how] = (byHow[v.how] || 0) + 1;
console.error("verification method:", JSON.stringify(byHow));

if (DUMP_UNRESOLVED) {
  const unresolved = work
    .map((d, i) => ({ i, d }))
    .filter(({ i }) => !verified.has(i) && !already.has(i))
    .map(({ d }) => d);
  await writeFile(DUMP_UNRESOLVED, JSON.stringify(unresolved, null, 2));
  console.error(`dumped ${unresolved.length} unresolved dealers to ${DUMP_UNRESOLVED}`);
}

// ── append to registry ──────────────────────────────────────────────────────
const today = new Date().toISOString().slice(0, 10);
const HOW_TEXT = {
  phone: "the roll's phone number",
  "name+zip": "licensed name + the roll's zip",
  "name+city": "licensed name + city (the roll row carries no zip)",
};
// Washington licenses every dealer under one class — the roll cannot say
// franchise or independent — so the only signal available is whether the
// licensed name carries an OEM brand. That is an inference, not the state's
// word, and the note says so; nothing downstream may read it as the license
// class it is not.
const classNote = (d) => {
  if (!/^WA$/i.test(d.state ?? "")) return "";
  const words = new Set(squash(d.name).split(" "));
  const brand = [...BRANDS].find((b) => words.has(b));
  return brand
    ? `; WA licenses one dealer class only, so class is inferred from the name carrying an OEM brand (${brand}) — franchise, inferred`
    : "; WA licenses one dealer class only, and the licensed name carries no OEM brand — independent, inferred";
};
const additions = [];
const taken = new Set();
for (const [i, v] of verified) {
  if (knownDomains.has(v.domain) || taken.has(v.domain)) continue;
  taken.add(v.domain);
  const d = work[i];
  additions.push({
    domain: v.domain,
    name: d.name.replace(/\s+/g, " ").trim(),
    kind: "rooftop",
    platform: "unknown",
    robots: "unknown",
    status: "discovered",
    notes: `Resolved from the ${d.state} license roll by name→domain candidate generation; identity verified on the page by ${HOW_TEXT[v.how]}${classNote(d)} (${today})`,
    location: { city: d.city, state: d.state, zip: d.zip },
  });
}
console.error(`new registry rows: ${additions.length}`);
if (WRITE && additions.length) {
  const raw2 = await readFile(new URL("./registry/registry.json", import.meta.url), "utf-8");
  const reg2 = JSON.parse(raw2);
  if (JSON.stringify(reg2, null, 2) !== raw2) { console.error("registry does not round-trip — refusing"); process.exit(1); }
  reg2.sites.push(...additions);
  await writeFile(new URL("./registry/registry.json", import.meta.url), JSON.stringify(reg2, null, 2));
  console.error("appended");
} else if (additions.length) {
  await writeFile("/tmp/resolved-dealers.json", JSON.stringify(additions, null, 2));
  console.error("dry run — wrote /tmp/resolved-dealers.json (pass --write to append)");
}
