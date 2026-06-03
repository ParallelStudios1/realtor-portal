import { redirect } from 'next/navigation';
import { getMe, getSupabaseServerClient } from '@/lib/supabaseSsr';
import { ClientMessagesClient } from './ClientMessagesClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Messages' };

/**
 * Client-side messaging — single thread per active search, real-time updates.
 * Web counterpart of the mobile (client)/messages tab.
 */
export default async function ClientMessagesPage() {
  const me = await getMe();
  if (!me) {
    redirect('/login');
  }
  const supabase = getSupabaseServerClient();

  // Find the client's most recent search (one thread for now; multi-thread is v1.1)
  const { data: searches } = await supabase
    .from('client_searches')
    .select('id, realtor_id, firm_id')
    .eq('client_id', me.user_id)
    .order('created_at', { ascending: false })
    .limit(1);

  const search = searches?.[0];

  if (!search) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-400">
          Conversation
        </p>
        <h1 className="mt-1.5 text-2xl font-bold tracking-tight sm:text-3xl">Messages</h1>
        <div className="mt-6 rounded-2xl border border-dashed border-ink-300 bg-white bg-dotted p-12 text-center shadow-soft-sm">
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
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <h3 className="mt-4 text-base font-semibold">No conversation yet</h3>
          <p className="mx-auto mt-1 max-w-sm text-sm text-ink-600">
            Once your realtor sets up your search, you&apos;ll be able to message
            them here.
          </p>
        </div>
      </main>
    );
  }

  // Initial messages
  const { data: initialMessages } = await supabase
    .from('messages')
    .select('id, search_id, sender_id, body, created_at')
    .eq('search_id', search.id)
    .order('created_at', { ascending: true });

  // Realtor name for header
  const { data: realtor } = search.realtor_id
    ? await supabase
        .from('users')
        .select('full_name, email')
        .eq('id', search.realtor_id)
        .maybeSingle()
    : { data: null };

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-400">
        Conversation
      </p>
      <h1 className="mb-4 mt-1.5 text-2xl font-bold tracking-tight sm:text-3xl">
        Messages
      </h1>
      <ClientMessagesClient
        searchId={search.id}
        firmId={search.firm_id}
        currentUserId={me.user_id}
        realtorName={realtor?.full_name || realtor?.email || 'Your realtor'}
        initialMessages={initialMessages || []}
      />
    </main>
  );
}
