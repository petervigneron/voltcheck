// The rule that decides whether a live car is DARK — held in the database
// but withheld from the site — and a summary of the dark set by rooftop.
//
// This is the owner's acceptance test for the browser crawl, as a function:
//
//   select count(*) from listings l join listing_seen s using (vin)
//   where l.delisted_at is null and l.dealer_domain = any(<browser-lane domains>)
//     and greatest(s.last_seen_at, coalesce(s.last_confirmed_at, s.last_seen_at))
//         < now() - interval '36 hours'
//
// which is the complement of live_listings_feed's rule 1 (migration 0091):
// a car is served only while some source saw it, or its own page confirmed
// it, within 36 hours. Postgres's greatest() ignores nulls, so the later of
// whichever stamps exist is what is compared; a row with neither is not dark
// (it is not served either, but for a reason this rule does not own).
export const DARK_AFTER_MS = 36 * 3_600_000;

/** Epoch ms of the later of last_seen_at / last_confirmed_at, or -Infinity
 *  when the row has neither. */
export function lastEvidenceAt(seen) {
  let best = -Infinity;
  for (const k of ["last_seen_at", "last_confirmed_at"]) {
    const t = Date.parse(seen?.[k] ?? "");
    if (Number.isFinite(t) && t > best) best = t;
  }
  return best;
}

export function isDark(seen, now = Date.now()) {
  const t = lastEvidenceAt(seen);
  return Number.isFinite(t) && t < now - DARK_AFTER_MS;
}

/**
 * rows: [{ vin, dealerDomain, dark: boolean }]. platformOf: domain → platform
 * label (the "cluster"). Returns the counts the report prints.
 */
export function summarizeDark(rows, platformOf = () => "unknown") {
  const live = new Map();
  const dark = new Map();
  for (const r of rows) {
    live.set(r.dealerDomain, (live.get(r.dealerDomain) ?? 0) + 1);
    if (r.dark) dark.set(r.dealerDomain, (dark.get(r.dealerDomain) ?? 0) + 1);
  }
  const byPlatform = {};
  for (const [d, n] of live) {
    const p = platformOf(d) ?? "unknown";
    const b = (byPlatform[p] ??= { rooftops: 0, live: 0, dark: 0, darkRooftops: 0, fullyDark: 0 });
    b.rooftops++;
    b.live += n;
    const k = dark.get(d) ?? 0;
    if (k) {
      b.dark += k;
      b.darkRooftops++;
      if (k === n) b.fullyDark++;
    }
  }
  const top = [...dark.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([d, k]) => ({ domain: d, dark: k, live: live.get(d) }));
  return {
    rooftopsWithLiveRows: live.size,
    live: rows.length,
    dark: rows.filter((r) => r.dark).length,
    darkRooftops: dark.size,
    fullyDarkRooftops: [...dark].filter(([d, k]) => k === live.get(d)).length,
    byPlatform,
    top,
  };
}
