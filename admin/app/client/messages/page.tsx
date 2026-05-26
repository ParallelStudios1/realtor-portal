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
    const { redirect } = await import('next/navigation');
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
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Messages</h1>
        <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-sm text-slate-600">
            No active conversations. Once your realtor sets up your search,
            you'll be able to message them here.
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
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="mb-4 text-2xl font-bold tracking-tight sm:text-3xl">
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
