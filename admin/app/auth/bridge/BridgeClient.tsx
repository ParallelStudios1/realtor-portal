'use client';

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';

/**
 * Session hand-off from the mobile app to the web.
 *
 * The app opens
 *   /auth/bridge#access_token=...&refresh_token=...&next=/dashboard/deals/<id>
 * We read the tokens from the URL HASH — the fragment never leaves the
 * browser, so tokens don't land in server logs, proxies, or referrer headers —
 * set the Supabase session cookies, and hop to `next`.
 *
 * This is what makes "every web feature, on mobile, always in sync" true
 * without rebuilding the workspace in React Native: the phone opens the real
 * thing, already signed in as the same person.
 */
export function BridgeClient() {
  const [msg, setMsg] = useState('Signing you in…');

  useEffect(() => {
    (async () => {
      try {
        const hash = window.location.hash.replace(/^#/, '');
        const params = new URLSearchParams(hash);
        const access_token = params.get('access_token') || '';
        const refresh_token = params.get('refresh_token') || '';
        const rawNext = params.get('next') || '/dashboard';
        // Internal paths only — never an open redirect.
        const next = rawNext.startsWith('/') ? rawNext : '/dashboard';

        if (!access_token || !refresh_token) {
          setMsg('This link is missing its sign-in token. Open it from the app again.');
          return;
        }

        // Scrub tokens from the address bar / history immediately.
        window.history.replaceState(null, '', window.location.pathname);

        const supabase = createBrowserClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );
        const { error } = await supabase.auth.setSession({
          access_token,
          refresh_token,
        });
        if (error) {
          setMsg('Sign-in failed: ' + error.message + '. Open the link from the app again.');
          return;
        }
        window.location.replace(next);
      } catch (e: any) {
        setMsg('Something went wrong: ' + (e?.message || 'unknown error'));
      }
    })();
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-ink-50 px-6">
      <div className="text-center">
        <img src="/logo.png" alt="" className="mx-auto h-12 w-12 rounded-xl" />
        <p className="mt-4 text-sm text-ink-600">{msg}</p>
      </div>
    </main>
  );
}
