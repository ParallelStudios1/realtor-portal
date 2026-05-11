-- 0010 — Allow user deletion to actually work.
-- Three FKs were ON DELETE RESTRICT, which blocks any user delete that
-- has ever touched the system (every realtor has activities; every
-- messager has messages; every realtor has client_searches).
--
--   messages.sender_id            -> CASCADE   (a user's messages go with them)
--   activities.actor_id           -> CASCADE   (audit trail goes with them)
--   client_searches.realtor_id    -> SET NULL  (the deal survives, unassigned)
--
-- For SET NULL to work, realtor_id must be nullable, so we drop the NOT NULL
-- constraint too. The application layer is responsible for reassigning
-- orphaned deals to a new realtor (UI lives at /dashboard/clients/[id]).

ALTER TABLE public.client_searches
  ALTER COLUMN realtor_id DROP NOT NULL;

ALTER TABLE public.messages
  DROP CONSTRAINT messages_sender_id_fkey,
  ADD CONSTRAINT messages_sender_id_fkey
    FOREIGN KEY (sender_id)
    REFERENCES public.users(id)
    ON DELETE CASCADE;

ALTER TABLE public.activities
  DROP CONSTRAINT activities_actor_id_fkey,
  ADD CONSTRAINT activities_actor_id_fkey
    FOREIGN KEY (actor_id)
    REFERENCES public.users(id)
    ON DELETE CASCADE;

ALTER TABLE public.client_searches
  DROP CONSTRAINT client_searches_realtor_id_fkey,
  ADD CONSTRAINT client_searches_realtor_id_fkey
    FOREIGN KEY (realtor_id)
    REFERENCES public.users(id)
    ON DELETE SET NULL;
