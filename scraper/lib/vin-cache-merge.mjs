// Union two readings of a VIN-keyed cache (registry/vpic-cache.json,
// registry/gm-warranty.json).
//
// WHY A UNION IS THE RIGHT MERGE HERE, and it is worth being explicit: these
// files are caches of per-VIN facts that do not change once established — a
// vPIC decode is permanent, a warranty start date is a date. Nothing ever
// needs to be REMOVED, so no legitimate write is a deletion, so a union can
// never lose a real edit. And the asymmetry is comfortable: keeping an entry
// too long costs nothing, while dropping one costs a re-fetch of that VIN.
//
// On a key both sides hold, the later checkedAt wins. That matters for
// gm-warranty.json, where a re-check can genuinely supersede an earlier
// answer (CLAUDE.md: Bolt recall packs RESTART the warranty clock), and it is
// harmless for vpic-cache.json, where the two readings agree anyway.
//
// An entry with no parseable checkedAt loses to one that has it, and if
// neither has one the incoming side wins — a cache entry we just wrote is at
// worst as good as the one already published.
export function mergeVinCache(mine, published) {
  const at = (e) => {
    const t = Date.parse(e?.checkedAt ?? "");
    return Number.isFinite(t) ? t : -Infinity;
  };
  const out = { ...(published ?? {}) };
  for (const [vin, entry] of Object.entries(mine ?? {})) {
    const rival = out[vin];
    if (rival === undefined || at(entry) >= at(rival)) out[vin] = entry;
  }
  return out;
}
