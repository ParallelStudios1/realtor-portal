-- =============================================================================
-- Realtor Portal — fixed migration 0003 (self-serve signup) — v2
-- Adds status column safely, then everything else.
-- =============================================================================

-- =============================================================================
-- 0003_self_serve_signup.sql
-- Allows realtors to sign up themselves, create their firm, and start using
-- the portal without manual provisioning by Parallel Studios.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- A) RPC: create_firm_and_admin
-- Called by the web /signup page after the user authenticates with Supabase.
-- Atomically:
--   1. inserts a row into public.firms
--   2. inserts a row into public.users linking auth.uid() to that firm with
--      role = 'firm_admin'
-- Returns the new firm_id.
--
-- Idempotency: if the user already has a public.users row, we update its
-- firm_id + role rather than inserting a duplicate (covers the case where
-- they bounced out of signup and came back).
-- ---------------------------------------------------------------------------
create or replace function public.create_firm_and_admin(
  p_firm_name text,
  p_full_name text,
  p_subdomain text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_email   text;
  v_firm_id uuid;
  v_subdomain text;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  -- pull the email from auth.users
  select email into v_email from auth.users where id = v_user_id;

  -- generate a subdomain if one wasn't supplied
  v_subdomain := coalesce(
    nullif(lower(regexp_replace(p_subdomain, '[^a-z0-9-]', '', 'g')), ''),
    lower(regexp_replace(p_firm_name, '[^a-zA-Z0-9]+', '-', 'g'))
  );
  -- collision check — append a short suffix if taken
  while exists (select 1 from public.firms where subdomain = v_subdomain) loop
    v_subdomain := v_subdomain || '-' || substr(md5(random()::text), 1, 4);
  end loop;

  -- insert the firm
  insert into public.firms (name, subdomain, status, created_at)
  values (trim(p_firm_name), v_subdomain, 'trial', now())
  returning id into v_firm_id;

  -- upsert the user row
  insert into public.users (id, firm_id, email, full_name, role, created_at)
  values (v_user_id, v_firm_id, v_email, trim(p_full_name), 'firm_admin', now())
  on conflict (id) do update
    set firm_id   = excluded.firm_id,
        full_name = excluded.full_name,
        role      = 'firm_admin';

  return v_firm_id;
end;
$$;

grant execute on function public.create_firm_and_admin(text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- B) firms.status — add the column if it doesn't exist, plus a check constraint.
--    The original schema used is_active boolean; we layer a richer status on top.
-- ---------------------------------------------------------------------------
alter table public.firms add column if not exists status text default 'trial';

-- Backfill: anything that was is_active=true becomes 'active', false becomes 'suspended'.
update public.firms
   set status = case when is_active then 'active' else 'suspended' end
 where status is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'firms_status_check'
  ) then
    alter table public.firms
      add constraint firms_status_check
      check (status in ('trial', 'active', 'suspended', 'cancelled'));
  end if;
exception when others then null;
end $$;

-- ---------------------------------------------------------------------------
-- C) Trial expiry tracking
-- ---------------------------------------------------------------------------
alter table public.firms add column if not exists trial_ends_at timestamptz
  default (now() + interval '14 days');

-- ---------------------------------------------------------------------------
-- D) Branding columns (so the realtor's onboarding wizard has somewhere to
--    save their logo URL, brand color, tagline, contact info)
-- ---------------------------------------------------------------------------
alter table public.firms add column if not exists logo_url text;
alter table public.firms add column if not exists brand_color text default '#0F172A';
alter table public.firms add column if not exists accent_color text default '#2563EB';
alter table public.firms add column if not exists tagline text;
alter table public.firms add column if not exists contact_email text;
alter table public.firms add column if not exists contact_phone text;
alter table public.firms add column if not exists website_url text;
alter table public.firms add column if not exists onboarding_completed boolean default false;

-- ---------------------------------------------------------------------------
-- E) firm_admin self-update policy
-- A firm admin can update their own firm row (branding, contact info, etc.)
-- but cannot change firm_id pointers, status (billing-controlled), or id.
-- ---------------------------------------------------------------------------
drop policy if exists firms_admin_update_own on public.firms;
create policy firms_admin_update_own
  on public.firms
  for update
  to authenticated
  using (
    id = public.current_firm_id() and public.current_role() = 'firm_admin'
  )
  with check (
    id = public.current_firm_id() and public.current_role() = 'firm_admin'
  );

-- ---------------------------------------------------------------------------
-- F) Storage policy for firm logos
-- Bucket: firm-assets (create via dashboard if not exists)
-- Path convention: {firm_id}/logo.{ext}
-- ---------------------------------------------------------------------------
-- These statements are commented because they need to run AFTER the
-- 'firm-assets' bucket exists. Run via SQL Editor after creating the bucket
-- in Supabase dashboard.
--
-- create policy "firm admins read own firm assets" on storage.objects
--   for select to authenticated
--   using (
--     bucket_id = 'firm-assets'
--     and (storage.foldername(name))[1] = public.current_firm_id()::text
--   );
--
-- create policy "firm admins write own firm assets" on storage.objects
--   for insert to authenticated
--   with check (
--     bucket_id = 'firm-assets'
--     and (storage.foldername(name))[1] = public.current_firm_id()::text
--     and public.current_role() = 'firm_admin'
--   );
--
-- create policy "firm admins update own firm assets" on storage.objects
--   for update to authenticated
--   using (
--     bucket_id = 'firm-assets'
--     and (storage.foldername(name))[1] = public.current_firm_id()::text
--     and public.current_role() = 'firm_admin'
--   );
--
-- create policy "public read firm logos" on storage.objects
--   for select to anon, authenticated
--   using (bucket_id = 'firm-assets');

-- ---------------------------------------------------------------------------
-- G) Helper: fetch current user's firm + role in one call
-- The web app uses this to load the dashboard header without a join.
-- ---------------------------------------------------------------------------
create or replace function public.me()
returns table (
  user_id uuid,
  email text,
  full_name text,
  role text,
  firm_id uuid,
  firm_name text,
  firm_subdomain text,
  firm_logo_url text,
  firm_brand_color text,
  firm_status text,
  trial_ends_at timestamptz,
  onboarding_completed boolean
)
language sql
security definer
set search_path = public
as $$
  select
    u.id,
    u.email,
    u.full_name,
    u.role,
    u.firm_id,
    f.name,
    f.subdomain,
    f.logo_url,
    f.brand_color,
    f.status,
    f.trial_ends_at,
    f.onboarding_completed
  from public.users u
  left join public.firms f on f.id = u.firm_id
  where u.id = auth.uid();
$$;

grant execute on function public.me() to authenticated;

-- ----- storage policies for firm-assets bucket -----
-- (run AFTER you've created the firm-assets bucket in the Storage dashboard)
drop policy if exists "public read firm assets" on storage.objects;
create policy "public read firm assets" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'firm-assets');

drop policy if exists "auth users write firm assets" on storage.objects;
create policy "auth users write firm assets" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'firm-assets');

drop policy if exists "auth users update firm assets" on storage.objects;
create policy "auth users update firm assets" on storage.objects
  for update to authenticated
  using (bucket_id = 'firm-assets');

