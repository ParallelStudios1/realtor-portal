import Link from 'next/link';
import { getMe, getSupabaseServerClient } from '@/lib/supabaseSsr';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Attorney dashboard' };

/**
 * Attorney-facing dashboard. Lists every deal where the signed-in attorney's
 * email matches `client_searches.attorney_email`. Read-only by design — they
 * see documents, important dates, financials, and contract URL but can't
 * modify anything.
 */
export default async function AttorneyDashboardPage() {
  const me = await getMe();
  const supabase = getSupabaseServerClient();
  const service = getSupabaseServiceRoleClient();

  if (!me?.user_id) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-2xl font-bold">Sign in required</h1>
        <p className="mt-2 text-sm text-slate-600">
          You need a Realtor Portal account before you can see deals you're on.
        </p>
        <Link
          href="/login"
          className="mt-4 inline-block rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
        >
          Sign in →
        </Link>
      </main>
    );
  }

  // Find every deal whose attorney_email matches my email (case-insensitive).
  // Use service role here so the attorney sees the right rows even if their
  // public.users row has a different firm_id (which it always will).
  const { data: deals } = await service
    .from('client_searches')
    .select(
      `id, name, phase, agreed_price, closing_amount, earnest_money,
       commission_pct, contract_url, attorney_name, attorney_phone, created_at, updated_at,
       firm:firms ( id, name, logo_url, brand_color, contact_email, contact_phone ),
       client:users!client_searches_client_id_fkey ( id, full_name, email ),
       realtor:users!client_searches_realtor_id_fkey ( id, full_name, email )`
    )
    .ilike('attorney_email', me.email);

  const list = (deals as any[] | null) || [];

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Your deals</h1>
        <p className="mt-1 text-sm text-slate-600">
          Every deal a realtor has added you to as the attorney. Tap one to see
          the contract, important dates, and documents.
        </p>
      </header>

      {list.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <h2 className="font-semibold">No deals yet</h2>
          <p className="mt-1 text-sm text-slate-600">
            A realtor will add you to a deal using your email
            <span className="ml-1 font-mono">({me.email})</span>. Once they do,
            it'll appear here automatically.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {list.map((d: any) => (
            <Link
              key={d.id}
              href={`/attorney/deals/${d.id}`}
              className="group block rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow-md"
            >
              <div className="flex items-baseline justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold uppercase tracking-wide text-slate-500">
                    {d.firm?.name || 'Realtor'}
                  </div>
                  <h2 className="mt-1 truncate text-lg font-semibold text-slate-900">
                    {d.client?.full_name || d.client?.email || 'Client'}
                  </h2>
                </div>
                <span
                  className="shrink-0 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium uppercase tracking-wide text-blue-700"
                  style={{
                    backgroundColor: (d.firm?.brand_color || '#0F172A') + '15',
                    color: d.firm?.brand_color || '#0F172A',
                  }}
                >
                  {String(d.phase || '').replace(/_/g, ' ')}
                </span>
              </div>

              {(d.agreed_price || d.closing_amount) && (
                <div className="mt-3 flex items-baseline gap-3 text-sm">
                  {d.agreed_price && (
                    <div>
                      <span className="text-slate-500">Agreed </span>
                      <span className="font-semibold">
                        ${Number(d.agreed_price).toLocaleString()}
                      </span>
                    </div>
                  )}
                  {d.closing_amount && (
                    <div>
                      <span className="text-slate-500">Closing </span>
                      <span className="font-semibold">
                        ${Number(d.closing_amount).toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              )}

              <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                <span>Realtor: {d.realtor?.full_name || d.realtor?.email}</span>
                <span className="transition group-hover:translate-x-0.5">→</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
