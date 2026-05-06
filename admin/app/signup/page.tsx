import Link from 'next/link';
import { signupAction } from './actions';

export const metadata = { title: 'Sign up · Realtor Portal' };

export default function SignupPage({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <main className="min-h-screen bg-slate-50 py-12">
      <div className="mx-auto max-w-md px-6">
        <Link href="/" className="mb-8 inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
          ← Back to home
        </Link>

        <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-bold tracking-tight">Start your free trial</h1>
          <p className="mt-1 text-sm text-slate-600">14 days free. No credit card.</p>

          {searchParams.error && (
            <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {searchParams.error}
            </div>
          )}

          <form action={signupAction} className="mt-6 space-y-4">
            <div>
              <label htmlFor="firm_name" className="block text-sm font-medium">Firm or brokerage name</label>
              <input
                id="firm_name"
                name="firm_name"
                type="text"
                required
                placeholder="Logan Realty Group"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label htmlFor="full_name" className="block text-sm font-medium">Your name</label>
              <input
                id="full_name"
                name="full_name"
                type="text"
                required
                placeholder="Turner Logan"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium">Work email</label>
              <input
                id="email"
                name="email"
                type="email"
                required
                placeholder="you@brokerage.com"
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
                minLength={8}
                placeholder="At least 8 characters"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <button
              type="submit"
              className="mt-2 w-full rounded-md bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700"
            >
              Create my firm →
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-600">
            Already have an account?{' '}
            <Link href="/login" className="font-medium text-blue-600 hover:text-blue-700">
              Sign in
            </Link>
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          By signing up you agree to our{' '}
          <Link href="/terms" className="underline">Terms</Link> and{' '}
          <Link href="/privacy" className="underline">Privacy Policy</Link>.
        </p>
      </div>
    </main>
  );
}
