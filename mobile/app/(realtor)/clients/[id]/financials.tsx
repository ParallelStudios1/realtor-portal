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
import { useUpdateDealFinancials } from '@/lib/mutations';
import { useToast } from '@/components/Toast';

/**
 * Realtor sets the deal financials (agreed price, closing amount, earnest
 * money, commission %, contract URL, internal notes).
 *
 * Mirrors the web FinancialsModal at /dashboard/clients/[id].
 */
export default function FinancialsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const toast = useToast();
  const { data: search, isLoading } = useSearch(id);
  const updateFinancials = useUpdateDealFinancials();

  const [agreed, setAgreed] = useState('');
  const [closing, setClosing] = useState('');
  const [earnest, setEarnest] = useState('');
  const [commission, setCommission] = useState('');
  const [contractUrl, setContractUrl] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!search) return;
    const s: any = search;
    setAgreed(s.agreed_price != null ? String(s.agreed_price) : '');
    setClosing(s.closing_amount != null ? String(s.closing_amount) : '');
    setEarnest(s.earnest_money != null ? String(s.earnest_money) : '');
    setCommission(s.commission_pct != null ? String(s.commission_pct) : '');
    setContractUrl(s.contract_url || '');
    setNotes(s.notes || '');
  }, [search?.id]);

  const num = (s: string) => (s.trim() === '' ? null : Number(s));

  const handleSave = async () => {
    if (!search) return;
    try {
      await updateFinancials.mutateAsync({
        searchId: search.id,
        agreed_price: num(agreed),
        closing_amount: num(closing),
        earnest_money: num(earnest),
        commission_pct: num(commission),
        contract_url: contractUrl.trim() || null,
        notes: notes.trim() || null,
      });
      toast.show('Deal updated.', { variant: 'success' });
      router.back();
    } catch (err: any) {
      toast.show(err.message || 'Failed to save', { variant: 'error' });
    }
  };

  if (isLoading || !search) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: colors.background }]}
      >
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          Financials & contract
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Row>
          <FieldBlock
            colors={colors}
            label="Agreed price (USD)"
            value={agreed}
            setValue={setAgreed}
            keyboard="numeric"
            placeholder="485000"
          />
          <FieldBlock
            colors={colors}
            label="Closing amount"
            value={closing}
            setValue={setClosing}
            keyboard="numeric"
          />
        </Row>
        <Row>
          <FieldBlock
            colors={colors}
            label="Earnest money"
            value={earnest}
            setValue={setEarnest}
            keyboard="numeric"
          />
          <FieldBlock
            colors={colors}
            label="Commission %"
            value={commission}
            setValue={setCommission}
            keyboard="decimal-pad"
            placeholder="2.5"
          />
        </Row>
        <FieldBlock
          colors={colors}
          label="Contract URL"
          value={contractUrl}
          setValue={setContractUrl}
          keyboard="url"
          placeholder="Signed PDF or DocuSign envelope link"
        />
        <FieldBlock
          colors={colors}
          label="Internal notes"
          hint="Visible only to your firm — clients can't see this"
          value={notes}
          setValue={setNotes}
          multiline
        />

        <Pressable
          onPress={handleSave}
          disabled={updateFinancials.isPending}
          style={({ pressed }) => [
            styles.saveBtn,
            {
              backgroundColor: colors.primary,
              opacity: pressed || updateFinancials.isPending ? 0.7 : 1,
            },
          ]}
        >
          <Text style={styles.saveBtnText}>
            {updateFinancials.isPending ? 'Saving…' : 'Save deal details'}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

function FieldBlock({
  colors,
  label,
  hint,
  value,
  setValue,
  keyboard,
  placeholder,
  multiline,
}: {
  colors: ReturnType<typeof useTheme>['colors'];
  label: string;
  hint?: string;
  value: string;
  setValue: (v: string) => void;
  keyboard?: 'numeric' | 'decimal-pad' | 'url' | 'default';
  placeholder?: string;
  multiline?: boolean;
}) {
  return (
    <View style={{ flex: 1, marginBottom: 14 }}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={setValue}
        keyboardType={keyboard || 'default'}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary + '88'}
        multiline={multiline}
        style={[
          styles.input,
          {
            color: colors.text,
            backgroundColor: colors.surface,
            borderColor: colors.border,
            minHeight: multiline ? 80 : 40,
          },
        ]}
      />
      {hint && (
        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          {hint}
        </Text>
      )}
    </View>
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
  row: { flexDirection: 'row', gap: 10 },
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
    paddingVertical: 8,
    fontSize: 14,
  },
  hint: { fontSize: 11, marginTop: 4, fontStyle: 'italic' },
  saveBtn: {
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
