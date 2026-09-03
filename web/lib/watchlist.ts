// Price-drop alerts on saved cars — the free alert (owner, 2026-09-02). The
// shelf is lib/saved.ts (localStorage, ids = lowercase VINs); this is the
// address the shopper gave for it, and the shape the server expects. One
// subscription per address holds the whole shelf as "ids=…" and is replaced
// in place as the stars change (migration 0060, app/api/alerts/watchlist).
//
// The client side is deliberately dumb: remember the address, and whenever
// the shelf changes, post the newest WATCHLIST_MAX ids. The server decides
// whether that is a new subscription (confirm mail), an update (silent), or
// a removal (empty list).

export const WATCHLIST_MAX = 50;
const KEY = "voltcheck.watchlist.v1";
const VIN_RE = /^[a-z0-9]{17}$/;

export function readWatchlistEmail(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "null");
    const email = parsed && typeof parsed === "object" ? (parsed as { email?: unknown }).email : null;
    return typeof email === "string" && email.includes("@") ? email : null;
  } catch {
    return null;
  }
}

export function writeWatchlistEmail(email: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (email) localStorage.setItem(KEY, JSON.stringify({ email }));
    else localStorage.removeItem(KEY);
  } catch {
    // storage unavailable: the subscription still exists server-side
  }
}

/** The ids to send: lowercase, VIN-shaped, de-duplicated, first WATCHLIST_MAX
 *  in the order given (callers pass newest first). Pure, so a test can pin it. */
export function watchlistIds(ids: readonly string[]): string[] {
  const out: string[] = [];
  for (const raw of ids) {
    const id = String(raw).toLowerCase();
    if (!VIN_RE.test(id) || out.includes(id)) continue;
    out.push(id);
    if (out.length >= WATCHLIST_MAX) break;
  }
  return out;
}

/** Post the shelf for this address. Resolves to the server's status word, or
 *  "error" when the request itself failed. */
export async function postWatchlist(email: string, ids: readonly string[]): Promise<string> {
  try {
    const res = await fetch("/api/alerts/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, ids: watchlistIds(ids) }),
    });
    if (!res.ok) return "error";
    const body = (await res.json()) as { status?: string };
    return body.status ?? "error";
  } catch {
    return "error";
  }
}
