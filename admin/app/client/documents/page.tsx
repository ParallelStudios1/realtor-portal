import { getMe, getSupabaseServerClient } from '@/lib/supabaseSsr';
import { ClientDocumentsList } from './ClientDocumentsList';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Documents' };

export default async function ClientDocumentsPage() {
  const me = await getMe();
  if (!me) {
    const { redirect } = await import('next/navigation');
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
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Documents</h1>
      <p className="mt-1 text-sm text-slate-600">
        Disclosures, contracts, and other paperwork your agent shares with you.
      </p>

      {!documents || documents.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <h3 className="text-base font-semibold">No documents yet</h3>
          <p className="mt-1 text-sm text-slate-600">
            Anything your agent uploads will appear here.
          </p>
        </div>
      ) : (
        <ClientDocumentsList documents={documents as any[]} />
      )}
    </main>
  );
}
