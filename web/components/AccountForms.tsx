"use client";

import Link from "next/link";
import { useState } from "react";

// Sign in, or create an account — one card, two modes, one email field and
// one password field. Posts to /api/auth/signin or /api/auth/signup and, on
// a sign-in, does a FULL navigation to `next`: every client cache of "who
// am I" (lib/useUser.ts, lib/useProState.ts) starts over on the new page.
//
// A signup ends on a "check your email" state, because confirmation is
// required; the link in that mail signs the shopper in and sends them to
// `next`. An address that already has an account gets the same state (the
// server does not say), which is why the sign-in mode is one click away
// from it.

const CELL = "border-r-[3px] border-b-[3px] border-ink";
const EYEBROW = "text-[10.5px] font-extrabold tracking-[0.14em] uppercase";
const FIELD = `${CELL} block w-full bg-paper px-5 py-4 text-[15px] font-bold focus:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-cobalt`;
const LABEL = `${EYEBROW} block px-5 pt-4 text-ink/55`;
const BUTTON = `${CELL} block w-full bg-ink px-5 py-4 text-left text-[13px] font-extrabold tracking-[0.06em] text-paper uppercase hover:bg-cobalt focus:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-cobalt disabled:opacity-60`;

type Mode = "signin" | "signup";
type State = "idle" | "sending" | "sent" | "error";

const ERRORS: Record<string, string> = {
  bad: "Wrong email or password",
  unconfirmed: "Confirm your email first — the link is in your inbox",
  email: "That isn't an email address",
  password: "Use at least 8 characters",
  slow_down: "Too many tries — wait a minute",
  unavailable: "Didn't take — try again",
};

export function AccountForms({ next }: { next: string }) {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState<string>("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state === "sending") return;
    setState("sending");
    setError("");
    try {
      const res = await fetch(mode === "signin" ? "/api/auth/signin" : "/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password, next }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; reason?: string; confirm?: boolean; signedIn?: boolean; next?: string };
      if (res.ok && body.ok) {
        if (mode === "signin" || body.signedIn) {
          // A full navigation, not router.push: every client cache of "who
          // am I" (lib/useUser.ts, lib/useProState.ts) starts over.
          window.location.assign(new URL(body.next ?? next, window.location.origin).href);
          return;
        }
        setState("sent");
        return;
      }
      setError(ERRORS[body.reason ?? ""] ?? ERRORS.unavailable);
      setState("error");
    } catch {
      setError(ERRORS.unavailable);
      setState("error");
    }
  }

  if (state === "sent") {
    return (
      <div className="border-t-[3px] border-l-[3px] border-ink">
        <div className={`${CELL} bg-teal px-5 py-6 text-paper sm:px-8`}>
          <span className={EYEBROW}>Check your email</span>
          <p className="mt-1 text-[17px] leading-tight font-extrabold tracking-[-0.01em]">
            We sent a link to {email.trim()}. Open it to finish creating your account.
          </p>
        </div>
        <div className={`${CELL} bg-paper px-5 py-4 text-[13px] font-bold sm:px-8`}>
          <button type="button" onClick={() => { setMode("signin"); setState("idle"); }} className="text-cobalt underline underline-offset-2">
            Already have an account? Sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="border-t-[3px] border-l-[3px] border-ink">
      <div className="flex items-stretch">
        <button
          type="button"
          aria-pressed={mode === "signin"}
          onClick={() => { setMode("signin"); setState("idle"); setError(""); }}
          className={`${CELL} px-5 py-4 text-[10.5px] font-extrabold tracking-[0.14em] uppercase focus:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-cobalt ${mode === "signin" ? "bg-ink text-paper" : "bg-paper text-ink hover:bg-putty"}`}
        >
          Sign in
        </button>
        <button
          type="button"
          aria-pressed={mode === "signup"}
          onClick={() => { setMode("signup"); setState("idle"); setError(""); }}
          className={`${CELL} px-5 py-4 text-[10.5px] font-extrabold tracking-[0.14em] uppercase focus:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-cobalt ${mode === "signup" ? "bg-ink text-paper" : "bg-paper text-ink hover:bg-putty"}`}
        >
          Create account
        </button>
        <div className={`${CELL} flex-1 bg-paper`} aria-hidden="true" />
      </div>

      <form onSubmit={submit} className="bg-paper">
        <label htmlFor="account-email" className={LABEL}>Email</label>
        <input
          id="account-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={FIELD}
        />
        <label htmlFor="account-password" className={LABEL}>Password</label>
        <input
          id="account-password"
          type="password"
          required
          minLength={8}
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={FIELD}
        />
        <button type="submit" disabled={state === "sending"} className={BUTTON}>
          {state === "sending" ? "…" : mode === "signin" ? "Sign in" : "Create account"}
        </button>
        {state === "error" && (
          <div className={`${CELL} bg-vermilion px-5 py-3 text-paper`}>
            <span className="text-[12px] font-extrabold tracking-[0.06em] uppercase">{error}</span>
          </div>
        )}
        <div className={`${CELL} px-5 py-4 text-[13px] font-bold`}>
          <Link href="/account/forgot" className="text-cobalt underline underline-offset-2">
            Forgot your password?
          </Link>
        </div>
      </form>
    </div>
  );
}
