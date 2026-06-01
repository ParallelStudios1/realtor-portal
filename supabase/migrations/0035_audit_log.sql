-- 0035 — Append-only audit log (compliance Phase 0 foundation).
CREATE TABLE IF NOT EXISTS public.audit_log (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  firm_id      uuid REFERENCES public.firms(id) ON DELETE SET NULL,
  search_id    uuid,
  actor_user_id uuid,
  actor_email  text,
  actor_role   text,
  action       text NOT NULL,
  entity_type  text,
  entity_id    text,
  summary      text,
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip           inet,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_log_firm_created_idx ON public.audit_log(firm_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_search_idx ON public.audit_log(search_id);

CREATE OR REPLACE FUNCTION public._audit_log_no_mutate()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END;
$$;
DROP TRIGGER IF EXISTS audit_log_block_update ON public.audit_log;
CREATE TRIGGER audit_log_block_update BEFORE UPDATE OR DELETE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public._audit_log_no_mutate();

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_log_broker_read ON public.audit_log;
CREATE POLICY audit_log_broker_read ON public.audit_log FOR SELECT
  USING (firm_id = public.current_firm_id() AND public.is_firm_admin());
