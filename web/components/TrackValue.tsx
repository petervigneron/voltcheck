"use client";

import Link from "next/link";
import { useState } from "react";

// "Track this car's value" — the Pro value watch (lib/worthWatch.ts), on the
// /worth result. A pass-holder presses it and the car goes on the weekly
// list; everyone else gets the same words as a link to /pro, which is what
// the line said ("coming with Pro") from 2026-08-26 until this shipped.
//
// Posts to /api/alerts like the standing order does. Signed in, the
// subscription is confirmed at once (0063) and the cell says "Tracking";
// a pass held only by cookie gets the confirm mail instead.

const CAPTION = "text-[10.5px] font-extrabold uppercase tracking-[0.14em] sm:text-[11px]";

export function TrackValue({ params, label, pro, email }: { params: string; label: string; pro: boolean; email: string | null }) {
  const [state, setState] = useState<"idle" | "sending" | "on" | "done" | "error">("idle");

  if (!pro) {
    return (
      <Link href="/pro" className={`${CAPTION} flex flex-1 items-center bg-putty px-5 py-3.5 text-ink/45 hover:text-cobalt sm:px-8`}>
        Track this car&rsquo;s value with Pro
      </Link>
    );
  }

  const submit = async () => {
    if (state === "sending" || state === "on" || state === "done") return;
    setState("sending");
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email ?? "", params, label }),
      });
      const body = (await res.json().catch(() => ({}))) as { status?: string };
      setState(res.ok ? (body.status === "confirmed" ? "on" : "done") : "error");
    } catch {
      setState("error");
    }
  };

  if (state === "on" || state === "done") {
    return (
      <span className={`${CAPTION} flex flex-1 items-center bg-teal px-5 py-3.5 text-paper sm:px-8`}>
        {state === "on" ? "Tracking — you'll get its value every week" : "Check your inbox to confirm"}
      </span>
    );
  }
  return (
    <button type="button" onClick={submit} disabled={state === "sending"}
      className={`${CAPTION} flex flex-1 items-center bg-paper px-5 py-3.5 text-left text-ink hover:bg-cobalt hover:text-paper focus:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-cobalt disabled:opacity-60 sm:px-8`}>
      {state === "error" ? "Didn't take — try again" : state === "sending" ? "…" : "Track this car's value"}
    </button>
  );
}
