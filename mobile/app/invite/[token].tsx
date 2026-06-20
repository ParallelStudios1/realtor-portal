import React, { useCallback, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useTheme } from '@/lib/theme';

const SITE = 'https://realtorportal.parallelstudios.co';

/**
 * Handles the "Set up your account" universal link from invite emails.
 *
 * iOS/Android intercept https://…/invite/<token> and open the APP instead of
 * the browser - and this route didn't exist, so tapping the email button
 * showed a blank screen. Account setup (token check + password) lives on the
 * web, so we forward into an in-app browser (which does NOT re-trigger the
 * universal link) and give a path back to sign-in for people who already
 * finished setup.
 */
export default function InviteLinkScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { colors } = useTheme();

  const url = `${SITE}/invite/${token || ''}`;

  const openSetup = useCallback(() => {
    if (token) WebBrowser.openBrowserAsync(url).catch(() => {});
  }, [token, url]);

  // Auto-open once on arrival - the screen behind stays as a fallback.
  useEffect(() => {
    openSetup();
  }, [openSetup]);

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <View
        style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        <View style={[s.iconWrap, { backgroundColor: colors.primary }]}>
          <Ionicons name="person-add" size={26} color="#fff" />
        </View>
        <Text style={[s.title, { color: colors.text }]}>
          Finish setting up your account
        </Text>
        <Text style={[s.body, { color: colors.textSecondary }]}>
          Your invite opens a quick setup page where you choose a password.
          When you&apos;re done, come back here and sign in.
        </Text>

        <Pressable
          onPress={openSetup}
          style={[s.primaryBtn, { backgroundColor: colors.primary }]}
        >
          <Text style={s.primaryBtnText}>Open account setup</Text>
        </Pressable>

        <Pressable
          onPress={() => router.replace('/(auth)/login' as any)}
          style={[s.secondaryBtn, { borderColor: colors.border }]}
        >
          <Text style={[s.secondaryBtnText, { color: colors.text }]}>
            I already set my password - sign in
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 20 },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    marginTop: 16,
    textAlign: 'center',
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
    textAlign: 'center',
  },
  primaryBtn: {
    marginTop: 20,
    alignSelf: 'stretch',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  secondaryBtn: {
    marginTop: 10,
    alignSelf: 'stretch',
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  secondaryBtnText: { fontWeight: '600', fontSize: 14 },
});
