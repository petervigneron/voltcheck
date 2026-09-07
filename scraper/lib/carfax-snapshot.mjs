// The title brand off the Carfax Snapshot a dealer embeds on its own page.
//
// ── What this is ───────────────────────────────────────────────────────────
//
// Owner, 2026-09-07, on victoryfordkc.com's 2024 F-150 Lightning Flash
// 1FT6W3L70RWG19114 ($43,500, 23,180 mi): "This is another buyback but I only
// saw it on the carfax. Is there anyway for us to see it?" The dealer wrote
// no notes, its inventory API carries nothing about it in any of its ~200
// fields, and its "Manufacturer Buyback" page is a landing page with no
// inventory on it. What the dealer DOES publish, for every shopper, is a
// Carfax Snapshot: hover the badge on the VDP and a panel reads
//
//     Branded Title: Buyback/Lemon
//     No Accidents or Damage Reported to CARFAX
//     4 Service History Records
//     2 Previous Owners
//     Personal Vehicle
//     23,179 Last Reported Odometer Reading
//
// The panel is fetched by the dealer's page from
// snapshot.carfax.com/partnerReportCarfaxConnect?snapshotkey=<key>, where
// the key is per car and the dealer publishes it — in the Team Velocity
// inventory API record (carFax_SNAPSHOT_KEY, on all 98 of that lot's used
// cars) and inline in some rooftops' page HTML (driveadream.com). Verified
// 2026-09-07: the host publishes no robots.txt (404 — no rules, RFC 9309),
// and the endpoint answers a plain GET from Node with the same JSON the
// page gets, with or without a Referer.
//
// ── What is read, and what is not ──────────────────────────────────────────
//
// ONLY THE TITLE-BRAND LINE. The snapshot also states accidents, owners,
// service and use, and every one of those is a Carfax claim about the car
// that this site has no independent footing for. The title brand is a DMV
// record Carfax is relaying, it is the one line that decides a false
// bargain, and it is the one line the owner asked for. Nothing else is
// stored, so nothing else can leak onto a page.
//
// ONLY WHERE THE DEALER PUBLISHED THE KEY. A key is issued to a dealer for
// a car it is selling; this reads what that dealer put in front of every
// shopper, one request per car, cached, re-read every REFRESH_DAYS. No key
// is ever guessed, derived, or reused across cars.
//
// ONE SWITCH. CARFAX_SNAPSHOT=off in the environment makes the lane exit
// without a request; the cached brands already applied stay applied until
// the cars re-sync without them. If Carfax objects, that is the whole
// remedy, and it is one line in rolling-crawl.yml.
//
// ── How it reaches the site ────────────────────────────────────────────────
//
// The lane writes `titleBrand` ("Buyback/Lemon", "Salvage", "Rebuilt", …)
// onto the car's out/listings.json record; ingest.mjs carries it into the
// payload; migration 0070 makes buyback_disclosed and
// branded_title_disclosed read it beside the dealer's own words. The site
// then prints exactly what it prints for a dealer that wrote the sentence
// itself. No timestamp rides in the payload — a re-read that changed
// nothing must not rewrite the row (migration 0025's payload-equality
// rule); the date lives in registry/carfax-snapshot.json.

import { publishedCondition } from "./condition.mjs";

export const SNAPSHOT_HOST = "https://snapshot.carfax.com";
export const snapshotUrl = (key) =>
  `${SNAPSHOT_HOST}/partnerReportCarfaxConnect?snapshotkey=${encodeURIComponent(String(key))}`;

// The key as dealers publish it: base64url, ~100 characters. Team Velocity
// hands it over as carFax_SNAPSHOT_KEY; page HTML carries it as
// snapshotkey":"…" (driveadream.com, 2026-09-07). Bounded so a stray word
// never passes for one.
const KEY_RE = /^[A-Za-z0-9_-]{40,200}$/;
export const isSnapshotKey = (k) => typeof k === "string" && KEY_RE.test(k);

/** The snapshot key a page publishes, or undefined. */
export function snapshotKeyFromHtml(html) {
  const m = String(html ?? "").match(/snapshotkey["']?\s*[:=]\s*["']([A-Za-z0-9_-]{40,200})["']/i);
  return m ? m[1] : undefined;
}

const ROW = /<div class="history-row[^"]*">([\s\S]*?)<\/div>\s*<\/div>/g;
const textOf = (h) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

/**
 * The rows of a snapshot response, and the title brand if there is one.
 * Returns { rows, titleBrand } — titleBrand undefined when no row says
 * "Branded Title:", which is the clean case and asserts nothing.
 */
export function parseSnapshot(json) {
  const html = typeof json?.snapshotReportHtml === "string" ? json.snapshotReportHtml : "";
  const rows = [...html.matchAll(ROW)].map((m) => textOf(m[1])).filter(Boolean);
  let titleBrand;
  for (const r of rows) {
    const m = r.match(/^branded title:\s*(.+)$/i);
    if (m) {
      titleBrand = m[1].trim().slice(0, 60);
      break;
    }
  }
  return { rows, titleBrand };
}

/**
 * Whether the lane should ask Carfax about this record: a used or certified
 * car whose seller published a key, not answered within the refresh window.
 */
export function needsSnapshot(l, { cached, refreshCutoff = "" } = {}) {
  const cond = publishedCondition(l);
  if (cond !== "used" && cond !== "certified") return false;
  if (!isSnapshotKey(l.carfaxSnapshotKey)) return false;
  if (String(l.vin ?? "").length !== 17) return false;
  if (cached && String(cached.checkedAt ?? "") >= refreshCutoff) return false;
  return true;
}
