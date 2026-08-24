// Which dealerDomain values are national OEM-locator/manufacturer pulls
// (oem-locator.mjs, lib/oem/*.mjs) rather than a crawled dealer rooftop.
//
// Why this list exists and isn't derived from registry.json: registry.json's
// `sites` are exactly the rooftops probe.mjs validates and crawl.mjs visits —
// an OEM locator lane is never a registry row (it isn't probed, it has no
// robots.txt, it ships from oem-locator.mjs independent of the registry, see
// that file's header). So "not in the registry" already means "OEM lane" in
// practice, but a literal allowlist is cheaper to reason about and to audit
// than a live diff against a 20k-row registry, and it's what the count-
// regression alarm (sync-guard.mjs) needs at the moment it runs: a fixed set
// it can pass straight into a PostgREST `in.(...)` filter.
//
// This is a genuinely small, slow-changing set — a new entry ships only when
// a new lib/oem/*.mjs lane goes live. scraper/test/oem-lane-domains.test.mjs
// greps every lib/oem/*.mjs file's `domain:` literals and fails if one is
// missing here, so this list cannot silently drift the way a hand-maintained
// constant normally would.
export const OEM_LOCATOR_DOMAINS = new Set([
  "audi-network",
  "ford-blue-advantage",
  "honda-prologue",
  "bmwusa.com",
  "bmw-cpo",
  "enterprisecarsales.com",
  "driveway.com",
  "echopark.com",
  "mbusa.com",
  "chevrolet.com",
  "gmc.com",
  "cadillac.com",
  "buick.com",
  "carbravo.com",
  "genesis.com",
  "genesis-cpo",
  "kia.com",
  "lucidmotors.com",
  "lucid-new",
  "subaru.com",
  "polestar-preowned",
  "jeep.com",
  "dodge.com",
  "chrysler.com",
  "fiatusa.com",
  "hyundaiusa.com",
  "hyundai-cpo",
  "vw.com",
  "lexus.com",
  "volvo-cpo",
  "nissan-new",
  "nissan-cpo",
  "honda-cpo",
  "acuracertified.com",
  "stellantis-cpo",
  "mazdausa.com",
]);

/** "oem" for a national locator pull, "dealer" for a crawled rooftop. */
export function laneOf(dealerDomain) {
  return OEM_LOCATOR_DOMAINS.has(dealerDomain) ? "oem" : "dealer";
}
