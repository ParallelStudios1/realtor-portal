import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import {
  Firm,
  UserProfile,
  ClientSearch,
  House,
  HouseRating,
  TourRequest,
  Activity,
  ImportantDate,
  Document,
  Message,
} from './database.types';

export function useFirm(firmId: string | null | undefined) {
  return useQuery({
    queryKey: ['firm', firmId],
    queryFn: async () => {
      if (!firmId) return null;
      const { data, error } = await supabase
        .from('firms')
        .select('*')
        .eq('id', firmId)
        .single();
      if (error) throw error;
      return data as Firm;
    },
    enabled: !!firmId,
  });
}

export function useUserProfile(userId: string | null | undefined) {
  return useQuery({
    queryKey: ['userProfile', userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();
      if (error) throw error;
      return data as UserProfile;
    },
    enabled: !!userId,
  });
}

export function useClientSearches(
  firmId: string | null | undefined,
  isRealtor: boolean = false,
  clientId?: string
) {
  return useQuery({
    queryKey: ['clientSearches', firmId, clientId],
    queryFn: async () => {
      if (!firmId) return [];
      let query = supabase
        .from('client_searches')
        .select('*')
        .eq('firm_id', firmId);

      if (!isRealtor && clientId) {
        query = query.eq('client_id', clientId);
      }

      const { data, error } = await query.order('created_at', {
        ascending: false,
      });
      if (error) throw error;
      return data as ClientSearch[];
    },
    enabled: !!firmId,
  });
}

export function useSearch(searchId: string | null | undefined) {
  return useQuery({
    queryKey: ['search', searchId],
    queryFn: async () => {
      if (!searchId) return null;
      const { data, error } = await supabase
        .from('client_searches')
        .select('*')
        .eq('id', searchId)
        .single();
      if (error) throw error;
      return data as ClientSearch;
    },
    enabled: !!searchId,
  });
}

export function useHouses(searchId: string | null | undefined) {
  return useQuery({
    queryKey: ['houses', searchId],
    queryFn: async () => {
      if (!searchId) return [];
      const { data, error } = await supabase
        .from('houses')
        .select('*')
        .eq('search_id', searchId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as House[];
    },
    enabled: !!searchId,
  });
}

/**
 * Every party on the deal: principal client, assigned realtor, plus
 * deal_participants rows (co-realtors, attorneys, inspectors, lenders, etc.).
 * Mirror of the web's deal-detail participants query - selects whatever
 * the People section needs to render.
 */
export function useDealParticipants(searchId: string | null | undefined) {
  return useQuery({
    queryKey: ['deal-participants', searchId],
    queryFn: async () => {
      if (!searchId) return [];
      const { data, error } = await supabase
        .from('deal_participants')
        .select(
          'id, role, external_name, external_email, external_phone, can_view_documents, can_view_financials, can_view_messages, can_view_dates'
        )
        .eq('search_id', searchId)
        .order('role');
      if (error) throw error;
      return data || [];
    },
    enabled: !!searchId,
  });
}

export function useHouse(houseId: string | null | undefined) {
  return useQuery({
    queryKey: ['house', houseId],
    queryFn: async () => {
      if (!houseId) return null;
      const { data, error } = await supabase
        .from('houses')
        .select('*')
        .eq('id', houseId)
        .single();
      if (error) throw error;
      return data as House;
    },
    enabled: !!houseId,
  });
}

export function useActivities(searchId: string | null | undefined) {
  return useQuery({
    queryKey: ['activities', searchId],
    queryFn: async () => {
      if (!searchId) return [];
      // Join the actor so the feed shows a real name instead of "Unknown".
      const { data, error } = await supabase
        .from('activities')
        .select('*, actor:users!activities_actor_id_fkey ( full_name, email )')
        .eq('search_id', searchId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as any[];
    },
    enabled: !!searchId,
  });
}

export function useImportantDates(searchId: string | null | undefined) {
  return useQuery({
    queryKey: ['importantDates', searchId],
    queryFn: async () => {
      if (!searchId) return [];
      const { data, error } = await supabase
        .from('important_dates')
        .select('*')
        .eq('search_id', searchId)
        .order('date', { ascending: true });
      if (error) throw error;
      return data as ImportantDate[];
    },
    enabled: !!searchId,
  });
}

export function useDocuments(searchId: string | null | undefined) {
  return useQuery({
    queryKey: ['documents', searchId],
    queryFn: async () => {
      if (!searchId) return [];
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('search_id', searchId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Document[];
    },
    enabled: !!searchId,
  });
}

/**
 * Messages for one deal thread.
 *
 * `directWith` (a user id) switches the hook into PRIVATE-DM mode: only
 * messages with a recipient set, to/from that user, are returned. Without it
 * you get the whole-deal GROUP chat (recipient null) - matching the web app's
 * Deal chat vs. Direct messages split. Previously this returned BOTH mixed
 * together, so "private" messages and group chat were indistinguishable.
 */
export function useMessages(
  searchId: string | null | undefined,
  directWith?: string | null
) {
  const queryClient = useQueryClient();

  const matchesMode = (m: any) => {
    const recipient = (m as any).recipient_user_id ?? null;
    if (directWith) {
      // Private 1:1: recipient set AND the other party is involved.
      return (
        recipient !== null &&
        (m.sender_id === directWith || recipient === directWith)
      );
    }
    // Group deal chat: no recipient.
    return recipient === null;
  };

  const query = useQuery({
    queryKey: ['messages', searchId, directWith || 'group'],
    queryFn: async () => {
      if (!searchId) return [];
      let q = supabase
        .from('messages')
        .select('*')
        .eq('search_id', searchId)
        .order('created_at', { ascending: true });
      if (directWith) {
        q = q
          .not('recipient_user_id', 'is', null)
          .or(`sender_id.eq.${directWith},recipient_user_id.eq.${directWith}`);
      } else {
        q = q.is('recipient_user_id', null);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data as Message[];
    },
    enabled: !!searchId,
  });

  // Realtime subscription - push new messages into the cache the moment they
  // hit Postgres, instead of waiting for the next manual refetch. The channel
  // is keyed on searchId so swapping conversations cleanly tears down the old
  // subscription.
  useEffect(() => {
    if (!searchId) return;
    const channel = supabase
      .channel(`messages:${searchId}:${directWith || 'group'}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `search_id=eq.${searchId}`,
        },
        (payload) => {
          const msg = payload.new as Message;
          if (!matchesMode(msg)) return;
          queryClient.setQueryData<Message[]>(
            ['messages', searchId, directWith || 'group'],
            (prev) => {
              if (!prev) return [msg];
              // Avoid duplicate if optimistic update already inserted
              if (prev.some((m) => m.id === msg.id)) return prev;
              return [...prev, msg];
            }
          );
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchId, directWith, queryClient]);

  return query;
}

/** Ratings for one specific house (1 row max - `unique(client_id, house_id)`). */
export function useHouseRating(houseId: string | null | undefined, clientId: string | null | undefined) {
  return useQuery({
    queryKey: ['houseRating', houseId, clientId],
    queryFn: async () => {
      if (!houseId || !clientId) return null;
      const { data, error } = await supabase
        .from('house_ratings')
        .select('*')
        .eq('house_id', houseId)
        .eq('client_id', clientId)
        .maybeSingle();
      if (error) throw error;
      return data as HouseRating | null;
    },
    enabled: !!houseId && !!clientId,
  });
}

/** All ratings on a search - used by the realtor view to see how each house landed. */
export function useSearchRatings(searchId: string | null | undefined) {
  return useQuery({
    queryKey: ['searchRatings', searchId],
    queryFn: async () => {
      if (!searchId) return [];
      const { data, error } = await supabase
        .from('house_ratings')
        .select('*')
        .eq('search_id', searchId)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return data as HouseRating[];
    },
    enabled: !!searchId,
  });
}

/** Tour requests on a search - realtor sees pending ones; client sees their own. */
export function useTourRequests(searchId: string | null | undefined) {
  return useQuery({
    queryKey: ['tourRequests', searchId],
    queryFn: async () => {
      if (!searchId) return [];
      const { data, error } = await supabase
        .from('tour_requests')
        .select('*, house:houses!tour_requests_house_id_fkey ( id, address )')
        .eq('search_id', searchId)
        .order('requested_at', { ascending: true });
      if (error) throw error;
      return data as any[];
    },
    enabled: !!searchId,
  });
}

/**
 * Listing offers on a (seller) deal - visible to every authorized party so
 * the inputted numbers (offer amount, earnest, financing) are seen by all,
 * matching the web "Offers" surface.
 */
export function useListingOffers(searchId: string | null | undefined) {
  return useQuery({
    queryKey: ['listingOffers', searchId],
    queryFn: async () => {
      if (!searchId) return [];
      const { data, error } = await supabase
        .from('listing_offers')
        .select('*')
        .eq('search_id', searchId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as any[]) || [];
    },
    enabled: !!searchId,
  });
}

/**
 * E-sign / signing links on a deal - the manual DocuSign-link records with
 * their designated signers, shown read-only to every party.
 */
export function useEsignEnvelopes(searchId: string | null | undefined) {
  return useQuery({
    queryKey: ['esignEnvelopes', searchId],
    queryFn: async () => {
      if (!searchId) return [];
      const { data, error } = await supabase
        .from('esign_envelopes')
        .select('id, envelope_url, status, recipients, document_id, created_at')
        .eq('search_id', searchId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as any[]) || [];
    },
    enabled: !!searchId,
  });
}
