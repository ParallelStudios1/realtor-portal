-- =============================================================================
-- 0063_apple_iap.sql
-- Apple In-App Purchase entitlement on firms.
--
-- A firm can now become 'active' two ways:
--   billing_source = 'stripe' → the existing web checkout (unchanged)
--   billing_source = 'apple'  → an auto-renewing subscription bought via
--                               StoreKit in the iOS app (guideline 3.1.1)
--
-- iap_original_transaction_id is Apple's stable per-subscriber key: it stays
-- constant across renewals, so it's what we match on when App Store Server
-- Notifications arrive. Unique so one Apple subscription can't silently
-- entitle two different firms.
-- =============================================================================

ALTER TABLE public.firms
  ADD COLUMN IF NOT EXISTS billing_source text NOT NULL DEFAULT 'stripe'
    CHECK (billing_source IN ('stripe', 'apple')),
  ADD COLUMN IF NOT EXISTS iap_original_transaction_id text,
  ADD COLUMN IF NOT EXISTS iap_product_id text,
  ADD COLUMN IF NOT EXISTS iap_expires_at timestamptz,
  -- 'auto_renew_off' lets the UI warn "expires on X" without flipping status.
  ADD COLUMN IF NOT EXISTS iap_auto_renew boolean;

CREATE UNIQUE INDEX IF NOT EXISTS firms_iap_original_txn_uidx
  ON public.firms(iap_original_transaction_id)
  WHERE iap_original_transaction_id IS NOT NULL;

-- Audit trail of every Apple transaction/notification we process. Also gives
-- idempotency: we skip a notification UUID we've already handled.
CREATE TABLE IF NOT EXISTS public.iap_transactions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id         uuid REFERENCES public.firms(id) ON DELETE SET NULL,
  provider        text NOT NULL DEFAULT 'apple',
  -- Apple's notificationUUID (server notifications) or transactionId (client).
  external_id     text NOT NULL,
  original_transaction_id text,
  product_id      text,
  notification_type text,
  expires_at      timestamptz,
  raw             jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS iap_transactions_external_uidx
  ON public.iap_transactions(provider, external_id);
CREATE INDEX IF NOT EXISTS iap_transactions_firm_idx
  ON public.iap_transactions(firm_id);

ALTER TABLE public.iap_transactions ENABLE ROW LEVEL SECURITY;

-- Firm staff may read their own firm's purchase history. Writes are
-- service-role only (the verify endpoint + Apple webhook), so no write policy.
DROP POLICY IF EXISTS iap_transactions_staff_read ON public.iap_transactions;
CREATE POLICY iap_transactions_staff_read ON public.iap_transactions FOR SELECT
  USING (firm_id = public.current_firm_id() AND public.is_staff_role());
