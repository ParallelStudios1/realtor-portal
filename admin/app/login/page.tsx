import Link from 'next/link';
import { loginAction } from './actions';

export const metadata = { title: 'Sign in · Realtor Portal' };

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string; notice?: string; next?: string };
}) {
  return (
    <main className="min-h-screen bg-ink-50 py-12">
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
            <div>
              <label htmlFor="login-email" className="label">
                Email
              </label>
              <input
                id="login-email"
                name="email"
                type="email"
                required
                autoComplete="email"
                className="input mt-1.5"
                placeholder="you@firm.com"
              />
            </div>
            <div>
              <label htmlFor="login-password" className="label">
                Password
              </label>
              <input
                id="login-password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                className="input mt-1.5"
                placeholder="••••••••"
              />
            </div>

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
