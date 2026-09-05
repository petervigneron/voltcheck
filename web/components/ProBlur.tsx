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

export function ProBlur({ label, children }: { label?: string; children: React.ReactNode }) {
  const pro = useProState();
  // The label is never blurred: a visitor should know what is behind the
  // blur before deciding whether to want it (owner, 2026-09-03). It is the
  // benefit's own title from /pro (lib/proOffer.ts proBenefitTitle), so the
  // page and the promise use one word.
  //
  // Optional in the type only. It was documented as optional "because
  // Incentives.tsx carries its own heading" — that component has no heading
  // and never had one, so the rebate block shipped on 2026-09-03 as an
  // unexplained smear with a "Voltcheck Pro" button on it. Owner, 2026-09-04:
  // "we need to know what's actually blurred out below the blur." Pass one.
  const caption = label ? (
    <p className="mb-3 text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-ink/55">{label}</p>
  ) : null;
  if (pro === true) {
    return (
      <>
        {caption}
        {children}
      </>
    );
  }
  return (
    <div className="relative">
      {caption}
      <div aria-hidden="true" className="pointer-events-none select-none blur-[6px]">
        {children}
      </div>
      <Link
        href="/pro"
        aria-label={label ? `${label}: Voltcheck Pro` : "Voltcheck Pro"}
        className={`absolute inset-x-0 ${label ? "top-8" : "top-0"} bottom-0 flex items-center justify-center focus:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-cobalt`}
      >
        <span className="border-[3px] border-ink bg-paper px-4 py-2 text-[12px] font-extrabold tracking-[0.08em] text-ink uppercase hover:bg-cobalt hover:text-paper">
          Voltcheck Pro
        </span>
      </Link>
    </div>
  );
}
