import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  Alert,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { useAddImportantDate, useLogActivity } from '@/lib/mutations';

const PRESETS = ['Closing Day', 'Appraisal Due', 'Inspection Deadline', 'Offer Expires', 'Earnest Money Due'];

/**
 * Realtor adds an important date for a client search.
 * Form: label (with quick-pick presets) + ISO date string + optional notes.
 *
 * For simplicity v1 uses a plain text input for the date in YYYY-MM-DD form.
 * Swap to a real date picker (@react-native-community/datetimepicker) in v1.1.
 */
export default function AddImportantDateScreen() {
  const { id: searchId } = useLocalSearchParams<{ id: string }>();
  const { user, userProfile } = useAuth();
  const { colors } = useTheme();
  const addDate = useAddImportantDate();
  const logActivity = useLogActivity();

  const [label, setLabel] = useState('');
  const [dateStr, setDateStr] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!label.trim()) {
      Alert.alert('Missing label', 'Give the date a name like "Closing Day".');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      Alert.alert('Invalid date', 'Use the format YYYY-MM-DD (e.g. 2026-06-15).');
      return;
    }
    if (!searchId || !userProfile?.firm_id || !user?.id) return;

    setSaving(true);
    try {
      await addDate.mutateAsync({
        searchId,
        firmId: userProfile.firm_id,
        label: label.trim(),
        date: dateStr,
        notes: notes.trim() || undefined,
      });
      await logActivity.mutateAsync({
        searchId,
        firmId: userProfile.firm_id,
        actorId: user.id,
        action: 'added',
        target: label.trim(),
      });
      router.back();
    } catch (e: any) {
      Alert.alert('Could not save', e.message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.body}>
        <Text style={[styles.title, { color: colors.text }]}>Add Important Date</Text>

        <Text style={[styles.label, { color: colors.text }]}>Label</Text>
        <TextInput
          value={label}
          onChangeText={setLabel}
          placeholder="e.g. Closing Day"
          placeholderTextColor={colors.textSecondary}
          style={[styles.input, { color: colors.text, borderColor: colors.border }]}
        />
        <View style={styles.presetRow}>
          {PRESETS.map((p) => (
            <Pressable
              key={p}
              onPress={() => setLabel(p)}
              style={[styles.presetChip, { borderColor: colors.primary }]}
            >
              <Text style={[styles.presetChipText, { color: colors.primary }]}>{p}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={[styles.label, { color: colors.text }]}>Date (YYYY-MM-DD)</Text>
        <TextInput
          value={dateStr}
          onChangeText={setDateStr}
          placeholder="2026-06-15"
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="none"
          style={[styles.input, { color: colors.text, borderColor: colors.border }]}
        />

        <Text style={[styles.label, { color: colors.text }]}>Notes (optional)</Text>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="Any details to share with the client"
          placeholderTextColor={colors.textSecondary}
          multiline
          style={[styles.input, styles.notesInput, { color: colors.text, borderColor: colors.border }]}
        />

        <Pressable
          onPress={save}
          disabled={saving}
          style={[styles.saveBtn, { backgroundColor: colors.primary }]}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save</Text>}
        </Pressable>

        <Pressable onPress={() => router.back()} style={styles.cancelBtn}>
          <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>Cancel</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  body: { padding: 24 },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 24 },
  label: { fontSize: 13, fontWeight: '600', marginTop: 12, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  notesInput: { minHeight: 80, textAlignVertical: 'top' },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  presetChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },
  presetChipText: { fontSize: 12, fontWeight: '500' },
  saveBtn: { paddingVertical: 14, borderRadius: 8, alignItems: 'center', marginTop: 28 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  cancelBtn: { padding: 16, alignItems: 'center' },
  cancelBtnText: { fontSize: 14 },
});
