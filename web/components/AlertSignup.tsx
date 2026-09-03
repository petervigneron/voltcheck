"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { REMOVABLE, describeFilter } from "@/lib/filters";
import { useProState } from "@/lib/useProState";

// Email capture for saved-search alerts, rendered as a band under the browse
// grid. Ships dark until NEXT_PUBLIC_ALERTS_ENABLED=1 (Vercel env): the form
// is only honest once the confirm email can actually be sent, which needs
// RESEND_API_KEY and ALERTS_SUBSCRIBE_SECRET server-side. Double opt-in —
// submitting sends a confirm link, nothing is live until it's clicked.

const ENABLED = process.env.NEXT_PUBLIC_ALERTS_ENABLED === "1";
const CELL = "border-r-[3px] border-b-[3px] border-ink";

export function AlertSignup() {
  const sp = useSearchParams();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  // Free alerts are price cuts only (owner, 2026-09-02); new-car emails go to
  // a pass-holder's address (scripts/send-alerts.mjs). The line under the
  // grid says which one this visitor is signing up for.
  const pro = useProState();
  if (!ENABLED) return null;

  // The subscription is the search: same params the URL carries, minus the
  // ones that don't select cars. Matched nightly by scripts/send-alerts.mjs
  // through the same lib/listings/match.ts the grid filters with.
  const params = new URLSearchParams(sp.toString());
  for (const k of ["page", "sort", "grounds"]) params.delete(k);
  const label =
    REMOVABLE.map((k) => {
      const v = params.get(k);
      return v ? describeFilter(k, v) : null;
    })
      .filter(Boolean)
      .join(" · ") || "Every EV";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (state === "sending") return;
    setState("sending");
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), params: params.toString(), label }),
      });
      setState(res.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  };

  return (
    <div className="flex flex-wrap items-stretch border-l-[3px] border-ink">
      <div className={`${CELL} flex min-w-[240px] flex-1 flex-col justify-center bg-saffron px-5 py-4`}>
        <span className="text-[10.5px] font-extrabold tracking-[0.14em] uppercase">Alerts · {label}</span>
        <span className="text-[15px] leading-tight font-extrabold tracking-[-0.01em]">
          {pro === true
            ? "Email me when cars matching this search are listed or cut in price"
            : "Email me when a car matching this search is cut in price"}
        </span>
      </div>
      {state === "done" ? (
        <div className={`${CELL} flex flex-1 items-center bg-teal px-5 py-4 text-paper`}>
          <span className="text-[13px] font-extrabold tracking-[0.06em] uppercase">
            Check your inbox to confirm
          </span>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-1 flex-wrap items-stretch">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            aria-label="Email address for alerts"
            className={`${CELL} min-w-[200px] flex-1 bg-paper px-5 py-4 text-[14px] font-bold focus:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-cobalt`}
          />
          <button
            type="submit"
            disabled={state === "sending"}
            className={`${CELL} bg-ink px-6 py-4 text-[13px] font-extrabold tracking-[0.06em] text-paper uppercase hover:bg-cobalt focus:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-cobalt disabled:opacity-60`}
          >
            {state === "sending" ? "…" : "Get alerts"}
          </button>
          {state === "error" && (
            <div className={`${CELL} flex items-center bg-vermilion px-4 py-4 text-paper`}>
              <span className="text-[12px] font-extrabold tracking-[0.06em] uppercase">Didn&rsquo;t take — try again</span>
            </div>
          )}
        </form>
      )}
    </div>
  );
}
