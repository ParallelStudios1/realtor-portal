-- 0037 — DocuSign envelope tracking.
CREATE TABLE IF NOT EXISTS public.esign_envelopes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id        uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  search_id      uuid NOT NULL REFERENCES public.client_searches(id) ON DELETE CASCADE,
  document_id    uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  provider       text NOT NULL DEFAULT 'docusign',
  envelope_id    text NOT NULL,
  envelope_url   text,
  status         text NOT NULL DEFAULT 'sent'
                   CHECK (status IN ('created','sent','delivered','completed','declined','voided')),
  recipients     jsonb NOT NULL DEFAULT '[]'::jsonb,
  completed_at   timestamptz,
  created_by     uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, envelope_id)
);
CREATE INDEX IF NOT EXISTS esign_envelopes_search_idx ON public.esign_envelopes(search_id);
ALTER TABLE public.esign_envelopes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS esign_envelopes_staff ON public.esign_envelopes;
CREATE POLICY esign_envelopes_staff ON public.esign_envelopes FOR ALL
  USING (firm_id = public.current_firm_id() AND public.is_staff_role())
  WITH CHECK (firm_id = public.current_firm_id() AND public.is_staff_role());
