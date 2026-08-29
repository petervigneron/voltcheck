// Which live listings are being answered by a row that covers MORE THAN ONE
// CONFIGURATION of the car? Run from web/:
//
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//     scripts/config-conflation-check.mjs [--json] [--out PATH] \
//     [--max-conflated N] [--top N]
//
// WHY THIS EXISTS. On 2026-08-28 the owner opened a BrightDrop page and found
// no range, no battery size, no charge time, and a paragraph explaining the
// absence — and asked, reasonably, why a shopper's eye was the thing that
// found it. Four more nameplates turned out to have the same defect that day:
// GMC Sierra EV (773 listings), GMC Hummer EV and EV SUV (868), Hyundai
// Ioniq 5 (893), Chevrolet Blazer EV (495). Roughly 3,300 cars, none of which
// any existing check flagged, because each one was individually plausible:
// every row was real, most were well-researched, and nothing was throwing.
//
// The shape they shared is the thing this script looks for: ONE ROW STANDING
// IN FOR SEVERAL FACTORY CONFIGURATIONS. It has three visible symptoms and
// each is cheap to detect from the browse feed alone.
//
//   ambiguous  The matcher returns `candidates` rather than one row, so the
//              card renders a range SPREAD ("283-410 mi") instead of a
//              number, and the listing is invisible to the range filter. This
//              is the Sierra EV, the Ioniq 5 and the Blazer EV: the feed had
//              already answered the question and the site declined to.
//   silent     A row matches, and carries no range at all. This is the
//              BrightDrop and the Hummer: the maker publishes a figure, EPA
//              never rated the vehicle, and the figure ended up in prose
//              instead of in `range.mfrRangeMi`.
//   split      One row matches listings whose own trim strings name DIFFERENT
//              packs — "Standard Range" and "Extended Range" landing on the
//              same row. Whatever the row prints, it is wrong for one of
//              them. This is the strongest signal of the three because it
//              needs no VIN work to interpret: the feed is contradicting the
//              row out of its own mouth.
//
// The split test counts only rows with NO VIN KEY, and that distinction is
// the difference between a finding and a permanent false positive. A row
// keyed on `vin8` or `vds` has already decided on factory evidence, so a
// listing whose trim string disagrees with it is a DEALER TYPO, not a
// conflated row — one 2026 Sierra EV whose VIN reads 4EUED (the 20-module
// AT4) is advertised as "AT4 Max Range", and the row is right. Those are
// printed below under their own heading and deliberately kept out of the
// ratchet: they are a data-quality signal about the feed, they never go to
// zero, and counting them would mean this audit could never be satisfied.
//
// WHAT IT DELIBERATELY DOES NOT DO. It does not decode VINs. A per-VIN sweep
// is how each of those five was actually diagnosed and it is the right second
// step, but it is thousands of vPIC calls and it cannot run in CI. Everything
// below is computed from the CDN-cached browse shards — the same source
// live-enrichment-gap.mjs reads, fetched once each, so this is gentle on a
// database a nightly db-sync may be mid-write against.
//
// HOW IT RELATES TO THE OTHER TWO AUDITS. enrichment-coverage.mjs asks whether
// a row that EXISTS is complete. live-enrichment-gap.mjs asks whether a row
// exists at all for what is live. Neither asks whether the row that matched is
// answering about THIS car or about a family the car belongs to — a listing
// can be "covered" by both of those and still show a shopper a spread, or a
// number belonging to a different version. That is the question here.
//
// THE RATCHET is `--max-conflated-share`, the SHARE of live listings in the
// three buckets combined. A share and not a raw count for the reason
// live-enrichment-gap.mjs gives about its own primary ratchet: the feed grows,
// and a count that drifts with inventory either fails on a good day or stops
// biting on a bad one. Not a group count either — a group count cannot tell
// one obscure van from 893 Ioniq 5s, which is exactly the failure that let
// this class go unnoticed. Lower it as nameplates get keyed; never raise it to
// launder a regression.
//
// CALIBRATION. Run against the code as it stood at the start of 2026-08-28
// (commit 36dc64d, current live feed), this reported 8,450 listings — 5.72% —
// and the top of its two main lists was, in order: Sierra EV 766, Blazer EV
// 485, Ioniq 5 366/333/116, Hummer EV SUV 587 and pickup 281, and every
// BrightDrop and Zevo row. Those are precisely the nameplates fixed that day,
// including the BrightDrop page the owner opened by hand. That is the
// verification that this detects the class rather than merely describing it
// after the fact. After those fixes: 5,147 listings, 3.49%.
import { unpackIndex, SHARDS } from "../lib/listings/pack.ts";
import { matchEnrichment } from "../lib/enrichment/match.ts";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const AS_JSON = has("--json");
const TOP = Number(val("--top", "25"));
const OUT = val("--out", "/tmp/config-conflation.json");
const FEED_BASE = val("--feed-base", "https://voltcheck.net");
// 999999 effectively disables the ratchet for an ad hoc run; CI pins the real
// ceiling. See the header.
const MAX_SHARE = Number(val("--max-conflated-share", "100"));

const RETRY_DELAYS_MS = [5_000, 15_000];
async function fetchShard(n) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(`${FEED_BASE}/api/index/${n}`, { signal: AbortSignal.timeout(60_000) });
      if (!res.ok) {
        const err = new Error(`shard ${n}: HTTP ${res.status}`);
        if (res.status < 500) throw err;
        err.retryable = true;
        throw err;
      }
      return await res.json();
    } catch (e) {
      const retryable = e.retryable ?? !/^shard \d+: HTTP/.test(e.message ?? "");
      if (!retryable || attempt >= RETRY_DELAYS_MS.length) throw e;
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
    }
  }
}

const listings = [];
for (let n = 0; n < SHARDS; n++) listings.push(...unpackIndex(await fetchShard(n)));

// A VIN is 17 characters and excludes I, O and Q. The feed carries a handful
// of placeholder ids ("IONIQ5-22-AWD"); they cannot be VIN-resolved and are
// not evidence of a conflated row, so they sit out of the split test.
const isVin = (s) => typeof s === "string" && /^[A-HJ-NPR-Z0-9]{17}$/i.test(s);

// The pack words a dealer actually types, as opposed to grade names. Keep this
// list to phrases that name a PACK or a drivetrain and nothing else: a trim
// name like "Limited" or "RS" is not evidence of anything, because the same
// grade legitimately ships with more than one pack, which is the whole reason
// these rows are hard.
const PACK_WORDS = [
  ["standard range", "std range"],
  ["extended range", "ext range"],
  ["max range", "maximum range"],
  ["long range"],
];
const packClass = (trim) => {
  const t = (trim ?? "").toLowerCase();
  const hit = PACK_WORDS.findIndex((set) => set.some((w) => t.includes(w)));
  return hit < 0 ? null : hit;
};

const rangeOf = (row) => row?.range?.epaRangeMi?.value ?? row?.range?.mfrRangeMi?.value;

const ambiguous = new Map();   // nameplate+year -> {n, spread}
const silent = new Map();      // row id -> {n, label}
const splitRows = new Map();   // row id -> {classes:Set, n, label, examples, keyed}

for (const l of listings) {
  const decodeIn = {
    vin: isVin(l.id) ? l.id.toUpperCase() : "",
    usMarket: true,
    make: (l.make ?? "").toUpperCase(),
    model: l.model,
    modelYear: l.year,
    trim: l.trim,
    driveType: l.drive,
  };
  const r = matchEnrichment(decodeIn, null);
  const key = `${l.year} ${l.make} ${l.model}`;

  if (!r.exact && r.candidates?.length) {
    const rs = r.candidates.map(rangeOf).filter((v) => v !== undefined).sort((a, b) => a - b);
    const e = ambiguous.get(key) ?? { n: 0, spread: null, ids: r.candidates.map((c) => c.id) };
    e.n++;
    if (rs.length >= 2) e.spread = `${rs[0]}-${rs[rs.length - 1]} mi`;
    ambiguous.set(key, e);
    continue;
  }
  if (!r.exact) continue;

  if (rangeOf(r.exact) === undefined) {
    const e = silent.get(r.exact.id) ?? { n: 0, label: key, abstains: !!r.exact.abstains?.epaRangeMi };
    e.n++;
    silent.set(r.exact.id, e);
  }

  const pc = packClass(l.trim);
  if (pc !== null) {
    const keyed = !!(r.exact.vin8?.length || r.exact.vds?.length);
    const e = splitRows.get(r.exact.id) ?? { classes: new Set(), n: 0, label: key, examples: new Map(), keyed };
    e.classes.add(pc);
    e.n++;
    if (!e.examples.has(pc)) e.examples.set(pc, l.trim);
    splitRows.set(r.exact.id, e);
  }
}

const splitAll = [...splitRows].filter(([, v]) => v.classes.size > 1);
const split = splitAll.filter(([, v]) => !v.keyed);
const typos = splitAll.filter(([, v]) => v.keyed);
const ambN = [...ambiguous.values()].reduce((a, b) => a + b.n, 0);
const silN = [...silent.values()].reduce((a, b) => a + b.n, 0);
const splN = split.reduce((a, [, v]) => a + v.n, 0);
const total = ambN + silN + splN;
const share = listings.length ? (total / listings.length) * 100 : 0;

if (AS_JSON) {
  const report = {
    listings: listings.length,
    conflated: total,
    conflatedSharePct: Number(share.toFixed(2)),
    ambiguous: { listings: ambN, groups: [...ambiguous].map(([k, v]) => ({ cohort: k, ...v, ids: undefined })) },
    silent: { listings: silN, rows: [...silent].map(([id, v]) => ({ id, ...v })) },
    split: { listings: splN, rows: split.map(([id, v]) => ({ id, listings: v.n, label: v.label, trims: [...v.examples.values()] })) },
    dealerTrimDisagreesWithVin: typos.map(([id, v]) => ({ id, listings: v.n, label: v.label, trims: [...v.examples.values()] })),
  };
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(report, null, 2));
}

const fmt = (n) => String(n).padStart(6);
console.log(`Configuration conflation — ${listings.length} live listings across ${SHARDS} shards\n`);
console.log(`${fmt(ambN)}  listings shown a RANGE SPREAD instead of a number (row covers several versions, feed can't pick)`);
console.log(`${fmt(silN)}  listings whose matched row carries NO RANGE AT ALL`);
console.log(`${fmt(splN)}  listings on an UNKEYED row that also serves a different pack by the feed's own trim strings`);
console.log(`${fmt(total)}  total — ${share.toFixed(2)}% of live listings\n`);

const show = (title, rows) => {
  if (!rows.length) return;
  console.log(title);
  for (const line of rows.slice(0, TOP)) console.log(`  ${line}`);
  if (rows.length > TOP) console.log(`  … and ${rows.length - TOP} more`);
  console.log();
};
show("Spread instead of a number — the feed may already answer this; check the VIN:",
  [...ambiguous].sort((a, b) => b[1].n - a[1].n).map(([k, v]) => `${fmt(v.n)}  ${k}${v.spread ? `  (${v.spread})` : ""}`));
show("Matched a row that states no range — does the maker publish one? (range.mfrRangeMi):",
  [...silent].sort((a, b) => b[1].n - a[1].n).map(([id, v]) => `${fmt(v.n)}  ${id}  ${v.label}${v.abstains ? "  [declared]" : ""}`));
show("One UNKEYED row, two pack names in its own listings' trim strings — it is wrong for one of them:",
  split.sort((a, b) => b[1].n - a[1].n).map(([id, v]) => `${fmt(v.n)}  ${id}  ${v.label}  ${[...v.examples.values()].map((t) => `"${t}"`).join(" vs ")}`));
show("Not counted — VIN-keyed rows a dealer's trim string contradicts. The VIN wins; this is feed data quality:",
  typos.sort((a, b) => b[1].n - a[1].n).map(([id, v]) => `${fmt(v.n)}  ${id}  ${v.label}  ${[...v.examples.values()].map((t) => `"${t}"`).join(" vs ")}`));

if (Number(share.toFixed(2)) > MAX_SHARE) {
  console.error(
    `FAIL — ${share.toFixed(2)}% of live listings are answered by a row covering several configurations ` +
      `(${total} listings, ceiling ${MAX_SHARE}%).`
  );
  process.exit(11);
}
console.log(`OK — ${share.toFixed(2)}% conflated (${total} listings, ceiling ${MAX_SHARE}%).`);
