import { createClient } from '@supabase/supabase-js';

/**
 * Server-only Supabase client using the service-role key. Bypasses RLS.
 *
 * NEVER import this from a Client Component or pass its results to the client
 * untrusted. Use only inside `app/**` route handlers, Server Actions, and
 * server components that you have audited for tenant scoping.
 */
export function getSupabaseServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      'Missing SUPABASE env vars. Copy admin/.env.example to admin/.env.local and fill in.'
    );
  }

  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
