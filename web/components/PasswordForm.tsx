"use client";

import Link from "next/link";
import { useState } from "react";

// Posts the new password to /api/auth/password for the signed-in account.

const CELL = "border-r-[3px] border-b-[3px] border-ink";
const EYEBROW = "text-[10.5px] font-extrabold tracking-[0.14em] uppercase";
const FIELD = `${CELL} block w-full bg-paper px-5 py-4 text-[15px] font-bold focus:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-cobalt`;
const BUTTON = `${CELL} block w-full bg-ink px-5 py-4 text-left text-[13px] font-extrabold tracking-[0.06em] text-paper uppercase hover:bg-cobalt focus:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-cobalt disabled:opacity-60`;

const ERRORS: Record<string, string> = {
  password: "Use at least 8 characters",
  signin: "Sign in again to change your password",
  unavailable: "Didn't take — try again",
};

export function PasswordForm({ email }: { email: string }) {
  const [password, setPassword] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state === "sending") return;
    setState("sending");
    try {
      const res = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; reason?: string };
      if (res.ok && body.ok) {
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
        <div className={`${CELL} bg-teal px-5 py-6 text-paper sm:px-8`}>
          <span className={EYEBROW}>Password changed</span>
          <p className="mt-1 text-[17px] leading-tight font-extrabold tracking-[-0.01em]">You&rsquo;re signed in as {email}.</p>
        </div>
        <div className={`${CELL} bg-paper px-5 py-4 text-[13px] font-bold sm:px-8`}>
          <Link href="/saved" className="text-cobalt underline underline-offset-2">Saved cars</Link>
          <span className="px-3 text-ink/30">·</span>
          <Link href="/" className="text-cobalt underline underline-offset-2">Back to the cars</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="border-t-[3px] border-l-[3px] border-ink">
      <div className={`${CELL} bg-ink px-5 py-5 text-paper sm:px-8`}>
        <span className={EYEBROW}>New password</span>
        <p className="mt-1 text-[15px] leading-snug font-bold break-all">for {email}</p>
      </div>
      <form onSubmit={submit} className="bg-paper">
        <label htmlFor="new-password" className={`${EYEBROW} block px-5 pt-4 text-ink/55`}>Password</label>
        <input
          id="new-password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={FIELD}
        />
        <button type="submit" disabled={state === "sending"} className={BUTTON}>
          {state === "sending" ? "…" : "Save password"}
        </button>
        {state === "error" && (
          <div className={`${CELL} bg-vermilion px-5 py-3 text-paper`}>
            <span className="text-[12px] font-extrabold tracking-[0.06em] uppercase">{error}</span>
          </div>
        )}
      </form>
    </div>
  );
}
