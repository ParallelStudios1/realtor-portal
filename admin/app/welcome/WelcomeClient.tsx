'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabaseBrowser';

type Firm = {
  name: string;
  logo_url: string | null;
  brand_color: string | null;
  accent_color: string | null;
  tagline: string | null;
};

type Props = {
  firm: Firm | null;
  hasSession: boolean;
  email: string | null;
  fullName: string | null;
};

/**
 * Step 1: New invitee — show "Set your password" form (post-invite).
 * Step 2: Password set — show "Open the app" deep-link with firm branding.
 * Step 3: No session, no firm — generic fallback.
 */
export function WelcomeClient({ firm, hasSession, email, fullName }: Props) {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'setPassword' | 'openApp'>(
    hasSession ? 'setPassword' : 'openApp'
  );
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Supabase verify endpoint sends users back here with #access_token=... in the
  // URL fragment. Pick those up and set the session client-side. (Server-side
  // can't read URL fragments — they never reach the server.)
  useEffect(() => {
    const hash = typeof window !== 'undefined' ? window.location.hash : '';
    if (!hash.includes('access_token')) return;

    const params = new URLSearchParams(hash.slice(1));
    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');
    if (access_token && refresh_token) {
      supabase.auth
        .setSession({ access_token, refresh_token })
        .then(({ error: e }) => {
          if (e) {
            setError(e.message);
            return;
          }
          // Clear the hash, then refresh server props so firm/user load
          window.history.replaceState(null, '', window.location.pathname);
          setStep('setPassword');
          router.refresh();
        });
    }
  }, [supabase, router]);

  const brandColor = firm?.brand_color || '#0F172A';
  const accentColor = firm?.accent_color || '#2563EB';

  function handleSetPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    start(async () => {
      const { error: e } = await supabase.auth.updateUser({ password });
      if (e) {
        setError(e.message);
        return;
      }
      setStep('openApp');
    });
  }

  // Build the deep link. Custom scheme `realtorportal://` opens the mobile app
  // if installed; if not, the OS falls back to nothing (we add an App Store
  // link on the page so they can grab it).
  const deepLink = `realtorportal://login${
    email ? `?email=${encodeURIComponent(email)}` : ''
  }`;

  return (
    <main className="min-h-screen" style={{ backgroundColor: brandColor }}>
      <div className="mx-auto max-w-md px-6 py-16">
        {/* Branded header */}
        <div className="mb-8 flex items-center gap-3">
          {firm?.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={firm.logo_url}
              alt={firm.name}
              className="h-12 w-12 rounded-lg bg-white object-contain p-1"
            />
          ) : (
            <div className="h-12 w-12 rounded-lg bg-white/20" />
          )}
          <div className="text-white">
            <div className="text-lg font-semibold">{firm?.name || 'Realtor Portal'}</div>
            {firm?.tagline && (
              <div className="text-sm opacity-80">{firm.tagline}</div>
            )}
          </div>
        </div>

        {/* Card */}
        <div className="rounded-2xl bg-white p-7 shadow-2xl">
          {step === 'setPassword' && hasSession && (
            <>
              <h1 className="text-2xl font-bold tracking-tight">
                Welcome{fullName ? `, ${fullName.split(' ')[0]}` : ''}.
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                Set a password so you can sign in to {firm?.name || 'the portal'}{' '}
                anytime.
              </p>

              {error && (
                <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  {error}
                </div>
              )}

              <form onSubmit={handleSetPassword} className="mt-6 space-y-4">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium">
                    Your email
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email || ''}
                    disabled
                    className="mt-1 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500"
                  />
                </div>
                <div>
                  <label htmlFor="password" className="block text-sm font-medium">
                    Choose a password
                  </label>
                  <input
                    id="password"
                    type="password"
                    autoFocus
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={8}
                    required
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2"
                    style={{ outlineColor: accentColor }}
                  />
                </div>
                <div>
                  <label
                    htmlFor="confirm"
                    className="block text-sm font-medium"
                  >
                    Confirm password
                  </label>
                  <input
                    id="confirm"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2"
                  />
                </div>
                <button
                  type="submit"
                  disabled={pending}
                  className="w-full rounded-md px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                  style={{ backgroundColor: accentColor }}
                >
                  {pending ? 'Saving…' : 'Continue'}
                </button>
              </form>
            </>
          )}

          {step === 'openApp' && (
            <>
              <h1 className="text-2xl font-bold tracking-tight">
                {hasSession ? "You're all set." : "You're invited."}
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                Open {firm?.name || 'the portal'} in the app to track your deal,
                view documents, and message your agent.
              </p>

              <div className="mt-6 space-y-3">
                <a
                  href={deepLink}
                  className="block rounded-md px-6 py-3 text-center text-base font-semibold text-white"
                  style={{ backgroundColor: accentColor }}
                >
                  Open the app →
                </a>
                <a
                  href="https://apps.apple.com/"
                  className="block rounded-md border border-slate-300 bg-white px-6 py-3 text-center text-sm font-semibold text-slate-700 hover:border-slate-400"
                >
                  Don't have it? Get on the App Store
                </a>
                <a
                  href="https://play.google.com/"
                  className="block rounded-md border border-slate-300 bg-white px-6 py-3 text-center text-sm font-semibold text-slate-700 hover:border-slate-400"
                >
                  Get on Google Play
                </a>
              </div>

              <p className="mt-6 text-center text-xs text-slate-500">
                Already have the app? It should open automatically when you tap
                the button above.
              </p>
            </>
          )}

          {step === 'openApp' && !hasSession && (
            <p className="mt-4 text-center text-xs text-slate-500">
              Need help signing in? Email your realtor at{' '}
              {firm?.name || 'the firm'}.
            </p>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-white/60">
          Powered by Realtor Portal
        </p>
      </div>
    </main>
  );
}
