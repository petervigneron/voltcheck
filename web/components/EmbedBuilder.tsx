"use client";

import { useMemo, useState } from "react";

// The picker on /embed: choose a model, see its card, copy the snippet.
// The snippets are built on the server (lib/embed/card.ts) and handed in
// whole, so the text a host copies is exactly the text the tests check and
// nothing here assembles markup.
export type EmbedOption = { key: string; name: string; path: string; snippet: string; height: number };

export function EmbedBuilder({ options, initial }: { options: EmbedOption[]; initial: string }) {
  const [key, setKey] = useState(initial);
  const [copied, setCopied] = useState(false);
  const chosen = useMemo(() => options.find((o) => o.key === key) ?? options[0], [options, key]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(chosen.snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // No clipboard permission: the snippet is selectable in the box below.
    }
  }

  return (
    <div className="mt-6">
      <label htmlFor="embed-model" className="text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-ink/60">
        Model
      </label>
      <select
        id="embed-model"
        value={chosen.key}
        onChange={(e) => {
          setKey(e.target.value);
          setCopied(false);
        }}
        className="mt-1 block w-full max-w-sm border-[3px] border-ink bg-paper px-3 py-2 text-[15px] font-semibold focus:outline-none focus:ring-[3px] focus:ring-cobalt"
      >
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.name}
          </option>
        ))}
      </select>

      <iframe
        key={chosen.key}
        src={chosen.path}
        title={`${chosen.name} for sale`}
        width={360}
        height={chosen.height}
        loading="lazy"
        className="mt-6 max-w-full border-0"
      />

      <div className="mt-6 flex items-center justify-between gap-4">
        <span className="text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-ink/60">HTML</span>
        <button
          type="button"
          onClick={copy}
          className="border-[3px] border-cobalt bg-cobalt px-3 py-1.5 text-[13px] font-bold text-paper focus:outline-none focus:ring-[3px] focus:ring-ink"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <textarea
        readOnly
        value={chosen.snippet}
        rows={5}
        onFocus={(e) => e.currentTarget.select()}
        aria-label="Embed HTML"
        className="mt-2 block w-full border-[3px] border-ink bg-paper p-3 font-mono text-[12.5px] leading-relaxed"
      />
    </div>
  );
}
