import React, { useCallback, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useTheme } from '@/lib/theme';

const SITE = 'https://realtorportal.parallelstudios.co';

/**
 * Handles https://…/welcome universal links (magic links, onboarding links).
 *
 * The OS opens the APP for these instead of the browser; this route used to
 * not exist → blank screen. Token redemption (hash tokens / ?code / token_hash)
 * is implemented on the web /welcome page, so we re-open the ORIGINAL full
 * URL — query string and #fragment included — in an in-app browser, which
 * doesn't re-trigger the universal link.
 */
export default function WelcomeLinkScreen() {
  const incoming = Linking.useURL();
  const { colors } = useTheme();

  const openInBrowser = useCallback(() => {
    let target = SITE + '/welcome';
    if (incoming) {
      try {
        // Rebuild the original web URL: keep path/query/fragment, force the
        // production host (the incoming URL is already https://SITE/… for
        // universal links; custom-scheme opens get mapped onto SITE).
        const parsed = new URL(incoming);
        const tail =
          parsed.pathname + (parsed.search || '') + (parsed.hash || '');
        target = SITE + (tail.startsWith('/') ? tail : '/welcome');
      } catch {
        /* fall through to plain /welcome */
      }
    }
    WebBrowser.openBrowserAsync(target).catch(() => {});
  }, [incoming]);

  useEffect(() => {
    openInBrowser();
  }, [openInBrowser]);

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <View
        style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        <View style={[s.iconWrap, { backgroundColor: colors.primary }]}>
          <Ionicons name="key" size={26} color="#fff" />
        </View>
        <Text style={[s.title, { color: colors.text }]}>
          Finishing your sign-in
        </Text>
        <Text style={[s.body, { color: colors.textSecondary }]}>
          Your link opens a quick page to finish signing in or set a password.
          When you&apos;re done, come back here and sign in with it.
        </Text>

        <Pressable
          onPress={openInBrowser}
          style={[s.primaryBtn, { backgroundColor: colors.primary }]}
        >
          <Text style={s.primaryBtnText}>Open the link</Text>
        </Pressable>

        <Pressable
          onPress={() => router.replace('/(auth)/login' as any)}
          style={[s.secondaryBtn, { borderColor: colors.border }]}
        >
          <Text style={[s.secondaryBtnText, { color: colors.text }]}>
            Go to sign in
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
