import Link from "next/link";
import type { ReactNode } from "react";
import type { FactBlock, FactSection, ParsedFactSheet } from "@/lib/facts/parse";
import { createFootnoteIndex } from "@/lib/facts/footnotes";
import { renderInline, renderTextWithEst } from "./Inline";

// renderBlock/renderSection are plain functions, called directly (never as
// <Capitalized/> JSX), on purpose: a JSX component element defers its body
// until React's render phase, which would run every nextFootnoteId() call
// too late to be visible when the Sources list below is built. Calling them
// as ordinary functions inside FactSheet's own body makes the whole page a
// single synchronous pass, so the footnote-occurrence map is complete by the
// time the Sources section reads it.

function renderBlock(block: FactBlock, i: number, nextFootnoteId: (n: number) => string): ReactNode {
  if (block.type === "h3") {
    return (
      <h3 key={i} className="mt-5 text-[13px] font-extrabold tracking-[0.01em] text-ink">
        {block.text}
      </h3>
    );
  }
  if (block.type === "table") {
    return (
      <div key={i} className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse text-[14px] leading-relaxed">
          <thead>
            <tr className="border-b-2 border-ink text-left">
              {block.header.map((h, j) => (
                <th key={j} className="py-1.5 pr-4 text-[11px] font-extrabold uppercase tracking-[0.06em] text-ink/60">
                  {renderTextWithEst(h, nextFootnoteId)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, j) => (
              <tr key={j} className="border-b border-ink/15 align-top">
                {row.map((cell, k) => (
                  <td key={k} className={`py-2 pr-4 text-ink/85 ${k === 0 ? "font-bold whitespace-nowrap" : ""}`}>
                    {renderTextWithEst(cell, nextFootnoteId)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (block.type === "p") {
    return (
      <p key={i} className="mt-3 text-[15px] leading-relaxed text-ink/85">
        {renderTextWithEst(block.text, nextFootnoteId)}
      </p>
    );
  }
  return (
    <ul key={i} className="mt-3 list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-ink/85">
      {block.items.map((item, j) => (
        <li key={j}>
          {renderTextWithEst(item.text, nextFootnoteId)}
          {item.sub && (
            <ul className="mt-1.5 list-[circle] space-y-1 pl-5">
              {item.sub.map((s, k) => (
                <li key={k}>{renderTextWithEst(s, nextFootnoteId)}</li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

function renderSection(section: FactSection, i: number, nextFootnoteId: (n: number) => string): ReactNode {
  return (
    <section key={i} className="mt-9">
      <h2 className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-ink/50">{section.heading}</h2>
      {section.blocks.map((b, j) => renderBlock(b, j, nextFootnoteId))}
    </section>
  );
}

export function FactSheet({ parsed }: { parsed: ParsedFactSheet }) {
  // Footnote occurrence ids are assigned in rendering order as the sections
  // below are built, in this same synchronous pass, so this map is complete
  // before the Sources list at the bottom reads it.
  const { nextId: nextFootnoteId, occurrences } = createFootnoteIndex();

  const sectionNodes = parsed.sections.map((s, i) => renderSection(s, i, nextFootnoteId));

  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-2xl font-bold tracking-tight text-ink">{parsed.title}</h1>

      {sectionNodes}

      <section className="mt-10 border-t-2 border-ink pt-5">
        <h2 className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-ink/50">See it for yourself</h2>
        <ul className="mt-2 space-y-1.5">
          {parsed.seeItYourself.map((l, i) => (
            <li key={i}>
              <Link href={l.url} className="text-[15px] font-bold text-cobalt underline underline-offset-2">
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {parsed.scopeNote && (
        <section className="mt-9">
          <h2 className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-ink/50">Scope note</h2>
          {parsed.scopeNote.map((p, i) => (
            <p key={i} className="mt-3 text-[13px] leading-relaxed text-ink/60">
              {renderInline(p, nextFootnoteId)}
            </p>
          ))}
        </section>
      )}

      <section className="mt-9 border-t border-ink/15 pt-5">
        <h2 className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-ink/50">Sources</h2>
        <ol className="mt-2 space-y-2.5 text-[13px] leading-relaxed text-ink/70">
          {parsed.footnotes.map((f) => (
            <li key={f.n} id={`fn-${f.n}`} className="flex gap-2">
              <span className="shrink-0 font-mono text-ink/40">[{f.n}]</span>
              <span>
                {renderInline(f.text, nextFootnoteId)}{" "}
                {(occurrences[f.n] ?? []).map((id, i) => (
                  <a
                    key={id}
                    href={`#${id}`}
                    aria-label={`Back to reference ${f.n} in the text`}
                    className="text-cobalt no-underline"
                  >
                    {i === 0 ? "↑" : `↑${i + 1}`}
                  </a>
                ))}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
