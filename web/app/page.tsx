import type { Metadata } from "next";
import { Suspense } from "react";
import { Browse } from "@/components/Browse";

// Self-canonical to the apex home URL. Google was reaching the site through
// http:// and www. variants (each 308s to https://voltcheck.net/), and with
// no canonical here it had nothing pinning the home page to one address. The
// path resolves against layout.tsx's metadataBase (https://voltcheck.net), so
// this renders <link rel="canonical" href="https://voltcheck.net/">. Kept on
// the page, not the root layout, because a layout canonical inherits into
// every child route and would wrongly point /vin, /saved, etc. at "/".
export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

// The browse page is a static shell — prerendered at build, served from the
// CDN, no per-request server work at all. Inventory arrives client-side from
// /api/index (see components/Browse.tsx) and every filter interaction is a
// local computation. useSearchParams in the client tree requires the Suspense
// boundary; its fallback is the shell's skeleton for the first paint.
export default function BrowsePage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-[1400px] px-0 sm:px-6 sm:py-6">
          <div className="border-t-[3px] border-l-[3px] border-ink">
            <div className="h-[63px] border-r-[3px] border-b-[3px] border-ink bg-paper" />
            <div className="grid h-[62px] grid-cols-2 border-r-[3px] border-b-[3px] border-ink bg-putty md:grid-cols-4" />
          </div>
        </div>
      }
    >
      <Browse />
    </Suspense>
  );
}
