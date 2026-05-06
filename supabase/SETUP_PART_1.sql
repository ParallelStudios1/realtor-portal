-- =============================================================================
-- Realtor Portal — SETUP PART 1 (run this FIRST, alone)
-- Adds 'firm_admin' to the user_role enum so PART 2 can use it.
-- Postgres requires this in its own transaction.
-- =============================================================================

alter type user_role add value if not exists 'firm_admin';
