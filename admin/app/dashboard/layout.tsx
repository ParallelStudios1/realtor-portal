import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getMe } from '@/lib/supabaseSsr';
import { DashboardNav } from './DashboardNav';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  if (!me) redirect('/login');
  if (!me.firm_id) redirect('/onboarding');

  const msLeft = me.trial_ends_at
    ? new Date(me.trial_ends_at).getTime() - Date.now()
    : null;
  const trialExpired =
    me.firm_status === 'trial' && msLeft !== null && msLeft <= 0;
  const trialEndingSoon =
    me.firm_status === 'trial' && msLeft !== null && msLeft > 0 && msLeft < 72 * 3600_000;
  const trialLabel = (() => {
    if (msLeft == null || me.firm_status !== 'trial') return null;
    if (msLeft <= 0) return 'Trial ended';
    const totalH = Math.floor(msLeft / 3600_000);
    const days = Math.floor(totalH / 24);
    const hours = totalH - days * 24;
    if (days >= 1) return days + ' day' + (days === 1 ? '' : 's') + ', ' + hours + 'h left';
    return totalH + 'h left';
  })();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="relative border-b border-slate-200 bg-white">
        <DashboardNav
          firmName={me.firm_name || null}
          firmLogoUrl={me.firm_logo_url || null}
          firmBrandColor={me.firm_brand_color || null}
          email={me.email || null}
        />

        {trialExpired ? (
          <div className="bg-rose-600 px-4 py-2.5 text-center text-xs font-semibold text-white sm:px-6">
            Your free trial has ended. {' '}
            <Link href="/dashboard/billing" className="underline">
              Pick a plan
            </Link>{' '}
            to keep messaging, document uploads, and client invites working.
          </div>
        ) : trialEndingSoon ? (
          <div className="bg-amber-100 px-4 py-2 text-center text-xs text-amber-900 sm:px-6">
            <strong>{trialLabel}</strong> on your free trial.{' '}
            <Link href="/dashboard/billing" className="underline font-semibold">
              Add billing
            </Link>{' '}
            so nothing pauses when it expires.
          </div>
        ) : me.firm_status === 'trial' && trialLabel ? (
          <div className="bg-amber-50 px-4 py-2 text-center text-xs text-amber-800 sm:px-6">
            <strong>{trialLabel}</strong> on your free trial.{' '}
            <Link href="/dashboard/billing" className="underline">Add billing</Link>{' '}
            to keep things running.
          </div>
        ) : null}
      </header>

      {children}
    </div>
  );
}
