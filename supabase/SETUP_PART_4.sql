-- =============================================================================
-- Realtor Portal — SETUP PART 4 — Stripe billing columns
-- =============================================================================
-- Adds the columns the Stripe webhook needs to flip a firm to active/paid.
-- Run this in the Supabase SQL Editor after PARTS 1-3.
-- =============================================================================

alter table public.firms add column if not exists stripe_customer_id text;
alter table public.firms add column if not exists stripe_subscription_id text;

create index if not exists firms_stripe_customer_id_idx
  on public.firms(stripe_customer_id);
