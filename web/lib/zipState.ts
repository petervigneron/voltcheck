// ZIP → state, for a listing that names a ZIP and no state (lib/api/records.ts).
// The table is data/utility-zips.json's `zipState` — the one the rebate
// territory reads (lib/incentives/territory.ts), built from EIA-861 utility ZIP
// tables and the Census ZCTA-county file. Exact five-digit ZIPs only; that
// file's 3-digit `prefixState` fallback is a vote, not a fact, and is never
// read here.
//
// Server-only and imported lazily, like lib/zips.ts: 550 KB of JSON that only
// the publisher and the per-VIN API path should ever load.

let tablePromise: Promise<Record<string, string>> | undefined;

export function loadZipStates(): Promise<Record<string, string>> {
  return (tablePromise ??= import("@/data/utility-zips.json").then(
    (m) => (m.default as unknown as { zipState: Record<string, string> }).zipState
  ));
}

/** Pure: the ZIP's state from a table already in hand, or undefined. */
export function zipStateLookup(table: Record<string, string> | undefined, zip: string | undefined): string | undefined {
  if (!table || !zip) return undefined;
  const z = zip.trim().slice(0, 5);
  if (!/^\d{5}$/.test(z)) return undefined;
  return Object.prototype.hasOwnProperty.call(table, z) ? table[z] : undefined;
}
