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
