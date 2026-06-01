-- 0036 — Compliance: doc checklists + approval gate, retention (audit_log is 0035).
CREATE TABLE IF NOT EXISTS public.checklist_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id     uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  deal_kind   text NOT NULL CHECK (deal_kind IN ('buyer','seller','both')),
  label       text NOT NULL,
  doc_folder  text,
  required    boolean NOT NULL DEFAULT true,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS checklist_templates_firm_idx ON public.checklist_templates(firm_id, deal_kind);

CREATE TABLE IF NOT EXISTS public.deal_checklist_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id       uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  search_id     uuid NOT NULL REFERENCES public.client_searches(id) ON DELETE CASCADE,
  template_id   uuid REFERENCES public.checklist_templates(id) ON DELETE SET NULL,
  label         text NOT NULL,
  required      boolean NOT NULL DEFAULT true,
  document_id   uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  status        text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','provided','waived','n_a')),
  waived_reason text,
  updated_by    uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (search_id, label)
);
CREATE INDEX IF NOT EXISTS deal_checklist_items_search_idx ON public.deal_checklist_items(search_id);

CREATE TABLE IF NOT EXISTS public.deal_approvals (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id      uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  search_id    uuid NOT NULL REFERENCES public.client_searches(id) ON DELETE CASCADE,
  gate         text NOT NULL DEFAULT 'file_complete'
                  CHECK (gate IN ('file_complete','pre_close','closed')),
  status       text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','approved','rejected')),
  decided_by   uuid REFERENCES public.users(id) ON DELETE SET NULL,
  decided_at   timestamptz,
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (search_id, gate)
);
CREATE INDEX IF NOT EXISTS deal_approvals_search_idx ON public.deal_approvals(search_id);

ALTER TABLE public.client_searches
  ADD COLUMN IF NOT EXISTS closed_at        timestamptz,
  ADD COLUMN IF NOT EXISTS retention_until  date,
  ADD COLUMN IF NOT EXISTS file_locked      boolean NOT NULL DEFAULT false;
ALTER TABLE public.firms
  ADD COLUMN IF NOT EXISTS retention_years  integer NOT NULL DEFAULT 7;

ALTER TABLE public.checklist_templates  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_approvals       ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS checklist_templates_admin ON public.checklist_templates;
CREATE POLICY checklist_templates_admin ON public.checklist_templates FOR ALL
  USING (firm_id = public.current_firm_id() AND public.is_firm_admin())
  WITH CHECK (firm_id = public.current_firm_id() AND public.is_firm_admin());
DROP POLICY IF EXISTS checklist_templates_read ON public.checklist_templates;
CREATE POLICY checklist_templates_read ON public.checklist_templates FOR SELECT
  USING (firm_id = public.current_firm_id() AND public.is_staff_role());

DROP POLICY IF EXISTS deal_checklist_items_staff ON public.deal_checklist_items;
CREATE POLICY deal_checklist_items_staff ON public.deal_checklist_items FOR ALL
  USING (firm_id = public.current_firm_id() AND public.is_staff_role())
  WITH CHECK (firm_id = public.current_firm_id() AND public.is_staff_role());

DROP POLICY IF EXISTS deal_approvals_read ON public.deal_approvals;
CREATE POLICY deal_approvals_read ON public.deal_approvals FOR SELECT
  USING (firm_id = public.current_firm_id() AND public.is_staff_role());
DROP POLICY IF EXISTS deal_approvals_broker_write ON public.deal_approvals;
CREATE POLICY deal_approvals_broker_write ON public.deal_approvals FOR ALL
  USING (firm_id = public.current_firm_id() AND public.is_firm_admin())
  WITH CHECK (firm_id = public.current_firm_id() AND public.is_firm_admin());
