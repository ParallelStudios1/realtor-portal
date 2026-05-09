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
      const { data, error } = await supabase
        .from('activities')
        .select('*')
        .eq('search_id', searchId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Activity[];
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

export function useMessages(searchId: string | null | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['messages', searchId],
    queryFn: async () => {
      if (!searchId) return [];
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('search_id', searchId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data as Message[];
    },
    enabled: !!searchId,
  });

  // Realtime subscription — push new messages into the cache the moment they
  // hit Postgres, instead of waiting for the next manual refetch. The channel
  // is keyed on searchId so swapping conversations cleanly tears down the old
  // subscription.
  useEffect(() => {
    if (!searchId) return;
    const channel = supabase
      .channel(`messages:${searchId}`)
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
          queryClient.setQueryData<Message[]>(['messages', searchId], (prev) => {
            if (!prev) return [msg];
            // Avoid duplicate if optimistic update already inserted
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [searchId, queryClient]);

  return query;
}

/** Ratings for one specific house (1 row max — `unique(client_id, house_id)`). */
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

/** All ratings on a search — used by the realtor view to see how each house landed. */
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

/** Tour requests on a search — realtor sees pending ones; client sees their own. */
export function useTourRequests(searchId: string | null | undefined) {
  return useQuery({
    queryKey: ['tourRequests', searchId],
    queryFn: async () => {
      if (!searchId) return [];
      const { data, error } = await supabase
        .from('tour_requests')
        .select('*')
        .eq('search_id', searchId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as TourRequest[];
    },
    enabled: !!searchId,
  });
}
