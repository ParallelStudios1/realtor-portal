import Link from 'next/link';
import { getMe, getSupabaseServerClient } from '@/lib/supabaseSsr';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Home' };

// Must match the public.deal_phase enum in Postgres exactly.
// User-facing labels can be friendlier than the enum values.
const PHASES = [
  { id: 'searching', label: 'Searching' },
  { id: 'offer_made', label: 'Offer made' },
  { id: 'under_contract', label: 'Under contract' },
  { id: 'closing', label: 'Closing' },
  { id: 'closed', label: 'Closed' },
];

export default async function ClientHomePage() {
  const me = (await getMe())!;
  const supabase = getSupabaseServerClient();

  // Most recent search for this client
  const { data: searches } = await supabase
    .from('client_searches')
    .select('id, status, phase, created_at, realtor_id')
    .eq('client_id', me.user_id)
    .order('created_at', { ascending: false })
    .limit(5);

  const active = searches?.[0];

  // Important dates for the active search
  const { data: dates } = active
    ? await supabase
        .from('important_dates')
        .select('id, label, date, kind')
        .eq('search_id', active.id)
        .order('date', { ascending: true })
        .limit(5)
    : { data: [] as any[] };

  // Realtor info
  const { data: realtor } = active?.realtor_id
    ? await supabase
        .from('users')
        .select('full_name, email')
        .eq('id', active.realtor_id)
        .maybeSingle()
    : { data: null };

  const phaseIdx = active ? PHASES.findIndex((p) => p.id === active.phase) : -1;

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
        Welcome{me.full_name ? `, ${me.full_name.split(' ')[0]}` : ''}
      </h1>

      {!active ? (
        <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <h3 className="text-base font-semibold">No active search yet</h3>
          <p className="mt-1 text-sm text-slate-600">
            Your realtor will get you set up — you'll see your deal here once
            they do.
          </p>
        </div>
      ) : (
        <>
          {/* Phase stepper */}
          <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Deal progress
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
                        (done ? 'font-semibold text-slate-900' : 'text-slate-500')
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

          {/* Realtor card */}
          {realtor && (
            <section className="mt-4 rounded-xl border border-slate-200 bg-white p-5">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Your realtor
              </div>
              <div className="mt-1 text-sm font-semibold">
                {realtor.full_name || realtor.email}
              </div>
              <Link
                href="/client/messages"
                className="mt-3 inline-block rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
              >
                Message
              </Link>
            </section>
          )}

          {/* Important dates */}
          {dates && dates.length > 0 && (
            <section className="mt-4 rounded-xl border border-slate-200 bg-white p-5">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Important dates
              </div>
              <ul className="mt-3 divide-y divide-slate-100">
                {dates.map((d: any) => (
                  <li
                    key={d.id}
                    className="flex items-center justify-between py-2 text-sm"
                  >
                    <span>{d.label}</span>
                    <span className="text-slate-500">
                      {new Date(d.date).toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <Link
              href="/client/houses"
              className="rounded-xl border border-slate-200 bg-white p-4 text-sm hover:border-slate-300"
            >
              <div className="font-semibold">Houses</div>
              <div className="text-slate-500">See properties from your agent</div>
            </Link>
            <Link
              href="/client/messages"
              className="rounded-xl border border-slate-200 bg-white p-4 text-sm hover:border-slate-300"
            >
              <div className="font-semibold">Messages</div>
              <div className="text-slate-500">Chat with your agent</div>
            </Link>
            <Link
              href="/client/documents"
              className="rounded-xl border border-slate-200 bg-white p-4 text-sm hover:border-slate-300"
            >
              <div className="font-semibold">Documents</div>
              <div className="text-slate-500">Disclosures & contracts</div>
            </Link>
          </div>
        </>
      )}
    </main>
  );
}
