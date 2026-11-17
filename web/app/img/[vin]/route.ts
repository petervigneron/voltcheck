import { findListingImageUrl } from "@/lib/listings/source";
import { goVin } from "@/lib/go";
import { IMG_HEADERS, MISS_HEADERS, fetchImage } from "@/lib/img";

// GET /img/<vin> — the dealer's photo of a live listing, through our own
// origin, for the connector's in-chat cards. lib/img.ts says why, holds every
// check, and says what this costs (egress, bounded by its size cap and the
// CDN cache). This file looks the car up and does the I/O.
//
// The lookup is the row read findListing() starts with, bounded like /go's:
// a database that has not answered in LOOKUP_MS gets a 404 here (cached
// briefly, see MISS_HEADERS), since a card's placeholder block is a fine
// answer and a held request is not.
export const dynamic = "force-dynamic";
export const maxDuration = 20;

const LOOKUP_MS = 5000;

async function lookup(vin: string): Promise<string | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<undefined>((resolve) => {
      timer = setTimeout(() => resolve(undefined), LOOKUP_MS);
    });
    return await Promise.race([findListingImageUrl(vin), timeout]);
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

const miss = (head: boolean) => new Response(head ? null : "", { status: 404, headers: MISS_HEADERS });

async function handle(req: Request, params: Promise<{ vin: string }>): Promise<Response> {
  const head = req.method === "HEAD";
  const vin = goVin((await params).vin);
  if (!vin) return miss(head);
  const got = await fetchImage(await lookup(vin));
  if (!got.ok) return miss(head);
  return new Response(head ? null : (got.bytes as BodyInit), {
    status: 200,
    headers: { ...IMG_HEADERS, "content-type": got.type, "content-length": String(got.bytes.byteLength) },
  });
}

export async function GET(req: Request, { params }: { params: Promise<{ vin: string }> }): Promise<Response> {
  return handle(req, params);
}

export async function HEAD(req: Request, { params }: { params: Promise<{ vin: string }> }): Promise<Response> {
  return handle(req, params);
}
