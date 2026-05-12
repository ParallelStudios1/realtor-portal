import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMe, getSupabaseServerClient } from '@/lib/supabaseSsr';
import { ClientDetailActions } from './ClientDetailActions';

export const dynamic = 'force-dynamic';

const PHASES = [
  { id: 'searching', label: 'Searching' },
  { id: 'offer_made', label: 'Offer made' },
  { id: 'under_contract', label: 'Under contract' },
  { id: 'closing', label: 'Closing' },
  { id: 'closed', label: 'Closed' },
] as const;

export default async function ClientDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const me = (await getMe())!;
  const supabase = getSupabaseServerClient();

  // Client must belong to my firm.
  const { data: client } = await supabase
    .from('users')
    .select('id, full_name, email, role, firm_id, created_at')
    .eq('id', params.id)
    .eq('firm_id', me.firm_id!)
    .maybeSingle();

  if (!client) notFound();

  // Most recent search (the "deal")
  const { data: search } = await supabase
    .from('client_searches')
    .select(
      'id, kind, phase, name, description, attorney_name, attorney_email, attorney_phone, docusign_envelope_url, co_realtor_id, started_at, created_at, agreed_price, closing_amount, earnest_money, commission_pct, contract_url, notes'
    )
    .eq('client_id', params.id)
    .eq('firm_id', me.firm_id!)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const searchId = search?.id;

  // Co-realtor info (if any)
  const { data: coRealtor } = search?.co_realtor_id
    ? await supabase
        .from('users')
        .select('full_name, email')
        .eq('id', search.co_realtor_id)
        .maybeSingle()
    : { data: null };

  // Houses for this search
  const { data: houses } = searchId
    ? await supabase
        .from('houses')
        .select('id, address, list_price, listing_url, photo_url, created_at')
        .eq('search_id', searchId)
        .order('created_at', { ascending: false })
    : { data: [] as any[] };

  // Tour requests
  const { data: tours } = searchId
    ? await supabase
        .from('tour_requests')
        .select(
          'id, status, preferred_when, notes, created_at, house:houses ( id, address )'
        )
        .eq('search_id', searchId)
        .order('created_at', { ascending: false })
        .limit(8)
    : { data: [] as any[] };

  // Important dates
  const { data: dates } = searchId
    ? await supabase
        .from('important_dates')
        .select('id, label, date, kind')
        .eq('search_id', searchId)
        .order('date', { ascending: true })
    : { data: [] as any[] };

  // Documents
  const { data: documents } = searchId
    ? await supabase
        .from('documents')
        .select('id, name, storage_path, mime_type, created_at')
        .eq('search_id', searchId)
        .order('created_at', { ascending: false })
        .limit(10)
    : { data: [] as any[] };

  // Recent activity
  const { data: activity } = searchId
    ? await supabase
        .from('activities')
        .select('id, action, target, metadata, created_at')
        .eq('search_id', searchId)
        .order('created_at', { ascending: false })
        .limit(15)
    : { data: [] as any[] };

  const phaseIdx = search?.phase
    ? PHASES.findIndex((p) => p.id === search.phase)
    : -1;

  // Other realtors in the firm (for the "Add co-realtor" picker).
  const { data: teammates } = await supabase
    .from('users')
    .select('id, full_name, email')
    .eq('firm_id', me.firm_id!)
    .in('role', ['realtor', 'firm_admin'])
    .neq('id', me.user_id);

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link
            href="/dashboard/clients"
            className="text-xs font-semibold text-slate-500 hover:text-slate-700"
          >
            ← All clients
          </Link>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">
            {client.full_name || client.email}
          </h1>
          <p className="text-sm text-slate-600">
            {client.email}
            {search?.kind ? ` · ${search.kind}` : ''}
            {' · joined '}
            {new Date(client.created_at).toLocaleDateString()}
          </p>
        </div>
        {search?.docusign_envelope_url && (
          <a
            href={search.docusign_envelope_url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-800 hover:bg-amber-100"
          >
            Open DocuSign envelope ↗
          </a>
        )}
      </div>

      {/* Phase stepper */}
      {search && (
        <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Deal phase
          </div>
          <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1">
            {PHASES.map((p, i) => {
              const done = phaseIdx >= 0 && i <= phaseIdx;
              return (
                <div key={p.id} className="flex items-center gap-2">
                  <div
                    className={
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ' +
                      (done
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 text-slate-400')
                    }
                  >
                    {i + 1}
                  </div>
                  <div
                    className={
                      'whitespace-nowrap text-xs ' +
                      (done
                        ? 'font-semibold text-slate-900'
                        : 'text-slate-500')
                    }
                  >
                    {p.label}
                  </div>
                  {i < PHASES.length - 1 && (
                    <div
                      className={
                        'h-0.5 w-6 ' +
                        (done && i < phaseIdx ? 'bg-blue-600' : 'bg-slate-200')
                      }
                    />
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Action toolbar */}
      {search && (
        <ClientDetailActions
          clientId={params.id}
          firmId={me.firm_id!}
          searchId={search.id}
          currentPhase={search.phase}
          financials={{
            agreed_price: (search as any).agreed_price ?? null,
            closing_amount: (search as any).closing_amount ?? null,
            earnest_money: (search as any).earnest_money ?? null,
            commission_pct: (search as any).commission_pct ?? null,
            contract_url: (search as any).contract_url ?? null,
            notes: (search as any).notes ?? null,
          }}
          teammates={(teammates || []) as any}
        />
      )}

      {/* Grid: left column = houses + tours, right column = dates + people + docs */}
      <div className="mt-6 grid gap-6 md:grid-cols-3">
        <div className="space-y-6 md:col-span-2">
          {/* Houses */}
          <section className="rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Houses ({houses?.length || 0})
              </h2>
            </div>
            {!houses || houses.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-slate-500">
                No houses yet. Use "Add house" above.
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {houses.map((h: any) => (
                  <li key={h.id} className="flex items-center gap-4 px-5 py-3">
                    {h.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={h.photo_url}
                        alt={h.address}
                        className="h-14 w-20 rounded-md object-cover"
                      />
                    ) : (
                      <div className="h-14 w-20 rounded-md bg-slate-100" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {h.address}
                      </div>
                      <div className="text-xs text-slate-500">
                        {h.list_price
                          ? '$' + Number(h.list_price).toLocaleString()
                          : 'No price'}
                      </div>
                    </div>
                    {h.listing_url && (
                      <a
                        href={h.listing_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-semibold text-blue-700 hover:underline"
                      >
                        Listing ↗
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Tour requests */}
          <section className="rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-5 py-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Tour requests ({tours?.length || 0})
              </h2>
            </div>
            {!tours || tours.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-slate-500">
                None yet.
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {tours.map((t: any) => (
                  <li key={t.id} className="px-5 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">
                          {t.house?.address || '(house gone)'}
                        </div>
                        <div className="text-xs text-slate-500">
                          {t.preferred_when
                            ? 'Asked for ' + t.preferred_when + ' · '
                            : ''}
                          {new Date(t.created_at).toLocaleDateString()}
                        </div>
                      </div>
                      <span
                        className={
                          'rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase ' +
                          (t.status === 'confirmed'
                            ? 'bg-emerald-100 text-emerald-800'
                            : t.status === 'declined' || t.status === 'cancelled'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-amber-100 text-amber-800')
                        }
                      >
                        {t.status}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Activity */}
          <section className="rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-5 py-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Activity
              </h2>
            </div>
            {!activity || activity.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-slate-500">
                Nothing yet.
              </div>
            ) : (
              <ol className="divide-y divide-slate-100">
                {activity.map((a: any) => (
                  <li key={a.id} className="flex items-baseline gap-3 px-5 py-2.5 text-sm">
                    <span className="font-medium capitalize">
                      {String(a.action).replace(/_/g, ' ')}
                    </span>
                    <span className="text-slate-600">{a.target}</span>
                    <span className="ml-auto shrink-0 text-xs text-slate-400">
                      {new Date(a.created_at).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <div className="space-y-6">
          {/* Important dates */}
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Important dates
            </h2>
            {!dates || dates.length === 0 ? (
              <p className="mt-3 text-xs text-slate-500">None yet.</p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100">
                {dates.map((d: any) => (
                  <li
                    key={d.id}
                    className="flex items-center justify-between py-2 text-sm"
                  >
                    <span>{d.label}</span>
                    <span className="text-xs text-slate-500">
                      {new Date(d.date).toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* People */}
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              People on this deal
            </h2>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <div className="font-medium">{client.full_name || client.email}</div>
                <div className="text-xs text-slate-500">Client</div>
              </li>
              {coRealtor && (
                <li>
                  <div className="font-medium">
                    {coRealtor.full_name || coRealtor.email}
                  </div>
                  <div className="text-xs text-slate-500">Co-realtor</div>
                </li>
              )}
              {search?.attorney_name && (
                <li>
                  <div className="font-medium">{search.attorney_name}</div>
                  <div className="text-xs text-slate-500">
                    Attorney
                    {search.attorney_email
                      ? ' · ' + search.attorney_email
                      : ''}
                  </div>
                </li>
              )}
            </ul>
          </section>

          {/* Financials */}
          {search && ((search as any).agreed_price || (search as any).closing_amount || (search as any).earnest_money || (search as any).commission_pct || (search as any).contract_url) && (
            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Financials
              </h2>
              <dl className="mt-3 grid grid-cols-2 gap-y-2 text-sm">
                {(search as any).agreed_price != null && (
                  <>
                    <dt className="text-slate-500">Agreed</dt>
                    <dd className="text-right font-semibold">
                      ${Number((search as any).agreed_price).toLocaleString()}
                    </dd>
                  </>
                )}
                {(search as any).closing_amount != null && (
                  <>
                    <dt className="text-slate-500">Closing</dt>
                    <dd className="text-right font-semibold">
                      ${Number((search as any).closing_amount).toLocaleString()}
                    </dd>
                  </>
                )}
                {(search as any).earnest_money != null && (
                  <>
                    <dt className="text-slate-500">Earnest</dt>
                    <dd className="text-right font-semibold">
                      ${Number((search as any).earnest_money).toLocaleString()}
                    </dd>
                  </>
                )}
                {(search as any).commission_pct != null && (
                  <>
                    <dt className="text-slate-500">Commission</dt>
                    <dd className="text-right font-semibold">
                      {Number((search as any).commission_pct)}%
                    </dd>
                  </>
                )}
              </dl>
              {(search as any).contract_url && (
                <a
                  href={(search as any).contract_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-block text-xs font-semibold text-blue-600 hover:underline"
                >
                  View contract ↗
                </a>
              )}
            </section>
          )}

          {/* Documents */}
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Documents ({documents?.length || 0})
            </h2>
            {!documents || documents.length === 0 ? (
              <p className="mt-3 text-xs text-slate-500">None yet.</p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100">
                {documents.map((d: any) => (
                  <li key={d.id} className="py-2 text-sm">
                    <div className="font-medium">{d.name}</div>
                    <div className="text-xs text-slate-500">
                      {new Date(d.created_at).toLocaleDateString()}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
