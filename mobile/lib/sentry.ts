import Constants from 'expo-constants';

/**
 * Thin wrapper around @sentry/react-native so the rest of the app can
 * `import { initSentry, captureError } from '@/lib/sentry'` without caring
 * whether Sentry is even available at runtime. If the dep isn't installed
 * yet, all calls become no-ops and nothing crashes.
 *
 * Set EXPO_PUBLIC_SENTRY_DSN in eas.json (env section) to activate.
 */

let Sentry: any = null;
let initialized = false;

export function initSentry() {
  if (initialized) return;
  initialized = true;
  const dsn =
    (process.env.EXPO_PUBLIC_SENTRY_DSN as string | undefined) ||
    (Constants.expoConfig?.extra as any)?.sentryDsn;
  if (!dsn) return;
  try {
    // Lazy require so a missing peer dep doesn't crash the bundler in dev.
    Sentry = require('@sentry/react-native');
    Sentry.init({
      dsn,
      tracesSampleRate: 0.2,
      enableAutoSessionTracking: true,
      environment: __DEV__ ? 'development' : 'production',
    });
  } catch {
    // Package not installed - silently skip.
  }
}

export function captureError(err: unknown, context?: Record<string, any>) {
  if (!Sentry) return;
  try {
    if (context) Sentry.setContext('extra', context);
    Sentry.captureException(err);
  } catch {}
}

export function setUser(user: { id: string; email?: string | null }) {
  if (!Sentry) return;
  try {
    Sentry.setUser({ id: user.id, email: user.email ?? undefined });
  } catch {}
}

export function clearUser() {
  if (!Sentry) return;
  try {
    Sentry.setUser(null);
  } catch {}
}
