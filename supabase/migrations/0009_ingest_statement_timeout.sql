-- The nightly ingest started timing out (2026-08-14, three runs, SQLSTATE
-- 57014). service_role has no statement_timeout of its own, so PostgREST
-- requests inherit the authenticator's 8s default — and ingest_listings
-- (a ~7k-row upsert carrying ~10MB of jsonb payloads, plus history and
-- event inserts) now sits right on that line on the nano instance:
-- under 8s on quiet nights, over it when the crawl brings real churn.
--
-- service_role is never exposed to browsers — only the ingest gateway
-- edge function and CI hold it — so a generous ceiling costs nothing.
-- 60s is ~5x the worst observed run, with room for the tables to grow.
--
-- (A SET clause on the function itself would not work: statement_timeout
-- is armed when the top-level statement starts, before the function's
-- settings apply.)

alter role service_role set statement_timeout = '60s';

-- PostgREST caches role settings; tell it to reload.
notify pgrst, 'reload config';
