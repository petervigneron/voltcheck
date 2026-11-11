import { apiManifest } from "@/lib/api/artifacts";
import { json, options, unavailable } from "@/lib/api/http";
import { requireKey } from "@/lib/api/paid";
import { SITE } from "@/lib/api/records";

// GET /api/v1/data/export — the index of the bulk export: one file per make,
// with how many cars each holds. The search endpoint returns a page at a
// time; this is how a key-holder takes the whole feed.
export const dynamic = "force-dynamic";

export const OPTIONS = options;
export async function GET(req: Request): Promise<Response> {
  const refused = await requireKey(req);
  if (refused) return refused;
  const m = await apiManifest();
  if (!m) return unavailable();
  return json(
    {
      as_of: m.as_of,
      total: m.total,
      format: "application/x-ndjson — one listing record per line",
      makes: m.makes.map((x) => ({ make: x.make, count: x.count, url: `${SITE}/api/v1/data/export/${x.slug}` })),
    },
    { asOf: m.as_of, keyed: true },
  );
}
