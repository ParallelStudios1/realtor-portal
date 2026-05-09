import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getMe } from '@/lib/supabaseSsr';
import { DashboardNav } from './DashboardNav';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  if (!me) redirect('/login');
  if (!me.firm_id) redirect('/onboarding');

  const trialDaysLeft = me.trial_ends_at
    ? Math.max(
        0,
        Math.ceil((new Date(me.trial_ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      )
    : null;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="relative border-b border-slate-200 bg-white">
        <DashboardNav
          firmName={me.firm_name || null}
          firmLogoUrl={me.firm_logo_url || null}
          firmBrandColor={me.firm_brand_color || null}
          email={me.email || null}
        />

        {me.firm_status === 'trial' && trialDaysLeft !== null && (
          <div className="bg-amber-50 px-4 py-2 text-center text-xs text-amber-800 sm:px-6">
            <strong>{trialDaysLeft} days left</strong> on your free trial.{' '}
            <Link href="/dashboard/billing" className="underline">Add billing</Link> to keep things running.
          </div>
        )}
      </header>

      {children}
    </div>
  );
}
