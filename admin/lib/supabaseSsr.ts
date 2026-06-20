import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { NextRequest, NextResponse } from 'next/server';

/**
 * Auth-aware Supabase client for Server Components, Server Actions, and
 * route handlers. Reads the user's session from cookies - so RLS applies
 * with their auth.uid().
 */
export function getSupabaseServerClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // Server Component context - ignore. Middleware handles writes.
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch {
            // Server Component context - ignore.
          }
        },
      },
    }
  );
}

/**
 * Middleware-context Supabase client. Use inside `middleware.ts` so the
 * session refresh tokens get rotated and written back to cookies.
 */
export function getSupabaseMiddlewareClient(req: NextRequest, res: NextResponse) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return req.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          res.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          res.cookies.set({ name, value: '', ...options });
        },
      },
    }
  );
}

/**
 * Returns the current user's full row from public.me() RPC, or null.
 * One round trip pulls user + firm + branding.
 */
export async function getMe() {
  const supabase = getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase.rpc('me').single();
  if (error || !data) return null;
  return data as {
    user_id: string;
    email: string;
    full_name: string;
    role:
      | 'super_admin'
      | 'firm_admin'
      | 'realtor'
      | 'client'
      | 'owner'
      | 'manager'
      | 'agent'
      | 'attorney';
    firm_id: string | null;
    firm_name: string | null;
    firm_subdomain: string | null;
    firm_logo_url: string | null;
    firm_brand_color: string | null;
    firm_status: string | null;
    trial_ends_at: string | null;
    onboarding_completed: boolean | null;
  };
}
