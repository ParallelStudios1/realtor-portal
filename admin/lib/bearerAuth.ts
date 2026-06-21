import { createClient } from '@supabase/supabase-js';
import { getMe } from './supabaseSsr';
import { getSupabaseServiceRoleClient } from './supabaseServer';

export type Caller = {
  user_id: string;
  firm_id: string | null;
  email: string | null;
  role: string | null;
};

/**
 * Resolve the caller from either a cookie session (web) OR an
 * `Authorization: Bearer <access_token>` header (mobile). Shared by every
 * API route that mobile hits so the two clients use the same auth path.
 */
export async function resolveCaller(req: Request): Promise<Caller | null> {
  const me = await getMe();
  if (me?.user_id) {
    return {
      user_id: me.user_id,
      firm_id: me.firm_id ?? null,
      email: me.email ?? null,
      role: me.role ?? null,
    };
  }
  const authz = req.headers.get('authorization') || '';
  const m = authz.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${m[1]}` } },
      auth: { persistSession: false },
    }
  );
  const { data } = await sb.auth.getUser();
  if (!data.user) return null;
  const service = getSupabaseServiceRoleClient();
  const { data: row } = await service
    .from('users')
    .select('firm_id, role')
    .eq('id', data.user.id)
    .maybeSingle();
  return {
    user_id: data.user.id,
    firm_id: (row as any)?.firm_id ?? null,
    email: data.user.email ?? null,
    role: (row as any)?.role ?? null,
  };
}

export const STAFF_ADMIN_ROLES = ['owner', 'firm_admin', 'super_admin'];
export function isFirmAdmin(role: string | null): boolean {
  return !!role && STAFF_ADMIN_ROLES.includes(role);
}
