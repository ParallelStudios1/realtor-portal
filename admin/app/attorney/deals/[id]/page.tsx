import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMe } from '@/lib/supabaseSsr';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';

export const dynamic = 'force-dynamic';

export default async function AttorneyDealPage({
  params,
}: {
  params: { id: string };
}) {
  const me = await getMe();
  if (!me?.email) notFound();
  const service = getSupabaseServiceRoleClient();

  // Confirm this deal is assigned to me and pull everything visible.
  const { data: deal } = await service
    .from('client_searches')
    .select(
      `id, name, phase, kind, agreed_price, closing_amount, earnest_money, commission_pct,
       contract_url, attorney_email, attorney_name, attorney_phone, notes, created_at, updated_at,
       firm:firms ( id, name, logo_url, brand_color, contact_email ),
       client:users!client_searches_client_id_fkey ( id, full_name, email, phone_number ),
       realtor:users!client_searches_realtor_id_fkey ( id, full_name, email, phone_number )`
    )
    .eq('id', params.id)
    .maybeSingle();

  if (
    !deal ||
    !(deal as any).attorney_email ||
    (deal as any).attorney_email.toLowerCase() !== me.email.toLowerCase()
  ) {
    notFound();
  }

  const d = deal as any;

  const [{ data: dates }, { data: documents }, { data: houses }] =
    await Promise.all([
      service
        .from('important_dates')
        .select('id, label, date, notes')
        .eq('search_id', params.id)
        .order('date', { ascending: true }),
      service
        .from('documents')
        .select('id, name, storage_path, mime_type, created_at')
        .eq('search_id', params.id)
        .order('created_at', { ascending: false }),
      service
        .from('houses')
        .select('id, address, list_price, status, photo_url')
        .eq('search_id', params.id)
        .order('created_at', { ascending: false }),
    ]);

  const brand = d.firm?.brand_color || '#0F172A';

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <Link
        href="/attorney"
        className="text-xs font-semibold text-slate-500 hover:text-slate-700"
      >
        ← Back to deals
      </Link>

      <header className="mt-2 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {d.client?.full_name || 'Client'}
          </h1>
          <p className="text-sm text-slate-600">
            {d.firm?.name} · realtor: {d.realtor?.full_name || d.realtor?.email}
          </p>
        </div>
        <span
          className="rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide"
          style={{ backgroundColor: brand + '15', color: brand }}
        >
          {String(d.phase).replace(/_/g, ' ')}
        </span>
      </header>

      <div className="mt-6 grid gap-6 md:grid-cols-3">
        <div className="space-y-6 md:col-span-2">
          {/* Financials */}
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Financials
            </h2>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <Row label="Agreed price" value={d.agreed_price} />
              <Row label="Closing amount" value={d.closing_amount} />
              <Row label="Earnest money" value={d.earnest_money} />
              <Row
                label="Commission"
                value={
                  d.commission_pct != null ? d.commission_pct + '%' : null
                }
                raw
              />
            </dl>
            {d.contract_url && (
              <a
                href={d.contract_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-semibold transition hover:bg-slate-50"
                style={{ borderColor: brand, color: brand }}
              >
                View contract ↗
              </a>
            )}
          </section>

          {/* Important dates */}
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Important dates ({dates?.length || 0})
            </h2>
            {!dates || dates.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">None yet.</p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100">
                {dates.map((dd: any) => (
                  <li
                    key={dd.id}
                    className="flex items-center justify-between py-2 text-sm"
                  >
                    <div>
                      <div className="font-medium">{dd.label}</div>
                      {dd.notes && (
                        <div className="text-xs text-slate-500">{dd.notes}</div>
                      )}
                    </div>
                    <span className="text-xs text-slate-500">
                      {new Date(dd.date).toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Documents */}
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Documents ({documents?.length || 0})
            </h2>
            {!documents || documents.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">None shared yet.</p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100">
                {documents.map((doc: any) => (
                  <li
                    key={doc.id}
                    className="flex items-center justify-between py-2 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-base">📄</span>
                      <div>
                        <div className="font-medium">{doc.name}</div>
                        <div className="text-xs text-slate-500">
                          {new Date(doc.created_at).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-[11px] text-slate-400">
              Read-only access. Ask the realtor to share new files.
            </p>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              People
            </h2>
            <div className="mt-3 space-y-3 text-sm">
              <Person
                label="Client"
                name={d.client?.full_name || d.client?.email}
                email={d.client?.email}
                phone={d.client?.phone_number}
              />
              <Person
                label="Realtor"
                name={d.realtor?.full_name || d.realtor?.email}
                email={d.realtor?.email}
                phone={d.realtor?.phone_number}
              />
              <Person
                label="Attorney (you)"
                name={d.attorney_name || me.full_name || me.email}
                email={d.attorney_email}
                phone={d.attorney_phone}
              />
            </div>
          </section>

          {houses && houses.length > 0 && (
            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Houses ({houses.length})
              </h2>
              <ul className="mt-3 space-y-2">
                {houses.map((h: any) => (
                  <li key={h.id} className="flex items-center gap-2 text-sm">
                    {h.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={h.photo_url}
                        alt=""
                        className="h-10 w-14 rounded object-cover"
                      />
                    ) : (
                      <div className="h-10 w-14 rounded bg-slate-100" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{h.address}</div>
                      {h.list_price && (
                        <div className="text-xs text-slate-500">
                          ${Number(h.list_price).toLocaleString()}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {d.notes && (
            <section className="rounded-xl border border-amber-200 bg-amber-50 p-5">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                Notes from realtor
              </h2>
              <p className="mt-2 text-sm text-amber-900 whitespace-pre-wrap">
                {d.notes}
              </p>
            </section>
          )}
        </aside>
      </div>
    </main>
  );
}

function Row({
  label,
  value,
  raw,
}: {
  label: string;
  value: any;
  raw?: boolean;
}) {
  if (value == null || value === '') return null;
  return (
    <>
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-semibold">
        {raw ? value : '$' + Number(value).toLocaleString()}
      </dd>
    </>
  );
}

function Person({
  label,
  name,
  email,
  phone,
}: {
  label: string;
  name: string | null;
  email?: string | null;
  phone?: string | null;
}) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="font-medium">{name || '—'}</div>
      {email && (
        <a
          href={`mailto:${email}`}
          className="block text-xs text-blue-600 hover:underline"
        >
          {email}
        </a>
      )}
      {phone && (
        <a
          href={`tel:${phone}`}
          className="block text-xs text-blue-600 hover:underline"
        >
          {phone}
        </a>
      )}
    </div>
  );
}
