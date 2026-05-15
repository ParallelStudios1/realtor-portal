-- 0019 — Let the principal client write activity rows on their own deals.
--
-- The "new row violates row-level security" toast the client sees after
-- requesting a tour comes from the post-insert activities log call. The
-- tour itself succeeds (its own client_insert policy is fine), but the
-- activities table only allowed staff + can_collab_on_search() — clients
-- as principals fall through.

CREATE POLICY activities_principal_client_write ON public.activities
  FOR INSERT
  WITH CHECK (
    firm_id = public.current_firm_id()
    AND search_id IN (
      SELECT id FROM public.client_searches WHERE client_id = auth.uid()
    )
  );
