// The signed-in shopper's alert subscriptions, browser-side: one fetch per
// page load shared by every component that asks (the /saved Alerts tab, and
// each saved search's "Alerts on" mark), a change event when a row is
// removed or added, and nothing in localStorage — the server is the truth
// for these, unlike the shelves.

export interface MyAlert {
  id: string;
  label: string | null;
  params: string;
  createdAt: string;
  lastSentAt: string | null;
}

const CHANGE = "voltcheck:alerts-change";

// undefined: not asked yet. null: signed out, or the answer failed.
let cache: MyAlert[] | null | undefined;
let inflight: Promise<MyAlert[] | null> | null = null;

export function readMyAlerts(): MyAlert[] | null | undefined {
  return cache;
}

export function refreshMyAlerts(): Promise<MyAlert[] | null> {
  inflight ??= fetch("/api/alerts/mine", { cache: "no-store" })
    .then(async (res) => {
      if (!res.ok) return null;
      const b = (await res.json()) as { alerts?: unknown };
      return Array.isArray(b.alerts) ? (b.alerts as MyAlert[]) : null;
    })
    .catch(() => null)
    .then((v) => {
      cache = v;
      inflight = null;
      if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGE));
      return v;
    });
  return inflight;
}

export async function removeMyAlert(id: string): Promise<boolean> {
  try {
    const res = await fetch("/api/alerts/mine", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) return false;
  } catch {
    return false;
  }
  await refreshMyAlerts();
  return true;
}

export function subscribeMyAlerts(cb: () => void): () => void {
  window.addEventListener(CHANGE, cb);
  return () => window.removeEventListener(CHANGE, cb);
}
