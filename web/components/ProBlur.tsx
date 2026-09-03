"use client";

import Link from "next/link";
import { useProState } from "@/lib/useProState";

// A Pro-only block on a page that is rendered for everyone: the content is
// server-rendered with real data and shown BLURRED until this browser's pass
// state (lib/useProState.ts) comes back true, when it clears. Owner, 2026-09-03:
// the market trends live on car detail pages "blurred out for non-pro, and
// visible for pro". Detail pages are static (revalidate 86400), so the gate
// has to be client-side; the blur is the teaser and /pro is the way through.
//
// The blurred content is still in the document. That is the accepted cost,
// the same one 0045 accepts for a forwarded access link: these are published
// statistics behind a $2.99 pass, not secrets, and building a server-gated
// copy of every detail page to hide them would cost more than it protects.
//
// While the state is unknown (null) the block stays blurred, so a pass-holder
// sees it clear a moment after paint rather than a stranger seeing it clear
// and then blur.

export function ProBlur({ children }: { children: React.ReactNode }) {
  const pro = useProState();
  if (pro === true) return <>{children}</>;
  return (
    <div className="relative">
      <div aria-hidden="true" className="pointer-events-none select-none blur-[6px]">
        {children}
      </div>
      <Link
        href="/pro"
        className="absolute inset-0 flex items-center justify-center focus:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-cobalt"
      >
        <span className="border-[3px] border-ink bg-paper px-4 py-2 text-[12px] font-extrabold tracking-[0.08em] text-ink uppercase hover:bg-cobalt hover:text-paper">
          Voltcheck Pro
        </span>
      </Link>
    </div>
  );
}
