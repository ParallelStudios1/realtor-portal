import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import { useTheme } from '@/lib/theme';
import {
  usePrivateThread,
  useSendPrivateMessage,
} from '@/lib/dealActions';
import { useToast } from '@/components/Toast';
import { humanError } from '@/lib/humanError';

/**
 * Private 1:1 thread with one party on the deal - mobile mirror of the web
 * PrivateMessages panel. Only the two of you see these; the recipient also
 * gets an email/SMS nudge, same as web.
 */
export default function PrivateMessagesScreen() {
  const { id: searchId, userId, email, name } = useLocalSearchParams<{
    id: string;
    userId?: string;
    email?: string;
    name?: string;
  }>();
  const { colors } = useTheme();
  const toast = useToast();
  const scrollRef = useRef<ScrollView>(null);

  const counterpart = { userId: userId || null, email: email || null };
  const { data: messages, isLoading, refetch } = usePrivateThread(
    searchId,
    counterpart
  );
  const send = useSendPrivateMessage();
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if ((messages ?? []).length > 0) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 50);
    }
  }, [messages?.length]);

  const submit = async () => {
    const text = draft.trim();
    if (!text || !searchId) return;
    setDraft('');
    try {
      await send.mutateAsync({
        searchId,
        userId: counterpart.userId,
        email: counterpart.email,
        body: text,
      });
      await refetch();
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    } catch (e: any) {
      setDraft(text);
      toast.show(humanError(e), { variant: 'error' });
    }
  };

  return (
    <SafeAreaView style={[s.container, { backgroundColor: colors.background }]}>
      <View style={[s.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1, marginHorizontal: 8 }}>
          <Text
            style={[s.headerTitle, { color: colors.text }]}
            numberOfLines={1}
          >
            {name || 'Private messages'}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 11 }}>
            Only the two of you see this thread
          </Text>
        </View>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{ padding: 16, paddingBottom: 12 }}
        >
          {isLoading ? (
            <ActivityIndicator
              size="large"
              color={colors.primary}
              style={{ marginTop: 40 }}
            />
          ) : (messages ?? []).length === 0 ? (
            <View style={{ alignItems: 'center', paddingTop: 48 }}>
              <Ionicons
                name="lock-closed-outline"
                size={36}
                color={colors.border}
              />
              <Text
                style={{
                  color: colors.textSecondary,
                  marginTop: 12,
                  textAlign: 'center',
                }}
              >
                No messages yet. Say hello - they'll get an email or text nudge
                to reply.
              </Text>
            </View>
          ) : (
            (messages ?? []).map((m) => (
              <View
                key={m.id}
                style={[
                  s.bubble,
                  m.fromMe
                    ? { backgroundColor: colors.primary, alignSelf: 'flex-end' }
                    : {
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                        borderWidth: StyleSheet.hairlineWidth,
                        alignSelf: 'flex-start',
                      },
                ]}
              >
                <Text
                  style={{
                    color: m.fromMe ? '#fff' : colors.text,
                    fontSize: 14,
                  }}
                >
                  {m.body}
                </Text>
                <Text
                  style={{
                    color: m.fromMe ? '#ffffffaa' : colors.textSecondary,
                    fontSize: 10,
                    marginTop: 4,
                    alignSelf: 'flex-end',
                  }}
                >
                  {new Date(m.created_at).toLocaleTimeString(undefined, {
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </Text>
              </View>
            ))
          )}
        </ScrollView>

        <View
          style={[
            s.composer,
            { borderTopColor: colors.border, backgroundColor: colors.background },
          ]}
        >
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Private message…"
            placeholderTextColor={colors.textSecondary + '88'}
            multiline
            style={[
              s.composerInput,
              {
                color: colors.text,
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
          />
          <Pressable
            onPress={submit}
            disabled={send.isPending || !draft.trim()}
            style={[
              s.sendBtn,
              {
                backgroundColor: colors.primary,
                opacity: send.isPending || !draft.trim() ? 0.5 : 1,
              },
            ]}
          >
            {send.isPending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Ionicons name="arrow-up" size={18} color="#fff" />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 16, fontWeight: '700' },
  bubble: {
    maxWidth: '80%',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    padding: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  composerInput: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingTop: 9,
    paddingBottom: 9,
    fontSize: 14,
    maxHeight: 110,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
