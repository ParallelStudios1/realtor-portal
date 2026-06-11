import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getMe, getSupabaseServerClient } from '@/lib/supabaseSsr';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Inbox' };

/**
 * Unified inbox: every recent activity, message, tour request, and document
 * upload across the firm in one feed. Lets a realtor quickly catch up after
 * being away from the dashboard.
 */
export default async function InboxPage() {
  const me = await getMe();
  if (!me) {
    redirect('/login');
  }
  const supabase = getSupabaseServerClient();

  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  const [
    { data: activities },
    { data: messages },
    { data: tours },
    { data: docs },
  ] = await Promise.all([
    supabase
      .from('activities')
      .select(
        `id, action, target, created_at, search_id,
         actor:users!activities_actor_id_fkey ( full_name, email )`
      )
      .eq('firm_id', me.firm_id!)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(30),
    supabase
      .from('messages')
      .select(
        `id, body, created_at, search_id, recipient_user_id,
         sender:users!messages_sender_id_fkey ( full_name, email )`
      )
      .eq('firm_id', me.firm_id!)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('tour_requests')
      .select(
        `id, status, preferred_when, created_at, search_id,
         house:houses ( address ),
         client:users!tour_requests_client_id_fkey ( full_name, email )`
      )
      .eq('firm_id', me.firm_id!)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(15),
    supabase
      .from('documents')
      .select(
        `id, name, created_at, search_id,
         uploader:users!documents_uploaded_by_fkey ( full_name )`
      )
      .eq('firm_id', me.firm_id!)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(15),
  ]);

  type FeedItem = {
    key: string;
    kind: 'activity' | 'message' | 'tour' | 'doc';
    at: string;
    title: React.ReactNode;
    body?: string;
    href: string;
    accent: string;
  };

  const items: FeedItem[] = [];

  for (const a of activities || []) {
    items.push({
      key: 'a-' + a.id,
      kind: 'activity',
      at: a.created_at,
      title: (
        <>
          <strong>{(a as any).actor?.full_name || 'Someone'}</strong>{' '}
          {humanizeAction(a.action)}{' '}
          <span className="text-ink-700">
            {prettyTarget(a.action, a.target)}
          </span>
        </>
      ),
      href: '/dashboard/deals/' + a.search_id,
      accent: '#2563EB',
    });
  }
  for (const m of messages || []) {
    items.push({
      key: 'm-' + m.id,
      kind: 'message',
      at: m.created_at,
      title: (
        <>
          <strong>{(m as any).sender?.full_name || 'Someone'}</strong>{' '}
          {(m as any).recipient_user_id
            ? 'sent a direct message'
            : 'posted in the deal chat'}
        </>
      ),
      body: m.body,
      href: (m as any).recipient_user_id
        ? '/dashboard/messages'
        : '/dashboard/deals/' + m.search_id,
      accent: '#0EA5E9',
    });
  }
  for (const t of tours || []) {
    const houseAddr = (t as any).house?.address || 'a house';
    const clientName =
      (t as any).client?.full_name || (t as any).client?.email || 'A client';
    items.push({
      key: 't-' + t.id,
      kind: 'tour',
      at: t.created_at,
      title: (
        <>
          <strong>{clientName}</strong> {' requested a tour of '}
          <span className="text-ink-700">{houseAddr}</span>
          {t.status !== 'pending' && (
            <span className="ml-2 rounded-full bg-ink-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-ink-700">
              {t.status}
            </span>
          )}
        </>
      ),
      body: t.preferred_when
        ? 'Asked for ' + new Date(t.preferred_when).toLocaleString()
        : undefined,
      href: '/dashboard/tours',
      accent: '#F59E0B',
    });
  }
  for (const d of docs || []) {
    items.push({
      key: 'd-' + d.id,
      kind: 'doc',
      at: d.created_at,
      title: (
        <>
          <strong>{(d as any).uploader?.full_name || 'Someone'}</strong>{' '}
          uploaded <span className="text-ink-700">{d.name}</span>
        </>
      ),
      href: '/dashboard/deals/' + d.search_id,
      accent: '#7C3AED',
    });
  }

  items.sort((a, b) => (a.at < b.at ? 1 : -1));

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-6">
        <div className="text-[11px] font-bold uppercase tracking-wider text-ink-500">
          Activity
        </div>
        <h1 className="mt-1.5 text-3xl font-bold tracking-tight text-ink-900">Inbox</h1>
        <p className="mt-1 text-sm text-ink-600">
          Everything new across your firm in the last 14 days.
        </p>
      </header>

      {items.length === 0 ? (
        <div className="bg-dotted rounded-2xl border border-dashed border-ink-300 bg-white p-14 text-center shadow-soft-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-ink-900 text-white shadow-soft-sm">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-7 w-7" aria-hidden>
              <path d="M4 13l2-7h12l2 7v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5z" strokeLinejoin="round" />
              <path d="M4 13h5l1 2h4l1-2h5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h2 className="mt-4 text-base font-semibold text-ink-900">Nothing new</h2>
          <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-ink-600">
            Tour requests, messages, document uploads, and phase updates show
            up here.
          </p>
        </div>
      ) : (
        <ol className="space-y-2.5">
          {items.map((it) => (
            <li key={it.key}>
              <Link
                href={it.href}
                className="block rounded-2xl border border-ink-200 bg-white p-4 shadow-soft-sm transition hover:border-ink-300 hover:bg-ink-50 hover:shadow-soft-md"
              >
                <div className="flex items-start gap-3">
                  <span
                    className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: it.accent }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-ink-900">{it.title}</div>
                    {it.body && (
                      <div className="mt-1 line-clamp-2 text-xs text-ink-600">
                        {it.body}
                      </div>
                    )}
                  </div>
                  <time className="shrink-0 text-xs text-ink-400">
                    {timeAgo(it.at)}
                  </time>
                </div>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}

function humanizeAction(action: string): string {
  const map: Record<string, string> = {
    phase_change: 'moved the deal to',
    house_added: 'added a house —',
    tour_confirmed: 'confirmed a tour for',
    tour_declined: 'declined a tour for',
    tour_requested: 'requested a tour for',
    document_uploaded: 'uploaded',
    important_date_added: 'added an important date —',
    alert: 'sent an alert —',
    attorney_added: 'added an attorney —',
    co_realtor_added: 'added a co-realtor —',
    buyer_added: 'added a buyer —',
    seller_added: 'added a seller —',
    docusign_linked: 'linked a DocuSign envelope',
    deal_updated: 'updated deal details —',
    message: 'sent a message',
  };
  return map[action] || action.replace(/_/g, ' ');
}

function prettyTarget(action: string, target: string | null) {
  if (!target) return '';
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
  if (m < 60) return m + 'm';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h';
  const d = Math.floor(h / 24);
  return d + 'd';
}
