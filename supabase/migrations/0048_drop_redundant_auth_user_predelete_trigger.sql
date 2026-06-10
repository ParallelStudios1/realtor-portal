-- 0048: Fix "can't delete Supabase users".
--
-- A custom BEFORE DELETE trigger on auth.users (auth_user_predelete_cleanup)
-- manually deleted a HARD-CODED list of related rows before the user was
-- removed. It was added long ago to work around missing cascade rules, but it
-- has since become both redundant and fragile:
--
--   * public.users.id already REFERENCES auth.users(id) ON DELETE CASCADE, and
--     every child FK (on public.users and on public.client_searches) is now
--     ON DELETE CASCADE or ON DELETE SET NULL. So deleting an auth user already
--     cleans up everything via native referential actions.
--   * Because the trigger named specific tables, it silently broke every time a
--     new table was added that it didn't know about (e.g. listing_offers,
--     esign_envelopes) — surfacing as GoTrue's generic "Database error deleting
--     user" in the Supabase dashboard.
--
-- Dropping it makes user deletion rely purely on the cascade chain, which is
-- self-maintaining and the Supabase-recommended pattern. Verified: deleting a
-- user removes their own deals + all child rows (incl. listing_offers and
-- esign_envelopes) while deals where they were only the realtor survive with
-- realtor_id set to NULL.

drop trigger if exists auth_user_predelete_cleanup on auth.users;
drop function if exists public._auth_user_predelete_cleanup();
