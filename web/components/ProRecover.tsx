"use client";

import { useState } from "react";

// "Email me my access link again." The pass is a token in an email and there
// are no accounts, so this is the only way back in from a new device or a
// deleted message.
//
// The success copy says "if a pass exists for this address" and means it: the
// route answers identically whether or not one does (lib/proRecover.ts), and
// this component must not undo that by rendering a different message per
// outcome. There is exactly one non-error state and it makes no claim about
// the address.

const CELL = "border-r-[3px] border-b-[3px] border-ink";

export function ProRecover() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "bad" | "off" | "error">("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state === "sending") return;
    setState("sending");
    try {
      const res = await fetch("/api/pro/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (res.ok) setState("sent");
      else if (res.status === 400) setState("bad");
      else if (res.status === 503) setState("off");
      else setState("error");
    } catch {
      setState("error");
    }
  }

  if (state === "sent") {
    return (
      <div className={`${CELL} border-t-[3px] border-l-[3px] bg-teal px-5 py-4 text-paper`}>
        <span className="text-[13px] font-extrabold tracking-[0.04em]">
          If a pass exists for that address, a link is on its way.
        </span>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-stretch border-t-[3px] border-l-[3px] border-ink">
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="the address you paid with"
        aria-label="The email address you bought your pass with"
        className={`${CELL} min-w-[200px] flex-1 bg-paper px-5 py-4 text-[14px] font-bold focus:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-cobalt`}
      />
      <button
        type="submit"
        disabled={state === "sending"}
        className={`${CELL} bg-ink px-6 py-4 text-[13px] font-extrabold tracking-[0.06em] text-paper uppercase hover:bg-cobalt focus:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-cobalt disabled:opacity-60`}
      >
        {state === "sending" ? "…" : "Send my link"}
      </button>
      {(state === "bad" || state === "off" || state === "error") && (
        <div className={`${CELL} flex items-center bg-vermilion px-4 py-4 text-paper`}>
          <span className="text-[12px] font-extrabold tracking-[0.06em] uppercase">
            {state === "bad"
              ? "That isn't an email address"
              : state === "off"
                ? "Not switched on yet"
                : "Didn't take — try again"}
          </span>
        </div>
      )}
    </form>
  );
}
