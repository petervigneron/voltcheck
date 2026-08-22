// Does the VIN check know the same cars the listing pages do?
//
// WHY THIS EXISTS: a listing page resolves its enrichment row from the DEALER
// FEED's model string; /vin/<vin> resolves it from vPIC's. When the two
// disagree the VIN page finds nothing and says "No researched row for this
// model yet" — the exact words it uses for a car nobody has researched. There
// is no error, no log line, and no difference a reader could detect. The only
// detector was a human opening a VIN page for a car they happened to know was
// filled in, which is not a monitor.
//
// Found that way on 2026-08-22: vPIC calls the Prius Prime "Prius Prime
// (PHEV)" and the row was keyed "Prius Prime", so both of Toyota's Prime
// nameplates answered the VIN check with nothing while their listing pages
// showed thirteen sourced facts. A hand check of five more nameplates then
// turned up the Nissan Ariya, which vPIC calls "Ariya Hatchback" — six rows,
// including the ones rekeyed that same day to fix 285 wrong listings.
// Three hits in the first thirteen nameplates looked at is not a tail, so
// this stopped being a spot check and became a script.
//
// It samples one live VIN per (make, model, year) the corpus claims to cover,
// batch-decodes them through vPIC, and reports every nameplate whose decoded
// model string no room in the corpus answers to. Read-only: no writes, no
// enrichment edits, and it never guesses an alias — it prints what vPIC says
// and leaves the judgement to a person, because "Ariya Hatchback" is an alias
// and "Mustang Mach-E GT" would be a trim.
//
// Run from repo root:
//   node --experimental-strip-types --import ./web/scripts/ts-resolve-hook.mjs \
//        scraper/vpic-model-alias-check.mjs [--limit N] [--json]
//
// Exit 0 = every covered nameplate answers to its own decode. Exit 10 = at
// least one is invisible on the VIN page.
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const argv = process.argv.slice(2);
const AS_JSON = argv.includes("--json");
const LIMIT = argv.includes("--limit") ? Number(argv[argv.indexOf("--limit") + 1]) : Infinity;

const { ENRICHMENT_ROWS } = await import(`${ROOT}/web/lib/enrichment/data.ts`);
const { RESEARCH_ROWS } = await import(`${ROOT}/web/lib/enrichment/data2.ts`);
const { RESEARCH_ROWS_3 } = await import(`${ROOT}/web/lib/enrichment/data3.ts`);
const { RESEARCH_ROWS_4 } = await import(`${ROOT}/web/lib/enrichment/data4.ts`);
const ROWS = [...ENRICHMENT_ROWS, ...RESEARCH_ROWS, ...RESEARCH_ROWS_3, ...RESEARCH_ROWS_4];

// Same normalisation the matcher uses for model comparison, kept deliberately
// simple: this asks "is this string reachable at all", not "which row wins".
const norm = (s) => (s ?? "").toString().trim().toLowerCase().replace(/\s+/g, " ");

/** Every model string the corpus answers to, per make. */
const knownByMake = new Map();
for (const r of ROWS) {
  const k = norm(r.make);
  if (!knownByMake.has(k)) knownByMake.set(k, new Set());
  const set = knownByMake.get(k);
  for (const n of [r.model, ...(r.modelAliases ?? [])]) set.add(norm(n));
}

const envPath = `${ROOT}/web/.env.local`;
if (!fs.existsSync(envPath)) {
  console.error(`No ${envPath} — this needs SUPABASE_URL and SUPABASE_ANON_KEY to sample live VINs.`);
  process.exit(2);
}
const env = Object.fromEntries(
  fs.readFileSync(envPath, "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const base = env.SUPABASE_URL.replace(/\/$/, "");
const H = { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${env.SUPABASE_ANON_KEY}` };

// One VIN per make+model+year the corpus covers. Sampled from live listings
// rather than invented, so the decode is of a car that actually exists.
const wanted = new Map();
for (const r of ROWS) {
  for (let y = r.modelYears[0]; y <= r.modelYears[1]; y++) {
    wanted.set(`${norm(r.make)}|${norm(r.model)}|${y}`, { make: r.make, model: r.model, year: y });
  }
}

const samples = [];
let asked = 0;
for (const [key, w] of wanted) {
  if (samples.length >= LIMIT) break;
  asked++;
  const url = `${base}/rest/v1/listings?select=vin&payload->>make=ilike.${encodeURIComponent(w.make)}`
    + `&payload->>model=ilike.${encodeURIComponent(w.model)}&payload->>year=eq.${w.year}&delisted_at=is.null&limit=1`;
  const res = await fetch(url, { headers: H });
  if (!res.ok) continue;
  const j = await res.json();
  if (Array.isArray(j) && j[0]?.vin) samples.push({ ...w, key, vin: j[0].vin });
}

// vPIC's batch endpoint takes up to 50 VIN,year pairs per POST.
const decoded = [];
for (let i = 0; i < samples.length; i += 50) {
  const chunk = samples.slice(i, i + 50);
  const res = await fetch("https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVINValuesBatch/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ format: "json", data: chunk.map((c) => `${c.vin},${c.year}`).join(";") }),
  });
  if (!res.ok) { console.error(`vPIC batch ${i}: HTTP ${res.status}`); continue; }
  const j = await res.json();
  for (const d of j.Results ?? []) {
    const src = chunk.find((c) => c.vin === d.VIN);
    if (src) decoded.push({ ...src, vpicMake: d.Make, vpicModel: d.Model });
  }
}

// A miss is a car the corpus covers whose DECODED model string no row answers
// to. Reported per distinct (make, vPIC model) rather than per year, since
// one alias fixes every year at once.
const misses = new Map();
for (const d of decoded) {
  if (!d.vpicModel) continue;
  const known = knownByMake.get(norm(d.vpicMake)) ?? knownByMake.get(norm(d.make));
  if (known?.has(norm(d.vpicModel))) continue;
  const k = `${d.vpicMake}|${d.vpicModel}`;
  if (!misses.has(k)) misses.set(k, { vpicMake: d.vpicMake, vpicModel: d.vpicModel, feedModel: d.model, corpusMake: d.make, years: [], vin: d.vin });
  misses.get(k).years.push(d.year);
}
const found = [...misses.values()].sort((a, b) => b.years.length - a.years.length);

if (AS_JSON) {
  console.log(JSON.stringify({ nameplatesAsked: asked, sampled: samples.length, decoded: decoded.length, misses: found }, null, 2));
  process.exit(found.length ? 10 : 0);
}

console.log(`vPIC model-string check — ${asked} covered nameplate-years, ${samples.length} sampled from live listings, ${decoded.length} decoded\n`);
if (!found.length) {
  console.log("OK — every sampled nameplate answers to the model string vPIC returns for it.");
  process.exit(0);
}
console.log(`INVISIBLE ON THE VIN PAGE: ${found.length} nameplate(s)\n`);
for (const m of found) {
  console.log(`  ${m.corpusMake} ${m.feedModel}  (${m.years.sort().join(", ")})`);
  console.log(`    vPIC decodes it as: ${JSON.stringify(m.vpicModel)}   e.g. VIN ${m.vin}`);
  console.log(`    the corpus answers to: ${[...(knownByMake.get(norm(m.corpusMake)) ?? [])].filter(Boolean).slice(0, 8).join(", ")}`);
  console.log(`    → if that string names the same CAR, add it to modelAliases; if it names a TRIM, it is not an alias.\n`);
}
console.log("Each one answers the VIN check with \"No researched row for this model yet\" — the same words it uses for a car nobody has researched.");
process.exit(10);
