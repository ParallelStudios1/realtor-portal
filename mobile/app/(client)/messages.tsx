import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { useClientSearches, useMessages } from '@/lib/queries';
import { useSendMessage } from '@/lib/mutations';
import { MessageBubble } from '@/components/MessageBubble';
import { Skeleton } from '@/components/Skeleton';
import { EmptyState } from '@/components/EmptyState';

export default function MessagesScreen() {
  const { user, userProfile } = useAuth();
  const { colors } = useTheme();
  const [messageText, setMessageText] = useState('');

  const { data: searches, isLoading: searchesLoading } = useClientSearches(
    userProfile?.firm_id,
    false,
    user?.id
  );

  const activeSearch = searches?.[0];
  const { data: messages, isLoading: messagesLoading } = useMessages(activeSearch?.id);

  const sendMessage = useSendMessage();

  const handleSend = () => {
    if (!messageText.trim() || !activeSearch || !user?.id || !userProfile?.firm_id) {
      return;
    }

    sendMessage.mutate({
      searchId: activeSearch.id,
      firmId: userProfile.firm_id,
      body: messageText.trim(),
      senderId: user.id,
    });

    setMessageText('');
  };

  if (searches === undefined) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
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
      </SafeAreaView>
    );
  }

  if (!activeSearch) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <EmptyState
          icon="chatbubble-ellipses-outline"
          title="No active search yet"
          body="Once your realtor sets you up, you'll be able to chat here."
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
        keyboardVerticalOffset={90}
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
        ) : messages && messages.length > 0 ? (
          <FlatList
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <MessageBubble message={item} isOwn={item.sender_id === user?.id} />
            )}
            contentContainerStyle={{ padding: 12, gap: 6 }}
            onContentSizeChange={(_w, h) => {
              // Auto-scroll to bottom whenever content grows (new message).
              // No-op if list ref isn't ready.
            }}
            ref={(ref) => {
              if (ref && messages.length > 0) {
                // Defer to next tick so layout settles before scroll.
                requestAnimationFrame(() =>
                  ref.scrollToEnd?.({ animated: false })
                );
              }
            }}
          />
        ) : (
          <EmptyState
            icon="chatbubble-ellipses-outline"
            title="No messages yet"
            body="Say hi to your realtor! They'll get notified right away."
          />
        )}

        {/* Message input */}
        <View style={[styles.inputContainer, { borderTopColor: colors.border }]}>
          <TextInput
            style={[
              styles.input,
              {
                color: colors.text,
                borderColor: colors.border,
                backgroundColor: colors.surface,
              },
            ]}
            placeholder="Type a message..."
            placeholderTextColor={colors.textSecondary}
            value={messageText}
            onChangeText={setMessageText}
            editable={!sendMessage.isPending}
            multiline
          />
          <TouchableOpacity
            onPress={handleSend}
            disabled={!messageText.trim() || sendMessage.isPending}
            style={[
              styles.sendButton,
              {
                backgroundColor: messageText.trim()
                  ? colors.primary
                  : colors.border,
              },
            ]}
          >
            <Text style={styles.sendIcon}>
              {sendMessage.isPending ? '...' : '→'}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loader: {
    marginTop: 40,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateText: {
    fontSize: 16,
    textAlign: 'center',
  },
  inputContainer: {
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
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxHeight: 100,
    fontSize: 14,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
  },
  sendIcon: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
});
