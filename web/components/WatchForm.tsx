"use client";

import { useState } from "react";
import { withCurrent } from "@/lib/filters";
import { useFirstPaint, useWorthTrims } from "@/lib/listings/useCardIndex";
import { describeSearch } from "@/lib/savedSearches";
import { watchParams } from "@/lib/watch";

// The Pro standing order's intake (lib/watch.ts has the contract). Rendered
// on /pro for a pass-holder only, under the owner's heading. Same pickers as
// the /worth form — makes and models from the first-paint payload, trims and
// drivetrains from /api/index/trims — so a shopper can only ask for versions
// the market actually carries, never a free-typed trim. Trims are checkboxes:
// "SEL or higher" is SEL and Limited ticked; nothing ticked means any.
//
// Submits to the same /api/alerts as the band under the grid, under the
// address that bought the pass (pre-filled from 0059 pro_email; editable only
// when that lookup failed), because the sender decides "Pro" by address.
// Double opt-in as always: nothing is live until the confirm link is clicked.

const CELL = "border-r-[3px] border-b-[3px] border-ink";
const LABEL = "block px-4 pt-3 text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-ink/55 sm:px-5";
const CONTROL =
  "w-full bg-transparent px-4 pt-1 pb-3 text-[19px] font-bold text-ink focus:outline-none sm:px-5 sm:text-[21px]";
const SELECT = `${CONTROL} appearance-none cursor-pointer pr-10 disabled:cursor-default disabled:text-ink/35`;
const CHEVRON = "pointer-events-none absolute right-4 bottom-3.5 text-[10px] text-ink/45 sm:right-5";
const FIRST_MODEL_YEAR = 2011;

const digits = (s: string) => s.replace(/\D/g, "").slice(0, 7);
const withCommas = (s: string) => (s ? Number(s).toLocaleString("en-US") : "");

/** Every trim (or drivetrain) the market carries for this model across model
 *  years, in the order they first appear (deepest first within a year). */
function unionAcrossYears(byYear: Record<string, string[]> | undefined): string[] {
  const out: string[] = [];
  for (const year of Object.keys(byYear ?? {}).sort((a, b) => Number(b) - Number(a))) {
    for (const v of byYear![year]) if (!out.includes(v)) out.push(v);
  }
  return out;
}

export function WatchForm({ email: passEmail }: { email: string | null }) {
  const first = useFirstPaint();
  const worthTrims = useWorthTrims();
  const loading = first === null;
  const makesModels = first?.makesModels ?? {};

  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [trims, setTrims] = useState<string[]>([]);
  const [drive, setDrive] = useState("");
  const [minYear, setMinYear] = useState("");
  const [maxMiles, setMaxMiles] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [cond, setCond] = useState<"" | "new" | "used">("");
  const [zip, setZip] = useState("");
  const [radius, setRadius] = useState("any");
  const [email, setEmail] = useState(passEmail ?? "");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");

  const makes = withCurrent(Object.keys(makesModels).sort(), make);
  const models = withCurrent(make ? (makesModels[make] ?? []) : [], model);
  const trimOptions = make && model ? unionAcrossYears(worthTrims?.trims[make]?.[model]) : [];
  const driveOptions = make && model ? unionAcrossYears(worthTrims?.drives?.[make]?.[model]) : [];
  const thisYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = thisYear + 1; y >= FIRST_MODEL_YEAR; y--) years.push(y);

  const params = watchParams({ make, model, trims, drive, minYear, maxMiles, maxPrice, cond, zip, radius });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (state === "sending" || !params) return;
    setState("sending");
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), params, label: describeSearch(params) }),
      });
      setState(res.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  };

  const pick = (cls: string) => `${CELL} relative bg-paper ${cls}`;

  return (
    <form onSubmit={submit} className="border-t-[3px] border-l-[3px] border-ink">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <div className={pick("")}>
          <label className={LABEL} htmlFor="watch-make">Make</label>
          <select id="watch-make" required value={make} disabled={loading}
            onChange={(e) => { setMake(e.target.value); setModel(""); setTrims([]); setDrive(""); }} className={SELECT}>
            <option value="" disabled>{loading ? "Loading…" : "Choose"}</option>
            {makes.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <span aria-hidden="true" className={CHEVRON}>▼</span>
        </div>

        <div className={pick("")}>
          <label className={LABEL} htmlFor="watch-model">Model</label>
          <select id="watch-model" required value={model} disabled={models.length === 0}
            onChange={(e) => { setModel(e.target.value); setTrims([]); setDrive(""); }} className={SELECT}>
            <option value="" disabled>{loading ? "Loading…" : make ? "Choose" : "Pick a make"}</option>
            {models.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <span aria-hidden="true" className={CHEVRON}>▼</span>
        </div>

        <div className={pick("")}>
          <label className={LABEL} htmlFor="watch-drive">
            Drivetrain <span className="font-semibold normal-case tracking-normal text-ink/40">optional</span>
          </label>
          <select id="watch-drive" value={drive} disabled={driveOptions.length === 0} onChange={(e) => setDrive(e.target.value)} className={SELECT}>
            <option value="">{driveOptions.length > 0 ? "Any" : !model ? "Pick a model" : worthTrims ? "—" : "Loading…"}</option>
            {driveOptions.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <span aria-hidden="true" className={CHEVRON}>▼</span>
        </div>

        <div className={pick("")}>
          <label className={LABEL} htmlFor="watch-year">
            Oldest year <span className="font-semibold normal-case tracking-normal text-ink/40">optional</span>
          </label>
          <select id="watch-year" value={minYear} onChange={(e) => setMinYear(e.target.value)} className={SELECT}>
            <option value="">Any</option>
            {years.map((y) => <option key={y} value={y}>{y} or newer</option>)}
          </select>
          <span aria-hidden="true" className={CHEVRON}>▼</span>
        </div>

        <div className={pick("")}>
          <label className={LABEL} htmlFor="watch-price">Max price</label>
          <input id="watch-price" type="text" inputMode="numeric" autoComplete="off" required
            value={withCommas(maxPrice)} onChange={(e) => setMaxPrice(digits(e.target.value))} placeholder="25,000"
            className={`${CONTROL} tabular-nums placeholder:font-medium placeholder:text-ink/30`} />
          <span aria-hidden="true" className="pointer-events-none absolute right-4 bottom-3.5 text-[10.5px] font-extrabold tracking-[0.14em] text-ink/35 uppercase sm:right-5">usd</span>
        </div>

        <div className={pick("")}>
          <label className={LABEL} htmlFor="watch-miles">
            Max mileage <span className="font-semibold normal-case tracking-normal text-ink/40">optional</span>
          </label>
          <input id="watch-miles" type="text" inputMode="numeric" autoComplete="off"
            value={withCommas(maxMiles)} onChange={(e) => setMaxMiles(digits(e.target.value))} placeholder="30,000"
            className={`${CONTROL} tabular-nums placeholder:font-medium placeholder:text-ink/30`} />
          <span aria-hidden="true" className="pointer-events-none absolute right-4 bottom-3.5 text-[10.5px] font-extrabold tracking-[0.14em] text-ink/35 uppercase sm:right-5">mi</span>
        </div>

        <div className={pick("")}>
          <label className={LABEL} htmlFor="watch-cond">Condition</label>
          <select id="watch-cond" value={cond} onChange={(e) => setCond(e.target.value as "" | "new" | "used")} className={SELECT}>
            <option value="">New or used</option>
            <option value="new">New</option>
            <option value="used">Used</option>
          </select>
          <span aria-hidden="true" className={CHEVRON}>▼</span>
        </div>

        <div className={pick("")}>
          <label className={LABEL} htmlFor="watch-zip">
            Near ZIP <span className="font-semibold normal-case tracking-normal text-ink/40">optional</span>
          </label>
          <div className="flex">
            <input id="watch-zip" type="text" inputMode="numeric" autoComplete="postal-code" maxLength={5}
              value={zip} onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 5))} placeholder="Anywhere"
              className={`${CONTROL} tabular-nums placeholder:font-medium placeholder:text-ink/30`} />
            <select aria-label="Distance" value={radius} disabled={!/^\d{5}$/.test(zip)} onChange={(e) => setRadius(e.target.value)}
              className={`${SELECT} w-auto shrink-0 text-[15px] sm:text-[15px]`}>
              <option value="any">Any distance</option>
              {[50, 100, 250, 500].map((r) => <option key={r} value={String(r)}>Within {r} mi</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Trims as checkboxes, once a model is picked and the market splits it. */}
      {trimOptions.length > 0 && (
        <div className={`${CELL} bg-paper px-4 py-3 sm:px-5`}>
          <span className="block text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-ink/55">
            Trim <span className="font-semibold normal-case tracking-normal text-ink/40">optional — none ticked means any</span>
          </span>
          <div className="mt-2 flex flex-wrap gap-2">
            {trimOptions.map((t) => {
              const on = trims.includes(t);
              return (
                <button key={t} type="button" aria-pressed={on}
                  onClick={() => setTrims(on ? trims.filter((x) => x !== t) : [...trims, t])}
                  className={`border-[3px] border-ink px-3 py-1.5 text-[13px] font-bold ${on ? "bg-cobalt text-paper" : "bg-paper text-ink"} focus:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-cobalt`}>
                  {on ? "✓ " : ""}{t}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:flex-wrap">
        <div className={`${CELL} flex min-w-[240px] flex-1 flex-col justify-center bg-putty px-4 py-3 sm:px-5`}>
          <label className="block text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-ink/55" htmlFor="watch-email">Email</label>
          {passEmail ? (
            <span className="text-[15px] font-bold">{passEmail}</span>
          ) : (
            <input id="watch-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="the address you bought your pass with"
              className="w-full bg-transparent text-[15px] font-bold focus:outline-none placeholder:font-medium placeholder:text-ink/35" />
          )}
        </div>
        {state === "done" ? (
          <div className={`${CELL} flex items-center bg-teal px-5 py-4 text-paper`}>
            <span className="text-[13px] font-extrabold tracking-[0.06em] uppercase">Check your inbox to confirm</span>
          </div>
        ) : (
          <button type="submit" disabled={state === "sending" || !params}
            className={`${CELL} bg-ink px-6 py-4 text-[13px] font-extrabold tracking-[0.06em] text-paper uppercase hover:bg-cobalt focus:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-cobalt disabled:opacity-60`}>
            {state === "sending" ? "…" : "Get alerts"}
          </button>
        )}
        {state === "error" && (
          <div className={`${CELL} flex items-center bg-vermilion px-4 py-4 text-paper`}>
            <span className="text-[12px] font-extrabold tracking-[0.06em] uppercase">Didn&rsquo;t take — try again</span>
          </div>
        )}
      </div>
    </form>
  );
}
