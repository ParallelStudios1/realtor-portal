import { getSupabaseServiceRoleClient } from './supabaseServer';

/**
 * Returns true if the firm's plan is OK to perform write actions:
 *   - status='active' → always.
 *   - status='trial' + trial_ends_at in the future → ok.
 *   - status='trial' + trial_ends_at expired → blocked.
 *
 * Cross-firm participants (people writing to a deal they're a participant
 * on, not their own firm's data) are NOT gated here — that's enforced
 * separately by can_collab_on_search RLS.
 */
export async function isFirmPlanActive(firmId: string | null): Promise<boolean> {
  if (!firmId) return false;
  const service = getSupabaseServiceRoleClient();
  const { data: firm } = await service
    .from('firms')
    .select('status, trial_ends_at')
    .eq('id', firmId)
    .maybeSingle();
  if (!firm) return false;
  if (firm.status === 'active') return true;
  if (firm.status === 'trial') {
    if (!firm.trial_ends_at) return true; // never set → grandfather
    return new Date(firm.trial_ends_at).getTime() > Date.now();
  }
  // cancelled / past_due / anything else → blocked
  return false;
}
