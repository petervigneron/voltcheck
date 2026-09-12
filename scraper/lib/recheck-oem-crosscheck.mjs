// Cross-checks recheck.mjs's per-VIN verdict against that same night's own
// OEM-locator sweep, for the four domains that never certify completeness to
// db-sync's guard (0028_listing_freshness.sql, lib/oem-lane-domains.mjs) AND
// rely on recheck's per-dealer-VDP text check as their ONLY delisting path:
// hyundai-cpo, ford-blue-advantage, honda-prologue, audi-network.
//
// The investigation naming this fix (docs/agents/relist-churn-2026-08-21.md)
// lists six domains, including nissan-new and nissan-cpo. Those two turn out
// to already be a different case, verified by reading lib/oem/nissan.mjs
// itself: Nissan's per-VIN page is a client-rendered shell that echoes the
// VIN from the URL for a real OR a fabricated VIN (the opposite failure —
// falsely ALIVE, not falsely gone), so nissan.mjs deliberately puts both its
// domains in recheck's OWN skip set (recheck.mjs's `OEM_LOCATOR_DOMAINS`,
// built from every lib/oem/*.mjs lane's exported skip contribution — Nissan's
// is non-empty, Honda/Ford Blue Advantage/Audi's are each `new Set()`, i.e.
// explicitly opted OUT of the skip). That has been true since Nissan's lane
// shipped 2026-08-15 (git log -p on nissan.mjs) — recheck has never fetched a
// nissan-new/nissan-cpo VDP, so it cannot be the source of a delisting on
// those two domains; the "recheck" attribution the investigation's own
// listing_events query found for them is query drift from a different,
// known mechanism — listings.dealer_domain is overwritten on every ingest
// upsert (`dealer_domain = excluded.dealer_domain`, supabase/migrations/
// 0001_init.sql), so a VIN first crawled under a real dealer rooftop domain
// (a normal, recheck-active domain, delisted there legitimately) and later
// re-matched by the Nissan OEM sweep would show its CURRENT dealer_domain as
// "nissan-new" against a PAST event recorded under the old one. Including
// nissan-new/nissan-cpo here would be inert (recheck.mjs's upstream `targets`
// filter never lets a row on either domain reach this module at all) and
// would misstate what this change actually does, so they're left out.
//
// The remaining four domains' per-VDP check has a measured false-negative
// rate (same investigation): a steady delist-then-relist drumbeat every few
// days, recurring daily since tracking began 2026-08-13, and 94-100% of
// these domains' delistings come from recheck. Template variance and
// JS-rendering quirks on a one-off dealer VDP produce an occasional false
// "VIN not in the page" reading that a second, unrelated fetch a night or
// two later reverses.
//
// But each of these four domains' own national locator pull DOES have good
// coverage of its own population -- that coverage is exactly why db-sync
// already trusts it enough to relist a delisted VIN the instant it
// reappears there (see ingest_listings's relist logic, which requires no
// domain completeness certification). So before trusting one dealer VDP's
// "gone" reading over a national inventory pull, ask whether tonight's own
// sweep still lists the car. If it does, the VDP reading is outvoted: one
// page's rendering quirk against the same lane's own authoritative pull.
//
// This only ever makes recheck MORE conservative about delisting these four
// domains -- it can turn a hard/soft-gone verdict into "still alive", never
// the reverse. A car whose own dealer VDP looks alive is never overridden.
export const RECHECK_CROSSCHECK_DOMAINS = new Set([
  "hyundai-cpo",
  "ford-blue-advantage",
  "honda-prologue",
  "audi-network",
]);

// Build the set of VINs tonight's own locator sweep still lists, scoped to
// the cross-check domains. `feedRows` is the full merged nightly feed
// (web/data/scraped-listings.json) or any subset of it containing at least
// {vin, dealerDomain} -- rows for other domains are ignored.
export function oemAliveVins(feedRows) {
  const vins = new Set();
  for (const row of feedRows ?? []) {
    if (!row || !RECHECK_CROSSCHECK_DOMAINS.has(row.dealerDomain)) continue;
    const vin = String(row.vin ?? "").toUpperCase();
    if (vin) vins.add(vin);
  }
  return vins;
}

// Should a hard/soft-gone verdict from the per-VDP check be trusted for this
// VIN and domain? Domains outside the cross-check set pass through
// unchanged (true — this function never makes any other domain's delisting
// more conservative). For the cross-check domains, a verdict is only
// trusted if tonight's own locator sweep does NOT still list the VIN; if the
// sweep missed running, or the feed couldn't be read at all, `aliveVins` is
// simply empty and every verdict passes through trusted, same as before this
// change -- a missing cross-check is never treated as evidence either way.
export function trustGoneVerdict(vin, domain, aliveVins) {
  if (!RECHECK_CROSSCHECK_DOMAINS.has(domain)) return true;
  return !aliveVins.has(String(vin ?? "").toUpperCase());
}

// ── The other direction: the sweep as evidence of ABSENCE ─────────────────
//
// 2026-09-12, owner: a 2023 Lightning (1FT6W1EV2PWG58901) on the site that
// Boniface Hiers Chevrolet's own site did not list. The row came through
// ford-blue-advantage; its sourceUrl is the dealer's VDP; that host answers
// 403 to us. Under the rules above a 403 "proves nothing", every night, so a
// car in that position had NO delisting path at all: db-sync cannot (the
// lane is truncated always) and recheck never concludes. Measured the same
// day on the 26 FBA rows recheck had never once confirmed: 24 hosts answer
// 403 to the crawler, and in a real browser 18 of 24 no longer showed the
// car. Nightly, ~19,700 of ~106,000 rechecks end inconclusive.
//
// What we DO have for these four lanes is the lane's own national sweep,
// which db-sync already trusts enough to relist a VIN the moment it
// reappears. So when the dealer page cannot be read, ask the sweep: if it
// ran tonight at full size and does not list the VIN, that is a soft-gone
// STRIKE (never a delist on its own — 0004's two-consecutive-nights rule
// still applies, so one night's sweep miss changes nothing). Measured
// 2026-09-12 over the 09-10/11/12 nightly feeds — a VIN listed on nights
// N-1 and N+1 but missing on N, i.e. the sweep's own one-night miss rate:
//
//   ford-blue-advantage   31 of ~8,280  (0.4%)   176 gone both later nights
//   audi-network          14 of ~3,900  (0.4%)    90
//   hyundai-cpo            5 of   ~800  (0.6%)    30
//   honda-prologue         0 of ~2,300  (0.0%)    35
//
// Two consecutive misses by flicker alone is that rate squared, which is
// what makes two consecutive misses evidence rather than noise, and the
// "gone both later nights" column is the class of car this rule can finally
// retire.
//
// "Ran tonight at full size" is the guard against the failure that would
// otherwise be catastrophic: a lane whose proxy was walled that night lists
// nothing, and without a floor every one of its cars would be struck. The
// floors are each lane's own `minExpected` (the count below which the lane
// itself reports an error), restated here so this module has no lane
// imports; the test pins them to the lanes' values.
export const SWEEP_FLOORS = {
  "ford-blue-advantage": 3000, // lib/oem/ford-blue-advantage.mjs FORD_BLUE_ADVANTAGE.minExpected
  "honda-prologue": 400, //      lib/oem/honda.mjs HONDA.minExpected
  "hyundai-cpo": 300, //         lib/oem/hyundai.mjs HYUNDAI_CPO.minExpected
  "audi-network": 1500, //       lib/oem/audi.mjs AUDI.minExpected
};

// How many rows tonight's feed carries per cross-check domain — the sweep's
// size, which the floor above is checked against.
export function oemSweepCounts(feedRows) {
  const counts = new Map();
  for (const row of feedRows ?? []) {
    if (!row || !RECHECK_CROSSCHECK_DOMAINS.has(row.dealerDomain)) continue;
    if (!String(row.vin ?? "").trim()) continue;
    counts.set(row.dealerDomain, (counts.get(row.dealerDomain) ?? 0) + 1);
  }
  return counts;
}

// Did tonight's own sweep run at full size for this domain and NOT list this
// VIN? True only for a cross-check domain whose sweep cleared its floor; a
// domain outside the set, a missing feed, or a short sweep all answer false —
// absence of evidence, never evidence of absence.
export function sweepSaysGone(vin, domain, aliveVins, sweepCounts) {
  if (!RECHECK_CROSSCHECK_DOMAINS.has(domain)) return false;
  const floor = SWEEP_FLOORS[domain];
  if (!floor || (sweepCounts?.get(domain) ?? 0) < floor) return false;
  return !aliveVins.has(String(vin ?? "").toUpperCase());
}

// Is this sourceUrl a page ABOUT this VIN? The Ford Blue Advantage record's
// dealer link is the dealer's per-VIN page only when the marketplace flags it
// `deepLink`; otherwise it is the dealer's homepage or a search page, and the
// lane still hands it over as sourceUrl for the click-through. Fetching a
// homepage and looking for the VIN in it is the "200 but no VIN" strike by
// construction — measured 2026-09-12 it is the engine behind FBA's 89%
// delist-then-relist rate. A URL that does not carry the VIN is not a page
// recheck can read a verdict from; the sweep rule above is its check instead.
export function isPerVinPage(url, vin) {
  const v = String(vin ?? "").toUpperCase();
  return Boolean(v) && String(url ?? "").toUpperCase().includes(v);
}
