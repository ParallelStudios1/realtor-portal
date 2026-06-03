-- 0043 — Client↔realtor agreement on the chosen house.
-- The chosen house is client_searches.offer_house_id; these stamp WHEN and
-- by WHOM it was agreed, so both sides see a confirmed "the house" decision.
ALTER TABLE public.client_searches
  ADD COLUMN IF NOT EXISTS house_agreed_at timestamptz,
  ADD COLUMN IF NOT EXISTS house_agreed_by uuid REFERENCES public.users(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.client_searches.house_agreed_at IS
  'Set when the client and realtor have agreed on which house (offer_house_id) the deal is for.';
