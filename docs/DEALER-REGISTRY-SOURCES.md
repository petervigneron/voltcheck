# Dealer-registry denominator sources (researched 2026-08-11)

Goal: enumerate the ~16.8k US franchised rooftops (plus independents) so
coverage is measurable. Probes used the declared VoltcheckBot UA, ≤3
requests/host, robots-first; negatives were control-tested. Evidence labels:
**verified-live** (data obtained with honest UA), **verified-via-archive**
(exact response captured from web.archive.org — endpoint real, live access
unproven), **blocked** (host refuses the declared bot).

## What works today

- **OpenStreetMap Overpass** (in production): weekly sweep, now 31 metro
  bboxes (`scraper/registry/bboxes.txt`), feeds `probe.mjs` auto-promotion.
  ODbL attribution kept in registry meta.
- **Mercedes-Benz** — best OEM source found. verified-via-archive (200,
  2026-06-24): `nafta-service.mbusa.com/api/dlrsrv/v1/us/dealers?zip={zip}&count=1000&filter=mbdealer&radius=all`
  returned ALL 387 US MB dealers in one response, with `url` per dealer.
  Live v1 path untested (probe budget spent on wrong path guesses); service
  itself is alive.
- **BMW** — verified-via-archive (200, 2026-04-03):
  `www.bmwusa.com/api/dealers/{zip}/{radius}/{page}` with `Url` field and
  `HasMore` pagination. Live attempts stalled at transport level (no 403) —
  retry from a different network before concluding anything.

## Endpoints that exist but block the declared bot at the edge

| OEM | Endpoint (archive-verified unless noted) | Live status for our UA |
|---|---|---|
| Chevrolet/GM | `chevrolet.com/bypass/pcf/quantum-dealer-locator/v1/getDealers?...postalCode=` (has `dealerUrl`) | Akamai 403, robots.txt itself 403 |
| Toyota | `api.dg.toyota.com/api/v2/dealers/{dealerCd}` (has `url`) | CloudFront 403; robots also blocks named AI crawlers site-wide |
| Hyundai | `hyundaiusa.com/var/hyundai/services/dealer.*.service` family (has `dealerUrl`) | Cloudflare 403 |
| Honda | `automobiles.honda.com/platform/api/v2/dealer?...` (inferred, unverified) | Akamai 403 at robots.txt |
| Nissan | none verified; `nissanusa.com` robots disallows `/*zipCode=*` | JS challenge 403 |

## Open leads (page reachable, data call not pinned down)

- **Kia**: find-a-dealer page 200 with our UA, robots permissive; the data
  call lives in `clientlib-dealer-result-origin-release-*.js` (unread —
  probe budget). Cheapest next OEM to close.
- **Ford**: `ford.com/dealerships` 200; locator is the CLW widget against
  `api.foundational.ford.com` (app id captured); dealer path not found in
  archives.
- **VW**: feature-app `v3-89-0.ds-us.dcc.feature-app.io/bff-search/dealers`
  route exists (500 "No service endpoint provided") — needs the
  `serviceConfigEndpoint` param injected at runtime; not in static HTML.

## Posture conclusion

Under house rules (honest UA, no evasion), OEM locators are a PARTIAL
denominator source: MB + BMW near-term, Kia/Ford/VW with modest follow-up,
GM/Toyota/Honda/Hyundai/Nissan closed at the edge. The Overpass metro sweep
remains the workhorse; state dealer-license rolls are the untried third leg.
Saved evidence (archived JSON responses, robots files, JS bundles) lives in
the 2026-08-11 session scratchpad; re-fetch via Wayback CDX if needed.
