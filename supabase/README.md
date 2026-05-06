# Supabase setup

Step-by-step. Do each piece once and you're done forever.

## 1. Create the Supabase project

1. Go to https://supabase.com → New Project.
2. Name it `realtor-portal-prod` (you can also make a `realtor-portal-dev` later).
3. Region: pick the one closest to most of your firms (US East is a safe default).
4. Save the database password somewhere — you'll only see it once.
5. Wait ~2 minutes for provisioning.

## 2. Apply the schema

1. In the Supabase dashboard → **SQL Editor** → New Query.
2. Paste the contents of `schema.sql` from this folder. Run.
3. Then paste the contents of `migrations/0002_house_status_and_ratings.sql`. Run.
4. You should see "Success. No rows returned." and the tables appear under **Database → Tables**.

The migration adds:
- `houses.status` column (interested → tour_requested → toured → offered/passed)
- `house_ratings` table (1–5 stars + notes from client per house)
- `tour_requests` table (client request → realtor follow-up)

If you ever need to reset and reapply:
- The script is idempotent — `create table if not exists`, `drop policy if exists`, etc.
- To wipe everything: `drop schema public cascade; create schema public;` then reapply both files in order.

## 3. Enable Auth providers

1. **Authentication → Providers**.
2. Email (already on) — leave on.
3. Optionally enable Apple and Google so realtors and clients can sign in faster.
4. **Authentication → URL Configuration** → Site URL: set to your Expo dev URL during dev (e.g. `exp://192.168.x.x:8081`), and to your real production deep-link scheme later (e.g. `realtorportal://`).

## 4. Create Storage buckets

1. **Storage → New bucket**.
2. Create `logos`:
   - Public bucket: ✅ (logos are non-sensitive and need to be cacheable on phones).
3. Create `documents`:
   - Public bucket: ❌ (these are PDFs that can include private deal info).
   - We'll generate signed URLs server-side / via Supabase client when needed.

### Bucket policies for `documents`

Go to **Storage → documents → Policies** and add:

```sql
-- Realtors can upload to their firm's folder.
create policy "realtors_upload_documents" on storage.objects for insert
    with check (
        bucket_id = 'documents'
        and (storage.foldername(name))[1] = (select firm_id::text from public.users where id = auth.uid())
        and (select role from public.users where id = auth.uid()) = 'realtor'
    );

-- Anyone in the firm can read their own firm's documents.
create policy "firm_read_documents" on storage.objects for select
    using (
        bucket_id = 'documents'
        and (storage.foldername(name))[1] = (select firm_id::text from public.users where id = auth.uid())
    );
```

Document paths follow the convention: `{firm_id}/{search_id}/{filename}.pdf`.

## 5. Get your keys

You need two keys:

1. **Anon public key** — `Project Settings → API → anon public`.
   - Used by mobile app and admin panel for client-side requests. Safe to ship.
2. **Service role key** — `Project Settings → API → service_role`.
   - **NEVER** put this in mobile app code. It bypasses RLS.
   - Used only as a Vercel environment variable for admin panel server-side functions.

## 6. Where to put the keys

Mobile app — `mobile/.env`:
```
EXPO_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
```

Admin panel — `admin/.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>   # SERVER-SIDE ONLY
```

When deploying admin to Vercel, set those same vars in Project Settings → Environment Variables.

## 7. Seed test data

Read `seed.sql` — it has a commented-out flow you walk through manually:
1. Sign up two test accounts via the mobile app.
2. Run the UPDATE blocks to assign roles.
3. Run the INSERT block to create a search.

Once you've done it once, you have a working demo for showing your dad's contacts.
