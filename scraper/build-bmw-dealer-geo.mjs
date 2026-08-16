#!/usr/bin/env node
// One-time (occasional-refresh) build of the BMW dealer-geo map, committed to
// registry/bmw-dealer-geo.json and read by lib/oem/bmw.mjs at runtime. Dealers
// are static, so we enumerate them once here rather than hit the directory every
// nightly run.
//
// Source: BMW's public "Find a Dealer" directory, /api/dealers/{zip}/{radius}.
// This path is Disallow:/api in bmwusa.com/robots.txt, so it is fetched OUTSIDE
// the crawler's robots gate — an explicit, owner-approved exception (2026-08-16)
// for public dealer addresses that no other source covers accurately. It is used
// ONLY here (an occasional refresh), never in the nightly lane, and only for the
// address of a dealer whose new-car inventory we already list.
//
//   node build-bmw-dealer-geo.mjs
import { writeFile } from "node:fs/promises";
import { coveringGrid, subdivideZips } from "./lib/oem/grid.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";
const RADIUS = 100; // starting radius (miles); halves on subdivision
const CAP = 45; // the directory caps ~48/call, so a cell returning ≥CAP is dense
// and hiding dealers past the cap → subdivide it at half the radius (100→50→25).
const MAX_DEPTH = 3;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ST = new Set("AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split(" "));

const grid = coveringGrid();
if (!grid) { console.error("zips.json unavailable"); process.exit(1); }
const { zips: zipTable } = grid;

const geo = {}; // CenterId -> {name, city, state, zip}
let calls = 0, errors = 0;
const seen = new Set();

// Query one point; returns how many dealers the directory reported (for the
// cap/subdivide decision), folding new ones into geo.
async function query(zip, radius) {
  await sleep(1100);
  calls++;
  try {
    const r = await fetch(`https://www.bmwusa.com/api/dealers/${zip}/${radius}`, { headers: { "user-agent": UA, accept: "application/json" } });
    if (r.status !== 200) { errors++; return 0; }
    const list = (await r.json()).Dealers || [];
    for (const d of list) {
      const s = d.DefaultService || {};
      const id = String(d.CenterId || "");
      const state = ST.has(String(s.State || "").toUpperCase()) ? s.State.toUpperCase() : undefined;
      const zz = String(s.ZipCode || "").match(/\d{5}/)?.[0];
      if (id && state && (s.City || zz) && !geo[id]) geo[id] = { name: d.Name, city: s.City || undefined, state, zip: zz };
    }
    return list.length;
  } catch { errors++; return 0; }
}

async function cell(zip, radius, depth) {
  if (seen.has(zip)) return;
  seen.add(zip);
  const n = await query(zip, radius);
  if (n >= CAP && depth < MAX_DEPTH && radius > 20) {
    const c = zipTable[zip];
    const sub = Math.max(20, Math.round(radius / 2));
    if (c) for (const sz of subdivideZips(zipTable, c[0], c[1], sub)) if (!seen.has(sz)) await cell(sz, sub, depth + 1);
  }
}

const anchors = [...new Set([...grid.cells.values()].map((c) => c.zip).concat(["96813", "99501"]))];
console.error(`sweeping BMW directory from ${anchors.length} anchors (radius ${RADIUS}, subdividing dense cells)`);
let done = 0;
for (const z of anchors) {
  await cell(z, RADIUS, 0);
  if (++done % 50 === 0) console.error(`${done}/${anchors.length} anchors, ${Object.keys(geo).length} dealers, ${calls} calls, ${errors} errs`);
}

// Carry forward the hand-verified overrides section (dealers the directory is
// stale on — recent renames); a rebuild must never clobber it.
let overrides = {}, overridesComment;
try {
  const prev = JSON.parse(await (await import("node:fs/promises")).readFile(new URL("./registry/bmw-dealer-geo.json", import.meta.url), "utf-8"));
  overrides = prev.overrides ?? {};
  overridesComment = prev._overridesComment;
} catch {}

const out = { _comment: "BMW dealer geo (CenterId → city/state/zip) from bmwusa.com/api/dealers. Regenerate with `node build-bmw-dealer-geo.mjs`. Owner-approved robots exception, see script header.", _built: new Date().toISOString().slice(0, 10), dealers: geo, ...(overridesComment ? { _overridesComment: overridesComment } : {}), overrides };
await writeFile(new URL("./registry/bmw-dealer-geo.json", import.meta.url), JSON.stringify(out, null, 1));
console.error(`\nwrote registry/bmw-dealer-geo.json: ${Object.keys(geo).length} dealers + ${Object.keys(overrides).length} overrides`);
