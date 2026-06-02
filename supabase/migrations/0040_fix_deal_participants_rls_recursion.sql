-- 0040 — Fix infinite recursion in deal_participants RLS (Postgres 42P17).
-- The old deal_participants_self_read policy subqueried deal_participants
-- inside its own USING clause. Because Postgres ORs all policies on a table,
-- that single recursive policy made EVERY select on deal_participants fail,
-- so participant rosters silently rendered empty everywhere.
-- Replace the inline self-subquery with a SECURITY DEFINER helper that
-- bypasses RLS and therefore cannot recurse.

CREATE OR REPLACE FUNCTION public.is_deal_participant(p_search_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.deal_participants dp
    WHERE dp.search_id = p_search_id
      AND (
        dp.user_id = auth.uid()
        OR (dp.external_email IS NOT NULL
            AND lower(dp.external_email) = lower(public.current_user_email()))
      )
  );
$$;

DROP POLICY IF EXISTS deal_participants_self_read ON public.deal_participants;
CREATE POLICY deal_participants_self_read ON public.deal_participants FOR SELECT
  USING (
    user_id = auth.uid()
    OR (external_email IS NOT NULL
        AND lower(external_email) = lower(public.current_user_email()))
    OR public.is_deal_participant(search_id)
  );
