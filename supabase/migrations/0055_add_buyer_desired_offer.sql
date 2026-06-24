-- When a buyer says "this is the house I want", capture how much they'd like
-- to offer so the realtor sees it before submitting the real offer.
alter table public.client_searches
  add column if not exists buyer_desired_offer numeric;
