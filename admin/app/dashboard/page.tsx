import Link from 'next/link';
import { getMe, getSupabaseServerClient } from '@/lib/supabaseSsr';

export const dynamic = 'force-dynamic';

export default async function DashboardOverviewPage() {
  const me = (await getMe())!;
  const supabase = getSupabaseServerClient();

  const [{ count: clientCount }, { count: dealCount }, { data: recentDeals }] = await Promise.all([
    supabase.from('users').select('id', { count: 'exact', head: true }).eq('role', 'client').eq('firm_id', me.firm_id!),
    supabase.from('client_searches').select('id', { count: 'exact', head: true }).eq('firm_id', me.firm_id!).neq('phase', 'closed'),
    supabase
      .from('client_searches')
      .select(
        `id, name, phase, updated_at,
         client:users!client_searches_client_id_fkey ( id, full_name, email )`
      )
      .eq('firm_id', me.firm_id!)
      .order('updated_at', { ascending: false })
      .limit(5),
  ]);

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Welcome back, {me.full_name?.split(' ')[0]}
          </h1>
          <p className="mt-1 text-sm text-slate-600">Here's what's happening at {me.firm_name}.</p>
        </div>
        <Link
          href="/dashboard/clients/new"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          + Invite client
        </Link>
      </header>

      {/* KPI cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card label="Clients" value={clientCount ?? 0} href="/dashboard/clients" />
        <Card label="Active deals" value={dealCount ?? 0} href="/dashboard/clients" />
        <Card
          label={me.firm_status === 'trial' ? 'Trial' : 'Plan'}
          value={trialStatusLabel(me)}
          href="/dashboard/billing"
        />
      </div>

      {/* Recent deals */}
      <section className="mt-10">
        <h2 className="mb-3 text-lg font-semibold">Recent activity</h2>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {!recentDeals || recentDeals.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              No deals yet.{' '}
              <Link href="/dashboard/clients/new" className="font-medium text-blue-600 hover:underline">
                Invite your first client →
              </Link>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">Property</th>
                  <th className="px-4 py-3">Phase</th>
                  <th className="px-4 py-3">Updated</th>
                </tr>
              </thead>
              <tbody>
                {recentDeals.map((d: any) => (
                  <tr
                    key={d.id}
                    className="cursor-pointer border-b border-slate-100 transition hover:bg-slate-50 last:border-0"
                  >
                    <td className="px-4 py-3 font-medium">
                      <Link
                        href={`/dashboard/clients/${d.client?.id}`}
                        className="block"
                      >
                        {d.client?.full_name || d.client?.email || '—'}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {d.name || 'Deal'}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                        {String(d.phase || 'pending').replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {new Date(d.updated_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Quick links */}
      <section className="mt-10 grid gap-4 md:grid-cols-2">
        <QuickAction
          title="Make it yours"
          body="Update your logo, brand colors, and contact info."
          href="/dashboard/branding"
          cta="Edit branding"
        />
        <QuickAction
          title="Get the mobile app"
          body="Download Realtor Portal on your phone to manage clients on the go."
          href="/dashboard/settings#mobile"
          cta="Get the app"
        />
      </section>
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

function Card({ label, value, href }: { label: string; value: string | number; href: string }) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-slate-200 bg-white p-5 transition hover:border-slate-300 hover:shadow-sm"
    >
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-3xl font-bold">{value}</div>
    </Link>
  );
}

function QuickAction({
  title,
  body,
  href,
  cta,
}: {
  title: string;
  body: string;
  href: string;
  cta: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-slate-600">{body}</p>
      <Link
        href={href}
        className="mt-4 inline-block rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50"
      >
        {cta} →
      </Link>
    </div>
  );
}
