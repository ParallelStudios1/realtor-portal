-- 0029 — Per-party private DM on a deal.
--
-- Adds messages.recipient_user_id and recipient_email so any party can
-- DM a SPECIFIC other party privately, scoped to this deal. NULL
-- recipient_user_id + NULL recipient_email = group message (current
-- behavior — visible to everyone authorized on the deal).
--
-- We allow recipient_email too because deal_participants may not yet
-- have a user_id (the invited realtor hasn't signed up yet). The
-- auth.users email match resolves "who can read this" once they sign in.

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS recipient_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recipient_email text;

CREATE INDEX IF NOT EXISTS messages_recipient_user_id_idx
  ON public.messages(recipient_user_id) WHERE recipient_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS messages_recipient_email_idx
  ON public.messages(lower(recipient_email)) WHERE recipient_email IS NOT NULL;

DROP POLICY IF EXISTS messages_private_read ON public.messages;
CREATE POLICY messages_private_read ON public.messages FOR SELECT
  USING (
    sender_id = auth.uid()
    OR recipient_user_id = auth.uid()
    OR (recipient_email IS NOT NULL
        AND lower(recipient_email) = lower(public.current_user_email()))
    OR (recipient_user_id IS NULL AND recipient_email IS NULL)
  );

DROP POLICY IF EXISTS messages_private_insert ON public.messages;
CREATE POLICY messages_private_insert ON public.messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND (
      (recipient_user_id IS NULL AND recipient_email IS NULL)
      OR EXISTS (
        SELECT 1 FROM public.deal_participants dp
        WHERE dp.search_id = messages.search_id
          AND (
            dp.user_id = messages.recipient_user_id
            OR (dp.external_email IS NOT NULL
                AND lower(dp.external_email) = lower(messages.recipient_email))
          )
      )
    )
  );
