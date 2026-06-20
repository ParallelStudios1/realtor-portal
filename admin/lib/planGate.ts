import { getSupabaseServiceRoleClient } from './supabaseServer';

/**
 * Returns true if the firm's plan is OK to perform write actions:
 *   - status='active' → always.
 *   - status='trial' + trial_ends_at in the future → ok.
 *   - status='trial' + trial_ends_at expired → blocked.
 *
 * Cross-firm participants (people writing to a deal they're a participant
 * on, not their own firm's data) are NOT gated here - that's enforced
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

/**
 * Per-deal "guest pass" plan check.
 *
 * Returns true if the user is allowed to use premium / write features on
 * a specific deal. There are two ways to qualify:
 *
 *   1. The user's HOME firm has an active plan. (Standard case - they
 *      can use the product on any of their firm's deals.)
 *
 *   2. The DEAL'S HOST firm has an active plan, AND the user is a
 *      participating realtor (role realtor/co_realtor) on that deal
 *      OR a member of that host firm. (Cross-firm "guest pass": when a
 *      paying firm invites an external realtor to co-broker, the
 *      external realtor gets premium features for that deal even if
 *      their own firm is on the free plan.)
 *
 * Used by deal-scoped server actions that previously called
 * isFirmPlanActive(me.firm_id) directly. Routes that operate on a
 * specific deal should switch to this so cross-firm collaborators
 * aren't unnecessarily blocked.
 *
 * If the caller doesn't know the user yet, pass null for userEmail -
 * the deal-host-firm check still works for users with a matching firm_id.
 */
export async function canUsePremiumForDeal(
  userHomeFirmId: string | null,
  dealId: string,
  userEmail?: string | null,
  userId?: string | null
): Promise<boolean> {
  // Fast path: home firm pays. Their plan covers anything.
  if (userHomeFirmId && (await isFirmPlanActive(userHomeFirmId))) return true;

  const service = getSupabaseServiceRoleClient();
  const { data: deal } = await service
    .from('client_searches')
    .select('firm_id')
    .eq('id', dealId)
    .maybeSingle();
  const hostFirmId = (deal as any)?.firm_id as string | undefined;
  if (!hostFirmId) return false;

  // If the user's home firm is the deal's host firm, the standard plan
  // check is the only gate we need - and we already failed above.
  if (hostFirmId === userHomeFirmId) return false;

  // Host firm is different. Check whether the host firm pays AND the user
  // is a participating realtor on this deal.
  if (!(await isFirmPlanActive(hostFirmId))) return false;

  const emailLower = userEmail ? userEmail.toLowerCase() : null;
  const filters: string[] = [];
  if (userId) filters.push(`user_id.eq.${userId}`);
  if (emailLower) filters.push(`external_email.ilike.${emailLower}`);
  if (filters.length === 0) return false;

  const { data: dp } = await service
    .from('deal_participants')
    .select('id, role')
    .eq('search_id', dealId)
    .in('role', ['realtor', 'co_realtor'])
    .or(filters.join(','))
    .limit(1);
  return Boolean(dp && dp.length > 0);
}
