// What an alert subscription IS, read off its params — the one place the
// three shapes the alerts table holds are told apart for a shopper:
//
//   ids=…      the free price-drop alert on saved cars (0060/0063)
//   worth=1&…  a Pro value watch on one car (lib/worthWatch.ts)
//   anything else — a search: new listings and price cuts matching it
//
// The two senders split the table the same way (scripts/send-alerts.mjs
// skips worth=1 rows; scripts/send-worth.mjs takes only them), so this is
// their rule restated for the /saved page, not a new one.

import { WORTH_WATCH_PREFIX } from "./worthWatch";

export type AlertKind = "search" | "cars" | "worth";

export function alertKind(params: string): AlertKind {
  if (params.startsWith("ids=")) return "cars";
  if (params === WORTH_WATCH_PREFIX || params.startsWith(`${WORTH_WATCH_PREFIX}&`)) return "worth";
  return "search";
}

/** What the subscription mails. Three fixed lines; the owner's to reword. */
export function alertMails(kind: AlertKind): string {
  switch (kind) {
    case "cars":
      return "Price drops on your saved cars";
    case "worth":
      return "Changes in what this car is worth";
    default:
      return "New listings and price cuts";
  }
}

/** Where the subscription's own page is: the search it watches, the saved
 *  cars, or the valuation it re-runs. */
export function alertHref(kind: AlertKind, params: string): string {
  if (kind === "cars") return "/saved";
  if (kind === "worth") {
    const p = new URLSearchParams(params);
    p.delete("worth");
    return `/worth?${p.toString()}`;
  }
  return `/?${params}`;
}
