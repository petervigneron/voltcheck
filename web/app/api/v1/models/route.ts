import { json, options } from "@/lib/api/http";
import { listModels } from "@/lib/api/search";

// GET /api/v1/models[?make=] — every make and model with live listings and
// their counts, from the API manifest the publisher writes.
export const dynamic = "force-dynamic";

export const OPTIONS = options;
export async function GET(req: Request): Promise<Response> {
  const make = new URL(req.url).searchParams.get("make") ?? undefined;
  const r = await listModels(make);
  if ("error" in r) return json(r, { status: 503 });
  return json(r, { maxAge: 3600, asOf: r.as_of });
}
