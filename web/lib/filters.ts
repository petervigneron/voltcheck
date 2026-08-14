// Shared between the rail (client) and the results page (server) so a filter is
// described the same way wherever it appears — on its chip, and in the count of
// what dropping it would give back.

/** Every filter that can be switched off individually, in the order it reads. */
export const REMOVABLE = [
  "q",
  "make",
  "model",
  "cond",
  "drive",
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
 */
export const QUICK_TOGGLES: { key: RemovableFilter; value: string; label: string }[] = [
  { key: "minRange", value: "200", label: "200+ mi range" },
  { key: "maxMiles", value: "60000", label: "Under 60k miles" },
  { key: "maxPrice", value: "30000", label: "Under $30,000" },
  { key: "drive", value: "AWD", label: "AWD" },
];

const money = (v: string) => `$${Number(v).toLocaleString()}`;

export function describeFilter(key: string, value: string): string | null {
  switch (key) {
    case "q":
      return `“${value}”`;
    case "make":
    case "model":
      return value;
    case "cond":
      return value === "new" ? "New" : "Used & certified";
    case "drive":
      return value;
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
