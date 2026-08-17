-- The cohort read (db.ts fetchCohortFromDb, every detail render) believed
-- "Postgres range-scans the vin primary key on the pattern's literal
-- prefix". It never did: the database's collation isn't C, so the plain
-- btree PK cannot serve `vin LIKE 'KNDC4DLC%'`, and every cohort fetch was
-- a full seq scan of the wide listings table. Measured 2026-08-17 while
-- adding the price scatter: 17,415 buffers, 828ms hot, 2.4s cold — riding
-- the same 3s anon timeout cliff as the 0030 count, and it 500d under load
-- during verification (three retries deep, which ISR then bakes in for an
-- hour). Same medicine: a pattern-ops index over live vins turns the LIKE
-- into the range scan the comment always claimed.
--
-- Applied 2026-08-17 with a one-time out-of-band ANALYZE (bundled below for
-- replay); measured after: 828ms → 1.7ms hot.
create index listings_vin_prefix on listings (vin text_pattern_ops)
  where delisted_at is null;
analyze listings;
