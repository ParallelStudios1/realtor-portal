import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import { apiFetch } from './api';

/**
 * Realtor deal-action hooks that mirror the web deal workspace:
 * showings, seller listing + offers management, participant management,
 * private party messages, and AI contract-date extraction.
 *
 * Reads go straight to Supabase (RLS gives firm staff full access);
 * writes go through the Bearer web API so behavior (auth rules, activity
 * rows, email/SMS notifications, phase auto-advance triggers) is identical
 * to the web app.
 */

export const OFFER_STATUSES = [
  { id: 'received', label: 'Received' },
  { id: 'countered', label: 'Countered' },
  { id: 'accepted', label: 'Accepted' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'withdrawn', label: 'Withdrawn' },
] as const;

export function offerStatusLabel(s: string | null | undefined): string {
  return OFFER_STATUSES.find((x) => x.id === s)?.label || 'Received';
}

export const SHOWING_STATUSES = [
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'confirmed', label: 'Confirmed' },
  { id: 'completed', label: 'Completed' },
  { id: 'canceled', label: 'Canceled' },
] as const;

export type Showing = {
  id: string;
  search_id: string;
  house_id: string | null;
  scheduled_at: string;
  duration_minutes: number;
  location: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  house?: { id: string; address: string | null } | null;
};

export type PrivateMessage = {
  id: string;
  body: string;
  created_at: string;
  fromMe: boolean;
  senderName: string;
};

export type ExtractionRow = {
  id: string;
  document_id: string | null;
  status: string;
  proposed_dates: { label: string; date: string }[] | null;
  created_at: string;
};

/* ---------------------------- Showings ---------------------------- */

export function useShowings(searchId: string | null | undefined) {
  return useQuery({
    queryKey: ['showings', searchId],
    queryFn: async () => {
      if (!searchId) return [];
      const { data, error } = await supabase
        .from('showings')
        .select(
          '*, house:houses!showings_house_id_fkey ( id, address )'
        )
        .eq('search_id', searchId)
        .order('scheduled_at', { ascending: true });
      if (error) throw error;
      return (data as any[]) as Showing[];
    },
    enabled: !!searchId,
  });
}

export type ShowingFeedback = {
  id: string;
  showing_id: string;
  author_name: string | null;
  author_email: string | null;
  stars: number | null;
  interest: string | null;
  price_opinion: string | null;
  liked: string | null;
  concerns: string | null;
  created_at: string;
};

export function useShowingFeedback(searchId: string | null | undefined) {
  return useQuery({
    queryKey: ['showingFeedback', searchId],
    queryFn: async () => {
      if (!searchId) return [];
      const { data, error } = await supabase
        .from('showing_feedback')
        .select(
          'id, showing_id, author_name, author_email, stars, interest, price_opinion, liked, concerns, created_at'
        )
        .eq('search_id', searchId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as any[]) as ShowingFeedback[];
    },
    enabled: !!searchId,
  });
}

export function useScheduleShowing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      searchId: string;
      houseId?: string | null;
      scheduledAt: string;
      durationMinutes?: number;
      location?: string | null;
      notes?: string | null;
    }) =>
      apiFetch('/api/showings/schedule', {
        method: 'POST',
        body: {
          search_id: input.searchId,
          house_id: input.houseId || null,
          scheduled_at: input.scheduledAt,
          duration_minutes: input.durationMinutes,
          location: input.location,
          notes: input.notes,
        },
      }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['showings', v.searchId] });
      qc.invalidateQueries({ queryKey: ['importantDates', v.searchId] });
      qc.invalidateQueries({ queryKey: ['activities', v.searchId] });
    },
  });
}

export function useRescheduleShowing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      searchId: string;
      showingId: string;
      scheduledAt: string;
      durationMinutes?: number;
      location?: string | null;
      notes?: string | null;
    }) =>
      apiFetch('/api/showings/reschedule', {
        method: 'POST',
        body: {
          search_id: input.searchId,
          showing_id: input.showingId,
          scheduled_at: input.scheduledAt,
          duration_minutes: input.durationMinutes,
          location: input.location,
          notes: input.notes,
        },
      }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['showings', v.searchId] });
      qc.invalidateQueries({ queryKey: ['activities', v.searchId] });
    },
  });
}

export function useUpdateShowingStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      searchId: string;
      showingId: string;
      status: 'scheduled' | 'confirmed' | 'completed' | 'canceled';
    }) =>
      apiFetch('/api/showings/status', {
        method: 'POST',
        body: {
          search_id: input.searchId,
          showing_id: input.showingId,
          status: input.status,
        },
      }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['showings', v.searchId] });
      qc.invalidateQueries({ queryKey: ['activities', v.searchId] });
    },
  });
}

/* ----------------------- Listing management ----------------------- */

export function useUpdateListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      searchId: string;
      houseId: string;
      patch: {
        listing_status?: string | null;
        list_price?: number | null;
        mls_number?: string | null;
        listed_at?: string | null;
        commission_pct?: number | null;
        sold_price?: number | null;
        sold_at?: string | null;
      };
    }) =>
      apiFetch(`/api/listings/${input.searchId}`, {
        method: 'PATCH',
        body: { house_id: input.houseId, patch: input.patch },
      }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['houses', v.searchId] });
      qc.invalidateQueries({ queryKey: ['search', v.searchId] });
    },
  });
}

export function useAddOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      searchId: string;
      houseId?: string | null;
      buyerName?: string | null;
      buyerAgent?: string | null;
      amount?: number | null;
      earnestMoney?: number | null;
      financing?: string | null;
      notes?: string | null;
    }) =>
      apiFetch(`/api/listings/${input.searchId}/offers`, {
        method: 'POST',
        body: {
          house_id: input.houseId || null,
          buyer_name: input.buyerName || null,
          buyer_agent: input.buyerAgent || null,
          amount: input.amount ?? null,
          earnest_money: input.earnestMoney ?? null,
          financing: input.financing || null,
          notes: input.notes || null,
        },
      }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['listingOffers', v.searchId] });
      qc.invalidateQueries({ queryKey: ['search', v.searchId] });
    },
  });
}

export function useUpdateOfferStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      searchId: string;
      offerId: string;
      status: string;
    }) =>
      apiFetch(`/api/listings/${input.searchId}/offers/${input.offerId}`, {
        method: 'PATCH',
        body: { status: input.status },
      }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['listingOffers', v.searchId] });
      qc.invalidateQueries({ queryKey: ['search', v.searchId] });
      qc.invalidateQueries({ queryKey: ['houses', v.searchId] });
    },
  });
}

export function useDeleteOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { searchId: string; offerId: string }) =>
      apiFetch(`/api/listings/${input.searchId}/offers/${input.offerId}`, {
        method: 'DELETE',
      }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['listingOffers', v.searchId] });
    },
  });
}

/* -------------------- Participant management ---------------------- */

export function useUpdateParticipant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      searchId: string;
      participantId: string;
      patch: {
        role?: string;
        name?: string | null;
        email?: string | null;
        phone?: string | null;
        can_view_documents?: boolean;
        can_view_financials?: boolean;
        can_view_messages?: boolean;
        can_view_dates?: boolean;
      };
    }) =>
      apiFetch('/api/participants/update', {
        method: 'POST',
        body: {
          search_id: input.searchId,
          participant_id: input.participantId,
          patch: input.patch,
        },
      }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['deal-participants', v.searchId] });
    },
  });
}

export function useRemoveParticipant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { searchId: string; participantId: string }) =>
      apiFetch('/api/participants/remove', {
        method: 'POST',
        body: {
          search_id: input.searchId,
          participant_id: input.participantId,
        },
      }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['deal-participants', v.searchId] });
    },
  });
}

/* --------------------- Private party messages --------------------- */

export function usePrivateThread(
  searchId: string | null | undefined,
  counterpart: { userId?: string | null; email?: string | null }
) {
  const key = counterpart.userId || counterpart.email || '';
  return useQuery({
    queryKey: ['privateThread', searchId, key],
    queryFn: async () => {
      if (!searchId || !key) return [];
      const params = new URLSearchParams({ search_id: searchId });
      if (counterpart.userId) params.set('user_id', counterpart.userId);
      if (counterpart.email) params.set('email', counterpart.email);
      const r = await apiFetch<{ ok: boolean; messages: PrivateMessage[] }>(
        '/api/messages/private?' + params.toString()
      );
      return r.messages || [];
    },
    enabled: !!searchId && !!key,
    refetchInterval: 10000,
  });
}

export function useSendPrivateMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      searchId: string;
      userId?: string | null;
      email?: string | null;
      body: string;
    }) =>
      apiFetch<{ ok: boolean; message: PrivateMessage }>(
        '/api/messages/private',
        {
          method: 'POST',
          body: {
            search_id: input.searchId,
            user_id: input.userId || null,
            email: input.email || null,
            body: input.body,
          },
        }
      ),
    onSuccess: (_d, v) => {
      const key = v.userId || v.email || '';
      qc.invalidateQueries({ queryKey: ['privateThread', v.searchId, key] });
    },
  });
}

/* --------------------- AI contract extraction --------------------- */

export function useExtractions(searchId: string | null | undefined) {
  return useQuery({
    queryKey: ['extractions', searchId],
    queryFn: async () => {
      if (!searchId) return [];
      const { data, error } = await supabase
        .from('contract_extractions')
        .select('id, document_id, status, proposed_dates, created_at')
        .eq('search_id', searchId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as any[]) as ExtractionRow[];
    },
    enabled: !!searchId,
  });
}

export function useRunExtraction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { searchId: string; documentId: string }) =>
      apiFetch<{ extraction?: ExtractionRow; error?: string }>(
        '/api/ai/contract-extract',
        {
          method: 'POST',
          body: { searchId: input.searchId, documentId: input.documentId },
        }
      ),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['extractions', v.searchId] });
    },
  });
}

export function useResolveExtraction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      searchId: string;
      extractionId: string;
      action: 'confirm' | 'discard';
      selectedDates?: { label: string; date: string }[];
    }) =>
      apiFetch(`/api/extractions/${input.extractionId}`, {
        method: 'PATCH',
        body: {
          action: input.action,
          selectedDates: input.selectedDates,
        },
      }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['extractions', v.searchId] });
      qc.invalidateQueries({ queryKey: ['importantDates', v.searchId] });
      qc.invalidateQueries({ queryKey: ['activities', v.searchId] });
    },
  });
}
