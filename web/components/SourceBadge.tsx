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
//
// Both soft tiers read "est." — an `agg` fact is one we settled from
// secondary outlets rather than the manufacturer's own sheet, so it IS our
// estimate. The old "unverified" label defamed that work: it told the shopper
// we hadn't checked, when the opposite is true (some `agg` facts are
// high-confidence, sourced to named outlets). "est." says the true thing —
// this is our best read, not the maker's published figure.
const SOFT: Record<string, string> = {
  est: "est.",
  agg: "est.",
};

export function SourceBadge({ fact }: { fact: Fact<unknown> }) {
  const label = SOFT[fact.source];
  if (!label) return null;
  return (
    <span className="text-[11px] font-medium text-amber-700 dark:text-amber-500">{label}</span>
  );
}
