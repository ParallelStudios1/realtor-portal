import Link from 'next/link';
import { loginAction } from './actions';

export const metadata = { title: 'Sign in · Realtor Portal' };

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string; notice?: string; next?: string };
}) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-ink-50 py-12">
      {/* Background gradient orbs for visual interest without distracting. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-32 left-1/4 h-96 w-96 rounded-full bg-blue-200 opacity-30 blur-3xl" />
        <div className="absolute -top-20 right-0 h-80 w-80 rounded-full bg-indigo-200 opacity-30 blur-3xl" />
      </div>

      <div className="mx-auto max-w-md px-6">
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-1 text-sm text-ink-600 transition hover:text-ink-900"
        >
          <span aria-hidden>←</span> Back to home
        </Link>

        <div className="rounded-2xl border border-ink-200 bg-white p-8 shadow-soft-lg">
          <div className="mb-1 flex items-center gap-2">
            <span className="inline-block h-7 w-7 rounded-lg bg-ink-900" />
            <span className="text-sm font-bold tracking-tight">Realtor Portal</span>
          </div>
          <h1 className="mt-4 text-3xl font-bold tracking-tight">
            Welcome back
          </h1>
          <p className="mt-1 text-sm text-ink-600">
            Sign in to your firm dashboard.
          </p>

          {searchParams.notice && (
            <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
              {searchParams.notice}
            </div>
          )}
          {searchParams.error && (
            <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
              {searchParams.error}
            </div>
          )}

          <form action={loginAction} className="mt-6 space-y-4">
            <input
              type="hidden"
              name="next"
              value={searchParams.next || '/dashboard'}
            />
            <label className="block text-sm">
              <span className="label">Email</span>
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                className="input mt-1.5"
                placeholder="you@firm.com"
              />
            </label>
            <label className="block text-sm">
              <span className="label">Password</span>
              <input
                name="password"
                type="password"
                required
                autoComplete="current-password"
                className="input mt-1.5"
                placeholder="••••••••"
              />
            </label>

            <button type="submit" className="btn-primary mt-2 w-full">
              Sign in
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-ink-600">
            New here?{' '}
            <Link
              href="/signup"
              className="font-semibold text-blue-600 hover:text-blue-700"
            >
              Start a free trial →
            </Link>
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-ink-400">
          By signing in you agree to our{' '}
          <Link href="/terms" className="underline hover:text-ink-700">
            Terms
          </Link>{' '}
          and{' '}
          <Link href="/privacy" className="underline hover:text-ink-700">
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
