-- 0028 — Standalone address-book entries for a firm.
--
-- Lets a realtor stash people they care about (external co-realtors, lenders,
-- inspectors, photographers, assistants, etc.) without having to tie the
-- contact to a deal first.
--
-- The Contacts page already auto-builds from firm users + deal participants
-- + attorney rows. firm_contacts is the manual top-up: anyone who isn't
-- already on a deal but the realtor wants in their book.

CREATE TABLE IF NOT EXISTS public.firm_contacts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id    uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  name       text,
  email      text,
  phone      text,
  role       text,
  company    text,
  notes      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS firm_contacts_firm_id_idx
  ON public.firm_contacts(firm_id);

-- One contact per (firm, email) so the dedup on the Contacts page stays sane.
CREATE UNIQUE INDEX IF NOT EXISTS firm_contacts_firm_email_uniq
  ON public.firm_contacts(firm_id, lower(email))
  WHERE email IS NOT NULL;

-- updated_at touch trigger
CREATE OR REPLACE FUNCTION public._touch_firm_contacts_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS firm_contacts_touch_updated_at ON public.firm_contacts;
CREATE TRIGGER firm_contacts_touch_updated_at
  BEFORE UPDATE ON public.firm_contacts
  FOR EACH ROW EXECUTE FUNCTION public._touch_firm_contacts_updated_at();

ALTER TABLE public.firm_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "firm members read contacts" ON public.firm_contacts;
CREATE POLICY "firm members read contacts"
  ON public.firm_contacts FOR SELECT
  USING (firm_id = public.current_firm_id() AND public.is_staff_role());

DROP POLICY IF EXISTS "firm members insert contacts" ON public.firm_contacts;
CREATE POLICY "firm members insert contacts"
  ON public.firm_contacts FOR INSERT
  WITH CHECK (firm_id = public.current_firm_id() AND public.is_staff_role());

DROP POLICY IF EXISTS "firm members update contacts" ON public.firm_contacts;
CREATE POLICY "firm members update contacts"
  ON public.firm_contacts FOR UPDATE
  USING       (firm_id = public.current_firm_id() AND public.is_staff_role())
  WITH CHECK  (firm_id = public.current_firm_id() AND public.is_staff_role());

DROP POLICY IF EXISTS "firm members delete contacts" ON public.firm_contacts;
CREATE POLICY "firm members delete contacts"
  ON public.firm_contacts FOR DELETE
  USING (firm_id = public.current_firm_id() AND public.is_staff_role());

-- Extend the user pre-delete cleanup (last set in 0025) so dropping a firm
-- user nulls firm_contacts.created_by instead of failing. The contact row
-- itself survives — the firm still wants the address book.
CREATE OR REPLACE FUNCTION public._auth_user_predelete_cleanup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := OLD.id;
  v_search_ids uuid[];
BEGIN
  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[])
    INTO v_search_ids
    FROM public.client_searches
    WHERE client_id = v_uid;

  UPDATE public.client_searches   SET realtor_id          = NULL WHERE realtor_id          = v_uid;
  UPDATE public.client_searches   SET co_realtor_id       = NULL WHERE co_realtor_id       = v_uid;
  UPDATE public.client_searches   SET assigned_realtor_id = NULL WHERE assigned_realtor_id = v_uid;
  UPDATE public.deal_participants SET user_id             = NULL WHERE user_id             = v_uid;
  UPDATE public.deal_participants SET created_by          = NULL WHERE created_by          = v_uid;
  UPDATE public.important_dates   SET created_by          = NULL WHERE created_by          = v_uid;
  UPDATE public.documents         SET uploaded_by         = NULL WHERE uploaded_by         = v_uid;
  UPDATE public.firm_invites      SET invited_by          = NULL WHERE invited_by          = v_uid;
  UPDATE public.scheduled_messages SET created_by         = NULL WHERE created_by          = v_uid;
  UPDATE public.firm_contacts     SET created_by          = NULL WHERE created_by          = v_uid;

  DELETE FROM public.push_tokens        WHERE user_id           = v_uid;
  DELETE FROM public.house_ratings      WHERE client_id         = v_uid;
  DELETE FROM public.tour_requests      WHERE client_id         = v_uid;
  DELETE FROM public.messages           WHERE sender_id         = v_uid;
  DELETE FROM public.activities         WHERE actor_id          = v_uid;
  DELETE FROM public.user_deal_views    WHERE user_id           = v_uid;
  DELETE FROM public.scheduled_messages WHERE recipient_user_id = v_uid;

  IF array_length(v_search_ids, 1) > 0 THEN
    DELETE FROM public.house_ratings     WHERE search_id = ANY(v_search_ids);
    DELETE FROM public.tour_requests     WHERE search_id = ANY(v_search_ids);
    DELETE FROM public.documents         WHERE search_id = ANY(v_search_ids);
    DELETE FROM public.important_dates   WHERE search_id = ANY(v_search_ids);
    DELETE FROM public.activities        WHERE search_id = ANY(v_search_ids);
    DELETE FROM public.deal_participants WHERE search_id = ANY(v_search_ids);
    DELETE FROM public.messages          WHERE search_id = ANY(v_search_ids);
    DELETE FROM public.houses            WHERE search_id = ANY(v_search_ids);
    DELETE FROM public.user_deal_views   WHERE search_id = ANY(v_search_ids);
    DELETE FROM public.scheduled_messages WHERE search_id = ANY(v_search_ids);
    DELETE FROM public.client_searches   WHERE id = ANY(v_search_ids);
  END IF;

  DELETE FROM public.users WHERE id = v_uid;

  RETURN OLD;
END;
$$;
