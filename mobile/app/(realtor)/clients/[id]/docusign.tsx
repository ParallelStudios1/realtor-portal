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
import { useEsignEnvelopes, useDocuments } from '@/lib/queries';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/components/Toast';
import { humanError } from '@/lib/humanError';

/**
 * Signing links - mobile mirror of the web EsignPanel. The realtor creates
 * the envelope in DocuSign (or any e-sign tool) themselves, pastes the
 * signing URL here with optional designated signers, then tracks who has
 * signed. When every designated signer is marked signed the link
 * auto-completes. Same manual-link API the web uses.
 */

type Signer = { key: string; name: string; role?: string | null; signed?: boolean };

const STATUS_TONE: Record<string, string> = {
  sent: '#2563EB',
  completed: '#059669',
  declined: '#E11D48',
  voided: '#9CA3AF',
};

export default function SigningLinksScreen() {
  const { id: searchId } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const toast = useToast();

  const { data: envelopes, isLoading, refetch } = useEsignEnvelopes(searchId);
  const { data: documents } = useDocuments(searchId);

  const [formOpen, setFormOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  const [documentId, setDocumentId] = useState('');
  const [signerNames, setSignerNames] = useState('');
  const [saving, setSaving] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const addLink = async () => {
    if (!searchId) return;
    if (!/^https?:\/\//i.test(url.trim())) {
      toast.show('Enter a full https:// signing link.', { variant: 'error' });
      return;
    }
    const signers = signerNames
      .split(/[,\n;]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((name) => ({ key: name, name }));
    setSaving(true);
    try {
      await apiFetch('/api/docusign/manual-link', {
        method: 'POST',
        body: {
          searchId,
          envelopeUrl: url.trim(),
          label: label.trim() || null,
          documentId: documentId || null,
          signers,
        },
      });
      setFormOpen(false);
      setUrl('');
      setLabel('');
      setDocumentId('');
      setSignerNames('');
      await refetch();
      toast.show('Signing link added - every party can now open it.', {
        variant: 'success',
      });
    } catch (e: any) {
      toast.show(humanError(e), { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const toggleSigner = async (env: any, signer: Signer) => {
    const k = env.id + ':' + signer.key;
    setBusyKey(k);
    try {
      await apiFetch('/api/docusign/manual-link/signer', {
        method: 'POST',
        body: {
          envelopeId: env.envelope_id,
          signerKey: signer.key,
          signed: !signer.signed,
        },
      });
      await refetch();
    } catch (e: any) {
      toast.show(humanError(e), { variant: 'error' });
    } finally {
      setBusyKey(null);
    }
  };

  const setStatus = async (env: any, status: string) => {
    setBusyKey(env.id + ':status');
    try {
      await apiFetch('/api/docusign/manual-link/status', {
        method: 'POST',
        body: { envelopeId: env.envelope_id, status },
      });
      await refetch();
      toast.show('Marked ' + status + '.', { variant: 'success' });
    } catch (e: any) {
      toast.show(humanError(e), { variant: 'error' });
    } finally {
      setBusyKey(null);
    }
  };

  const parseRecipients = (env: any): { label: string | null; signers: Signer[] } => {
    const rec = env.recipients;
    if (!rec) return { label: null, signers: [] };
    if (Array.isArray(rec)) {
      return {
        label: rec.find((r: any) => r?.label)?.label || null,
        signers: rec.filter((r: any) => r?.key || r?.name),
      };
    }
    return {
      label: rec.label || null,
      signers: Array.isArray(rec.signers) ? rec.signers : [],
    };
  };

  return (
    <SafeAreaView style={[s.container, { backgroundColor: colors.background }]}>
      <View style={[s.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={[s.headerTitle, { color: colors.text }]}>Signing links</Text>
        <Pressable onPress={() => setFormOpen((v) => !v)} hitSlop={10}>
          <Ionicons
            name={formOpen ? 'close' : 'add'}
            size={26}
            color={colors.primary}
          />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        {formOpen && (
          <View
            style={[
              s.card,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15 }}>
              Attach a signing link
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4 }}>
              Create the envelope in DocuSign (or any e-sign tool), then paste
              the signing URL here. It shows up on every party's deal view.
            </Text>

            <Text style={[s.label, { color: colors.textSecondary }]}>SIGNING URL</Text>
            <TextInput
              value={url}
              onChangeText={setUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              placeholder="https://app.docusign.com/…"
              placeholderTextColor={colors.textSecondary + '88'}
              style={[s.input, { color: colors.text, borderColor: colors.border }]}
            />

            <Text style={[s.label, { color: colors.textSecondary }]}>
              LABEL (OPTIONAL)
            </Text>
            <TextInput
              value={label}
              onChangeText={setLabel}
              placeholder="e.g. Purchase agreement"
              placeholderTextColor={colors.textSecondary + '88'}
              style={[s.input, { color: colors.text, borderColor: colors.border }]}
            />

            {(documents ?? []).length > 0 && (
              <>
                <Text style={[s.label, { color: colors.textSecondary }]}>
                  APPLIES TO DOCUMENT (OPTIONAL)
                </Text>
                <View style={s.chipRow}>
                  {(documents ?? []).slice(0, 12).map((d: any) => {
                    const active = documentId === d.id;
                    return (
                      <Pressable
                        key={d.id}
                        onPress={() => setDocumentId(active ? '' : d.id)}
                        style={[
                          s.chip,
                          {
                            borderColor: active ? colors.primary : colors.border,
                            backgroundColor: active
                              ? colors.primary + '14'
                              : 'transparent',
                          },
                        ]}
                      >
                        <Text
                          numberOfLines={1}
                          style={{
                            fontSize: 12,
                            fontWeight: '600',
                            maxWidth: 160,
                            color: active ? colors.primary : colors.text,
                          }}
                        >
                          {d.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}

            <Text style={[s.label, { color: colors.textSecondary }]}>
              DESIGNATED SIGNERS (OPTIONAL, COMMA-SEPARATED)
            </Text>
            <TextInput
              value={signerNames}
              onChangeText={setSignerNames}
              placeholder="e.g. Jane Buyer, John Seller"
              placeholderTextColor={colors.textSecondary + '88'}
              style={[s.input, { color: colors.text, borderColor: colors.border }]}
            />

            <Pressable
              onPress={addLink}
              disabled={saving || !url.trim()}
              style={[
                s.btn,
                {
                  backgroundColor: colors.primary,
                  marginTop: 14,
                  opacity: saving || !url.trim() ? 0.55 : 1,
                },
              ]}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={{ color: '#fff', fontWeight: '700' }}>
                  Save signing link
                </Text>
              )}
            </Pressable>
          </View>
        )}

        {isLoading ? (
          <ActivityIndicator
            size="large"
            color={colors.primary}
            style={{ marginTop: 40 }}
          />
        ) : (envelopes ?? []).length === 0 && !formOpen ? (
          <View style={{ alignItems: 'center', paddingTop: 48 }}>
            <Ionicons name="create-outline" size={40} color={colors.border} />
            <Text
              style={{
                color: colors.textSecondary,
                marginTop: 12,
                textAlign: 'center',
              }}
            >
              No signing links yet. Tap + to paste one from DocuSign or any
              e-sign tool.
            </Text>
          </View>
        ) : (
          (envelopes ?? []).map((env: any) => {
            const { label: envLabel, signers } = parseRecipients(env);
            const tone = STATUS_TONE[env.status] || colors.textSecondary;
            const busy = busyKey === env.id + ':status';
            return (
              <View
                key={env.id}
                style={[
                  s.card,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Text
                    style={{ color: colors.text, fontWeight: '700', fontSize: 14, flex: 1 }}
                    numberOfLines={1}
                  >
                    {envLabel || 'Signing link'}
                  </Text>
                  <View style={[s.statusChip, { borderColor: tone }]}>
                    <Text style={{ color: tone, fontSize: 10, fontWeight: '700' }}>
                      {String(env.status || 'sent').toUpperCase()}
                    </Text>
                  </View>
                </View>
                <Text
                  style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }}
                  numberOfLines={1}
                >
                  {env.envelope_url}
                </Text>

                {signers.length > 0 && (
                  <View style={{ marginTop: 8 }}>
                    {signers.map((sg: Signer) => {
                      const k = env.id + ':' + sg.key;
                      return (
                        <Pressable
                          key={sg.key}
                          onPress={() => toggleSigner(env, sg)}
                          disabled={busyKey === k}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            paddingVertical: 6,
                          }}
                        >
                          {busyKey === k ? (
                            <ActivityIndicator
                              size="small"
                              color={colors.primary}
                              style={{ marginRight: 8 }}
                            />
                          ) : (
                            <Ionicons
                              name={sg.signed ? 'checkmark-circle' : 'ellipse-outline'}
                              size={20}
                              color={sg.signed ? '#059669' : colors.textSecondary}
                              style={{ marginRight: 8 }}
                            />
                          )}
                          <Text
                            style={{
                              color: sg.signed ? colors.textSecondary : colors.text,
                              fontSize: 13,
                              textDecorationLine: sg.signed ? 'line-through' : 'none',
                            }}
                          >
                            {sg.name}
                            {sg.role ? ' · ' + sg.role : ''}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}

                {env.status === 'sent' && (
                  <View style={[s.chipRow, { marginTop: 10 }]}>
                    {busy ? (
                      <ActivityIndicator color={colors.primary} />
                    ) : (
                      <>
                        <Pressable
                          onPress={() => setStatus(env, 'completed')}
                          style={[s.chip, { borderColor: '#059669' }]}
                        >
                          <Text style={{ color: '#059669', fontSize: 12, fontWeight: '600' }}>
                            Mark completed
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={() => setStatus(env, 'declined')}
                          style={[s.chip, { borderColor: colors.border }]}
                        >
                          <Text
                            style={{
                              color: colors.textSecondary,
                              fontSize: 12,
                              fontWeight: '600',
                            }}
                          >
                            Declined
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={() => setStatus(env, 'voided')}
                          style={[s.chip, { borderColor: colors.border }]}
                        >
                          <Text
                            style={{
                              color: colors.textSecondary,
                              fontSize: 12,
                              fontWeight: '600',
                            }}
                          >
                            Voided
                          </Text>
                        </Pressable>
                      </>
                    )}
                  </View>
                )}
              </View>
            );
          })
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
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    marginBottom: 10,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginTop: 12,
    marginBottom: 4,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 14,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
  },
  statusChip: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 8,
  },
  btn: {
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
