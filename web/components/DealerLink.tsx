"use client";

import { track } from "@/lib/events";

// The outbound link to the dealer's own page, instrumented: dealer_click is
// the site's one conversion-shaped signal. Styling stays with the caller —
// this component only adds the beacon (sendBeacon, so navigating away doesn't
// lose it) to an otherwise plain anchor.
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
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={() => track("dealer_click", listingId)}
    >
      {children}
    </a>
  );
}
