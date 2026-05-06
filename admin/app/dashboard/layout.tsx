import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getMe } from '@/lib/supabaseSsr';
import { logoutAction } from '../login/actions';

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
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Link href="/dashboard" className="flex items-center gap-3">
            {me.firm_logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={me.firm_logo_url} alt="" className="h-8 w-8 rounded object-contain" />
            ) : (
              <div
                className="h-8 w-8 rounded"
                style={{ backgroundColor: me.firm_brand_color || '#0F172A' }}
              />
            )}
            <div>
              <div className="text-sm font-semibold leading-tight">{me.firm_name}</div>
              <div className="text-xs text-slate-500">{me.email}</div>
            </div>
          </Link>

          <nav className="flex items-center gap-1 text-sm">
            <Link href="/dashboard" className="rounded-md px-3 py-1.5 hover:bg-slate-100">Overview</Link>
            <Link href="/dashboard/clients" className="rounded-md px-3 py-1.5 hover:bg-slate-100">Clients</Link>
            <Link href="/dashboard/branding" className="rounded-md px-3 py-1.5 hover:bg-slate-100">Branding</Link>
            <Link href="/dashboard/billing" className="rounded-md px-3 py-1.5 hover:bg-slate-100">Billing</Link>
            <Link href="/dashboard/settings" className="rounded-md px-3 py-1.5 hover:bg-slate-100">Settings</Link>
            <form action={logoutAction}>
              <button className="ml-2 rounded-md border border-slate-300 px-3 py-1.5 text-slate-600 hover:bg-slate-50">
                Sign out
              </button>
            </form>
          </nav>
        </div>

        {me.firm_status === 'trial' && trialDaysLeft !== null && (
          <div className="bg-amber-50 px-6 py-2 text-center text-xs text-amber-800">
            <strong>{trialDaysLeft} days left</strong> on your free trial.{' '}
            <Link href="/dashboard/billing" className="underline">Add billing</Link> to keep things running.
          </div>
        )}
      </header>

      {children}
    </div>
  );
}
