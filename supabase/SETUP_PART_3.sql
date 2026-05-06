-- =============================================================================
-- Realtor Portal — SETUP PART 3 — fix RLS recursion in helper functions
-- =============================================================================
-- The helpers current_firm_id() and current_role() read public.users.
-- public.users has RLS policies that call those same helpers, creating an
-- infinite loop ("stack depth limit exceeded") whenever the RPC inserts a row.
--
-- Fix: make the helpers SECURITY DEFINER so they bypass RLS when called.
-- Both functions only return data scoped to auth.uid(), so this is safe.
-- =============================================================================

create or replace function public.current_firm_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
    select firm_id from public.users where id = auth.uid();
$$;

create or replace function public.current_role()
returns user_role
language sql
stable
security definer
set search_path = public
as $$
    select role from public.users where id = auth.uid();
$$;

grant execute on function public.current_firm_id() to authenticated, anon;
grant execute on function public.current_role()    to authenticated, anon;
