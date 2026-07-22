-- =============================================================================
-- 0060_realtor_reminder_schedules.sql
-- Recurring, realtor-authored reminders to their clients.
--
-- A realtor sets up a message ("Happy holidays from your agent!", a monthly
-- check-in, a one-off nudge) aimed at a client, on a cadence. The daily cron
-- (lib/realtorReminders.ts, wired into /api/cron/daily) materializes each due
-- schedule into public.scheduled_messages, which the drips cron then dispatches
-- over the chosen channels (email / sms / in_app). Nothing here sends mail
-- directly — it only decides WHAT and WHEN, reusing the existing queue.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.realtor_reminder_schedules (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id       uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  created_by    uuid REFERENCES public.users(id) ON DELETE SET NULL,
  -- Who receives this:
  --   'client'      → one specific client (search_id + recipient_* below).
  --   'all_clients' → every client of the authoring realtor, expanded by the
  --                   cron at fire time (recipient_* left null).
  audience text NOT NULL DEFAULT 'client'
    CHECK (audience IN ('client', 'all_clients')),

  -- Which deal/client this is for. search_id gives the in_app thread a home;
  -- recipient_* is who actually receives it. Null for 'all_clients'.
  search_id         uuid REFERENCES public.client_searches(id) ON DELETE CASCADE,
  recipient_user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  recipient_email   text,

  title    text,
  -- The realtor's words. Delivered to the client phrased as
  -- "{realtor} wants to say: {message}".
  message  text NOT NULL,

  -- Any subset of the queue's dispatch channels.
  channels text[] NOT NULL DEFAULT '{email}',

  -- 'once'    → fire on next_run then deactivate.
  -- 'monthly' → fire on day_of_month every month.
  -- 'annual'  → fire on (month, day_of_month) every year (e.g. Dec 25).
  cadence  text NOT NULL DEFAULT 'once'
    CHECK (cadence IN ('once', 'monthly', 'annual')),
  day_of_month smallint CHECK (day_of_month BETWEEN 1 AND 31),
  month        smallint CHECK (month BETWEEN 1 AND 12),

  -- The next date (UTC) this schedule should fire. The cron compares against
  -- today and advances it after firing.
  next_run     date NOT NULL,
  last_run_at  timestamptz,

  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- A per-client schedule must name its recipient; an all-clients broadcast
  -- resolves recipients at fire time so it needs none.
  CONSTRAINT realtor_reminder_target_ck
    CHECK (
      audience = 'all_clients'
      OR recipient_user_id IS NOT NULL
      OR recipient_email IS NOT NULL
    )
);

CREATE INDEX IF NOT EXISTS realtor_reminders_due_idx
  ON public.realtor_reminder_schedules(next_run)
  WHERE active;
CREATE INDEX IF NOT EXISTS realtor_reminders_firm_idx
  ON public.realtor_reminder_schedules(firm_id);

ALTER TABLE public.realtor_reminder_schedules ENABLE ROW LEVEL SECURITY;

-- Firm staff fully manage their own firm's reminder schedules.
DROP POLICY IF EXISTS realtor_reminders_staff_all ON public.realtor_reminder_schedules;
CREATE POLICY realtor_reminders_staff_all ON public.realtor_reminder_schedules FOR ALL
  USING (firm_id = public.current_firm_id() AND public.is_staff_role())
  WITH CHECK (firm_id = public.current_firm_id() AND public.is_staff_role());

-- Keep updated_at fresh.
CREATE OR REPLACE FUNCTION public.touch_realtor_reminder_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_realtor_reminder_touch ON public.realtor_reminder_schedules;
CREATE TRIGGER trg_realtor_reminder_touch
  BEFORE UPDATE ON public.realtor_reminder_schedules
  FOR EACH ROW EXECUTE FUNCTION public.touch_realtor_reminder_updated_at();
