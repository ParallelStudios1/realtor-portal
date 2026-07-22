-- =============================================================================
-- 0062_event_reminder_custom.sql
-- Richer per-event reminders: a custom message, a custom subject/label, and the
-- ability to target one specific person (not just an audience bucket).
--
-- Builds on 0033's date_reminders, which already carries offset_days, at_time,
-- channels, audience, escalate, and supports many reminders per date. This adds
-- the "what it says" and a 'specific' audience for "exactly who".
-- =============================================================================

ALTER TABLE public.date_reminders
  ADD COLUMN IF NOT EXISTS custom_message text,
  ADD COLUMN IF NOT EXISTS custom_label   text,
  ADD COLUMN IF NOT EXISTS recipient_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recipient_email   text;

-- Extend the audience options with 'specific' (targets recipient_* above).
ALTER TABLE public.date_reminders DROP CONSTRAINT IF EXISTS date_reminders_audience_check;
ALTER TABLE public.date_reminders
  ADD CONSTRAINT date_reminders_audience_check
  CHECK (audience IN ('staff', 'client', 'all_parties', 'specific'));
