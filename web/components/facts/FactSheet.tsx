import Link from "next/link";
import type { ReactNode } from "react";
import type { FactBlock, FactSection, ParsedFactSheet } from "@/lib/facts/parse";
import { citations, type Citation } from "@/lib/facts/cite";
import { renderInline, renderTextWithEst } from "./Inline";

// Every [^n] in the body renders as a citation icon (components/facts/Inline.tsx)
// that links to the footnote's source and names it on hover; the numbered
// Sources list that used to close the page is gone with the numbers.

function renderBlock(block: FactBlock, i: number, cite: (n: number) => Citation | undefined): ReactNode {
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
                  {renderTextWithEst(h, cite)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, j) => (
              <tr key={j} className="border-b border-ink/15 align-top">
                {row.map((cell, k) => (
                  <td key={k} className={`py-2 pr-4 text-ink/85 ${k === 0 ? "font-bold whitespace-nowrap" : ""}`}>
                    {renderTextWithEst(cell, cite)}
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
        {renderTextWithEst(block.text, cite)}
      </p>
    );
  }
  return (
    <ul key={i} className="mt-3 list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-ink/85">
      {block.items.map((item, j) => (
        <li key={j}>
          {renderTextWithEst(item.text, cite)}
          {item.sub && (
            <ul className="mt-1.5 list-[circle] space-y-1 pl-5">
              {item.sub.map((s, k) => (
                <li key={k}>{renderTextWithEst(s, cite)}</li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

function renderSection(section: FactSection, i: number, cite: (n: number) => Citation | undefined): ReactNode {
  return (
    <section key={i} className="mt-9">
      <h2 className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-ink/50">{section.heading}</h2>
      {section.blocks.map((b, j) => renderBlock(b, j, cite))}
    </section>
  );
}

export function FactSheet({ parsed }: { parsed: ParsedFactSheet }) {
  const byNumber = citations(parsed.footnotes);
  const cite = (n: number) => byNumber.get(n);

  const sectionNodes = parsed.sections.map((s, i) => renderSection(s, i, cite));

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
              {renderInline(p, cite)}
            </p>
          ))}
        </section>
      )}

    </div>
  );
}
