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
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { useAddHouse, useLogActivity } from '@/lib/mutations';

/**
 * Realtor adds a house to a client's search.
 *
 * v1: manual entry only. The "paste a Zillow link and we'll auto-extract"
 * feature is a v1.1 — every URL extraction approach (og: tags, scraping,
 * paid APIs) has tradeoffs and brittleness that aren't worth it pre-launch.
 *
 * Required: address. Everything else optional.
 */
export default function AddHouseScreen() {
  const { id: searchId } = useLocalSearchParams<{ id: string }>();
  const { user, userProfile } = useAuth();
  const { colors } = useTheme();
  const addHouse = useAddHouse();
  const logActivity = useLogActivity();

  const [address, setAddress] = useState('');
  const [listingUrl, setListingUrl] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [price, setPrice] = useState('');
  const [bedrooms, setBedrooms] = useState('');
  const [bathrooms, setBathrooms] = useState('');
  const [squareFeet, setSquareFeet] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  const generateDescription = async () => {
    if (!address.trim()) {
      Alert.alert('Address first', 'Type at least the address before generating.');
      return;
    }
    setGenerating(true);
    try {
      const { supabase } = await import('@/lib/supabase');
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      const apiBase =
        (process.env.EXPO_PUBLIC_API_URL as string | undefined) ||
        'https://realtor-portal-ten.vercel.app';
      const r = await fetch(`${apiBase}/api/ai/listing-description`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          address: address.trim(),
          price: price.trim(),
          bedrooms: bedrooms.trim(),
          bathrooms: bathrooms.trim(),
          squareFeet: squareFeet.trim(),
          notes: notes.trim(),
        }),
      });
      const raw = await r.text();
      let json: any = null;
      try {
        json = raw ? JSON.parse(raw) : null;
      } catch {}
      if (!r.ok || !json?.description) {
        throw new Error(json?.error || `Generation failed (HTTP ${r.status}).`);
      }
      // Append (don't overwrite) so the agent's existing notes are preserved.
      setNotes((prev) =>
        prev.trim() ? `${prev.trim()}\n\n${json.description}` : json.description
      );
    } catch (e: any) {
      Alert.alert('Could not generate', e?.message || String(e));
    } finally {
      setGenerating(false);
    }
  };

  const save = async () => {
    if (!address.trim()) {
      Alert.alert('Address required', 'Type at least the street address.');
      return;
    }
    if (!searchId || !userProfile?.firm_id || !user?.id) return;

    const parseNumberOrNull = (s: string) => {
      const cleaned = s.replace(/[^\d.]/g, '');
      if (!cleaned) return undefined;
      const n = parseFloat(cleaned);
      return isNaN(n) ? undefined : n;
    };

    setSaving(true);
    try {
      // useAddHouse takes only a subset; for the optional fields we touch the
      // table directly to also save listing_url + photo_url.
      // (We could broaden the mutation, but inlining here keeps the change scoped.)
      const { error } = await (await import('@/lib/supabase')).supabase
        .from('houses')
        .insert({
          search_id: searchId,
          firm_id: userProfile.firm_id,
          address: address.trim(),
          listing_url: listingUrl.trim() || null,
          photo_url: photoUrl.trim() || null,
          list_price: parseNumberOrNull(price) ?? null,
          bedrooms: parseNumberOrNull(bedrooms) ?? null,
          bathrooms: parseNumberOrNull(bathrooms) ?? null,
          square_feet: parseNumberOrNull(squareFeet) ?? null,
          notes: notes.trim() || null,
          status: 'interested',
        });
      if (error) throw error;

      await logActivity.mutateAsync({
        searchId,
        firmId: userProfile.firm_id,
        actorId: user.id,
        action: 'added',
        target: address.trim(),
      });
      router.back();
    } catch (e: any) {
      Alert.alert('Could not add house', e.message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Text style={[styles.title, { color: colors.text }]}>Add House</Text>

          <Field
            label="Address *"
            value={address}
            onChangeText={setAddress}
            placeholder="142 Seabreeze Lane, Miami FL"
            autoCapitalize="words"
            colors={colors}
          />

          <Field
            label="Listing URL"
            value={listingUrl}
            onChangeText={setListingUrl}
            placeholder="https://www.zillow.com/homedetails/..."
            autoCapitalize="none"
            keyboardType="url"
            colors={colors}
          />

          <Field
            label="Photo URL"
            value={photoUrl}
            onChangeText={setPhotoUrl}
            placeholder="Paste an image URL (or skip)"
            autoCapitalize="none"
            keyboardType="url"
            colors={colors}
          />

          <Field
            label="Price"
            value={price}
            onChangeText={setPrice}
            placeholder="625000"
            keyboardType="numeric"
            colors={colors}
          />

          <View style={styles.row}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Field
                label="Beds"
                value={bedrooms}
                onChangeText={setBedrooms}
                placeholder="3"
                keyboardType="numeric"
                colors={colors}
              />
            </View>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Field
                label="Baths"
                value={bathrooms}
                onChangeText={setBathrooms}
                placeholder="2.5"
                keyboardType="decimal-pad"
                colors={colors}
              />
            </View>
            <View style={{ flex: 1.2 }}>
              <Field
                label="SqFt"
                value={squareFeet}
                onChangeText={setSquareFeet}
                placeholder="1820"
                keyboardType="numeric"
                colors={colors}
              />
            </View>
          </View>

          <View style={{ marginBottom: 12 }}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 6,
              }}
            >
              <Text style={[styles.label, { color: colors.text }]}>Notes</Text>
              <Pressable
                onPress={generateDescription}
                disabled={generating || !address.trim()}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 999,
                  backgroundColor: colors.primary,
                  opacity: generating || !address.trim() ? 0.5 : 1,
                }}
              >
                {generating ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>
                    ✨ Generate with AI
                  </Text>
                )}
              </Pressable>
            </View>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Anything to flag for the client (or tap Generate to draft)"
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="sentences"
              multiline
              style={[
                styles.input,
                { color: colors.text, borderColor: colors.border },
                { minHeight: 110, textAlignVertical: 'top' as any },
              ]}
            />
          </View>

          <Pressable
            onPress={save}
            disabled={saving}
            style={[styles.saveBtn, { backgroundColor: colors.primary }]}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveBtnText}>Save House</Text>
            )}
          </Pressable>

          <Pressable onPress={() => router.back()} style={styles.cancelBtn}>
            <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>Cancel</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  autoCapitalize,
  keyboardType,
  multiline,
  colors,
}: {
  label: string;
  value: string;
  onChangeText: (s: string) => void;
  placeholder?: string;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  keyboardType?: 'default' | 'numeric' | 'decimal-pad' | 'url' | 'email-address';
  multiline?: boolean;
  colors: any;
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        autoCapitalize={autoCapitalize ?? 'sentences'}
        keyboardType={keyboardType ?? 'default'}
        multiline={multiline}
        style={[
          styles.input,
          { color: colors.text, borderColor: colors.border },
          multiline && { minHeight: 80, textAlignVertical: 'top' as any },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  body: { padding: 24, paddingBottom: 60 },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 24 },
  label: { fontSize: 12, fontWeight: '600', marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  row: { flexDirection: 'row' },
  saveBtn: { paddingVertical: 14, borderRadius: 8, alignItems: 'center', marginTop: 24 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  cancelBtn: { padding: 16, alignItems: 'center' },
  cancelBtnText: { fontSize: 14 },
});
