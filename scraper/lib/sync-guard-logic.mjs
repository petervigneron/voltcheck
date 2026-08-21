// Pure decision logic for sync-guard.mjs, split out so it's testable without
// a network call or a clock. Two questions, kept separate on purpose:
//
//   1. isStable()   — can this read be trusted at all? A total read twice a
//      few seconds apart that disagrees by more than noise means the database
//      is still being written to (a sync in flight, ours or someone else's,
//      automated or a human's manual salvage) — the 2026-08-21 incident this
//      whole file exists for was exactly a render that landed mid-write and
//      then got CDN-cached for a day. An unstable read must not be judged
//      pass or fail; it is INCONCLUSIVE, and the only safe response is to
//      say so and let a human look, never to act (auto-retry the sync, force
//      a revalidate, "average the two readings") — see verdictFor's header.
//   2. verdictFor() — given a TRUSTED (stable) current count and the last
//      known-good count, has this lane/total dropped by more than real
//      night-over-night churn ever has?
//
// Thresholds, justified from the pipeline's own logged history (not a guess
// — see docs cited inline):
//   - Two ordinary nights' db-sync totals (2026-08-17, runs 32022327707 and
//     32044269696) delisted 2.4% and 1.0% of that night's seen rows.
//   - The same day's recheck sold-signal delisted 2.6% of what it checked.
//   - Git history of web/data/scraped-listings.json (commits ccfabca..8981600,
//     2026-08-10..19) shows normal night-over-night moves are 0-30% while the
//     site is actively growing coverage (new OEM lanes onboarding, dealer
//     rooftops being validated) — all of that movement is UP or a single
//     lane briefly reporting 0 while its crawl legitimately failed to
//     complete (which the delist-only-complete-crawls rule already protects
//     against separately). No ordinary night has ever posted a DROP over
//     30% in a lane that previously had a complete crawl, let alone the
//     whole feed.
//   - The one real incident (2026-08-21) dropped the whole feed ~32%
///    (87,082 -> 58,741) and turned out to be a mid-write read, not real
//     data loss — but a naive global-only check WOULD have caught it; the
//     per-lane breakdown is what would have told a human which lane to look
//     at first.
// GLOBAL thresholds sit far enough above the ~1-3% observed baseline churn
// to never fire on a normal night, and far enough below 32% to catch this
// one with margin. LANE thresholds are looser than GLOBAL: a single OEM
// brand's locator going dark for a night (its own API down) is a real,
// already-seen failure mode that removes ONE brand's rows without any bug
// in this pipeline, so a lane alarm is tuned to warn on it (worth a human's
// attention) without failing the whole run over it — only a lane-level
// crater far past that shows FAIL.
export const THRESHOLDS = {
  globalWarnDrop: 0.08,
  globalFailDrop: 0.15,
  laneWarnDrop: 0.15,
  laneFailDrop: 0.4,
};

// Relative disagreement between two samples of the "same" count, taken a
// short pause apart, that still counts as "the same reading" — ordinary
// index-scan variance plus a handful of rows changing between samples, not a
// write in progress. Loose enough to tolerate that noise, tight enough that
// a real mid-sync swing (thousands of rows) trips it.
export const STABILITY_TOLERANCE = 0.01;

export function isStable(sampleA, sampleB, tolerance = STABILITY_TOLERANCE) {
  if (sampleA === 0 && sampleB === 0) return true;
  const denom = Math.max(sampleA, sampleB, 1);
  return Math.abs(sampleA - sampleB) / denom <= tolerance;
}

/**
 * @param prev  previously recorded known-good count (null/undefined = no
 *              baseline yet, e.g. this lane's first night)
 * @param cur   this run's stable count
 * @param warnDrop / failDrop  fractional drop thresholds (0.08 = 8%)
 */
export function verdictFor(prev, cur, warnDrop, failDrop) {
  if (prev == null || prev <= 0) return { level: "ok", reason: "no prior baseline" };
  const drop = (prev - cur) / prev;
  if (drop >= failDrop) return { level: "fail", drop, reason: `dropped ${(drop * 100).toFixed(1)}% (fail floor ${(failDrop * 100).toFixed(0)}%)` };
  if (drop >= warnDrop) return { level: "warn", drop, reason: `dropped ${(drop * 100).toFixed(1)}% (warn floor ${(warnDrop * 100).toFixed(0)}%)` };
  return { level: "ok", drop, reason: `${drop >= 0 ? "dropped" : "grew"} ${(Math.abs(drop) * 100).toFixed(1)}%` };
}

/** Worst-of a set of {level} verdicts — "fail" beats "warn" beats "ok". */
export function worstLevel(levels) {
  if (levels.includes("fail")) return "fail";
  if (levels.includes("warn")) return "warn";
  return "ok";
}
