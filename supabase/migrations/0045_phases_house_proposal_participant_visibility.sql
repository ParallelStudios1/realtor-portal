-- 0045 — Phase subphases, client house-proposal, structured tour time,
--        and participant/attorney read access to e-sign envelopes.
--
-- Context for this wave:
--   * "awaiting_offer" is a new app-level phase (house agreed, no offer yet).
--     phase is a free-text column (no DB enum/CHECK), so no DDL is needed for
--     the value itself — VALID_PHASES in the app gates it.
--   * Subphases give a lightweight "where exactly are we" within a phase.
--   * The client can PROPOSE "this is the house" — that's a pending signal the
--     realtor confirms. Confirmation stamps house_agreed_* (0043) and flips the
--     deal to awaiting_offer. These columns hold the pending proposal.
--   * Tours must capture a real date+time; requested_at stores it structured so
--     we can show countdowns and time-of-day (the old preferred_when was free
--     text). preferred_when is kept for backwards-compatible display.
--   * Attorneys and other deal participants need to SEE signing links
--     (esign_envelopes) — previously only firm staff could. Documents already
--     allow attorney + participant reads.

-- 1. Subphase + client house-proposal -----------------------------------------
ALTER TABLE public.client_searches
  ADD COLUMN IF NOT EXISTS subphase text,
  ADD COLUMN IF NOT EXISTS house_proposed_house_id uuid REFERENCES public.houses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS house_proposed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS house_proposed_at timestamptz;

COMMENT ON COLUMN public.client_searches.subphase IS
  'Optional finer-grained step within the current phase (e.g. "Inspection scheduled").';
COMMENT ON COLUMN public.client_searches.house_proposed_house_id IS
  'A house the client has proposed as "the one"; awaiting realtor confirmation. On confirm, copied to offer_house_id + house_agreed_*.';

-- 2. Structured tour date+time ------------------------------------------------
ALTER TABLE public.tour_requests
  ADD COLUMN IF NOT EXISTS requested_at timestamptz;
COMMENT ON COLUMN public.tour_requests.requested_at IS
  'The concrete date+time the client wants the tour (required going forward). preferred_when kept for legacy free-text display.';

-- 3. E-sign envelopes: let deal participants + attorneys READ -----------------
--    Staff keep full write via esign_envelopes_staff. Participants (attorney,
--    client, co-realtors, sellers) get SELECT so they can open signing links.
DROP POLICY IF EXISTS esign_envelopes_participant_read ON public.esign_envelopes;
CREATE POLICY esign_envelopes_participant_read ON public.esign_envelopes FOR SELECT
  USING (
    -- principal client on the deal
    EXISTS (
      SELECT 1 FROM public.client_searches cs
      WHERE cs.id = esign_envelopes.search_id
        AND cs.client_id = auth.uid()
    )
    -- or any invited participant (attorney / co-realtor / seller / buyer)
    OR public.is_deal_participant(esign_envelopes.search_id)
  );
