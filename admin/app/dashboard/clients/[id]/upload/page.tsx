import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMe, getSupabaseServerClient } from '@/lib/supabaseSsr';
import { UploadDocumentClient } from './UploadDocumentClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Upload document' };

export default async function UploadDocPage({
  params,
}: {
  params: { id: string };
}) {
  const me = (await getMe())!;
  const supabase = getSupabaseServerClient();

  const { data: client } = await supabase
    .from('users')
    .select('id, full_name, email, firm_id')
    .eq('id', params.id)
    .eq('firm_id', me.firm_id!)
    .maybeSingle();
  if (!client) notFound();

  const { data: search } = await supabase
    .from('client_searches')
    .select('id, firm_id')
    .eq('client_id', params.id)
    .eq('firm_id', me.firm_id!)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!search) notFound();

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
      <Link
        href={`/dashboard/clients/${params.id}`}
        className="text-xs font-semibold text-slate-500 hover:text-slate-700"
      >
        ← Back
      </Link>
      <h1 className="mt-1 text-2xl font-bold tracking-tight">
        Upload a document for {client.full_name || client.email}
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        Files are stored in your firm's private bucket. The client can view
        them from their portal.
      </p>
      <UploadDocumentClient
        firmId={search.firm_id}
        searchId={search.id}
        clientId={params.id}
      />
    </main>
  );
}
