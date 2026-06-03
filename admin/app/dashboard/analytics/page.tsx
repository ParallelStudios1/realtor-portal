import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getMe, getSupabaseServerClient } from '@/lib/supabaseSsr';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Analytics' };

/**
 * Broker analytics dashboard.
 *
 * Admin-tier roles (owner / firm_admin / manager / super_admin) get the full
 * firm-wide view powered by the service-role client. Realtors get a scoped
 * "limited view" that only reflects their own deals — those queries go
 * through the auth-aware SSR client so RLS does the filtering.
 *
 * Everything renders from data that already exists on `client_searches`,
 * `users`, `houses`, and `activities`. No new columns.
 */
export default async function AnalyticsPage() {
  const me = await getMe();
  if (!me) redirect('/login');
  if (!me.firm_id) redirect('/onboarding');

  const role = me.role || '';
  const isAdmin =
    role === 'owner' ||
    role === 'firm_admin' ||
    role === 'manager' ||
    role === 'super_admin';
  const isRealtor = role === 'realtor' || role === 'agent';

  if (!isAdmin && !isRealtor) {
    redirect('/dashboard');
  }

  // Date math, computed server-side once.
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthStartIso = monthStart.toISOString();
  const quarterStart = new Date(
    now.getFullYear(),
    Math.floor(now.getMonth() / 3) * 3,
    1
  );
  const quarterStartIso = quarterStart.toISOString();
  const stuckCutoffIso = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000
  ).toISOString();

  // Admins: bypass RLS via service role so a manager can see everyone.
  // Realtors: stay on the auth-aware client so RLS scopes everything to them.
  const db = isAdmin
    ? getSupabaseServiceRoleClient()
    : getSupabaseServerClient();
  const firmId = me.firm_id!;

  // Build the deals query. Admins see the whole firm; realtors only see their
  // own (belt-and-suspenders alongside RLS).
  let dealsQuery = db
    .from('client_searches')
    .select(
      `id, name, kind, phase, agreed_price, closing_amount, closing_date,
       commission_pct, created_at, updated_at, realtor_id,
       client:users!client_searches_client_id_fkey ( id, full_name, email ),
       realtor:users!client_searches_realtor_id_fkey ( id, full_name, email )`
    )
    .eq('firm_id', firmId);
  if (!isAdmin) {
    dealsQuery = dealsQuery.eq('realtor_id', me.user_id);
  }

  const [{ data: dealsRaw }, { data: activitiesRaw }] = await Promise.all([
    dealsQuery,
    (() => {
      let q = db
        .from('activities')
        .select(
          `id, action, target, created_at, search_id,
           actor:users!activities_actor_id_fkey ( full_name, email ),
           search:client_searches!activities_search_id_fkey ( id, name, realtor_id )`
        )
        .eq('firm_id', firmId)
        .order('created_at', { ascending: false })
        .limit(60);
      return q;
    })(),
  ]);

  const deals = ((dealsRaw || []) as unknown) as DealRow[];

  // For pipeline value we want a list_price fallback when agreed_price is
  // null — pull the most recent house per active search.
  const activeIds = deals
    .filter((d) => d.phase !== 'closed')
    .map((d) => d.id);
  let listPriceBySearch: Record<string, number> = {};
  if (activeIds.length > 0) {
    const { data: housesRaw } = await db
      .from('houses')
      .select('search_id, list_price, created_at')
      .in('search_id', activeIds)
      .order('created_at', { ascending: false });
    for (const h of ((housesRaw || []) as unknown) as HouseRow[]) {
      if (!h.search_id || h.list_price == null) continue;
      // first hit wins because we sorted desc — that's the freshest list_price
      if (listPriceBySearch[h.search_id] == null) {
        listPriceBySearch[h.search_id] = Number(h.list_price);
      }
    }
  }

  // --- KPI calcs ---------------------------------------------------------
  const activeDeals = deals.filter((d) => d.phase !== 'closed');
  const activeDealCount = activeDeals.length;

  const pipelineValue = activeDeals.reduce((sum, d) => {
    const v =
      d.agreed_price != null
        ? Number(d.agreed_price)
        : listPriceBySearch[d.id] ?? 0;
    return sum + (Number.isFinite(v) ? v : 0);
  }, 0);

  const closedThisMonth = deals.filter(
    (d) =>
      d.phase === 'closed' &&
      d.closing_date &&
      new Date(d.closing_date) >= monthStart &&
      new Date(d.closing_date) <= now
  );
  const closedThisMonthCount = closedThisMonth.length;
  const closedThisMonthAmount = closedThisMonth.reduce(
    (s, d) => s + (d.closing_amount ? Number(d.closing_amount) : 0),
    0
  );

  const closedThisQuarter = deals.filter(
    (d) =>
      d.phase === 'closed' &&
      d.closing_date &&
      new Date(d.closing_date) >= quarterStart &&
      new Date(d.closing_date) <= now
  );
  const daysToCloseList = closedThisQuarter
    .map((d) => {
      if (!d.closing_date || !d.created_at) return null;
      const ms =
        new Date(d.closing_date).getTime() - new Date(d.created_at).getTime();
      const days = Math.round(ms / (1000 * 60 * 60 * 24));
      return days >= 0 ? days : null;
    })
    .filter((n): n is number => n != null);
  const avgDaysToClose =
    daysToCloseList.length > 0
      ? Math.round(
          daysToCloseList.reduce((s, n) => s + n, 0) / daysToCloseList.length
        )
      : null;

  // --- Pipeline by phase -------------------------------------------------
  const PHASES = [
    'searching',
    'offer_made',
    'counter_offer',
    'under_contract',
    'closing',
    'closed',
  ] as const;

  const byPhase: Record<
    string,
    { count: number; value: number }
  > = Object.fromEntries(
    PHASES.map((p) => [p, { count: 0, value: 0 }])
  ) as any;

  for (const d of deals) {
    const p = (d.phase || 'searching') as string;
    if (!byPhase[p]) byPhase[p] = { count: 0, value: 0 };
    byPhase[p].count += 1;
    const v =
      d.agreed_price != null
        ? Number(d.agreed_price)
        : d.closing_amount != null
        ? Number(d.closing_amount)
        : listPriceBySearch[d.id] ?? 0;
    byPhase[p].value += Number.isFinite(v) ? v : 0;
  }
  const maxPhaseCount = Math.max(1, ...Object.values(byPhase).map((p) => p.count));

  // --- Top realtors this quarter (admin view only) -----------------------
  let topRealtors: { id: string; name: string; closed: number; total: number }[] =
    [];
  if (isAdmin) {
    const closedThisQuarterAll = deals.filter(
      (d) =>
        d.phase === 'closed' &&
        d.closing_date &&
        new Date(d.closing_date) >= quarterStart
    );
    const tally: Record<string, { closed: number; total: number; name: string }> =
      {};
    for (const d of closedThisQuarterAll) {
      const rid = d.realtor_id;
      if (!rid) continue;
      const name =
        d.realtor?.full_name ||
        d.realtor?.email ||
        'Unknown realtor';
      if (!tally[rid]) tally[rid] = { closed: 0, total: 0, name };
      tally[rid].closed += 1;
      tally[rid].total += d.closing_amount ? Number(d.closing_amount) : 0;
    }
    topRealtors = Object.entries(tally)
      .map(([id, v]) => ({ id, name: v.name, closed: v.closed, total: v.total }))
      .sort((a, b) => b.closed - a.closed || b.total - a.total)
      .slice(0, 10);
  }

  // --- Deals stuck > 30 days in current phase ----------------------------
  // Heuristic: updated_at hasn't moved in 30+ days AND phase != 'closed'.
  // We don't track phase-enter timestamps separately, but updated_at gets
  // bumped on every phase change in practice.
  const stuckDeals = deals
    .filter(
      (d) =>
        d.phase !== 'closed' &&
        d.updated_at &&
        new Date(d.updated_at).toISOString() < stuckCutoffIso
    )
    .map((d) => ({
      id: d.id,
      name: d.name,
      phase: d.phase,
      client:
        d.client?.full_name || d.client?.email || 'Unnamed client',
      days: Math.floor(
        (Date.now() - new Date(d.updated_at!).getTime()) /
          (1000 * 60 * 60 * 24)
      ),
    }))
    .sort((a, b) => b.days - a.days)
    .slice(0, 15);

  // --- Activity stream ---------------------------------------------------
  const activities = (((activitiesRaw || []) as unknown) as ActivityRow[])
    .filter((a) => {
      if (isAdmin) return true;
      // realtor: only their own searches
      return a.search?.realtor_id === me.user_id;
    })
    .slice(0, 20);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link
            href="/dashboard"
            className="text-xs font-semibold text-ink-500 transition hover:text-ink-900"
          >
            ← Dashboard
          </Link>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-ink-900">
            Analytics
          </h1>
          <p className="mt-1 text-sm text-ink-600">
            {isAdmin
              ? `Firm-wide performance for ${me.firm_name || 'your firm'}.`
              : 'Your personal performance — only the deals assigned to you.'}
          </p>
        </div>
        {!isAdmin && (
          <span className="rounded-full border border-ink-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink-600">
            Limited view
          </span>
        )}
      </header>

      {/* KPI row */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Active deals"
          value={activeDealCount.toLocaleString()}
          accent="blue"
          sub={`${deals.length} total`}
        />
        <Kpi
          label="Pipeline value"
          value={formatMoney(pipelineValue)}
          accent="emerald"
          sub="Active deals · agreed or list price"
        />
        <Kpi
          label="Closed this month"
          value={closedThisMonthCount.toLocaleString()}
          accent="violet"
          sub={formatMoney(closedThisMonthAmount)}
        />
        <Kpi
          label="Avg days to close"
          value={avgDaysToClose != null ? `${avgDaysToClose}` : '—'}
          accent="amber"
          sub={`${closedThisQuarter.length} closed this quarter`}
        />
      </section>

      {/* Pipeline by phase */}
      <section className="mt-8 overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-soft">
        <div className="flex items-baseline justify-between border-b border-ink-100 px-5 py-3">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-ink-500">
            Pipeline by phase
          </h2>
          <span className="text-xs text-ink-500">
            {deals.length} {deals.length === 1 ? 'deal' : 'deals'}
          </span>
        </div>
        <div className="divide-y divide-ink-100">
          {PHASES.map((p) => {
            const row = byPhase[p] || { count: 0, value: 0 };
            const pct = Math.round((row.count / maxPhaseCount) * 100);
            return (
              <div
                key={p}
                className="grid grid-cols-12 items-center gap-3 px-5 py-3 text-sm"
              >
                <div className="col-span-3 truncate font-medium capitalize text-ink-800">
                  {prettyPhase(p)}
                </div>
                <div className="col-span-6">
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-ink-100">
                    <div
                      className={
                        'h-full rounded-full ' + phaseBar(p)
                      }
                      style={{ width: pct + '%' }}
                    />
                  </div>
                </div>
                <div className="col-span-1 text-right font-semibold tabular-nums text-ink-900">
                  {row.count}
                </div>
                <div className="col-span-2 text-right text-xs tabular-nums text-ink-500">
                  {row.value > 0 ? formatMoney(row.value) : '—'}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {/* Top realtors (admin) or empty-state placeholder (realtor) */}
        {isAdmin ? (
          <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-soft">
            <div className="flex items-baseline justify-between border-b border-ink-100 px-5 py-3">
              <h2 className="text-[11px] font-bold uppercase tracking-wider text-ink-500">
                Top realtors this quarter
              </h2>
              <span className="text-xs text-ink-500">
                {closedThisQuarter.length} closed
              </span>
            </div>
            {topRealtors.length === 0 ? (
              <div className="bg-dotted px-5 py-10 text-center text-sm text-ink-500">
                No closed deals this quarter yet.
              </div>
            ) : (
              <ol className="divide-y divide-ink-100">
                {topRealtors.map((r, i) => {
                  const max = topRealtors[0]?.closed || 1;
                  const pct = Math.round((r.closed / max) * 100);
                  return (
                    <li
                      key={r.id}
                      className="grid grid-cols-12 items-center gap-3 px-5 py-3 text-sm"
                    >
                      <div className="col-span-1 text-xs font-semibold text-ink-400">
                        {i + 1}
                      </div>
                      <div className="col-span-4 truncate font-medium text-ink-900">
                        {r.name}
                      </div>
                      <div className="col-span-5">
                        <div className="h-2 w-full overflow-hidden rounded-full bg-ink-100">
                          <div
                            className="h-full rounded-full bg-emerald-500"
                            style={{ width: pct + '%' }}
                          />
                        </div>
                      </div>
                      <div className="col-span-1 text-right text-sm font-semibold tabular-nums">
                        {r.closed}
                      </div>
                      <div className="col-span-1 text-right text-xs tabular-nums text-ink-500">
                        {r.total > 0 ? formatMoney(r.total) : '—'}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        ) : (
          <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-soft">
            <div className="border-b border-ink-100 px-5 py-3">
              <h2 className="text-[11px] font-bold uppercase tracking-wider text-ink-500">
                Your closings this quarter
              </h2>
            </div>
            <div className="px-5 py-4 text-sm">
              <div className="text-3xl font-bold tabular-nums">
                {closedThisQuarter.length}
              </div>
              <div className="mt-1 text-xs text-ink-500">
                {closedThisQuarter.length > 0
                  ? formatMoney(
                      closedThisQuarter.reduce(
                        (s, d) =>
                          s + (d.closing_amount ? Number(d.closing_amount) : 0),
                        0
                      )
                    ) + ' total volume'
                  : 'No closes recorded this quarter yet.'}
              </div>
            </div>
          </section>
        )}

        {/* Stuck deals */}
        <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-soft">
          <div className="flex items-baseline justify-between border-b border-ink-100 px-5 py-3">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-ink-500">
              Stuck &gt; 30 days
            </h2>
            <span className="text-xs text-ink-500">
              {stuckDeals.length} {stuckDeals.length === 1 ? 'deal' : 'deals'}
            </span>
          </div>
          {stuckDeals.length === 0 ? (
            <div className="bg-dotted px-5 py-10 text-center text-sm text-ink-500">
              Nothing has stalled — nice work.
            </div>
          ) : (
            <ul className="divide-y divide-ink-100">
              {stuckDeals.map((d) => (
                <li key={d.id}>
                  <Link
                    href={`/dashboard/deals/${d.id}`}
                    className="flex items-center gap-3 px-5 py-3 transition hover:bg-ink-50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-ink-900">
                        {d.name || d.client}
                      </div>
                      <div className="truncate text-xs text-ink-500">
                        {d.client} ·{' '}
                        <span className="capitalize">{prettyPhase(d.phase)}</span>
                      </div>
                    </div>
                    <span
                      className={
                        'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ' +
                        (d.days > 60
                          ? 'bg-rose-100 text-rose-700'
                          : 'bg-amber-100 text-amber-800')
                      }
                    >
                      {d.days}d
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Activity stream */}
      <section className="mt-8 overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-soft">
        <div className="flex items-baseline justify-between border-b border-ink-100 px-5 py-3">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-ink-500">
            Recent activity
          </h2>
          <span className="text-xs text-ink-500">last {activities.length}</span>
        </div>
        {activities.length === 0 ? (
          <div className="bg-dotted px-5 py-10 text-center text-sm text-ink-500">
            No activity recorded yet.
          </div>
        ) : (
          <ol className="divide-y divide-ink-100">
            {activities.map((a) => (
              <li key={a.id}>
                <Link
                  href={
                    a.search_id ? `/dashboard/deals/${a.search_id}` : '/dashboard'
                  }
                  className="flex items-start gap-3 px-5 py-3 transition hover:bg-ink-50"
                >
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-ink-900">
                      <strong className="font-semibold">
                        {a.actor?.full_name || a.actor?.email || 'Someone'}
                      </strong>{' '}
                      <span className="text-ink-700">
                        {humanizeAction(a.action)}
                      </span>
                      {a.target && (
                        <span className="text-ink-700">
                          {' '}
                          {prettyTarget(a.action, a.target)}
                        </span>
                      )}
                      {a.search?.name && (
                        <span className="text-ink-500"> · {a.search.name}</span>
                      )}
                    </div>
                  </div>
                  <time className="shrink-0 text-xs text-ink-400">
                    {timeAgo(a.created_at)}
                  </time>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}

/* ---------- helpers ---------- */

type DealRow = {
  id: string;
  name: string | null;
  kind: string | null;
  phase: string | null;
  agreed_price: number | null;
  closing_amount: number | null;
  closing_date: string | null;
  commission_pct: number | null;
  created_at: string | null;
  updated_at: string | null;
  realtor_id: string | null;
  client: { id: string; full_name: string | null; email: string | null } | null;
  realtor: { id: string; full_name: string | null; email: string | null } | null;
};

type HouseRow = {
  search_id: string | null;
  list_price: number | null;
  created_at: string | null;
};

type ActivityRow = {
  id: string;
  action: string;
  target: string | null;
  created_at: string;
  search_id: string | null;
  actor: { full_name: string | null; email: string | null } | null;
  search: { id: string; name: string | null; realtor_id: string | null } | null;
};

function Kpi({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent: 'blue' | 'emerald' | 'violet' | 'amber';
}) {
  const bar =
    accent === 'blue'
      ? 'bg-blue-600'
      : accent === 'emerald'
      ? 'bg-emerald-600'
      : accent === 'violet'
      ? 'bg-ink-700'
      : 'bg-amber-500';
  return (
    <div className="relative overflow-hidden rounded-2xl border border-ink-200 bg-white p-5 shadow-soft">
      <div className={'absolute inset-x-0 top-0 h-1 ' + bar} />
      <div className="text-[11px] font-bold uppercase tracking-wider text-ink-500">
        {label}
      </div>
      <div className="mt-1 text-3xl font-bold tracking-tight text-ink-900 tabular-nums">
        {value}
      </div>
      {sub && (
        <div className="mt-1 truncate text-xs text-ink-500" title={sub}>
          {sub}
        </div>
      )}
    </div>
  );
}

function formatMoney(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '$0';
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1) + 'M';
  if (n >= 1_000) return '$' + Math.round(n / 1_000) + 'K';
  return '$' + Math.round(n).toLocaleString();
}

function phaseBar(phase: string): string {
  switch (phase) {
    case 'searching':
      return 'bg-ink-400';
    case 'offer_made':
      return 'bg-blue-500';
    case 'counter_offer':
      return 'bg-blue-700';
    case 'under_contract':
      return 'bg-ink-700';
    case 'closing':
      return 'bg-amber-500';
    case 'closed':
      return 'bg-emerald-500';
    default:
      return 'bg-ink-400';
  }
}

function prettyPhase(p: string | null | undefined): string {
  if (!p) return '—';
  return p.replace(/_/g, ' ');
}

function humanizeAction(action: string): string {
  const map: Record<string, string> = {
    phase_change: 'moved the deal to',
    house_added: 'added a house —',
    tour_confirmed: 'confirmed a tour for',
    tour_declined: 'declined a tour for',
    tour_requested: 'requested a tour for',
    document_uploaded: 'uploaded',
    important_date_added: 'added an important date —',
    alert: 'sent an alert —',
    attorney_added: 'added an attorney —',
    co_realtor_added: 'added a co-realtor —',
    buyer_added: 'added a buyer —',
    seller_added: 'added a seller —',
    docusign_linked: 'linked a DocuSign envelope',
    deal_updated: 'updated deal details —',
    message: 'sent a message',
  };
  return map[action] || action.replace(/_/g, ' ');
}

function prettyTarget(action: string, target: string | null) {
  if (!target) return '';
  if (action === 'phase_change') {
    const map: Record<string, string> = {
      searching: 'Searching',
      offer_made: 'Offer Made',
      counter_offer: 'Counter Offer',
      under_contract: 'Under Contract',
      closing: 'Closing',
      closed: 'Closed',
    };
    return map[target] || target;
  }
  return target;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'now';
  if (m < 60) return m + 'm';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h';
  const d = Math.floor(h / 24);
  return d + 'd';
}
