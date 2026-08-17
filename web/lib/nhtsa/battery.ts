// NHTSA's battery record for one cohort, read on the server only.
//
// The file this reads is refreshed by hand, monthly, by
// scraper/nhtsa-battery.mjs — which is also where the long note lives about
// why every model name has to be resolved against NHTSA's own vocabulary
// first. The short version: complaintsByVehicle answers a name it does not
// know with HTTP 200 and an empty list, so "Mustang Mach-E" reads as zero
// complaints when the truth is 115. A cohort we could not place is written
// with resolved: null, and this module returns null for it. Nothing renders.
//
// Detail pages only. The browse index is already past the size it should be
// and none of this belongs on a card: these are counts, and a count with no
// fleet behind it cannot be compared between two cars sitting side by side.

/** One cohort as scraper/nhtsa-battery.mjs writes it. */
export interface BatteryRecord {
  /** NHTSA's own model names for this cohort. null = we could not place it. */
  resolved: string[] | null;
  complaintsTotal?: number;
  complaintsBattery?: number;
  complaintsPack?: number;
  /** Complaints whose filer reported a fire. Collected, deliberately not
   *  rendered: a raw fire count with no fleet size under it is the kind of
   *  number that reads as a rating. */
  fires?: number;
  /** null = the recalls endpoint never answered for any spelling of this
   *  name. It says "no recalls" with the same HTTP 400 it uses for a name it
   *  does not know, so unasked and clean are indistinguishable and neither
   *  gets printed. */
  recallsTotal?: number | null;
  recallsBattery?: { campaign: string; component: string; summary?: string }[] | null;
  fetchedAt: string;
  /** Set when a resolved cohort could not be read. Counts are missing, not zero. */
  error?: string;
}

export type BatteryTable = Record<string, BatteryRecord>;

/** What the panel renders, or null for "render nothing at all". */
export interface BatteryRisk {
  /** Battery-related recalls, campaign number and NHTSA's own component
   *  string. Empty when the cohort is clean or when we could not ask. */
  recalls: { campaign: string; component: string }[];
  complaintsBattery: number;
  complaintsPack: number;
  asOf: string;
}

function key(make: string, model: string, year: number): string {
  const n = (s: string) => String(s ?? "").toUpperCase().replace(/\s+/g, " ").trim();
  return `${n(make)}|${n(model)}|${year}`;
}

/** Pure lookup — the whole "should this render" decision, testable without a
 *  filesystem. Anything short of a resolved cohort with a complaint count is
 *  null: an unresolved name, a cohort the refresh has never covered, a read
 *  that failed halfway. Silence is the honest answer to all three. */
export function selectBatteryRisk(
  table: BatteryTable | undefined,
  make: string,
  model: string,
  year: number
): BatteryRisk | null {
  const row = table?.[key(make, model, year)];
  if (!row || !row.resolved?.length || row.error) return null;
  if (typeof row.complaintsBattery !== "number" || typeof row.complaintsPack !== "number") return null;
  return {
    recalls: (row.recallsBattery ?? []).map((r) => ({ campaign: r.campaign, component: r.component })),
    complaintsBattery: row.complaintsBattery,
    complaintsPack: row.complaintsPack,
    asOf: row.fetchedAt,
  };
}

/** Imported lazily, the same way source.ts treats the listings fallback: the
 *  table is only ever wanted by a detail page, so a cold start that serves
 *  anything else never parses it. */
export async function batteryRisk(make: string, model: string, year: number): Promise<BatteryRisk | null> {
  try {
    const table = await import("@/data/nhtsa-battery.json");
    return selectBatteryRisk(table.default as BatteryTable, make, model, year);
  } catch {
    // No file yet (a fresh checkout before the first refresh run) is the same
    // answer as no row for this car.
    return null;
  }
}
