import { supabase } from './supabase';

const API_BASE =
  (process.env.EXPO_PUBLIC_API_URL as string | undefined) ||
  'https://realtorportal.parallelstudios.co';

/**
 * Authenticated fetch to the web API with the current Supabase access token.
 * Used by mobile screens that mirror web server actions (firm control, etc.).
 */
export async function apiFetch<T = any>(
  path: string,
  options: { method?: string; body?: any } = {}
): Promise<T> {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  const res = await fetch(API_BASE + path, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* no body */
  }
  if (!res.ok) {
    throw new Error((json && json.error) || `Request failed (${res.status})`);
  }
  return json as T;
}
