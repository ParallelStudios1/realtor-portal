import { getMe } from '@/lib/supabaseSsr';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { BillingClient } from './BillingClient';
import { PLANS, seatCapForTier, type PlanTier } from '@/lib/plans';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Billing · Realtor Portal' };

const PLAN_CARDS = [
  {
    id: 'solo',
    name: 'Solo',
    price: '$99',
    sub: '/month',
    who: 'For solo agents',
    features: ['1 agent', 'Unlimited clients', 'Standard branding', 'Email support'],
  },
  {
    id: 'team',
    name: 'Team',
    price: '$299',
    sub: '/month',
    who: 'Up to 10 agents',
    features: ['10 agents', 'Unlimited clients', 'Full branding', 'Priority support'],
    popular: true,
  },
  {
    id: 'brokerage',
    name: 'Brokerage',
    price: '$799',
    sub: '/month',
    who: 'Up to 50 agents',
    features: ['50 agents', 'Unlimited clients', 'Custom domain', 'Dedicated CSM'],
  },
];

export default async function BillingPage({
  searchParams,
}: {
  searchParams: { success?: string; canceled?: string };
}) {
  const me = await getMe();
  if (!me) {
    const { redirect } = await import('next/navigation');
    redirect('/login');
  }
  // Compose a live-feeling countdown: "X days, Y hours" so it visibly ticks
  // throughout the day instead of sitting on a whole-day integer.
  const trialMsLeft = me.trial_ends_at
    ? Math.max(0, new Date(me.trial_ends_at).getTime() - Date.now())
    : 0;
  const trialTotalHours = Math.floor(trialMsLeft / 3600000);
  const trialDaysFull = Math.floor(trialTotalHours / 24);
  const trialHoursPart = trialTotalHours - trialDaysFull * 24;
  const trialDisplay =
    trialMsLeft <= 0
      ? 'Trial ended'
      : trialDaysFull > 0
      ? `${trialDaysFull} day${trialDaysFull === 1 ? '' : 's'}, ${trialHoursPart} hour${trialHoursPart === 1 ? '' : 's'} left`
      : `${trialTotalHours} hour${trialTotalHours === 1 ? '' : 's'} left`;

  // ---- Current plan + seat usage ----
  // We render a "you're on X plan, using Y of Z seats" panel above the
  // plan cards so admins know what they bought and how close they are
  // to the cap. >=80% utilization surfaces an Upgrade CTA.
  let planTier: PlanTier | null = null;
  let hasSubscription = false;
  let usedSeats = 0;
  let seatCap = 1;
  let planName = 'Trial';

  if (me.firm_id) {
    const service = getSupabaseServiceRoleClient();
    const { data: firmRow } = await service
      .from('firms')
      .select('plan_tier, stripe_subscription_id')
      .eq('id', me.firm_id)
      .maybeSingle();
    planTier = (firmRow?.plan_tier as PlanTier | null) ?? null;
    hasSubscription = Boolean(firmRow?.stripe_subscription_id);
    const effectiveTier: PlanTier | null =
      planTier ?? (hasSubscription ? null : 'solo');
    seatCap = seatCapForTier(effectiveTier);
    planName = effectiveTier
      ? PLANS[effectiveTier].name
      : hasSubscription
        ? 'Active'
        : 'Trial';

    const { count: memberCount } = await service
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('firm_id', me.firm_id)
      .in('role', ['firm_admin', 'manager', 'realtor', 'member']);
    const { count: pendingInviteCount } = await service
      .from('firm_invites')
      .select('id', { count: 'exact', head: true })
      .eq('firm_id', me.firm_id)
      .is('accepted_at', null);
    usedSeats = (memberCount || 0) + (pendingInviteCount || 0);
  }

  const utilization = seatCap > 0 ? usedSeats / seatCap : 0;
  const nearCap = utilization >= 0.8 && usedSeats < seatCap;
  const atCap = usedSeats >= seatCap;
  // What's the next tier up, for the upgrade CTA?
  const upgradeTarget: PlanTier | null =
    planTier === 'solo' ? 'team' : planTier === 'team' ? 'brokerage' : null;

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="text-3xl font-bold tracking-tight">Billing</h1>
      <p className="mt-1 text-sm text-slate-600">
        {me.firm_status === 'trial' ? (
          <>
            You're on a free trial — <strong>{trialDisplay}</strong>.
            Pick a plan to keep your portal running after that.
          </>
        ) : me.firm_status === 'active' ? (
          <>Your subscription is active. Manage your plan below.</>
        ) : me.firm_status === 'suspended' ? (
          <>
            Your subscription is past due. Update your payment method to restore
            access.
          </>
        ) : (
          'Pick a plan to get started.'
        )}
      </p>

      {searchParams.success && (
        <div className="mt-6 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          Subscription started — your firm is active.
        </div>
      )}
      {searchParams.canceled && (
        <div className="mt-6 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Checkout canceled. No charge was made.
        </div>
      )}

      {me.firm_id && (
        <div
          className={
            'mt-6 rounded-xl border bg-white p-6 ' +
            (atCap
              ? 'border-red-300 ring-1 ring-red-200'
              : nearCap
                ? 'border-amber-300 ring-1 ring-amber-200'
                : 'border-slate-200')
          }
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500">
                Current plan
              </div>
              <div className="mt-1 text-xl font-semibold">{planName}</div>
              <div className="mt-1 text-sm text-slate-600">
                <strong>{usedSeats}</strong> of <strong>{seatCap}</strong>{' '}
                seat{seatCap === 1 ? '' : 's'} used
              </div>
            </div>
            {(nearCap || atCap) && upgradeTarget && (
              <a
                href="#plans"
                className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                {atCap ? 'Upgrade required' : 'Upgrade to ' + PLANS[upgradeTarget].name}
              </a>
            )}
          </div>

          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className={
                'h-full transition-all ' +
                (atCap
                  ? 'bg-red-500'
                  : nearCap
                    ? 'bg-amber-500'
                    : 'bg-emerald-500')
              }
              style={{ width: Math.min(100, Math.round(utilization * 100)) + '%' }}
            />
          </div>

          {atCap && (
            <p className="mt-3 text-sm text-red-700">
              You've reached your seat limit. Upgrade to invite more team members.
            </p>
          )}
          {nearCap && !atCap && (
            <p className="mt-3 text-sm text-amber-700">
              You're approaching your seat limit. Consider upgrading to keep room
              to grow.
            </p>
          )}
        </div>
      )}

      <div id="plans">
        <BillingClient plans={PLAN_CARDS} currentStatus={me.firm_status} />
      </div>

      <div className="mt-8 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
        <strong className="block text-slate-900">Need an Enterprise plan?</strong>
        For 50+ agents, custom domain, app store white-label, or SSO,{' '}
        <a
          href="mailto:turnerlogan@parallelstudios.co"
          className="font-medium text-blue-600 hover:underline"
        >
          email us
        </a>{' '}
        and we'll set you up.
      </div>
    </main>
  );
}
