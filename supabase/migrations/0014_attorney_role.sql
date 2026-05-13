-- 0014 — Attorney role + RLS so attorneys can read the deals they're on.
-- An attorney is invited to a deal by the realtor (sets attorney_email on
-- client_searches). When that person logs in with a matching email, they
-- see a read-only view of every deal they're attached to.

ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'attorney';

CREATE OR REPLACE FUNCTION public.current_user_email()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email FROM public.users WHERE id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.current_user_email() TO authenticated;

-- Attorneys can read deals attached to their email.
DROP POLICY IF EXISTS searches_attorney_read ON public.client_searches;
CREATE POLICY searches_attorney_read ON public.client_searches FOR SELECT
  USING (
    attorney_email IS NOT NULL
    AND lower(attorney_email) = lower(public.current_user_email())
  );

DROP POLICY IF EXISTS documents_attorney_read ON public.documents;
CREATE POLICY documents_attorney_read ON public.documents FOR SELECT
  USING (
    search_id IN (
      SELECT id FROM public.client_searches
      WHERE attorney_email IS NOT NULL
        AND lower(attorney_email) = lower(public.current_user_email())
    )
  );

DROP POLICY IF EXISTS dates_attorney_read ON public.important_dates;
CREATE POLICY dates_attorney_read ON public.important_dates FOR SELECT
  USING (
    search_id IN (
      SELECT id FROM public.client_searches
      WHERE attorney_email IS NOT NULL
        AND lower(attorney_email) = lower(public.current_user_email())
    )
  );

DROP POLICY IF EXISTS messages_attorney_read ON public.messages;
CREATE POLICY messages_attorney_read ON public.messages FOR SELECT
  USING (
    search_id IN (
      SELECT id FROM public.client_searches
      WHERE attorney_email IS NOT NULL
        AND lower(attorney_email) = lower(public.current_user_email())
    )
  );
