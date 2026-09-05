import { json, options } from "@/lib/api/http";
import { listingByVin } from "@/lib/api/search";

// GET /api/v1/listings/{vin} — one car, read live (the same per-VIN
// database read its own page makes), with its asking-price history.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const OPTIONS = options;
export async function GET(_req: Request, { params }: { params: Promise<{ vin: string }> }): Promise<Response> {
  const { vin } = await params;
  const r = await listingByVin(vin);
  if ("error" in r) return json(r, { status: r.details ? 400 : 404 });
  return json(r, { maxAge: 600, asOf: r.as_of });
}
