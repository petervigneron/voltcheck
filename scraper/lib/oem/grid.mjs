// Shared national covering grid for OEM locators whose search caps results per
// query location (e.g. Nissan's 120-offset ceiling). One representative ZIP per
// ~1.4x1.6-degree CONUS cell, chosen closest to the cell centre, so the grid
// follows where people (and dealers) actually are. Callers query each cell and
// dedupe by VIN; a cell that hits the cap subdivides (see subdivideOffsets).
//
// This is the same construction hyundai.mjs uses for its CPO sweep, factored
// out so a second capped locator can reuse it without duplicating the ZCTA
// bucketing. hyundai.mjs keeps its own inline copy (working code, left alone).
import { readFileSync } from "node:fs";

// Returns { cells, zips } or null if the ZCTA table is unavailable.
//   cells: Map keyed "cx_cy" → { zip, cx, cy } (one rep ZIP per cell)
//   zips:  the full ZCTA table (zip → [lat, lng]) for subdivision lookups
export function coveringGrid() {
  let zips;
  try {
    zips = JSON.parse(readFileSync(new URL("../../../web/data/zips.json", import.meta.url), "utf-8"));
  } catch {
    return null;
  }
  const LAT = 1.4, LNG = 1.6;
  const cells = new Map();
  for (const [zip, v] of Object.entries(zips)) {
    const [la, ln] = v;
    if (!(la >= 24 && la <= 49.5 && ln >= -125 && ln <= -66.5)) continue; // CONUS
    const cx = Math.floor(la / LAT), cy = Math.floor(ln / LNG), key = `${cx}_${cy}`;
    const d = (la - (cx + 0.5) * LAT) ** 2 + (ln - (cy + 0.5) * LNG) ** 2;
    const ex = cells.get(key);
    if (!ex || d < ex.d) cells.set(key, { zip, cx, cy, d });
  }
  return { cells, zips };
}

// ZIP nearest a target lat/lng — for placing subdivided sub-cell centres.
export function nearestZip(zips, la, ln) {
  let best = null, bestD = Infinity;
  for (const [zip, v] of Object.entries(zips)) {
    const d = (v[0] - la) ** 2 + (v[1] - ln) ** 2;
    if (d < bestD) { bestD = d; best = zip; }
  }
  return best;
}

// The four quadrant sub-centre ZIPs around a cell centre, each ~spanMi away in
// a straight line (NE/NW/SE/SW). A locator with no radius knob (Nissan)
// subdivides purely by moving the query centre closer to the overflow; the
// caller shrinks spanMi with depth so a dense metro converges. spanMi must stay
// well inside the cell's client-side radius or the sub-centres land in
// neighbouring cells and miss the local overflow they were meant to catch.
export function subdivideZips(zips, la, ln, spanMi) {
  const off = spanMi / 69 / Math.SQRT2; // per-axis degrees for a spanMi diagonal (~69 mi/deg)
  const out = [];
  for (const [dla, dln] of [[off, off], [off, -off], [-off, off], [-off, -off]]) {
    const z = nearestZip(zips, la + dla, ln + dln);
    if (z) out.push(z);
  }
  return out;
}
