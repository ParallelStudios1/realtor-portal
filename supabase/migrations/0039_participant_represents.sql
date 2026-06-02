-- 0039 — deal_participants.represents: which side a co-realtor represents.
--
-- When a co-realtor is added to a deal (especially a cross-firm co-op agent),
-- they typically represent the OPPOSITE side of the transaction from the host
-- firm. This nullable column records 'buyer' or 'seller' so the deal roster
-- can show, e.g. "Co-realtor · represents seller". Only meaningful for the
-- co_realtor role; left NULL for everyone else.

ALTER TABLE public.deal_participants
  ADD COLUMN IF NOT EXISTS represents text
  CHECK (represents IN ('buyer', 'seller'));

COMMENT ON COLUMN public.deal_participants.represents IS
  'Which side of the transaction a co-realtor represents: buyer or seller. NULL for non-co_realtor parties.';
