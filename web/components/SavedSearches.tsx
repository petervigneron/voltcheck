"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useProState } from "@/lib/useProState";
import { useUser } from "@/lib/useUser";
import {
  alertParamsOf,
  readSavedSearches,
  removeSavedSearch,
  subscribeSavedSearches,
  type SavedSearch,
} from "@/lib/savedSearches";

// The saved-searches panel of /saved (tab shell: components/SavedView.tsx).
// Each row is a search a shopper kept — its label, when they saved it, a link
// back into those exact filtered results, and a remove. When alerts are on
// (the same gate AlertSignup uses) each row can also opt into an email when
// matching cars are listed or cut in price, reusing the /api/alerts lane.

const CELL = "border-r-[3px] border-b-[3px] border-ink";
const ALERTS_ENABLED = process.env.NEXT_PUBLIC_ALERTS_ENABLED === "1";
const SAVED_DATE_FMT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

function AlsoEmailMe({ search }: { search: SavedSearch }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  // "done": a confirm mail went out. "on": signed in, live at once (0063).
  const [state, setState] = useState<"idle" | "sending" | "done" | "on" | "error">("idle");
  const user = useUser();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (state === "sending") return;
    setState("sending");
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: user ?? email.trim(),
          params: alertParamsOf(search.qs),
          label: search.label,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { status?: string };
      setState(res.ok ? (body.status === "confirmed" ? "on" : "done") : "error");
    } catch {
      setState("error");
    }
  };

  if (state === "done" || state === "on") {
    return (
      <span className="text-[11px] font-extrabold tracking-[0.08em] text-teal uppercase">
        {state === "on" ? "Alerts on" : "Check your inbox to confirm"}
      </span>
    );
  }

  // Signed in, the address is the account's: one click, no field.
  if (!open && user) {
    return (
      <button
        type="button"
        disabled={state === "sending"}
        onClick={(e) => void submit(e as unknown as React.FormEvent)}
        className="text-[11px] font-extrabold tracking-[0.08em] text-ink/60 uppercase hover:text-cobalt disabled:opacity-60"
      >
        {state === "sending" ? "…" : "✉ Also email me ▸"}
      </button>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[11px] font-extrabold tracking-[0.08em] text-ink/60 uppercase hover:text-cobalt"
      >
        ✉ Also email me ▸
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-stretch gap-1.5">
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        aria-label={`Email me about ${search.label}`}
        className="min-w-[160px] border-[3px] border-ink bg-paper px-2.5 py-1.5 text-[13px] font-semibold focus:outline-none focus:ring-[3px] focus:ring-cobalt"
      />
      <button
        type="submit"
        disabled={state === "sending"}
        className="border-[3px] border-ink bg-ink px-3 py-1.5 text-[11px] font-extrabold tracking-[0.08em] text-paper uppercase hover:bg-cobalt disabled:opacity-60"
      >
        {state === "sending" ? "…" : "Get alerts"}
      </button>
      {state === "error" && (
        <span className="self-center text-[11px] font-extrabold tracking-[0.08em] text-vermilion uppercase">
          Didn&rsquo;t take
        </span>
      )}
    </form>
  );
}

function SearchRow({ search }: { search: SavedSearch }) {
  // Search-based alerts are Pro only (owner, 2026-09-02); the free alert is
  // price drops on saved cars (components/PriceDropSignup.tsx).
  const pro = useProState();
  return (
    <div className={`${CELL} flex flex-col gap-2 bg-paper px-5 py-4`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <Link
          href={`/?${search.qs}`}
          className="text-[16px] leading-tight font-extrabold tracking-[-0.01em] text-ink hover:text-cobalt"
        >
          {search.label}
        </Link>
        <span className="text-[11px] font-bold tracking-[0.06em] text-ink/50 uppercase tabular-nums">
          Saved {SAVED_DATE_FMT.format(new Date(search.savedAt))}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link
          href={`/?${search.qs}`}
          className="text-[11px] font-extrabold tracking-[0.08em] text-cobalt uppercase hover:underline"
        >
          View results ▸
        </Link>
        {ALERTS_ENABLED && pro === true && <AlsoEmailMe search={search} />}
        <button
          type="button"
          onClick={() => removeSavedSearch(search.qs)}
          className="ml-auto text-[11px] font-extrabold tracking-[0.08em] text-ink/50 uppercase hover:text-vermilion"
        >
          ★ Remove
        </button>
      </div>
    </div>
  );
}

export function SavedSearches() {
  // null until mount, like every localStorage reader here.
  const [entries, setEntries] = useState<SavedSearch[] | null>(null);
  useEffect(() => {
    const sync = () => setEntries(readSavedSearches());
    sync();
    return subscribeSavedSearches(sync);
  }, []);

  if (entries !== null && entries.length === 0) {
    return (
      <div className="border-l-[3px] border-ink">
        <div className={`${CELL} bg-paper px-6 py-8 text-[15px] font-bold text-ink/60`}>
          No saved searches yet — “Save search” on any results page keeps one here.
        </div>
      </div>
    );
  }

  if (entries === null) {
    return (
      <div className="border-l-[3px] border-ink">
        <div className={`${CELL} h-16 animate-pulse bg-putty`} aria-hidden="true" />
      </div>
    );
  }

  // Newest first — the order the shopper made.
  const sorted = [...entries].sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  return (
    <div className="border-l-[3px] border-ink">
      {sorted.map((s) => (
        <SearchRow key={s.qs} search={s} />
      ))}
    </div>
  );
}
