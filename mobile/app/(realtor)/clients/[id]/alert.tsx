import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TextInput,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { useSearch } from '@/lib/queries';
import { useSendAlert } from '@/lib/mutations';
import { useToast } from '@/components/Toast';

/**
 * Realtor sends a high-priority alert message into the deal thread. Prepended
 * with "ALERT:" and pushes via the API. Lands in the client's thread inbox.
 */
export default function SendAlertScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, userProfile } = useAuth();
  const { colors } = useTheme();
  const toast = useToast();
  const { data: search, isLoading } = useSearch(id);
  const sendAlert = useSendAlert();
  const [message, setMessage] = useState('');

  if (isLoading || !search || !user?.id || !userProfile?.firm_id) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: colors.background }]}
      >
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  const handleSend = async () => {
    if (!message.trim()) return;
    try {
      await sendAlert.mutateAsync({
        searchId: search.id,
        firmId: userProfile.firm_id!,
        senderId: user.id,
        message: message.trim(),
      });
      toast.show('Alert delivered.', { variant: 'success' });
      router.back();
    } catch (err: any) {
      toast.show(err.message || 'Failed', { variant: 'error' });
    }
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          Send alert
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={{ padding: 16 }}>
        <View
          style={[
            styles.banner,
            { backgroundColor: '#FEF2F2', borderColor: '#FCA5A5' },
          ]}
        >
          <Ionicons name="alert-circle" size={20} color="#B91C1C" />
          <Text style={styles.bannerText}>
            Alerts push to the client immediately and appear in their thread
            with a red label. Use sparingly.
          </Text>
        </View>

        <Text style={[styles.label, { color: colors.textSecondary }]}>
          MESSAGE
        </Text>
        <TextInput
          value={message}
          onChangeText={setMessage}
          placeholder="Urgent update for the client…"
          placeholderTextColor={colors.textSecondary + '88'}
          multiline
          style={[
            styles.input,
            {
              color: colors.text,
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
        />

        <Pressable
          onPress={handleSend}
          disabled={!message.trim() || sendAlert.isPending}
          style={({ pressed }) => [
            styles.sendBtn,
            {
              backgroundColor: '#DC2626',
              opacity:
                !message.trim() || sendAlert.isPending || pressed ? 0.55 : 1,
            },
          ]}
        >
          <Text style={styles.sendBtnText}>
            {sendAlert.isPending ? 'Sending…' : 'Send alert'}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  banner: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  bannerText: { fontSize: 12, color: '#7F1D1D', flex: 1, lineHeight: 16 },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    minHeight: 140,
  },
  sendBtn: {
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  sendBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
