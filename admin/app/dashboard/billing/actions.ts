'use server';

import { revalidatePath } from 'next/cache';
import { getMe } from '@/lib/supabaseSsr';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { PLANS, type PlanTier } from '@/lib/plans';

/**
 * DEV-ONLY plan simulation. Lets the product owner flip the firm between
 * plan tiers (and back to trial) WITHOUT a real Stripe charge, so every
 * tier's gates and seat caps can be tested end-to-end.
 *
 * Hard-gated to turnerlogan@parallelstudios.co — invisible and inert for
 * every other account. Simulated subscriptions are tagged with a
 * `sim_` subscription id so they can never be confused with a real
 * Stripe subscription (the webhook only ever writes `sub_…` ids).
 */
const DEV_EMAIL = 'turnerlogan@parallelstudios.co';

export async function simulatePlanAction(
  tier: PlanTier | 'reset'
): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await getMe();
  if (!me?.user_id || (me.email || '').toLowerCase() !== DEV_EMAIL) {
    return { ok: false, error: 'Not available.' };
  }
  if (!me.firm_id) return { ok: false, error: 'No firm.' };
  if (me.role !== 'firm_admin' && me.role !== 'super_admin') {
    return { ok: false, error: 'Admins only.' };
  }

  const service = getSupabaseServiceRoleClient();

  if (tier === 'reset') {
    const { error } = await service
      .from('firms')
      .update({
        status: 'trial',
        plan_tier: null,
        stripe_subscription_id: null,
        trial_ends_at: new Date(
          Date.now() + 14 * 24 * 60 * 60 * 1000
        ).toISOString(),
      })
      .eq('id', me.firm_id);
    if (error) return { ok: false, error: error.message };
  } else {
    if (!PLANS[tier]) return { ok: false, error: 'Unknown tier.' };
    // Refuse to overwrite a REAL subscription with a simulated one.
    const { data: firm } = await service
      .from('firms')
      .select('stripe_subscription_id')
      .eq('id', me.firm_id)
      .maybeSingle();
    const existing = (firm as any)?.stripe_subscription_id as string | null;
    if (existing && !existing.startsWith('sim_')) {
      return {
        ok: false,
        error:
          'This firm has a real Stripe subscription — manage it through Stripe, not the simulator.',
      };
    }
    const { error } = await service
      .from('firms')
      .update({
        status: 'active',
        plan_tier: tier,
        stripe_subscription_id: 'sim_' + tier + '_' + Date.now(),
      })
      .eq('id', me.firm_id);
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath('/dashboard/billing');
  revalidatePath('/dashboard');
  return { ok: true };
}
