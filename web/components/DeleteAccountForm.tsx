"use client";

import Link from "next/link";
import { useState } from "react";
import { forgetLocalShelf } from "./ShelfSync";

// /account/delete: says what goes, asks for the password, and deletes.
// What goes is the list in migration 0123, in a shopper's words. After it
// succeeds this browser's local shelves are cleared too, as on sign-out:
// they were a mirror of an account that no longer exists.

const CELL = "border-r-[3px] border-b-[3px] border-ink";
const EYEBROW = "text-[10.5px] font-extrabold tracking-[0.14em] uppercase";
const FIELD = `${CELL} block w-full bg-paper px-5 py-4 text-[15px] font-bold focus:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-cobalt`;
const BUTTON = `${CELL} block w-full bg-vermilion px-5 py-4 text-left text-[13px] font-extrabold tracking-[0.06em] text-paper uppercase hover:bg-ink focus:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-cobalt disabled:opacity-60`;

const ERRORS: Record<string, string> = {
  password: "That password didn't match",
  signin: "Sign in again to delete your account",
  slow_down: "Too many tries. Wait a minute and try again",
  data_key: "Cancel your data key first, so it isn't charged again",
  unavailable: "Didn't take. Try again",
};

export function DeleteAccountForm({ email }: { email: string }) {
  const [password, setPassword] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state === "sending") return;
    setState("sending");
    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; reason?: string };
      if (res.ok && body.ok) {
        forgetLocalShelf();
        setState("done");
        return;
      }
      setError(ERRORS[body.reason ?? ""] ?? ERRORS.unavailable);
      setState("error");
    } catch {
      setError(ERRORS.unavailable);
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <div className="border-t-[3px] border-l-[3px] border-ink">
        <div className={`${CELL} bg-ink px-5 py-6 text-paper sm:px-8`}>
          <span className={EYEBROW}>Account deleted</span>
          <p className="mt-1 text-[15px] leading-snug font-bold break-all">{email}</p>
        </div>
        <div className={`${CELL} bg-paper px-5 py-4 text-[13px] font-bold sm:px-8`}>
          {/* A full navigation, not a Link: every client cache of "who am
              I" (lib/useUser.ts, lib/useProState.ts) has to start over. */}
          <button
            type="button"
            onClick={() => window.location.assign(new URL("/", window.location.origin).href)}
            className="text-cobalt underline underline-offset-2"
          >
            Back to the cars
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="border-t-[3px] border-l-[3px] border-ink">
      <div className={`${CELL} bg-ink px-5 py-5 text-paper sm:px-8`}>
        <span className={EYEBROW}>Delete account</span>
        <p className="mt-1 text-[15px] leading-snug font-bold break-all">{email}</p>
      </div>
      <div className={`${CELL} bg-paper px-5 py-4 text-[14px] leading-relaxed sm:px-8`}>
        <p className="font-bold">This removes, for good:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-ink/80">
          <li>Your sign-in</li>
          <li>Your saved cars and searches</li>
          <li>Your price alerts</li>
          <li>Any Census Pro pass or data key, including time left on it</li>
        </ul>
      </div>
      <form onSubmit={submit} className="bg-paper">
        <label htmlFor="delete-password" className={`${EYEBROW} block px-5 pt-4 text-ink/55 sm:px-8`}>
          Password
        </label>
        <input
          id="delete-password"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={FIELD}
        />
        <button type="submit" disabled={state === "sending"} className={BUTTON}>
          {state === "sending" ? "…" : "Delete my account"}
        </button>
        {state === "error" && (
          <div className={`${CELL} bg-vermilion px-5 py-3 text-paper`}>
            <span className="text-[12px] font-extrabold tracking-[0.06em] uppercase">{error}</span>
          </div>
        )}
      </form>
      <Link href="/account" className={`${CELL} block bg-paper px-5 py-4 text-[13px] font-bold text-cobalt underline underline-offset-2 hover:bg-putty sm:px-8`}>
        Keep my account
      </Link>
    </div>
  );
}
