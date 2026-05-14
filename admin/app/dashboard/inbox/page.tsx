import Link from 'next/link';
import { getMe, getSupabaseServerClient } from '@/lib/supabaseSsr';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Inbox' };

/**
 * Unified inbox: every recent activity, message, tour request, and document
 * upload across the firm in one feed. Lets a realtor quickly catch up after
 * being away from the dashboard.
 */
export default async function InboxPage() {
  const me = (await getMe())!;
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
        `id, body, created_at, search_id,
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

  // Map search_id → client_id for deep-linking back to dashboard/clients/[id]
  const searchIds = Array.from(
    new Set(
      [
        ...(activities || []),
        ...(messages || []),
        ...(tours || []),
        ...(docs || []),
      ].map((x: any) => x.search_id)
    )
  );
  const { data: searches } = searchIds.length
    ? await supabase
        .from('client_searches')
        .select('id, client_id')
        .in('id', searchIds)
    : { data: [] as any[] };
  const sIdToClientId = new Map(
    (searches || []).map((s: any) => [s.id, s.client_id])
  );

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
          <span className="text-slate-700">
            {prettyTarget(a.action, a.target)}
          </span>
        </>
      ),
      href:
        '/dashboard/clients/' +
        (sIdToClientId.get(a.search_id) || ''),
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
          sent a message
        </>
      ),
      body: m.body,
      href: '/dashboard/messages',
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
          <span className="text-slate-700">{houseAddr}</span>
          {t.status !== 'pending' && (
            <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-700">
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
          uploaded <span className="text-slate-700">{d.name}</span>
        </>
      ),
      href:
        '/dashboard/clients/' +
        (sIdToClientId.get(d.search_id) || ''),
      accent: '#7C3AED',
    });
  }

  items.sort((a, b) => (a.at < b.at ? 1 : -1));

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Inbox</h1>
        <p className="mt-1 text-sm text-slate-600">
          Everything new across your firm in the last 14 days.
        </p>
      </header>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <h2 className="font-semibold">Nothing new</h2>
          <p className="mt-1 text-sm text-slate-600">
            Tour requests, messages, document uploads, and phase updates show
            up here.
          </p>
        </div>
      ) : (
        <ol className="space-y-2">
          {items.map((it) => (
            <li key={it.key}>
              <Link
                href={it.href}
                className="block rounded-xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:bg-slate-50"
              >
                <div className="flex items-start gap-3">
                  <span
                    className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: it.accent }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-slate-900">{it.title}</div>
                    {it.body && (
                      <div className="mt-1 line-clamp-2 text-xs text-slate-600">
                        {it.body}
                      </div>
                    )}
                  </div>
                  <time className="shrink-0 text-xs text-slate-400">
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
