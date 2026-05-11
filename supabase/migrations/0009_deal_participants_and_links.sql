-- 0009 — Add external attorney, co-realtor, DocuSign envelope link to deals.
-- These are optional metadata that lets a realtor track everyone touching a
-- deal without forcing each participant to be a full user.

ALTER TABLE public.client_searches
  ADD COLUMN IF NOT EXISTS co_realtor_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS attorney_name text,
  ADD COLUMN IF NOT EXISTS attorney_email text,
  ADD COLUMN IF NOT EXISTS attorney_phone text,
  ADD COLUMN IF NOT EXISTS docusign_envelope_url text;

COMMENT ON COLUMN public.activities.action IS
  'phase_change | house_added | tour_requested | tour_confirmed | tour_declined | document_uploaded | important_date_added | alert | attorney_added | co_realtor_added | docusign_linked | message';
