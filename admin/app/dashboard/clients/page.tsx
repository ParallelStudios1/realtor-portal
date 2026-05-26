import Link from 'next/link';
import { getMe, getSupabaseServerClient } from '@/lib/supabaseSsr';

export const dynamic = 'force-dynamic';

/**
 * Clients list. Secondary to /dashboard/deals — this is the people view,
 * deals is the work view. Clicking a row jumps to that client's most recent
 * deal workspace (or empty state if they have none yet).
 */
export default async function ClientsListPage() {
  const me = await getMe();
  if (!me) {
    const { redirect } = await import('next/navigation');
    redirect('/login');
  }
  const supabase = getSupabaseServerClient();

  // Pull clients + each client's most recent deal id + deal count.
  const { data: clients } = await supabase
    .from('users')
    .select('id, full_name, email, created_at')
    .eq('role', 'client')
    .eq('firm_id', me.firm_id!)
    .order('created_at', { ascending: false });

  // Lookup each client's latest deal (one query).
  const ids = (clients || []).map((c: any) => c.id);
  let dealMap: Record<string, { id: string; phase: string; updated_at: string }> = {};
  let countMap: Record<string, number> = {};
  if (ids.length > 0) {
    const { data: rows } = await supabase
      .from('client_searches')
      .select('id, client_id, phase, updated_at')
      .eq('firm_id', me.firm_id!)
      .in('client_id', ids)
      .order('updated_at', { ascending: false });
    for (const r of rows || []) {
      countMap[(r as any).client_id] = (countMap[(r as any).client_id] || 0) + 1;
      if (!dealMap[(r as any).client_id]) {
        dealMap[(r as any).client_id] = {
          id: (r as any).id,
          phase: (r as any).phase,
          updated_at: (r as any).updated_at,
        };
      }
    }
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Clients</h1>
          <p className="mt-1 text-sm text-slate-600">
            {clients?.length || 0} {clients?.length === 1 ? 'client' : 'clients'} in your portal.
            <Link
              href="/dashboard/deals"
              className="ml-2 font-semibold text-blue-600 hover:underline"
            >
              Looking for deals? →
            </Link>
          </p>
        </div>
        <Link
          href="/dashboard/clients/new"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-700"
        >
          + Invite client
        </Link>
      </header>

      {!clients || clients.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <h3 className="font-semibold">No clients yet</h3>
          <p className="mt-1 text-sm text-slate-600">
            Invite buyers and sellers — they'll get a one-tap link to your
            branded app.
          </p>
          <Link
            href="/dashboard/clients/new"
            className="mt-4 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
          >
            + Invite your first client
          </Link>
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {clients.map((c: any) => {
            const latest = dealMap[c.id];
            const dealCount = countMap[c.id] || 0;
            const href = latest
              ? '/dashboard/deals/' + latest.id
              : '/dashboard/deals';
            return (
              <li key={c.id}>
                <Link
                  href={href}
                  className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-700">
                      {initials(c.full_name || c.email)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">
                        {c.full_name || '—'}
                      </div>
                      <div className="truncate text-xs text-slate-500">
                        {c.email}
                      </div>
                    </div>
                    {latest ? (
                      <span className="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase text-blue-700">
                        {String(latest.phase).replace(/_/g, ' ')}
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-500">
                        No deal
                      </span>
                    )}
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] text-slate-500">
                    <span>
                      {dealCount === 0
                        ? 'No deals yet'
                        : dealCount + ' deal' + (dealCount === 1 ? '' : 's')}
                    </span>
                    <span>
                      Joined {new Date(c.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
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
