// What a page_view event carries, worked out from the URL and the referrer.
// Pure, so the rules below are tested (tests/visit.test.ts) rather than
// trusted: this is the only record of where a visitor came from, and a
// wrong source reads exactly like a right one.
//
// Deliberately small. A visit is a path, and on the first page of a tab
// session the place it came from:
//   p     the page, with a listing's VIN folded out ("/listing") — the VIN
//         rides in the event's own `listing` column instead
//   land  true on the first page of a tab session
//   ref   the referring site's hostname, landing only, never our own host
//         and never the full URL (a referrer's path and query are the
//         other site's business, and sometimes a person's)
//   src   a campaign label the link itself carried: utm_source or ref=
//   new   true when this browser had no client id before this page
// No IP, no user agent, no screen size, nothing derived from the visitor.

export type VisitProps = { p: string; land?: true; ref?: string; src?: string; new?: true };

const MAX_PATH = 80;
const LABEL = /^[a-z0-9][a-z0-9._-]{0,39}$/;

/** "/listing/<vin>" → "/listing" plus the VIN; every other path as it is. */
export function visitPath(pathname: string): { p: string; listing?: string } {
  const m = /^\/listing\/([a-z0-9]{1,32})\/?$/i.exec(pathname);
  if (m) return { p: "/listing", listing: m[1].toLowerCase() };
  const p = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return { p: p.slice(0, MAX_PATH) || "/" };
}

const bare = (host: string) => host.toLowerCase().replace(/^www\./, "");

/** The referring hostname, or nothing when it is us, absent, or not a web URL. */
export function visitRef(referrer: string, ownHost: string): string | undefined {
  if (!referrer) return undefined;
  try {
    const u = new URL(referrer);
    if (u.protocol !== "https:" && u.protocol !== "http:") return undefined;
    const host = bare(u.hostname);
    if (!host || host === bare(ownHost)) return undefined;
    return host.slice(0, 80);
  } catch {
    return undefined;
  }
}

/** utm_source, else ref=, when it is a plain label; anything else is dropped. */
export function visitSrc(search: string): string | undefined {
  const q = new URLSearchParams(search);
  const raw = (q.get("utm_source") ?? q.get("ref") ?? "").trim().toLowerCase();
  return LABEL.test(raw) ? raw : undefined;
}

export function visitProps(a: {
  pathname: string;
  search: string;
  referrer: string;
  ownHost: string;
  landing: boolean;
  newClient: boolean;
}): { props: VisitProps; listing?: string } {
  const { p, listing } = visitPath(a.pathname);
  const props: VisitProps = { p };
  if (a.landing) {
    props.land = true;
    const ref = visitRef(a.referrer, a.ownHost);
    if (ref) props.ref = ref;
    const src = visitSrc(a.search);
    if (src) props.src = src;
  }
  if (a.newClient) props.new = true;
  return { props, listing };
}

// Crawlers and test browsers that run JavaScript would otherwise count as
// people. Googlebot renders pages; the deploy smoke test is headless
// Chromium. app/api/events/route.ts drops every event from these.
const AUTOMATED = /bot\b|bot\/|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|monitor|playwright|puppeteer|python-|curl\/|wget\//i;

export function automatedAgent(userAgent: string | null | undefined): boolean {
  return !userAgent || AUTOMATED.test(userAgent);
}
