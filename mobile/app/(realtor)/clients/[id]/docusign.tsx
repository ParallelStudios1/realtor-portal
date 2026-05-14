import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import { useTheme } from '@/lib/theme';
import { useSearch } from '@/lib/queries';
import { useLinkDocusign } from '@/lib/mutations';
import { useToast } from '@/components/Toast';

export default function DocusignScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const toast = useToast();
  const { data: search, isLoading } = useSearch(id);
  const linkDocusign = useLinkDocusign();

  const [url, setUrl] = useState('');

  useEffect(() => {
    if (search) setUrl(((search as any).docusign_envelope_url as string) || '');
  }, [search?.id]);

  const handleSave = async () => {
    if (!search) return;
    if (!/^https?:\/\/.*docusign\./i.test(url)) {
      toast.show('That does not look like a DocuSign URL.', {
        variant: 'error',
      });
      return;
    }
    try {
      await linkDocusign.mutateAsync({ searchId: search.id, url: url.trim() });
      toast.show('DocuSign envelope linked.', { variant: 'success' });
      router.back();
    } catch (err: any) {
      toast.show(err.message || 'Failed', { variant: 'error' });
    }
  };

  if (isLoading || !search) {
    return (
      <SafeAreaView style={[s.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[s.container, { backgroundColor: colors.background }]}>
      <View style={[s.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={[s.headerTitle, { color: colors.text }]}>
          DocuSign envelope
        </Text>
        <View style={{ width: 24 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <View
          style={[s.banner, { backgroundColor: '#FFF7ED', borderColor: '#FED7AA' }]}
        >
          <Ionicons name="document-attach" size={18} color="#C2410C" />
          <Text style={s.bannerText}>
            Paste the DocuSign envelope link you sent the client. It'll appear
            on every party's deal view as a one-tap action.
          </Text>
        </View>

        <Text style={[s.label, { color: colors.textSecondary }]}>
          ENVELOPE URL
        </Text>
        <TextInput
          value={url}
          onChangeText={setUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="https://app.docusign.com/documents/..."
          placeholderTextColor={colors.textSecondary + '88'}
          style={[
            s.input,
            {
              color: colors.text,
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
        />

        <Pressable
          onPress={handleSave}
          disabled={linkDocusign.isPending || !url.trim()}
          style={({ pressed }) => [
            s.saveBtn,
            {
              backgroundColor: colors.primary,
              opacity:
                pressed || linkDocusign.isPending || !url.trim() ? 0.55 : 1,
            },
          ]}
        >
          <Text style={s.saveBtnText}>
            {linkDocusign.isPending ? 'Saving…' : 'Save envelope'}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
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
  bannerText: { fontSize: 12, color: '#7C2D12', flex: 1, lineHeight: 16 },
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
  },
  saveBtn: {
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
