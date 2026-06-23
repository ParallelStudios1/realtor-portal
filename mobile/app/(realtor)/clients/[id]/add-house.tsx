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
  Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useLocalSearchParams, router } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { useLogActivity } from '@/lib/mutations';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/Toast';
import { humanError } from '@/lib/humanError';

/**
 * Realtor adds a house to a client's search.
 *
 * Features:
 *   - Photo upload (camera or library) → Supabase Storage `house-photos` bucket.
 *   - Listing URL parser: pasting a Zillow/MLS link hits /api/url/preview which
 *     returns og:image / og:title / og:description, and we auto-fill any
 *     fields the realtor left blank.
 *   - "Generate with AI" button (existing).
 *
 * UI: sticky footer for the Save button so it doesn't drift off-screen with
 * the keyboard or a long scroll.
 */
export default function AddHouseScreen() {
  const { id: searchId } = useLocalSearchParams<{ id: string }>();
  const { user, userProfile } = useAuth();
  const { colors } = useTheme();
  const logActivity = useLogActivity();
  const toast = useToast();

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
  const [pickingPhoto, setPickingPhoto] = useState(false);
  const [parsingUrl, setParsingUrl] = useState(false);
  const [pulledFromListing, setPulledFromListing] = useState(false);

  const apiBase = (
    (process.env.EXPO_PUBLIC_API_URL as string | undefined) ||
    'https://realtorportal.parallelstudios.co'
  ).replace(/\/$/, '');

  // -------------------------------------------------------------------------
  // Photo upload
  // -------------------------------------------------------------------------

  /**
   * Take an ImagePicker asset, upload it to the `house-photos` bucket under
   * `{firm_id}/{search_id}/{timestamp}-{filename}`, and stash the public URL
   * in state. On error: surface an alert and leave photoUrl unchanged.
   */
  const uploadPickedImage = async (asset: ImagePicker.ImagePickerAsset) => {
    if (!searchId || !userProfile?.firm_id) return;
    setPickingPhoto(true);
    try {
      // Derive a clean filename. ImagePicker gives us either fileName or just
      // a uri; fall back to a random-ish name with the right extension.
      const guessedExt = (() => {
        const fromName = asset.fileName?.split('.').pop();
        if (fromName) return fromName.toLowerCase();
        const fromUri = asset.uri.split('.').pop();
        if (fromUri && fromUri.length <= 5) return fromUri.toLowerCase();
        return 'jpg';
      })();
      const fileName = (asset.fileName || `photo.${guessedExt}`).replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `${userProfile.firm_id}/${searchId}/${Date.now()}-${fileName}`;

      const base64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

      const contentType =
        asset.mimeType ||
        (guessedExt === 'png' ? 'image/png' : guessedExt === 'webp' ? 'image/webp' : 'image/jpeg');

      const { error: uploadError } = await supabase.storage
        .from('house-photos')
        .upload(storagePath, bytes, {
          contentType,
          upsert: false,
        });
      if (uploadError) throw uploadError;

      const { data: pub } = supabase.storage.from('house-photos').getPublicUrl(storagePath);
      if (!pub?.publicUrl) throw new Error('Could not get public URL for uploaded photo.');

      setPhotoUrl(pub.publicUrl);
    } catch (e: any) {
      toast.show(humanError(e), { variant: 'error' });
    } finally {
      setPickingPhoto(false);
    }
  };

  const pickFromLibrary = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      toast.show(
        'Allow photo library access in Settings to attach a photo.',
        { variant: 'error' }
      );
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.8,
      exif: false,
    });
    if (!res.canceled && res.assets?.[0]) {
      await uploadPickedImage(res.assets[0]);
    }
  };

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      toast.show('Allow camera access in Settings to take a photo.', {
        variant: 'error',
      });
      return;
    }
    const res = await ImagePicker.launchCameraAsync({
      allowsEditing: false,
      quality: 0.8,
      exif: false,
    });
    if (!res.canceled && res.assets?.[0]) {
      await uploadPickedImage(res.assets[0]);
    }
  };

  const choosePhoto = () => {
    Alert.alert('Add photo', 'Where should we get the photo from?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Take a photo', onPress: takePhoto },
      { text: 'Choose from library', onPress: pickFromLibrary },
    ]);
  };

  // -------------------------------------------------------------------------
  // Listing URL → og: tag preview
  // -------------------------------------------------------------------------

  /**
   * Hit /api/url/preview, then auto-fill photoUrl + address if those fields
   * are empty. We deliberately don't overwrite anything the user already typed.
   */
  const fetchListingPreview = async (url: string) => {
    if (!url.trim()) return;
    // Don't bother if it doesn't look like a URL.
    if (!/^https?:\/\//i.test(url.trim())) return;
    setParsingUrl(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      const r = await fetch(`${apiBase}/api/url/preview`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ url: url.trim() }),
      });
      const raw = await r.text();
      let json: any = null;
      try {
        json = raw ? JSON.parse(raw) : null;
      } catch {}
      if (!r.ok) {
        // Don't error-alert - preview is best-effort. Log and bail.
        console.warn('[add-house] preview failed', r.status, json?.error);
        return;
      }

      let pulled = false;
      if (json?.image && !photoUrl) {
        setPhotoUrl(json.image);
        pulled = true;
      }
      if (json?.address && !address.trim()) {
        setAddress(json.address);
        pulled = true;
      }
      if (json?.description && !notes.trim()) {
        setNotes(json.description);
        pulled = true;
      }
      if (pulled) setPulledFromListing(true);
    } catch (e) {
      console.warn('[add-house] preview error', e);
    } finally {
      setParsingUrl(false);
    }
  };

  // Fire the preview when the user finishes editing the URL field.
  const handleListingUrlBlur = () => {
    if (listingUrl.trim() && !parsingUrl) {
      void fetchListingPreview(listingUrl);
    }
  };

  // -------------------------------------------------------------------------
  // AI description (existing - unchanged)
  // -------------------------------------------------------------------------

  const generateDescription = async () => {
    if (!address.trim()) {
      toast.show('Type at least the address before generating.', {
        variant: 'error',
      });
      return;
    }
    setGenerating(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
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
      toast.show(humanError(e), { variant: 'error' });
    } finally {
      setGenerating(false);
    }
  };

  // -------------------------------------------------------------------------
  // Save
  // -------------------------------------------------------------------------

  const save = async () => {
    if (!address.trim()) {
      toast.show('Type at least the street address.', { variant: 'error' });
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
      const { error } = await supabase
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
      toast.show('House added.', { variant: 'success' });
      router.back();
    } catch (e: any) {
      toast.show(humanError(e), { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[styles.title, { color: colors.text }]}>Add House</Text>

          {/* Photo */}
          <View style={{ marginBottom: 16 }}>
            <Text style={[styles.label, { color: colors.text }]}>Photo</Text>
            {photoUrl ? (
              <View>
                <Image
                  source={{ uri: photoUrl }}
                  style={[styles.photoPreview, { borderColor: colors.border }]}
                  resizeMode="cover"
                />
                <View style={{ flexDirection: 'row', marginTop: 8, gap: 8 }}>
                  <Pressable
                    onPress={choosePhoto}
                    disabled={pickingPhoto}
                    style={[styles.photoActionBtn, { borderColor: colors.border }]}
                  >
                    <Text style={[styles.photoActionText, { color: colors.text }]}>
                      {pickingPhoto ? 'Uploading…' : 'Replace'}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setPhotoUrl('')}
                    disabled={pickingPhoto}
                    style={[styles.photoActionBtn, { borderColor: colors.border }]}
                  >
                    <Text style={[styles.photoActionText, { color: colors.textSecondary }]}>
                      Remove
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable
                onPress={choosePhoto}
                disabled={pickingPhoto}
                style={[styles.photoPickBox, { borderColor: colors.primary }]}
              >
                {pickingPhoto ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Text style={[styles.photoPickText, { color: colors.primary }]}>
                    Tap to add a photo
                  </Text>
                )}
              </Pressable>
            )}
          </View>

          <Field
            label="Address *"
            value={address}
            onChangeText={setAddress}
            placeholder="142 Seabreeze Lane, Miami FL"
            autoCapitalize="words"
            colors={colors}
          />

          <View style={{ marginBottom: 12 }}>
            <View style={styles.labelRow}>
              <Text style={[styles.label, { color: colors.text }]}>Listing URL</Text>
              {parsingUrl ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={[styles.helperText, { color: colors.textSecondary }]}>
                    Reading listing…
                  </Text>
                </View>
              ) : pulledFromListing ? (
                <Text style={[styles.helperText, { color: colors.primary }]}>
                  Pulled from listing
                </Text>
              ) : null}
            </View>
            <TextInput
              value={listingUrl}
              onChangeText={(s) => {
                setListingUrl(s);
                if (pulledFromListing) setPulledFromListing(false);
              }}
              onBlur={handleListingUrlBlur}
              onSubmitEditing={handleListingUrlBlur}
              placeholder="https://www.zillow.com/homedetails/..."
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              returnKeyType="done"
              style={[styles.input, { color: colors.text, borderColor: colors.border }]}
            />
          </View>

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
            <View style={styles.labelRow}>
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

          <Pressable onPress={() => router.back()} style={styles.cancelBtn}>
            <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>Cancel</Text>
          </Pressable>
        </ScrollView>

        {/* Sticky footer - pinned to the bottom of the screen, not the scroll view. */}
        <View
          style={[
            styles.footer,
            {
              backgroundColor: colors.background,
              borderTopColor: colors.border,
            },
          ]}
        >
          <Pressable
            onPress={save}
            disabled={saving}
            style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 }]}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveBtnText}>Save House</Text>
            )}
          </Pressable>
        </View>
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
  body: { padding: 24, paddingBottom: 24 },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 24 },
  label: { fontSize: 12, fontWeight: '600', marginBottom: 6 },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  helperText: { fontSize: 12, fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  row: { flexDirection: 'row' },
  photoPickBox: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoPickText: { fontSize: 15, fontWeight: '600' },
  photoPreview: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: '#00000010',
  },
  photoActionBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  photoActionText: { fontSize: 14, fontWeight: '600' },
  saveBtn: { paddingVertical: 14, borderRadius: 8, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  cancelBtn: { padding: 16, alignItems: 'center' },
  cancelBtnText: { fontSize: 14 },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
    borderTopWidth: 1,
  },
});
