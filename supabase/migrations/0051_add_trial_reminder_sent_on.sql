-- Idempotency stamp for the daily trial-countdown reminder cron, so a re-run
-- in the same day doesn't email/text a firm's admins twice.
alter table public.firms
  add column if not exists trial_reminder_sent_on date;
