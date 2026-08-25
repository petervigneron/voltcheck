"use client";

import { useState } from "react";
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

export function WorthForm({
  defaults,
}: {
  defaults?: { year?: string; make?: string; model?: string; miles?: string; vin?: string; trim?: string };
}) {
  const first = useFirstPaint();
  const makesModels = first?.makesModels ?? {};
  const makes = Object.keys(makesModels).sort();

  const [make, setMake] = useState(defaults?.make ?? "");
  const [model, setModel] = useState(defaults?.model ?? "");
  const [vin, setVin] = useState(defaults?.vin ?? "");
  const [more, setMore] = useState(Boolean(defaults?.vin || defaults?.trim));

  const models = make ? (makesModels[make] ?? []) : [];
  const thisYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = thisYear + 1; y >= FIRST_MODEL_YEAR; y--) years.push(y);

  // Shown, not enforced: an incomplete VIN is dropped rather than blocking the
  // estimate, because the estimate never needed it.
  const vinLooksWrong = vin.trim().length > 0 && !VIN_RE.test(vin.trim());

  const field =
    "w-full border-[3px] border-ink bg-paper px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-[3px] focus:ring-inset focus:ring-cobalt disabled:bg-putty disabled:text-ink/40";
  const label = "block text-[11px] font-extrabold uppercase tracking-[0.08em] text-ink/60";

  return (
    <form method="get" action="/worth" className="border-[3px] border-ink bg-paper p-4 sm:p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="worth-year">
            Year
          </label>
          <select id="worth-year" name="year" defaultValue={defaults?.year ?? ""} required className={`${field} mt-1`}>
            <option value="" disabled>
              Choose a year
            </option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={label} htmlFor="worth-miles">
            Mileage
          </label>
          <input
            id="worth-miles"
            name="miles"
            type="number"
            inputMode="numeric"
            min={0}
            max={300000}
            step={1}
            required
            defaultValue={defaults?.miles ?? ""}
            placeholder="e.g. 41000"
            className={`${field} mt-1`}
          />
        </div>

        <div>
          <label className={label} htmlFor="worth-make">
            Make
          </label>
          <select
            id="worth-make"
            name="make"
            required
            value={make}
            disabled={makes.length === 0}
            onChange={(e) => {
              setMake(e.target.value);
              setModel("");
            }}
            className={`${field} mt-1`}
          >
            <option value="" disabled>
              {makes.length === 0 ? "Loading makes…" : "Choose a make"}
            </option>
            {makes.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={label} htmlFor="worth-model">
            Model
          </label>
          <select
            id="worth-model"
            name="model"
            required
            value={model}
            disabled={models.length === 0}
            onChange={(e) => setModel(e.target.value)}
            className={`${field} mt-1`}
          >
            <option value="" disabled>
              {make ? "Choose a model" : "Pick a make first"}
            </option>
            {models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!more && (
        <button
          type="button"
          onClick={() => setMore(true)}
          className="mt-4 text-[11px] font-extrabold uppercase tracking-[0.08em] text-cobalt underline underline-offset-2"
        >
          Add a VIN or trim to sharpen it
        </button>
      )}

      {more && (
        <div className="mt-4 grid gap-4 border-t-[3px] border-ink/10 pt-4 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="worth-vin">
              VIN <span className="font-semibold normal-case tracking-normal text-ink/40">optional</span>
            </label>
            <input
              id="worth-vin"
              name="vin"
              value={vin}
              onChange={(e) => setVin(e.target.value)}
              spellCheck={false}
              autoCapitalize="characters"
              placeholder="Unlocks sold prices where we have them"
              className={`${field} mt-1 font-mono tracking-wide`}
            />
            {vinLooksWrong && (
              <p className="mt-1 text-[12px] text-ink/60">
                A VIN is 17 characters and never contains I, O, or Q. We&rsquo;ll ignore this one and
                estimate without it.
              </p>
            )}
          </div>
          <div>
            <label className={label} htmlFor="worth-trim">
              Trim <span className="font-semibold normal-case tracking-normal text-ink/40">optional</span>
            </label>
            <input
              id="worth-trim"
              name="trim"
              defaultValue={defaults?.trim ?? ""}
              placeholder="e.g. Long Range"
              className={`${field} mt-1`}
            />
          </div>
        </div>
      )}

      <button
        type="submit"
        className="mt-5 w-full border-[3px] border-ink bg-ink px-5 py-3 text-[13px] font-extrabold uppercase tracking-[0.08em] text-paper hover:bg-cobalt focus:outline-none focus:ring-[3px] focus:ring-inset focus:ring-cobalt sm:w-auto"
      >
        What&rsquo;s it worth?
      </button>
    </form>
  );
}
