-- =============================================================================
-- 0006_house_photos.sql
-- Wires up listing photo uploads for the realtor add-house screen:
--   * Creates a PUBLIC 'house-photos' Storage bucket. These are listing photos
--     meant to be shared with clients (and ultimately rendered via simple <img>
--     in the client portal), so we don't need signed URLs — public read is fine.
--   * Path convention: {firm_id}/{search_id}/{timestamp}-{filename}
--   * RLS on storage.objects so realtors of a firm can write/update/delete
--     anything under their own firm prefix. Public SELECT is allowed (the
--     bucket is public anyway, but we add an explicit policy so the table-level
--     checks don't block reads when RLS is on).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- A) Bucket
-- Idempotent: if it already exists we leave existing config alone.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('house-photos', 'house-photos', true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- B) RLS policies on storage.objects for the house-photos bucket
-- storage.foldername(name) returns text[] of the path segments.
--   [1] = firm_id
--   [2] = search_id
--   [3] = "{timestamp}-{filename}"
-- ---------------------------------------------------------------------------

-- Drop any earlier iterations so this is rerunnable.
drop policy if exists "house-photos public read"          on storage.objects;
drop policy if exists "house-photos realtor write firm"   on storage.objects;
drop policy if exists "house-photos realtor update firm"  on storage.objects;
drop policy if exists "house-photos realtor delete firm"  on storage.objects;

-- Public bucket — anyone (including anon) can read. We still scope this by
-- bucket_id so the policy can't accidentally widen reads on other buckets.
create policy "house-photos public read"
  on storage.objects
  for select
  to public
  using (bucket_id = 'house-photos');

-- Realtors / firm_admins: INSERT under their firm prefix.
create policy "house-photos realtor write firm"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'house-photos'
    and (storage.foldername(name))[1] = public.current_firm_id()::text
  );

-- Allow upserts / overwrites within the firm prefix.
create policy "house-photos realtor update firm"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'house-photos'
    and (storage.foldername(name))[1] = public.current_firm_id()::text
  )
  with check (
    bucket_id = 'house-photos'
    and (storage.foldername(name))[1] = public.current_firm_id()::text
  );

-- And delete, scoped same way.
create policy "house-photos realtor delete firm"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'house-photos'
    and (storage.foldername(name))[1] = public.current_firm_id()::text
  );
