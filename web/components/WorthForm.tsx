"use client";

import { useState } from "react";
import { withCurrent } from "@/lib/filters";
import { useFirstPaint } from "@/lib/listings/useCardIndex";

// The picker. Year, make, model, mileage — and that is the whole required
// form, by owner decision: a seller who cannot find their VIN still gets a
// number, so a VIN is never a gate. VIN and trim sit below as refinements
// that narrow the comparison when they can and are ignored when they cannot
// (lib/listings/value.ts).
//
// WHERE THE MAKES AND MODELS COME FROM. The same place the browse filter rail
// gets them: /api/index/first, the day-cached first-paint payload, fetched in
// the browser through useFirstPaint and module-cached for the session. That is
// the point of doing it client-side — the alternative, deriving facets on the
// server, is a per-request scan of the feed on a form page, which is exactly
// the kind of read this site has an incident log about. Nothing here costs the
// database anything until the form is submitted.
//
// The list is one entry per model, folded and pruned in lib/listings/tally.ts.
// It used to be the raw distinct strings, which is how a seller could be
// offered "IONIQ 5 SEL (ORIGINAL MSRP $42,350!!!!)" alongside "Ioniq 5" and be
// told, for picking the wrong one, that their car couldn't be valued.
//
// A plain GET form, so the result is a URL: shareable, back-buttonable, and
// re-renderable by the server without any client state. The selects are
// disabled until the facets land rather than being replaced by free text —
// a make we cannot offer is a make we have no listings for, and letting
// someone type it would only produce an abstention with extra steps.

// The corpus starts at the 2011 model year (Leaf, Volt) and dealers list next
// year's cars, so the range is fixed rather than derived: deriving it would
// mean scanning the feed to learn something that changes once a year.
const FIRST_MODEL_YEAR = 2011;

const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/i;

// The page is built out of the same blocks as the browse grid: one 3px ink
// keyline per edge, shared between neighbours, and colour used only where it
// means something. A field is a CELL with its label and its control inside it,
// rather than a bordered input floating inside a bordered card — the nested
// boxes are what made this page read as a form bolted onto the site.
const CELL = "border-r-[3px] border-b-[3px] border-ink";
const LABEL = "block px-4 pt-3 text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-ink/55 sm:px-5";
const CONTROL =
  "w-full bg-transparent px-4 pt-1 pb-3 text-[19px] font-bold text-ink focus:outline-none sm:px-5 sm:text-[21px]";
// Native select chrome is the platform's, not ours — a beveled double chevron
// inside a flat black keyline is the single most out-of-place thing on the
// page. Stripped, and replaced with the same ▼ the filter rail's sort uses.
const SELECT = `${CONTROL} appearance-none cursor-pointer pr-10 disabled:cursor-default disabled:text-ink/35`;
const CHEVRON = "pointer-events-none absolute right-4 bottom-3.5 text-[10px] text-ink/45 sm:right-5";

const digits = (s: string) => s.replace(/\D/g, "").slice(0, 6);
const withCommas = (s: string) => (s ? Number(s).toLocaleString("en-US") : "");

export function WorthForm({
  defaults,
}: {
  defaults?: { year?: string; make?: string; model?: string; miles?: string; vin?: string; trim?: string };
}) {
  const first = useFirstPaint();
  const makesModels = first?.makesModels ?? {};
  const loading = !first;

  const [make, setMake] = useState(defaults?.make ?? "");
  const [model, setModel] = useState(defaults?.model ?? "");
  const [miles, setMiles] = useState(digits(defaults?.miles ?? ""));
  const [vin, setVin] = useState(defaults?.vin ?? "");
  const [more, setMore] = useState(Boolean(defaults?.vin || defaults?.trim));

  // A make and model already in the URL stay selectable even before the facets
  // land, and even when tally.ts no longer offers that spelling — otherwise a
  // server-rendered result page shows two empty boxes above its own answer.
  const makes = withCurrent(Object.keys(makesModels).sort(), make);
  const models = withCurrent(make ? (makesModels[make] ?? []) : [], model);
  const thisYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = thisYear + 1; y >= FIRST_MODEL_YEAR; y--) years.push(y);

  // Shown, not enforced: an incomplete VIN is dropped rather than blocking the
  // estimate, because the estimate never needed it.
  const vinLooksWrong = vin.trim().length > 0 && !VIN_RE.test(vin.trim());

  const extraField =
    "w-full border-[3px] border-ink bg-paper px-3 py-2.5 text-[15px] font-semibold text-ink placeholder:font-medium placeholder:text-ink/35 focus:outline-none focus:ring-[3px] focus:ring-inset focus:ring-cobalt";
  const extraLabel = "block text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-ink/55";

  return (
    <form method="get" action="/worth">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <div className={`${CELL} relative bg-paper`}>
          <label className={LABEL} htmlFor="worth-year">
            Year
          </label>
          <select id="worth-year" name="year" defaultValue={defaults?.year ?? ""} required className={SELECT}>
            <option value="" disabled>
              Choose
            </option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <span aria-hidden="true" className={CHEVRON}>
            ▼
          </span>
        </div>

        <div className={`${CELL} relative bg-paper`}>
          <label className={LABEL} htmlFor="worth-make">
            Make
          </label>
          <select
            id="worth-make"
            name="make"
            required
            value={make}
            disabled={loading}
            onChange={(e) => {
              setMake(e.target.value);
              setModel("");
            }}
            className={SELECT}
          >
            <option value="" disabled>
              {loading ? "Loading…" : "Choose"}
            </option>
            {makes.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <span aria-hidden="true" className={CHEVRON}>
            ▼
          </span>
        </div>

        <div className={`${CELL} relative bg-paper`}>
          <label className={LABEL} htmlFor="worth-model">
            Model
          </label>
          <select
            id="worth-model"
            name="model"
            required
            value={model}
            disabled={models.length === 0}
            onChange={(e) => setModel(e.target.value)}
            className={SELECT}
          >
            <option value="" disabled>
              {loading ? "Loading…" : make ? "Choose" : "Pick a make"}
            </option>
            {models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <span aria-hidden="true" className={CHEVRON}>
            ▼
          </span>
        </div>

        <div className={`${CELL} relative bg-paper`}>
          <label className={LABEL} htmlFor="worth-miles">
            Mileage
          </label>
          {/* type=text with a numeric keypad, not type=number: the spinner
              arrows are chrome nobody uses on a six-digit odometer, and they
              sat inside the keyline looking like a defect. The digits are
              grouped as they are typed, and the raw number rides in a hidden
              field so the shared URL reads miles=58000, not miles=58%2C000. */}
          <input
            id="worth-miles"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            required
            value={withCommas(miles)}
            onChange={(e) => setMiles(digits(e.target.value))}
            placeholder="41,000"
            className={`${CONTROL} tabular-nums placeholder:font-medium placeholder:text-ink/30`}
          />
          <input type="hidden" name="miles" value={miles} />
          <span aria-hidden="true" className="pointer-events-none absolute right-4 bottom-3.5 text-[10.5px] font-extrabold tracking-[0.14em] text-ink/35 uppercase sm:right-5">
            mi
          </span>
        </div>
      </div>

      {more && (
        <div className={`${CELL} grid grid-cols-1 gap-4 border-l-0 bg-putty p-4 sm:grid-cols-2 sm:p-5`}>
          <div>
            <label className={extraLabel} htmlFor="worth-vin">
              VIN <span className="font-semibold normal-case tracking-normal text-ink/40">optional</span>
            </label>
            <input
              id="worth-vin"
              name="vin"
              value={vin}
              onChange={(e) => setVin(e.target.value)}
              spellCheck={false}
              autoCapitalize="characters"
              autoComplete="off"
              placeholder="Unlocks sold prices where we have them"
              className={`${extraField} mt-1 font-mono tracking-wide`}
            />
            {vinLooksWrong && (
              <p className="mt-1.5 text-[12px] leading-snug text-ink/60">
                A VIN is 17 characters and never contains I, O, or Q. We&rsquo;ll ignore this one and
                estimate without it.
              </p>
            )}
          </div>
          <div>
            <label className={extraLabel} htmlFor="worth-trim">
              Trim <span className="font-semibold normal-case tracking-normal text-ink/40">optional</span>
            </label>
            <input
              id="worth-trim"
              name="trim"
              defaultValue={defaults?.trim ?? ""}
              autoComplete="off"
              placeholder="e.g. Long Range"
              className={`${extraField} mt-1`}
            />
          </div>
        </div>
      )}

      {/* Two cells in a flex row, not two inline-block buttons in a paragraph.
          The old markup let them share an inline formatting context, so the
          submit button flowed up alongside the "add a VIN" link and sat on top
          of its text. Siblings in a flex row cannot overlap. */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap">
        {!more && (
          <button
            type="button"
            onClick={() => setMore(true)}
            className={`${CELL} flex items-center bg-putty px-4 py-4 text-left sm:flex-1 text-[12px] font-extrabold tracking-[0.06em] text-ink/70 uppercase hover:bg-paper hover:text-cobalt focus:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-cobalt sm:px-5 sm:text-[12.5px]`}
          >
            + Add a VIN or trim to sharpen it
          </button>
        )}
        {more && <div className={`${CELL} hidden bg-putty sm:block sm:flex-1`} aria-hidden="true" />}
        <button
          type="submit"
          className={`${CELL} flex items-center justify-center gap-2 bg-ink px-6 py-5 sm:py-4 text-[13px] font-extrabold tracking-[0.06em] text-paper uppercase hover:bg-cobalt focus:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-cobalt sm:grow-0 sm:px-8`}
        >
          What&rsquo;s it worth <span aria-hidden="true">→</span>
        </button>
      </div>
    </form>
  );
}
