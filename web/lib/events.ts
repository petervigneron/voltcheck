// Fire-and-forget event instrumentation. Four events exist; the shape
// (name + optional listing ref + optional flat props) is deliberately
// generic so a fourth is one union member here and one allowlist entry in
// app/api/events/route.ts and supabase/migrations/0027_events.sql.
//
// The client id is a random UUID minted once per browser and kept in
// localStorage — no PII, no fingerprinting, nothing derived from the
// visitor. It exists so "12 saves" and "12 shoppers saved something" stay
// distinguishable, which is the whole analytical content of the column.
//
// sendBeacon first because dealer_click fires while the page is navigating
// away; fetch keepalive is the fallback for browsers without it. Both paths
// swallow every failure — instrumentation must never break the page.

export type EventName = "listing_saved" | "listing_unsaved" | "dealer_click" | "filter_toggled";

const CID_KEY = "voltcheck.cid.v1";

function clientId(): string {
  try {
    let id = localStorage.getItem(CID_KEY);
    if (!id) {
      id =
        typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
      localStorage.setItem(CID_KEY, id);
    }
    return id;
  } catch {
    // Storage blocked: still report, just without cross-visit identity.
    return "no-storage";
  }
}

export function track(name: EventName, listing?: string, props?: Record<string, string | number | boolean>): void {
  if (typeof window === "undefined") return;
  try {
    const body = JSON.stringify({ clientId: clientId(), name, listing, props });
    const beaconed = navigator.sendBeacon?.("/api/events", new Blob([body], { type: "application/json" }));
    if (!beaconed) {
      fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    // Never let telemetry surface to the shopper.
  }
}
