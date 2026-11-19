import { aiAgentLabel, onBehalfOfPerson } from "@/lib/aiAgents";

// Which cars an assistant asked the connector about, for the per-car tally
// in agent_car_fetches (migration 0128; lib/aiAgents.ts says what that table
// is and is not).
//
// proxy.ts counts a "-user" assistant's fetch of a car's page from the path.
// A connector call names its car in the request body, which the proxy never
// reads, so on 2026-11-19 sixty connector calls from Claude left no trace of
// which cars they were about. This reads the two tools that are about
// particular cars — get_listing and compare_listings — and nothing else:
// a search is a question about a market, not interest in one car.
//
// The same rules as the proxy's count. Only an assistant acting for a person
// (the "-user" labels); any other caller of this public endpoint — a script,
// a crawler, a developer's client — is not counted. Nothing but the label
// and the VIN leaves here, and the database function refuses a VIN that is
// not a car this site has listed.

const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;
/** compare_listings takes five at most; a batch of calls is capped the same
 *  way so one request can never fan out into many writes. */
const MAX_CARS = 5;

/** The VINs a JSON-RPC body's tools/call requests ask about, upper-cased,
 *  de-duplicated, at most MAX_CARS. Empty for everything else. */
export function calledCars(body: unknown): string[] {
  const out = new Set<string>();
  for (const msg of Array.isArray(body) ? body : [body]) {
    if (!msg || typeof msg !== "object") continue;
    const { method, params } = msg as { method?: unknown; params?: { name?: unknown; arguments?: Record<string, unknown> } };
    if (method !== "tools/call" || !params || typeof params !== "object") continue;
    const args = params.arguments;
    if (!args || typeof args !== "object") continue;
    const named = params.name === "get_listing" ? [args.vin] : params.name === "compare_listings" && Array.isArray(args.vins) ? args.vins : [];
    for (const v of named) {
      if (typeof v !== "string") continue;
      const vin = v.trim().toUpperCase();
      if (VIN_RE.test(vin)) out.add(vin);
    }
  }
  return [...out].slice(0, MAX_CARS);
}

/** Count those cars when the caller is an assistant acting for a person.
 *  Short timeout, never throws, resolves when the counts have been sent. */
export async function countCalledCars(userAgent: string | null, body: unknown): Promise<void> {
  const agent = aiAgentLabel(userAgent);
  if (!agent || !onBehalfOfPerson(agent)) return;
  const vins = calledCars(body);
  if (!vins.length) return;
  const base = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_ANON_KEY;
  if (!base || !key) return;
  await Promise.all(
    vins.map(async (vin) => {
      try {
        await fetch(`${base}/rest/v1/rpc/agent_car_fetch_bump`, {
          method: "POST",
          headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({ _agent: agent, _vin: vin }),
          cache: "no-store",
          signal: AbortSignal.timeout(1500),
        });
      } catch {
        // A lost count is a smaller cost than a slower or failed answer.
      }
    }),
  );
}
