import { dbConfigured } from "./db";

// Recent real-world sales of the same make/model — transaction prices, not
// asking prices. Currently sourced from Washington State DOL title records
// (data.wa.gov rpr4-cgyd, ODbL — attribution required wherever rows render);
// as other states' data is added, this is the layer where sources merge.

export interface RecentSale {
  modelYear: number | null;
  salePrice: number;
  odometer: number;
  saleDate: string; // YYYY-MM-DD
  /** The version that sold, resolved from its VIN (migration 0016).
   *  Null when the VIN doesn't encode one — rendered "Unknown", never guessed. */
  variant: string | null;
  /** Same VIN(1-8) cohort as the listing being viewed: the real comparison. */
  sameVariant: boolean;
}

const REVALIDATE_SECONDS = 86_400; // upstream refreshes monthly

// Goes through the recent_sales RPC rather than the table: raw wa_ev_sales
// reads are revoked for anon (migration 0007), and the RPC caps the excerpt
// at 10 fixed-order rows so the anon key can never bulk-extract the archive.
//
// `vin` is this listing's own VIN. Its first 8 characters are the variant
// cohort, so passing it sorts sales of the SAME version to the front — a
// Lariat's page compares against Lariats instead of against whichever ten
// Lightnings sold most recently.
//
// `year` and `mileage` are this car's own, and they BAND the list rather than
// sort it (migration 0037). VIN(1-8) turned out not to separate generations —
// a 2023 Bolt 2LT and a 2017 Bolt Premier share 1G1FX6S0 — and nothing bounded
// the odometer at all, so a 137,703-mile car was being shown against 21,691-
// mile sales of the same nameplate. Either omitted, its half of the band is
// skipped rather than guessed.
export async function fetchRecentSales(
  make: string,
  model: string,
  vin?: string,
  year?: number,
  mileage?: number | null
): Promise<RecentSale[]> {
  if (!dbConfigured()) return [];
  const base = process.env.SUPABASE_URL!.replace(/\/$/, "");
  const key = process.env.SUPABASE_ANON_KEY!;
  try {
    const res = await fetch(`${base}/rest/v1/rpc/recent_sales`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        _make: make,
        _model: model,
        _vin8: vin && vin.length >= 8 ? vin.slice(0, 8).toUpperCase() : null,
        _year: year ?? null,
        // A delivery-mileage car has no odometer band worth applying and a
        // zero would band it to ±15,000 of nothing; the year band carries it.
        _odometer: mileage != null && mileage > 0 ? mileage : null,
      }),
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!res.ok) throw new Error(`PostgREST ${res.status}`);
    const rows = (await res.json()) as RecentSale[] | null;
    return Array.isArray(rows) ? rows : [];
  } catch (err) {
    console.error("[sales] recent sales lookup failed:", err);
    return [];
  }
}
