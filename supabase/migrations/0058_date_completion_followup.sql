-- 0058 - Overdue-date follow-up: when an important date passes without being
-- marked complete, the daily cron asks its creator whether it happened
-- (tracked via completion_prompt_sent_at) and, if nobody responds within the
-- grace window, completes it automatically (flagged via auto_completed so the
-- UI can say "marked done automatically").

ALTER TABLE public.important_dates
  ADD COLUMN IF NOT EXISTS completion_prompt_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS auto_completed boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS important_dates_overdue_idx
  ON public.important_dates(date)
  WHERE completed_at IS NULL;
