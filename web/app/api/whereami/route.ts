// The visitor's IP-geolocated position, read from Vercel's edge headers. The
// static browse shell can't touch request headers, so this tiny per-visitor
// route answers instead and the client uses it as the distance origin when no
// ZIP is typed. Never CDN-cached — the answer is different for every visitor.
// Locally the headers are absent and the client degrades to ZIP-only.
export const dynamic = "force-dynamic";

// x-vercel-ip-city is percent-encoded; a malformed value mustn't 500 the route.
function safeDecode(v: string) {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

export async function GET(req: Request) {
  const coord = (k: string) => {
    const v = Number(req.headers.get(k) || NaN);
    return Number.isFinite(v) ? v : null;
  };
  const lat = coord("x-vercel-ip-latitude");
  const lng = coord("x-vercel-ip-longitude");
  const city = lat !== null && lng !== null ? safeDecode(req.headers.get("x-vercel-ip-city") ?? "") : null;
  // The IP's postal code, when Vercel has one and it is a five-digit US
  // ZIP: the car page's rebate block uses it as the shopper's ZIP until
  // they type one (lib/shopperZip.ts). A guess, so it is never stored.
  const postalRaw = safeDecode(req.headers.get("x-vercel-ip-postal-code") ?? "").trim();
  const postal = /^\d{5}$/.test(postalRaw) ? postalRaw : null;
  return Response.json({ lat, lng, city, postal }, { headers: { "Cache-Control": "private, no-store" } });
}
