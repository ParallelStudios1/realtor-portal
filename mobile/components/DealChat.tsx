import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import { formatRelativeTime } from '@/lib/format';
import { useToast } from '@/components/Toast';
import { humanError } from '@/lib/humanError';

/**
 * DEAL GROUP CHAT — reusable native component.
 *
 * Renders the whole-deal group thread (every party on the deal) plus a
 * composer. Talks to the deployed web API exactly like the rest of the app:
 *   - supabase.auth.getSession() → access_token → Authorization: Bearer <token>
 *   - base URL = EXPO_PUBLIC_API_URL || prod URL
 *
 *   GET  /api/deals/{searchId}/chat
 *     → { ok, messages:[{id, body, sender_id, senderName, senderIsYou, created_at}], meUserId }
 *   POST /api/deals/{searchId}/chat  body { body }
 *     → { ok, message:{ ...same shape } }
 *
 * Sending optimistically appends a pending bubble, POSTs, then reconciles the
 * real row (or rolls the bubble back on failure). "You" bubbles align right and
 * use the brand color; others align left on the surface color and show the
 * sender's name.
 *
 * Drop it into a screen with a flex parent — it fills available space.
 */

type ChatMessage = {
  id: string;
  body: string;
  sender_id: string | null;
  senderName: string;
  senderIsYou: boolean;
  created_at: string;
  _pending?: boolean;
  _failed?: boolean;
};

function apiBaseUrl() {
  return (
    (process.env.EXPO_PUBLIC_API_URL as string | undefined) ||
    'https://realtorportal.parallelstudios.co'
  ).replace(/\/$/, '');
}

function tempId() {
  return `temp-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`;
}

export function DealChat({ searchId }: { searchId: string | null | undefined }) {
  const { colors } = useTheme();
  const toast = useToast();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const listRef = useRef<FlatList<ChatMessage>>(null);

  const scrollToBottom = useCallback((animated = true) => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd?.({ animated });
    });
  }, []);

  const load = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (!searchId) {
        setLoading(false);
        return;
      }
      if (mode === 'initial') setLoading(true);
      else setRefreshing(true);
      setError(null);
      try {
        const { data: sess } = await supabase.auth.getSession();
        const token = sess.session?.access_token;
        const r = await fetch(`${apiBaseUrl()}/api/deals/${searchId}/chat`, {
          method: 'GET',
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
        const raw = await r.text();
        let json: any = null;
        try {
          json = raw ? JSON.parse(raw) : null;
        } catch {}
        if (!r.ok || !json?.ok) {
          throw new Error(json?.error || `Failed (HTTP ${r.status}).`);
        }
        const next: ChatMessage[] = Array.isArray(json.messages)
          ? json.messages
          : [];
        setMessages(next);
        scrollToBottom(mode === 'refresh');
      } catch (e: any) {
        setError(humanError(e));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [searchId, scrollToBottom],
  );

  useEffect(() => {
    load('initial');
  }, [load]);

  const send = useCallback(async () => {
    const body = draft.trim();
    if (!body || !searchId || sending) return;

    const optimistic: ChatMessage = {
      id: tempId(),
      body,
      sender_id: null,
      senderName: 'You',
      senderIsYou: true,
      created_at: new Date().toISOString(),
      _pending: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    setDraft('');
    setSending(true);
    scrollToBottom(true);

    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      const r = await fetch(`${apiBaseUrl()}/api/deals/${searchId}/chat`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ body }),
      });
      const raw = await r.text();
      let json: any = null;
      try {
        json = raw ? JSON.parse(raw) : null;
      } catch {}
      if (!r.ok || !json?.ok || !json?.message) {
        throw new Error(json?.error || `Failed (HTTP ${r.status}).`);
      }
      const real = json.message as ChatMessage;
      // Reconcile: swap the pending bubble for the server row.
      setMessages((prev) =>
        prev.map((m) => (m.id === optimistic.id ? { ...real } : m)),
      );
    } catch (e: any) {
      // Mark the bubble as failed so the user can see it didn't go through.
      setMessages((prev) =>
        prev.map((m) =>
          m.id === optimistic.id
            ? { ...m, _pending: false, _failed: true }
            : m,
        ),
      );
      toast.show(humanError(e), { variant: 'error' });
    } finally {
      setSending(false);
    }
  }, [draft, searchId, sending, scrollToBottom, toast]);

  const canSend = !!draft.trim() && !!searchId && !sending;

  const renderItem = useCallback(
    ({ item }: { item: ChatMessage }) => (
      <ChatBubble message={item} colors={colors} />
    ),
    [colors],
  );

  if (!searchId) {
    return (
      <View style={[styles.centered]}>
        <Text style={{ color: colors.textSecondary, fontStyle: 'italic' }}>
          No active deal yet.
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
    >
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : error && messages.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons
            name="cloud-offline-outline"
            size={28}
            color={colors.textSecondary}
          />
          <Text style={[styles.errorText, { color: colors.textSecondary }]}>
            {error}
          </Text>
          <Pressable
            onPress={() => load('initial')}
            style={[styles.retryBtn, { borderColor: colors.primary }]}
          >
            <Text style={{ color: colors.primary, fontWeight: '600' }}>
              Try again
            </Text>
          </Pressable>
        </View>
      ) : messages.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons
            name="chatbubbles-outline"
            size={32}
            color={colors.textSecondary}
          />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            No messages yet. Start the conversation — everyone on the deal will
            see it.
          </Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 12, gap: 2 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load('refresh')}
              tintColor={colors.primary}
            />
          }
          onContentSizeChange={() => scrollToBottom(false)}
        />
      )}

      <View style={[styles.inputRow, { borderTopColor: colors.border }]}>
        <TextInput
          style={[
            styles.input,
            {
              color: colors.text,
              borderColor: colors.border,
              backgroundColor: colors.surface,
            },
          ]}
          placeholder="Message the deal…"
          placeholderTextColor={colors.textSecondary}
          value={draft}
          onChangeText={setDraft}
          editable={!sending}
          multiline
        />
        <Pressable
          onPress={send}
          disabled={!canSend}
          style={[
            styles.sendBtn,
            { backgroundColor: canSend ? colors.primary : colors.border },
          ]}
        >
          {sending ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Ionicons name="send" size={16} color="#fff" />
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function ChatBubble({
  message,
  colors,
}: {
  message: ChatMessage;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  const isOwn = message.senderIsYou;
  return (
    <View
      style={[
        styles.bubbleWrap,
        isOwn ? styles.ownWrap : styles.otherWrap,
      ]}
    >
      {!isOwn && (
        <Text style={[styles.senderName, { color: colors.textSecondary }]}>
          {message.senderName}
        </Text>
      )}
      <View
        style={[
          styles.bubble,
          {
            backgroundColor: isOwn ? colors.primary : colors.surface,
            borderColor: colors.border,
            borderWidth: isOwn ? 0 : StyleSheet.hairlineWidth,
            opacity: message._pending ? 0.6 : 1,
          },
        ]}
      >
        <Text style={[styles.bubbleText, { color: isOwn ? '#fff' : colors.text }]}>
          {message.body}
        </Text>
      </View>
      <Text
        style={[
          styles.time,
          {
            color: message._failed ? colors.error : colors.textSecondary,
            textAlign: isOwn ? 'right' : 'left',
          },
        ]}
      >
        {message._failed
          ? 'Failed to send'
          : message._pending
            ? 'Sending…'
            : formatRelativeTime(message.created_at)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 10,
  },
  emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  errorText: { fontSize: 14, textAlign: 'center' },
  retryBtn: {
    marginTop: 4,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  bubbleWrap: { marginVertical: 6, maxWidth: '82%' },
  ownWrap: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  otherWrap: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  senderName: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 2,
    marginHorizontal: 4,
  },
  bubble: {
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  time: { fontSize: 11, marginTop: 3, marginHorizontal: 4 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderTopWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxHeight: 110,
    fontSize: 15,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 1,
  },
});
