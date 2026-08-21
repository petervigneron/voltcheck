// A small closure-based counter, factored out of components/facts/FactSheet.tsx
// so the counter mutation lives in a plain function rather than inside a
// component's own render body — the project's React Compiler lint rule
// (react-hooks/immutability) flags a `let` reassigned by a closure declared
// directly inside a component as unsafe to memoize. Calling this factory
// once per FactSheet render and handing the closures down keeps the
// component itself free of that mutation.
export type FootnoteIndex = {
  /** Assigns the next stable DOM id for one occurrence of footnote n, in call order. */
  nextId: (n: number) => string;
  /** Populated as nextId is called; read once rendering finishes for the Sources back-links. */
  occurrences: Record<number, string[]>;
};

export function createFootnoteIndex(): FootnoteIndex {
  const occurrences: Record<number, string[]> = {};
  let counter = 0;
  return {
    occurrences,
    nextId: (n: number) => {
      counter += 1;
      const id = `fnref-${n}-${counter}`;
      (occurrences[n] ??= []).push(id);
      return id;
    },
  };
}
