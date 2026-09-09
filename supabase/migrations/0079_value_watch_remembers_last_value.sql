-- The Pro value watch ("Track this car's value" on /worth, 2026-09-09) mails
-- a tracked car's valuation once a week and says how it moved. The move
-- needs last week's figure, and the row is the only place it can live:
-- the params column is the row's identity (0029's unique index), so the
-- figure cannot ride there.
--
-- Written only by scripts/send-worth.mjs under service_role after a mail
-- goes out. Nothing anon can reach touches it: the table has no policies
-- and the RPCs never select it.
alter table alert_subscriptions add column if not exists last_value_usd integer;
