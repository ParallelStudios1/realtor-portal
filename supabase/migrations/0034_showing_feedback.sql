-- 0034 — Showing feedback + seller digest tracking.
CREATE TABLE IF NOT EXISTS public.showing_feedback (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id       uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  showing_id    uuid NOT NULL REFERENCES public.showings(id) ON DELETE CASCADE,
  search_id     uuid NOT NULL REFERENCES public.client_searches(id) ON DELETE CASCADE,
  house_id      uuid REFERENCES public.houses(id) ON DELETE SET NULL,
  author_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  author_name   text,
  author_email  text,
  stars         integer CHECK (stars BETWEEN 1 AND 5),
  interest      text CHECK (interest IN ('not_interested','maybe','interested','offer_likely')),
  price_opinion text CHECK (price_opinion IN ('overpriced','about_right','underpriced')),
  liked         text,
  concerns      text,
  share_with_seller boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (showing_id, author_email)
);
CREATE INDEX IF NOT EXISTS showing_feedback_house_idx   ON public.showing_feedback(house_id);
CREATE INDEX IF NOT EXISTS showing_feedback_search_idx  ON public.showing_feedback(search_id);
CREATE INDEX IF NOT EXISTS showing_feedback_showing_idx ON public.showing_feedback(showing_id);

ALTER TABLE public.showings
  ADD COLUMN IF NOT EXISTS feedback_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS feedback_digest_sent_at timestamptz;

ALTER TABLE public.showing_feedback ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS showing_feedback_staff ON public.showing_feedback;
CREATE POLICY showing_feedback_staff ON public.showing_feedback FOR ALL
  USING (firm_id = public.current_firm_id() AND public.is_staff_role())
  WITH CHECK (firm_id = public.current_firm_id() AND public.is_staff_role());
DROP POLICY IF EXISTS showing_feedback_client_write ON public.showing_feedback;
CREATE POLICY showing_feedback_client_write ON public.showing_feedback FOR ALL
  USING (search_id IN (SELECT id FROM public.client_searches WHERE client_id = auth.uid()))
  WITH CHECK (search_id IN (SELECT id FROM public.client_searches WHERE client_id = auth.uid()));
DROP POLICY IF EXISTS showing_feedback_collab ON public.showing_feedback;
CREATE POLICY showing_feedback_collab ON public.showing_feedback FOR ALL
  USING (public.can_collab_on_search(search_id))
  WITH CHECK (public.can_collab_on_search(search_id));
