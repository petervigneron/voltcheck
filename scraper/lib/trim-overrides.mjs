// A hand-curated escape hatch for scraper/lib/trim-suspect.mjs's blind spot.
//
// trim-suspect only ever judges a listing's own `description` text — and for
// the dealer.com bulk inventory API (scraper/lib/platforms/dealercom-api.mjs,
// shipped 2026-08-19), most listings carry no description at all: that
// endpoint's mapRecord() never reads one, because the endpoint itself is
// structured attributes only, not free text. A 2023 F-150 Lightning at Island
// Chevrolet (VIN 1FT6W1EV4PWG56454) shipped with trim "Pro" for exactly this
// reason: the dealer's own DMS trim field was wrong, our crawl had no
// description to catch it with, Ford's window sticker for this VIN is
// unavailable (windowsticker.forddirect.com returns the "not yet released"
// placeholder), and vPIC's Trim field is "SuperCrew" — a cab style, not a
// trim, for every 2022-23 Lightning (see web/lib/listings/trimClaim.ts
// CAB_STYLES). None of the pipeline's automated signals could see the
// contradiction. A real browser rendering the dealer's own VDP could: a
// separate widget the crawl doesn't fetch (dealer.com's "Dealer Notes",
// ws-dealernotes) named the truck "XLT" in a Chrome-Data-style build string.
//
// This file is the manual record of what a human (or an agent acting on the
// owner's report) actually read off a dealer's page when the automated
// pipeline had nothing to check against. It is not a general trim source —
// it never grows on its own, the way scraper/registry/registry.json doesn't
// either — and it captures ONLY the fact "the feed's trim is contradicted by
// this evidence", not a claim of what the trim truly is. That is why this
// sets `trimSuspect`, exactly the field trim-suspect.mjs itself sets, rather
// than overwriting `trim` directly: web/lib/listings/trimClaim.ts already
// knows how to turn a trimSuspect into "suppress, don't substitute" (and, for
// a cab-style-only VIN like this one, the VIN can never corroborate the
// feed's claim, so suppression is exactly what happens — no trim shows on
// the site, instead of a wrong one).
import { readFile } from "node:fs/promises";

const REGISTRY_URL = new URL("../registry/trim-overrides.json", import.meta.url);

export async function loadTrimOverrides(url = REGISTRY_URL) {
  const raw = JSON.parse(await readFile(url, "utf-8"));
  const rows = Array.isArray(raw?.overrides) ? raw.overrides : [];
  const byVin = new Map();
  for (const row of rows) {
    const vin = String(row?.vin ?? "").toUpperCase();
    const named = String(row?.namedVersion ?? "").trim();
    if (vin.length === 17 && named) byVin.set(vin, named);
  }
  return byVin;
}

/**
 * Stamps `trimSuspect` on listings a hand-verified row contradicts, same
 * contract as markTrimSuspects: only the positive case is written, and a row
 * whose feed has since caught up to the verified name (or that the automated
 * detector already flagged) is left alone. Returns how many were stamped.
 */
export function applyTrimOverrides(listings, byVin) {
  if (!byVin?.size) return 0;
  let n = 0;
  for (const l of listings) {
    if (l.trimSuspect) continue; // the automated detector already has this one
    const vin = String(l.vin ?? "").toUpperCase();
    const named = byVin.get(vin);
    if (!named) continue;
    const feed = String(l.trim ?? "").trim().toUpperCase();
    if (!feed || feed === named.toUpperCase()) continue; // the feed already agrees
    l.trimSuspect = named;
    n++;
  }
  return n;
}
