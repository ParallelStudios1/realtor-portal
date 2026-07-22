-- =============================================================================
-- 0059_document_visibility.sql
-- Per-document visibility control + attorney document uploads.
--
-- WHAT THIS ADDS
--   1. documents.visibility  — 'firm' | 'everyone' | 'restricted'
--        firm       = only firm staff (realtors/admins) can see it. Private.
--        everyone   = every party on the deal (client, attorney, co-agents).
--                     This is the LEGACY behavior, so it is the DEFAULT — every
--                     existing row keeps showing exactly as it does today.
--        restricted = firm staff (always) PLUS the explicitly-listed recipients
--                     in public.document_recipients, and nobody else.
--   2. public.document_recipients — the allow-list used by 'restricted' docs.
--        A recipient is either a known user (user_id) or an external party we
--        only know by email (recipient_email), e.g. an attorney.
--   3. Rewritten client + attorney READ policies that honor visibility.
--   4. Attorney WRITE policy + storage policy so attorneys on a deal can upload
--      documents and set their visibility, same as realtors.
--
-- Firm staff always retain full read/write on their firm's documents regardless
-- of visibility — visibility only ever restricts NON-staff parties.
-- Idempotent / re-runnable.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'everyone'
    CHECK (visibility IN ('firm', 'everyone', 'restricted'));

-- ---------------------------------------------------------------------------
-- 2) Recipients allow-list for 'restricted' documents
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.document_recipients (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id   uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  user_id       uuid REFERENCES public.users(id) ON DELETE CASCADE,
  recipient_email text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  -- Must identify the recipient one way or the other.
  CONSTRAINT document_recipients_target_ck
    CHECK (user_id IS NOT NULL OR recipient_email IS NOT NULL)
);

-- No duplicate grants for the same (document, user) or (document, email).
CREATE UNIQUE INDEX IF NOT EXISTS document_recipients_doc_user_uidx
  ON public.document_recipients(document_id, user_id)
  WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS document_recipients_doc_email_uidx
  ON public.document_recipients(document_id, lower(recipient_email))
  WHERE recipient_email IS NOT NULL;
CREATE INDEX IF NOT EXISTS document_recipients_doc_idx
  ON public.document_recipients(document_id);

ALTER TABLE public.document_recipients ENABLE ROW LEVEL SECURITY;

-- Firm staff manage the allow-list for their firm's documents.
DROP POLICY IF EXISTS document_recipients_staff_all ON public.document_recipients;
CREATE POLICY document_recipients_staff_all ON public.document_recipients FOR ALL
  USING (
    document_id IN (
      SELECT id FROM public.documents
      WHERE firm_id = public.current_firm_id() AND public.is_staff_role()
    )
  )
  WITH CHECK (
    document_id IN (
      SELECT id FROM public.documents
      WHERE firm_id = public.current_firm_id() AND public.is_staff_role()
    )
  );

-- Attorneys manage the allow-list for documents THEY uploaded (so when an
-- attorney uploads a restricted doc they can pick who sees it).
DROP POLICY IF EXISTS document_recipients_attorney_own ON public.document_recipients;
CREATE POLICY document_recipients_attorney_own ON public.document_recipients FOR ALL
  USING (
    document_id IN (
      SELECT id FROM public.documents WHERE uploaded_by = auth.uid()
    )
  )
  WITH CHECK (
    document_id IN (
      SELECT id FROM public.documents WHERE uploaded_by = auth.uid()
    )
  );

-- A recipient may read their own grant rows (lets the app show "shared with you").
DROP POLICY IF EXISTS document_recipients_self_read ON public.document_recipients;
CREATE POLICY document_recipients_self_read ON public.document_recipients FOR SELECT
  USING (
    user_id = auth.uid()
    OR lower(recipient_email) = lower(public.current_user_email())
  );

-- ---------------------------------------------------------------------------
-- 3) Helper: is the current NON-staff caller allowed to see this document?
--    Returns true when visibility opens it to them. Firm staff are handled by
--    the firm_id branch in the read policy and never reach this.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_view_document(doc public.documents)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE doc.visibility
    -- Private to the firm: no non-staff party ever sees it here.
    WHEN 'firm' THEN false
    -- Open to all parties on the deal.
    WHEN 'everyone' THEN true
    -- Only explicitly listed recipients.
    WHEN 'restricted' THEN EXISTS (
      SELECT 1 FROM public.document_recipients dr
      WHERE dr.document_id = doc.id
        AND (
          dr.user_id = auth.uid()
          OR lower(dr.recipient_email) = lower(public.current_user_email())
        )
    )
    ELSE false
  END;
$$;

-- ---------------------------------------------------------------------------
-- 4) Rewrite the READ policies to honor visibility.
--    Firm staff: unchanged (full access to their firm's docs).
--    Client:     owns the search AND visibility lets them in.
--    Attorney:   on the search AND visibility lets them in.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS documents_read ON public.documents;
CREATE POLICY documents_read ON public.documents FOR SELECT
  USING (
    -- Firm staff always see their firm's documents.
    firm_id = public.current_firm_id()
    -- The person who uploaded it always sees it (covers attorney uploaders).
    OR uploaded_by = auth.uid()
    -- Client on the search, subject to visibility.
    OR (
      search_id IN (
        SELECT id FROM public.client_searches WHERE client_id = auth.uid()
      )
      AND public.can_view_document(documents)
    )
  );

DROP POLICY IF EXISTS documents_attorney_read ON public.documents;
CREATE POLICY documents_attorney_read ON public.documents FOR SELECT
  USING (
    search_id IN (
      SELECT id FROM public.client_searches
      WHERE attorney_email IS NOT NULL
        AND lower(attorney_email) = lower(public.current_user_email())
    )
    AND public.can_view_document(documents)
  );

-- ---------------------------------------------------------------------------
-- 5) Attorney WRITE: an attorney on a deal can insert/update/delete documents
--    they uploaded to that deal. Firm staff write policy is untouched.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS documents_attorney_write ON public.documents;
CREATE POLICY documents_attorney_write ON public.documents FOR ALL
  USING (
    uploaded_by = auth.uid()
    AND search_id IN (
      SELECT id FROM public.client_searches
      WHERE attorney_email IS NOT NULL
        AND lower(attorney_email) = lower(public.current_user_email())
    )
  )
  WITH CHECK (
    uploaded_by = auth.uid()
    AND search_id IN (
      SELECT id FROM public.client_searches
      WHERE attorney_email IS NOT NULL
        AND lower(attorney_email) = lower(public.current_user_email())
    )
  );

-- ---------------------------------------------------------------------------
-- 6) Storage: let attorneys upload under {firm_id}/{search_id} for deals they
--    are the attorney on. Mirrors the realtor firm-prefix policies from 0005.
--    Path segments: [1]=firm_id, [2]=search_id, [3]=filename.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "client-docs attorney read own search" ON storage.objects;
CREATE POLICY "client-docs attorney read own search"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'client-docs'
    AND (storage.foldername(name))[2] IN (
      SELECT id::text FROM public.client_searches
      WHERE attorney_email IS NOT NULL
        AND lower(attorney_email) = lower(public.current_user_email())
    )
  );

DROP POLICY IF EXISTS "client-docs attorney write own search" ON storage.objects;
CREATE POLICY "client-docs attorney write own search"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'client-docs'
    AND (storage.foldername(name))[2] IN (
      SELECT id::text FROM public.client_searches
      WHERE attorney_email IS NOT NULL
        AND lower(attorney_email) = lower(public.current_user_email())
    )
  );
