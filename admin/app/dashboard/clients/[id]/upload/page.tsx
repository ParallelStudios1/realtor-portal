import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getMe, getSupabaseServerClient } from '@/lib/supabaseSsr';
import { UploadDocumentClient } from './UploadDocumentClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Upload document' };

export default async function UploadDocPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { searchId?: string };
}) {
  const me = await getMe();
  if (!me) {
    redirect('/login');
  }
  const supabase = getSupabaseServerClient();

  const { data: client } = await supabase
    .from('users')
    .select('id, full_name, email, firm_id')
    .eq('id', params.id)
    .eq('firm_id', me.firm_id!)
    .maybeSingle();
  if (!client) notFound();

  // Honor explicit ?searchId (multi-deal-per-client world); fall back to the
  // most recent search for this client.
  let search: { id: string; firm_id: string } | null = null;
  if (searchParams?.searchId) {
    const { data } = await supabase
      .from('client_searches')
      .select('id, firm_id')
      .eq('id', searchParams.searchId)
      .eq('firm_id', me.firm_id!)
      .maybeSingle();
    search = (data as any) ?? null;
  }
  if (!search) {
    const { data } = await supabase
      .from('client_searches')
      .select('id, firm_id')
      .eq('client_id', params.id)
      .eq('firm_id', me.firm_id!)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    search = (data as any) ?? null;
  }
  if (!search) notFound();

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
      <Link
        href={`/dashboard/deals/${search.id}`}
        className="text-xs font-semibold text-ink-500 hover:text-ink-700"
      >
        ← Back to deal
      </Link>
      <h1 className="mt-1 text-2xl font-bold tracking-tight">
        Upload a document for {client.full_name || client.email}
      </h1>
      <p className="mt-1 text-sm text-ink-600">
        Files are stored in your firm's private bucket. Everyone on the deal
        with document visibility can see them.
      </p>
      <UploadDocumentClient
        firmId={search.firm_id}
        searchId={search.id}
        clientId={params.id}
      />
    </main>
  );
}
