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
