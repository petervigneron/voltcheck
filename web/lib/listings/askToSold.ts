// The one conversion from an asking price to a value, shared by every
// surface that prints a value: the /worth headline (value.ts), the trend
// chart (lib/trend.ts valueSeries) and the weekly value-watch mail.
//
// Cars clear about this fraction UNDER their asking price, contemporaneously
// — the 2026-08-26 calibration against Washington title sales
// (docs/tools/worth-calibration.mts; value.ts's header has the numbers).
// Proportional and small, not the flat $1,100 comps.ts still uses for its
// own delta claims. Client-safe: no imports, so the chart component can
// read it without dragging the database module in.
export const ASK_TO_SOLD_DISCOUNT = 0.013;

/** An asking price as the transaction it becomes. */
export const askToValue = (askUsd: number): number => askUsd * (1 - ASK_TO_SOLD_DISCOUNT);
