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
