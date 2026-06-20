import { Redirect } from 'expo-router';
import { useAuth } from '@/lib/auth';

/**
 * Routing entry. We let the auth state decide where to send the user:
 *   - no session       → /(auth)/login
 *   - session, but no users row → handled by root layout's OrphanAccountScreen
 *   - session + profile        → handled by root layout's group routing
 *
 * We must NOT unconditionally redirect to /(auth)/login - that produced a
 * loop on sign-in: login success → router.replace('/') → this file →
 * bounce back to login.
 */
export default function RootIndex() {
  const { session, isLoading, userProfile } = useAuth();

  if (isLoading) return null;
  if (!session) return <Redirect href="/(auth)/login" />;

  // Authenticated - route by role. The root layout also renders the
  // correct group, but on cold start we may land here directly, so be
  // explicit.
  if (!userProfile) {
    // Wait for the profile query; root layout shows the orphan screen
    // if it stays null. Don't redirect here.
    return null;
  }

  const role = userProfile.role;
  if (role === 'firm_admin' || role === 'realtor' || role === 'super_admin') {
    return <Redirect href="/(realtor)" />;
  }
  return <Redirect href="/(client)" />;
}
