import { Linking } from 'react-native';
import { supabase } from './supabase';

/**
 * Open any page of the WEB app already signed in as the current user.
 *
 * The app hands its Supabase session to /auth/bridge via the URL FRAGMENT
 * (never sent to any server), the bridge sets the web cookies, and the
 * browser lands on `next` as the same person. This is the parity guarantee:
 * anything the website can do, the phone can reach in two taps, with no
 * second login and no drift between platforms.
 */
const SITE =
  (process.env.EXPO_PUBLIC_API_URL as string | undefined) ||
  'https://realtorportal.parallelstudios.co';

export async function openWebAuthed(next: string): Promise<void> {
  const path = next.startsWith('/') ? next : '/' + next;
  try {
    const { data } = await supabase.auth.getSession();
    const s = data.session;
    if (s?.access_token && s?.refresh_token) {
      const hash =
        'access_token=' +
        encodeURIComponent(s.access_token) +
        '&refresh_token=' +
        encodeURIComponent(s.refresh_token) +
        '&next=' +
        encodeURIComponent(path);
      await Linking.openURL(`${SITE}/auth/bridge#${hash}`);
      return;
    }
  } catch {
    // fall through to the plain URL — worst case they log in manually
  }
  await Linking.openURL(SITE + path);
}
