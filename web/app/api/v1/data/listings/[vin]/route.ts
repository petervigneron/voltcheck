import { json, options } from "@/lib/api/http";
import { paidSignals, paidUnavailable, requireKey } from "@/lib/api/paid";
import { paidFields } from "@/lib/api/paidFields";
import { listingByVin } from "@/lib/api/search";

// GET /api/v1/data/listings/{vin} — one car for a data key: the record
// /api/v1/listings/{vin} returns, price history included, plus the paid
// fields when the car has them.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const OPTIONS = options;
export async function GET(req: Request, { params }: { params: Promise<{ vin: string }> }): Promise<Response> {
  const refused = await requireKey(req);
  if (refused) return refused;
  const { vin } = await params;
  const r = await listingByVin(vin);
  if ("error" in r) return json(r, { status: r.details ? 400 : 404, keyed: true });
  const signals = await paidSignals();
  if (!signals) return paidUnavailable();
  return json({ ...r, ...paidFields(r.id, signals) }, { asOf: r.as_of, keyed: true });
}
