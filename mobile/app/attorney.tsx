import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';

/**
 * Attorney landing on mobile.
 *
 * The attorney workspace (starting deals, orchestrating parties, phase
 * control) is web-first. Before this screen existed, an attorney signing in
 * on the phone fell through to the CLIENT experience and saw an empty,
 * confusing home. Now they get an honest signpost instead of a dead end.
 */
export default function AttorneyScreen() {
  const { signOut, userProfile } = useAuth();
  const { colors } = useTheme();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.body}>
        <Text style={[styles.title, { color: colors.text }]}>
          Welcome{userProfile?.full_name ? `, ${userProfile.full_name}` : ''}
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Your attorney workspace — starting deals, inviting parties, uploading
          documents and tracking closings — lives on the web.
        </Text>
        <Pressable
          onPress={() =>
            Linking.openURL('https://realtorportal.parallelstudios.co/attorney')
          }
          style={[styles.cta, { backgroundColor: colors.primary }]}
        >
          <Text style={styles.ctaText}>Open my deals on the web</Text>
        </Pressable>
        <Pressable onPress={signOut} style={styles.signOut}>
          <Text style={[styles.signOutText, { color: colors.textSecondary }]}>
            Sign out
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  body: { flex: 1, justifyContent: 'center', padding: 28 },
  title: { fontSize: 26, fontWeight: '800' },
  subtitle: { fontSize: 15, lineHeight: 22, marginTop: 10 },
  cta: {
    marginTop: 28,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  signOut: { marginTop: 18, alignItems: 'center', padding: 8 },
  signOutText: { fontSize: 14, fontWeight: '600' },
});
