import { redirect } from 'next/navigation';
import { getMe, getSupabaseServerClient } from '@/lib/supabaseSsr';
import { MessagesClient } from './MessagesClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Messages' };

/**
 * Realtor messaging hub. Lists every active client search (one thread per
 * search) with the latest message preview and unread count. Click a thread
 * to view + reply inline, with realtime updates via Supabase Realtime.
 */
export default async function MessagesPage() {
  const me = await getMe();
  if (!me) {
    redirect('/login');
  }
  const supabase = getSupabaseServerClient();

  // Pull every search for this firm with the client's display info and the
  // most recent message in the thread. We let the client component subscribe
  // to inserts and update the UI in real time.
  const { data: searches } = await supabase
    .from('client_searches')
    .select(
      `id, phase, created_at,
       client:users!client_searches_client_id_fkey ( id, full_name, email )`
    )
    .eq('firm_id', me.firm_id!)
    .order('created_at', { ascending: false });

  const searchIds = (searches || []).map((s: any) => s.id);

  // DIRECT messages only (recipient set). Without this filter the previews
  // showed group Deal-chat posts in the private-DM hub.
  const { data: latestMessages } =
    searchIds.length > 0
      ? await supabase
          .from('messages')
          .select('id, search_id, body, sender_id, recipient_user_id, created_at')
          .in('search_id', searchIds)
          .not('recipient_user_id', 'is', null)
          .order('created_at', { ascending: false })
      : { data: [] as any[] };

  // Build a map: searchId -> most recent DM in the realtor↔client thread.
  // Skip private threads with OTHER parties (e.g. realtor↔attorney) so the
  // preview always matches the thread you open.
  const clientBySearch = new Map<string, string | null>();
  for (const s of searches || []) {
    clientBySearch.set((s as any).id, (s as any).client?.id || null);
  }
  const latestBySearch = new Map<string, any>();
  for (const m of latestMessages || []) {
    const cid = clientBySearch.get(m.search_id);
    if (cid && m.sender_id !== cid && m.recipient_user_id !== cid) continue;
    if (!latestBySearch.has(m.search_id)) latestBySearch.set(m.search_id, m);
  }

  const threads = (searches || []).map((s: any) => ({
    searchId: s.id,
    clientId: s.client?.id || null,
    clientName: s.client?.full_name || s.client?.email || 'Unknown client',
    clientEmail: s.client?.email || null,
    latest: latestBySearch.get(s.id) || null,
    phase: s.phase,
  }));

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6">
        <div className="text-[11px] font-bold uppercase tracking-wider text-ink-500">
          Direct · private
        </div>
        <h1 className="mt-1.5 text-3xl font-bold tracking-tight text-ink-900">
          Direct messages
        </h1>
        <p className="mt-1 text-sm text-ink-600">
          Private 1:1 threads with each client - separate from the all-parties
          Deal chat inside each deal. <span className="font-semibold text-ink-900">{threads.length}</span> client{' '}
          {threads.length === 1 ? 'thread' : 'threads'}.
        </p>
      </header>

      {threads.length === 0 ? (
        <div className="bg-dotted rounded-2xl border border-dashed border-ink-300 bg-white p-14 text-center shadow-soft-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-ink-900 text-white shadow-soft-sm">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-7 w-7" aria-hidden>
              <path d="M21 12a8 8 0 11-3.1-6.32L21 5l-1 4 1 1a8 8 0 010 2z" strokeLinejoin="round" />
            </svg>
          </div>
          <h3 className="mt-4 text-base font-semibold text-ink-900">No conversations yet</h3>
          <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-ink-600">
            Once you invite clients and they start a search, you'll see threads
            here. New messages appear in real time.
          </p>
        </div>
      ) : (
        <MessagesClient
          firmId={me.firm_id!}
          currentUserId={me.user_id}
          threads={threads}
        />
      )}
    </main>
  );
}
