import type { Fact } from "@/lib/types";

// Where a fact came from is our problem, not the shopper's.
//
// Every fact used to carry a coloured provenance chip — "NHTSA vPIC",
// "manufacturer", "dealer data" — which told a buyer nothing they could act
// on, tripled the visual weight of every row, and published the shape of the
// research pipeline on every page.
//
// What a buyer does need is the one bit that changes how much to trust the
// number: whether it is measured or estimated. So a solid fact now renders
// bare, and only a soft one is marked. Silence means sourced.
const SOFT: Record<string, string> = {
  est: "est.",
  agg: "unverified",
};

export function SourceBadge({ fact }: { fact: Fact<unknown> }) {
  const label = SOFT[fact.source];
  if (!label) return null;
  return (
    <span className="text-[11px] font-medium text-amber-700 dark:text-amber-500">{label}</span>
  );
}
