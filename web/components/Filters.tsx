"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { REMOVABLE, QUICK_TOGGLES, BODY_TYPES, describeFilter, dropSpecFilters, splitValues, toggleValue } from "@/lib/filters";
import { pushUrl } from "@/lib/pushUrl";

const CELL = "border-r-[3px] border-b-[3px] border-ink";
// Interactive cells answer hover and keyboard focus with the same inset cobalt
// keyline the listing cards use.
const HOVER =
  "hover:ring-[3px] hover:ring-inset hover:ring-cobalt focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-cobalt";
// On a phone the rail wraps; cells grow to close each row against the right
// edge — a wall of blocks, not a ragged tetris board. Desktop rows don't wrap,
// so growth is off and the spacer below handles the slack.
const BLOCK = `${CELL} flex grow items-center gap-2 px-4 py-2.5 text-[13px] font-bold uppercase tracking-[0.04em] sm:grow-0`;
const FIELD =
  "w-full border-[3px] border-ink bg-paper px-2.5 py-1.5 text-[13px] font-semibold text-ink focus:outline-none focus:ring-[3px] focus:ring-cobalt";
const FIELD_LABEL = "text-[10px] font-extrabold uppercase tracking-[0.14em] text-ink/55";

export type Suggestion = { label: string; count: number };

export function SearchBar({ suggestions }: { suggestions: Suggestion[] }) {
  const sp = useSearchParams();
  // Keyed on the URL's own value, so navigating back or clearing a filter
  // refills the box without an effect syncing two copies of the same string.
  const current = sp.get("q") ?? "";
  return <SearchBox key={current} current={current} suggestions={suggestions} />;
}

function SearchBox({ current, suggestions }: { current: string; suggestions: Suggestion[] }) {
  const sp = useSearchParams();
  const [text, setText] = useState(current);
  const [open, setOpen] = useState(false);
  // Which suggestion the keyboard is on, or -1 for "none — Enter means the
  // words I typed". It starts at -1 and returns there on every keystroke,
  // because the typed text is a real search and usually a broader one than any
  // single suggestion: "bolt" is 3,763 cars across the EV and the EUV,
  // "brightdrop" is 61 vans filed under six different model spellings, "ioniq"
  // is 7,007 across twelve. Pre-selecting the first suggestion — which is what
  // starting at 0 did — meant Enter silently narrowed every one of those to one
  // model, and there was no way to ask the broad question from the keyboard.
  const [hi, setHi] = useState(-1);
  const input = useRef<HTMLInputElement>(null);

  const toks = text.toLowerCase().trim().split(/\s+/).filter(Boolean);
  // "buzz" should surface "Volkswagen ID. Buzz": every typed token has to land
  // somewhere in the make+model string, not prefix it.
  const hits =
    open && text.trim().length >= 2
      ? suggestions.filter((s) => toks.every((t) => s.label.toLowerCase().includes(t))).slice(0, 7)
      : [];

  const go = (q: string) => {
    setOpen(false);
    const params = new URLSearchParams(sp.toString());
    if (q) params.set("q", q);
    else params.delete("q");
    params.delete("page");
    dropSpecFilters(params);
    pushUrl(params);
  };

  return (
    <form
      className="flex border-b-[3px] border-ink"
      onSubmit={(e) => {
        e.preventDefault();
        go(text.trim());
      }}
    >
      <div className="relative min-w-0 flex-1 border-r-[3px] border-ink">
        <input
          ref={input}
          name="q"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
            setHi(-1);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" && hits.length) {
              e.preventDefault();
              setHi((h) => Math.min(h + 1, hits.length - 1));
            } else if (e.key === "ArrowUp" && hits.length) {
              e.preventDefault();
              // Back past the first suggestion returns to the typed text
              // rather than sticking on it.
              setHi((h) => Math.max(h - 1, -1));
            } else if (e.key === "Enter" && hi >= 0 && hits[hi]) {
              e.preventDefault();
              go(hits[hi].label);
              // Enter with nothing highlighted falls through to the form's own
              // submit, which searches the typed words.
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          onBlur={() => setOpen(false)}
          role="combobox"
          aria-expanded={hits.length > 0}
          aria-controls="search-suggestions"
          aria-activedescendant={hi >= 0 && hits[hi] ? `search-option-${hi}` : undefined}
          aria-autocomplete="list"
          aria-label="Search electric cars"
          placeholder="Make, model, or trim"
          className="w-full bg-paper py-4 pr-14 pl-5 text-[17px] font-medium text-ink placeholder:text-ink/40 focus:outline-none focus:ring-[3px] focus:ring-inset focus:ring-cobalt"
        />
        {/* Clearing the box also clears a search already in the URL — a box the
            shopper emptied that still returns one model reads as a stuck page.
            Mousedown is suppressed so the click lands without the input's blur
            stealing focus first. */}
        {text && (
          <button
            type="button"
            aria-label="Clear search"
            title="Clear search"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setText("");
              setOpen(false);
              input.current?.focus();
              if (current) go("");
            }}
            className="absolute top-1/2 right-3 flex size-8 -translate-y-1/2 items-center justify-center border-[3px] border-transparent text-[15px] font-extrabold text-ink/50 hover:border-ink hover:text-ink focus:outline-none focus-visible:border-cobalt focus-visible:text-ink"
          >
            <span aria-hidden="true">✕</span>
          </button>
        )}
        {hits.length > 0 && (
          <ul
            id="search-suggestions"
            role="listbox"
            aria-label="Suggested models"
            className="absolute inset-x-0 top-full z-20 border-[3px] border-ink bg-paper"
          >
            {hits.map((s, i) => (
              <li
                key={s.label}
                id={`search-option-${i}`}
                role="option"
                aria-selected={i === hi}
                // Mousedown, not click: it fires before the input's blur closes
                // the list out from under the cursor.
                onMouseDown={(e) => {
                  e.preventDefault();
                  go(s.label);
                }}
                onMouseEnter={() => setHi(i)}
                className={`flex cursor-pointer items-baseline justify-between gap-4 px-5 py-2.5 text-[15px] font-semibold ${
                  i === hi ? "bg-putty" : "bg-paper"
                }`}
              >
                <span className="truncate">{s.label}</span>
                <span className="shrink-0 text-[11px] font-extrabold uppercase tracking-[0.08em] text-ink/50 tabular-nums">
                  {s.count} cars
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <button
        type="submit"
        className="bg-cobalt px-7 py-4 text-[15px] font-extrabold tracking-[0.06em] text-paper uppercase hover:ring-[3px] hover:ring-inset hover:ring-ink focus:outline-none focus:ring-[3px] focus:ring-inset focus:ring-ink"
      >
        Search
      </button>
    </form>
  );
}

/** One spec axis of a single model, with the count each value would return. */
export type FacetGroup = {
  key: string;
  label: string;
  /**
   * Already in display order. `v` is what goes in the URL, `label` is what the
   * chip reads, and `top` marks the values deep enough in stock to show before
   * the row is expanded (lib/filters.ts FACET_CAP).
   */
  values: { v: string; label: string; n: number; top?: boolean }[];
};

/**
 * Facets whose values are a long open-ended list get a menu instead of a row of
 * chips. A Model Y has 17 EPA figures and a dozen trims — between them they cost
 * three rows of the page before a single car is visible. Battery is two or three
 * numbers on the models that vary at all, which still reads at a glance, so it
 * keeps its chips. The value here is what the button says when nothing is
 * picked; it doubles as the menu row that clears the facet.
 */
const MENU_FACETS: Record<string, string> = { trim: "All trims", epa: "Any range" };

/** One facet as a closed menu — the label reads what's picked, not what exists. */
function FacetMenu({
  f,
  on,
  pick,
  clear,
  allLabel,
}: {
  f: FacetGroup;
  on: Set<string>;
  pick: (key: string, v: string) => void;
  clear: (key: string) => void;
  allLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // A menu left hanging over the results after the shopper moved on is the
  // clutter this was meant to remove.
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  const picked = f.values.filter((v) => on.has(v.v));
  const label = picked.length ? picked.map((v) => v.label).join(", ") : allLabel;

  return (
    <div
      ref={box}
      // Grows to close its row instead of sitting at a fixed width beside a
      // spacer — see SpecFacets on why the menus stopped having a row each.
      className={`${CELL} relative flex grow items-center bg-paper sm:basis-[280px]`}
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
      }}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`${f.label}: ${label}`}
        onClick={() => setOpen((v) => !v)}
        className={`${HOVER} flex h-full w-full items-center gap-2 px-4 py-2.5 text-[13px] font-bold tracking-[0.04em] uppercase ${
          picked.length ? "bg-cobalt text-paper" : "bg-paper text-ink"
        }`}
      >
        <span className="min-w-0 flex-1 truncate text-left">{label}</span>
        <span aria-hidden="true" className="text-[10px]">
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <ul
          role="listbox"
          aria-multiselectable="true"
          aria-label={f.label}
          className="absolute top-full left-0 z-20 max-h-[340px] w-full min-w-[240px] overflow-y-auto border-[3px] border-ink bg-paper"
        >
          <li>
            <button
              type="button"
              onClick={() => {
                clear(f.key);
                setOpen(false);
              }}
              disabled={!picked.length}
              className={`flex w-full items-center gap-3 border-b-[3px] border-ink px-4 py-2.5 text-left text-[13px] font-bold tracking-[0.04em] uppercase ${
                picked.length ? "bg-paper text-ink hover:bg-putty" : "bg-putty text-ink/50"
              }`}
            >
              {allLabel}
            </button>
          </li>
          {f.values.map((v) => {
            const sel = on.has(v.v);
            // A value the other facets have already ruled out stays listed — it's
            // part of what this model comes as — but it can't be picked into an
            // empty page.
            const dead = v.n === 0 && !sel;
            return (
              <li key={v.v} role="option" aria-selected={sel}>
                <button
                  type="button"
                  disabled={dead}
                  onClick={() => pick(f.key, v.v)}
                  className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-[13px] font-bold tracking-[0.04em] uppercase ${
                    dead ? "bg-paper text-ink/30" : sel ? "bg-cobalt text-paper" : "bg-paper text-ink hover:bg-putty"
                  }`}
                >
                  <span aria-hidden="true" className="w-3 shrink-0">
                    {sel ? "✓" : ""}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{v.label}</span>
                  <span className={`shrink-0 tabular-nums ${sel ? "text-paper/70" : "text-ink/45"}`}>{v.n}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * The spec rail: once the results are one model, the versions of that model.
 * Only axes that actually vary here get a row, so a model with one battery
 * size never shows a battery row a shopper can't act on.
 */
export function SpecFacets({ facets }: { facets: FacetGroup[] }) {
  const sp = useSearchParams();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const pick = (key: string, v: string) => {
    const params = new URLSearchParams(sp.toString());
    const next = toggleValue(params.get(key) ?? "", v);
    if (next) params.set(key, next);
    else params.delete(key);
    params.delete("page");
    pushUrl(params);
  };

  const clear = (key: string) => {
    const params = new URLSearchParams(sp.toString());
    params.delete(key);
    params.delete("page");
    pushUrl(params);
  };

  if (facets.length === 0) return null;

  // The menu facets share one row. A menu is a single 280px control, so on its
  // own row it sat next to some 1,100px of empty cell — and with trim and
  // range both menus that was two near-empty rows above the first car, which
  // is most of what a search used to push off the screen. Side by side they
  // close the row between them. Chip facets keep a row each: a battery row is
  // already a row of blocks and has nothing to share.
  //
  // On a phone a menu's heading is dropped entirely. The label cell goes full
  // width there, so "TRIM" and "RANGE" each cost a whole row to announce a
  // control that is already reading "All trims" / "Any range" one row below —
  // four rows of phone screen for two dropdowns, above the first car. The
  // button says what it is, and its aria-label still spells out "Trim: All
  // trims" for anyone not reading the screen. Chip rows keep their heading:
  // a row of bare numbers has nothing else to say what axis it is.
  const label = (f: FacetGroup, dropOnPhone = false) => (
    <div
      key={`${f.key}-label`}
      className={`${CELL} items-center bg-putty px-4 py-2.5 ${FIELD_LABEL} ${
        dropOnPhone ? "hidden sm:flex sm:w-[132px]" : "flex w-full sm:w-[132px]"
      }`}
    >
      {f.label}
    </div>
  );
  const menus = facets.filter((f) => MENU_FACETS[f.key]);
  const chipRows = facets.filter((f) => !MENU_FACETS[f.key]);

  return (
    <div className="border-l-[3px] border-ink">
      {menus.length > 0 && (
        <div className="flex flex-wrap items-stretch">
          {menus.map((f) => [
            label(f, true),
            <FacetMenu
              key={f.key}
              f={f}
              on={new Set(splitValues(sp.get(f.key) ?? ""))}
              pick={pick}
              clear={clear}
              allLabel={MENU_FACETS[f.key]}
            />,
          ])}
        </div>
      )}
      {chipRows.map((f) => {
        const on = new Set(splitValues(sp.get(f.key) ?? ""));
        const open = expanded[f.key];
        // A value the shopper picked stays put even if it's too thin to have
        // made the cap — a chip can't vanish out from under its own ✓.
        const shown = open ? f.values : f.values.filter((v) => v.top || on.has(v.v));
        const hidden = f.values.length - shown.length;
        return (
          <div key={f.key} className="flex flex-wrap items-stretch">
            {label(f)}
            {shown.map((v) => {
              const sel = on.has(v.v);
              // A value the other facets have already ruled out stays visible —
              // it's part of what this model comes as — but it can't be picked
              // into an empty page.
              const dead = v.n === 0 && !sel;
              return (
                <button
                  key={v.v}
                  type="button"
                  aria-pressed={sel}
                  disabled={dead}
                  title={sel ? `Remove: ${v.label}` : `${v.n} ${v.n === 1 ? "car" : "cars"}`}
                  onClick={() => pick(f.key, v.v)}
                  className={`${CELL} flex grow items-center gap-2 px-4 py-2.5 text-[13px] font-bold tracking-[0.04em] uppercase sm:grow-0 ${
                    dead ? "bg-paper text-ink/30" : `${HOVER} ${sel ? "bg-cobalt text-paper" : "bg-paper text-ink"}`
                  }`}
                >
                  {sel && <span aria-hidden="true">✓</span>}
                  {v.label}
                  <span className={`tabular-nums ${sel ? "text-paper/70" : "text-ink/45"}`}>{v.n}</span>
                </button>
              );
            })}
            {hidden > 0 && (
              <button
                type="button"
                onClick={() => setExpanded((e) => ({ ...e, [f.key]: true }))}
                className={`${CELL} ${HOVER} flex grow items-center bg-paper px-4 py-2.5 text-[13px] font-bold tracking-[0.04em] text-ink/60 uppercase sm:grow-0`}
              >
                +{hidden} more
              </button>
            )}
            <div className={`${CELL} hidden flex-1 min-w-[40px] bg-paper sm:block`} aria-hidden="true" />
          </div>
        );
      })}
    </div>
  );
}

// `inferred` is the IP-geolocated city when no ZIP is set ("" when the origin
// exists but the city is unknown); undefined means no origin at all. `count` is
// how many cars the active filters leave; undefined until the index lands,
// because "0 cars" while loading is a wrong answer, not a pending one.
// `quickCounts` is what each toggle would leave and out of how many, keyed
// "key=value" — also undefined until the index lands, and for the same reason.
export function FilterRail({
  makesModels,
  inferred,
  count,
  quickCounts,
}: {
  makesModels: Record<string, string[]>;
  inferred?: string;
  count?: number;
  quickCounts?: Record<string, { n: number; of: number }>;
}) {
  const sp = useSearchParams();
  const [open, setOpen] = useState(false);
  const get = (k: string) => sp.get(k) ?? "";

  const apply = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v) params.set(k, v);
        else params.delete(k);
      }
      if ("make" in updates) params.delete("model");
      if ("make" in updates || "model" in updates) dropSpecFilters(params);
      // Changed filters mean a different result set — page 3 of it is noise.
      params.delete("page");
      pushUrl(params);
    },
    [sp]
  );

  const make = get("make");
  const models = make ? (makesModels[make] ?? []) : [];
  const makes = Object.keys(makesModels).sort();

  // A toggle earns its place by dividing the cars it can actually judge — but
  // "enough" depends on what the toggle is asking about (lib/filters.ts axis).
  //
  // Three ways a toggle fails to divide, and the first pass caught only one:
  //
  //   nothing   "+ AWD" on a Chevrolet Bolt — never built that way, so the
  //             button's only outcome is an empty page.
  //   everything  "+ SUVs" on a Bolt EUV, where all 106 are SUVs.
  //   only the unknowns  the subtle one. These toggles admit only cars we can
  //             verifiably classify, so a car we know nothing about fails all
  //             of them. On an F-150 Lightning "+ 200+ mi range" excludes 19
  //             of 357 and NOT ONE is under 200 miles — every Lightning is
  //             230, 240, 300 or 320, and the 19 are trucks whose range we
  //             never resolved. Shown, it reads as a range filter and acts as
  //             a "do we have data" filter: matching the wrong thing.
  //
  // Hence `of` counts only cars with an answer on that axis (QUICK_KNOWS), and
  // the bar below is a share of the ones that genuinely fail.
  //
  // Where the two axes part company is thin stock. A VARIANT toggle asks what
  // the car is, so one real counter-example is the whole argument: Volvo sold
  // a single-motor EX30 alongside the twin-motor, and 10 rear-drive cars in
  // 285 is proof the choice exists, not noise to round away. A MARKET toggle
  // asks what this week's listings hold, where two cars over 60k miles in
  // 4,603 Lyriqs really is noise, so it has to clear 5%.
  //
  // Measured over the 90 models with 50+ cars, 450 toggle slots: 116 survive.
  // A flat 5% on everything left 110 but dropped the EX30 case; no floor at
  // all left 155 and kept the Lyriq noise.
  //
  // Still inventory-shaped, and that is now the LAST gap, not a data problem:
  // the catalogue exists. lib/listings/variantCatalog.ts joins the EPA's own
  // certification data (epa_vehicle_variants, migration 0037) to the feed's
  // model strings and ships a per-model digest in the first-paint payload
  // (FirstPaintData.variants) — drivetrains, body, per-year rated ranges, for
  // all 88 of the 50+ car models (measured 2026-08-17). The catalogue-first
  // rule this enables: a VARIANT toggle consults the digest before the
  // inventory — offer "+ AWD" iff the catalogued models in the results
  // include an AWD version (even with zero in stock today, rendered dead the
  // way SpecFacets deads an exhausted value: the choice exists, none listed
  // right now), and never offer it when the catalogue says single-drive.
  // Inventory inference stays ONLY for models the digest omits — absence
  // means unknown, never "no such version" (the EPA file has measured holes:
  // MY2023 Ioniq 5, everything over 8,500 lb GVWR). Years flagged e:1 are
  // enrichment-sourced and non-exhaustive — they may add a choice, never
  // remove one. Not wired here yet; the shipped digest is the prerequisite.
  //
  // Nothing is lost when a toggle is dropped: All filters still sets every one
  // of these keys. The rail is shortcuts, not capability. And measuring the
  // share of FAILS is what keeps the rare find — the lone sub-$30k Taycan
  // passes while 288 peers fail, so that button stays.
  //
  // A toggle that is currently ON always stays, whatever it counts: the only
  // way to switch it off is for it to be there.
  const MARKET_SHARE = 0.95;
  const quick = QUICK_TOGGLES.map((t) => ({ ...t, on: get(t.key) === t.value })).filter((t) => {
    if (t.on || !quickCounts) return true;
    const c = quickCounts[`${t.key}=${t.value}`];
    if (!c || c.n === 0) return false;
    return t.axis === "variant" ? c.n < c.of : c.n < c.of * MARKET_SHARE;
  });

  const quickOn = new Set(quick.filter((t) => t.on).map((t) => t.key));

  // A filter a pressed toggle already represents doesn't also get a chip —
  // two controls for the same state read as two different filters.
  const active = REMOVABLE.flatMap((k) => {
    const v = get(k);
    if (!v || quickOn.has(k)) return [];
    const label = describeFilter(k, v);
    return label ? [{ key: k, label }] : [];
  });

  const heatPumpOn = get("heatPump") === "1";

  // A radius chosen against the inferred origin has no ZIP chip to represent
  // it; without one of its own the filter would be invisible.
  const radiusChip =
    inferred !== undefined && !get("zip") && get("radius") && get("radius") !== "any"
      ? `Within ${get("radius")} mi`
      : null;

  const hasOrigin = inferred !== undefined || !!get("zip");

  return (
    <div className="border-t-[3px] border-l-[3px] border-ink">
      <div className="flex flex-wrap items-stretch">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={`${BLOCK} ${HOVER} bg-ink text-paper`}
        >
          {open ? "Close filters" : "All filters"}
          <span aria-hidden="true">{open ? "▲" : "▼"}</span>
        </button>

        {active.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => apply({ [f.key]: "" })}
            title={`Remove: ${f.label}`}
            className={`${BLOCK} ${HOVER} bg-vermilion text-paper`}
          >
            {f.label}
            <span aria-hidden="true">✕</span>
          </button>
        ))}

        {radiusChip && (
          <button
            type="button"
            onClick={() => apply({ radius: "" })}
            title={`Remove: ${radiusChip}`}
            className={`${BLOCK} ${HOVER} bg-vermilion text-paper`}
          >
            {radiusChip}
            <span aria-hidden="true">✕</span>
          </button>
        )}

        {quick.map((t) => (
          <button
            key={t.key}
            type="button"
            aria-pressed={t.on}
            title={t.on ? `Remove: ${t.label}` : `Only ${t.label.toLowerCase()}`}
            onClick={() => apply({ [t.key]: t.on ? "" : t.value })}
            className={`${BLOCK} ${HOVER} ${t.on ? "bg-cobalt text-paper" : "bg-paper text-ink"}`}
          >
            <span aria-hidden="true">{t.on ? "✓" : "+"}</span>
            {t.label}
          </button>
        ))}

        {/* The count also does the old spacer's job: it takes the slack between
            the chips and sort on a wide rail. Until the index lands there's no
            number to give, and an empty stretched cell only reads as a gap on a
            phone, so that state keeps the desktop-only spacer it always was. */}
        {count === undefined ? (
          <div className={`${CELL} hidden flex-1 min-w-[40px] bg-paper sm:block`} aria-hidden="true" />
        ) : (
          <div
            aria-live="polite"
            className={`${CELL} flex grow items-center bg-paper px-4 py-2.5 text-[13px] font-bold tracking-[0.04em] whitespace-nowrap text-ink/60 uppercase tabular-nums sm:min-w-fit sm:flex-1 sm:justify-end`}
          >
            {count.toLocaleString()} {count === 1 ? "car" : "cars"}
          </div>
        )}

        {/* The select owns the whole cell so label and chevron stay clickable;
            without the ▼ an appearance-none select reads as a static label. */}
        <div className={`${CELL} relative flex grow items-center bg-paper sm:grow-0`}>
          <label
            htmlFor="sort"
            className="pointer-events-none absolute left-4 text-[10px] font-extrabold uppercase tracking-[0.14em] text-ink/55"
          >
            Sort
          </label>
          <select
            id="sort"
            value={get("sort") || "featured"}
            onChange={(e) => apply({ sort: e.target.value === "featured" ? "" : e.target.value })}
            className="h-full w-full cursor-pointer appearance-none bg-transparent py-2.5 pr-9 pl-14 text-[13px] font-bold tracking-[0.04em] uppercase hover:ring-[3px] hover:ring-inset hover:ring-cobalt focus:outline-none focus:ring-[3px] focus:ring-inset focus:ring-cobalt"
          >
            <option value="featured">Featured</option>
            <option value="price">Price: lowest</option>
            <option value="price-desc">Price: highest</option>
            <option value="year-desc">Year: newest</option>
            <option value="miles">Mileage: lowest</option>
            <option value="range-desc">Range: highest</option>
            {/* Without any origin the option would silently sort by nothing;
                it still renders if a back-navigated URL already carries it. */}
            {(hasOrigin || get("sort") === "distance") && <option value="distance">Distance: nearest</option>}
          </select>
          <span aria-hidden="true" className="pointer-events-none absolute right-4 text-[10px]">
            ▼
          </span>
        </div>
      </div>

      {open && (
        <div className={`${CELL} grid grid-cols-2 gap-4 bg-putty p-5 md:grid-cols-4`}>
          <label className="col-span-2 flex flex-col gap-1 md:col-span-1">
            <span className={FIELD_LABEL}>Make</span>
            <select className={FIELD} value={make} onChange={(e) => apply({ make: e.target.value })}>
              <option value="">All makes</option>
              {makes.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>

          <label className="col-span-2 flex flex-col gap-1 md:col-span-1">
            <span className={FIELD_LABEL}>Model</span>
            <select
              className={FIELD}
              value={get("model")}
              onChange={(e) => apply({ model: e.target.value })}
              disabled={!make}
            >
              <option value="">{make ? `All ${make} models` : "Choose a make first"}</option>
              {models.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className={FIELD_LABEL}>{inferred && !get("zip") ? `Near ZIP · now ${inferred}` : "Near ZIP"}</span>
            <input
              className={FIELD}
              inputMode="numeric"
              maxLength={5}
              placeholder="94568"
              defaultValue={get("zip")}
              onBlur={(e) => apply({ zip: e.target.value })}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className={FIELD_LABEL}>Within</span>
            <select className={FIELD} value={get("radius") || "50"} onChange={(e) => apply({ radius: e.target.value })}>
              <option value="25">25 miles</option>
              <option value="50">50 miles</option>
              <option value="100">100 miles</option>
              <option value="250">250 miles</option>
              <option value="any">Nationwide</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className={FIELD_LABEL}>Min price</span>
            <input
              className={FIELD}
              inputMode="numeric"
              placeholder="$"
              defaultValue={get("minPrice")}
              onBlur={(e) => apply({ minPrice: e.target.value })}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className={FIELD_LABEL}>Max price</span>
            <input
              className={FIELD}
              inputMode="numeric"
              placeholder="$"
              defaultValue={get("maxPrice")}
              onBlur={(e) => apply({ maxPrice: e.target.value })}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className={FIELD_LABEL}>Min year</span>
            <input
              className={FIELD}
              inputMode="numeric"
              placeholder="2018"
              defaultValue={get("minYear")}
              onBlur={(e) => apply({ minYear: e.target.value })}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className={FIELD_LABEL}>Max year</span>
            <input
              className={FIELD}
              inputMode="numeric"
              placeholder="2026"
              defaultValue={get("maxYear")}
              onBlur={(e) => apply({ maxYear: e.target.value })}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className={FIELD_LABEL}>Max mileage</span>
            <input
              className={FIELD}
              inputMode="numeric"
              placeholder="60,000"
              defaultValue={get("maxMiles")}
              onBlur={(e) => apply({ maxMiles: e.target.value })}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className={FIELD_LABEL} title="Only cars whose drivetrain we know are included when this is set">
              Drivetrain
            </span>
            <select className={FIELD} value={get("drive")} onChange={(e) => apply({ drive: e.target.value })}>
              <option value="">Any</option>
              <option>AWD</option>
              <option>RWD</option>
              <option>FWD</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className={FIELD_LABEL} title="Only cars whose body style we know are included when this is set">
              Car type
            </span>
            <select className={FIELD} value={get("body")} onChange={(e) => apply({ body: e.target.value })}>
              <option value="">Any</option>
              {BODY_TYPES.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className={FIELD_LABEL}>Condition</span>
            <select className={FIELD} value={get("cond")} onChange={(e) => apply({ cond: e.target.value })}>
              <option value="">New &amp; used</option>
              <option value="new">New</option>
              <option value="used">Used &amp; certified</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className={FIELD_LABEL}>Min range for this version</span>
            <input
              className={FIELD}
              inputMode="numeric"
              placeholder="250"
              defaultValue={get("minRange")}
              onBlur={(e) => apply({ minRange: e.target.value })}
            />
          </label>

          <label className="col-span-2 flex items-center gap-2.5 md:col-span-4">
            <input
              type="checkbox"
              className="size-4 accent-cobalt"
              checked={heatPumpOn}
              onChange={(e) => apply({ heatPump: e.target.checked ? "1" : "" })}
            />
            <span className="text-[13px] font-bold uppercase tracking-[0.04em]">Heat pump</span>
          </label>

          {sp.size > 0 && (
            <div className="col-span-2 md:col-span-4">
              <button
                type="button"
                onClick={() => pushUrl(new URLSearchParams())}
                className="border-[3px] border-ink bg-ink px-4 py-2 text-[12px] font-extrabold uppercase tracking-[0.06em] text-paper"
              >
                Clear everything
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
