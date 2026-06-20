import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Database } from './database.types';

/**
 * Supabase client. We do NOT throw at module-load time even if env vars are
 * missing - that would hard-crash the app on launch with no useful error.
 * Instead we fall back to a "broken" client and expose `configError` so the
 * UI can render a clear screen explaining what went wrong.
 */

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const configError: string | null =
  !supabaseUrl || !supabaseAnonKey
    ? 'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. ' +
      'This build was packaged without environment variables - please notify the dev team.'
    : null;

// Use dummy values when missing so createClient does not throw. Any actual
// network call will fail, but the app stays interactive and can show the
// config error screen.
const effectiveUrl = supabaseUrl || 'https://placeholder.supabase.co';
const effectiveKey =
  supabaseAnonKey || 'placeholder-key-for-broken-build-config';

export const supabase = createClient<Database>(effectiveUrl, effectiveKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export type SupabaseClient = typeof supabase;
