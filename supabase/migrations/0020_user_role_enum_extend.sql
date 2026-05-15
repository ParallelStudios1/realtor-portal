-- 0020 — Add new values to the user_role enum so we can model a multi-realtor
-- firm hierarchy: owner / firm_admin / manager / realtor / agent / client.
--
-- ALTER TYPE ADD VALUE has to run before the values can be referenced in
-- other DDL, hence its own migration step.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid='public.user_role'::regtype
                 AND enumlabel='owner') THEN
    ALTER TYPE public.user_role ADD VALUE 'owner';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid='public.user_role'::regtype
                 AND enumlabel='manager') THEN
    ALTER TYPE public.user_role ADD VALUE 'manager';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid='public.user_role'::regtype
                 AND enumlabel='agent') THEN
    ALTER TYPE public.user_role ADD VALUE 'agent';
  END IF;
END
$$;
