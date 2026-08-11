# Scraper plan: every EV listing in the country

The assignment: find every EV for sale in the US and generate listings with more
comprehensive EV-specific information than any other site. Coverage bar: ~100% of
available electric listings.

## What exists now (`scraper/`, prototype, 2026-08-09)

Node, zero dependencies, polite by construction (identifies itself as VoltcheckBot with a
contact address, obeys robots.txt, ≥1.1s between requests per host, skips rather than
works around bot challenges).

Pipeline: dealer domain → sitemap discovery (robots.txt `Sitemap:` lines + conventional
paths, one level of index recursion) → rank inventory-looking URLs (EV-ish slugs first so
a small page budget finds the EVs) → fetch pages → extract schema.org Vehicle JSON-LD →
EV classification (fuel-type fields, then EV-only WMIs, then model-name match flagged
lower-confidence) → normalize to VIN-keyed records → `out/listings.json` + per-site report.

**First live run** (4 real dealer sites, 25 pages each, ~100 fetches):
**53 unique EV listings, 53/53 with VIN + price + year.** Hendrick (Dealer.com platform)
was the richest — its pages embed multi-vehicle JSON-LD arrays. Known gaps from the same
run, logged not hidden: trim usually absent from JSON-LD, mileage spotty per platform,
and Longo Toyota yielded zero (its platform doesn't emit vehicle JSON-LD on the pages we
hit — needs a platform-specific extractor). One probed site (classicchevrolet.com)
returned 403 to our bot UA; per posture rules we skip and record, not evade.

## The path to 100%

### 1. Dealer registry (the denominator)
You can't measure 100% without knowing the universe. Build a registry table:
- **Franchised dealers (~16.8k):** OEM dealer locators enumerate them (each brand's
  locator API/page, keyed by zip sweep). Gives name, address, brand, website URL.
- **Independents (tens of thousands):** state dealer-license rolls where published,
  Google Places sweeps by category, and the big fixed set (CarMax, Carvana, EchoPark,
  Shift-style e-tailers, Tesla/Rivian/Lucid direct used inventory — each a dedicated
  connector, not a crawl).
- Registry rows: domain, platform fingerprint, group membership (Hendrick etc. — one
  crawl covers many rooftops), crawl status, last success, robots posture.

### 2. Platform fingerprints (the multiplier)
The dealer web runs on a small number of website platforms (Dealer.com, Dealer Inspire,
DealerOn, Sincro, DealerFire, Jazel, …). Fingerprint once (markup/URL/asset signatures),
write one extractor per platform, and coverage scales by platform share rather than
site-by-site. JSON-LD is the universal fallback; platform extractors fill its gaps
(trim, mileage, options, photos) and handle the Longo-style zeros. SRP JSON APIs that
platforms expose to their own frontends are in scope where public and unauthenticated;
anything gated stays out.

### 3. Crawl economics
EV-only helps *after* discovery, not before — every dealer must be visited, but only
EV pages need deep fetching. Sitemap-first keeps it cheap: sitemaps enumerate VDP URLs
with EV-identifiable slugs, so most sites cost a few requests per refresh, not hundreds.
Estimate: ~60k rooftops × ~10 requests/day ≈ 7 req/sec sustained — one small box; the
real costs are proxy/IP reputation management (politeness is also the practical strategy:
slow, identified, cacheable, conditional GETs) and extractor maintenance.

### 4. Refresh + lifecycle
Daily sitemap diff per site; new URLs fetched, missing URLs mark listings delisted
(sold-detection = value: "days on lot" and price-drop history are EV-relevant signals we
get for free). Price changes from re-fetch of live listings on a slower cadence.

### 5. Dedupe + identity
VIN-keyed. Same VIN on multiple sites (group sites, syndication) → one listing, multiple
sellers, cheapest price surfaced. VIN check-digit validation at ingest; vPIC decode
(free, batched) verifies make/model/year and catches name-match false positives.

### 6. The enrichment join (why we win)
Every scraped VIN flows through what's already built: vPIC decode → Tesla VIN decoding →
T3 enrichment (EPA range/battery for the exact version, heat pump, port/adapter,
warranty transfer) → T4 checklist. Photo reads (charge-port CCS check on Bolts) and
GM campaign checks slot in at ingest. No other listing site carries this layer.

### 7. Coverage measurement (the 100% claim)
Pilot metro audit: hand-collect ground truth for one metro (every dealer site + Autotrader/
Cars.com counts as cross-reference), measure our recall, fix the platform gaps that audit
reveals, re-measure. Repeat per metro. Publish the number internally; "100%" is a measured
claim or it's marketing.

## Sequence

1. Platform fingerprinting + extractors for the top 3 platforms (Dealer.com first — it
   already works via JSON-LD arrays; quantify its dealer share).
2. Registry v1: one state end-to-end (OEM locators + independents), full crawl, metro audit.
3. Ingest → Supabase → the web app reads real listings instead of demo data.
4. Direct-retailer connectors (Carvana, CarMax, Tesla used, …) — few sources, big volume.
5. Scale states; nightly refresh; delist/price-history tracking.

## Posture rules (unchanged)
Identified UA with contact, robots.txt respected, rate-limited, no CAPTCHA/bot-challenge
evasion, no login-gated or token-gated sources. Sites that 403 the bot get recorded and
revisited as policy questions (some unblock identified crawlers on request), not evaded.
