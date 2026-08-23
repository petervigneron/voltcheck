// Which VINs are offered by more than one seller, counted before the dedupe
// throws the losing copies away.
//
// WHY THIS IS A SHARED FILE. It used to be twenty lines inlined in
// merge-shards.mjs, and that was fine while the nightly crawled every dealer
// and merge-shards saw the whole night in one place. It stopped being fine on
// 2026-08-22, when the whole-fleet crawl left nightly.yml for
// rolling-crawl.yml (7972521): merge-shards' only remaining producer is the
// OEM locator, whose lanes are one domain each, so no VIN can appear on two
// of them and the count has been ZERO ever since. colisting-sync said so
// every night, into a log nobody was reading:
//
//   colisting-sync: 0 multi-domain VINs tonight — nothing to send
//                   (expected thousands; check merge-shards)
//
// vin_colisting (migration 0036) has never held a row. The dealer crawl —
// the only lane that can see one car on two rooftops — dedupes in
// crawl.mjs's writeOutput() and never counted anything. So the logic lives
// here now and both callers use it, because the failure was one copy of it
// being in a lane that stopped running.
//
// WHAT IT IS FOR, from merge-shards' original note: a group listing one car
// on twelve of its own sites looks exactly like eleven cars moving between
// dealers. Naive move-detection against a single night false-positives at
// roughly 200:1 on that syndication, so this is the guardrail under every
// future "this car moved" claim, and the raw material for the ownership-group
// graph (~180 recognizable groups across 580 rooftops on 2026-08-17).
//
// It records the DOMAIN and the PRICE and nothing else — enough for the graph
// and for a group's price spread across its own rooftops.
import { richness } from "./normalize.mjs";

/**
 * Streaming accumulator, so a caller that reads shard files one at a time
 * never has to hold every record at once (merge-shards walks ~100k of them).
 *
 * One entry per DOMAIN, not per record: a VIN seen twice on the same site —
 * its search-results tile, then its own detail page — is one rooftop offering
 * one car, and counting it twice would invent an edge that isn't there. The
 * richest record for that rooftop supplies the price, mirroring the dedupe
 * rule it shadows so the price kept is the one that rooftop's best record
 * carried.
 */
export function colistingAccumulator() {
  const sightings = new Map();
  return {
    add(ev) {
      // The dedupe's fallback key is `domain:sourceUrl`, which cannot collide
      // across domains by construction, so a record with no VIN can never be
      // evidence of co-listing.
      if (!ev?.vin || !ev.dealerDomain) return;
      let byDomain = sightings.get(ev.vin);
      if (!byDomain) sightings.set(ev.vin, (byDomain = new Map()));
      const r = richness(ev);
      const held = byDomain.get(ev.dealerDomain);
      if (!held || r > held.r) byDomain.set(ev.dealerDomain, { r, priceUsd: ev.priceUsd ?? null });
    },
    /** Multi-domain VINs only, sorted, in the shape colisting-sync ships. */
    pairs() {
      const out = [];
      for (const [vin, byDomain] of sightings) {
        if (byDomain.size < 2) continue;
        out.push({
          vin,
          sightings: [...byDomain.entries()]
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
            .map(([domain, s]) => ({ domain, priceUsd: s.priceUsd })),
        });
      }
      out.sort((a, b) => (a.vin < b.vin ? -1 : a.vin > b.vin ? 1 : 0));
      return out;
    },
  };
}

/** How many distinct domains the pairs span — the log line's second number. */
export function colistedDomainCount(pairs) {
  return new Set(pairs.flatMap((c) => c.sightings.map((s) => s.domain))).size;
}
