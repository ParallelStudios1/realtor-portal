-- =============================================================================
-- 0005_documents_storage.sql
-- Wires up real document upload from the realtor mobile app:
--   * Creates a private 'client-docs' Storage bucket
--   * Path convention: {firm_id}/{search_id}/{timestamp}-{filename}
--   * RLS on storage.objects so realtors of a firm can write/read anything
--     under their firm prefix, and clients can read anything under a
--     {firm_id}/{search_id} where they own the search.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- A) Bucket
-- Idempotent: if it already exists we leave existing config alone.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('client-docs', 'client-docs', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- B) RLS policies on storage.objects
-- storage.foldername(name) returns text[] of the path segments.
--   [1] = firm_id
--   [2] = search_id
--   [3] = "{timestamp}-{filename}"
-- ---------------------------------------------------------------------------

-- Drop any earlier iterations so this is rerunnable.
drop policy if exists "client-docs realtor read firm"   on storage.objects;
drop policy if exists "client-docs realtor write firm"  on storage.objects;
drop policy if exists "client-docs realtor update firm" on storage.objects;
drop policy if exists "client-docs realtor delete firm" on storage.objects;
drop policy if exists "client-docs client read own search" on storage.objects;

-- Realtors / firm_admins: SELECT on any object whose first path segment
-- equals their firm_id.
create policy "client-docs realtor read firm"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'client-docs'
    and (storage.foldername(name))[1] = public.current_firm_id()::text
  );

-- Realtors / firm_admins: INSERT under their firm prefix.
create policy "client-docs realtor write firm"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'client-docs'
    and (storage.foldername(name))[1] = public.current_firm_id()::text
  );

-- Allow realtors to overwrite (rare, but the SDK's upsert path needs UPDATE).
create policy "client-docs realtor update firm"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'client-docs'
    and (storage.foldername(name))[1] = public.current_firm_id()::text
  )
  with check (
    bucket_id = 'client-docs'
    and (storage.foldername(name))[1] = public.current_firm_id()::text
  );

-- And delete, scoped same way.
create policy "client-docs realtor delete firm"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'client-docs'
    and (storage.foldername(name))[1] = public.current_firm_id()::text
  );

-- Clients: SELECT on objects whose path is {firm_id}/{search_id}/... where
-- they have a row in client_searches with that firm_id+search_id+client_id.
create policy "client-docs client read own search"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'client-docs'
    and exists (
      select 1
      from public.client_searches cs
      where cs.client_id = auth.uid()
        and cs.firm_id::text   = (storage.foldername(name))[1]
        and cs.id::text        = (storage.foldername(name))[2]
    )
  );
