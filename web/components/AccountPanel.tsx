"use client";

import Link from "next/link";
import { useState } from "react";
import { forgetLocalShelf } from "./ShelfSync";

// The signed-in /account: the address, the pass if there is one, the places
// an account reaches, and sign out. Sign-out clears this browser's local
// shelves as well as the cookies — they were mirrored to the account
// (components/ShelfSync.tsx), and the next person at a shared keyboard is
// not that account — then navigates home so every client cache resets.

const CELL = "border-r-[3px] border-b-[3px] border-ink";
const EYEBROW = "text-[10.5px] font-extrabold tracking-[0.14em] uppercase";
const ROW = `${CELL} block bg-paper px-5 py-4 text-[14px] font-bold text-cobalt underline underline-offset-2 hover:bg-putty sm:px-8`;

export function AccountPanel({ email, passLine }: { email: string; passLine: string | null }) {
  const [state, setState] = useState<"idle" | "going">("idle");

  async function signOut() {
    if (state === "going") return;
    setState("going");
    try {
      await fetch("/api/auth/signout", { method: "POST" });
    } catch {
      // the cookies may still be set; the navigation below re-checks
    }
    forgetLocalShelf();
    // A full navigation, not router.push: every client cache of "who am I"
    // (lib/useUser.ts, lib/useProState.ts) has to start over.
    window.location.assign(new URL("/", window.location.origin).href);
  }

  return (
    <div className="border-t-[3px] border-l-[3px] border-ink">
      <div className={`${CELL} bg-ink px-5 py-6 text-paper sm:px-8`}>
        <span className={EYEBROW}>Signed in as</span>
        <p className="mt-1 text-[19px] leading-tight font-extrabold tracking-[-0.01em] break-all">{email}</p>
        {passLine && <p className="mt-2 text-[13px] leading-relaxed text-paper/85">Voltcheck Pro: {passLine}</p>}
      </div>
      <Link href="/saved" className={ROW}>Saved cars and searches</Link>
      <Link href="/pro" className={ROW}>Voltcheck Pro</Link>
      <Link href="/account/password" className={ROW}>Change password</Link>
      <button
        type="button"
        onClick={signOut}
        disabled={state === "going"}
        className={`${CELL} block w-full bg-paper px-5 py-4 text-left text-[13px] font-extrabold tracking-[0.06em] text-ink/70 uppercase hover:bg-vermilion hover:text-paper focus:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-cobalt disabled:opacity-60 sm:px-8`}
      >
        {state === "going" ? "…" : "Sign out"}
      </button>
    </div>
  );
}
