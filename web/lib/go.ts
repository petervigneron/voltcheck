import { automatedAgent, plainLabel } from "./visit";

// /go/<vin>: the attributable link to a car's seller. Pure, so every branch
// is tested (tests/go.test.ts) rather than trusted; app/go/[vin]/route.ts
// does the lookup and the I/O.
//
// Why it exists. A connector result used to hand an assistant the dealer's
// own URL, so a person who bought from it went straight from the chat to the
// dealer: nothing on this site saw it, and the dealer saw no referrer. The
// owner's question (2026-11-17) was whether being used by assistants sends
// anyone to a dealer, and the only honest answer was "no way to tell". A
// link that passes through here is counted once, server-side, as the
// dealer_click the listing page's own button records, and arrives at the
// dealer with censusev.com as its referrer and utm_source=censusev.
//
// NO OPEN REDIRECT. The destination is never read from the request. The only
// URL this answers 302 to is the seller URL stored for that VIN (or our own
// listing page for that VIN when the lookup could not finish); a VIN with no
// live listing or no seller URL is a 404.

/** The `client_id` a /go click is stored under. There is no browser id on a
 *  server-side redirect, so the weekly report counts these on their own line
 *  rather than as people (scraper/visit-report.mjs). */
export const GO_CLIENT_ID = "go";

const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/i;

/** The VIN in a /go path, lowercased the way listing ids are; undefined when it is not VIN-shaped. */
export function goVin(raw: string): string | undefined {
  return VIN_RE.test(raw) ? raw.toLowerCase() : undefined;
}

/**
 * The dealer URL with utm_source=censusev&utm_medium=referral, placed before
 * any #fragment. A URL that already names a utm_source is the dealer's own
 * campaign tagging and is left exactly as it is; one that does not parse as
 * http(s) is returned unchanged.
 */
export function withUtm(url: string): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return url;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return url;
  if (u.searchParams.has("utm_source")) return url;
  // Appended as text rather than through searchParams.set, which would
  // re-encode the dealer's own query ("a=b c" becomes "a=b+c") and could
  // change what their page reads.
  const hash = url.indexOf("#");
  const head = hash === -1 ? url : url.slice(0, hash);
  const tail = hash === -1 ? "" : url.slice(hash);
  const sep = head.includes("?") ? (head.endsWith("?") || head.endsWith("&") ? "" : "&") : "?";
  return `${head}${sep}utm_source=censusev&utm_medium=referral${tail}`;
}

/** A seller URL fit to redirect to: absolute http(s), nothing else. */
export function redirectable(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? url : undefined;
  } catch {
    return undefined;
  }
}

/** What the lookup found for a VIN. */
export type GoLookup =
  | { kind: "found"; sellerUrl?: string }
  | { kind: "missing" }
  /** The read failed or ran out of time: not evidence the car is gone. */
  | { kind: "unavailable" };

export type GoEvent = { client_id: string; name: "dealer_click"; listing: string; props: { src?: string; via: "go" } };

export type GoDecision =
  | { status: 404 }
  | { status: 302; location: string; record?: GoEvent };

/**
 * The answer for one request to /go/<vin>.
 *
 * An unavailable lookup forwards to the car's own page here rather than
 * 404ing: a database that did not answer in time says nothing about whether
 * the car is for sale, and the listing page has the seller link on it.
 */
export function goDecision(a: {
  vin: string;
  method: string;
  userAgent: string | null;
  search: string;
  lookup: GoLookup;
  site: string;
}): GoDecision {
  const src = plainLabel(new URLSearchParams(a.search).get("ref"));
  if (a.lookup.kind === "unavailable") {
    return { status: 302, location: `${a.site}/listing/${a.vin}${src ? `?ref=${src}` : ""}` };
  }
  const dest = a.lookup.kind === "found" ? redirectable(a.lookup.sellerUrl) : undefined;
  if (!dest) return { status: 404 };
  const location = withUtm(dest);
  // A HEAD is a link checker or a preview, not a person on their way to a
  // dealer; a crawler is not a shopper. Both still get the redirect.
  if (a.method === "HEAD" || automatedAgent(a.userAgent)) return { status: 302, location };
  return {
    status: 302,
    location,
    record: { client_id: GO_CLIENT_ID, name: "dealer_click", listing: a.vin, props: { ...(src ? { src } : {}), via: "go" } },
  };
}

/** Headers every /go answer carries. Referrer-Policy: origin so the dealer
 *  sees censusev.com, and only that, as where the visit came from. */
export const GO_HEADERS: Record<string, string> = {
  "cache-control": "no-store",
  "x-robots-tag": "noindex, nofollow",
  "referrer-policy": "origin",
};
