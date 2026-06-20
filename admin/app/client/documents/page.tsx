import { redirect } from 'next/navigation';
import { getMe, getSupabaseServerClient } from '@/lib/supabaseSsr';
import { ClientDocumentsList } from './ClientDocumentsList';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Documents' };

export default async function ClientDocumentsPage() {
  const me = await getMe();
  if (!me) {
    redirect('/login');
  }
  const supabase = getSupabaseServerClient();

  const { data: searches } = await supabase
    .from('client_searches')
    .select('id')
    .eq('client_id', me.user_id);

  const searchIds = (searches || []).map((s: any) => s.id);

  const { data: documents } = searchIds.length
    ? await supabase
        .from('documents')
        .select('id, name, storage_path, created_at')
        .in('search_id', searchIds)
        .order('created_at', { ascending: false })
    : { data: [] as any[] };

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-400">
          Paperwork
        </p>
        <h1 className="mt-1.5 text-2xl font-bold tracking-tight sm:text-3xl">Documents</h1>
        <p className="mt-1 text-sm text-ink-600">
          Disclosures, contracts, and other paperwork your agent shares with you.
        </p>
      </header>

      {!documents || documents.length === 0 ? (
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
              <path d="M14 3v4a1 1 0 0 0 1 1h4" />
              <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z" />
            </svg>
          </div>
          <h3 className="mt-4 text-base font-semibold">No documents yet</h3>
          <p className="mx-auto mt-1 max-w-sm text-sm text-ink-600">
            Anything your agent uploads - disclosures, contracts, closing
            paperwork - will appear here.
          </p>
        </div>
      ) : (
        <ClientDocumentsList documents={documents as any[]} />
      )}
    </main>
  );
}
