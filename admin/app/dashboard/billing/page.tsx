import { redirect } from 'next/navigation';
import { getMe } from '@/lib/supabaseSsr';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { BillingClient } from './BillingClient';
import { DevPlanSimulator } from './DevPlanSimulator';
import { PLANS, type PlanTier } from '@/lib/plans';
import { getSeatUsage, planNameForUsage } from '@/lib/seats';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Billing · Realtor Portal' };

// Only promise what the product actually does today. Everything listed here
// is live: seats, unlimited clients/deals, firm branding (logo + colors +
// tagline on the client portal and mobile app), e-sign tracking, deadline
// oversight, and email support.
// Plans are cumulative and the marquee items are REAL, enforced features:
// Team unlocks the firm-wide deadline Oversight page; Brokerage unlocks the
// firm-wide Analytics dashboard. Lower tiers genuinely cannot open those
// pages (gated server-side), so the upgrade buys something concrete.
const PLAN_CARDS = [
  {
    id: 'solo',
    name: 'Solo',
    price: '$99',
    sub: '/month',
    who: 'For a single agent',
    features: [
      '1 agent seat',
      'Unlimited clients & deals',
      'Branded client portal & mobile app',
      'E-signature tracking & deal timeline',
      'Email support',
    ],
  },
  {
    id: 'team',
    name: 'Team',
    price: '$299',
    sub: '/month',
    who: 'For a growing team (up to 10 agents)',
    features: [
      'Everything in Solo',
      '10 agent seats',
      'Firm-wide deadline oversight page',
      'At-risk & overdue deadline tracking by agent',
      'Priority email support',
    ],
    popular: true,
  },
  {
    id: 'brokerage',
    name: 'Brokerage',
    price: '$799',
    sub: '/month',
    who: 'For a brokerage (up to 50 agents)',
    features: [
      'Everything in Team',
      '50 agent seats',
      'Firm-wide analytics dashboard',
      'Pipeline, conversion & production reporting',
      'Broker oversight across every agent',
    ],
  },
];

export default async function BillingPage({
  searchParams,
}: {
  searchParams: {
    success?: string;
    canceled?: string;
    locked?: string;
    upgrade?: string;
  };
}) {
  const upgradeFeatureLabel =
    searchParams.upgrade === 'analytics'
      ? 'the firm-wide Analytics dashboard'
      : searchParams.upgrade === 'teamOversight'
        ? 'the firm-wide Deadline Oversight page'
        : null;
  const me = await getMe();
  if (!me) {
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
  let isSimulatedSubscription = false;
  const isDevOwner =
    (me.email || '').toLowerCase() === 'turnerlogan@parallelstudios.co';

  if (me.firm_id) {
    const service = getSupabaseServiceRoleClient();
    const { data: firmRow } = await service
      .from('firms')
      .select('stripe_subscription_id')
      .eq('id', me.firm_id)
      .maybeSingle();
    isSimulatedSubscription = Boolean(
      (firmRow?.stripe_subscription_id || '').startsWith('sim_')
    );
    // Single source of truth for seat usage — dedup-safe so an invited
    // realtor is counted once, never as member + pending invite.
    const usage = await getSeatUsage(me.firm_id);
    planTier = usage.tier;
    hasSubscription = usage.hasSubscription;
    seatCap = usage.seatCap;
    usedSeats = usage.usedSeats;
    planName = planNameForUsage(usage);
  }

  const utilization = seatCap > 0 ? usedSeats / seatCap : 0;
  const nearCap = utilization >= 0.8 && usedSeats < seatCap;
  const atCap = usedSeats >= seatCap;
  // What's the next tier up, for the upgrade CTA?
  const upgradeTarget: PlanTier | null =
    planTier === 'solo' ? 'team' : planTier === 'team' ? 'brokerage' : null;

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <div className="text-[11px] font-bold uppercase tracking-wider text-ink-500">
        Plan &amp; usage
      </div>
      <h1 className="mt-1.5 text-3xl font-bold tracking-tight text-ink-900">Billing</h1>
      <p className="mt-1 text-sm text-ink-600">
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

      {searchParams.locked && (
        <div className="mt-6 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          Your plan isn't active, so the rest of the portal is paused. Choose a
          plan below to restore access for you and your team.
        </div>
      )}
      {upgradeFeatureLabel && (
        <div className="mt-6 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
          {upgradeFeatureLabel} is included on a higher plan. Upgrade below to
          turn it on for your firm.
        </div>
      )}
      {searchParams.success && (
        <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          Subscription started — your firm is active.
        </div>
      )}
      {searchParams.canceled && (
        <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Checkout canceled. No charge was made.
        </div>
      )}

      {me.firm_id && (
        <div
          className={
            'mt-6 rounded-2xl border bg-white p-6 shadow-soft-sm ' +
            (atCap
              ? 'border-rose-300 ring-1 ring-rose-200'
              : nearCap
                ? 'border-amber-300 ring-1 ring-amber-200'
                : 'border-ink-200')
          }
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-ink-500">
                Current plan
              </div>
              <div className="mt-1 text-xl font-semibold text-ink-900">{planName}</div>
              <div className="mt-1 text-sm text-ink-600">
                <strong className="text-ink-900">{usedSeats}</strong> of{' '}
                <strong className="text-ink-900">{seatCap}</strong>{' '}
                seat{seatCap === 1 ? '' : 's'} used
              </div>
            </div>
            {(nearCap || atCap) && upgradeTarget && (
              <a href="#plans" className="btn-primary">
                {atCap ? 'Upgrade required' : 'Upgrade to ' + PLANS[upgradeTarget].name}
              </a>
            )}
          </div>

          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-ink-100">
            <div
              className={
                'h-full transition-all ' +
                (atCap
                  ? 'bg-rose-500'
                  : nearCap
                    ? 'bg-amber-500'
                    : 'bg-emerald-500')
              }
              style={{ width: Math.min(100, Math.round(utilization * 100)) + '%' }}
            />
          </div>

          {atCap && (
            <p className="mt-3 text-sm text-rose-700">
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

      <div className="mt-8 rounded-2xl border border-ink-200 bg-white p-6 text-sm text-ink-600 shadow-soft-sm">
        <strong className="block text-ink-900">Need more than 50 agents?</strong>
        <a
          href="mailto:turnerlogan@parallelstudios.co"
          className="font-semibold text-ink-900 underline underline-offset-2 hover:text-ink-700"
        >
          Email us
        </a>{' '}
        and we'll put together a plan that fits your brokerage.
      </div>

      {isDevOwner && (
        <DevPlanSimulator
          currentTier={planTier}
          simulated={isSimulatedSubscription}
        />
      )}
    </main>
  );
}
