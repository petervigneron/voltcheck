"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { warrantyStatus, type WarrantyModel, type WarrantyTerm } from "@/lib/listings/warrantyVerdict";
import { SourceBadge } from "@/components/SourceBadge";

// The picker on /warranty. Every answer is computed on the server
// (lib/listings/warrantyCheck.ts) and handed in per model and year; the only
// thing done here is the in-force verdict, because it depends on the odometer
// reading and today's date, and that is lib/listings/warranty.ts by way of
// warrantyStatus(), not a calculation of this file's own.
//
// The query string (?make=&model=&year=&miles=) is read here, on the
// client only, so the page stays one static file and a result can still be
// linked. The canonical stays /warranty whatever the query says.
//
// COPY: placeholder labels of mine. The owner writes the copy.

const nf = new Intl.NumberFormat("en-US");
const MAX_MILES = 999_999;

function termText(t: Pick<WarrantyTerm, "years" | "miles">): string {
  if (t.years != null && t.miles != null) return `${t.years} yr / ${nf.format(t.miles)} mi`;
  if (t.years != null) return `${t.years} yr / unlimited mi`;
  return `${nf.format(t.miles!)} mi`;
}

const est = { value: null, source: "est" as const, asOf: "", confidence: "medium" as const };

const label = "text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-ink/60";
const select =
  "mt-1 block w-full border-[3px] border-ink bg-paper px-3 py-2 text-[15px] font-semibold focus:outline-none focus:ring-[3px] focus:ring-cobalt disabled:opacity-40";

type Picks = { make: string; model: string; year: string; miles: string };
const NONE: Picks = { make: "", model: "", year: "", miles: "" };

/** A linked result, kept only as far as it names things the picker offers. */
function picksFromQuery(search: string, models: WarrantyModel[]): Picks {
  const q = new URLSearchParams(search);
  const make = q.get("make") ?? "";
  if (!models.some((x) => x.makeSlug === make)) return NONE;
  const m = models.find((x) => x.makeSlug === make && x.modelSlug === q.get("model"));
  if (!m) return { ...NONE, make };
  const y = q.get("year") ?? "";
  const mi = (q.get("miles") ?? "").replace(/\D/g, "");
  return {
    make,
    model: m.modelSlug,
    year: m.years.some((e) => String(e.year) === y) ? y : "",
    miles: mi ? String(Math.min(Number(mi), MAX_MILES)) : "",
  };
}

// The address never changes under the picker except by its own hand, so
// there is nothing to subscribe to. The server snapshot is the bare page.
const noSubscribe = () => () => {};

export function WarrantyChecker({ models }: { models: WarrantyModel[] }) {
  const search = useSyncExternalStore(noSubscribe, () => window.location.search, () => "");
  const linked = useMemo(() => picksFromQuery(search, models), [search, models]);
  // Null until the visitor touches the picker; until then a linked query shows.
  const [picked, setPicked] = useState<Picks | null>(null);
  const { make: makeSlug, model: modelSlug, year, miles } = picked ?? linked;
  const pick = (p: Partial<Picks>) => setPicked({ ...(picked ?? linked), ...p });

  const makes = useMemo(() => {
    const seen = new Map<string, string>();
    for (const m of models) if (!seen.has(m.makeSlug)) seen.set(m.makeSlug, m.make);
    return [...seen].map(([slug, name]) => ({ slug, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [models]);
  const forMake = useMemo(
    () => models.filter((m) => m.makeSlug === makeSlug).sort((a, b) => a.model.localeCompare(b.model)),
    [models, makeSlug]
  );
  const chosen = forMake.find((m) => m.modelSlug === modelSlug);
  const entry = chosen?.years.find((y) => String(y.year) === year);

  // Keep the address linkable as the picks change.
  useEffect(() => {
    if (!picked) return;
    const q = new URLSearchParams();
    if (picked.make) q.set("make", picked.make);
    if (picked.model) q.set("model", picked.model);
    if (picked.year) q.set("year", picked.year);
    if (picked.miles) q.set("miles", picked.miles);
    const qs = q.toString();
    try {
      window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
    } catch {
      // A sandboxed frame can refuse; the result still shows.
    }
  }, [picked]);

  const answer = entry?.answer ?? null;
  const mileage = miles ? Number(miles) : undefined;
  const status =
    answer && chosen && entry
      ? warrantyStatus(answer, { make: chosen.make, year: entry.year, mileage })
      : { state: "unknown" as const };
  const expired = status.state === "expired";
  const termEst = answer?.basis?.est ?? false;

  return (
    <div className="mt-6">
      <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
        <div className="col-span-2 sm:col-span-1">
          <label htmlFor="w-make" className={label}>
            Make
          </label>
          <select
            id="w-make"
            value={makeSlug}
            onChange={(e) => pick({ make: e.target.value, model: "", year: "" })}
            className={select}
          >
            <option value="">—</option>
            {makes.map((m) => (
              <option key={m.slug} value={m.slug}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label htmlFor="w-model" className={label}>
            Model
          </label>
          <select
            id="w-model"
            value={modelSlug}
            disabled={!makeSlug}
            onChange={(e) => pick({ model: e.target.value, year: "" })}
            className={select}
          >
            <option value="">—</option>
            {forMake.map((m) => (
              <option key={m.modelSlug} value={m.modelSlug}>
                {m.model}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="w-year" className={label}>
            Year
          </label>
          <select
            id="w-year"
            value={year}
            disabled={!chosen}
            onChange={(e) => pick({ year: e.target.value })}
            className={select}
          >
            <option value="">—</option>
            {[...(chosen?.years ?? [])].reverse().map((y) => (
              <option key={y.year} value={y.year}>
                {y.year}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="w-miles" className={label}>
            Odometer
          </label>
          <input
            id="w-miles"
            inputMode="numeric"
            autoComplete="off"
            value={miles ? nf.format(Number(miles)) : ""}
            onChange={(e) => {
              const d = e.target.value.replace(/\D/g, "");
              pick({ miles: d ? String(Math.min(Number(d), MAX_MILES)) : "" });
            }}
            placeholder="mi"
            className={select}
          />
        </div>
      </div>

      {entry && (answer || chosen?.sheet) && (
        <div className="mt-8 border-[3px] border-ink bg-paper p-5" aria-live="polite">
          {answer && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-[15px]">
              <dt className={`${label} pt-1`}>Term</dt>
              <dd className="font-bold text-ink">
                {answer.terms.map((t) => (
                  <div key={termText(t)}>
                    {termText(t)}
                    {t.est && <SourceBadge fact={est} className="ml-1.5 text-[11px] font-bold text-amber-700" />}
                    {t.trims && <span className="ml-2 text-[13px] font-semibold text-ink/60">{t.trims.join(", ")}</span>}
                  </div>
                ))}
              </dd>
              {status.state !== "unknown" && (
                <>
                  <dt className={`${label} pt-1`}>Status</dt>
                  <dd className="font-bold text-ink">
                    {status.label}
                    {termEst && <SourceBadge fact={est} className="ml-1.5 text-[11px] font-bold text-amber-700" />}
                  </dd>
                </>
              )}
              {!expired && answer.floorPct != null && (
                <>
                  <dt className={`${label} pt-1`}>Capacity floor</dt>
                  <dd className="font-bold text-ink">{answer.floorPct}% SOH</dd>
                </>
              )}
              {!expired && answer.transfers != null && (
                <>
                  <dt className={`${label} pt-1`}>Transfers</dt>
                  <dd className="font-bold text-ink">{answer.transfers ? "Yes" : "No"}</dd>
                </>
              )}
            </dl>
          )}
          {answer && (
            <p className="mt-4 text-[13px] text-ink/60">The term runs from the car&rsquo;s first sale date, which this check doesn&rsquo;t know.</p>
          )}
          {chosen?.sheet && (
            <Link
              href={chosen.sheet.href}
              className={`${answer ? "mt-4" : ""} inline-block text-[14px] font-bold text-cobalt underline decoration-cobalt/30 underline-offset-2 hover:decoration-cobalt`}
            >
              {chosen.sheet.label}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
