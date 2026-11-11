import { apiManifest, apiPartition } from "@/lib/api/artifacts";
import { CORS, json, options, unavailable } from "@/lib/api/http";
import { paidSignals, paidUnavailable, requireKey } from "@/lib/api/paid";
import { paidFields } from "@/lib/api/paidFields";

// GET /api/v1/data/export/{make} — every listing of one make, as NDJSON, with
// the paid fields. Tesla alone is ~8 MB of records, which is over what a
// function may return as one buffered body, so the lines are streamed.
//
// The records are the published artifact's (lib/api/artifacts.ts), so the
// export is as of the last publish and says so in x-as-of; it is not a live
// read of the database, for the reason nothing else in this API is.
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Lines per chunk: enough that the stream is not one syscall per car. */
const CHUNK = 500;

export const OPTIONS = options;
export async function GET(req: Request, { params }: { params: Promise<{ make: string }> }): Promise<Response> {
  const refused = await requireKey(req);
  if (refused) return refused;
  const { make } = await params;
  const m = await apiManifest();
  if (!m) return unavailable();
  const slug = make.toLowerCase();
  if (!m.makes.some((x) => x.slug === slug)) {
    return json({ error: "no such make", details: ["GET /api/v1/data/export lists them"] }, { status: 404, keyed: true });
  }
  const [records, signals] = await Promise.all([apiPartition(m, slug), paidSignals()]);
  if (!records) return unavailable();
  if (!signals) return paidUnavailable();

  const enc = new TextEncoder();
  let i = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i >= records.length) {
        controller.close();
        return;
      }
      let out = "";
      for (const end = Math.min(i + CHUNK, records.length); i < end; i++) {
        out += JSON.stringify({ ...records[i], ...paidFields(records[i].id, signals) }) + "\n";
      }
      controller.enqueue(enc.encode(out));
    },
  });
  return new Response(body, {
    headers: {
      ...CORS,
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "private, no-store",
      "x-as-of": m.as_of,
      "x-total": String(records.length),
    },
  });
}
