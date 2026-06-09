import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getMe, getSupabaseServerClient } from '@/lib/supabaseSsr';
import { DealProgressTimeline } from '@/components/DealProgressTimeline';
import { DealChat } from '@/components/DealChat';
import { getDealChat } from '@/app/dashboard/deals/[id]/chatActions';
import { buildCalendarFeedUrl } from '@/lib/ics';
import { formatDateOnly } from '@/lib/dates';
import { listingStatusLabel } from '@/lib/dealKind';
import { SellerAddListing } from './SellerAddListing';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Home' };

export default async function ClientHomePage() {
  const me = await getMe();
  if (!me) {
    redirect('/login');
  }
  const supabase = getSupabaseServerClient();

  // Most recent search for this client
  const { data: searches } = await supabase
    .from('client_searches')
    .select(
      'id, phase, subphase, kind, created_at, realtor_id, offer_house_id, house_agreed_at'
    )
    .eq('client_id', me.user_id)
    .order('created_at', { ascending: false })
    .limit(5);

  const active = searches?.[0];
  const isSeller = (active as any)?.kind === 'seller';

  // CLIENT ↔ REALTOR HOUSE AGREEMENT — the agreed home, shown prominently on
  // the client's home when either side has set it (BUYER deals only).
  const { data: agreedHouse } =
    !isSeller &&
    active &&
    (active as any).house_agreed_at &&
    (active as any).offer_house_id
      ? await supabase
          .from('houses')
          .select('id, address, photo_url, list_price')
          .eq('id', (active as any).offer_house_id)
          .maybeSingle()
      : { data: null };

  // SELLER deal — the client's own listing(s), shown prominently with status.
  const { data: myListings } =
    isSeller && active
      ? await supabase
          .from('houses')
          .select('id, address, photo_url, list_price, listing_status, mls_number')
          .eq('search_id', active.id)
          .order('created_at', { ascending: false })
      : { data: [] as any[] };

  // Important dates for the active search
  const { data: dates } = active
    ? await supabase
        .from('important_dates')
        .select('id, label, date, notes')
        .eq('search_id', active.id)
        .order('date', { ascending: true })
        .limit(5)
    : { data: [] as any[] };

  // Upcoming tours — concrete date+time visits the client requested, with the
  // house address. Shown with a countdown + time-of-day on the dashboard.
  const nowIso = new Date().toISOString();
  const { data: tours } = active
    ? await supabase
        .from('tour_requests')
        .select(
          `id, requested_at, preferred_when, status,
           house:houses!tour_requests_house_id_fkey ( id, address )`
        )
        .eq('search_id', active.id)
        .not('requested_at', 'is', null)
        .gte('requested_at', nowIso)
        .in('status', ['pending', 'confirmed'])
        .order('requested_at', { ascending: true })
        .limit(6)
    : { data: [] as any[] };

  // Recent activity feed — "Maria updated phase to under contract", etc.
  const { data: feed } = active
    ? await supabase
        .from('activities')
        .select(
          `id, action, target, created_at,
           actor:users!activities_actor_id_fkey ( full_name )`
        )
        .eq('search_id', active.id)
        .order('created_at', { ascending: false })
        .limit(8)
    : { data: [] as any[] };

  // Realtor info
  const { data: realtor } = active?.realtor_id
    ? await supabase
        .from('users')
        .select('full_name, email')
        .eq('id', active.realtor_id)
        .maybeSingle()
    : { data: null };

  // DEAL GROUP CHAT — the shared thread for the whole deal (every party with
  // message access). The client is the principal on their own deal, so
  // getDealChat authorizes them. This is the GROUP thread (private = false),
  // distinct from the 1:1 DM at /client/messages.
  const dealChat = active ? await getDealChat(active.id) : null;
  const dealChatMessages =
    dealChat && dealChat.ok ? dealChat.messages : [];

  // Firm branding + custom phase labels/messages for the progress timeline.
  const { data: firm } = me.firm_id
    ? await supabase
        .from('firms')
        .select('brand_color, phase_labels, phase_messages')
        .eq('id', me.firm_id)
        .maybeSingle()
    : { data: null };

  const phaseLabels =
    ((firm as any)?.phase_labels as Record<string, string> | null) || {};
  const phaseMessages =
    ((firm as any)?.phase_messages as Record<string, string> | null) || {};
  const brandColor =
    ((firm as any)?.brand_color as string | null) ||
    me.firm_brand_color ||
    null;

  // Surface only the next few upcoming dates on the timeline.
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const upcomingDates = ((dates as any[]) || [])
    .filter((d) => {
      const t = new Date(d.date).getTime();
      return !Number.isNaN(t) && t >= todayStart.getTime();
    })
    .slice(0, 3);

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-400">
          Your deal
        </p>
        <h1 className="mt-1.5 text-2xl font-bold tracking-tight sm:text-3xl">
          Welcome{me.full_name ? `, ${me.full_name.split(' ')[0]}` : ''}
        </h1>
      </header>

      {!active ? (
        <div className="mt-8 rounded-2xl border border-dashed border-ink-300 bg-white bg-dotted p-12 text-center shadow-soft-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-ink-100">
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              className="h-6 w-6 text-ink-500"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <path d="M9 22V12h6v10" />
            </svg>
          </div>
          <h3 className="mt-4 text-base font-semibold">No active search yet</h3>
          <p className="mx-auto mt-1 max-w-sm text-sm text-ink-600">
            Your realtor will get you set up — you&apos;ll see your deal here once
            they do.
          </p>
        </div>
      ) : (
        <>
          {/* Client-facing progress timeline — where the deal is + what's next */}
          <div className="mt-6">
            <DealProgressTimeline
              phase={active.phase}
              subphase={(active as any).subphase ?? null}
              kind={(active as any).kind ?? null}
              brandColor={brandColor}
              phaseLabels={phaseLabels}
              phaseMessages={phaseMessages}
              upcomingDates={upcomingDates}
            />
          </div>

          {/* SELLER — your listing(s), the homes you're selling, with status. */}
          {isSeller && (
            <section className="mt-4 surface p-5">
              <div className="flex items-baseline justify-between">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">
                  {(myListings || []).length > 1 ? 'Your listings' : 'Your home for sale'}
                </div>
              </div>
              {(myListings || []).length === 0 ? (
                <>
                  <p className="mt-2 text-sm text-ink-600">
                    Add the home you&apos;re selling and your agent will take it
                    from there — you&apos;ll see its status, showings, and offers
                    as things move. You can attach disclosures or photos now too.
                  </p>
                  <SellerAddListing brandColor={brandColor} hasListings={false} />
                </>
              ) : (
                <ul className="mt-3 space-y-3">
                  {(myListings as any[]).map((h) => (
                    <Link
                      key={h.id}
                      href={`/client/houses/${h.id}`}
                      className="flex items-stretch gap-0 overflow-hidden rounded-xl border border-ink-200 bg-white transition hover:shadow-soft-md"
                    >
                      <div className="w-24 shrink-0 bg-ink-100 sm:w-32">
                        {h.photo_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={h.photo_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center text-ink-400">
                            <svg aria-hidden viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                              <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                            </svg>
                          </div>
                        )}
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col justify-center p-4">
                        <span
                          className="inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                          style={{
                            backgroundColor: (brandColor || '#0F172A') + '15',
                            color: brandColor || '#0F172A',
                          }}
                        >
                          {listingStatusLabel(h.listing_status)}
                        </span>
                        <div className="mt-1.5 truncate text-base font-semibold text-ink-900">
                          {h.address}
                        </div>
                        {h.list_price != null && (
                          <div className="mt-0.5 text-sm font-semibold text-ink-700">
                            ${Number(h.list_price).toLocaleString()}
                            {h.mls_number ? ` · MLS ${h.mls_number}` : ''}
                          </div>
                        )}
                      </div>
                    </Link>
                  ))}
                </ul>
              )}
              {(myListings || []).length > 0 && (
                <SellerAddListing brandColor={brandColor} hasListings={true} />
              )}
            </section>
          )}

          {/* Agreed home — the property you and your agent settled on (buyer). */}
          {agreedHouse && (
            <Link
              href={`/client/houses/${(agreedHouse as any).id}`}
              className="mt-4 block overflow-hidden rounded-2xl border bg-white shadow-soft transition hover:shadow-soft-md"
              style={{ borderColor: brandColor || '#0F172A' }}
            >
              <div className="flex items-stretch gap-0">
                <div className="w-28 shrink-0 bg-ink-100 sm:w-40">
                  {(agreedHouse as any).photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={(agreedHouse as any).photo_url}
                      alt={(agreedHouse as any).address}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-ink-400">
                      <svg aria-hidden viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                        <path d="M9 22V12h6v10" />
                      </svg>
                    </div>
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col justify-center p-4">
                  <div
                    className="inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white"
                    style={{ backgroundColor: brandColor || '#0F172A' }}
                  >
                    <svg aria-hidden viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M3 8.5l3.5 3.5L13 5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    The home you want
                  </div>
                  <div className="mt-2 truncate text-base font-semibold text-ink-900">
                    {(agreedHouse as any).address}
                  </div>
                  {(agreedHouse as any).list_price && (
                    <div className="mt-0.5 text-sm font-semibold text-ink-700">
                      ${Number((agreedHouse as any).list_price).toLocaleString()}
                    </div>
                  )}
                </div>
              </div>
            </Link>
          )}

          {/* Realtor card */}
          {realtor && (
            <section className="mt-4 surface p-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">
                Your realtor
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                    style={{ backgroundColor: brandColor || '#0F172A' }}
                  >
                    {(realtor.full_name || realtor.email || '?')
                      .slice(0, 1)
                      .toUpperCase()}
                  </div>
                  <div className="text-sm font-semibold">
                    {realtor.full_name || realtor.email}
                  </div>
                </div>
                <Link
                  href="/client/messages"
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-white shadow-soft-sm transition active:scale-[0.98]"
                  style={{ backgroundColor: brandColor || '#0F172A' }}
                >
                  <svg
                    aria-hidden
                    viewBox="0 0 24 24"
                    className="h-3.5 w-3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  Message
                </Link>
              </div>
            </section>
          )}

          {/* Deal chat — the shared group thread for everyone on this deal.
              Distinct from the 1:1 DM with your agent (the "Message" button
              above). The client is the principal, so they can post here. */}
          <div className="mt-4">
            <DealChat
              searchId={active.id}
              me={{ userId: me.user_id, name: me.full_name }}
              initialMessages={dealChatMessages}
              canPost={true}
            />
          </div>

          {/* Upcoming tours — countdown + time of day */}
          {tours && tours.length > 0 && (
            <section className="mt-4 surface p-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">
                Upcoming tours
              </div>
              <ul className="mt-3 divide-y divide-ink-100">
                {(tours as any[]).map((t) => {
                  const dt = new Date(t.requested_at);
                  return (
                    <li key={t.id} className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">
                          {t.house?.address || 'A home'}
                        </div>
                        <div className="mt-0.5 text-xs text-ink-500">
                          {dt.toLocaleString(undefined, {
                            weekday: 'long',
                            month: 'short',
                            day: 'numeric',
                          })}{' '}
                          · {timeOfDay(dt)} ·{' '}
                          {dt.toLocaleTimeString(undefined, {
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span
                          className={
                            'rounded-full px-2 py-0.5 text-[11px] font-semibold ' +
                            (t.status === 'confirmed'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800')
                          }
                        >
                          {t.status === 'confirmed' ? 'Confirmed' : 'Requested'}
                        </span>
                        <span className="text-xs font-semibold text-ink-600">
                          {countdownLabel(dt)}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {/* Important dates */}
          {dates && dates.length > 0 && (
            <section className="mt-4 surface p-5">
              <div className="flex items-baseline justify-between">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">
                  Important dates
                </div>
                {buildCalendarFeedUrl(active.id) && (
                  <a
                    href={buildCalendarFeedUrl(active.id)!.replace(
                      /^https:\/\//,
                      'webcal://'
                    )}
                    className="text-xs font-semibold text-ink-900 hover:underline"
                  >
                    Subscribe in Calendar ↗
                  </a>
                )}
              </div>
              <ul className="mt-3 divide-y divide-ink-100">
                {dates.map((d: any) => (
                  <li
                    key={d.id}
                    className="flex items-center justify-between py-2.5 text-sm"
                  >
                    <span className="font-medium">{d.label}</span>
                    <span className="font-semibold text-ink-500">
                      {formatDateOnly(d.date)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Activity feed — what's been happening */}
          {feed && feed.length > 0 && (
            <section className="mt-4 surface p-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">
                Recent updates
              </div>
              <ol className="mt-3 space-y-2.5">
                {feed.map((f: any) => {
                  const actor =
                    f.actor?.full_name || 'Your agent';
                  const verb = humanizeAction(f.action);
                  return (
                    <li
                      key={f.id}
                      className="flex items-baseline gap-2 text-sm"
                    >
                      <span className="font-semibold">{actor}</span>
                      <span className="text-ink-600">{verb}</span>
                      {f.target && (
                        <span className="font-medium">{prettyTarget(f.action, f.target)}</span>
                      )}
                      <span className="ml-auto shrink-0 text-xs text-ink-400">
                        {timeAgo(f.created_at)}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </section>
          )}

          <div className="mt-6 grid gap-3 sm:grid-cols-3" id="quicklinks">
            {[
              {
                href: '/client/houses',
                title: 'Houses',
                desc: 'See properties from your agent',
                icon: (
                  <>
                    <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                    <path d="M9 22V12h6v10" />
                  </>
                ),
              },
              {
                href: '/client/messages',
                title: 'Messages',
                desc: 'Chat with your agent',
                icon: (
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                ),
              },
              {
                href: '/client/documents',
                title: 'Documents',
                desc: 'Disclosures & contracts',
                icon: (
                  <>
                    <path d="M14 3v4a1 1 0 0 0 1 1h4" />
                    <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z" />
                  </>
                ),
              },
            ].map((q) => (
              <Link
                key={q.href}
                href={q.href}
                className="group flex items-start gap-3 rounded-2xl border border-ink-200 bg-white p-4 text-sm shadow-soft-xs transition hover:border-ink-300 hover:shadow-soft-md"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-ink-600 transition group-hover:bg-ink-900 group-hover:text-white">
                  <svg
                    aria-hidden
                    viewBox="0 0 24 24"
                    className="h-4.5 w-4.5"
                    width="18"
                    height="18"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    {q.icon}
                  </svg>
                </div>
                <div>
                  <div className="font-semibold">{q.title}</div>
                  <div className="text-ink-500">{q.desc}</div>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </main>
  );
}

function timeOfDay(d: Date): string {
  const h = d.getHours();
  if (h < 12) return 'Morning';
  if (h < 17) return 'Afternoon';
  return 'Evening';
}

function countdownLabel(d: Date): string {
  const ms = d.getTime() - Date.now();
  if (ms <= 0) return 'now';
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `in ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `in ${hours} hr${hours === 1 ? '' : 's'}`;
  const days = Math.round(hours / 24);
  if (days < 14) return `in ${days} day${days === 1 ? '' : 's'}`;
  const weeks = Math.round(days / 7);
  return `in ${weeks} week${weeks === 1 ? '' : 's'}`;
}

function humanizeAction(action: string): string {
  switch (action) {
    case 'phase_change':
      return 'moved your deal to';
    case 'house_added':
      return 'added a house —';
    case 'tour_confirmed':
      return 'confirmed a tour for';
    case 'tour_declined':
      return 'declined a tour for';
    case 'tour_requested':
      return 'requested a tour for';
    case 'document_uploaded':
      return 'uploaded a document —';
    case 'important_date_added':
      return 'added an important date —';
    case 'alert':
      return 'sent an alert —';
    case 'attorney_added':
      return 'added an attorney —';
    case 'co_realtor_added':
      return 'added a co-realtor —';
    case 'docusign_linked':
      return 'linked a DocuSign envelope';
    case 'message':
      return 'sent a message';
    default:
      return action.replace(/_/g, ' ');
  }
}

function prettyTarget(action: string, target: string) {
  if (action === 'phase_change') {
    const map: Record<string, string> = {
      searching: 'Searching',
      awaiting_offer: 'Awaiting offer',
      offer_made: 'Offer Made',
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
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
