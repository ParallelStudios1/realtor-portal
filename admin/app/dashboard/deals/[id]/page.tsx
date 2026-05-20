import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getMe, getSupabaseServerClient } from '@/lib/supabaseSsr';
import { DealWorkspace } from './DealWorkspace';

export const dynamic = 'force-dynamic';

const PHASES = [
  { id: 'searching', label: 'Searching' },
  { id: 'offer_made', label: 'Offer made' },
  { id: 'counter_offer', label: 'Counter' },
  { id: 'under_contract', label: 'Under contract' },
  { id: 'closing', label: 'Closing' },
  { id: 'closed', label: 'Closed' },
] as const;

/**
 * Canonical deal detail page (replaces /dashboard/clients/[id] as the daily
 * driver). Server-renders everything for a single deal id, then hands off
 * to the DealWorkspace client component for interactivity.
 */
export default async function DealDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const me = (await getMe())!;
  if (!me.firm_id) redirect('/login');

  const supabase = getSupabaseServerClient();

  const { data: deal } = await supabase
    .from('client_searches')
    .select(
      `id, kind, phase, name, description, attorney_name, attorney_email,
       attorney_phone, docusign_envelope_url, co_realtor_id, realtor_id,
       agreed_price, closing_amount, earnest_money, commission_pct,
       contract_url, notes, offer_amount, counter_offer_amount,
       closing_date, closed_message, created_at, updated_at,
       client:users!client_searches_client_id_fkey ( id, full_name, email, created_at ),
       realtor:users!client_searches_realtor_id_fkey ( id, full_name, email )`
    )
    .eq('id', params.id)
    .eq('firm_id', me.firm_id)
    .maybeSingle();
  if (!deal) notFound();
  const clientId = (deal as any).client?.id as string;

  const [
    { data: allDeals },
    { data: houses },
    { data: tours },
    { data: dates },
    { data: documents },
    { data: participants },
    { data: activity },
    { data: teammates },
    { data: messages },
  ] = await Promise.all([
    supabase
      .from('client_searches')
      .select('id, kind, phase, name, created_at')
      .eq('client_id', clientId)
      .eq('firm_id', me.firm_id)
      .order('created_at', { ascending: false }),
    supabase
      .from('houses')
      .select('id, address, list_price, listing_url, photo_url, status, created_at')
      .eq('search_id', params.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('tour_requests')
      .select(
        'id, status, preferred_when, notes, created_at, house:houses ( id, address )'
      )
      .eq('search_id', params.id)
      .order('created_at', { ascending: false })
      .limit(6),
    supabase
      .from('important_dates')
      .select('id, label, date, notes')
      .eq('search_id', params.id)
      .order('date', { ascending: true }),
    supabase
      .from('documents')
      .select('id, name, storage_path, mime_type, folder, created_at')
      .eq('search_id', params.id)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('deal_participants')
      .select(
        'id, role, external_name, external_email, external_phone, can_view_documents, can_view_financials, can_view_messages, can_view_dates'
      )
      .eq('search_id', params.id)
      .order('role'),
    supabase
      .from('activities')
      .select('id, action, target, metadata, created_at')
      .eq('search_id', params.id)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('users')
      .select('id, full_name, email, role')
      .eq('firm_id', me.firm_id)
      .in('role', ['realtor', 'firm_admin', 'owner', 'manager', 'agent'])
      .neq('id', me.user_id),
    supabase
      .from('messages')
      .select('id, body, sender_id, created_at')
      .eq('search_id', params.id)
      .order('created_at', { ascending: false })
      .limit(5),
  ]);

  const phaseIdx = PHASES.findIndex((p) => p.id === (deal as any).phase);

  const canAssignRealtor =
    me.role === 'owner' ||
    me.role === 'firm_admin' ||
    me.role === 'super_admin' ||
    me.role === 'manager';

  return (
    <DealWorkspace
      clientId={clientId}
      me={{
        firmId: me.firm_id,
        userId: me.user_id,
        fullName: me.full_name,
        role: me.role || '',
        canAssignRealtor,
      }}
      deal={deal as any}
      phases={PHASES as any}
      phaseIdx={phaseIdx}
      allDeals={(allDeals || []) as any}
      houses={(houses || []) as any}
      tours={(tours || []) as any}
      dates={(dates || []) as any}
      documents={(documents || []) as any}
      participants={(participants || []) as any}
      activity={(activity || []) as any}
      teammates={(teammates || []) as any}
      recentMessages={(messages || []) as any}
    />
  );
}
