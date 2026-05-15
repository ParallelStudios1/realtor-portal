-- 0022 — Track the most recent phase each user has actually seen for each
-- deal so the mobile client app can fire a one-time celebration modal when
-- the realtor moves the phase forward.
--
-- A row exists per (user_id, search_id). We update last_seen_phase when the
-- client opens the deal in mobile (an explicit RPC call so we don't have
-- to ship the same write across every client surface).

CREATE TABLE IF NOT EXISTS public.user_deal_views (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  search_id uuid NOT NULL REFERENCES public.client_searches(id) ON DELETE CASCADE,
  last_seen_phase text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, search_id)
);

ALTER TABLE public.user_deal_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_deal_views_self ON public.user_deal_views FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.mark_deal_phase_seen(p_search_id uuid, p_phase text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_deal_views (user_id, search_id, last_seen_phase)
  VALUES (auth.uid(), p_search_id, p_phase)
  ON CONFLICT (user_id, search_id) DO UPDATE
    SET last_seen_phase = EXCLUDED.last_seen_phase,
        last_seen_at = now();
END
$$;

REVOKE ALL ON FUNCTION public.mark_deal_phase_seen(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.mark_deal_phase_seen(uuid, text) TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.user_deal_views;
