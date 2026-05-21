-- 0025 — Extend the BEFORE DELETE trigger on auth.users to cover every
-- table added in migrations 0021-0024:
--
--   public.firm_invites.invited_by              (SET NULL)
--   public.client_searches.assigned_realtor_id  (SET NULL)
--   public.user_deal_views                      (CASCADE on user_id)
--   public.scheduled_messages.recipient_user_id (CASCADE)
--   public.scheduled_messages.created_by        (SET NULL)
--
-- Same deadlock-proofing trick as 0018: pre-clean leaf rows + nullify
-- non-principal refs explicitly, so the final cascade has nothing left to
-- fight realtime subscribers over.

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

  UPDATE public.client_searches  SET realtor_id          = NULL WHERE realtor_id          = v_uid;
  UPDATE public.client_searches  SET co_realtor_id       = NULL WHERE co_realtor_id       = v_uid;
  UPDATE public.client_searches  SET assigned_realtor_id = NULL WHERE assigned_realtor_id = v_uid;
  UPDATE public.deal_participants SET user_id            = NULL WHERE user_id             = v_uid;
  UPDATE public.deal_participants SET created_by         = NULL WHERE created_by          = v_uid;
  UPDATE public.important_dates   SET created_by         = NULL WHERE created_by          = v_uid;
  UPDATE public.documents         SET uploaded_by        = NULL WHERE uploaded_by         = v_uid;
  UPDATE public.firm_invites      SET invited_by         = NULL WHERE invited_by          = v_uid;
  UPDATE public.scheduled_messages SET created_by        = NULL WHERE created_by          = v_uid;

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
