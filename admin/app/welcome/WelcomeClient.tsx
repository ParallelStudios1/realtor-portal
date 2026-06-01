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

  // Detect any magic-link parameter style on first render so we don't flash
  // the "Open in app / browser" buttons before the session is set. We watch
  // for hash tokens, ?code=, and ?token_hash= (Supabase emits all three).
  const linkInProgress =
    typeof window !== 'undefined' &&
    (window.location.hash.includes('access_token') ||
      window.location.search.includes('code=') ||
      window.location.search.includes('token_hash='));

  const [step, setStep] = useState<'redeeming' | 'setPassword' | 'openApp'>(() => {
    if (linkInProgress) return 'redeeming';
    return hasSession ? 'setPassword' : 'openApp';
  });
  // Client-side mirror of hasSession — the server prop is captured at render
  // time and won't update after setSession runs in the browser.
  const [sessionReady, setSessionReady] = useState(hasSession);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Magic-link redemption. Supabase emits two link formats:
  //
  //   (a) #access_token=...&refresh_token=...  (implicit hash flow — works
  //       reliably on mobile Safari + Chrome but desktop email clients
  //       sometimes strip the fragment on copy/paste or on a server-side
  //       302 redirect through an inbox-tracker domain).
  //   (b) ?code=...                           (PKCE flow — survives any
  //       redirect chain because it's in the query string).
  //
  // We accept both. The hash branch runs setSession; the code branch runs
  // exchangeCodeForSession. Either lands us with a fresh cookie and we
  // router.refresh() so the server-rendered props (email, firm, etc.) pick
  // up the session on the first paint.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash || '';
    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');
    const tokenHash = url.searchParams.get('token_hash');
    const otpType = url.searchParams.get('type');

    const finish = async (
      label: string,
      promise: Promise<{ error: any } | { data?: any; error?: any }>
    ) => {
      const r: any = await promise;
      const e = r?.error;
      if (e) {
        setError(`${label}: ${e.message || 'invalid or expired link'}`);
        setStep('openApp');
        return;
      }
      // Pull the routing hints out of the URL BEFORE we wipe it.
      const usp = new URLSearchParams(window.location.search);
      const role = (usp.get('role') || '').toLowerCase();
      const next = usp.get('next') || '';
      const hostFirm = usp.get('host_firm') || '';
      window.history.replaceState(null, '', window.location.pathname);
      setSessionReady(true);

      // External-collaborator role detected — forward to the right
      // onboarding flow. This is how cross-firm realtor + attorney
      // invites land on the dedicated setup screen instead of the
      // generic client "set password" flow.
      if (role === 'realtor' || role === 'co_realtor') {
        const params = new URLSearchParams();
        if (next) params.set('next', next);
        if (hostFirm) params.set('host_firm', hostFirm);
        router.replace('/welcome/realtor?' + params.toString());
        return;
      }
      if (role === 'attorney') {
        const params = new URLSearchParams();
        if (next) params.set('next', next);
        if (hostFirm) params.set('host_firm', hostFirm);
        router.replace('/welcome/attorney?' + params.toString());
        return;
      }

      setStep('setPassword');
      router.refresh();
    };

    if (hash.includes('access_token')) {
      const params = new URLSearchParams(hash.slice(1));
      const access_token = params.get('access_token');
      const refresh_token = params.get('refresh_token');
      if (!access_token || !refresh_token) {
        setError('Invite link is missing a token. Ask your realtor to resend.');
        setStep('openApp');
        return;
      }
      finish('Invite', supabase.auth.setSession({ access_token, refresh_token }));
      return;
    }

    if (code) {
      // PKCE flow — exchangeCodeForSession works for desktop & mobile.
      finish('Sign-in', supabase.auth.exchangeCodeForSession(code));
      return;
    }

    if (tokenHash && otpType) {
      // OTP-style invite (verifyOtp). Triggered when Supabase emits a
      // token-hash URL instead of an access-token one.
      finish(
        'Verification',
        (supabase.auth as any).verifyOtp({
          token_hash: tokenHash,
          type: otpType,
        })
      );
      return;
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
          {step === 'redeeming' && (
            <div className="flex flex-col items-center py-10">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-ink-200 border-t-ink-900" />
              <p className="mt-4 text-sm text-ink-600">Signing you in…</p>
            </div>
          )}

          {step === 'setPassword' && sessionReady && (
            <>
              <h1 className="text-2xl font-bold tracking-tight">
                Welcome{fullName ? `, ${fullName.split(' ')[0]}` : ''}.
              </h1>
              <p className="mt-1 text-sm text-ink-600">
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
                    className="mt-1 w-full rounded-md border border-ink-200 bg-ink-50 px-3 py-2 text-sm text-ink-500"
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
                    className="mt-1 w-full rounded-md border border-ink-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2"
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
                    className="mt-1 w-full rounded-md border border-ink-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2"
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
                {sessionReady ? "You're all set." : "You're invited."}
              </h1>
              <p className="mt-1 text-sm text-ink-600">
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
                  href="/client"
                  className="block rounded-md border-2 px-6 py-3 text-center text-base font-semibold hover:opacity-90"
                  style={{ borderColor: accentColor, color: accentColor }}
                >
                  Or continue in your browser →
                </a>
                <div className="my-2 flex items-center gap-3 text-xs text-ink-400">
                  <div className="h-px flex-1 bg-ink-200" />
                  <span>Don't have the app yet?</span>
                  <div className="h-px flex-1 bg-ink-200" />
                </div>
                <a
                  href="https://apps.apple.com/"
                  className="block rounded-md border border-ink-300 bg-white px-6 py-2.5 text-center text-sm font-semibold text-ink-700 hover:border-ink-400"
                >
                  Get on the App Store
                </a>
                <a
                  href="https://play.google.com/"
                  className="block rounded-md border border-ink-300 bg-white px-6 py-2.5 text-center text-sm font-semibold text-ink-700 hover:border-ink-400"
                >
                  Get on Google Play
                </a>
              </div>

              <p className="mt-6 text-center text-xs text-ink-500">
                Already have the app? It should open automatically when you tap
                "Open the app".
              </p>
            </>
          )}

          {step === 'openApp' && !sessionReady && (
            <p className="mt-4 text-center text-xs text-ink-500">
              Need help signing in? Email your realtor at{' '}
              {firm?.name || 'the firm'}.
            </p>
          )}
        </div>

        <p className="mt-6 text-center text-xs font-medium text-white/60">
          Realtor Portal
        </p>
      </div>
    </main>
  );
}
