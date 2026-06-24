import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getMe, getSupabaseServerClient } from '@/lib/supabaseSsr';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { DealWorkspace } from './DealWorkspace';
import { getDealChat } from './chatActions';
import { buildCalendarFeedUrl } from '@/lib/ics';

export const dynamic = 'force-dynamic';

const PHASES = [
  { id: 'searching', label: 'Searching' },
  { id: 'awaiting_offer', label: 'Awaiting offer' },
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
  // mid-refresh - first paint = empty cookie → RLS bounces row → notFound.
  // With service role, the deal is always findable; we just gate by
  // (firm_id match) OR (caller is a deal_participants row on this deal)
  // - the same predicate as can_collab_on_search.
  const service = getSupabaseServiceRoleClient();
  const { data: deal } = await service
    .from('client_searches')
    .select(
      `id, firm_id, client_id, kind, phase, subphase, name, description, attorney_name, attorney_email,
       attorney_phone, docusign_envelope_url, co_realtor_id, realtor_id,
       agreed_price, closing_amount, earnest_money, commission_pct,
       contract_url, notes, offer_amount, counter_offer_amount,
       closing_date, closed_message, offer_house_id, house_agreed_at,
       house_agreed_by, house_proposed_house_id, house_proposed_by, house_proposed_at,
       buyer_desired_offer,
       created_by, created_at, updated_at,
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
  // True when the deal belongs to a different firm than the caller's - i.e.
  // they're a cross-firm guest collaborator (invited realtor from another
  // firm). UI can use this to swap chrome ("Viewing as guest" badge,
  // different action grid, etc.). All RLS checks downstream still apply.
  const dealFirmId = (deal as any).firm_id as string;
  const isGuestFirm = dealFirmId !== me.firm_id;
  // clientId may be null - a deal can exist before there's a principal client.
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
    { data: listingOffers },
  ] = await Promise.all([
    supabase
      .from('client_searches')
      .select('id, kind, phase, name, created_at')
      .eq('client_id', clientId)
      .eq('firm_id', me.firm_id)
      .order('created_at', { ascending: false }),
    supabase
      .from('houses')
      .select(
        'id, address, list_price, listing_url, photo_url, status, created_at, ' +
          'bedrooms, bathrooms, square_feet, ' +
          'is_under_contract, seller_name, seller_email, seller_realtor_name, ' +
          'seller_realtor_email, seller_realtor_firm, ' +
          'listing_status, mls_number, listed_at, commission_pct, sold_price, sold_at'
      )
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
    // PRIVATE 1:1 DMs only (recipient set) - the group Deal chat renders
    // separately below. Without this filter the "Recent messages" rail mixed
    // both threads together, blurring the private/group distinction.
    supabase
      .from('messages')
      .select('id, body, sender_id, recipient_user_id, created_at')
      .eq('search_id', params.id)
      .not('recipient_user_id', 'is', null)
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
    supabase
      .from('listing_offers')
      .select(
        'id, house_id, buyer_name, buyer_agent, amount, earnest_money, financing, status, offer_date, notes, created_at'
      )
      .eq('search_id', params.id)
      .order('created_at', { ascending: false }),
  ]);

  // BUYER INTEREST (Phase 2) - only meaningful for seller (listing) deals.
  // Aggregate, read-only, from existing tables:
  //   - total showings + tour requests on this listing's houses
  //   - linked buyer transactions: any house on ANOTHER (buyer) deal whose
  //     listing_search_id back-references this seller deal. Each such house
  //     that is under contract = a buyer locked in on our listing.
  // We use the service role for the back-reference query because the linked
  // house lives on a buyer deal hosted by a (possibly) different firm - RLS
  // would (correctly) hide it from the seller, but the aggregate count is safe
  // to surface without leaking the buyer's private candidate list.
  let buyerInterest: {
    showingCount: number;
    tourRequestCount: number;
    linkedBuyerCount: number;
    underContractBuyerCount: number;
  } | null = null;
  if ((deal as any).kind === 'seller') {
    const [showingAgg, tourAgg, linkedHouses] = await Promise.all([
      service
        .from('showings')
        .select('id', { count: 'exact', head: true })
        .eq('search_id', params.id),
      service
        .from('tour_requests')
        .select('id', { count: 'exact', head: true })
        .eq('search_id', params.id),
      service
        .from('houses')
        .select('id, is_under_contract')
        .eq('listing_search_id', params.id),
    ]);
    const linked = (linkedHouses.data || []) as Array<{
      id: string;
      is_under_contract: boolean | null;
    }>;
    buyerInterest = {
      showingCount: showingAgg.count ?? 0,
      tourRequestCount: tourAgg.count ?? 0,
      linkedBuyerCount: linked.length,
      underContractBuyerCount: linked.filter((h) => h.is_under_contract).length,
    };
  }

  // CLIENT ↔ REALTOR HOUSE AGREEMENT - resolve the agreed home (address) and
  // who agreed (client or realtor) for the prominent workspace banner.
  let agreedHome: {
    id: string;
    address: string | null;
    photo_url: string | null;
    agreedAt: string | null;
    agreedByName: string | null;
    agreedByRole: 'client' | 'realtor' | 'other' | null;
  } | null = null;
  if ((deal as any).house_agreed_at && (deal as any).offer_house_id) {
    const agreedHouse = (houses || []).find(
      (h: any) => h.id === (deal as any).offer_house_id
    );
    let agreedByName: string | null = null;
    let agreedByRole: 'client' | 'realtor' | 'other' | null = null;
    const agreedById = (deal as any).house_agreed_by as string | null;
    if (agreedById) {
      if (agreedById === (deal as any).client?.id) {
        agreedByName = (deal as any).client?.full_name || (deal as any).client?.email;
        agreedByRole = 'client';
      } else if (agreedById === (deal as any).realtor?.id) {
        agreedByName = (deal as any).realtor?.full_name || (deal as any).realtor?.email;
        agreedByRole = 'realtor';
      } else {
        const { data: who } = await service
          .from('users')
          .select('full_name, email')
          .eq('id', agreedById)
          .maybeSingle();
        agreedByName = (who as any)?.full_name || (who as any)?.email || null;
        agreedByRole = 'other';
      }
    }
    agreedHome = {
      id: (deal as any).offer_house_id,
      address: (agreedHouse as any)?.address ?? null,
      photo_url: (agreedHouse as any)?.photo_url ?? null,
      agreedAt: (deal as any).house_agreed_at,
      agreedByName,
      agreedByRole,
    };
  }

  // PROPOSED HOME - the client said "this is the house I want" and is awaiting
  // the realtor's confirmation. Surfaced as a confirm banner in the workspace.
  // Only show when there's a pending proposal that hasn't already been agreed.
  let proposedHome: {
    id: string;
    address: string | null;
    proposedByName: string | null;
    desiredOffer: number | null;
  } | null = null;
  if (
    (deal as any).house_proposed_house_id &&
    !(deal as any).house_agreed_at
  ) {
    const ph = (houses || []).find(
      (h: any) => h.id === (deal as any).house_proposed_house_id
    );
    let proposedByName: string | null = null;
    const pid = (deal as any).house_proposed_by as string | null;
    if (pid === (deal as any).client?.id) {
      proposedByName =
        (deal as any).client?.full_name || (deal as any).client?.email || 'The client';
    } else if (pid) {
      const { data: who } = await service
        .from('users')
        .select('full_name, email')
        .eq('id', pid)
        .maybeSingle();
      proposedByName = (who as any)?.full_name || (who as any)?.email || 'The client';
    }
    proposedHome = {
      id: (deal as any).house_proposed_house_id,
      address: (ph as any)?.address ?? null,
      proposedByName,
      desiredOffer: (deal as any).buyer_desired_offer ?? null,
    };
  }

  // DEAL ADMIN - the deal's creator (client_searches.created_by) is the person
  // with full control over the deal. Resolve their display name for the header.
  // Reuse the already-fetched client/realtor rows when they match, otherwise
  // do a single lookup. created_by may be null on legacy rows.
  let dealAdmin: { id: string; name: string | null } | null = null;
  const createdById = (deal as any).created_by as string | null;
  if (createdById) {
    if (createdById === (deal as any).realtor?.id) {
      dealAdmin = {
        id: createdById,
        name: (deal as any).realtor?.full_name || (deal as any).realtor?.email || null,
      };
    } else if (createdById === (deal as any).client?.id) {
      dealAdmin = {
        id: createdById,
        name: (deal as any).client?.full_name || (deal as any).client?.email || null,
      };
    } else {
      const { data: adminUser } = await service
        .from('users')
        .select('full_name, email')
        .eq('id', createdById)
        .maybeSingle();
      dealAdmin = {
        id: createdById,
        name: (adminUser as any)?.full_name || (adminUser as any)?.email || null,
      };
    }
  }

  // DEAL GROUP CHAT - the shared thread for the whole deal (group messages =
  // private IS NULL OR private = false). getDealChat re-authorizes the caller;
  // staff on the host firm always pass. Distinct from the 1:1 DM thread that
  // the "Recent messages" rail / /dashboard/messages surface shows.
  const dealChat = await getDealChat(params.id);
  const dealChatMessages = dealChat.ok ? dealChat.messages : [];

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
      dealChatMessages={dealChatMessages}
      showings={(showings || []) as any}
      envelopes={(envelopes || []) as any}
      buyerInterest={buyerInterest}
      agreedHome={agreedHome}
      proposedHome={proposedHome}
      listingOffers={(listingOffers || []) as any}
      dealAdmin={dealAdmin}
      calendarUrl={buildCalendarFeedUrl(deal.id)}
    />
  );
}
