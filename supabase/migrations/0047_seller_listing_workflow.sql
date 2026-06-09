-- 0047 — Seller / listing-agent workflow.
--
-- Most realtors are listing agents (they represent the seller). The buyer flow
-- treats a house as something the client is *considering*; for a listing, the
-- house is the product being SOLD. These columns + the listing_offers table
-- give listing agents what they actually need: a listing status, MLS #, list
-- date, commission, and a place to track offers received from buyers.

-- 1. Listing fields on houses --------------------------------------------------
ALTER TABLE public.houses
  ADD COLUMN IF NOT EXISTS listing_status text,   -- coming_soon|active|under_contract|pending|sold|withdrawn
  ADD COLUMN IF NOT EXISTS mls_number text,
  ADD COLUMN IF NOT EXISTS listed_at date,
  ADD COLUMN IF NOT EXISTS commission_pct numeric,
  ADD COLUMN IF NOT EXISTS sold_price numeric,
  ADD COLUMN IF NOT EXISTS sold_at date;

COMMENT ON COLUMN public.houses.listing_status IS
  'Listing lifecycle for seller deals: coming_soon|active|under_contract|pending|sold|withdrawn.';

-- 2. Offers received on a listing ---------------------------------------------
CREATE TABLE IF NOT EXISTS public.listing_offers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id       uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  search_id     uuid NOT NULL REFERENCES public.client_searches(id) ON DELETE CASCADE,
  house_id      uuid REFERENCES public.houses(id) ON DELETE SET NULL,
  buyer_name    text,
  buyer_agent   text,
  amount        numeric,
  earnest_money numeric,
  financing     text,        -- cash|conventional|fha|va|other
  status        text NOT NULL DEFAULT 'received'
                  CHECK (status IN ('received','countered','accepted','rejected','withdrawn')),
  offer_date    date,
  notes         text,
  created_by    uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS listing_offers_search_idx ON public.listing_offers(search_id);
CREATE INDEX IF NOT EXISTS listing_offers_house_idx ON public.listing_offers(house_id);

ALTER TABLE public.listing_offers ENABLE ROW LEVEL SECURITY;

-- Firm staff manage offers on their deals.
DROP POLICY IF EXISTS listing_offers_staff ON public.listing_offers;
CREATE POLICY listing_offers_staff ON public.listing_offers FOR ALL
  USING (firm_id = public.current_firm_id() AND public.is_staff_role())
  WITH CHECK (firm_id = public.current_firm_id() AND public.is_staff_role());

-- The principal seller client + deal participants (the seller) can READ the
-- offers on their own listing.
DROP POLICY IF EXISTS listing_offers_participant_read ON public.listing_offers;
CREATE POLICY listing_offers_participant_read ON public.listing_offers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.client_searches cs
      WHERE cs.id = listing_offers.search_id
        AND cs.client_id = auth.uid()
    )
    OR public.is_deal_participant(listing_offers.search_id)
  );
