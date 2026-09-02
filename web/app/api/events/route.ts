// Fire-and-forget event sink (lib/events.ts is the sender). Validates against
// a hard allowlist, caps every field, inserts one row into the `events` table
// (supabase/migrations/0027_events.sql) with the anon key — the only Supabase
// credential web/ has (see lib/listings/db.ts); the table's RLS lets anon
// insert and nothing else.
//
// Always 204, no matter what: a malformed body, a missing table (migration
// not yet applied), a PostgREST outage — instrumentation must never break the
// page or teach a probing client anything. Completely outside the listings
// read paths; nothing here touches the feed, the index, or any per-listing
// query.

const ALLOWED = new Set(["listing_saved", "listing_unsaved", "dealer_click", "filter_toggled"]);
const MAX_BODY = 4096;
const MAX_CLIENT_ID = 64;
const MAX_LISTING = 32; // listing id = lowercase VIN, 17 chars in practice
const MAX_PROPS = 2048;

const noContent = () => new Response(null, { status: 204 });

export async function POST(req: Request): Promise<Response> {
  try {
    // sendBeacon delivers a Blob body; read as text and parse ourselves so
    // the content-type header doesn't matter.
    const raw = await req.text();
    if (!raw || raw.length > MAX_BODY) return noContent();
    const b = JSON.parse(raw) as Record<string, unknown>;
    if (!b || typeof b !== "object") return noContent();

    const { name, clientId, listing, props } = b;
    if (typeof name !== "string" || !ALLOWED.has(name)) return noContent();
    if (typeof clientId !== "string" || clientId.length < 1 || clientId.length > MAX_CLIENT_ID) return noContent();
    if (listing !== undefined && (typeof listing !== "string" || listing.length < 1 || listing.length > MAX_LISTING))
      return noContent();
    if (
      props !== undefined &&
      (typeof props !== "object" || props === null || Array.isArray(props) || JSON.stringify(props).length > MAX_PROPS)
    )
      return noContent();

    const base = process.env.SUPABASE_URL?.replace(/\/$/, "");
    const key = process.env.SUPABASE_ANON_KEY;
    if (!base || !key) return noContent();

    await fetch(`${base}/rest/v1/events`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ client_id: clientId, name, listing: listing ?? null, props: props ?? null }),
      cache: "no-store",
    });
  } catch {
    // Fail soft by design.
  }
  return noContent();
}
