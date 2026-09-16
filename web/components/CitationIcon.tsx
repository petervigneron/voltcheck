// The ⓘ that marks a cited value, on listing pages (FactRow) and fact sheets
// (components/facts/Inline.tsx) alike. One drawing so the two surfaces read
// as the same site.
export function CitationIcon() {
  return (
    <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.4" className="inline-block">
      <circle cx="8" cy="8" r="6.3" />
      <path d="M8 7.3v4" strokeLinecap="round" />
      <circle cx="8" cy="5.1" r="0.15" fill="currentColor" stroke="none" />
    </svg>
  );
}
