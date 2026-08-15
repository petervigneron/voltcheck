import { Suspense } from "react";
import { Browse } from "@/components/Browse";

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
