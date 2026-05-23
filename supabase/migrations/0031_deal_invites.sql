-- 0031 — deal_invites: first-class invite tokens.
--
-- Every Add Party with contact info writes a row here. The link sent to
-- the recipient is /invite/<token>, which serves a branded role-aware
-- landing — no Supabase email or magic-link dependency.

CREATE TABLE IF NOT EXISTS public.deal_invites (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token        uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  search_id    uuid NOT NULL REFERENCES public.client_searches(id) ON DELETE CASCADE,
  firm_id      uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  participant_id uuid REFERENCES public.deal_participants(id) ON DELETE SET NULL,
  role         text NOT NULL,
  name         text,
  email        text,
  phone        text,
  created_by   uuid REFERENCES public.users(id) ON DELETE SET NULL,
  accepted_at  timestamptz,
  accepted_by  uuid REFERENCES public.users(id) ON DELETE SET NULL,
  expires_at   timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS deal_invites_token_idx ON public.deal_invites(token);
CREATE INDEX IF NOT EXISTS deal_invites_search_id_idx ON public.deal_invites(search_id);
CREATE INDEX IF NOT EXISTS deal_invites_email_idx
  ON public.deal_invites(lower(email)) WHERE email IS NOT NULL;

CREATE OR REPLACE FUNCTION public._touch_deal_invites_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS deal_invites_touch_updated_at ON public.deal_invites;
CREATE TRIGGER deal_invites_touch_updated_at
  BEFORE UPDATE ON public.deal_invites
  FOR EACH ROW EXECUTE FUNCTION public._touch_deal_invites_updated_at();

ALTER TABLE public.deal_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deal_invites_staff_all ON public.deal_invites;
CREATE POLICY deal_invites_staff_all ON public.deal_invites FOR ALL
  USING (firm_id = public.current_firm_id() AND public.is_staff_role())
  WITH CHECK (firm_id = public.current_firm_id() AND public.is_staff_role());

DROP POLICY IF EXISTS deal_invites_recipient_read ON public.deal_invites;
CREATE POLICY deal_invites_recipient_read ON public.deal_invites FOR SELECT
  USING (
    accepted_by = auth.uid()
    OR (email IS NOT NULL AND lower(email) = lower(public.current_user_email()))
  );

ALTER PUBLICATION supabase_realtime ADD TABLE public.deal_invites;
ALTER TABLE public.deal_invites REPLICA IDENTITY FULL;
