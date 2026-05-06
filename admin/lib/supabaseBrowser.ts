import { createBrowserClient } from '@supabase/ssr';

/**
 * Browser-side Supabase client. Uses the anon key. Subject to RLS — and the
 * RLS policies for super_admin require the user's `role` column to be
 * 'super_admin', which is checked via current_role() in Postgres.
 *
 * For convenience, this admin panel uses the service role for all writes via
 * server actions. Reads can also go through service role to dodge RLS, since
 * the audience for this panel is just the founder. If you ever expose admin
 * to multiple ops people, add proper auth gating in middleware.
 */
export function getSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createBrowserClient(url, anonKey);
}
