import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getMe, getSupabaseServerClient } from '@/lib/supabaseSsr';
import { ClientProfileActions } from './ClientProfileActions';
import { formatDateOnly } from '@/lib/dates';
import { LocalDateTime } from '@/components/LocalDateTime';

export const dynamic = 'force-dynamic';

/**
 * Client profile — a *person*, not a transaction.
 *
 * A client can have many deals over time (this year's buyer search, next
 * year's listing, the investment property after that). The profile page
 * shows everything that follows the human (contact info, deals across all
 * firms, notes, history) and lets the realtor spin up a new deal whenever
 * one materializes.
 *
 * The Deals menu lives at /dashboard/deals — this page is for "what's this
 * person about" not "what's happening on a specific transaction."
 */
const PHASE_TONE: Record<string, string> = {
  searching: 'bg-ink-100 text-ink-700',
  awaiting_offer: 'bg-amber-100 text-amber-800',
  offer_made: 'bg-amber-100 text-amber-800',
  counter_offer: 'bg-amber-100 text-amber-800',
  under_contract: 'bg-blue-100 text-blue-800',
  closing: 'bg-blue-100 text-blue-800',
  closed: 'bg-emerald-100 text-emerald-800',
};

export default async function ClientProfilePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { welcome?: string };
}) {
  const me = await getMe();
  if (!me) {
    redirect('/login');
  }
  const supabase = getSupabaseServerClient();

  const { data: client } = await supabase
    .from('users')
    .select('id, full_name, email, role, phone, firm_id, created_at')
    .eq('id', params.id)
    .eq('firm_id', me.firm_id!)
    .maybeSingle();
  if (!client) notFound();

  const { data: deals } = await supabase
    .from('client_searches')
    .select(
      'id, kind, phase, name, agreed_price, closing_amount, offer_amount, counter_offer_amount, closing_date, created_at, updated_at'
    )
    .eq('client_id', params.id)
    .eq('firm_id', me.firm_id!)
    .order('created_at', { ascending: false });

  const dealList = (deals as any[] | null) || [];
  const activeCount = dealList.filter((d) => d.phase !== 'closed').length;
  const closedCount = dealList.filter((d) => d.phase === 'closed').length;

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <nav className="mb-4 text-xs">
        <Link href="/dashboard/clients" className="font-semibold text-ink-500 hover:text-ink-900">
          ← All clients
        </Link>
      </nav>

      {searchParams?.welcome === '1' && (
        <div className="mb-6 flex items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm">
          <div>
            <strong className="text-blue-900">Client invited.</strong>{' '}
            <span className="text-blue-800">
              They&apos;ll get a sign-in email. Start their first deal whenever it
              materializes — no auto-deal anymore.
            </span>
          </div>
        </div>
      )}

      {/* Hero */}
      <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-soft">
        <div className="flex flex-wrap items-start gap-4 p-6">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-ink-900 text-lg font-bold text-white">
            {initials(client.full_name || client.email)}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold tracking-tight">
              {client.full_name || client.email}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500">
              <a
                href={'mailto:' + client.email}
                className="hover:text-blue-600"
              >
                {client.email}
              </a>
              {client.phone && (
                <>
                  <span>·</span>
                  <a
                    href={'tel:' + client.phone}
                    className="hover:text-blue-600"
                  >
                    {client.phone}
                  </a>
                </>
              )}
              <span>·</span>
              <span>
                joined <LocalDateTime value={client.created_at} dateOptions={{}} />
              </span>
            </div>
            <div className="mt-2 flex gap-2 text-[11px]">
              <span className="rounded-full bg-ink-100 px-2 py-0.5 font-semibold text-ink-700">
                {activeCount} active deal{activeCount === 1 ? '' : 's'}
              </span>
              {closedCount > 0 && (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-800">
                  {closedCount} closed
                </span>
              )}
            </div>
          </div>
          <ClientProfileActions clientId={params.id} clientName={client.full_name || client.email} />
        </div>
      </section>

      {/* Deals list */}
      <section className="mt-6 overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-soft">
        <div className="flex items-center justify-between border-b border-ink-100 px-5 py-3.5">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-ink-500">
            Deals ({dealList.length})
          </h2>
          <span className="text-[11px] text-ink-400">
            Each deal is its own workspace.
          </span>
        </div>
        {dealList.length === 0 ? (
          <div className="bg-dotted px-5 py-10 text-center text-sm text-ink-500">
            No deals yet for this client.{' '}
            <span className="text-ink-700">Hit + New deal above when one starts.</span>
          </div>
        ) : (
          <ul className="divide-y divide-ink-100">
            {dealList.map((d: any) => (
              <li key={d.id}>
                <Link
                  href={`/dashboard/deals/${d.id}`}
                  className="flex flex-wrap items-center gap-3 px-5 py-3 transition hover:bg-ink-50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">
                      {d.name ||
                        (d.kind === 'seller' ? 'Listing deal' : 'Buyer deal')}
                    </div>
                    <div className="text-xs text-ink-500">
                      Started <LocalDateTime value={d.created_at} dateOptions={{}} />
                      {d.closing_date && ' · Closing ' + formatDateOnly(d.closing_date)}
                    </div>
                  </div>
                  <span
                    className={
                      'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ' +
                      (PHASE_TONE[d.phase as string] || PHASE_TONE.searching)
                    }
                  >
                    {String(d.phase).replace(/_/g, ' ')}
                  </span>
                  {d.agreed_price && (
                    <span className="shrink-0 text-xs font-semibold text-ink-700">
                      ${Number(d.agreed_price).toLocaleString()}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function initials(s: string | null | undefined) {
  if (!s) return '?';
  return s.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}
