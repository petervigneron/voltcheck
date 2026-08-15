// Client-side URL updates for the browse page. Native pushState integrates
// with Next's router (useSearchParams picks it up), and unlike router.push it
// never asks the server for anything — which is the whole point: a filter
// click re-renders from data already in the browser.
export function pushUrl(params: URLSearchParams) {
  const qs = params.toString();
  window.history.pushState(null, "", qs ? `/?${qs}` : "/");
}
