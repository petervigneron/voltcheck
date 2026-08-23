#!/usr/bin/env node
// Fill missing trim/drive on scraped listings from NHTSA vPIC (free, batch of
// 50 VINs per call). There should never be version ambiguity the VIN can
// resolve — this closes the gap for listings whose dealer page omitted trim.
//
// ── The persistent cache (2026-08-21) ──────────────────────────────────────
//
// A vPIC decode for a given VIN is IMMUTABLE — the same VIN returns the same
// trim/drive/battery/fuel fields forever — so re-fetching a VIN this pipeline
// has ever decoded is pure waste. Before this, the only "checkpoint" was
// out/listings.json itself, which merge-shards.mjs regenerates from scratch
// every night from that night's fresh crawl shards, so that checkpoint never
// survived a GitHub Actions runner being torn down. The comment that used to
// sit where the checkpoint loop is below claimed decoded VINs "resume next
// night"; that was false — nothing about the checkpoint survived past the
// run that wrote it, and every night re-decoded the same VINs from zero.
//
// That waste is real and measured (~85 minutes at ~22 VINs/sec for a
// ~110k-listing night, verified both locally and against run 32474806496's
// own log), but it is NOT what actually blew that run's budget: vpic-enrich
// finished cleanly in 85 minutes, well inside its own cap, and every one of
// its 110,186 decodes was then thrown away anyway when the job was cancelled
// hours later — gm-warranty.mjs (a separate, unrelated step) hung on
// repeated HTTP 500s from GM's owner-center endpoint and starved ingest/
// db-sync of the job's remaining budget (see nightly.yml). This cache does
// not fix that; it fixes the fact that a fully successful vpic-enrich pass
// like that one had nowhere durable to leave its work. Whether the other
// lost nights (2026-08-16 through 2026-08-20) shared this same proximate
// cause is not established here — only 08-21's log was actually read.
//
// scraper/registry/vpic-cache.json is the fix, mirroring the gm-warranty.json
// cache next to it: a VIN -> decode map that IS committed to the repo (see
// the nightly workflow's finalize-audits commit step), so it survives across
// runs the same way gm-warranty.json already does. Only the handful of raw
// vPIC fields this file actually reads are stored (not the ~150-field raw
// response), keeping the file's growth proportional to distinct VINs ever
// seen, not to how much of vPIC's schema exists.
//
// A VIN present in the cache means "vPIC was asked and answered" — including
// a genuinely empty answer (vPIC returns a row for every VIN it's handed, so
// an unrecognized or data-poor VIN still gets a row, just with blank fields).
// That is stored too, so it is never retried over the network — a VIN
// *absent* from the cache is the only "never tried" state. A missing or
// corrupt cache file degrades to treating every VIN as never-tried: slower
// (everything gets re-fetched), never wrong (the fetched decode is the same
// either way) and never fatal.
import { readFile, writeFile } from "node:fs/promises";
import { isKnownMake } from "./lib/makes.mjs";
import { fuelTextOnly, vpicConfirmsBev, vpicConfirmsPhev, vpicRefutesEv } from "./lib/ev.mjs";
import { fetchWithRetry } from "./lib/retry.mjs";

const src = new URL("./out/listings.json", import.meta.url);
const listings = JSON.parse(await readFile(src, "utf-8"));

const cacheUrl = new URL("./registry/vpic-cache.json", import.meta.url);
let cache = {};
try {
  cache = JSON.parse(await readFile(cacheUrl, "utf-8"));
} catch (e) {
  // Missing (first run) or corrupt (bad commit, disk issue) — either way,
  // starting empty is safe: it costs a slow night of re-decoding, never a
  // wrong decode. Never let a broken cache file crash the run.
  if (e.code !== "ENOENT") console.error(`vpic-enrich: cache unreadable (${e.message}), starting empty`);
  cache = {};
}

// Name-match-only EVs (evConfidence "name_match") are held back by ingest.mjs
// until vPIC confirms the classification — pull those into the same batch
// even when their trim/drive/kwh are already filled, so every one gets
// checked. (Never the reverse: a name match alone never promotes anything.)
// Same batch also carries listings whose make isn't a real manufacturer
// (dealer name in the JSON-LD brand — see lib/makes.mjs) and the
// fuel-text-only classifications above.
const needsByVin = new Map();
for (const l of listings) {
  if (l.vin?.length !== 17) continue;
  if (!l.trim || !l.driveLine || l.vpicBatteryKwh == null || l.evConfidence === "name_match" || !isKnownMake(l.make) || fuelTextOnly(l)) {
    needsByVin.set(l.vin.toUpperCase(), l);
  }
}
const needs = [...needsByVin.values()];

/**
 * Neither vPIC field is reliably the trim, so take whichever survives a junk
 * filter rather than ranking them. Observed on F-150 Lightnings 2026-08-15:
 *   2022-23  Series ""          Trim "SuperCrew"   -> nothing (cab style)
 *   2024     Series "PRO"/"XLT" Trim ""            -> Series
 *   2025     Series "F-Series"  Trim "XLT"         -> Trim
 * The old `Trim || Series` filled 31 live listings with "SuperCrew" — every
 * Lightning is a SuperCrew, so it names no version — and a naive flip to
 * `Series || Trim` would have stamped "F-Series" on the 2025 trucks instead.
 */
const CAB_STYLE_RE =
  /^(super\s*crew|super\s*cab|crew\s*cab|regular\s*cab|extended\s*cab|double\s*cab|quad\s*cab|king\s*cab)$/i;
// "F-Series", "E-Series": the model family in the trim column.
const FAMILY_RE = /^[a-z]-?series$/i;

function vpicTrim(r, l) {
  for (const cand of [r.Series, r.Trim]) {
    const t = String(cand ?? "").trim();
    if (!t) continue;
    if (CAB_STYLE_RE.test(t) || FAMILY_RE.test(t)) continue;
    // The make or the model restated where the version belongs.
    const n = (s) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (n(t) === n(l.make) || n(t) === n(l.model)) continue;
    return t;
  }
  return "";
}

function normDrive(s) {
  const u = String(s ?? "").toUpperCase();
  if (/(AWD|4WD|4X4)/.test(u)) return "AWD";
  if (/(RWD|REAR)/.test(u)) return "RWD";
  if (/(FWD|FRONT)/.test(u)) return "FWD";
  return undefined;
}

// vpicRefutesEv / vpicConfirmsBev / vpicConfirmsPhev live in lib/ev.mjs: the
// audit (audit-listings.mjs) must judge by exactly the rules ingest admits
// under, and one definition is the only way to keep that true.

let filledTrim = 0;
let filledDrive = 0;
let promoted = 0;
let promotedPhev = 0;
let unconfirmed = 0;
let fixedMake = 0;
let demoted = 0;
let decoded = 0;

// Applies one vPIC decode row to its listing in place. `listings` holds the
// same object references as `needsByVin`, so this mutates the array
// checkpointed below — no separate merge step. `r` may be a live vPIC batch
// result or a row read back out of the cache; both shapes carry the same
// field names (see `cacheableFields` below), so this function cannot tell
// the difference and the decisions it makes are identical either way.
function applyDecode(l, r) {
  decoded++;
  if (!isKnownMake(l.make) && isKnownMake(r.Make)) {
    l.make = r.Make.trim();
    l.makeSource = "vpic";
    fixedMake++;
  }
  if (fuelTextOnly(l)) {
    // The stamp is the point of this line, and it is deliberately set for a
    // BLANK decode too. ingest.mjs could not previously tell "vPIC said
    // electric" from "vPIC was never asked" — both arrive as evConfidence
    // "high" — so whenever this pass ran out of clock, every VIN it had not
    // reached was published as a verified EV on the strength of a dealer's
    // fuel-type field. The nightly's comment says running enrichment before
    // ingest guarantees the check; the ordering does, the `timeout 300m`
    // above it (and the 6m cap on a rolling slice) does not. Recording that
    // vPIC ANSWERED, whatever it answered, is what makes the guarantee
    // checkable instead of assumed.
    //
    // Not "answered usefully": vPIC returns a genuinely empty row for some
    // VINs, and 42 live listings sit permanently in that state — every
    // hydrogen fuel-cell car in the feed (Mirai, NEXO, CR-V eFCEV) plus
    // Nissan's e-POWER cars. Demanding an affirmative electric answer would
    // withhold those forever, which is a coverage regression dressed up as
    // rigour. A silent answer is still an answer; only never-asked is held.
    l.evVpicAsked = true;
    if (vpicRefutesEv(r)) {
      l.evConfidence = "vpic_refuted"; // ingest keeps only "high"
      demoted++;
    } else if (vpicConfirmsPhev(r) && l.evKind === "BEV") {
      l.evKind = "PHEV"; // dealer said bare "Electric" on a plug-in hybrid
    } else if (vpicConfirmsBev(r) && l.evKind === "PHEV") {
      l.evKind = "BEV"; // dealer said "Plug-In Hybrid" on a battery-electric car
    }
  }
  const trim = vpicTrim(r, l);
  if (!l.trim && trim) {
    l.trim = trim;
    l.trimSource = "vpic";
    filledTrim++;
  }
  const d = normDrive(r.DriveType);
  if (!l.driveLine && d) {
    l.driveLine = d;
    l.driveSource = "vpic";
    filledDrive++;
  }
  const kwh = Number(r.BatteryKWh);
  if (Number.isFinite(kwh) && kwh > 0) l.vpicBatteryKwh = kwh;
  // A name match only ever decided that vPIC should be ASKED; the decode
  // decides what the car is. So a "BEV?" that decodes PHEV lands as a PHEV (the
  // Audi A3 e-tron, caught by EV_MODEL_RE's "e-tron", is one) and a "PHEV?"
  // that decodes BEV lands as a BEV (a 2025 Countryman SE, sharing its name
  // with the 2018-23 plug-in). Neither direction relaxes anything: both still
  // need vPIC's affirmative electrified level, and a car it calls a
  // conventional hybrid or petrol is not promoted at all.
  if (l.evConfidence === "name_match") {
    const kind = vpicConfirmsBev(r) ? "BEV" : vpicConfirmsPhev(r) ? "PHEV" : null;
    if (kind) {
      l.evConfidence = "high";
      l.evKind = kind;
      l.evConfidenceSource = "vpic";
      promoted++;
      if (kind === "PHEV") promotedPhev++;
    } else {
      unconfirmed++;
    }
  }
}

// The only fields any function above reads. Storing just these (not vPIC's
// ~150-field response) keeps the committed cache's size proportional to
// distinct VINs seen, not to vPIC's schema. `checkedAt` is bookkeeping only,
// same convention as gm-warranty.json's cache entries.
const CACHE_FIELDS = ["Series", "Trim", "DriveType", "BatteryKWh", "ElectrificationLevel", "FuelTypePrimary", "FuelTypeSecondary", "Make"];
function toCacheEntry(r, today) {
  const e = { checkedAt: today };
  for (const f of CACHE_FIELDS) e[f] = r[f] ?? "";
  return e;
}

// Split into what the cache can already answer and what actually needs vPIC.
// A cache HIT still counts toward `decoded`/promoted/etc via applyDecode —
// only the network round-trip is skipped.
const todayStr = new Date().toISOString().slice(0, 10);
const fromCache = [];
const toFetch = [];
for (const l of needs) {
  const hit = cache[l.vin.toUpperCase()];
  if (hit) fromCache.push(l);
  else toFetch.push(l);
}
// Order matters now that ingest holds what this pass did not reach. Two very
// different jobs share this queue: deciding whether a car may be PUBLISHED
// (fuel-text-only rows to verify, name-match rows to promote) and filling in
// trim/drive/kWh on cars already certain to be listed. Only the first kind
// costs coverage when the clock runs out, so it goes first — the cap then
// bites on cosmetics, and the withheld set stays near empty in practice.
// Measured against the live feed and the committed cache before this change:
// of 16,186 listings that neither WMI nor nameplate can vouch for, 14,800
// were already vPIC-confirmed and only 1,028 had never been decoded at all —
// and a decode is permanent once made, so that backlog drains and does not
// come back.
const critical = (l) => l.evConfidence === "name_match" || fuelTextOnly(l);
toFetch.sort((a, b) => Number(critical(b)) - Number(critical(a)));
const criticalCount = toFetch.filter(critical).length;
console.error(
  `${needs.length} of ${listings.length} listings need vPIC enrichment (${fromCache.length} already cached, ${toFetch.length} genuinely unseen, ` +
    `${criticalCount} of those classification-critical and fetched first)`
);

for (const l of fromCache) applyDecode(l, cache[l.vin.toUpperCase()]);

// Checkpointed like crawl.mjs's writeOutput: called on a timer while batches
// are still in flight, and once more when the loop ends or is cut short by
// the nightly workflow's `timeout 300m`. Writes BOTH files — out/listings.json
// (this run's merged+enriched output, still ephemeral) and
// registry/vpic-cache.json (committed to the repo by the workflow's
// finalize-audits job, same as gm-warranty.json). The listings file alone
// never survived a runner teardown; the cache file is what actually makes a
// kill non-destructive — whatever was decoded before it stays decoded
// forever, so the backlog shrinks run over run instead of resetting to zero.
let writing = false;
async function writeOutput() {
  if (writing) return;
  writing = true;
  try {
    await Promise.all([
      writeFile(src, JSON.stringify(listings, null, 2)),
      // Compact, not indented: this file's growth is bounded by distinct
      // VINs ever decoded (all makes, not just GM's gm-warranty.json), so it
      // is sized to stay small rather than to stay human-readable.
      writeFile(cacheUrl, JSON.stringify(cache)),
    ]);
  } finally {
    writing = false;
  }
}
const checkpoint = setInterval(() => { writeOutput().catch(() => {}); }, 120_000);
checkpoint.unref?.();

for (let i = 0; i < toFetch.length; i += 50) {
  const batch = toFetch.slice(i, i + 50).map((l) => l.vin);
  // Short waits, unlike the database's ladder: vPIC has no 2-minute recovery
  // cycle to outlast, and there are hundreds of batches — a full outage must
  // degrade to "these VINs stay unenriched tonight" quickly, not stall for
  // hours. fetchWithRetry also turns a thrown fetch (connection reset) into
  // a skipped batch instead of an unhandled rejection killing the run.
  const res = await fetchWithRetry(
    `vPIC batch ${i / 50}`,
    () =>
      fetch("https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesBatch/", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: `DATA=${encodeURIComponent(batch.join(";"))}&format=json`,
      }),
    { waits: [5, 15] }
  );
  if (!res.ok) {
    console.error(`vPIC batch ${i / 50} failed: ${res.status === 0 ? await res.text() : `HTTP ${res.status}`}`);
    continue;
  }
  const json = await res.json();
  for (const r of json.Results ?? []) {
    if (!r.VIN) continue;
    const vin = r.VIN.toUpperCase();
    // Cache every answered VIN, even a blank one — vPIC returns a row for
    // every VIN it's handed, and a genuinely data-poor row is still a real
    // answer that must not be re-asked tomorrow. Only a VIN absent from the
    // cache (batch failed, or was never submitted) is "never tried".
    cache[vin] = toCacheEntry(r, todayStr);
    const l = needsByVin.get(vin);
    if (l) applyDecode(l, r);
  }
  await new Promise((r) => setTimeout(r, 400));
}

clearInterval(checkpoint);
await writeOutput();
// Say the withheld number out loud. It is the price of the guarantee, and a
// cap that silently costs coverage is the thing this change exists to stop —
// so it has to be visible in the log whether it is 0 or 900.
const unasked = listings.filter((l) => fuelTextOnly(l) && !l.evVpicAsked).length;
console.error(
  `decoded ${decoded}/${needs.length} (${fromCache.length} from cache, ${decoded - fromCache.length}/${toFetch.length} fetched), filled trim on ${filledTrim}, drive on ${filledDrive}, promoted ${promoted} name-match EVs to high confidence (${promotedPhev} of them plug-in hybrids; ${unconfirmed} name matches vPIC answered but did not confirm stay held), repaired ${fixedMake} makes, refuted ${demoted} non-EVs → out/listings.json; cache now holds ${Object.keys(cache).length} VINs → registry/vpic-cache.json`
);
console.error(
  unasked
    ? `vpic-enrich: ${unasked} fuel-text-only listing(s) were never put to vPIC this run — ingest will HOLD them rather than publish an unverified EV claim. They are held, not lost: the next run decodes them and they land.`
    : `vpic-enrich: every fuel-text-only listing was put to vPIC — nothing held back at ingest.`
);
