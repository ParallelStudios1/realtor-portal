import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SkeletonRow, Skeleton } from '@/components/Skeleton';
import { EmptyState } from '@/components/EmptyState';

/**
 * Realtor messaging hub - list of every active client thread on the left
 * (scrollable), conversation on the right. Realtime via Supabase.
 *
 * Mobile keeps this single-pane: tap a thread to view, back arrow returns.
 */
export default function RealtorMessagesScreen() {
  const { user, userProfile } = useAuth();
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<FlatList<any>>(null);

  // List of threads
  const { data: threads, isLoading: threadsLoading } = useQuery({
    queryKey: ['realtor-threads', userProfile?.firm_id],
    queryFn: async () => {
      const { data: searches } = await supabase
        .from('client_searches')
        .select('id, client:users!client_searches_client_id_fkey(id, full_name, email)')
        .eq('firm_id', userProfile!.firm_id!)
        .order('created_at', { ascending: false });
      return (searches || []) as any[];
    },
    enabled: !!userProfile?.firm_id,
  });

  // The active thread's client - DMs are scoped to the realtor↔client pair.
  const activeClientId: string | null =
    (threads || []).find((t: any) => t.id === activeId)?.client?.id || null;

  // PRIVATE 1:1 messages for the active thread (recipient set, client
  // involved) - matches the web Direct-messages hub. Previously this pulled
  // the whole-deal GROUP chat too, mixing "private" and public messages.
  const { data: messages } = useQuery({
    queryKey: ['messages', activeId, activeClientId || 'group'],
    queryFn: async () => {
      if (!activeId) return [];
      let q = supabase
        .from('messages')
        .select('*')
        .eq('search_id', activeId)
        .not('recipient_user_id', 'is', null)
        .order('created_at', { ascending: true });
      if (activeClientId) {
        q = q.or(
          `sender_id.eq.${activeClientId},recipient_user_id.eq.${activeClientId}`
        );
      }
      const { data } = await q;
      return (data || []) as any[];
    },
    enabled: !!activeId,
  });

  // Realtime subscribe to all messages in this firm; local state updates
  useEffect(() => {
    if (!userProfile?.firm_id) return;
    const channel = supabase
      .channel(`firm-msgs:${userProfile.firm_id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `firm_id=eq.${userProfile.firm_id}`,
        },
        (payload) => {
          const msg = payload.new as any;
          // DM hub: ignore group deal-chat posts (no recipient).
          if (!msg.recipient_user_id) return;
          const pairId =
            msg.sender_id === user?.id ? msg.recipient_user_id : msg.sender_id;
          queryClient.setQueryData<any[]>(
            ['messages', msg.search_id, pairId],
            (prev) => {
              if (!prev) return [msg];
              if (prev.some((m: any) => m.id === msg.id)) return prev;
              return [...prev, msg];
            }
          );
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userProfile?.firm_id, queryClient]);

  const send = async () => {
    if (!draft.trim() || !activeId || sending) return;
    setSending(true);
    const body = draft.trim();
    setDraft('');
    const { data: inserted, error } = await supabase
      .from('messages')
      .insert({
        firm_id: userProfile!.firm_id!,
        search_id: activeId,
        sender_id: user!.id,
        // Private 1:1 with the client - NOT the group deal chat.
        recipient_user_id: activeClientId,
        body,
      })
      .select('id')
      .single();
    setSending(false);
    if (error) {
      setDraft(body);
      return;
    }
    // Fire-and-forget push
    const apiBase =
      (process.env.EXPO_PUBLIC_API_URL as string | undefined) ||
      'https://realtorportal.parallelstudios.co';
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    fetch(`${apiBase}/api/notifications/send-push`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        searchId: activeId,
        messageId: inserted?.id,
        kind: 'message',
      }),
    }).catch(() => {});
  };

  if (!userProfile?.firm_id) return null;

  // Thread list view
  if (!activeId) {
    return (
      <SafeAreaView style={[s.container, { backgroundColor: colors.background }]}>
        {threads === undefined ? (
          <View>
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </View>
        ) : !threads || threads.length === 0 ? (
          <EmptyState
            icon="chatbubble-ellipses-outline"
            title="No conversations yet"
            body="Invite your first client to start chatting. Messages will show up here."
          />
        ) : (
          <FlatList
            data={threads}
            keyExtractor={(t) => t.id}
            renderItem={({ item }) => {
              const c = item.client;
              return (
                <Pressable
                  onPress={() => setActiveId(item.id)}
                  style={[s.threadRow, { borderBottomColor: colors.border }]}
                >
                  <View
                    style={[
                      s.avatar,
                      { backgroundColor: colors.primary + '22' },
                    ]}
                  >
                    <Text style={{ color: colors.primary, fontWeight: '700' }}>
                      {(c?.full_name || c?.email || '?')
                        .slice(0, 1)
                        .toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.threadName, { color: colors.text }]}>
                      {c?.full_name || c?.email || 'Unknown client'}
                    </Text>
                    {c?.email && (
                      <Text
                        style={[s.threadSub, { color: colors.textSecondary }]}
                      >
                        {c.email}
                      </Text>
                    )}
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={colors.textSecondary}
                  />
                </Pressable>
              );
            }}
          />
        )}
      </SafeAreaView>
    );
  }

  // Conversation view
  const active = threads?.find((t: any) => t.id === activeId);
  const partnerName =
    active?.client?.full_name || active?.client?.email || 'Conversation';

  return (
    <SafeAreaView style={[s.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          s.convHeader,
          { borderBottomColor: colors.border, backgroundColor: colors.background },
        ]}
      >
        <Pressable
          onPress={() => setActiveId(null)}
          hitSlop={8}
          style={{ padding: 6 }}
        >
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={[s.convName, { color: colors.text }]} numberOfLines={1}>
          {partnerName}
        </Text>
        <View style={{ width: 22 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
        keyboardVerticalOffset={80}
      >
        {messages === undefined ? (
          <View style={{ padding: 12, gap: 8, flex: 1 }}>
            <Skeleton width="60%" height={32} borderRadius={16} />
            <Skeleton
              width="50%"
              height={32}
              borderRadius={16}
              style={{ alignSelf: 'flex-end' as any }}
            />
            <Skeleton width="70%" height={32} borderRadius={16} />
          </View>
        ) : (
        <FlatList
          ref={scrollRef}
          data={messages || []}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 12, gap: 6 }}
          renderItem={({ item }) => {
            const own = item.sender_id === user?.id;
            return (
              <View
                style={{
                  alignSelf: own ? 'flex-end' : 'flex-start',
                  maxWidth: '78%',
                  backgroundColor: own ? colors.primary : colors.surface,
                  borderRadius: 16,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderBottomRightRadius: own ? 4 : 16,
                  borderBottomLeftRadius: own ? 16 : 4,
                }}
              >
                <Text
                  style={{
                    color: own ? '#fff' : colors.text,
                    fontSize: 14,
                  }}
                >
                  {item.body}
                </Text>
              </View>
            );
          }}
          onContentSizeChange={() =>
            scrollRef.current?.scrollToEnd({ animated: true })
          }
        />
        )}

        <View
          style={[
            s.inputBar,
            { borderTopColor: colors.border, backgroundColor: colors.background },
          ]}
        >
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Type a message…"
            placeholderTextColor={colors.textSecondary}
            multiline
            style={[
              s.input,
              {
                color: colors.text,
                borderColor: colors.border,
                backgroundColor: colors.surface,
              },
            ]}
            editable={!sending}
          />
          <Pressable
            onPress={send}
            disabled={!draft.trim() || sending}
            style={[
              s.sendBtn,
              {
                backgroundColor: draft.trim() ? colors.primary : colors.border,
              },
            ]}
          >
            <Ionicons name="arrow-up" size={18} color="#fff" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
  emptyText: { textAlign: 'center', marginTop: 14, fontSize: 14 },
  threadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  threadName: { fontSize: 15, fontWeight: '700' },
  threadSub: { fontSize: 12, marginTop: 2 },
  convHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 12,
  },
  convName: { flex: 1, textAlign: 'center', fontSize: 15, fontWeight: '700' },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    padding: 10,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxHeight: 100,
    fontSize: 14,
  },
  sendBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
