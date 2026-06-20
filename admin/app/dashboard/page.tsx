import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getMe, getSupabaseServerClient } from '@/lib/supabaseSsr';
import { phaseLabelFor } from '@/lib/dealKind';

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

  const brand = me.firm_brand_color || '#0F172A';

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-ink-500">
            Command center
          </div>
          <h1 className="mt-1.5 text-3xl font-bold tracking-tight text-ink-900">
            Welcome back, {me.full_name?.split(' ')[0] || 'there'}
          </h1>
          <p className="mt-1 text-sm text-ink-600">
            Here's what's happening at {me.firm_name}.
          </p>
        </div>
        <Link href="/dashboard/clients/new" className="btn-primary">
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M10 4v12M4 10h12" strokeLinecap="round" />
          </svg>
          Invite client
        </Link>
      </header>

      {/* KPI row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card
          label="Active deals"
          value={activeDealCount ?? 0}
          href="/dashboard/deals"
          barColor={brand}
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
        {/* Recent activity (deals) - links into /dashboard/deals/[id] */}
        <section className="lg:col-span-2">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-ink-500">
              Recent deals
            </h2>
            <Link
              href="/dashboard/deals"
              className="text-xs font-semibold text-ink-600 transition hover:text-ink-900"
            >
              View all →
            </Link>
          </div>
          <div className="surface overflow-hidden">
            {!recentDeals || recentDeals.length === 0 ? (
              <div className="bg-dotted px-6 py-12 text-center">
                <h3 className="text-sm font-semibold text-ink-900">No deals yet</h3>
                <p className="mx-auto mt-1 max-w-xs text-sm text-ink-500">
                  Your deals will appear here as soon as you start one.
                </p>
                <Link
                  href="/dashboard/clients/new"
                  className="btn-primary mt-4 text-xs"
                >
                  Invite your first client
                </Link>
              </div>
            ) : (
              <ul className="divide-y divide-ink-100">
                {recentDeals.map((d: any) => (
                  <li key={d.id}>
                    <Link
                      href={`/dashboard/deals/${d.id}`}
                      className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-ink-50"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink-100 text-xs font-bold text-ink-700">
                        {initials(d.client?.full_name || d.client?.email)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-ink-900">
                          {d.client?.full_name || d.client?.email || '-'}
                        </div>
                        <div className="truncate text-xs text-ink-500">
                          {d.name ||
                            (d.kind === 'seller' ? 'Listing' : 'Buyer deal')}
                        </div>
                      </div>
                      <span className="shrink-0 rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-700">
                        {phaseLabelFor(d.phase, d.kind)}
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
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-ink-500">
              Upcoming dates
            </h2>
          </div>
          <div className="surface overflow-hidden">
            {!upcoming || upcoming.length === 0 ? (
              <div className="bg-dotted px-6 py-12 text-center">
                <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-ink-100 text-ink-500">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-5 w-5" aria-hidden>
                    <rect x="3" y="5" width="18" height="16" rx="2" />
                    <path d="M3 9h18M8 3v4M16 3v4" strokeLinecap="round" />
                  </svg>
                </div>
                <p className="mt-3 text-sm text-ink-500">
                  Nothing on the calendar.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-ink-100">
                {upcoming.map((u: any) => (
                  <li key={u.id}>
                    <Link
                      href={`/dashboard/deals/${u.search_id}`}
                      className="flex items-center gap-3 px-4 py-3 transition hover:bg-ink-50"
                    >
                      <div className="flex w-12 shrink-0 flex-col items-center rounded-lg border border-ink-200 bg-ink-50 py-1">
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
                        <div className="truncate font-medium text-ink-900">{u.label}</div>
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
  barColor,
}: {
  label: string;
  value: string | number;
  href: string;
  accent?: 'slate' | 'blue' | 'emerald' | 'amber';
  barColor?: string;
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
      className="group relative overflow-hidden rounded-2xl border border-ink-200 bg-white p-5 shadow-soft-sm transition hover:-translate-y-0.5 hover:border-ink-300 hover:shadow-soft-md"
    >
      <div
        className={'absolute inset-x-0 top-0 h-1 ' + (barColor ? '' : bar)}
        style={barColor ? { backgroundColor: barColor } : undefined}
      />
      <div className="text-[11px] font-bold uppercase tracking-wider text-ink-500">
        {label}
      </div>
      <div className="mt-1.5 text-3xl font-bold tracking-tight tabular-nums text-ink-900">
        {value}
      </div>
      <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-ink-400 transition group-hover:text-ink-600">
        View
        <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
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
