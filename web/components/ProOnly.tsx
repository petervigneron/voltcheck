"use client";

import { useProState } from "@/lib/useProState";

// A fact a pass is sold for, on a page rendered for everyone: shown only
// once this browser's pass state (lib/useProState.ts) comes back true, and
// otherwise nothing — no blur, no teaser — because the same fact on the
// browse card is simply absent for a stranger (the public index stopped
// carrying it on 2026-09-05, lib/listings/proSignals.ts), and a chip that
// appears on one surface and not the other reads as a retraction. The
// Market-trends block keeps its blur (components/ProBlur.tsx): that one is
// the owner's chosen teaser.
export function ProOnly({ children }: { children: React.ReactNode }) {
  const pro = useProState();
  return pro === true ? <>{children}</> : null;
}
