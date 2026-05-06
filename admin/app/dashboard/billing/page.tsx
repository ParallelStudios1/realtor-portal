import { getMe } from '@/lib/supabaseSsr';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Billing · Realtor Portal' };

const PLANS = [
  {
    name: 'Solo',
    price: '$99',
    sub: '/month',
    who: 'For solo agents',
    features: ['1 agent', 'Unlimited clients', 'Standard branding', 'Email support'],
    paymentLink: process.env.NEXT_PUBLIC_STRIPE_LINK_SOLO,
  },
  {
    name: 'Team',
    price: '$299',
    sub: '/month',
    who: 'Up to 10 agents',
    features: ['10 agents', 'Unlimited clients', 'Full branding', 'Priority support'],
    paymentLink: process.env.NEXT_PUBLIC_STRIPE_LINK_TEAM,
    popular: true,
  },
  {
    name: 'Brokerage',
    price: '$799',
    sub: '/month',
    who: 'Up to 50 agents',
    features: ['50 agents', 'Unlimited clients', 'Custom domain', 'Dedicated CSM'],
    paymentLink: process.env.NEXT_PUBLIC_STRIPE_LINK_BROKERAGE,
  },
];

export default async function BillingPage() {
  const me = (await getMe())!;
  const trialDays = me.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(me.trial_ends_at).getTime() - Date.now()) / 86400000))
    : 0;

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="text-3xl font-bold tracking-tight">Billing</h1>
      <p className="mt-1 text-sm text-slate-600">
        {me.firm_status === 'trial' ? (
          <>
            You're on a free trial — <strong>{trialDays} days left</strong>. Pick a plan to keep your
            portal running after that.
          </>
        ) : (
          'Your plan is active.'
        )}
      </p>

      <div className="mt-8 grid gap-6 md:grid-cols-3">
        {PLANS.map((p) => (
          <div
            key={p.name}
            className={
              'rounded-xl border bg-white p-6 ' +
              (p.popular ? 'border-blue-500 shadow-lg ring-2 ring-blue-500' : 'border-slate-200')
            }
          >
            {p.popular && (
              <div className="mb-2 inline-block rounded-full bg-blue-600 px-2 py-0.5 text-xs font-semibold text-white">
                Most popular
              </div>
            )}
            <h3 className="font-semibold">{p.name}</h3>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-3xl font-bold">{p.price}</span>
              <span className="text-sm text-slate-500">{p.sub}</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">{p.who}</p>
            <ul className="mt-4 space-y-2 text-sm">
              {p.features.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <span className="text-emerald-500">✓</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <a
              href={p.paymentLink || '#'}
              target={p.paymentLink ? '_blank' : undefined}
              rel="noopener noreferrer"
              className={
                'mt-6 block rounded-md px-4 py-2 text-center text-sm font-semibold ' +
                (p.popular
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-slate-900 text-white hover:bg-slate-700')
              }
            >
              {p.paymentLink ? 'Subscribe' : 'Coming soon'}
            </a>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
        <strong className="block text-slate-900">Need an Enterprise plan?</strong>
        For 50+ agents, custom domain, app store white-label, or SSO,{' '}
        <a href="mailto:turnerlogan@parallelstudios.co" className="font-medium text-blue-600 hover:underline">
          email us
        </a>{' '}
        and we'll set you up.
      </div>
    </main>
  );
}
