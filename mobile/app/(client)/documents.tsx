import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { useClientSearches, useDocuments } from '@/lib/queries';
import { supabase } from '@/lib/supabase';
import type { Document } from '@/lib/database.types';
import { useToast } from '@/components/Toast';
import { humanError } from '@/lib/humanError';
import { SkeletonRow } from '@/components/Skeleton';
import { EmptyState } from '@/components/EmptyState';
import { Ionicons } from '@expo/vector-icons';

/**
 * Client-facing list of documents shared by the realtor.
 *
 * Tapping a row hits the web /api/documents/sign-url endpoint with a Bearer
 * token, gets back a 5-minute signed URL, and opens it in the system browser
 * via expo-web-browser. We deliberately don't sign URLs from the client SDK
 * directly — the API route is the one place that enforces the firm/search
 * authorization rules consistently across web + mobile.
 */
export default function ClientDocumentsScreen() {
  const { user, userProfile } = useAuth();
  const { colors } = useTheme();
  const toast = useToast();
  const { data: searches } = useClientSearches(
    userProfile?.firm_id,
    false,
    user?.id
  );
  const activeSearchId = searches?.[0]?.id;
  const { data: documents, isLoading, refetch, isRefetching } =
    useDocuments(activeSearchId);

  const [openingId, setOpeningId] = useState<string | null>(null);

  const apiBase =
    (process.env.EXPO_PUBLIC_API_URL as string | undefined) ||
    'https://realtor-portal-ten.vercel.app';

  const openDocument = async (doc: Document) => {
    setOpeningId(doc.id);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error('Not signed in.');

      const res = await fetch(`${apiBase}/api/documents/sign-url`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ storage_path: doc.storage_path }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.url) {
        throw new Error(json?.error || `Request failed (${res.status})`);
      }

      await WebBrowser.openBrowserAsync(json.url as string);
    } catch (e: any) {
      toast.show(humanError(e), { variant: 'error' });
    } finally {
      setOpeningId(null);
    }
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
    >
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
          documents === undefined ? (
            <View>
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </View>
          ) : (
            <EmptyState
              icon="document-text-outline"
              title="No documents yet"
              body="When your realtor uploads contracts or disclosures, they'll show up here."
            />
          )
        }
        renderItem={({ item }) => {
          const isOpening = openingId === item.id;
          return (
            <Pressable
              onPress={() => openDocument(item)}
              disabled={isOpening}
              style={({ pressed }) => [
                styles.row,
                {
                  borderBottomColor: colors.border,
                  opacity: pressed || isOpening ? 0.6 : 1,
                },
              ]}
            >
              <Ionicons
                name="document-text-outline"
                size={22}
                color={colors.textSecondary}
                style={styles.icon}
              />
              <View style={{ flex: 1 }}>
                <Text
                  style={[styles.docName, { color: colors.text }]}
                  numberOfLines={1}
                >
                  {item.name}
                </Text>
                <Text
                  style={[styles.docMeta, { color: colors.textSecondary }]}
                >
                  {new Date(item.created_at).toLocaleDateString()}
                </Text>
              </View>
              {isOpening ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Text
                  style={[styles.chev, { color: colors.textSecondary }]}
                >
                  ›
                </Text>
              )}
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    padding: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
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
  icon: { marginRight: 2 },
  docName: { fontSize: 15, fontWeight: '500' },
  docMeta: { fontSize: 12, marginTop: 2 },
  chev: { fontSize: 24 },
  empty: { padding: 32, fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
