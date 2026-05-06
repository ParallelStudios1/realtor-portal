import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Modal,
  ActivityIndicator,
  SafeAreaView,
  Alert,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { useClientSearches, useDocuments } from '@/lib/queries';
import { supabase } from '@/lib/supabase';
import type { Document } from '@/lib/database.types';

/**
 * Client-facing list of PDFs uploaded by the realtor.
 *
 * Tapping a row generates a short-lived signed URL from Supabase Storage and
 * opens it inside an in-app WebView modal. WebView is the simplest cross-platform
 * way to render PDFs — react-native-pdf is painful to install and ship.
 *
 * react-native-webview is bundled with Expo SDK 51 by default; if you ever
 * eject and it's missing, run: `npx expo install react-native-webview`.
 */
export default function ClientDocumentsScreen() {
  const { user, userProfile } = useAuth();
  const { colors } = useTheme();
  const { data: searches } = useClientSearches(userProfile?.firm_id, false, user?.id);
  const activeSearchId = searches?.[0]?.id;
  const { data: documents, isLoading, refetch, isRefetching } = useDocuments(activeSearchId);

  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  const openDocument = async (doc: Document) => {
    setOpening(true);
    try {
      // Signed URL good for 5 minutes — long enough to view, short enough to be safe
      // if the link ever leaks.
      const { data, error } = await supabase.storage
        .from('documents')
        .createSignedUrl(doc.storage_path, 60 * 5);
      if (error) throw error;
      setViewerUrl(data.signedUrl);
    } catch (e: any) {
      Alert.alert('Could not open document', e.message ?? String(e));
    } finally {
      setOpening(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Documents</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Files your realtor has shared with you
        </Text>
      </View>

      <FlatList
        data={documents ?? []}
        keyExtractor={(d) => d.id}
        refreshing={isRefetching}
        onRefresh={refetch}
        ListEmptyComponent={
          isLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
          ) : (
            <Text style={[styles.empty, { color: colors.textSecondary }]}>
              No documents yet. When your realtor uploads contracts or disclosures,
              they'll show up here.
            </Text>
          )
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => openDocument(item)}
            style={({ pressed }) => [
              styles.row,
              { borderBottomColor: colors.border, opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <Text style={styles.icon}>📄</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.docName, { color: colors.text }]} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={[styles.docMeta, { color: colors.textSecondary }]}>
                {new Date(item.created_at).toLocaleDateString()}
              </Text>
            </View>
            {opening ? <ActivityIndicator color={colors.primary} /> : <Text style={[styles.chev, { color: colors.textSecondary }]}>›</Text>}
          </Pressable>
        )}
      />

      <Modal visible={!!viewerUrl} animationType="slide" onRequestClose={() => setViewerUrl(null)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setViewerUrl(null)}>
              <Text style={styles.modalClose}>Close</Text>
            </Pressable>
          </View>
          {viewerUrl ? (
            <WebView
              source={{ uri: viewerUrl }}
              startInLoadingState
              renderLoading={() => (
                <ActivityIndicator
                  size="large"
                  color="#fff"
                  style={{ position: 'absolute', top: '50%', alignSelf: 'center' }}
                />
              )}
            />
          ) : null}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: 20, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#eee' },
  title: { fontSize: 22, fontWeight: '700' },
  subtitle: { fontSize: 13, marginTop: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  icon: { fontSize: 20 },
  docName: { fontSize: 15, fontWeight: '500' },
  docMeta: { fontSize: 12, marginTop: 2 },
  chev: { fontSize: 24 },
  empty: { padding: 32, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: 12,
    backgroundColor: '#000',
  },
  modalClose: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
