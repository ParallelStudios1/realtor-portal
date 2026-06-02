import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getMe, getSupabaseServerClient } from '@/lib/supabaseSsr';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { DealWorkspace } from './DealWorkspace';
import { buildCalendarFeedUrl } from '@/lib/ics';

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
  const me = await getMe();
  if (!me) redirect('/login');
  if (!me.firm_id) redirect('/login');

  const supabase = getSupabaseServerClient();

  // INTERMITTENT 404 FIX: rely on the SERVICE ROLE for the deal lookup,
  // then do our own access check. We were hitting a race where the
  // user-scoped query returned null when the SSR auth context was still
  // mid-refresh — first paint = empty cookie → RLS bounces row → notFound.
  // With service role, the deal is always findable; we just gate by
  // (firm_id match) OR (caller is a deal_participants row on this deal)
  // — the same predicate as can_collab_on_search.
  const service = getSupabaseServiceRoleClient();
  const { data: deal } = await service
    .from('client_searches')
    .select(
      `id, firm_id, client_id, kind, phase, name, description, attorney_name, attorney_email,
       attorney_phone, docusign_envelope_url, co_realtor_id, realtor_id,
       agreed_price, closing_amount, earnest_money, commission_pct,
       contract_url, notes, offer_amount, counter_offer_amount,
       closing_date, closed_message, created_at, updated_at,
       client:users!client_searches_client_id_fkey ( id, full_name, email, created_at ),
       realtor:users!client_searches_realtor_id_fkey ( id, full_name, email )`
    )
    .eq('id', params.id)
    .maybeSingle();
  if (!deal) notFound();

  // Access check (replaces what RLS would have done in the user-scoped
  // query). Either: caller's home firm matches, or caller is a participant
  // on this deal via user_id or external_email, or caller is the client.
  const callerIsInHostFirm = (deal as any).firm_id === me.firm_id;
  if (!callerIsInHostFirm) {
    const { data: participant } = await service
      .from('deal_participants')
      .select('id')
      .eq('search_id', (deal as any).id)
      .or(
        [
          `user_id.eq.${me.user_id}`,
          me.email ? `external_email.ilike.${me.email}` : null,
        ]
          .filter(Boolean)
          .join(',')
      )
      .limit(1);
    const isParticipant = (participant?.length ?? 0) > 0;
    const isPrincipalClient = (deal as any).client_id === me.user_id;
    if (!isParticipant && !isPrincipalClient) {
      notFound();
    }
  }
  // True when the deal belongs to a different firm than the caller's — i.e.
  // they're a cross-firm guest collaborator (invited realtor from another
  // firm). UI can use this to swap chrome ("Viewing as guest" badge,
  // different action grid, etc.). All RLS checks downstream still apply.
  const dealFirmId = (deal as any).firm_id as string;
  const isGuestFirm = dealFirmId !== me.firm_id;
  // clientId may be null — a deal can exist before there's a principal client.
  // The Add Party flow inside the workspace covers the "who's on this deal"
  // question. We still need a non-null clientId for the legacy action paths
  // that revalidatePath /dashboard/clients/[id], so fall back to the deal's
  // own id when the client is missing.
  const clientId = ((deal as any).client?.id as string) || (deal as any).id;

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
    { data: showings },
    { data: envelopes },
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
      .select(
        'id, label, date, notes, event_time, location, things_to_bring, completed_at, acknowledged_at, escalated_at, owner_user_id, reminders:date_reminders!date_reminders_date_id_fkey ( id, offset_days, channels, audience, escalate )'
      )
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
        'id, role, represents, external_name, external_email, external_phone, can_view_documents, can_view_financials, can_view_messages, can_view_dates'
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
    // Upcoming showings (>= now), oldest first so the soonest is on top.
    supabase
      .from('showings')
      .select(
        'id, scheduled_at, duration_minutes, location, attendees, status, notes, house_id, feedback_requested_at, house:houses ( id, address )'
      )
      .eq('search_id', params.id)
      .gte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(20),
    supabase
      .from('esign_envelopes')
      .select(
        'id, envelope_id, envelope_url, status, recipients, completed_at, created_at, document_id'
      )
      .eq('search_id', params.id)
      .order('created_at', { ascending: false }),
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
      isGuestFirm={isGuestFirm}
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
      showings={(showings || []) as any}
      envelopes={(envelopes || []) as any}
      calendarUrl={buildCalendarFeedUrl(deal.id)}
    />
  );
}
