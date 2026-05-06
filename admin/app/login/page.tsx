import Link from 'next/link';
import { loginAction } from './actions';

export const metadata = { title: 'Sign in · Realtor Portal' };

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string; notice?: string; next?: string };
}) {
  return (
    <main className="min-h-screen bg-slate-50 py-12">
      <div className="mx-auto max-w-md px-6">
        <Link href="/" className="mb-8 inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
          ← Back to home
        </Link>

        <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
          <p className="mt-1 text-sm text-slate-600">Sign in to your firm dashboard.</p>

          {searchParams.notice && (
            <div className="mt-4 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
              {searchParams.notice}
            </div>
          )}
          {searchParams.error && (
            <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {searchParams.error}
            </div>
          )}

          <form action={loginAction} className="mt-6 space-y-4">
            <input type="hidden" name="next" value={searchParams.next || '/dashboard'} />
            <div>
              <label htmlFor="email" className="block text-sm font-medium">Email</label>
              <input
                id="email"
                name="email"
                type="email"
                required
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                required
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <button
              type="submit"
              className="mt-2 w-full rounded-md bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700"
            >
              Sign in
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-600">
            New here?{' '}
            <Link href="/signup" className="font-medium text-blue-600 hover:text-blue-700">
              Start a free trial
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
