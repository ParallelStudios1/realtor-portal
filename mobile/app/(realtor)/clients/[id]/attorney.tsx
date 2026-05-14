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
import { useSetAttorney } from '@/lib/mutations';
import { useToast } from '@/components/Toast';

export default function AttorneyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const toast = useToast();
  const { data: search, isLoading } = useSearch(id);
  const setAttorney = useSetAttorney();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  useEffect(() => {
    if (!search) return;
    const s: any = search;
    setName(s.attorney_name || '');
    setEmail(s.attorney_email || '');
    setPhone(s.attorney_phone || '');
  }, [search?.id]);

  const handleSave = async () => {
    if (!search || !name.trim()) {
      toast.show('Name is required.', { variant: 'error' });
      return;
    }
    try {
      await setAttorney.mutateAsync({
        searchId: search.id,
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
      });
      toast.show('Attorney saved.', { variant: 'success' });
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
        <Text style={[s.headerTitle, { color: colors.text }]}>Attorney</Text>
        <View style={{ width: 24 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <View
          style={[
            s.banner,
            { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' },
          ]}
        >
          <Ionicons name="briefcase" size={18} color="#1D4ED8" />
          <Text style={s.bannerText}>
            Add the closing attorney. If you include their email, they can sign
            in and see this deal automatically.
          </Text>
        </View>

        <Field label="Name" value={name} onChange={setName} required colors={colors} />
        <Field
          label="Email"
          value={email}
          onChange={setEmail}
          keyboard="email-address"
          colors={colors}
        />
        <Field
          label="Phone"
          value={phone}
          onChange={setPhone}
          keyboard="phone-pad"
          colors={colors}
        />

        <Pressable
          onPress={handleSave}
          disabled={setAttorney.isPending}
          style={({ pressed }) => [
            s.saveBtn,
            {
              backgroundColor: colors.primary,
              opacity: pressed || setAttorney.isPending ? 0.7 : 1,
            },
          ]}
        >
          <Text style={s.saveBtnText}>
            {setAttorney.isPending ? 'Saving…' : 'Save attorney'}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
  keyboard,
  colors,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  keyboard?: 'email-address' | 'phone-pad' | 'default';
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={[s.label, { color: colors.textSecondary }]}>
        {label} {required && <Text style={{ color: '#DC2626' }}>*</Text>}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType={keyboard || 'default'}
        autoCapitalize={keyboard === 'email-address' ? 'none' : 'sentences'}
        style={[
          s.input,
          {
            color: colors.text,
            backgroundColor: colors.surface,
            borderColor: colors.border,
          },
        ]}
      />
    </View>
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
  bannerText: { fontSize: 12, color: '#1E3A8A', flex: 1, lineHeight: 16 },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 14,
  },
  saveBtn: { marginTop: 12, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
