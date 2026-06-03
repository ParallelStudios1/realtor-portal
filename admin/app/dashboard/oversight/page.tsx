import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getMe } from '@/lib/supabaseSsr';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';

export const dynamic = 'force-dynamic';

/**
 * Broker oversight — firm-wide deadline health.
 *
 * Gated to owners / firm_admins / super_admins. Lists OVERDUE deadlines
 * (date < today, not completed, not acknowledged) and AT-RISK deadlines
 * (due within 2 days, not acknowledged, not completed), grouped by the
 * agent responsible (date owner, else the deal's assigned realtor). Each
 * row deep-links into the deal so the broker can jump in.
 *
 * (A sibling /dashboard/oversight/approvals is owned by another feature.)
 */
const BROKER_ROLES = ['owner', 'firm_admin', 'super_admin'];

type Row = {
  id: string;
  label: string;
  date: string;
  search_id: string;
  acknowledged_at: string | null;
  escalated_at: string | null;
  owner_user_id: string | null;
  deal_name: string | null;
  agent_id: string | null;
  agent_name: string | null;
};

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysUntil(date: string): number {
  const day = String(date).slice(0, 10);
  const target = new Date(day + 'T00:00:00.000Z').getTime();
  const today = new Date(todayUtc() + 'T00:00:00.000Z').getTime();
  return Math.round((target - today) / 86_400_000);
}

export default async function OversightPage() {
  const me = await getMe();
  if (!me) redirect('/login');
  if (!me.firm_id) redirect('/login');
  if (!BROKER_ROLES.includes(me.role || '')) redirect('/dashboard');

  const service = getSupabaseServiceRoleClient();
  const today = todayUtc();
  // Window for AT-RISK: today .. today+2 days (UTC).
  const horizon = new Date(today + 'T00:00:00.000Z');
  horizon.setUTCDate(horizon.getUTCDate() + 2);
  const horizonStr = horizon.toISOString().slice(0, 10);

  // Pull all firm dates that are either overdue OR within the at-risk window,
  // not yet completed. We split + filter acknowledged in JS.
  const { data: raw } = await service
    .from('important_dates')
    .select(
      `id, label, date, search_id, acknowledged_at, escalated_at, owner_user_id,
       owner:users!important_dates_owner_user_id_fkey ( id, full_name, email ),
       search:client_searches!important_dates_search_id_fkey (
         id, name, realtor_id,
         realtor:users!client_searches_realtor_id_fkey ( id, full_name, email )
       )`
    )
    .eq('firm_id', me.firm_id)
    .is('completed_at', null)
    .lte('date', horizonStr)
    .order('date', { ascending: true });

  const rows: Row[] = ((raw as any[] | null) || []).map((d) => {
    const owner = d.owner;
    const realtor = d.search?.realtor;
    const agent = owner || realtor || null;
    return {
      id: d.id,
      label: d.label,
      date: d.date,
      search_id: d.search_id,
      acknowledged_at: d.acknowledged_at,
      escalated_at: d.escalated_at,
      owner_user_id: d.owner_user_id,
      deal_name: d.search?.name ?? null,
      agent_id: agent?.id ?? null,
      agent_name: agent ? agent.full_name || agent.email : null,
    };
  });

  // OVERDUE: date < today, not acknowledged.
  const overdue = rows.filter((r) => daysUntil(r.date) < 0 && !r.acknowledged_at);
  // AT-RISK: 0..2 days out, not acknowledged.
  const atRisk = rows.filter((r) => {
    const du = daysUntil(r.date);
    return du >= 0 && du <= 2 && !r.acknowledged_at;
  });

  const overdueByAgent = groupByAgent(overdue);
  const atRiskByAgent = groupByAgent(atRisk);

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6">
        <nav className="mb-2 flex items-center gap-2 text-xs text-ink-500">
          <Link href="/dashboard" className="font-semibold transition hover:text-ink-900">
            Dashboard
          </Link>
          <span>/</span>
          <span className="font-semibold text-ink-900">Oversight</span>
        </nav>
        <div className="text-[11px] font-bold uppercase tracking-wider text-ink-500">
          Broker view
        </div>
        <h1 className="mt-1.5 text-3xl font-bold tracking-tight text-ink-900">
          Deadline oversight
        </h1>
        <p className="mt-1 text-sm text-ink-600">
          Firm-wide view of overdue and at-risk deadlines, grouped by the agent
          responsible. Acknowledged deadlines are hidden.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard label="Overdue" value={overdue.length} tone="rose" />
        <StatCard label="At risk (≤2 days)" value={atRisk.length} tone="amber" />
      </div>

      <Section title="Overdue" empty="Nothing overdue. Nice." groups={overdueByAgent} tone="rose" />
      <Section title="At risk" empty="No deadlines coming due in the next two days." groups={atRiskByAgent} tone="amber" />
    </main>
  );
}

function groupByAgent(rows: Row[]): Array<{ agent: string; rows: Row[] }> {
  const map = new Map<string, { agent: string; rows: Row[] }>();
  for (const r of rows) {
    const key = r.agent_id || 'unassigned';
    const label = r.agent_name || 'Unassigned';
    if (!map.has(key)) map.set(key, { agent: label, rows: [] });
    map.get(key)!.rows.push(r);
  }
  return Array.from(map.values()).sort((a, b) => b.rows.length - a.rows.length);
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'rose' | 'amber';
}) {
  const accent = tone === 'rose' ? 'text-rose-700' : 'text-amber-700';
  const bar = tone === 'rose' ? 'bg-rose-500' : 'bg-amber-500';
  return (
    <div className="relative overflow-hidden rounded-2xl border border-ink-200 bg-white p-5 shadow-soft-sm">
      <div className={'absolute inset-x-0 top-0 h-1 ' + bar} />
      <div className="text-[11px] font-bold uppercase tracking-wider text-ink-500">
        {label}
      </div>
      <div className={'mt-1.5 text-3xl font-bold tabular-nums ' + accent}>{value}</div>
    </div>
  );
}

function Section({
  title,
  empty,
  groups,
  tone,
}: {
  title: string;
  empty: string;
  groups: Array<{ agent: string; rows: Row[] }>;
  tone: 'rose' | 'amber';
}) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-ink-500">
        {title}
      </h2>
      {groups.length === 0 ? (
        <div className="bg-dotted rounded-2xl border border-ink-200 bg-white px-5 py-10 text-center text-sm text-ink-500 shadow-soft-sm">
          {empty}
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <div
              key={g.agent}
              className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-soft-sm"
            >
              <div className="flex items-center justify-between border-b border-ink-100 px-5 py-3">
                <span className="text-sm font-semibold text-ink-900">{g.agent}</span>
                <span className="text-xs text-ink-500">
                  {g.rows.length} deadline{g.rows.length === 1 ? '' : 's'}
                </span>
              </div>
              <ul className="divide-y divide-ink-100">
                {g.rows.map((r) => {
                  const du = daysUntil(r.date);
                  const overdue = du < 0;
                  return (
                    <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                      <span
                        className={
                          'rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase ' +
                          (overdue ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800')
                        }
                      >
                        {overdue
                          ? `${Math.abs(du)}d overdue`
                          : du === 0
                          ? 'Due today'
                          : `Due in ${du}d`}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-ink-900">
                          {r.label}
                        </div>
                        <div className="text-xs text-ink-500">
                          {r.deal_name || 'Deal'} ·{' '}
                          {new Date(String(r.date).slice(0, 10) + 'T00:00:00.000Z').toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            timeZone: 'UTC',
                          })}
                          {r.escalated_at ? ' · escalated' : ''}
                        </div>
                      </div>
                      <Link
                        href={`/dashboard/deals/${r.search_id}`}
                        className="shrink-0 rounded-md border border-ink-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-ink-700 transition hover:bg-ink-50"
                      >
                        Open deal
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
