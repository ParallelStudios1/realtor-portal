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
  Alert,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import { useTheme } from '@/lib/theme';
import { useDealParticipants } from '@/lib/queries';
import {
  useUpdateParticipant,
  useRemoveParticipant,
} from '@/lib/dealActions';
import { useToast } from '@/components/Toast';
import { humanError } from '@/lib/humanError';

/**
 * Manage the parties on a deal - mobile mirror of the web People card's
 * management tools: change a party's role, fix their contact info, flip
 * visibility permissions, remove them, or open a private message thread.
 */

const PARTY_ROLES = [
  { id: 'realtor', label: 'Realtor' },
  { id: 'co_realtor', label: 'Co-realtor' },
  { id: 'buyer', label: 'Buyer' },
  { id: 'seller', label: 'Seller' },
  { id: 'attorney', label: 'Attorney' },
  { id: 'inspector', label: 'Inspector' },
  { id: 'lender', label: 'Lender' },
  { id: 'mortgage_broker', label: 'Mortgage broker' },
  { id: 'other', label: 'Other' },
];

const PERMS: { key: string; label: string }[] = [
  { key: 'can_view_documents', label: 'Documents' },
  { key: 'can_view_financials', label: 'Financials' },
  { key: 'can_view_messages', label: 'Messages' },
  { key: 'can_view_dates', label: 'Dates & calendar' },
];

export default function ParticipantsScreen() {
  const { id: searchId } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const toast = useToast();

  const {
    data: participants,
    isLoading,
    refetch,
  } = useDealParticipants(searchId);
  const updateParticipant = useUpdateParticipant();
  const removeParticipant = useRemoveParticipant();

  const [openId, setOpenId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [emailDraft, setEmailDraft] = useState('');
  const [phoneDraft, setPhoneDraft] = useState('');

  const toggleOpen = (p: any) => {
    if (openId === p.id) {
      setOpenId(null);
      return;
    }
    setOpenId(p.id);
    setNameDraft(p.external_name || '');
    setEmailDraft(p.external_email || '');
    setPhoneDraft(p.external_phone || '');
  };

  const patch = async (participantId: string, body: any, okMsg: string) => {
    if (!searchId) return;
    setBusyId(participantId);
    try {
      await updateParticipant.mutateAsync({
        searchId,
        participantId,
        patch: body,
      });
      await refetch();
      toast.show(okMsg, { variant: 'success' });
    } catch (e: any) {
      toast.show(humanError(e), { variant: 'error' });
    } finally {
      setBusyId(null);
    }
  };

  const confirmRemove = (p: any) => {
    const who = p.external_name || p.external_email || 'this party';
    Alert.alert(
      'Remove ' + who + '?',
      'They lose access to this deal. You can re-add them later.',
      [
        { text: 'Keep them', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            if (!searchId) return;
            setBusyId(p.id);
            try {
              await removeParticipant.mutateAsync({
                searchId,
                participantId: p.id,
              });
              setOpenId(null);
              await refetch();
              toast.show('Removed from the deal.', { variant: 'success' });
            } catch (e: any) {
              toast.show(humanError(e), { variant: 'error' });
            } finally {
              setBusyId(null);
            }
          },
        },
      ]
    );
  };

  const saveContact = (p: any) => {
    patch(
      p.id,
      {
        name: nameDraft.trim() || null,
        email: emailDraft.trim() || null,
        phone: phoneDraft.trim() || null,
      },
      'Contact info saved.'
    );
  };

  return (
    <SafeAreaView style={[s.container, { backgroundColor: colors.background }]}>
      <View style={[s.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={[s.headerTitle, { color: colors.text }]}>
          People on this deal
        </Text>
        <Pressable
          onPress={() =>
            router.push(`/(realtor)/clients/${searchId}/add-party` as any)
          }
          hitSlop={10}
        >
          <Ionicons name="add" size={26} color={colors.primary} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        {isLoading ? (
          <ActivityIndicator
            size="large"
            color={colors.primary}
            style={{ marginTop: 40 }}
          />
        ) : (participants ?? []).length === 0 ? (
          <View style={{ alignItems: 'center', paddingTop: 48 }}>
            <Ionicons name="people-outline" size={40} color={colors.border} />
            <Text
              style={{
                color: colors.textSecondary,
                marginTop: 12,
                textAlign: 'center',
              }}
            >
              No extra parties yet. Tap + to invite the opposing realtor, an
              attorney, inspector, lender, etc.
            </Text>
          </View>
        ) : (
          (participants ?? []).map((p: any) => {
            const open = openId === p.id;
            const busy = busyId === p.id;
            return (
              <View
                key={p.id}
                style={[
                  s.card,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                <Pressable
                  onPress={() => toggleOpen(p)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      style={{ color: colors.text, fontWeight: '600', fontSize: 14 }}
                      numberOfLines={1}
                    >
                      {p.external_name || p.external_email || p.external_phone || 'Unnamed'}
                    </Text>
                    <Text
                      style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}
                      numberOfLines={1}
                    >
                      {(p.role || 'other').replace(/_/g, ' ')}
                      {p.external_email ? ' · ' + p.external_email : ''}
                    </Text>
                  </View>
                  <Ionicons
                    name={open ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={colors.textSecondary}
                  />
                </Pressable>

                {open && (
                  <View style={{ marginTop: 12 }}>
                    {/* Private message */}
                    <Pressable
                      onPress={() =>
                        router.push({
                          pathname:
                            `/(realtor)/clients/${searchId}/private-messages` as any,
                          params: {
                            userId: p.user_id || '',
                            email: p.external_email || '',
                            name:
                              p.external_name || p.external_email || 'this party',
                          },
                        })
                      }
                      style={[s.rowBtn, { borderColor: colors.border }]}
                    >
                      <Ionicons
                        name="chatbubble-ellipses-outline"
                        size={16}
                        color={colors.primary}
                      />
                      <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 13 }}>
                        Private message
                      </Text>
                    </Pressable>

                    <Text style={[s.label, { color: colors.textSecondary }]}>ROLE</Text>
                    <View style={s.chipRow}>
                      {PARTY_ROLES.map((r) => {
                        const active = p.role === r.id;
                        return (
                          <Pressable
                            key={r.id}
                            disabled={busy || active}
                            onPress={() =>
                              patch(p.id, { role: r.id }, 'Role updated.')
                            }
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
                              style={{
                                fontSize: 12,
                                fontWeight: '600',
                                color: active ? colors.primary : colors.text,
                              }}
                            >
                              {r.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>

                    <Text style={[s.label, { color: colors.textSecondary }]}>
                      CAN SEE
                    </Text>
                    {PERMS.map((perm) => (
                      <View
                        key={perm.key}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          paddingVertical: 6,
                        }}
                      >
                        <Text style={{ color: colors.text, fontSize: 13 }}>
                          {perm.label}
                        </Text>
                        <Switch
                          value={!!p[perm.key]}
                          disabled={busy}
                          onValueChange={(v) =>
                            patch(p.id, { [perm.key]: v }, 'Permissions updated.')
                          }
                          trackColor={{ true: colors.primary }}
                        />
                      </View>
                    ))}

                    <Text style={[s.label, { color: colors.textSecondary }]}>
                      CONTACT INFO
                    </Text>
                    <TextInput
                      value={nameDraft}
                      onChangeText={setNameDraft}
                      placeholder="Name"
                      placeholderTextColor={colors.textSecondary + '88'}
                      style={[s.input, { color: colors.text, borderColor: colors.border }]}
                    />
                    <TextInput
                      value={emailDraft}
                      onChangeText={setEmailDraft}
                      placeholder="Email"
                      autoCapitalize="none"
                      keyboardType="email-address"
                      placeholderTextColor={colors.textSecondary + '88'}
                      style={[
                        s.input,
                        { color: colors.text, borderColor: colors.border, marginTop: 8 },
                      ]}
                    />
                    <TextInput
                      value={phoneDraft}
                      onChangeText={setPhoneDraft}
                      placeholder="Phone"
                      keyboardType="phone-pad"
                      placeholderTextColor={colors.textSecondary + '88'}
                      style={[
                        s.input,
                        { color: colors.text, borderColor: colors.border, marginTop: 8 },
                      ]}
                    />

                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                      <Pressable
                        onPress={() => confirmRemove(p)}
                        disabled={busy}
                        style={[s.btn, { borderColor: '#E11D48', borderWidth: 1 }]}
                      >
                        <Text style={{ color: '#E11D48', fontWeight: '600', fontSize: 13 }}>
                          Remove
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => saveContact(p)}
                        disabled={busy}
                        style={[
                          s.btn,
                          { backgroundColor: colors.primary, flex: 1, opacity: busy ? 0.6 : 1 },
                        ]}
                      >
                        {busy ? (
                          <ActivityIndicator color="#fff" />
                        ) : (
                          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>
                            Save contact info
                          </Text>
                        )}
                      </Pressable>
                    </View>
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
    marginTop: 14,
    marginBottom: 6,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 14,
  },
  rowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  btn: {
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
