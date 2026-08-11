# Where the for-sale inventory can come from

Researched 2026-08-09 (web research; visor.vin, carsxe.com and web.archive.org were
unreachable from the research sandbox — confirmed environmental via control fetches — so
claims about them are tiered accordingly). Evidence tiers: **[V]** verified (page fetched
and read), **[R]** reported (secondary source), **[O]** open.

**Framing note:** an earlier draft of the research prompt wrongly assumed scraping was
ruled out. It is not — the owner decides sourcing trade-offs per target. The findings
below stand either way; the "bottom line" ranking has been adjusted to include the
scrape-your-own path as a first-class option.

## The headline: how visor.vin does it

**They scrape dealer websites themselves.** [V] — Techstars founder-spotlight interview
with CEO Craig Smith (co-founder with brother Cole; team ~3; Techstars 2024):
Visor scrapes vehicle listings directly from dealer websites rather than connecting to
dealer management systems, links each listing back to its source ("citing our homework"),
and built its own VIN-spec resolution because "there's no federalized system that says
exactly what a VIN represents." Monetization: Visor Plus subscription (options-level
filtering, sold/price data) and now reselling their own API. [R on the API]
Source: techstars.com/blog/startup-spotlight/navigating-the-future-of-car-shopping-with-craig-smith-ceo-visor

This is also what Marketcheck does upstream, at industrial scale (~84,000 dealer-site
crawl). Scraping *dealer* sites is a different posture question from scraping Craigslist/
Facebook (ToS-hostile, no API) or Carfax (token-gated, litigious): dealer sites publish
inventory to be seen, and the visor precedent shows a 3-person shop doing it openly with
attribution, through a Techstars accelerator, without visible legal trouble.

## Licensed feed options

| Option | Active US coverage | Private party | Display licensing | Price (as of 2026-08-09) | EV fields | Tier |
|---|---|---|---|---|---|---|
| **Marketcheck self-serve** | ~6M unique / ~16M raw dealer listings from ~84k dealer sites | Yes — 80k+ FSBO (premium per-call tier) | Display OK **only live-query**; ToS prohibits persisting/re-indexing their data without Enterprise | Free 500 calls/mo; **$299/mo Basic** (5k calls); **$749/mo Standard** (unlimited, white-label search) + ~$0.002/call | `fuel_type`, `powertrain_type` (BEV/PHEV) filters; **no battery/range fields** | V |
| **Marketcheck Enterprise** | same, delivered as bulk feed | yes | negotiated for stored/re-indexed use | custom (sales contact) | same | V exists / O price |
| **Auto.dev** | "millions," US dealers | not stated | terms say "internal business purposes"; display/caching grant not explicit — needs written confirmation | free 1k calls; **$299/mo Growth**; **$599/mo Scale** + $0.002/listing call | not documented | V price / O license |
| **VinAudit Car Listing API** | 15M+ listings, 70k+ retailers; bulk delivery offered | "seller type" selectable, depth unknown | not stated | quote only (historically the budget vendor) | fuel type only | V coverage / O price |
| **DataOne (Dominion)** | ~5,000+ opt-in dealers only | no | clean licensed provenance incl. photos | quote only | rich build data via decode | V product / O price |
| **Visor API (visor.vin/api)** | their own crawl | unknown | unknown | usage-based, free start; unpublished | options-level specs (their edge) | R/O |
| **Dealer syndication (HomeNet, DealerVault…)** | only dealers who opt in; nightly CSV/FTP | no | dealer consent = full display rights incl. photos | historically ~$25–50/mo per feed, often dealer-paid | whatever the IMS exports | V mechanics / R price |
| **eBay Browse API** | eBay Motors only | partial | attribution/linkback required | free at standard volumes | item specifics incl. fuel | V exists / R terms |

Notes:
- **The Marketcheck catch [V]:** self-serve tiers legally support a *live-query* search
  site (each user search proxies to their API). Building **our own stored EV index** from
  their data requires the Enterprise bulk agreement. An EV-only slice (~1–3% of listings)
  is a good negotiating angle; no published price for that path.
- **No feed carries battery/range data.** Whatever the source, our enrichment layer is
  the differentiation — that part of the thesis survives every sourcing option.
- CarsXE and Vehicle Databases sell per-VIN enrichment, not inventory; Vehicle Databases'
  EV Specifications API could serve as a spec join if useful.

## Precedents

- **CarGurus** [R]: scaled via freemium dealer feeds from ~2010 — dealers push CSV
  because listings are advertising. Once a site has an audience, inventory comes to it.
- **Recurrent** [R]: ~500 dealer/consignor partners carry its battery reports; inventory
  via partnership, not licensing.
- **Find My Electric** [R]: pure self-serve classifieds ($49 featured listings); no feed.
- **EV.com / OnlyEV** [R/V]: dealers sign up and list their own inventory.
- **No documented case of a solo operator getting a national bulk feed at hobby prices.** [O]

## Private party

Marketcheck's FSBO endpoint (80k+ listings, no seller contact info) [V], eBay Browse API
[V], and a self-serve "list your EV" form of our own are the only clean paths.
Craigslist/Facebook/OfferUp have no public APIs and ToS-hostile postures. PrivateAuto
partners via BD; no public feed found.

## Realistic paths for this site (owner's call)

**Coverage requirement (owner, 2026-08-09): ~100% of available electric listings, or the
site is dead on arrival.** And essentially every dealer lists at least one EV — so an
EV-only site gets a smaller *database*, not a smaller *crawl*. Full coverage means either
crawling essentially all dealer sites (the same ~84k-site problem Marketcheck solves) or
licensing from someone who already does. This reshapes the ranking: the earlier claim
that EV-only scope shrinks the crawl was wrong.

1. **Scrape dealer sites ourselves, visor-style** — proven by the closest comparable
   company at the same team size, and visor's ~3 engineers built exactly this. But be
   clear-eyed: at the 100%-coverage bar this is a Marketcheck-scale crawler across the
   full dealer web, and it *becomes* the product's core engineering investment.
2. **Marketcheck self-serve as live-query** ($299–$749/mo + ~$0.002/search) — fastest to
   full-coverage inventory, because they've already crawled everything; the constraint is
   architectural (proxy searches live; don't build a stored clone of their index). Their
   EV *completeness* should be audited empirically in a pilot metro (free tier: compare
   their BEV counts against hand-collected dealer-site ground truth) before trusting the
   100% claim to them.
3. **Quote an EV-only bulk slice** from Marketcheck Enterprise and VinAudit — given the
   100%-coverage requirement this is probably the most important email in the project:
   the licensed path to owning a complete index without building the crawler.
4. **Dealer syndication as a quality layer** — once there's any audience, EV-focused
   dealers push nightly feeds nearly free, with photos and clean display rights.
5. **Private party:** Marketcheck FSBO + eBay + own listing form.

These aren't mutually exclusive: e.g. start live-query to validate the product, scrape or
negotiate bulk once the UX proves out, layer dealer feeds as they come.
