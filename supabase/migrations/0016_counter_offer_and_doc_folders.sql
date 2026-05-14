-- 0016 — Add 'counter_offer' deal phase between offer_made and under_contract,
-- and a `folder` column on documents so the realtor can group them
-- (Contracts / Disclosures / Inspection / Lender / Closing / etc.).

ALTER TYPE public.deal_phase ADD VALUE IF NOT EXISTS 'counter_offer' BEFORE 'under_contract';

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS folder text NOT NULL DEFAULT 'General';
CREATE INDEX IF NOT EXISTS documents_search_folder_idx
  ON public.documents(search_id, folder);
