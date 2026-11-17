// A fixed inventory and a fixed list of JSON-RPC requests for pinning what
// the connector says on the wire (tests/mcp-ui.test.ts). Fixed down to the
// as_of timestamp, so the same code gives the same bytes on any day.
import type { ApiListing, SlimRow } from "../../lib/api/records";

export const AS_OF = "2026-11-17T06:00:00.000Z";
const TRIMS = ["Wind", "GT-Line", "Light"];

export function kia(i: number): ApiListing {
  const vin = `KNDC3DLC8P5${String(100000 + i)}`;
  return {
    id: vin.toLowerCase(),
    vin,
    url: `https://censusev.com/listing/${vin.toLowerCase()}`,
    year: 2022 + (i % 3),
    make: "Kia",
    model: "EV6",
    ...(i % 5 === 4 ? {} : { trim: TRIMS[i % 3] }),
    title: `${2022 + (i % 3)} Kia EV6`,
    condition: "used",
    kind: "BEV",
    price_usd: i === 0 ? null : 30000 + i * 100,
    previous_price_usd: 40000,
    price_changed_at: "2026-11-01",
    price_cut: { usd: 900, at: "2026-11-10" },
    mileage: 10000 + i,
    location: { city: "Portland", state: "OR", zip: "97201", lat: 45.5, lng: -122.7 },
    seller: { type: "dealer", name: "Example Kia", domain: "dealer.example", url: `https://dealer.example/vdp/${i}` },
    // Every third car has no photo.
    ...(i % 3 === 2 ? {} : { image_url: `https://img.dealer.example/${i}.jpg` }),
    battery: { kwh: 77, basis: "usable", estimated: i % 2 === 0 },
    range: { mi: 310, estimated: true, electric_only: false },
    listed_on: "2026-10-01",
    first_seen: "2026-10-02",
    last_seen: "2026-11-17",
  };
}
export const KIAS = Array.from({ length: 30 }, (_, i) => kia(i));
export const IONIQ: ApiListing = { ...kia(99), id: "km8krdaf1pu000001", vin: "KM8KRDAF1PU000001", make: "Hyundai", model: "Ioniq 5", trim: "SEL", price_usd: 41000 };
const slim = (r: ApiListing, makeSlug: string, mk: string): SlimRow => [
  r.id, makeSlug, mk, r.year, r.price_usd ?? 0, r.mileage ?? -1, 1, "OR", 45.5, -122.7, 0, 310, 77, -1, "", "", "", 0,
];
const INDEX = { v: 1, as_of: AS_OF, r: [...KIAS.map((r) => slim(r, "kia", "ev6")), slim(IONIQ, "hyundai", "ioniq5")] };
const MANIFEST = {
  v: 1,
  as_of: AS_OF,
  total: 31,
  makes: [
    { make: "Kia", slug: "kia", count: 30, models: { EV6: 30 } },
    { make: "Hyundai", slug: "hyundai", count: 1, models: { "Ioniq 5": 1 } },
  ],
};
const FILES: Record<string, unknown> = { "api-manifest": MANIFEST, "api-index": INDEX, "api-make-kia": KIAS, "api-make-hyundai": [IONIQ] };

/** Point the artifact reads at the fixtures. Nothing leaves the process. */
export function stubFeed(): void {
  process.env.SUPABASE_URL = "https://fixture.supabase.example";
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const name = /\/feed\/([^/]+)\.json$/.exec(String(input))?.[1];
    if (name && name in FILES) return new Response(JSON.stringify(FILES[name]), { status: 200 });
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
}

/** Every request whose answer the published connector must not change. */
export const WIRE_REQUESTS: unknown[] = [
  { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } } },
  { jsonrpc: "2.0", method: "notifications/initialized" },
  { jsonrpc: "2.0", id: 2, method: "tools/list" },
  { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "search_listings", arguments: { make: "Kia", model: "EV6", limit: 10 } } },
  { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "search_listings", arguments: { limit: 3, detail: "full", sort: "mileage_asc" } } },
  { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "search_listings", arguments: { make: "Nobody" } } },
  { jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "search_listings", arguments: { detail: "everything" } } },
  { jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "list_models", arguments: {} } },
  { jsonrpc: "2.0", id: 8, method: "tools/call", params: { name: "battery_warranty", arguments: { make: "Kia", model: "EV6", year: 2023, mileage: 42000 } } },
  { jsonrpc: "2.0", id: 9, method: "resources/list" },
  { jsonrpc: "2.0", id: 10, method: "resources/read", params: { uri: "ui://censusev/cars" } },
  { jsonrpc: "2.0", id: 11, method: "ping" },
];
