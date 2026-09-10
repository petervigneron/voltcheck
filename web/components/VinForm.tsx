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
      {/* The browse page's search bar: a keylined field with the button
          tiled onto its right edge in cobalt, the one interactive colour. */}
      <div className="flex border-[3px] border-ink bg-paper">
        <input
          value={vin}
          onChange={(e) => setVin(e.target.value)}
          placeholder="Paste a VIN, e.g. 7SAYGDEE5RA235597"
          spellCheck={false}
          autoCapitalize="characters"
          className="min-w-0 flex-1 bg-paper px-4 py-3.5 font-mono text-[15px] tracking-wide text-ink placeholder:text-ink/40 focus:outline-none focus:ring-[3px] focus:ring-inset focus:ring-cobalt"
        />
        <button
          type="submit"
          className="border-l-[3px] border-ink bg-cobalt px-6 text-[13px] font-extrabold tracking-[0.06em] text-paper uppercase hover:bg-ink focus:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-paper"
        >
          Decode
        </button>
      </div>
      {/* A paper chip, so it reads on the ink band as well as on putty. */}
      {error && <p className="mt-2 inline-block bg-paper px-3 py-1.5 text-[13px] font-semibold text-ink">{error}</p>}
    </form>
  );
}
