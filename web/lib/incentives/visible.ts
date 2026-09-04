import type { IncentiveMatch } from "./match";
import { INCENTIVES_COPY_READY } from "./copy";

// The one decision every incentive surface makes before rendering: is there
// anything to show, and is the copy written? Kept in a .ts module so the
// gate is testable by the CI test job, which runs Node's type stripping alone
// and cannot load a .tsx component (2026-09-03: tests/incentives.test.ts
// imported components/Incentives.tsx and every push went red with "Cannot
// find module 'typescript'" — the hook transpiles .tsx by requiring
// typescript, which CI never installs).
export function incentivesToRender(matches: IncentiveMatch[]): IncentiveMatch[] {
  if (!INCENTIVES_COPY_READY) return [];
  return matches;
}

/** /api/rebates/[zip]'s answer, plus how the ZIP was come by. */
export interface ZipAnswer {
  /** The ZIP's own state. */
  state: string;
  /** Ids of the live programs a resident of this ZIP can use. */
  keep: string[];
  /** The shopper typed this ZIP, rather than it being an IP guess. */
  typed: boolean;
}

/**
 * The matches a shopper at this ZIP should see, out of the ones the car
 * meets the conditions of.
 *
 * The ZIP is here to pick the right utility program out of the dozen a
 * California car matches at once — the shopper is a customer of one. It is
 * NOT here to decide whether the shopper is a resident of the car's state,
 * and two rules keep it from pretending to.
 *
 * 1. A ZIP only ever narrows programs of ITS OWN state. Before 2026-09-04 it
 *    was matched against every program by id, so a shopper whose ZIP was in
 *    another state kept nothing at all: the block did not shrink, it
 *    vanished. Every car outside your state showed a "CA resident rebate"
 *    tag on the card and then said nothing whatsoever on the car's own page.
 *    Reproduced on voltcheck.net with the live feed: the block was absent on
 *    a CA-tagged Charger and rendered in full the moment the ZIP was set to
 *    94110.
 *
 * 2. An IP guess never narrows to nothing. Owner, 2026-09-04: "people may be
 *    residents and be physically located away from their home when they
 *    search." Vercel's geolocation says where a connection came out today,
 *    which is not where anyone lives, and a guess that silently deletes the
 *    whole block is the guess doing the most damage it can. A ZIP the
 *    shopper typed may narrow to nothing — that is them telling us.
 *
 * Nothing here decides eligibility. Every program that renders still carries
 * its own residency and account conditions verbatim, and the block's foot
 * says eligibility is the shopper's to confirm.
 */
export function narrowToZip(matches: IncentiveMatch[], answer: ZipAnswer | null | undefined): IncentiveMatch[] {
  if (!answer) return matches;
  const narrowed = matches.filter((m) =>
    m.program.jurisdiction.state === answer.state ? answer.keep.includes(m.program.id) : true
  );
  if (!answer.typed && narrowed.length === 0) return matches;
  return narrowed;
}
