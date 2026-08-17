// Signals that a 0-VIN page is a client-rendered app with a reachable data
// layer — rather than an empty lot or a dead site. Born 2026-08-16, when
// enterprisecarsales.com sat in needs-investigation for three days ("0 VIN
// vehicles in 12 fetches") while its HTML was openly publishing the api key
// and endpoint config for a national inventory API. The probe's honest "found
// nothing" hid the actionable half: WHY nothing was found, and where the data
// actually was.
//
// These are regex sniffs of already-fetched HTML — zero extra requests. They
// change no status and promote nothing; they only make the needs-investigation
// note say "client-rendered; data layer at api.example.com (azure-search,
// anonymous-token-flow)" instead of "likely needs a platform extractor", so a
// later session starts at the API instead of re-discovering the wall.
//
// Ordering note: hostnames are the most valuable signal (they name the next
// thing to probe), so they come first in the output.

// Hosts that are plainly the site's data layer, not page assets. The generic
// analytics/tag/cdn noise every dealer page carries is excluded by name.
const HOST_NOISE =
  /google|gstatic|facebook|doubleclick|adobe|cookielaw|onetrust|typekit|jsdelivr|cloudflare|jquery|bootstrapcdn|fontawesome|datadog|segment|qualtrics|youtube|vimeo|bing|clarity|hotjar|monitor\.azure|pure\.cloud|genesys|livechat|intercom|zendesk|podium|birdeye/i;

export function spaSignals(html) {
  const s = String(html ?? "");
  const signals = [];

  // Concrete API hosts referenced by the page: api.* subdomains, *.cloud
  // BFFs, or anything with /api/ or /graphql in its path.
  const hosts = new Set();
  for (const m of s.matchAll(/https?:\/\/([a-z0-9.-]+)(\/[a-z0-9./_-]*)?/gi)) {
    const host = m[1].toLowerCase();
    const path = m[2] ?? "";
    // api.w.org is WordPress's REST discovery link, present on every WP page —
    // a platform fact, not a data-layer lead. In the 2026-08-16 sweep it
    // drowned the host stats (233 rows); report it as a signal instead.
    if (host === "api.w.org") continue;
    if (HOST_NOISE.test(host)) continue;
    if (/^api\.|\.api\.|\.cloud$/.test(host) || /\/api\/|\/graphql/i.test(path)) hosts.add(host);
    if (hosts.size >= 3) break;
  }
  if (hosts.size) signals.push(`api-hosts:${[...hosts].join("+")}`);

  // Search-SaaS fingerprints — each names the query dialect a future lane
  // would speak.
  if (/algolia/i.test(s)) signals.push("algolia");
  if (/typesense/i.test(s)) signals.push("typesense");
  if (/search\.windows\.net|@odata\./i.test(s)) signals.push("azure-search");
  if (/opensearch|elasticsearch|"_search"/i.test(s)) signals.push("opensearch");
  if (/graphql/i.test(s)) signals.push("graphql");

  // Page-published credentials for an anonymous data flow (the Enterprise
  // pattern): an api-key-shaped config key near JSON config, or an explicit
  // anonymous-token endpoint.
  if (/"(?:ehiApiKey|apiKey|api_key|x-api-key|subscriptionKey)"\s*:/.test(s)) signals.push("page-published-api-key");
  if (/generate-anonymous|anonymous[a-z-]*token|token_endpoint/i.test(s)) signals.push("anonymous-token-flow");

  // Client-rendered shell markers: the reason server-side extraction saw an
  // empty page. Framework-precise ones only — a bare <div id="root"> also
  // appears on server-rendered pages and would cry wolf.
  if (/api\.w\.org/.test(s)) signals.push("wordpress");
  if (/__NEXT_DATA__|self\.__next_f/.test(s)) signals.push("nextjs");
  if (/__NUXT__/.test(s)) signals.push("nuxt");
  if (/window\.__INITIAL_STATE__|window\.__PRELOADED_STATE__/.test(s)) signals.push("spa-state-blob");
  if (/etc\.clientlibs|_jcr_content/.test(s)) signals.push("aem");

  return signals;
}

// A sitemap that enumerates per-vehicle pages by VIN is itself an inventory
// feed — the URL list alone yields VIN + a per-car page to extract or diff,
// even when every fetched page renders client-side (enterprisecarsales.com's
// vdp-sitemap.xml lists /vehicle/{VIN} for its whole national stock).
const VIN_IN_URL = /[/=]([A-HJ-NPR-Z0-9]{17})(?:[/?#.]|$)/;

export function countVinUrls(urls) {
  let n = 0;
  for (const u of urls ?? []) if (VIN_IN_URL.test(String(u))) n++;
  return n;
}
