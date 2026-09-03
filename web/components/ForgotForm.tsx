"use client";

import Link from "next/link";
import { useState } from "react";

// Posts the address to /api/auth/forgot, which answers ok whatever the
// address's status (see the route); this component has exactly one
// non-error state and it makes no claim about whether an account exists.

const CELL = "border-r-[3px] border-b-[3px] border-ink";
const EYEBROW = "text-[10.5px] font-extrabold tracking-[0.14em] uppercase";
const FIELD = `${CELL} block w-full bg-paper px-5 py-4 text-[15px] font-bold focus:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-cobalt`;
const BUTTON = `${CELL} block w-full bg-ink px-5 py-4 text-left text-[13px] font-extrabold tracking-[0.06em] text-paper uppercase hover:bg-cobalt focus:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-cobalt disabled:opacity-60`;

export function ForgotForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state === "sending") return;
    setState("sending");
    try {
      const res = await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      setState(res.ok ? "sent" : "error");
    } catch {
      setState("error");
    }
  }

  if (state === "sent") {
    return (
      <div className="border-t-[3px] border-l-[3px] border-ink">
        <div className={`${CELL} bg-teal px-5 py-6 text-paper sm:px-8`}>
          <span className={EYEBROW}>Check your email</span>
          <p className="mt-1 text-[17px] leading-tight font-extrabold tracking-[-0.01em]">
            If {email.trim()} has an account, a reset link is on its way.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="border-t-[3px] border-l-[3px] border-ink">
      <div className={`${CELL} bg-ink px-5 py-5 text-paper sm:px-8`}>
        <span className={EYEBROW}>Reset your password</span>
        <p className="mt-1 text-[15px] leading-snug font-bold">Enter your email and we&rsquo;ll send a link to choose a new one.</p>
      </div>
      <form onSubmit={submit} className="bg-paper">
        <label htmlFor="forgot-email" className={`${EYEBROW} block px-5 pt-4 text-ink/55`}>Email</label>
        <input id="forgot-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={FIELD} />
        <button type="submit" disabled={state === "sending"} className={BUTTON}>
          {state === "sending" ? "…" : "Send reset link"}
        </button>
        {state === "error" && (
          <div className={`${CELL} bg-vermilion px-5 py-3 text-paper`}>
            <span className="text-[12px] font-extrabold tracking-[0.06em] uppercase">Didn&rsquo;t take — try again</span>
          </div>
        )}
        <div className={`${CELL} px-5 py-4 text-[13px] font-bold`}>
          <Link href="/account" className="text-cobalt underline underline-offset-2">Back to sign in</Link>
        </div>
      </form>
    </div>
  );
}
