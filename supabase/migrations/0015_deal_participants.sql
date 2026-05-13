-- 0015 — Generic multi-party "participants" on a deal.
--
-- Goes beyond the existing single attorney_* + co_realtor_id columns.
-- A deal can now carry any combination of:
--   realtor, co_realtor, buyer, seller, attorney, inspector, lender,
--   appraiser, title_agent, mortgage_broker, other
-- Each party is either:
--   - linked to a real public.users row (preferred — they can log in and see the deal),
--   - or just an external email + name (pure record-keeping).
--
-- The participant row carries fine-grained visibility flags so the realtor
-- can choose what each party sees (documents, financials, messages, etc.).

CREATE TYPE public.party_role AS ENUM (
  'realtor',
  'co_realtor',
  'buyer',
  'seller',
  'attorney',
  'inspector',
  'lender',
  'appraiser',
  'title_agent',
  'mortgage_broker',
  'other'
);

CREATE TABLE IF NOT EXISTS public.deal_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  search_id uuid NOT NULL REFERENCES public.client_searches(id) ON DELETE CASCADE,
  firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  external_email text,
  external_name text,
  external_phone text,
  role public.party_role NOT NULL,
  -- What this party can see when they sign in:
  can_view_documents boolean NOT NULL DEFAULT true,
  can_view_financials boolean NOT NULL DEFAULT false,
  can_view_messages boolean NOT NULL DEFAULT false,
  can_view_dates boolean NOT NULL DEFAULT true,
  -- Notes from the realtor visible only to staff.
  internal_notes text,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Either a linked user OR an external (email, name) — at least one required.
  CONSTRAINT participant_link_required CHECK (
    user_id IS NOT NULL OR external_email IS NOT NULL OR external_name IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS deal_participants_search_idx ON public.deal_participants(search_id);
CREATE INDEX IF NOT EXISTS deal_participants_user_idx ON public.deal_participants(user_id);
CREATE INDEX IF NOT EXISTS deal_participants_email_lower_idx
  ON public.deal_participants(lower(external_email));

ALTER TABLE public.deal_participants ENABLE ROW LEVEL SECURITY;

-- Staff in the firm can read/write all participants on their firm's deals.
CREATE POLICY deal_participants_staff ON public.deal_participants FOR ALL
  USING (firm_id = public.current_firm_id() AND public.is_staff_role())
  WITH CHECK (firm_id = public.current_firm_id() AND public.is_staff_role());

-- Any participant (linked user OR email-matched) can read their own row + others on the same deal.
CREATE POLICY deal_participants_self_read ON public.deal_participants FOR SELECT
  USING (
    user_id = auth.uid()
    OR (
      external_email IS NOT NULL
      AND lower(external_email) = lower(public.current_user_email())
    )
    OR search_id IN (
      SELECT search_id FROM public.deal_participants
      WHERE user_id = auth.uid()
         OR (external_email IS NOT NULL
             AND lower(external_email) = lower(public.current_user_email()))
    )
  );

-- updated_at trigger
CREATE OR REPLACE FUNCTION public._touch_deal_participants_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS deal_participants_touch ON public.deal_participants;
CREATE TRIGGER deal_participants_touch
  BEFORE UPDATE ON public.deal_participants
  FOR EACH ROW EXECUTE FUNCTION public._touch_deal_participants_updated_at();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.deal_participants;
ALTER TABLE public.deal_participants REPLICA IDENTITY FULL;
