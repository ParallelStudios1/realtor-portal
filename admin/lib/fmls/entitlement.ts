import { createClient } from '@supabase/supabase-js';
import { getSupabaseServerClient } from '@/lib/supabaseSsr';

/**
 * FMLS is a PAID FIRM-LEVEL ADD-ON with no free trial — FMLS charges us per
 * subscriber from day one, so nobody gets it free, trial firms included.
 * One purchase covers the whole firm (a solo agent is just a firm of one).
 * The flag is flipped by the billing webhook when the add-on subscription
 * activates or lapses.
 *
 * Reads with the CALLER's own credentials (cookie session or Bearer token):
 * RLS already lets a firm member read their own firms row, and this keeps the
 * check working in every environment without the service-role key.
 */
export async function firmHasFmls(
  req: Request,
  firmId: string | null | undefined
): Promise<boolean> {
  if (!firmId) return false;

  // Web: cookie session.
  try {
    const ssr = getSupabaseServerClient();
    const { data } = await ssr
      .from('firms')
      .select('fmls_active')
      .eq('id', firmId)
      .maybeSingle();
    if (data != null) return Boolean((data as any).fmls_active);
  } catch {}

  // Mobile: Bearer token.
  const authz = req.headers.get('authorization') || '';
  const m = authz.match(/^Bearer\s+(.+)$/i);
  if (!m) return false;
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${m[1]}` } },
      auth: { persistSession: false },
    }
  );
  const { data } = await sb
    .from('firms')
    .select('fmls_active')
    .eq('id', firmId)
    .maybeSingle();
  return Boolean((data as any)?.fmls_active);
}
