import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  SafeAreaView,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';

export default function RealtorSettingsScreen() {
  const { userProfile, signOut } = useAuth();
  const { firm, colors, logoUrl } = useTheme();

  const handleSignOut = () => {
    Alert.alert('Sign out?', 'You can sign back in any time.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => signOut() },
    ]);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.body}>
        {logoUrl ? (
          <Image source={{ uri: logoUrl }} style={styles.logo} contentFit="contain" />
        ) : (
          <View style={[styles.logoPlaceholder, { backgroundColor: colors.primary + '22' }]}>
            <Text style={[styles.logoText, { color: colors.primary }]}>{firm?.name?.[0] ?? '?'}</Text>
          </View>
        )}
        <Text style={[styles.firmName, { color: colors.text }]}>{firm?.name ?? 'Your Firm'}</Text>
        <Text style={[styles.userName, { color: colors.textSecondary }]}>
          {userProfile?.full_name ?? userProfile?.email}
        </Text>

        <View style={styles.spacer} />

        <Pressable
          onPress={handleSignOut}
          style={[styles.signOutBtn, { borderColor: colors.error }]}
        >
          <Text style={[styles.signOutText, { color: colors.error }]}>Sign Out</Text>
        </Pressable>

        <Text style={[styles.version, { color: colors.textSecondary }]}>Realtor Portal v0.1</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  body: { padding: 32, alignItems: 'center' },
  logo: { width: 120, height: 120, marginTop: 32 },
  logoPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 32,
  },
  logoText: { fontSize: 56, fontWeight: '700' },
  firmName: { fontSize: 22, fontWeight: '700', marginTop: 24 },
  userName: { fontSize: 14, marginTop: 6 },
  spacer: { height: 60 },
  signOutBtn: {
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 8,
    borderWidth: 1.5,
  },
  signOutText: { fontSize: 14, fontWeight: '600' },
  version: { fontSize: 11, marginTop: 40 },
});
