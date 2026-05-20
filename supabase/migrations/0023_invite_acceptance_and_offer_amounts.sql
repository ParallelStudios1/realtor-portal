-- 0023 — Two related fixes:
--   (a) firm_invites.accepted_at was never being set, so the Firm Control
--       page kept showing accepted invites under "Pending invites." Add a
--       trigger that runs on public.users insert/update — if the user's
--       email matches a firm_invites row for that firm, stamp accepted_at.
--   (b) Phase transitions need to capture context (offer amount, counter
--       amount, closing date). Add columns to client_searches for them.

ALTER TABLE public.client_searches
  ADD COLUMN IF NOT EXISTS offer_amount numeric,
  ADD COLUMN IF NOT EXISTS counter_offer_amount numeric,
  ADD COLUMN IF NOT EXISTS closing_date date,
  ADD COLUMN IF NOT EXISTS closed_message text;

CREATE OR REPLACE FUNCTION public._mark_firm_invite_accepted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.firm_id IS NOT NULL AND NEW.email IS NOT NULL THEN
    UPDATE public.firm_invites
    SET accepted_at = COALESCE(accepted_at, now())
    WHERE firm_id = NEW.firm_id
      AND lower(email) = lower(NEW.email)
      AND accepted_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_mark_invite_accepted ON public.users;
CREATE TRIGGER users_mark_invite_accepted
  AFTER INSERT OR UPDATE OF firm_id, email ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public._mark_firm_invite_accepted();

UPDATE public.firm_invites fi
SET accepted_at = now()
FROM public.users u
WHERE fi.accepted_at IS NULL
  AND fi.firm_id = u.firm_id
  AND lower(fi.email) = lower(u.email);
