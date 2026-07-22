-- =============================================================================
-- 0061_stats_digest_prefs.sql
-- Opt-in "congrats, here's what you did" stats email for realtors.
--
-- Each realtor chooses a cadence; the daily cron (lib/statsDigest.ts) computes
-- their closed-deal / homes-sold numbers for the period and emails a celebratory
-- recap. last_sent_on guards against double-sends within a period.
-- =============================================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS stats_email_cadence text NOT NULL DEFAULT 'monthly'
    CHECK (stats_email_cadence IN ('off', 'monthly', 'annual')),
  ADD COLUMN IF NOT EXISTS stats_email_last_sent_on date;
