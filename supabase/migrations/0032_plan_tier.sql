-- 0032 — plan_tier on firms: records which Stripe price tier the firm
-- bought so we can enforce seat caps and surface the current plan in the
-- UI. Without this column we have no way to tell a Solo customer from a
-- Brokerage customer once checkout completes.

alter table public.firms
  add column if not exists plan_tier text;

-- Backfill existing active firms to 'solo' as a safe default. Anyone
-- already paying without a plan_tier almost certainly bought the Solo
-- plan; if not, the next subscription.updated webhook will correct it.
update public.firms set plan_tier = 'solo'
where stripe_subscription_id is not null and plan_tier is null;
