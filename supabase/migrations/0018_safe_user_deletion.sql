-- 0018 — Make user deletion deadlock-proof.
--
-- The Supabase dashboard's "Delete user" button calls
--   DELETE FROM auth.users WHERE id = $1
-- which cascades through:
--   auth.users  → public.users        (CASCADE)
--   public.users → public.client_searches (CASCADE, via client_id)
--   public.users → public.messages         (CASCADE, via sender_id)
--   public.users → public.activities       (CASCADE, via actor_id)
--   public.users → public.tour_requests    (CASCADE, via client_id)
--   public.users → public.house_ratings    (CASCADE, via client_id)
--   public.users → public.push_tokens      (CASCADE, via user_id)
--   public.client_searches → 8 child tables (CASCADE each)
--
-- Concurrent realtime subscriptions hold brief SHARE locks on those child
-- rows. The single-statement cascade ends up racing with them and Postgres
-- aborts with `deadlock detected`.
--
-- Fix: BEFORE DELETE trigger on auth.users that pre-deletes child rows
-- explicitly, in a deterministic order, from leaves toward roots. By the
-- time the actual CASCADE fires there's nothing left to race over.
--
-- The trigger function is SECURITY DEFINER so it can act across schemas
-- and ignore RLS.

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
  -- Capture every search this user is the principal CLIENT on. Their
  -- entire deal trees go with them.
  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[])
    INTO v_search_ids
    FROM public.client_searches
    WHERE client_id = v_uid;

  -- 1. Detach the user from anywhere they're a non-principal reference
  --    (realtor, co-realtor, attorney via deal_participants, document
  --    uploader, important-date creator). These are SET NULL FKs so the
  --    delete would also work, but doing it explicitly avoids the cascade
  --    racing with realtime SUBSCRIBE locks on the same rows.
  UPDATE public.client_searches SET realtor_id    = NULL WHERE realtor_id    = v_uid;
  UPDATE public.client_searches SET co_realtor_id = NULL WHERE co_realtor_id = v_uid;
  UPDATE public.deal_participants SET user_id     = NULL WHERE user_id     = v_uid;
  UPDATE public.deal_participants SET created_by  = NULL WHERE created_by  = v_uid;
  UPDATE public.important_dates    SET created_by  = NULL WHERE created_by  = v_uid;
  UPDATE public.documents          SET uploaded_by = NULL WHERE uploaded_by = v_uid;

  -- 2. Leaf-first deletes of rows that point directly at the user.
  --    push_tokens is high-traffic — kill it first.
  DELETE FROM public.push_tokens    WHERE user_id   = v_uid;
  DELETE FROM public.house_ratings  WHERE client_id = v_uid;
  DELETE FROM public.tour_requests  WHERE client_id = v_uid;
  DELETE FROM public.messages       WHERE sender_id = v_uid;
  DELETE FROM public.activities     WHERE actor_id  = v_uid;

  -- 3. For every search where this user was the principal client, wipe
  --    the entire deal tree leaf-first BEFORE the cascade attempts it.
  IF array_length(v_search_ids, 1) > 0 THEN
    DELETE FROM public.house_ratings   WHERE search_id = ANY(v_search_ids);
    DELETE FROM public.tour_requests   WHERE search_id = ANY(v_search_ids);
    DELETE FROM public.documents       WHERE search_id = ANY(v_search_ids);
    DELETE FROM public.important_dates WHERE search_id = ANY(v_search_ids);
    DELETE FROM public.activities      WHERE search_id = ANY(v_search_ids);
    DELETE FROM public.deal_participants WHERE search_id = ANY(v_search_ids);
    DELETE FROM public.messages        WHERE search_id = ANY(v_search_ids);
    DELETE FROM public.houses          WHERE search_id = ANY(v_search_ids);
    DELETE FROM public.client_searches WHERE id = ANY(v_search_ids);
  END IF;

  -- 4. Delete the public.users row explicitly so the auth.users cascade
  --    becomes trivial.
  DELETE FROM public.users WHERE id = v_uid;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS auth_user_predelete_cleanup ON auth.users;
CREATE TRIGGER auth_user_predelete_cleanup
  BEFORE DELETE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public._auth_user_predelete_cleanup();

-- Convenience entry point so we can also fire from the SQL editor.
--   select public.delete_user_completely('some-uuid');
CREATE OR REPLACE FUNCTION public.delete_user_completely(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  DELETE FROM auth.users WHERE id = p_user_id;
END;
$$;

-- Same thing but lookup by email so we don't have to copy/paste UUIDs.
CREATE OR REPLACE FUNCTION public.delete_user_by_email(p_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_uid uuid;
BEGIN
  SELECT id INTO v_uid
  FROM auth.users
  WHERE lower(email) = lower(p_email)
  LIMIT 1;
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No auth user with email %', p_email;
  END IF;
  DELETE FROM auth.users WHERE id = v_uid;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_user_completely(uuid) FROM public;
REVOKE ALL ON FUNCTION public.delete_user_by_email(text) FROM public;
GRANT EXECUTE ON FUNCTION public.delete_user_completely(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_user_by_email(text) TO service_role;
