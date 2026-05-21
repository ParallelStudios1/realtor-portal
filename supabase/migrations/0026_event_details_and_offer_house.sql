-- 0026 — Event details + house-on-offer + realtor-proposed tours.

ALTER TABLE public.important_dates
  ADD COLUMN IF NOT EXISTS event_time time,
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS things_to_bring text;

ALTER TABLE public.client_searches
  ADD COLUMN IF NOT EXISTS offer_house_id uuid REFERENCES public.houses(id) ON DELETE SET NULL;

ALTER TABLE public.tour_requests
  ADD COLUMN IF NOT EXISTS realtor_proposed_when timestamptz,
  ADD COLUMN IF NOT EXISTS realtor_proposed_note text;

COMMENT ON COLUMN public.client_searches.offer_house_id IS
  'Which property the deal''s offer / contract is tied to.';
COMMENT ON COLUMN public.tour_requests.realtor_proposed_when IS
  'Set when the realtor proposes a different time than the buyer requested.';
