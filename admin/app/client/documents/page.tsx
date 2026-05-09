import { getMe, getSupabaseServerClient } from '@/lib/supabaseSsr';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Documents' };

export default async function ClientDocumentsPage() {
  const me = (await getMe())!;
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
        <ul className="mt-6 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {documents.map((d: any) => (
            <li key={d.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="text-sm font-semibold">{d.name}</div>
                <div className="text-xs text-slate-500">
                  {new Date(d.created_at).toLocaleDateString()}
                </div>
              </div>
              <span className="text-xs text-slate-400">
                {/* TODO(v1.1): generate signed Storage URL on demand */}
                File
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
