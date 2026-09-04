// A wall-clock stop for work that may never come back.
//
// WHY THIS IS ITS OWN FILE
//
// crawl.mjs has two clocks and neither could end a call that had stopped
// returning. --deadline-min stops workers taking NEW domains; --domain-cap-min
// is read at the top of the walk loop, so it ends a domain making slow
// progress and not one making none. Both are checked BETWEEN steps, and a
// visit does plenty that is not a step of that loop — sitemap discovery, the
// platform API pulls, the browser lanes.
//
// What that cost, measured on the rolling crawl of 2026-09-04 06:57: 39 of 48
// slices were killed by the 34-minute job timeout. Not one of them was slow —
// 398 to 402 of about 400 domains had finished and been written to out/ in
// under 24 minutes. Each was waiting on ONE domain (buckeyenissan.com held a
// worker for 26 minutes under an 8-minute cap, silently) inside
// `Promise.all` over the worker pool, so the process never exited, so the
// step was cancelled, so the sync step never ran, so all 400 domains' cars
// were thrown away for the sake of the one. Nine slices synced. The lanes
// were switched off in response; the hang was never browser-lane-specific
// (the stragglers were ridemotive, dealer.com, dealeron and unknown as often
// as not).
//
// So: bound the pool, not just its parts. `withWall` is that bound. It never
// cancels anything — there is nothing here that could — it stops WAITING, and
// the caller decides what a lost race means. The abandoned work keeps running
// until the process leaves, which is why `sealReport` exists below.

const WALL = Symbol("wall");

/**
 * Wait for `promise`, but no later than `wallAt` (an epoch ms; 0 or a
 * non-finite value means no wall). Resolves `{ finished: true, value }` when
 * the work won and `{ finished: false }` when the clock did. Never rejects
 * for the timeout — a wall is an expected outcome here, not an error.
 */
export async function withWall(promise, wallAt) {
  if (!wallAt || !Number.isFinite(wallAt)) return { finished: true, value: await promise };
  let timer;
  const wall = new Promise((resolve) => {
    timer = setTimeout(() => resolve(WALL), Math.max(0, wallAt - Date.now()));
    // Deliberately NOT unref'd. The `finally` below clears it on both paths,
    // so it can never outlive the race — and an unref'd wall is a wall that
    // does not fire when it is the only thing left pending, which is exactly
    // the case where waiting forever would be worst. (It also made every test
    // after the first in wall.test.mjs die with "Promise resolution is still
    // pending but the event loop has already resolved" on CI's node 22.)
  });
  // Abandoned work that rejects later must not take the process down with an
  // unhandled rejection — that would undo the whole point of walking away.
  // Promise.race is what makes that safe and is the reason this is written
  // with a race rather than a flag: race subscribes to every input, so a
  // rejection landing after the wall is already adopted and goes nowhere. A
  // rejection that BEAT the wall is not swallowed; it rethrows to the caller.
  // wall.test.mjs holds both halves of that.
  try {
    const won = await Promise.race([promise.then((value) => ({ value })), wall]);
    return won === WALL ? { finished: false } : { finished: true, value: won.value };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * A crawl report frozen at the moment its visit was abandoned.
 *
 * The abandoned call is still running and has no way to know it lost, so it
 * still holds a reference to the live report and still writes to it — and its
 * own last line is `report.truncated = queue.length > 0 || …`, which on a
 * queue that happens to have drained sets truncated FALSE. Landing that after
 * the crawl has walked away would tell db-sync the visit was complete, and a
 * complete visit that saw a fraction of a lot is a delisting instruction for
 * every car it missed. Hence a copy, with the arrays copied too, and
 * truncated nailed shut.
 *
 * The cars the visit had already found are kept. Abandoning a domain should
 * cost the pages it had not reached, not the ones it had.
 */
export function sealReport(report, why) {
  return {
    ...report,
    evs: [...report.evs],
    errors: [...report.errors],
    notes: [...report.notes],
    stoppedEarly: report.stoppedEarly ?? why,
    truncated: true,
  };
}
