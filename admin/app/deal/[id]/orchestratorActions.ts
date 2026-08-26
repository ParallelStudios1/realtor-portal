'use server';

import { revalidatePath } from 'next/cache';
import { getMe } from '@/lib/supabaseSsr';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { isFirmPlanActive } from '@/lib/planGate';

/**
 * Phase control for attorney-led deals.
 *
 * Realtor-led deals change phase from the realtor workspace, which attorneys
 * never see. On deals an attorney's own practice owns, the attorney is the
 * orchestrator — so they get this one carefully-scoped mutation rather than
 * the whole realtor toolset.
 *
 * Guards, in order: caller is an attorney; the deal exists; the deal is
 * attorney-led; the deal belongs to the caller's firm; the firm's plan is
 * live. Anything short of all five is a silent no for a reason — this is a
 * mutation reachable from a public route.
 */
const VALID_PHASES = new Set([
  'searching',
  'awaiting_offer',
  'offer_made',
  'counter_offer',
  'under_contract',
  'closing',
  'closed',
]);

export async function setAttorneyDealPhaseAction(formData: FormData) {
  const me = await getMe();
  if (!me?.user_id || me.role !== 'attorney' || !me.firm_id) return;

  const dealId = ((formData.get('deal_id') as string) || '').trim();
  const phase = ((formData.get('phase') as string) || '').trim();
  if (!dealId || !VALID_PHASES.has(phase)) return;

  const service = getSupabaseServiceRoleClient();
  const { data: deal } = await service
    .from('client_searches')
    .select('id, firm_id, orchestrated_by, phase, name')
    .eq('id', dealId)
    .maybeSingle();
  if (!deal) return;
  if ((deal as any).orchestrated_by !== 'attorney') return;
  if ((deal as any).firm_id !== me.firm_id) return;
  if (!(await isFirmPlanActive(me.firm_id))) return;

  const updates: Record<string, unknown> = { phase };
  if (phase === 'closed') updates.closed_at = new Date().toISOString();

  const { error } = await service
    .from('client_searches')
    .update(updates)
    .eq('id', dealId);
  if (error) {
    console.error('[orchestrator] phase update failed', error.message);
    return;
  }

  await service.from('activities').insert({
    firm_id: me.firm_id,
    search_id: dealId,
    actor_id: me.user_id,
    action: 'phase_changed',
    target: phase,
    metadata: { by: 'attorney' },
  });

  revalidatePath('/deal/' + dealId);
}
