import Link from 'next/link';
import { signupAction } from './actions';
import { SignupForm } from './SignupForm';

export const metadata = { title: 'Sign up · Realtor Portal' };

/**
 * Role-picker signup. The user chooses Realtor / Buyer / Seller, and the form
 * adapts. Realtors get a firm-name field; buyers/sellers get a realtor-email
 * field. The form posts to a single server action that branches on role.
 */
export default function SignupPage({
  searchParams,
}: {
  searchParams: { error?: string; role?: string };
}) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-ink-50 py-12">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-32 right-1/4 h-96 w-96 rounded-full bg-emerald-200 opacity-30 blur-3xl" />
        <div className="absolute -top-20 left-0 h-80 w-80 rounded-full bg-blue-200 opacity-30 blur-3xl" />
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
            <span className="text-sm font-bold tracking-tight">
              Realtor Portal
            </span>
          </div>
          <h1 className="mt-4 text-3xl font-bold tracking-tight">
            Get started
          </h1>
          <p className="mt-1 text-sm text-ink-600">
            Pick the option that describes you.
          </p>

          {searchParams.error && (
            <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
              {searchParams.error}
            </div>
          )}

          <SignupForm
            action={signupAction}
            initialRole={
              (searchParams.role as 'realtor' | 'buyer' | 'seller') || null
            }
          />

          <p className="mt-6 text-center text-sm text-ink-600">
            Already have an account?{' '}
            <Link
              href="/login"
              className="font-semibold text-blue-600 hover:text-blue-700"
            >
              Sign in →
            </Link>
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-ink-400">
          By signing up you agree to our{' '}
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
