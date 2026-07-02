import React, { useState } from 'react';
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
import { useDocuments } from '@/lib/queries';
import {
  useExtractions,
  useRunExtraction,
  useResolveExtraction,
} from '@/lib/dealActions';
import { useToast } from '@/components/Toast';
import { humanError } from '@/lib/humanError';

/**
 * AI contract-date extraction - mobile mirror of the web ExtractReview flow.
 * Pick an uploaded contract, run extraction, then review the suggested dates
 * and confirm ONLY the ones you approve. Nothing hits the deal timeline
 * until a human confirms - same guarantee as web.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type DraftDate = { label: string; date: string; checked: boolean };

export default function ExtractScreen() {
  const { id: searchId } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const toast = useToast();

  const { data: documents } = useDocuments(searchId);
  const { data: extractions, isLoading, refetch } = useExtractions(searchId);
  const run = useRunExtraction();
  const resolve = useResolveExtraction();

  const [runningDoc, setRunningDoc] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DraftDate[]>>({});
  const [busyExtraction, setBusyExtraction] = useState<string | null>(null);

  const pending = (extractions ?? []).filter((e) => e.status === 'pending');
  const docName = (docId: string | null) =>
    (documents ?? []).find((d: any) => d.id === docId)?.name || 'Document';

  const startRun = async (documentId: string) => {
    if (!searchId) return;
    setRunningDoc(documentId);
    try {
      await run.mutateAsync({ searchId, documentId });
      await refetch();
      toast.show('Done - review the suggested dates below.', {
        variant: 'success',
      });
    } catch (e: any) {
      toast.show(humanError(e), { variant: 'error' });
    } finally {
      setRunningDoc(null);
    }
  };

  const draftsFor = (ex: any): DraftDate[] => {
    if (drafts[ex.id]) return drafts[ex.id];
    const proposed = Array.isArray(ex.proposed_dates) ? ex.proposed_dates : [];
    return proposed.map((d: any) => ({
      label: String(d?.label || ''),
      date: String(d?.date || ''),
      checked: true,
    }));
  };

  const setDraft = (exId: string, next: DraftDate[]) =>
    setDrafts((d) => ({ ...d, [exId]: next }));

  const confirm = async (ex: any) => {
    if (!searchId) return;
    const selected = draftsFor(ex)
      .filter((d) => d.checked && d.label.trim() && DATE_RE.test(d.date.trim()))
      .map((d) => ({ label: d.label.trim(), date: d.date.trim() }));
    if (selected.length === 0) {
      toast.show('Check at least one date (format YYYY-MM-DD).', {
        variant: 'error',
      });
      return;
    }
    setBusyExtraction(ex.id);
    try {
      await resolve.mutateAsync({
        searchId,
        extractionId: ex.id,
        action: 'confirm',
        selectedDates: selected,
      });
      await refetch();
      toast.show(
        selected.length +
          ' date' +
          (selected.length === 1 ? '' : 's') +
          ' added to the deal.',
        { variant: 'success' }
      );
    } catch (e: any) {
      toast.show(humanError(e), { variant: 'error' });
    } finally {
      setBusyExtraction(null);
    }
  };

  const discard = async (ex: any) => {
    if (!searchId) return;
    setBusyExtraction(ex.id);
    try {
      await resolve.mutateAsync({
        searchId,
        extractionId: ex.id,
        action: 'discard',
      });
      await refetch();
      toast.show('Suggestions discarded.', { variant: 'success' });
    } catch (e: any) {
      toast.show(humanError(e), { variant: 'error' });
    } finally {
      setBusyExtraction(null);
    }
  };

  return (
    <SafeAreaView style={[s.container, { backgroundColor: colors.background }]}>
      <View style={[s.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={[s.headerTitle, { color: colors.text }]}>
          Contract dates
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18 }}>
          Pull key dates (closing, inspection, due diligence…) out of an
          uploaded contract. You review every suggestion before anything lands
          on the deal timeline.
        </Text>

        {/* Pending reviews first */}
        {pending.map((ex) => {
          const rows = draftsFor(ex);
          const busy = busyExtraction === ex.id;
          return (
            <View
              key={ex.id}
              style={[
                s.card,
                { backgroundColor: colors.surface, borderColor: colors.primary },
              ]}
            >
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>
                Review: {docName(ex.document_id)}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }}>
                Uncheck anything wrong. Edit labels or dates before confirming.
              </Text>

              {rows.length === 0 ? (
                <Text
                  style={{
                    color: colors.textSecondary,
                    fontStyle: 'italic',
                    marginTop: 10,
                    fontSize: 13,
                  }}
                >
                  No dates were found in this document.
                </Text>
              ) : (
                rows.map((d, i) => (
                  <View
                    key={i}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                      marginTop: 10,
                    }}
                  >
                    <Pressable
                      onPress={() =>
                        setDraft(
                          ex.id,
                          rows.map((r, j) =>
                            j === i ? { ...r, checked: !r.checked } : r
                          )
                        )
                      }
                      hitSlop={8}
                    >
                      <Ionicons
                        name={d.checked ? 'checkbox' : 'square-outline'}
                        size={22}
                        color={d.checked ? colors.primary : colors.textSecondary}
                      />
                    </Pressable>
                    <TextInput
                      value={d.label}
                      onChangeText={(v) =>
                        setDraft(
                          ex.id,
                          rows.map((r, j) => (j === i ? { ...r, label: v } : r))
                        )
                      }
                      placeholder="Label"
                      placeholderTextColor={colors.textSecondary + '88'}
                      style={[
                        s.input,
                        { color: colors.text, borderColor: colors.border, flex: 1 },
                      ]}
                    />
                    <TextInput
                      value={d.date}
                      onChangeText={(v) =>
                        setDraft(
                          ex.id,
                          rows.map((r, j) => (j === i ? { ...r, date: v } : r))
                        )
                      }
                      placeholder="YYYY-MM-DD"
                      autoCapitalize="none"
                      placeholderTextColor={colors.textSecondary + '88'}
                      style={[
                        s.input,
                        { color: colors.text, borderColor: colors.border, width: 110 },
                      ]}
                    />
                  </View>
                ))
              )}

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                <Pressable
                  onPress={() => discard(ex)}
                  disabled={busy}
                  style={[s.btn, { borderColor: colors.border, borderWidth: 1 }]}
                >
                  <Text style={{ color: colors.textSecondary, fontWeight: '600', fontSize: 13 }}>
                    Discard
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => confirm(ex)}
                  disabled={busy || rows.length === 0}
                  style={[
                    s.btn,
                    {
                      backgroundColor: colors.primary,
                      flex: 1,
                      opacity: busy || rows.length === 0 ? 0.6 : 1,
                    },
                  ]}
                >
                  {busy ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>
                      Add checked dates to the deal
                    </Text>
                  )}
                </Pressable>
              </View>
            </View>
          );
        })}

        {/* Documents to run extraction on */}
        <Text
          style={{
            color: colors.textSecondary,
            fontSize: 11,
            fontWeight: '700',
            letterSpacing: 1,
            marginTop: 20,
            marginBottom: 8,
          }}
        >
          RUN ON A DOCUMENT
        </Text>
        {(documents ?? []).length === 0 ? (
          <Text style={{ color: colors.textSecondary, fontSize: 13, fontStyle: 'italic' }}>
            No documents on this deal yet. Upload the contract first.
          </Text>
        ) : (
          (documents ?? []).map((d: any) => (
            <View
              key={d.id}
              style={[
                s.docRow,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <Ionicons
                name="document-text-outline"
                size={18}
                color={colors.textSecondary}
              />
              <Text
                style={{ color: colors.text, fontSize: 13, flex: 1 }}
                numberOfLines={1}
              >
                {d.name}
              </Text>
              {runningDoc === d.id ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Pressable
                  onPress={() => startRun(d.id)}
                  disabled={!!runningDoc}
                  style={[s.smallBtn, { borderColor: colors.primary }]}
                >
                  <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '600' }}>
                    Extract dates
                  </Text>
                </Pressable>
              )}
            </View>
          ))
        )}

        {isLoading && (
          <ActivityIndicator
            color={colors.primary}
            style={{ marginTop: 16 }}
          />
        )}
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
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginTop: 16,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 7,
    fontSize: 13,
  },
  btn: {
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    marginBottom: 8,
  },
  smallBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
});
