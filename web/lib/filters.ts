// Shared between the rail (client) and the results page (server) so a filter is
// described the same way wherever it appears — on its chip, and in the count of
// what dropping it would give back.
import { INCENTIVE_COPY } from "@/lib/incentives/copy";

/** Every filter that can be switched off individually, in the order it reads. */
export const REMOVABLE = [
  "q",
  "make",
  "model",
  "trim",
  "kwh",
  "epa",
  "cond",
  "drive",
  "body",
  "minPrice",
  "maxPrice",
  "minYear",
  "maxYear",
  "maxMiles",
  "minRange",
  "heatPump",
  "cut",
  // Cars that meet at least one rebate program's car-side conditions under
  // the site policy (lib/incentives/match.ts) — the card's `incentive` field.
  "rebate",
  // The Pro deals filter (lib/listings/deal.ts). In REMOVABLE so it types as a
  // FilterTest and describes as a chip; applied only for a pass-holder
  // (match.ts reads MatchContext.pro), so ?deal=1 in a stranger's URL is inert.
  "deal",
  "zip",
] as const;

export type RemovableFilter = (typeof REMOVABLE)[number];

/**
 * One-click filters on the rail. Each stays in place when active (pressed
 * state) instead of turning into a remove-chip, so on/off is legible at a
 * glance. A different value for the same key set from the full panel shows as
 * a normal chip instead.
 *
 * `axis` decides how hard a toggle has to work to stay on the rail
 * (components/Filters.tsx), and the two kinds ask genuinely different
 * questions:
 *
 *   variant  what the car IS. Drivetrain, body, the range its version was
 *            rated at — things the maker decided once and a shopper picks
 *            between. Any real example of the other kind justifies the
 *            button: Volvo sold the EX30 as a single-motor RWD as well as a
 *            twin-motor AWD, so "+ AWD" is a real choice on an EX30 search
 *            even though today only 10 of 285 in stock are rear-drive.
 *            Thin stock is not the same as no such car.
 *   market   what today's listings happen to hold. Mileage and price are not
 *            properties of the model, they are properties of the cars for
 *            sale this week, so these have to clear a share to be worth a
 *            click — two cars over 60k miles in 4,603 Lyriqs is not a filter.
 */
export const QUICK_TOGGLES: {
  key: RemovableFilter;
  value: string;
  label: string;
  axis: "variant" | "market";
}[] = [
  // The set and its order are the owner's call of 2026-09-02, made on
  // measured evidence (docs/TOGGLE-EVIDENCE-2026-09-02.md: Google autocomplete
  // over 78 seeds, 21 buyer threads, and the feed's own shares). In brief:
  // a price cap is the most-typed modifier by far and the market types 10k,
  // 20k, 15k before 30k — $20,000 is the lowest figure the feed can serve
  // (~2%; $10k is 300 cars), and it doubles as a daily gauge of that
  // coverage hole. SUV and AWD lead the body and drivetrain demand. 300 is
  // the range figure typed first; 200+ passed 99.4% of BEVs, a BEV/PHEV
  // switch in disguise. Under 60k miles was dropped: no figure was typed in
  // 1,103 suggestions and it kept 88% of used cars (the panel still has the
  // field). Heat pump and price cut stay on forum and "deals" demand.
  // filter_toggled events (0058) now count every press, so the next revision
  // can be made on the site's own numbers.
  { key: "maxPrice", value: "20000", label: "Under $20,000", axis: "market" },
  { key: "body", value: "suv", label: "SUVs", axis: "variant" },
  { key: "drive", value: "AWD", label: "AWD", axis: "variant" },
  { key: "minRange", value: "300", label: "300+ mi range", axis: "variant" },
  { key: "heatPump", value: "1", label: "Heat pump", axis: "variant" },
  { key: "cut", value: "1", label: "Price cut", axis: "market" },
  // Owner's call, 2026-09-02: a toggle for cars that might qualify for a
  // rebate. Market axis: which programs pay is a property of this week's
  // listings (their state, price and condition), not of the model. The label
  // comes from lib/incentives/copy.ts and the rail hides the toggle until the
  // owner has written it (components/Filters.tsx).
  { key: "rebate", value: "1", label: INCENTIVE_COPY.toggleLabel, axis: "market" },
];

/**
 * The body types a listing can be filtered to. The mapping from model to body
 * type lives server-side in lib/listings/bodyType.ts; only models it can
 * verifiably classify are included when one of these is set.
 */
export const BODY_TYPES = [
  { value: "suv", label: "SUVs" },
  { value: "sedan", label: "Sedans" },
  { value: "truck", label: "Trucks" },
  { value: "van", label: "Vans" },
  { value: "hatchback", label: "Hatchbacks" },
] as const;

export type BodyType = (typeof BODY_TYPES)[number]["value"];

/**
 * The spec facets — the versions of one model, offered once the results are
 * down to a single model (components/Filters.tsx SpecFacets). Each holds a
 * comma-separated list of values that OR together; the facets AND with each
 * other and with everything else on the rail.
 */
export const SPEC_FACETS = [
  { key: "trim", label: "Trim", unit: "" },
  { key: "kwh", label: "Battery", unit: " kWh" },
  { key: "epa", label: "Range", unit: " mi" },
] as const;

export type SpecFacet = (typeof SPEC_FACETS)[number]["key"];

/**
 * Drivetrain as a spec-facet row — offered only where a model's curated spec
 * (lib/listings/facetSpec.ts) asks for it. Deliberately NOT in SPEC_FACETS:
 * those keys are dropped when the model changes (dropSpecFilters), and AWD
 * means the same thing under every model, so a drivetrain choice survives the
 * next search the way a trim never could.
 */
export const DRIVE_FACET = { key: "drive", label: "Drivetrain", unit: "" } as const;

/** Every axis the spec rail can offer: the model-scoped three plus drivetrain. */
export type FacetKey = SpecFacet | typeof DRIVE_FACET.key;

// Twelve chips is already two rows on a laptop; past that a model's versions
// stop being scannable, which is the only thing the rail is for. Which twelve
// is decided by depth of stock, never by position — slicing a range row sorted
// by miles would hide the longest-range versions, the half most shoppers came
// for. The rest stay one click away behind "+N more".
export const FACET_CAP = 12;

/** A trim from the last model means nothing under the next one. */
export function dropSpecFilters(params: URLSearchParams): void {
  for (const f of SPEC_FACETS) params.delete(f.key);
}

export const splitValues = (v: string) => v.split(",").filter(Boolean);

/**
 * A list of `<select>` options with `current` guaranteed present.
 *
 * A select whose value is not among its options renders EMPTY, which reads as
 * "no filter" over a filter that is very much applied. Two ways that happens
 * here, and both are ordinary: lib/listings/tally.ts prunes single-car feed
 * spellings from the offered list while a shared link or a back-navigation can
 * still carry one, and /worth is server-rendered with a make and model in the
 * URL before the facets have landed in the browser at all.
 */
export function withCurrent(options: string[], current: string): string[] {
  if (!current || options.includes(current)) return options;
  return [...options, current].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
}

/** Toggle one value inside a facet's list, preserving the order it was picked. */
export function toggleValue(current: string, value: string): string {
  const vs = splitValues(current);
  const next = vs.includes(value) ? vs.filter((v) => v !== value) : [...vs, value];
  return next.join(",");
}

const money = (v: string) => `$${Number(v).toLocaleString()}`;
const orList = (v: string, unit: string) => `${splitValues(v).join(" or ")}${unit}`;

export function describeFilter(key: string, value: string): string | null {
  switch (key) {
    case "q":
      return `“${value}”`;
    case "make":
    case "model":
      return value;
    case "trim":
      return orList(value, "");
    case "kwh":
      return orList(value, " kWh");
    case "epa":
      return orList(value, " mi range");
    case "cond":
      return value === "new" ? "New" : "Used & certified";
    case "drive":
      // The drivetrain facet ORs values like the other spec facets do.
      return orList(value, "");
    case "body":
      return BODY_TYPES.find((b) => b.value === value)?.label ?? null;
    case "minPrice":
      return `Over ${money(value)}`;
    case "maxPrice":
      return `Under ${money(value)}`;
    case "minYear":
      return `${value} or newer`;
    case "maxYear":
      return `${value} or older`;
    case "maxMiles":
      return `Under ${Number(value).toLocaleString()} mi`;
    case "minRange":
      return `${value}+ mi range`;
    case "heatPump":
      return value === "1" ? "Heat pump" : null;
    case "cut":
      return value === "1" ? "Price cut" : null;
    case "rebate":
      return value === "1" ? INCENTIVE_COPY.toggleLabel : null;
    case "deal":
      return value === "1" ? "Deals" : null;
    case "zip":
      return `Near ${value}`;
    default:
      return null;
  }
}
