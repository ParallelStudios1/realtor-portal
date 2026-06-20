import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useRouter, Link, useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import { useAuth } from '@/lib/auth';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useTheme } from '@/lib/theme';
import { useToast } from '@/components/Toast';
import { humanError } from '@/lib/humanError';

export default function LoginScreen() {
  const router = useRouter();
  const { signIn, isLoading, error } = useAuth();
  const { colors } = useTheme();
  const toast = useToast();
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState((params.email as string) || '');
  const [password, setPassword] = useState('');

  // If the app was opened via the realtorportal:// deep link with ?email=...,
  // pre-fill the email field. (The web welcome page sends them here after they
  // accept their invite and set a password.)
  useEffect(() => {
    if (params.email) {
      setEmail(params.email as string);
      return;
    }
    // Also handle cold start when params haven't propagated yet
    Linking.getInitialURL().then((url) => {
      if (!url) return;
      const parsed = Linking.parse(url);
      const e = parsed.queryParams?.email;
      if (typeof e === 'string') setEmail(e);
    });
  }, [params.email]);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      toast.show('Please fill in all fields', { variant: 'error' });
      return;
    }

    try {
      await signIn(email, password);
      // No explicit navigation - the AuthProvider's SIGNED_IN listener
      // updates state, then the root layout swaps the screen group from
      // (auth) to (realtor) or (client) automatically. Pushing '/' here
      // was racing the layout switch and bouncing back to login.
    } catch (err: any) {
      toast.show(humanError(err), { variant: 'error' });
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        <Text style={[styles.title, { color: colors.text }]}>
          Realtor Portal
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Sign in to your account
        </Text>

        {error && (
          <View style={[styles.errorBox, { backgroundColor: colors.error + '20' }]}>
            <Text style={[styles.errorText, { color: colors.error }]}>
              {error}
            </Text>
          </View>
        )}

        <TextInput
          style={[
            styles.input,
            {
              color: colors.text,
              borderColor: colors.border,
              backgroundColor: colors.surface,
            },
          ]}
          placeholder="Email"
          placeholderTextColor={colors.textSecondary}
          value={email}
          onChangeText={setEmail}
          editable={!isLoading}
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <TextInput
          style={[
            styles.input,
            {
              color: colors.text,
              borderColor: colors.border,
              backgroundColor: colors.surface,
            },
          ]}
          placeholder="Password"
          placeholderTextColor={colors.textSecondary}
          value={password}
          onChangeText={setPassword}
          editable={!isLoading}
          secureTextEntry
        />

        <PrimaryButton
          label={isLoading ? 'Signing in...' : 'Sign in'}
          onPress={handleLogin}
          loading={isLoading}
          disabled={isLoading}
          style={styles.button}
        />

        <View style={styles.signup}>
          <Text style={[styles.signupText, { color: colors.textSecondary }]}>
            Don't have an account?{' '}
          </Text>
          <Link href="/(auth)/signup" asChild>
            <TouchableOpacity disabled={isLoading}>
              <Text
                style={[
                  styles.signupLink,
                  { color: colors.primary, opacity: isLoading ? 0.5 : 1 },
                ]}
              >
                Sign up
              </Text>
            </TouchableOpacity>
          </Link>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 32,
  },
  errorBox: {
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 14,
    fontWeight: '500',
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 16,
    fontSize: 16,
  },
  button: {
    marginTop: 8,
    marginBottom: 24,
  },
  signup: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  signupText: {
    fontSize: 14,
  },
  signupLink: {
    fontSize: 14,
    fontWeight: '600',
  },
});
