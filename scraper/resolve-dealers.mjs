#!/usr/bin/env node
// Resolve license-roll dealers to their websites for free: businesses that
// want to be found register domains guessable from their names.
//
//   node resolve-dealers.mjs <roll.csv> [--write] [--limit N]
//
// The pipeline is generate → DNS → fetch → verify, and each stage is honest
// about what it proves. Candidate domains are deterministic transforms of the
// dealer's licensed name (word subsets, brand abbreviations, city combos) —
// measured 52% recovery against the 9,157 name→domain pairs the registry
// already knows. DNS resolution is free and touches nobody's server. Only
// resolving candidates are fetched, politely, once per domain. And a match is
// claimed ONLY when the page itself asserts the identity: it shows the roll's
// phone number (digit-exact), or the dealer's squashed name together with its
// city or zip. A parked domain, a different Eagle Auto Sales three states
// away, or a lot using its accountant's domain all fail that check and are
// dropped — matching nothing is honest, matching the wrong thing is not.
//
// Verified dealers are appended to the registry as "discovered", the same
// contract as every discovery source: probe.mjs validates extraction before
// anything joins the crawl.
import { readFile, writeFile } from "node:fs/promises";
import { Resolver } from "node:dns/promises";
import { fetchPage, setCacheTtl } from "./lib/http.mjs";

const args = process.argv.slice(2);
const WRITE = args.includes("--write");
const LIMIT = (() => { const i = args.indexOf("--limit"); return i >= 0 ? Number(args[i + 1]) : 0; })();
const csvPath = args.find((a) => !a.startsWith("--"));
setCacheTtl(24 * 3600_000);

// ── candidate generation ────────────────────────────────────────────────────
const ABBREV = {
  volkswagen: ["vw"], chevrolet: ["chevy", "chev"], mercedesbenz: ["mb", "mercedes", "benz"],
  mercedes: ["mb", "benz"], harleydavidson: ["harley", "hd"], mitsubishi: ["mitsu"],
  international: ["intl"], automotive: ["auto"], performance: ["perf"], enterprises: ["ent"],
  chryslerdodgejeepram: ["cdjr"], chryslerjeepdodgeram: ["cjdr"], chryslerdodgejeep: ["cdj"], dodgechryslerjeep: ["dcj"],
};
const squash = (s) => String(s ?? "").toLowerCase()
  .replace(/\([^)]*\)/g, " ")
  .replace(/&/g, " and ")
  .replace(/\b(llc|inc|ltd|corp|co|incorporated|corporation|company|limited|liability|lp|llp|pa|pllc|dba)\b\.?/g, "")
  .replace(/[^a-z0-9 ]/g, " ")
  .replace(/\s+/g, " ").trim();

function candidates(name, city) {
  const words = squash(name).split(" ").filter(Boolean).filter((w) => w !== "the");
  if (!words.length) return [];
  const out = new Set();
  const add = (arr) => { const j = arr.join(""); if (j.length >= 4 && j.length <= 35) out.add(j); };
  const subs = [];
  for (let i = 0; i < words.length; i++)
    for (let j = i + 1; j <= words.length; j++) {
      const sub = words.slice(i, j).filter((w) => w !== "of" && w !== "and");
      if (sub.length && !(sub.length === 1 && sub[0].length < 6)) subs.push(sub);
    }
  const full = words.filter((w) => w !== "of" && w !== "and");
  for (let k = 1; k < full.length - 1; k++) subs.push(full.filter((_, i) => i !== k));
  for (const sub of subs) {
    add(sub);
    for (let k = 0; k < sub.length; k++)
      for (const f of ABBREV[sub[k]] ?? []) { const v = [...sub]; v[k] = f; add(v); }
  }
  for (const c of [...out]) {
    out.add(c.replace(/autosales$/, "auto")); out.add(c.replace(/autosales$/, "autos"));
    out.add(c.replace(/motors$/, "motor")); out.add(c.replace(/motor$/, "motors"));
    out.add(c.replace(/automotive$/, "auto"));
  }
  const cty = city ? squash(city).replace(/ /g, "") : null;
  if (cty) {
    const first = full.slice(0, 2);
    for (const base of [first.join(""), ...(ABBREV[first[0]] ?? [])]) { out.add(base + cty); out.add(cty + base); }
  }
  return [...out].filter((c) => c.length >= 4 && c.length <= 35);
}

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

const raw = parseCsv(await readFile(csvPath, "utf-8"));
// NY: retail classes only (DLN franchise / DLU used) — wholesalers,
// dismantlers and salvage pools hold licenses but sell nothing retail.
const filtered = raw.filter((r) => !r.business_type || ["DLN", "DLU"].includes(r.business_type));
const dealers = filtered.map((r) => ({
  // NY splits long names across an overflow column ("ACURA OF BEDFORD" + "HILLS").
  name: r.location_name || r.business_name || [r.facility_name, r.facility_name_overflow].filter(Boolean).join(" ") || r["DEALER NAME"],
  alt: r.business_name && r.business_name !== r.location_name ? r.business_name : null,
  city: r.location_city || r.facility_city || r["LOCATION CITY"],
  state: r.location_state || r.facility_state || "WA",
  zip: (r.location_postal_code || r.facility_zip_code || r["LOCATION ZIP"] || "").slice(0, 5),
  phone: digits(r.phone_number || r.PHONE).slice(-10),
})).filter((d) => d.name);
const work = LIMIT ? dealers.slice(0, LIMIT) : dealers;
console.error(`${work.length} dealers from ${csvPath}`);

// ── stage 1+2: candidates → DNS ─────────────────────────────────────────────
const registry = JSON.parse(await readFile(new URL("./registry/registry.json", import.meta.url), "utf-8"));
const knownDomains = new Set(registry.sites.map((s) => s.domain.replace(/^www\./, "")));
const TLDS = [".com", ".net", ".biz", ".us"];
const resolver = new Resolver();
resolver.setServers(["1.1.1.1", "8.8.8.8"]);

const wantDomains = new Map(); // domain -> [dealer indices]
work.forEach((d, i) => {
  const cands = new Set([...candidates(d.name, d.city), ...(d.alt ? candidates(d.alt, d.city) : [])]);
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
await Promise.all(Array.from({ length: 24 }, async () => {
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
        if (nm.length >= 8 && pageSquash.includes(nm) && ((cty && pageSquash.includes(cty)) || (d.zip && pageDigits.includes(d.zip)))) how = "name+city";
      }
      if (how) verified.set(i, { domain: dom, how });
    }
  }
}));

console.error(`\nverified: ${verified.size} of ${work.length} dealers (${already.size} already tracked in registry)`);
const byHow = {};
for (const v of verified.values()) byHow[v.how] = (byHow[v.how] || 0) + 1;
console.error("verification method:", JSON.stringify(byHow));

// ── append to registry ──────────────────────────────────────────────────────
const today = new Date().toISOString().slice(0, 10);
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
    notes: `Resolved from the ${d.state} license roll by name→domain candidate generation; identity verified on the page by ${v.how === "phone" ? "the roll's phone number" : "licensed name + city/zip"} (${today})`,
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
