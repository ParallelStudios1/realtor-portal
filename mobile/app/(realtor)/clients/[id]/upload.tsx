import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { useLocalSearchParams, router } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import { useLogActivity } from '@/lib/mutations';
import { useToast } from '@/components/Toast';
import { humanError } from '@/lib/humanError';

/**
 * Realtor → Client document upload.
 *
 * Flow:
 *  1. Pick a file via expo-document-picker (PDFs primarily, but anything goes).
 *  2. Upload bytes to the private 'client-docs' Supabase Storage bucket at
 *     `{firm_id}/{search_id}/{timestamp}-{filename}`. RLS is enforced by
 *     0005_documents_storage.sql — realtors can only write to their own firm.
 *  3. Insert a row into public.documents pointing at storage_path.
 *  4. Log an activity so the client's feed says "Realtor uploaded {filename}".
 *  5. router.back() once done.
 *
 * The route param `[id]` is the client_searches.id ("searchId").
 */
export default function UploadDocumentScreen() {
  const { id: searchId } = useLocalSearchParams<{ id: string }>();
  const { user, userProfile } = useAuth();
  const { colors } = useTheme();
  const logActivity = useLogActivity();
  const toast = useToast();

  const [picked, setPicked] = useState<DocumentPicker.DocumentPickerAsset | null>(
    null
  );
  const [uploading, setUploading] = useState(false);
  const [progressLabel, setProgressLabel] = useState<string>('');
  const [done, setDone] = useState(false);

  const sanitize = (name: string) => name.replace(/[^a-zA-Z0-9._-]+/g, '_');

  const pickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (!result.canceled && result.assets?.[0]) {
      setPicked(result.assets[0]);
      setDone(false);
    }
  };

  const upload = async () => {
    if (!picked || !searchId || !userProfile?.firm_id || !user?.id) return;

    setUploading(true);
    setDone(false);
    setProgressLabel('Reading file…');
    try {
      const safeName = sanitize(picked.name);
      const storagePath = `${userProfile.firm_id}/${searchId}/${Date.now()}-${safeName}`;
      const contentType = picked.mimeType ?? 'application/octet-stream';

      // RN can't read picked files as a Blob directly off the cached URI in a
      // way Storage accepts on every platform. Reading as base64 and converting
      // to a Uint8Array works on iOS, Android, and Expo Go consistently.
      const base64 = await FileSystem.readAsStringAsync(picked.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

      setProgressLabel('Uploading…');
      const { error: uploadError } = await supabase.storage
        .from('client-docs')
        .upload(storagePath, bytes, {
          contentType,
          upsert: false,
        });
      if (uploadError) throw uploadError;

      setProgressLabel('Saving…');
      const { error: insertError } = await supabase.from('documents').insert({
        firm_id: userProfile.firm_id,
        search_id: searchId,
        name: picked.name,
        storage_path: storagePath,
      });
      if (insertError) throw insertError;

      // Best-effort activity log; don't block success if this fails.
      try {
        await logActivity.mutateAsync({
          searchId: searchId as string,
          firmId: userProfile.firm_id,
          actorId: user.id,
          action: 'uploaded',
          target: picked.name,
        });
      } catch {}

      setProgressLabel('Done');
      setDone(true);
      // Brief pause so the user sees the success state, then go back.
      setTimeout(() => router.back(), 600);
    } catch (e: any) {
      toast.show(humanError(e), { variant: 'error' });
      setProgressLabel('');
    } finally {
      setUploading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.body}>
        <Text style={[styles.title, { color: colors.text }]}>Upload Document</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Disclosures, contracts, inspection reports — anything you need the client
          to see.
        </Text>

        <Pressable
          onPress={pickFile}
          disabled={uploading}
          style={[styles.pickBox, { borderColor: colors.primary }]}
        >
          <Text style={[styles.pickBoxText, { color: colors.primary }]}>
            {picked ? picked.name : 'Tap to pick a file'}
          </Text>
          {picked?.size ? (
            <Text style={[styles.pickBoxSub, { color: colors.textSecondary }]}>
              {(picked.size / 1024).toFixed(0)} KB
            </Text>
          ) : null}
        </Pressable>

        <Pressable
          onPress={upload}
          disabled={!picked || uploading || done}
          style={[
            styles.uploadBtn,
            {
              backgroundColor:
                !picked || uploading || done ? colors.border : colors.primary,
            },
          ]}
        >
          {uploading ? (
            <View style={styles.row}>
              <ActivityIndicator color="#fff" />
              <Text style={[styles.uploadBtnText, { marginLeft: 8 }]}>
                {progressLabel}
              </Text>
            </View>
          ) : done ? (
            <Text style={styles.uploadBtnText}>Uploaded</Text>
          ) : (
            <Text style={styles.uploadBtnText}>Upload</Text>
          )}
        </Pressable>

        <Pressable
          onPress={() => router.back()}
          disabled={uploading}
          style={styles.cancelBtn}
        >
          <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>
            Cancel
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  body: { padding: 24 },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 8 },
  subtitle: { fontSize: 14, marginBottom: 32 },
  pickBox: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    marginBottom: 16,
  },
  pickBoxText: { fontSize: 16, fontWeight: '600' },
  pickBoxSub: { fontSize: 12, marginTop: 6 },
  uploadBtn: {
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 24,
  },
  uploadBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  cancelBtn: { padding: 16, alignItems: 'center' },
  cancelBtnText: { fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center' },
});
