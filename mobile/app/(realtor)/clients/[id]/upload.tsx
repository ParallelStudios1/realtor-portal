import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
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
 *     0005_documents_storage.sql - realtors can only write to their own firm.
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

  // Visibility control (mirrors the web uploader + migration 0059).
  type Visibility = 'everyone' | 'firm' | 'restricted';
  type Party = {
    key: string;
    label: string;
    userId: string | null;
    email: string | null;
  };
  const [visibility, setVisibility] = useState<Visibility>('everyone');
  const [parties, setParties] = useState<Party[]>([]);
  const [chosen, setChosen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let alive = true;
    (async () => {
      const collected: Party[] = [];
      const seen = new Set<string>();
      const push = (p: Party) => {
        const k = (p.userId || p.email || p.label).toLowerCase();
        if (seen.has(k)) return;
        seen.add(k);
        collected.push(p);
      };
      const { data: search } = (await supabase
        .from('client_searches')
        .select('client_id, attorney_email, attorney_name')
        .eq('id', searchId)
        .maybeSingle()) as { data: any };
      if (search?.client_id) {
        const { data: c } = (await supabase
          .from('users')
          .select('id, full_name, email')
          .eq('id', search.client_id)
          .maybeSingle()) as { data: any };
        if (c)
          push({
            key: 'user:' + c.id,
            label: (c.full_name || c.email || 'Client') + ' (Client)',
            userId: c.id,
            email: c.email ?? null,
          });
      }
      if (search?.attorney_email) {
        push({
          key: 'email:' + String(search.attorney_email).toLowerCase(),
          label: (search.attorney_name || search.attorney_email) + ' (Attorney)',
          userId: null,
          email: search.attorney_email,
        });
      }
      const { data: participants } = (await supabase
        .from('deal_participants')
        .select('user_id, external_email, external_name, role')
        .eq('search_id', searchId)) as { data: any[] | null };
      for (const p of participants || []) {
        const label =
          (p.external_name || p.external_email || 'Party') +
          ' (' + String(p.role).replace(/_/g, ' ') + ')';
        push({
          key: p.user_id
            ? 'user:' + p.user_id
            : 'email:' + String(p.external_email || label).toLowerCase(),
          label,
          userId: p.user_id ?? null,
          email: p.external_email ?? null,
        });
      }
      if (alive) setParties(collected);
    })();
    return () => {
      alive = false;
    };
  }, [searchId]);

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
    if (visibility === 'restricted' && !parties.some((p) => chosen[p.key])) {
      toast.show('Pick at least one person to share with.', { variant: 'error' });
      return;
    }

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
      const { data: inserted, error: insertError } = (await supabase
        .from('documents')
        .insert({
          firm_id: userProfile.firm_id,
          search_id: searchId,
          name: picked.name,
          storage_path: storagePath,
          mime_type: contentType,
          file_size: picked.size ?? null,
          visibility,
        } as any)
        .select('id')
        .single()) as { data: any; error: any };
      if (insertError) throw insertError;

      // Record the allow-list for a restricted document.
      if (visibility === 'restricted' && inserted?.id) {
        const rows = parties
          .filter((p) => chosen[p.key])
          .map((p) => ({
            document_id: inserted.id,
            user_id: p.userId,
            recipient_email: p.userId ? null : p.email,
          }));
        if (rows.length > 0) {
          await supabase.from('document_recipients').insert(rows as any);
        }
      }

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
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.title, { color: colors.text }]}>Upload Document</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Disclosures, contracts, inspection reports - anything you need the client
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

        <Text style={[styles.visLabel, { color: colors.textSecondary }]}>
          WHO CAN SEE THIS?
        </Text>
        {(
          [
            { v: 'everyone', t: 'Everyone on the deal', d: 'Client, attorney, and added parties' },
            { v: 'firm', t: 'My team only', d: 'Private to your firm' },
            { v: 'restricted', t: 'Specific people', d: 'Only who you pick' },
          ] as { v: Visibility; t: string; d: string }[]
        ).map((opt) => (
          <Pressable
            key={opt.v}
            onPress={() => setVisibility(opt.v)}
            disabled={uploading}
            style={[
              styles.visOption,
              {
                borderColor: visibility === opt.v ? colors.primary : colors.border,
                backgroundColor:
                  visibility === opt.v ? colors.primary + '11' : 'transparent',
              },
            ]}
          >
            <View
              style={[
                styles.radio,
                {
                  borderColor: visibility === opt.v ? colors.primary : colors.border,
                },
              ]}
            >
              {visibility === opt.v ? (
                <View style={[styles.radioDot, { backgroundColor: colors.primary }]} />
              ) : null}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.visOptTitle, { color: colors.text }]}>{opt.t}</Text>
              <Text style={[styles.visOptSub, { color: colors.textSecondary }]}>
                {opt.d}
              </Text>
            </View>
          </Pressable>
        ))}

        {visibility === 'restricted' ? (
          <View style={styles.partyBox}>
            {parties.length === 0 ? (
              <Text style={[styles.visOptSub, { color: colors.textSecondary }]}>
                No other parties on this deal yet.
              </Text>
            ) : (
              parties.map((p) => (
                <Pressable
                  key={p.key}
                  onPress={() =>
                    setChosen((prev) => ({ ...prev, [p.key]: !prev[p.key] }))
                  }
                  style={styles.partyRow}
                >
                  <View
                    style={[
                      styles.checkbox,
                      {
                        borderColor: chosen[p.key] ? colors.primary : colors.border,
                        backgroundColor: chosen[p.key] ? colors.primary : 'transparent',
                      },
                    ]}
                  >
                    {chosen[p.key] ? <Text style={styles.checkMark}>✓</Text> : null}
                  </View>
                  <Text style={[styles.partyLabel, { color: colors.text }]}>
                    {p.label}
                  </Text>
                </Pressable>
              ))
            )}
          </View>
        ) : null}

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
      </ScrollView>
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
  visLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginTop: 8,
    marginBottom: 8,
  },
  visOption: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  radioDot: { width: 8, height: 8, borderRadius: 4 },
  visOptTitle: { fontSize: 15, fontWeight: '600' },
  visOptSub: { fontSize: 12, marginTop: 2 },
  partyBox: {
    borderWidth: 1,
    borderColor: 'rgba(120,120,120,0.2)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    gap: 10,
  },
  partyRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMark: { color: '#fff', fontSize: 13, fontWeight: '800' },
  partyLabel: { fontSize: 15, flex: 1 },
});
