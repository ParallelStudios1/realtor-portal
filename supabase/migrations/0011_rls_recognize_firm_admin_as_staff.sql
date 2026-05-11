-- 0011 — Recognize firm_admin + super_admin as staff in RLS.
--
-- Every realtor-side RLS policy was gating on `current_role() = 'realtor'`,
-- which silently locked out every firm_admin and super_admin. Symptom:
-- nothing visible or writable for those roles — no searches, no houses,
-- no messages, no docs, no tours, no activities.
--
-- Also relax users SELECT to "self OR same-firm" so the AuthProvider can
-- always load its own row regardless of firm bootstrap state.

-- 1. New staff helper (covers realtor + firm_admin + super_admin).
CREATE OR REPLACE FUNCTION public.is_staff_role()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid()
      AND role IN ('realtor', 'firm_admin', 'super_admin')
  );
$$;

-- 2. users — always allow reading own row (in case firm_id is null mid-bootstrap).
DROP POLICY IF EXISTS users_read_same_firm ON public.users;
DROP POLICY IF EXISTS users_read_self_or_firm ON public.users;
CREATE POLICY users_read_self_or_firm ON public.users FOR SELECT
  USING (id = auth.uid() OR firm_id = public.current_firm_id());

-- 3. client_searches
DROP POLICY IF EXISTS searches_read ON public.client_searches;
CREATE POLICY searches_read ON public.client_searches FOR SELECT
  USING (
    firm_id = public.current_firm_id()
    AND (public.is_staff_role() OR client_id = auth.uid())
  );

DROP POLICY IF EXISTS searches_realtor_write ON public.client_searches;
DROP POLICY IF EXISTS searches_staff_write ON public.client_searches;
CREATE POLICY searches_staff_write ON public.client_searches FOR ALL
  USING (firm_id = public.current_firm_id() AND public.is_staff_role())
  WITH CHECK (firm_id = public.current_firm_id() AND public.is_staff_role());

-- 4. houses
DROP POLICY IF EXISTS houses_read ON public.houses;
CREATE POLICY houses_read ON public.houses FOR SELECT
  USING (
    firm_id = public.current_firm_id()
    AND (
      public.is_staff_role()
      OR search_id IN (SELECT id FROM public.client_searches WHERE client_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS houses_realtor_write ON public.houses;
DROP POLICY IF EXISTS houses_staff_write ON public.houses;
CREATE POLICY houses_staff_write ON public.houses FOR ALL
  USING (firm_id = public.current_firm_id() AND public.is_staff_role())
  WITH CHECK (firm_id = public.current_firm_id() AND public.is_staff_role());

-- 5. documents
DROP POLICY IF EXISTS documents_read ON public.documents;
CREATE POLICY documents_read ON public.documents FOR SELECT
  USING (
    firm_id = public.current_firm_id()
    AND (
      public.is_staff_role()
      OR search_id IN (SELECT id FROM public.client_searches WHERE client_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS documents_realtor_write ON public.documents;
DROP POLICY IF EXISTS documents_staff_write ON public.documents;
CREATE POLICY documents_staff_write ON public.documents FOR ALL
  USING (firm_id = public.current_firm_id() AND public.is_staff_role())
  WITH CHECK (firm_id = public.current_firm_id() AND public.is_staff_role());

-- 6. activities
DROP POLICY IF EXISTS activities_read ON public.activities;
CREATE POLICY activities_read ON public.activities FOR SELECT
  USING (
    firm_id = public.current_firm_id()
    AND (
      public.is_staff_role()
      OR search_id IN (SELECT id FROM public.client_searches WHERE client_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS activities_realtor_write ON public.activities;
DROP POLICY IF EXISTS activities_staff_write ON public.activities;
CREATE POLICY activities_staff_write ON public.activities FOR INSERT
  WITH CHECK (firm_id = public.current_firm_id() AND public.is_staff_role());

-- 7. messages
DROP POLICY IF EXISTS messages_read ON public.messages;
CREATE POLICY messages_read ON public.messages FOR SELECT
  USING (
    firm_id = public.current_firm_id()
    AND (
      public.is_staff_role()
      OR search_id IN (SELECT id FROM public.client_searches WHERE client_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS messages_insert ON public.messages;
CREATE POLICY messages_insert ON public.messages FOR INSERT
  WITH CHECK (
    firm_id = public.current_firm_id()
    AND sender_id = auth.uid()
    AND (
      public.is_staff_role()
      OR search_id IN (SELECT id FROM public.client_searches WHERE client_id = auth.uid())
    )
  );

-- 8. tour_requests
DROP POLICY IF EXISTS tour_requests_read ON public.tour_requests;
CREATE POLICY tour_requests_read ON public.tour_requests FOR SELECT
  USING (
    firm_id = public.current_firm_id()
    AND (public.is_staff_role() OR client_id = auth.uid())
  );

DROP POLICY IF EXISTS tour_requests_realtor_update ON public.tour_requests;
DROP POLICY IF EXISTS tour_requests_staff_update ON public.tour_requests;
CREATE POLICY tour_requests_staff_update ON public.tour_requests FOR UPDATE
  USING (firm_id = public.current_firm_id() AND public.is_staff_role())
  WITH CHECK (firm_id = public.current_firm_id() AND public.is_staff_role());

-- 9. important_dates
DROP POLICY IF EXISTS dates_read ON public.important_dates;
CREATE POLICY dates_read ON public.important_dates FOR SELECT
  USING (
    firm_id = public.current_firm_id()
    AND (
      public.is_staff_role()
      OR search_id IN (SELECT id FROM public.client_searches WHERE client_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS dates_realtor_write ON public.important_dates;
DROP POLICY IF EXISTS dates_staff_write ON public.important_dates;
CREATE POLICY dates_staff_write ON public.important_dates FOR ALL
  USING (firm_id = public.current_firm_id() AND public.is_staff_role())
  WITH CHECK (firm_id = public.current_firm_id() AND public.is_staff_role());

-- 10. house_ratings (read needs widening; client_write already correct).
DROP POLICY IF EXISTS ratings_read ON public.house_ratings;
CREATE POLICY ratings_read ON public.house_ratings FOR SELECT
  USING (
    firm_id = public.current_firm_id()
    AND (public.is_staff_role() OR client_id = auth.uid())
  );
