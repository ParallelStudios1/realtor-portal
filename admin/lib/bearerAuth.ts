import { createClient } from '@supabase/supabase-js';
import { getMe } from './supabaseSsr';
import { getSupabaseServiceRoleClient } from './supabaseServer';

export type Caller = {
  user_id: string;
  firm_id: string | null;
  email: string | null;
  role: string | null;
  /** 'brokerage' | 'law_firm' — lets gates treat law-firm attorneys as staff. */
  firm_type: string | null;
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
      firm_type: (me as any).firm_type ?? null,
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
    .select('firm_id, role, firm:firms ( firm_type )')
    .eq('id', data.user.id)
    .maybeSingle();
  return {
    user_id: data.user.id,
    firm_id: (row as any)?.firm_id ?? null,
    email: data.user.email ?? null,
    role: (row as any)?.role ?? null,
    firm_type: (row as any)?.firm?.firm_type ?? null,
  };
}

export const STAFF_ADMIN_ROLES = ['owner', 'firm_admin', 'super_admin'];
/**
 * Firm administration rights. The founding attorney of a law practice
 * administers it (branding, plan, team) exactly like a brokerage firm_admin —
 * pass firmType so that case resolves; attorneys inside brokerages never do.
 */
export function isFirmAdmin(
  role: string | null,
  firmType?: string | null
): boolean {
  if (!!role && STAFF_ADMIN_ROLES.includes(role)) return true;
  return role === 'attorney' && firmType === 'law_firm';
}
