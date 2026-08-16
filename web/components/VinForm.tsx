"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/i;

export function VinForm({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [vin, setVin] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = vin.trim().toUpperCase();
    if (!VIN_RE.test(v)) {
      setError("A VIN is 17 characters and never contains I, O, or Q.");
      return;
    }
    setError(null);
    router.push(`/vin/${v}`);
  }

  return (
    <form onSubmit={submit} className={compact ? "" : "w-full max-w-xl"}>
      <div className="flex gap-2">
        <input
          value={vin}
          onChange={(e) => setVin(e.target.value)}
          placeholder="Paste a VIN, e.g. 7SAYGDEE5RA235597"
          spellCheck={false}
          autoCapitalize="characters"
          className="flex-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-3 font-mono text-sm tracking-wide text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <button
          type="submit"
          className="rounded-lg bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          Decode
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">{error}</p>}
    </form>
  );
}
