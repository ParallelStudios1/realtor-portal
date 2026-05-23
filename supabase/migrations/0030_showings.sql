-- 0030 — Showings: actual scheduled property showings on a deal.
--
-- Where `tour_requests` is the lightweight "buyer wants to see this house"
-- signal (free-text time, no calendar shape), `showings` is the realtor-
-- driven concrete event: a fixed datetime, a duration, a location, who's
-- attending. The realtor schedules these from the deal workspace, and
-- everyone authorized on the deal sees them in the upcoming-showings list.
--
-- Lifecycle: scheduled → confirmed → completed (or canceled at any point).
--
-- Visibility:
--   - firm staff: full read/write on their firm's showings (matches the
--     same pattern as houses/important_dates).
--   - principal client of the deal: read + write on their own deal so they
--     can self-schedule a viewing the realtor created an opening for.
--   - deal_participants with can_view_dates=true: read-only (they see the
--     calendar item but can't move it).
--   - cross-firm collaborators (can_collab_on_search): full read/write so
--     a co-realtor invited from another firm can schedule showings too.

CREATE TABLE IF NOT EXISTS public.showings (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  search_id        uuid NOT NULL REFERENCES public.client_searches(id) ON DELETE CASCADE,
  house_id         uuid REFERENCES public.houses(id) ON DELETE SET NULL,
  firm_id          uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  scheduled_at     timestamptz NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 30,
  location         text,
  -- attendees: array of { name, email, phone } objects. Free-form so the
  -- realtor can add walk-ins / co-buyers without making them full users.
  attendees        jsonb NOT NULL DEFAULT '[]'::jsonb,
  status           text NOT NULL DEFAULT 'scheduled',
  notes            text,
  created_by       uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT showings_status_check CHECK (
    status IN ('scheduled', 'confirmed', 'completed', 'canceled')
  ),
  CONSTRAINT showings_duration_check CHECK (duration_minutes > 0)
);

-- Primary lookup: "upcoming showings for this firm" + per-deal sort.
CREATE INDEX IF NOT EXISTS showings_firm_scheduled_idx
  ON public.showings(firm_id, scheduled_at);

CREATE INDEX IF NOT EXISTS showings_search_id_idx
  ON public.showings(search_id);

CREATE INDEX IF NOT EXISTS showings_house_id_idx
  ON public.showings(house_id);

-- updated_at touch trigger
CREATE OR REPLACE FUNCTION public._touch_showings_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS showings_touch_updated_at ON public.showings;
CREATE TRIGGER showings_touch_updated_at
  BEFORE UPDATE ON public.showings
  FOR EACH ROW EXECUTE FUNCTION public._touch_showings_updated_at();

ALTER TABLE public.showings ENABLE ROW LEVEL SECURITY;

-- 1. Firm staff: full access on their firm's showings.
DROP POLICY IF EXISTS showings_staff_all ON public.showings;
CREATE POLICY showings_staff_all ON public.showings FOR ALL
  USING (firm_id = public.current_firm_id() AND public.is_staff_role())
  WITH CHECK (firm_id = public.current_firm_id() AND public.is_staff_role());

-- 2. Principal client of the deal: read + write on their own deal's showings.
--    Lets the buyer accept/propose times without bouncing back to the realtor
--    for every adjustment.
DROP POLICY IF EXISTS showings_principal_client_read ON public.showings;
CREATE POLICY showings_principal_client_read ON public.showings FOR SELECT
  USING (
    search_id IN (
      SELECT id FROM public.client_searches WHERE client_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS showings_principal_client_write ON public.showings;
CREATE POLICY showings_principal_client_write ON public.showings FOR ALL
  USING (
    search_id IN (
      SELECT id FROM public.client_searches WHERE client_id = auth.uid()
    )
  )
  WITH CHECK (
    search_id IN (
      SELECT id FROM public.client_searches WHERE client_id = auth.uid()
    )
  );

-- 3. Deal participants with can_view_dates=true: read-only access.
DROP POLICY IF EXISTS showings_participants_read ON public.showings;
CREATE POLICY showings_participants_read ON public.showings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.deal_participants dp
      WHERE dp.search_id = showings.search_id
        AND dp.can_view_dates = true
        AND (
          dp.user_id = auth.uid()
          OR (
            dp.external_email IS NOT NULL
            AND lower(dp.external_email) = lower(public.current_user_email())
          )
        )
    )
  );

-- 4. Cross-firm collaborators (invited realtor / co_realtor): full access.
--    Mirrors the houses_collab_write / dates_collab_write policies so the
--    guest firm's realtor can schedule showings on the host firm's deal.
DROP POLICY IF EXISTS showings_collab_write ON public.showings;
CREATE POLICY showings_collab_write ON public.showings FOR ALL
  USING (public.can_collab_on_search(search_id))
  WITH CHECK (public.can_collab_on_search(search_id));

-- Realtime: every "scheduled showing" should pop into the deal workspace
-- without a refresh. Matches the same publication used by messages /
-- activities / tour_requests / important_dates.
ALTER PUBLICATION supabase_realtime ADD TABLE public.showings;
ALTER TABLE public.showings REPLICA IDENTITY FULL;
