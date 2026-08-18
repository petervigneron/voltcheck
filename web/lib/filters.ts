// Shared between the rail (client) and the results page (server) so a filter is
// described the same way wherever it appears — on its chip, and in the count of
// what dropping it would give back.

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
  { key: "body", value: "suv", label: "SUVs", axis: "variant" },
  { key: "minRange", value: "200", label: "200+ mi range", axis: "variant" },
  { key: "maxMiles", value: "60000", label: "Under 60k miles", axis: "market" },
  { key: "maxPrice", value: "30000", label: "Under $30,000", axis: "market" },
  { key: "drive", value: "AWD", label: "AWD", axis: "variant" },
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
      return value;
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
    case "zip":
      return `Near ${value}`;
    default:
      return null;
  }
}
