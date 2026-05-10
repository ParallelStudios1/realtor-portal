import React, { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '@/lib/auth';
import { ThemeProvider } from '@/lib/theme';
import { ToastProvider } from '@/components/Toast';
import { Stack } from 'expo-router';
import { setupNotificationHandlers, registerPushToken } from '@/lib/notifications';
import { initSentry, setUser as setSentryUser, clearUser as clearSentryUser } from '@/lib/sentry';
import * as SplashScreen from 'expo-splash-screen';

initSentry();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 30, // 30 minutes
    },
  },
});

SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { session, user, userProfile, isLoading, signOut } = useAuth();

  useEffect(() => {
    if (!isLoading) {
      SplashScreen.hideAsync();
    }
  }, [isLoading]);

  useEffect(() => {
    if (user?.id) {
      registerPushToken(user.id);
      setupNotificationHandlers();
      setSentryUser({ id: user.id, email: user.email });
    } else {
      clearSentryUser();
    }
  }, [user?.id, user?.email]);

  if (isLoading) {
    return null;
  }

  // Not authenticated → auth screens
  if (!session) {
    return (
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
      </Stack>
    );
  }

  // Authenticated but no users row → orphan account (signed up without invite)
  if (!userProfile) {
    return <OrphanAccountScreen email={user?.email} onSignOut={signOut} />;
  }

  // Route based on role
  const role = userProfile.role;

  if (role === 'super_admin' || role === 'realtor' || role === 'firm_admin') {
    return (
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(realtor)" />
      </Stack>
    );
  }

  // client (default)
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(client)" />
    </Stack>
  );
}

/**
 * Shown when a user has authenticated but doesn't have a public.users row.
 * Happens when someone signs up without an invite. We tell them how to fix it.
 */
function OrphanAccountScreen({
  email,
  onSignOut,
}: {
  email?: string | null;
  onSignOut: () => void;
}) {
  const { View, Text, Pressable, StyleSheet } = require('react-native');
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: '#0F172A',
        padding: 24,
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: 'white', fontSize: 28, fontWeight: '700' }}>
        Almost there.
      </Text>
      <Text
        style={{
          color: 'rgba(255,255,255,0.8)',
          fontSize: 16,
          marginTop: 12,
          lineHeight: 24,
        }}
      >
        Your account ({email}) isn't linked to a real estate firm yet. Two ways
        to fix this:
      </Text>
      <Text
        style={{
          color: 'rgba(255,255,255,0.9)',
          fontSize: 15,
          marginTop: 20,
          lineHeight: 22,
        }}
      >
        {'•'}  If you're a realtor, sign up at our website to create your
        firm.{'\n'}
        {'•'}  If you're a buyer or seller, ask your realtor to send you an
        invite email. The invite link will set things up automatically.
      </Text>
      <Pressable
        onPress={onSignOut}
        style={{
          marginTop: 32,
          backgroundColor: 'white',
          paddingVertical: 14,
          borderRadius: 10,
          alignItems: 'center',
        }}
      >
        <Text style={{ color: '#0F172A', fontWeight: '600' }}>Sign out</Text>
      </Pressable>
    </View>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <ThemeProvider>
            <RootNavigator />
          </ThemeProvider>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
