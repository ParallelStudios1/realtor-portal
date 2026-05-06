import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getMe } from '@/lib/supabaseSsr';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';

export const dynamic = 'force-dynamic';

/**
 * Super-admin home — Parallel Studios internal view of every firm.
 * Gated by role check on the public.users row.
 */
export default async function SuperAdminPage() {
  const me = await getMe();
  if (!me) redirect('/login');
  if (me.role !== 'super_admin') {
    return (
      <main className="mx-auto max-w-md p-12 text-center">
        <h1 className="text-2xl font-bold">Not authorized</h1>
        <p className="mt-2 text-sm text-slate-600">
          This area is for Parallel Studios staff only.
        </p>
        <Link href="/dashboard" className="mt-4 inline-block text-blue-600 hover:underline">
          Back to your dashboard
        </Link>
      </main>
    );
  }

  const service = getSupabaseServiceRoleClient();
  const { data: firms, error } = await service
    .from('firms')
    .select('id, name, subdomain, status, brand_color, logo_url, created_at, trial_ends_at')
    .order('created_at', { ascending: false });

  return (
    <main className="mx-auto max-w-6xl p-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">All firms (super-admin)</h1>
        <p className="mt-1 text-sm text-slate-600">{firms?.length || 0} firms.</p>
      </header>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error.message}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Firm</th>
                <th className="px-4 py-3">Subdomain</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Trial ends</th>
                <th className="px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {(firms || []).map((f) => (
                <tr key={f.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {f.logo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={f.logo_url} alt="" className="h-6 w-6 rounded object-contain" />
                      ) : (
                        <div className="h-6 w-6 rounded" style={{ backgroundColor: f.brand_color || '#0F172A' }} />
                      )}
                      <span className="font-medium">{f.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{f.subdomain}</td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        'rounded-full px-2 py-0.5 text-xs ' +
                        (f.status === 'active'
                          ? 'bg-emerald-50 text-emerald-700'
                          : f.status === 'trial'
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-slate-100 text-slate-500')
                      }
                    >
                      {f.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {f.trial_ends_at ? new Date(f.trial_ends_at).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {new Date(f.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
