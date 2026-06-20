import { getSupabaseServiceRoleClient } from './supabaseServer';
import { PLANS, seatCapForTier, type PlanTier } from './plans';

/**
 * Roles that consume a paid seat. MUST all exist in the user_role enum —
 * 'member' is NOT a real role (it silently errored PostgREST and zeroed the
 * count in the past). Clients and attorneys are not seats.
 */
export const SEAT_ROLES = [
  'firm_admin',
  'owner',
  'manager',
  'realtor',
  'agent',
] as const;

export type SeatUsage = {
  tier: PlanTier | null;
  effectiveTier: PlanTier | null;
  hasSubscription: boolean;
  seatCap: number;
  usedSeats: number;
  memberCount: number;
  pendingCount: number;
  atCap: boolean;
};

/**
 * Single source of truth for "how many seats is this firm using, out of how
 * many." Counts DISTINCT people: every staff member, plus any pending invite
 * whose email is NOT already a member. This is dedup-safe, so an invited
 * realtor who already has a live account (the normal case) is counted once —
 * never as both a member and a pending invite (the old double-count bug).
 */
export async function getSeatUsage(firmId: string): Promise<SeatUsage> {
  const service = getSupabaseServiceRoleClient();

  const { data: firmRow } = await service
    .from('firms')
    .select('plan_tier, stripe_subscription_id')
    .eq('id', firmId)
    .maybeSingle();

  const tier = (firmRow?.plan_tier as PlanTier | null) ?? null;
  const hasSubscription = Boolean(firmRow?.stripe_subscription_id);
  // No tier and no subscription → still on trial; treat as Solo cap.
  const effectiveTier: PlanTier | null = tier ?? (hasSubscription ? null : 'solo');
  const seatCap = seatCapForTier(effectiveTier);

  const { data: memberRows } = await service
    .from('users')
    .select('email')
    .eq('firm_id', firmId)
    .in('role', SEAT_ROLES as unknown as string[]);
  const memberEmails = new Set(
    (memberRows || []).map((r: any) => (r.email || '').toLowerCase()).filter(Boolean)
  );

  const { data: pendingRows } = await service
    .from('firm_invites')
    .select('email')
    .eq('firm_id', firmId)
    .is('accepted_at', null);
  // Only count pending invites for people who are NOT already members.
  const pendingEmails = new Set(
    (pendingRows || [])
      .map((r: any) => (r.email || '').toLowerCase())
      .filter((e: string) => e && !memberEmails.has(e))
  );

  const memberCount = memberEmails.size;
  const pendingCount = pendingEmails.size;
  const usedSeats = memberCount + pendingCount;

  return {
    tier,
    effectiveTier,
    hasSubscription,
    seatCap,
    usedSeats,
    memberCount,
    pendingCount,
    atCap: usedSeats >= seatCap,
  };
}

export function planNameForUsage(u: SeatUsage): string {
  return u.effectiveTier
    ? PLANS[u.effectiveTier].name
    : u.hasSubscription
      ? 'Active'
      : 'Trial';
}
