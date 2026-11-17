import { after } from "next/server";
import { findListing } from "@/lib/listings/source";
import { SITE } from "@/lib/api/records";
import { GO_HEADERS, goDecision, goVin, type GoEvent, type GoLookup } from "@/lib/go";

// GET /go/<vin>?ref=<label> — forwards to the seller's own page for a car and
// counts the click. lib/go.ts says why and decides every answer; this file
// looks the car up and does the I/O.
//
// The lookup is findListing(), the same per-VIN read the listing page and
// /api/v1/listings/{vin} make, so the seller URL is the one the car's page
// links to now rather than as of the last publish. It is bounded: a read that
// has not answered in LOOKUP_MS forwards to the car's own page instead of
// holding the person on a blank tab.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const LOOKUP_MS = 8000;
const RECORD_MS = 3000;

async function lookup(vin: string): Promise<GoLookup> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => resolve("timeout"), LOOKUP_MS);
    });
    const l = await Promise.race([findListing(vin), timeout]);
    if (l === "timeout") return { kind: "unavailable" };
    return l ? { kind: "found", sellerUrl: l.sourceUrl } : { kind: "missing" };
  } catch {
    return { kind: "unavailable" };
  } finally {
    clearTimeout(timer);
  }
}

/** One events row, the same insert app/api/events does. Never throws, never
 *  waits longer than RECORD_MS, and runs after the redirect has been sent. */
async function record(e: GoEvent): Promise<void> {
  const base = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_ANON_KEY;
  if (!base || !key) return;
  try {
    await fetch(`${base}/rest/v1/events`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify(e),
      cache: "no-store",
      signal: AbortSignal.timeout(RECORD_MS),
    });
  } catch {
    // Instrumentation never breaks the redirect.
  }
}

async function handle(req: Request, params: Promise<{ vin: string }>): Promise<Response> {
  const vin = goVin((await params).vin);
  const d = vin
    ? goDecision({
        vin,
        method: req.method,
        userAgent: req.headers.get("user-agent"),
        search: new URL(req.url).search,
        lookup: await lookup(vin),
        site: SITE,
      })
    : ({ status: 404 } as const);
  if (d.status === 404) {
    return new Response(req.method === "HEAD" ? null : "No live listing for this VIN.\n", {
      status: 404,
      headers: { ...GO_HEADERS, "content-type": "text/plain; charset=utf-8" },
    });
  }
  if (d.record) {
    const ev = d.record;
    after(() => record(ev));
  }
  return new Response(null, { status: 302, headers: { ...GO_HEADERS, location: d.location } });
}

export async function GET(req: Request, { params }: { params: Promise<{ vin: string }> }): Promise<Response> {
  return handle(req, params);
}

export async function HEAD(req: Request, { params }: { params: Promise<{ vin: string }> }): Promise<Response> {
  return handle(req, params);
}
