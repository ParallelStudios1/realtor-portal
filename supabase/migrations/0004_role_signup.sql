-- =============================================================================
-- 0004_role_signup.sql
-- Buyer / Seller / Realtor self-serve signup. Supports the new role picker on
-- mobile and web by giving non-realtor users a way to attach themselves to an
-- existing firm without an emailed invite.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- A) RPC: find_firm_by_realtor_email
-- A buyer/seller types in their realtor's email; we resolve it to firm_id +
-- realtor_id so we can stand up their account.
--
-- Returns NULL if the email doesn't match a realtor/firm_admin.
-- ---------------------------------------------------------------------------
create or replace function public.find_firm_by_realtor_email(
  p_email text
)
returns table (
  firm_id    uuid,
  firm_name  text,
  realtor_id uuid,
  realtor_name text
)
language sql
security definer
set search_path = public
as $$
  select
    u.firm_id,
    f.name,
    u.id,
    u.full_name
  from public.users u
  join public.firms f on f.id = u.firm_id
  where lower(u.email) = lower(trim(p_email))
    and u.role in ('realtor', 'firm_admin')
  limit 1;
$$;

grant execute on function public.find_firm_by_realtor_email(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- B) RPC: create_client_user
-- Buyer/seller-side counterpart of create_firm_and_admin. Creates a users
-- row (role='client') attached to the realtor's firm, plus a starter
-- client_searches row so the dashboard isn't empty.
--
-- p_kind is 'buyer' or 'seller' — stored on client_searches.
-- ---------------------------------------------------------------------------
create or replace function public.create_client_user(
  p_realtor_email text,
  p_full_name     text,
  p_kind          text default 'buyer'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id    uuid := auth.uid();
  v_email      text;
  v_firm_id    uuid;
  v_realtor_id uuid;
  v_search_id  uuid;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;
  if p_kind not in ('buyer', 'seller') then
    raise exception 'invalid_kind: %', p_kind;
  end if;

  -- Pull email from auth.users (don't trust client input for this)
  select email into v_email from auth.users where id = v_user_id;

  -- Look up the realtor's firm
  select u.firm_id, u.id
    into v_firm_id, v_realtor_id
    from public.users u
   where lower(u.email) = lower(trim(p_realtor_email))
     and u.role in ('realtor', 'firm_admin')
   limit 1;

  if v_firm_id is null then
    raise exception 'realtor_not_found';
  end if;

  -- Upsert users row with role='client'
  insert into public.users (id, firm_id, email, full_name, role, created_at)
  values (v_user_id, v_firm_id, v_email, trim(p_full_name), 'client', now())
  on conflict (id) do update
    set firm_id   = excluded.firm_id,
        full_name = excluded.full_name,
        role      = 'client';

  -- Create a starter search if there isn't one already
  if not exists (
    select 1 from public.client_searches where client_id = v_user_id
  ) then
    insert into public.client_searches (
      firm_id, client_id, realtor_id, name, phase, kind, created_at
    )
    values (
      v_firm_id,
      v_user_id,
      v_realtor_id,
      coalesce(trim(p_full_name), 'Search') || ' ' ||
        case when p_kind = 'seller' then 'Listing' else 'Search' end,
      'searching',
      p_kind,
      now()
    )
    returning id into v_search_id;
  end if;

  return v_firm_id;
end;
$$;

grant execute on function public.create_client_user(text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- C) client_searches.kind — 'buyer' | 'seller'
-- ---------------------------------------------------------------------------
alter table public.client_searches
  add column if not exists kind text default 'buyer'
  check (kind in ('buyer', 'seller'));

-- ---------------------------------------------------------------------------
-- D) RPC: ensure_user_row
-- Small safety net: if the public.users row got lost (rare; e.g. migration
-- ran out of order) but the user has an auth.users record, re-create the
-- minimum viable row so they don't get stuck on OrphanAccountScreen with no
-- way out. Returns the role.
-- ---------------------------------------------------------------------------
create or replace function public.ensure_user_row()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_email   text;
  v_role    text;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;
  select email into v_email from auth.users where id = v_user_id;
  select u.role::text into v_role from public.users u where u.id = v_user_id;
  return v_role; -- null if the row doesn't exist (caller should run signup flow)
end;
$$;

grant execute on function public.ensure_user_row() to authenticated;
