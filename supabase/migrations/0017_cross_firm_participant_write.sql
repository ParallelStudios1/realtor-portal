-- 0017 — Cross-firm collaboration: an invited realtor from another firm gets
-- write access to a shared deal's data, without paying for their own
-- subscription. Gate the write with can_collab_on_search(deal_id) — true
-- when there's a deal_participants row for the caller with role=realtor
-- or co_realtor.

CREATE OR REPLACE FUNCTION public.can_collab_on_search(p_search_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.deal_participants dp
    WHERE dp.search_id = p_search_id
      AND dp.role IN ('realtor', 'co_realtor')
      AND (
        dp.user_id = auth.uid()
        OR (dp.external_email IS NOT NULL
            AND lower(dp.external_email) = lower(public.current_user_email()))
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_collab_on_search(uuid) TO authenticated;

DROP POLICY IF EXISTS houses_collab_write ON public.houses;
CREATE POLICY houses_collab_write ON public.houses FOR ALL
  USING (public.can_collab_on_search(search_id))
  WITH CHECK (public.can_collab_on_search(search_id));

DROP POLICY IF EXISTS messages_collab_insert ON public.messages;
CREATE POLICY messages_collab_insert ON public.messages FOR INSERT
  WITH CHECK (sender_id = auth.uid() AND public.can_collab_on_search(search_id));

DROP POLICY IF EXISTS messages_collab_read ON public.messages;
CREATE POLICY messages_collab_read ON public.messages FOR SELECT
  USING (public.can_collab_on_search(search_id));

DROP POLICY IF EXISTS dates_collab_write ON public.important_dates;
CREATE POLICY dates_collab_write ON public.important_dates FOR ALL
  USING (public.can_collab_on_search(search_id))
  WITH CHECK (public.can_collab_on_search(search_id));

DROP POLICY IF EXISTS documents_collab_write ON public.documents;
CREATE POLICY documents_collab_write ON public.documents FOR ALL
  USING (public.can_collab_on_search(search_id))
  WITH CHECK (public.can_collab_on_search(search_id));

DROP POLICY IF EXISTS activities_collab_write ON public.activities;
CREATE POLICY activities_collab_write ON public.activities FOR INSERT
  WITH CHECK (public.can_collab_on_search(search_id));

DROP POLICY IF EXISTS searches_collab_read ON public.client_searches;
CREATE POLICY searches_collab_read ON public.client_searches FOR SELECT
  USING (public.can_collab_on_search(id));
