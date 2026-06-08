import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getMe } from '@/lib/supabaseSsr';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { UploadDocumentClient } from '../../../clients/[id]/upload/UploadDocumentClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Upload document' };

/**
 * Deal-centric document upload.
 *
 * This replaces the old /dashboard/clients/[id]/upload route, which 404'd
 * whenever a deal had no buyer client (null client_id on seller-side and
 * two-sided deals) because the link built /dashboard/clients/undefined/upload.
 * Uploads belong to the DEAL (search_id), not a specific client, so we resolve
 * by deal id and authorize by firm staff OR deal participation (so attorneys
 * and co-realtors can upload too).
 */
export default async function DealUploadPage({
  params,
}: {
  params: { id: string };
}) {
  const me = await getMe();
  if (!me?.user_id) redirect('/login');

  const service = getSupabaseServiceRoleClient();
  const { data: deal } = await service
    .from('client_searches')
    .select('id, firm_id, client_id, name')
    .eq('id', params.id)
    .maybeSingle();
  if (!deal) notFound();

  const d = deal as {
    id: string;
    firm_id: string;
    client_id: string | null;
    name: string | null;
  };

  // Authorize: firm staff on the deal's firm, the principal client, or any
  // invited participant (attorney / co-realtor / seller / buyer).
  const isStaffSameFirm =
    !!me.firm_id &&
    me.firm_id === d.firm_id &&
    ['realtor', 'firm_admin', 'super_admin', 'owner', 'manager', 'agent'].includes(
      me.role || ''
    );
  const isPrincipalClient = d.client_id === me.user_id;

  let isParticipant = false;
  if (!isStaffSameFirm && !isPrincipalClient) {
    const orClauses = [
      `user_id.eq.${me.user_id}`,
      me.email ? `external_email.ilike.${me.email}` : null,
    ]
      .filter(Boolean)
      .join(',');
    const { data: rows } = await service
      .from('deal_participants')
      .select('id')
      .eq('search_id', d.id)
      .or(orClauses)
      .limit(1);
    isParticipant = (rows || []).length > 0;
  }

  if (!isStaffSameFirm && !isPrincipalClient && !isParticipant) {
    notFound();
  }

  const backHref = isStaffSameFirm
    ? `/dashboard/deals/${d.id}`
    : me.role === 'attorney'
    ? `/attorney/deals/${d.id}`
    : `/deal/${d.id}`;

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
      <Link
        href={backHref}
        className="text-xs font-semibold text-ink-500 hover:text-ink-700"
      >
        ← Back to deal
      </Link>
      <h1 className="mt-1 text-2xl font-bold tracking-tight">
        Upload a document{d.name ? ` — ${d.name}` : ''}
      </h1>
      <p className="mt-1 text-sm text-ink-600">
        Files are stored in your firm's private bucket. Everyone on the deal
        with document visibility can see them.
      </p>
      <UploadDocumentClient
        firmId={d.firm_id}
        searchId={d.id}
        clientId={d.client_id}
        redirectTo={backHref}
      />
    </main>
  );
}
