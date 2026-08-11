# Voltcheck (working name) — a used-EV listings site that actually knows the cars

Like visor.vin but for EVs: a cars-for-sale aggregator that's much nicer to use than
Autotrader or CarGurus. The edge is the enrichment layer — every listing card and detail
page carries facts listings don't have and legacy sites don't check: the pack this exact
car carries, real range, heat pump, fast-charge status, and what the warranty does for a
second owner.

## Layout

- `docs/ENRICHMENT-SCHEMA.md` — the data model: tiers of knowability (T1 VIN → T4
  ask-the-seller), field-by-field schema, sources tested August 2026. Read this first.
- `docs/HANDOFF.md` — verified / n=1 / open research findings and the evidentiary
  discipline (never promote a claim a tier without a primary source).
- `docs/OEM-PORTAL-SURVEY.md` — which OEMs expose per-VIN *completed* campaign history
  (GM, Mercedes verified; Hyundai near-verified; most others open-only).
- `web/` — Next.js 16 + TypeScript + Tailwind 4 app.
- `scraper/` — nightly crawl → enrich → ingest pipeline (plain Node, no AI, launchd).
- `supabase/` — persistence: migration SQL, PGlite verify harness. Listings live in
  Supabase with full history (first/last seen, every price change, delisted-not-deleted);
  `web/data/scraped-listings.json` remains the always-working fallback. Setup + deploy
  checklist: `docs/SETUP-DEPLOY.md`.

## What works today

**Browse (`/`)** — the product. Listing cards over a demo inventory, each enriched at
render: real range for the actual pack (two identically-badged $38,900 Model Ys show
279 mi vs 330 mi), heat pump resolved per trim/drivetrain, fast-charge status, warranty
transferability, trap flags. EV-native filters that act only on verified facts — "min
real range 300" excludes the Austin Model Y and keeps the Fremont one.

**Listing detail (`/listing/[id]`)** — price/mileage header, then the enrichment report:
per-car evidence (photo-read charge port, completed GM campaign check) *rewrites*
model-level facts with its own provenance and retires the traps it resolves; what remains
unknowable becomes the ask-the-seller checklist with dollar stakes.

**VIN check (`/vin`)** — the same report for any VIN, standalone: live NHTSA vPIC decode,
Tesla VIN position 7/10/11 decoding, grey-import detection.

**The data layer (`web/lib/`)** — `enrichment/data.ts` seed corpus (Model Y both packs,
Model 3 heat-pump split, Bolt DCFC lottery + pack-replacement, Ioniq 5, EV6); every value
a `Fact<T>` with source/asOf/confidence; `agg` values render as "unverified"; missing
fields render as "unknown — we won't guess"; ambiguous matches render as candidates plus
the discriminating question.

Run: `npm run dev` in `web/` (or the `voltcheck-dev` launch config).

## Rules that outrank features

- No paid per-VIN data anywhere in the product path.
- `agg`-sourced values render as unverified; only primary-source checks promote them.
- A fetch failure is never evidence about the world — control-test before recording a negative.
- Depth-first: one model correct end to end beats fifteen models shallow.
- Sources that require defeating bot controls are a posture signal, not an engineering cost.

## Next

- **Real listings.** The demo inventory stands in for a feed — sourcing real inventory is
  the big open product question. Options on the table: licensed bulk feeds (Marketcheck,
  Auto.dev — being researched), direct dealer syndication, and scraping public listing
  pages (a per-target legality/effort judgment the owner makes; not ruled out).
- Supabase persistence is built and verified (see `docs/SETUP-DEPLOY.md`) — awaiting the
  owner's project creation + keys; until then the JSON fallback serves. Enrichment stays
  in code (versioned editorial content, not feed data).
- GM owner-centre campaign lookup as the first live per-VIN feature (public, no sign-in);
  Mercedes/Hyundai equivalents are user-initiated candidates only (reCAPTCHA-gated).
- T3.5 photo reads at ingest (Bolt charge-port CCS detection) — the demo already models it.
- Grow the corpus per the schema's build order.
