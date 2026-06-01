-- 0038 — AI contract extraction proposals (staged, never auto-applied).
CREATE TABLE IF NOT EXISTS public.contract_extractions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id      uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  search_id    uuid NOT NULL REFERENCES public.client_searches(id) ON DELETE CASCADE,
  document_id  uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  status       text NOT NULL DEFAULT 'proposed'
                 CHECK (status IN ('proposed','confirmed','discarded')),
  raw          jsonb NOT NULL DEFAULT '{}'::jsonb,
  proposed_dates    jsonb NOT NULL DEFAULT '[]'::jsonb,
  proposed_parties  jsonb NOT NULL DEFAULT '[]'::jsonb,
  contingencies     jsonb NOT NULL DEFAULT '[]'::jsonb,
  confirmed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  confirmed_at timestamptz,
  created_by   uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contract_extractions_search_idx ON public.contract_extractions(search_id);
ALTER TABLE public.contract_extractions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS contract_extractions_staff ON public.contract_extractions;
CREATE POLICY contract_extractions_staff ON public.contract_extractions FOR ALL
  USING (firm_id = public.current_firm_id() AND public.is_staff_role())
  WITH CHECK (firm_id = public.current_firm_id() AND public.is_staff_role());
