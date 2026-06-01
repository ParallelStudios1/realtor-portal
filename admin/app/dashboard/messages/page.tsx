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

  const { data: latestMessages } =
    searchIds.length > 0
      ? await supabase
          .from('messages')
          .select('id, search_id, body, sender_id, created_at')
          .in('search_id', searchIds)
          .order('created_at', { ascending: false })
      : { data: [] as any[] };

  // Build a map: searchId -> most recent message
  const latestBySearch = new Map<string, any>();
  for (const m of latestMessages || []) {
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
        <h1 className="text-3xl font-bold tracking-tight">Messages</h1>
        <p className="mt-1 text-sm text-ink-600">
          {threads.length} client {threads.length === 1 ? 'thread' : 'threads'}.
        </p>
      </header>

      {threads.length === 0 ? (
        <div className="rounded-xl border border-dashed border-ink-300 bg-white p-12 text-center">
          <h3 className="font-semibold">No conversations yet</h3>
          <p className="mt-1 text-sm text-ink-600">
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
