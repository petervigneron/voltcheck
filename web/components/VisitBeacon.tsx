"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { hasClientId, track } from "@/lib/events";
import { visitProps } from "@/lib/visit";

// Records one page_view per page a person opens, and on the first page of a
// tab session where they came from (lib/visit.ts has the rules). Mounted
// once in the root layout, renders nothing.
//
// Why this exists beside Vercel Web Analytics: that dashboard cannot be read
// by a script, so nothing could put "who arrived, from where, and did they
// reach /pro" into the weekly report (scraper/visit-report.mjs). These rows
// can be read.

const SESSION_KEY = "census.visit.v1";

function firstPageOfSession(): boolean {
  try {
    if (sessionStorage.getItem(SESSION_KEY)) return false;
    sessionStorage.setItem(SESSION_KEY, "1");
    return true;
  } catch {
    // Storage blocked: every page would look like a landing. Say none is,
    // so a blocked browser undercounts sources rather than inventing them.
    return false;
  }
}

export function VisitBeacon() {
  const pathname = usePathname();
  useEffect(() => {
    if (!pathname) return;
    const newClient = !hasClientId();
    const { props, listing } = visitProps({
      pathname,
      search: window.location.search,
      referrer: document.referrer,
      ownHost: window.location.hostname,
      landing: firstPageOfSession(),
      newClient,
    });
    track("page_view", listing, props);
  }, [pathname]);
  return null;
}
