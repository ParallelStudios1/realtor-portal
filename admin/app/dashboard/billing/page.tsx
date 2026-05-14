import { getMe } from '@/lib/supabaseSsr';
import { BillingClient } from './BillingClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Billing · Realtor Portal' };

const PLANS = [
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
  const me = (await getMe())!;
  // Compose a live-feeling countdown: "X days, Y hours" so it visibly ticks
  // throughout the day instead of sitting on a whole-day integer.
  const trialMsLeft = me.trial_ends_at
    ? Math.max(0, new Date(me.trial_ends_at).getTime() - Date.now())
    : 0;
  const trialTotalHours = Math.floor(trialMsLeft / 3600000);
  const trialDaysFull = Math.floor(trialTotalHours / 24);
  const trialHoursPart = trialTotalHours - trialDaysFull * 24;
  const trialDays = trialDaysFull;
  const trialDisplay =
    trialMsLeft <= 0
      ? 'Trial ended'
      : trialDaysFull > 0
      ? `${trialDaysFull} day${trialDaysFull === 1 ? '' : 's'}, ${trialHoursPart} hour${trialHoursPart === 1 ? '' : 's'} left`
      : `${trialTotalHours} hour${trialTotalHours === 1 ? '' : 's'} left`;

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

      <BillingClient plans={PLANS} currentStatus={me.firm_status} />

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
