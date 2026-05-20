-- 0024 — Firms can rename phase labels, users can opt into SMS, and
-- realtors can schedule future messages (post-closing drips, holidays,
-- check-ins).

ALTER TABLE public.firms
  ADD COLUMN IF NOT EXISTS phase_labels jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS phase_messages jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.firms.phase_labels IS
  'Per-firm overrides for phase display names, e.g. {"offer_made":"Bid in"}.';
COMMENT ON COLUMN public.firms.phase_messages IS
  'Per-firm overrides for the canned celebration messages we send on phase change.';

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS sms_opt_in boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.scheduled_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  search_id uuid REFERENCES public.client_searches(id) ON DELETE CASCADE,
  recipient_user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  recipient_email text,
  channel text NOT NULL DEFAULT 'in_app' CHECK (
    channel IN ('in_app','email','sms')
  ),
  kind text NOT NULL CHECK (
    kind IN ('drip','holiday','reminder','custom')
  ),
  scheduled_for timestamptz NOT NULL,
  subject text,
  body text NOT NULL,
  sent_at timestamptz,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS scheduled_messages_due_idx
  ON public.scheduled_messages (scheduled_for) WHERE sent_at IS NULL;

ALTER TABLE public.scheduled_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY scheduled_messages_staff ON public.scheduled_messages FOR ALL
  USING (firm_id = public.current_firm_id() AND public.is_staff_role())
  WITH CHECK (firm_id = public.current_firm_id() AND public.is_staff_role());

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public'
      AND tablename='scheduled_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.scheduled_messages;
  END IF;
END
$$;
