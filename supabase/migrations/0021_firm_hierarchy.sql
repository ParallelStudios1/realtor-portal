-- 0021 — Multi-realtor firm hierarchy, part 2 (helpers + invites table).
--
-- Now that owner / manager / agent exist on user_role, extend is_staff_role()
-- to recognize them. Add a separate is_firm_admin() helper for screens that
-- need elevated permission (Firm Control page, billing, deleting agents).

CREATE OR REPLACE FUNCTION public.is_staff_role()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid()
      AND role IN ('realtor', 'firm_admin', 'super_admin', 'owner', 'manager', 'agent')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_firm_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid()
      AND role IN ('owner','firm_admin','super_admin')
  );
$$;

CREATE TABLE IF NOT EXISTS public.firm_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  email text NOT NULL,
  role public.user_role NOT NULL,
  invited_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  full_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  CONSTRAINT firm_invites_role_ck CHECK (
    role IN ('owner','firm_admin','manager','realtor','agent')
  ),
  UNIQUE (firm_id, email)
);
CREATE INDEX IF NOT EXISTS firm_invites_email_idx ON public.firm_invites (lower(email));

ALTER TABLE public.firm_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS firm_invites_staff ON public.firm_invites;
CREATE POLICY firm_invites_staff ON public.firm_invites FOR ALL
  USING (firm_id = public.current_firm_id() AND public.is_staff_role())
  WITH CHECK (firm_id = public.current_firm_id() AND public.is_staff_role());

ALTER TABLE public.client_searches
  ADD COLUMN IF NOT EXISTS assigned_realtor_id uuid
    REFERENCES public.users(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='firm_invites'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.firm_invites;
  END IF;
END
$$;
