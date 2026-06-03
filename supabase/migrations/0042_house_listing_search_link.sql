-- 0042 — Link a buyer-deal house to the other side's seller (listing) deal when both run in-app.
ALTER TABLE public.houses
  ADD COLUMN IF NOT EXISTS listing_search_id uuid REFERENCES public.client_searches(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.houses.listing_search_id IS
  'When the selling side runs this property as a seller deal in-app, links this buyer-deal house to that seller (listing) deal so both sides see the transaction.';
CREATE INDEX IF NOT EXISTS houses_listing_search_idx ON public.houses(listing_search_id);
