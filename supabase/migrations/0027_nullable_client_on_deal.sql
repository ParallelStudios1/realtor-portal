-- 0027 — A deal can exist before there's a principal client.
--
-- Real estate workflow: a realtor often starts a deal record the moment a
-- conversation begins ("walked an open house with two people, both are
-- interested"), names the deal, and adds parties as they materialize.
-- Forcing client_id to be NOT NULL was making them invent a fake principal
-- so they could create the deal at all.

ALTER TABLE public.client_searches
  ALTER COLUMN client_id DROP NOT NULL;

COMMENT ON COLUMN public.client_searches.client_id IS
  'Principal client on the deal. Nullable — a deal can exist before the realtor knows who the principal will be. Add parties via deal_participants.';
