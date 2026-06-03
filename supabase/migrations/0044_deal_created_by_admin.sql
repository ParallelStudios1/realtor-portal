-- 0044 — Deal admin: the user who created the deal has full control.
ALTER TABLE public.client_searches
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.users(id) ON DELETE SET NULL;
-- Backfill existing deals: the assigned/owning realtor is the de-facto admin.
UPDATE public.client_searches
  SET created_by = COALESCE(realtor_id, assigned_realtor_id)
  WHERE created_by IS NULL;
COMMENT ON COLUMN public.client_searches.created_by IS
  'The user who created the deal — the deal admin, with full control over it.';
