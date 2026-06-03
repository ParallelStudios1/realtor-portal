-- 0041 — Two-sided deals: per-house seller info + house-scoped participant visibility.
ALTER TABLE public.houses
  ADD COLUMN IF NOT EXISTS seller_name           text,
  ADD COLUMN IF NOT EXISTS seller_email          text,
  ADD COLUMN IF NOT EXISTS seller_realtor_name   text,
  ADD COLUMN IF NOT EXISTS seller_realtor_email  text,
  ADD COLUMN IF NOT EXISTS seller_realtor_firm   text,
  ADD COLUMN IF NOT EXISTS is_under_contract     boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.houses.seller_realtor_email IS
  'Listing agent on the other side of the transaction for this property (buyer-deal houses).';

ALTER TABLE public.deal_participants
  ADD COLUMN IF NOT EXISTS house_id uuid REFERENCES public.houses(id) ON DELETE CASCADE;
COMMENT ON COLUMN public.deal_participants.house_id IS
  'When set, this party is scoped to a single house (the transacted property) and must not see the buyer''s other candidate houses.';
CREATE INDEX IF NOT EXISTS deal_participants_house_idx ON public.deal_participants(house_id);
