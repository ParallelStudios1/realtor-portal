'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * "Hand this phone to the app" interstitial.
 *
 * Phone visitors who just accepted an invite (or hit an app-first flow) land
 * here. We try the app's custom scheme — if Realtor Portal is installed the
 * OS switches to it instantly and their account is ready to sign in. If
 * nothing catches the scheme within a beat, we fall through to /get, which
 * 302s to the right store for this device. Either way the phone ends up in
 * the app, which is where deals are meant to be followed.
 *
 * A visible "continue on the web instead" link stays as the escape hatch —
 * auto-redirects with no exit are how you lose people.
 */
export function OpenAppClient({ next }: { next: string }) {
  const [tried, setTried] = useState(false);
  const cancelled = useRef(false);

  useEffect(() => {
    const cancel = () => {
      cancelled.current = true;
    };
    // If the OS switched to the app, this tab is backgrounded — don't also
    // drag the abandoned tab to the store.
    document.addEventListener('visibilitychange', cancel, { once: true });
    window.addEventListener('pagehide', cancel, { once: true });

    try {
      window.location.href = 'realtorportal://';
    } catch {}
    const t = setTimeout(() => {
      setTried(true);
      if (!cancelled.current) window.location.href = '/get';
    }, 1400);
    return () => clearTimeout(t);
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-ink-50 px-6">
      <div className="w-full max-w-sm text-center">
        <img src="/logo.png" alt="" className="mx-auto h-14 w-14 rounded-2xl" />
        <h1 className="mt-4 text-xl font-bold text-ink-900">
          You&apos;re all set — opening the app
        </h1>
        <p className="mt-1 text-sm text-ink-600">
          Your account is ready. Sign in with the email and password you just
          chose.
        </p>
        <a
          href="/get"
          className="btn-primary mt-6 w-full justify-center py-3 text-[15px] font-bold"
        >
          {tried ? 'Get the app' : 'Open the app'}
        </a>
        <a
          href={next.startsWith('/') ? next : '/'}
          className="mt-4 inline-block text-sm font-semibold text-ink-500 underline underline-offset-2"
        >
          Continue on the web instead
        </a>
      </div>
    </main>
  );
}
