-- 0033 — Deadline reminders + escalation on important_dates.
CREATE TABLE IF NOT EXISTS public.date_reminders (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id       uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  date_id       uuid NOT NULL REFERENCES public.important_dates(id) ON DELETE CASCADE,
  search_id     uuid NOT NULL REFERENCES public.client_searches(id) ON DELETE CASCADE,
  offset_days   integer NOT NULL DEFAULT 3,
  at_time       time NOT NULL DEFAULT '09:00',
  channels      text[] NOT NULL DEFAULT ARRAY['email','in_app'],
  audience      text NOT NULL DEFAULT 'staff'
                  CHECK (audience IN ('staff','client','all_parties')),
  escalate      boolean NOT NULL DEFAULT true,
  created_by    uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS date_reminders_date_idx   ON public.date_reminders(date_id);
CREATE INDEX IF NOT EXISTS date_reminders_search_idx ON public.date_reminders(search_id);

ALTER TABLE public.important_dates
  ADD COLUMN IF NOT EXISTS completed_at   timestamptz,
  ADD COLUMN IF NOT EXISTS completed_by   uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz,
  ADD COLUMN IF NOT EXISTS escalated_at   timestamptz,
  ADD COLUMN IF NOT EXISTS owner_user_id  uuid REFERENCES public.users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.date_reminder_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reminder_id   uuid NOT NULL REFERENCES public.date_reminders(id) ON DELETE CASCADE,
  fire_on       date NOT NULL,
  queued_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reminder_id, fire_on)
);

ALTER TABLE public.scheduled_messages
  DROP CONSTRAINT IF EXISTS scheduled_messages_kind_check;
ALTER TABLE public.scheduled_messages
  ADD CONSTRAINT scheduled_messages_kind_check
  CHECK (kind IN ('drip','holiday','reminder','custom','deadline','escalation'));

ALTER TABLE public.date_reminders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS date_reminders_staff ON public.date_reminders;
CREATE POLICY date_reminders_staff ON public.date_reminders FOR ALL
  USING (firm_id = public.current_firm_id() AND public.is_staff_role())
  WITH CHECK (firm_id = public.current_firm_id() AND public.is_staff_role());
DROP POLICY IF EXISTS date_reminders_collab ON public.date_reminders;
CREATE POLICY date_reminders_collab ON public.date_reminders FOR ALL
  USING (public.can_collab_on_search(search_id))
  WITH CHECK (public.can_collab_on_search(search_id));

ALTER TABLE public.date_reminder_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS date_reminder_runs_read ON public.date_reminder_runs;
CREATE POLICY date_reminder_runs_read ON public.date_reminder_runs FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.date_reminders r
    WHERE r.id = date_reminder_runs.reminder_id
      AND r.firm_id = public.current_firm_id() AND public.is_staff_role()
  ));
