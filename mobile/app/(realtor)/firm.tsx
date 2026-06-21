import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  Pressable,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useTheme } from '@/lib/theme';
import { useToast } from '@/components/Toast';
import { humanError } from '@/lib/humanError';
import { apiFetch } from '@/lib/api';

type Member = { id: string; full_name: string | null; email: string | null; role: string };
type Pending = { email: string; full_name: string | null; role: string };
type FirmData = {
  members: Member[];
  pendingInvites: Pending[];
  seatCap: number;
  usedSeats: number;
  planName: string;
  canManage: boolean;
  meId: string;
};

const ROLE_OPTS = ['realtor', 'manager', 'firm_admin', 'agent', 'owner'];
const ROLE_LABEL: Record<string, string> = {
  owner: 'Owner',
  firm_admin: 'Admin',
  manager: 'Manager',
  realtor: 'Realtor',
  agent: 'Agent',
};

export default function FirmControlScreen() {
  const { colors } = useTheme();
  const toast = useToast();
  const [data, setData] = useState<FirmData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  // Invite form
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('realtor');
  const [inviting, setInviting] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await apiFetch<FirmData>('/api/firm/members');
      setData(d);
    } catch (e: any) {
      toast.show(humanError(e), { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const invite = async () => {
    if (!name.trim() || !email.trim()) {
      toast.show('Name and email are required.', { variant: 'error' });
      return;
    }
    setInviting(true);
    try {
      await apiFetch('/api/firm/members', {
        method: 'POST',
        body: { full_name: name.trim(), email: email.trim(), role },
      });
      toast.show('Invite sent.', { variant: 'success' });
      setName('');
      setEmail('');
      setRole('realtor');
      await load();
    } catch (e: any) {
      toast.show(humanError(e), { variant: 'error' });
    } finally {
      setInviting(false);
    }
  };

  const changeRole = async (m: Member) => {
    const next = ROLE_OPTS[(ROLE_OPTS.indexOf(m.role) + 1) % ROLE_OPTS.length];
    setBusy(m.id);
    try {
      await apiFetch('/api/firm/members/manage', {
        method: 'POST',
        body: { action: 'role', user_id: m.id, role: next },
      });
      await load();
    } catch (e: any) {
      toast.show(humanError(e), { variant: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const remove = (m: Member) => {
    Alert.alert('Remove from firm?', `${m.full_name || m.email} will lose access.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setBusy(m.id);
          try {
            await apiFetch('/api/firm/members/manage', {
              method: 'POST',
              body: { action: 'remove', user_id: m.id },
            });
            await load();
          } catch (e: any) {
            toast.show(humanError(e), { variant: 'error' });
          } finally {
            setBusy(null);
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={[s.c, { backgroundColor: colors.background }]}>
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      </SafeAreaView>
    );
  }

  const atCap = !!data && data.usedSeats >= data.seatCap;

  return (
    <SafeAreaView style={[s.c, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colors.primary} />}
      >
        <Text style={[s.h1, { color: colors.text }]}>Firm control</Text>
        {data && (
          <Text style={[s.sub, { color: colors.textSecondary }]}>
            {data.planName} plan · {data.usedSeats} of {data.seatCap} seat
            {data.seatCap === 1 ? '' : 's'} used
          </Text>
        )}

        {/* Invite */}
        {data?.canManage && (
          <View style={[s.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <Text style={[s.cardTitle, { color: colors.text }]}>Invite a team member</Text>
            {atCap && (
              <Text style={{ color: colors.warning || '#d97706', fontSize: 12, marginBottom: 8 }}>
                You're at your seat limit. Upgrade your plan to add more.
              </Text>
            )}
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Full name"
              placeholderTextColor={colors.textSecondary}
              style={[s.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
            />
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="Email"
              autoCapitalize="none"
              keyboardType="email-address"
              placeholderTextColor={colors.textSecondary}
              style={[s.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
            />
            <View style={s.roleRow}>
              {ROLE_OPTS.map((r) => (
                <Pressable
                  key={r}
                  onPress={() => setRole(r)}
                  style={[
                    s.rolePill,
                    {
                      borderColor: role === r ? colors.primary : colors.border,
                      backgroundColor: role === r ? colors.primary : 'transparent',
                    },
                  ]}
                >
                  <Text style={{ color: role === r ? '#fff' : colors.text, fontSize: 12, fontWeight: '600' }}>
                    {ROLE_LABEL[r]}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              onPress={invite}
              disabled={inviting}
              style={[s.primaryBtn, { backgroundColor: colors.primary, opacity: inviting ? 0.7 : 1 }]}
            >
              {inviting ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryBtnText}>Send invite</Text>}
            </Pressable>
          </View>
        )}

        {/* Members */}
        <Text style={[s.sectionLabel, { color: colors.textSecondary }]}>
          TEAM ({data?.members.length || 0})
        </Text>
        {(data?.members || []).map((m) => (
          <View key={m.id} style={[s.row, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>{m.full_name || m.email}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{m.email}</Text>
            </View>
            {data?.canManage && m.id !== data.meId ? (
              <>
                <Pressable
                  onPress={() => changeRole(m)}
                  disabled={busy === m.id}
                  style={[s.rolePill, { borderColor: colors.primary }]}
                >
                  <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>
                    {ROLE_LABEL[m.role] || m.role}
                  </Text>
                </Pressable>
                <Pressable onPress={() => remove(m)} disabled={busy === m.id} hitSlop={8} style={{ marginLeft: 10 }}>
                  <Ionicons name="trash-outline" size={18} color={colors.error || '#dc2626'} />
                </Pressable>
              </>
            ) : (
              <View style={[s.rolePill, { borderColor: colors.border }]}>
                <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '700' }}>
                  {ROLE_LABEL[m.role] || m.role}
                  {m.id === data?.meId ? ' (you)' : ''}
                </Text>
              </View>
            )}
          </View>
        ))}

        {/* Pending */}
        {(data?.pendingInvites?.length || 0) > 0 && (
          <>
            <Text style={[s.sectionLabel, { color: colors.textSecondary }]}>
              PENDING INVITES ({data!.pendingInvites.length})
            </Text>
            {data!.pendingInvites.map((p) => (
              <View key={p.email} style={[s.row, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontWeight: '600' }}>{p.full_name || p.email}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{p.email}</Text>
                </View>
                <Text style={{ color: colors.textSecondary, fontSize: 11 }}>Invited</Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  c: { flex: 1 },
  h1: { fontSize: 26, fontWeight: '800' },
  sub: { fontSize: 13, marginTop: 4 },
  card: { borderWidth: 1, borderRadius: 14, padding: 16, marginTop: 16 },
  cardTitle: { fontSize: 15, fontWeight: '700', marginBottom: 10 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, marginBottom: 10 },
  roleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  rolePill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  primaryBtn: { paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, marginTop: 22, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 8 },
});
