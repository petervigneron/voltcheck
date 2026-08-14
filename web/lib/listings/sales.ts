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
}

const REVALIDATE_SECONDS = 86_400; // upstream refreshes monthly

// Goes through the recent_sales RPC rather than the table: raw wa_ev_sales
// reads are revoked for anon (migration 0007), and the RPC caps the excerpt
// at 10 fixed-order rows so the anon key can never bulk-extract the archive.
export async function fetchRecentSales(make: string, model: string): Promise<RecentSale[]> {
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
      body: JSON.stringify({ _make: make, _model: model }),
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
