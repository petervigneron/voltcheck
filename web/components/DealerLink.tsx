"use client";

import { track } from "@/lib/events";
import { withUtm } from "@/lib/go";

// The outbound link to the dealer's own page, instrumented: dealer_click is
// the site's one conversion-shaped signal. Styling stays with the caller —
// this component only adds the beacon (sendBeacon, so navigating away doesn't
// lose it) to an otherwise plain anchor.
//
// What the dealer sees. Until 2026-11-18 this anchor was rel="noreferrer"
// with the dealer's bare URL, so a shopper we sent arrived at the dealer's
// site as a visit from nowhere: no referrer, no tag. The site's whole case
// to a dealer is that it sends buyers, and the dealer's own analytics could
// not show a single one. Now the link carries utm_source=censusev (lib/go.ts
// withUtm, the same tag /go adds for connector links, and left alone when
// the dealer's URL already has a utm_source) and sends the origin as the
// referrer: "https://censusev.com/", never the page the shopper was on.
//
// It deliberately does NOT go through /go, which the owner asked for and
// which is what connector links do. /go has to look the car up in the
// database before it can forward, and when that lookup is slow it sends the
// person to our listing page instead: from this button that would be the
// page they are already on. The page already holds the dealer's URL, so the
// direct link gives the dealer the same two signals with nothing to wait on
// and nothing to fail, and the click is already counted here, in the
// browser, with the shopper's own client id.
export function DealerLink({
  href,
  listingId,
  className,
  children,
}: {
  href: string;
  /** Listing id (lowercase VIN). */
  listingId: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={withUtm(href)}
      target="_blank"
      rel="noopener"
      referrerPolicy="origin"
      className={className}
      onClick={() => track("dealer_click", listingId)}
    >
      {children}
    </a>
  );
}
