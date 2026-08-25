"use client";

import { useState } from "react";

// The only interactive part of /pro: hand a tier to /api/checkout and follow
// the Stripe-hosted URL it answers with. Nothing is granted here — a session
// is an intent to pay, and only the signed webhook turns one into access.
//
// The button is only ever rendered when the server has already established
// that checkout is configured and that there is something to sell
// (lib/proOffer.ts offerState), so "disabled" is not a state it has. What it
// does have is a failure state: if the endpoint is unreachable the shopper is
// told, rather than left clicking a button that quietly does nothing.

const CELL = "border-r-[3px] border-b-[3px] border-ink";

export function ProBuyButton({ tier, label }: { tier: string; label: string }) {
  const [state, setState] = useState<"idle" | "going" | "error">("idle");

  async function go() {
    if (state === "going") return;
    setState("going");
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });
      const body = (await res.json()) as { ok?: boolean; url?: string };
      if (res.ok && body.ok && body.url) {
        window.location.href = body.url;
        return;
      }
      setState("error");
    } catch {
      setState("error");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={go}
        disabled={state === "going"}
        className={`${CELL} block w-full bg-ink px-5 py-4 text-left text-[13px] font-extrabold tracking-[0.06em] text-paper uppercase hover:bg-cobalt focus:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-cobalt disabled:opacity-60`}
      >
        {state === "going" ? "Opening checkout…" : label}
      </button>
      {state === "error" && (
        <div className={`${CELL} bg-vermilion px-5 py-3 text-paper`}>
          <span className="text-[12px] font-extrabold tracking-[0.06em] uppercase">
            Couldn&rsquo;t open checkout — try again
          </span>
        </div>
      )}
    </>
  );
}
