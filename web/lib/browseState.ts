// Where the browse grid parks its current query string so a listing detail
// page can send the shopper back to the exact results they left.
//
// The grid's whole state is its URL query string (components/Browse.tsx). But
// a listing page is a different route with a different URL, so once you click a
// card that query string is no longer anywhere the detail page can read it.
// sessionStorage bridges the two: the grid writes on every change, the detail
// page's Back-to-results link reads (components/BackToResults.tsx).
//
// sessionStorage, not localStorage, on purpose — this is the state of *this
// tab's* last search, not a durable preference. Two tabs open on two different
// searches each get their own; closing the tab forgets it. (Durable saved
// searches are a separate shelf — see lib/savedSearches.ts.)

export const BROWSE_QS_KEY = "voltcheck.browse.qs";

/** Remember the query string the grid is currently showing. Called from the
 *  grid on every state change; a no-op on the server and when storage is
 *  blocked. Stored without the leading "?". */
export function rememberBrowseQuery(qs: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(BROWSE_QS_KEY, qs.replace(/^\?/, ""));
  } catch {
    // Private mode or full storage — the back link just falls back to "/".
  }
}
