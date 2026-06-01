import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getMe, getSupabaseServerClient } from '@/lib/supabaseSsr';

export const dynamic = 'force-dynamic';

export default async function DashboardOverviewPage() {
  const me = await getMe();
  if (!me) {
    redirect('/login');
  }
  const supabase = getSupabaseServerClient();

  const [
    { count: clientCount },
    { count: activeDealCount },
    { count: closedDealCount },
    { data: recentDeals },
    { data: upcoming },
  ] = await Promise.all([
    supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'client')
      .eq('firm_id', me.firm_id!),
    supabase
      .from('client_searches')
      .select('id', { count: 'exact', head: true })
      .eq('firm_id', me.firm_id!)
      .neq('phase', 'closed'),
    supabase
      .from('client_searches')
      .select('id', { count: 'exact', head: true })
      .eq('firm_id', me.firm_id!)
      .eq('phase', 'closed'),
    supabase
      .from('client_searches')
      .select(
        `id, name, phase, updated_at, kind,
         client:users!client_searches_client_id_fkey ( id, full_name, email )`
      )
      .eq('firm_id', me.firm_id!)
      .order('updated_at', { ascending: false })
      .limit(6),
    supabase
      .from('important_dates')
      .select('id, label, date, search_id')
      .eq('firm_id', me.firm_id!)
      .gte('date', new Date().toISOString().slice(0, 10))
      .order('date', { ascending: true })
      .limit(5),
  ]);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Welcome back, {me.full_name?.split(' ')[0] || 'there'}
          </h1>
          <p className="mt-1 text-sm text-ink-600">
            Here's what's happening at {me.firm_name}.
          </p>
        </div>
        <Link
          href="/dashboard/clients/new"
          className="rounded-lg bg-ink-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-ink-700"
        >
          + Invite client
        </Link>
      </header>

      {/* KPI row */}
      <div className="grid gap-3 md:grid-cols-4">
        <Card
          label="Active deals"
          value={activeDealCount ?? 0}
          href="/dashboard/deals"
          accent="blue"
        />
        <Card
          label="Closed deals"
          value={closedDealCount ?? 0}
          href="/dashboard/deals?phase=closed"
          accent="emerald"
        />
        <Card
          label="Clients"
          value={clientCount ?? 0}
          href="/dashboard/clients"
          accent="slate"
        />
        <Card
          label={me.firm_status === 'trial' ? 'Trial' : 'Plan'}
          value={trialStatusLabel(me)}
          href="/dashboard/billing"
          accent="amber"
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        {/* Recent activity (deals) — links into /dashboard/deals/[id] */}
        <section className="lg:col-span-2">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">Recent deals</h2>
            <Link
              href="/dashboard/deals"
              className="text-xs font-semibold text-blue-600 hover:underline"
            >
              View all →
            </Link>
          </div>
          <div className="overflow-hidden rounded-xl border border-ink-200 bg-white">
            {!recentDeals || recentDeals.length === 0 ? (
              <div className="p-8 text-center text-sm text-ink-500">
                No deals yet.{' '}
                <Link
                  href="/dashboard/clients/new"
                  className="font-medium text-blue-600 hover:underline"
                >
                  Invite your first client →
                </Link>
              </div>
            ) : (
              <ul className="divide-y divide-ink-100">
                {recentDeals.map((d: any) => (
                  <li key={d.id}>
                    <Link
                      href={`/dashboard/deals/${d.id}`}
                      className="flex items-center gap-3 px-4 py-3 transition hover:bg-ink-50"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink-100 text-xs font-bold text-ink-700">
                        {initials(d.client?.full_name || d.client?.email)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">
                          {d.client?.full_name || d.client?.email || '—'}
                        </div>
                        <div className="truncate text-xs text-ink-500">
                          {d.name ||
                            (d.kind === 'seller' ? 'Listing' : 'Buyer deal')}
                        </div>
                      </div>
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase text-blue-700">
                        {String(d.phase || 'pending').replace(/_/g, ' ')}
                      </span>
                      <span className="ml-2 hidden text-xs text-ink-400 sm:inline">
                        {new Date(d.updated_at).toLocaleDateString()}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Upcoming dates */}
        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">Upcoming dates</h2>
          </div>
          <div className="overflow-hidden rounded-xl border border-ink-200 bg-white">
            {!upcoming || upcoming.length === 0 ? (
              <div className="p-6 text-center text-sm text-ink-500">
                Nothing on the calendar.
              </div>
            ) : (
              <ul className="divide-y divide-ink-100">
                {upcoming.map((u: any) => (
                  <li key={u.id}>
                    <Link
                      href={`/dashboard/deals/${u.search_id}`}
                      className="flex items-center gap-3 px-4 py-3 transition hover:bg-ink-50"
                    >
                      <div className="flex w-12 shrink-0 flex-col items-center rounded-md bg-ink-50 py-1">
                        <span className="text-[10px] font-bold uppercase text-ink-500">
                          {new Date(u.date).toLocaleString('en-US', {
                            month: 'short',
                          })}
                        </span>
                        <span className="text-lg font-bold leading-none text-ink-900">
                          {new Date(u.date).getDate()}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1 text-sm">
                        <div className="truncate font-medium">{u.label}</div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function trialStatusLabel(me: any): string {
  if (me.firm_status !== 'trial') return 'Active';
  if (!me.trial_ends_at) return 'Free trial';
  const msLeft = new Date(me.trial_ends_at).getTime() - Date.now();
  if (msLeft <= 0) return 'Trial ended';
  const hours = Math.floor(msLeft / 3600000);
  const days = Math.floor(hours / 24);
  if (days >= 1) return days + 'd left';
  return hours + 'h left';
}

function Card({
  label,
  value,
  href,
  accent,
}: {
  label: string;
  value: string | number;
  href: string;
  accent: 'slate' | 'blue' | 'emerald' | 'amber';
}) {
  const bar =
    accent === 'blue'
      ? 'bg-blue-600'
      : accent === 'emerald'
      ? 'bg-emerald-600'
      : accent === 'amber'
      ? 'bg-amber-500'
      : 'bg-ink-700';
  return (
    <Link
      href={href}
      className="group relative overflow-hidden rounded-xl border border-ink-200 bg-white p-5 transition hover:-tranink-y-0.5 hover:border-ink-300 hover:shadow-soft-md"
    >
      <div
        className={
          'absolute inset-x-0 top-0 h-1 ' + bar
        }
      />
      <div className="text-xs uppercase tracking-wide text-ink-500">{label}</div>
      <div className="mt-1 text-3xl font-bold tracking-tight">{value}</div>
    </Link>
  );
}

function initials(s: string | null | undefined) {
  if (!s) return '?';
  return s
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
