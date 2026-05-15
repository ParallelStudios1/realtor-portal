import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getMe } from '@/lib/supabaseSsr';
import { DashboardNav } from './DashboardNav';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
    if (days >= 1)
      return days + ' day' + (days === 1 ? '' : 's') + ', ' + hours + 'h left';
    return totalH + 'h left';
  })();

  return (
    <div className="min-h-screen bg-ink-50">
      <header className="sticky top-0 z-20 border-b border-ink-200 bg-white/85 backdrop-blur-md">
        <DashboardNav
          firmName={me.firm_name || null}
          firmLogoUrl={me.firm_logo_url || null}
          firmBrandColor={me.firm_brand_color || null}
          email={me.email || null}
          isFirmAdmin={
            me.role === 'owner' ||
            me.role === 'firm_admin' ||
            me.role === 'super_admin'
          }
        />

        {trialExpired ? (
          <div className="flex items-center justify-center gap-3 bg-rose-600 px-4 py-2 text-center text-xs font-semibold text-white sm:px-6">
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4 shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4M12 16h.01" strokeLinecap="round" />
            </svg>
            <span>
              Your free trial has ended.{' '}
              <Link href="/dashboard/billing" className="underline underline-offset-2">
                Pick a plan
              </Link>{' '}
              to keep messaging, document uploads, and client invites working.
            </span>
          </div>
        ) : trialEndingSoon ? (
          <div className="flex items-center justify-center gap-3 bg-amber-100 px-4 py-2 text-center text-xs text-amber-900 sm:px-6">
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4 shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 7v6M12 17h.01" strokeLinecap="round" />
            </svg>
            <span>
              <strong>{trialLabel}</strong> on your free trial.{' '}
              <Link
                href="/dashboard/billing"
                className="font-semibold underline underline-offset-2"
              >
                Add billing
              </Link>{' '}
              so nothing pauses when it expires.
            </span>
          </div>
        ) : me.firm_status === 'trial' && trialLabel ? (
          <div className="flex items-center justify-center gap-2 bg-amber-50 px-4 py-1.5 text-center text-[11px] text-amber-800 sm:px-6">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
            <strong>{trialLabel}</strong> on your free trial.
            <Link href="/dashboard/billing" className="underline">
              Add billing
            </Link>
          </div>
        ) : null}
      </header>

      <div className="animate-fade-in">{children}</div>
    </div>
  );
}
