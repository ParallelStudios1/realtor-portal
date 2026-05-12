-- 0013 — Add financial / contract metadata fields to client_searches.
-- Realtor records these from the rich client-detail page so the client
-- can see closing amount, earnest money, agreed price, etc.

ALTER TABLE public.client_searches
  ADD COLUMN IF NOT EXISTS agreed_price numeric,
  ADD COLUMN IF NOT EXISTS closing_amount numeric,
  ADD COLUMN IF NOT EXISTS earnest_money numeric,
  ADD COLUMN IF NOT EXISTS commission_pct numeric,
  ADD COLUMN IF NOT EXISTS contract_url text,
  ADD COLUMN IF NOT EXISTS contract_signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS notes text;
