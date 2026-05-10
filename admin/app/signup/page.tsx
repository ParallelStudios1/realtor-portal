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
    <main className="min-h-screen bg-slate-50 py-12">
      <div className="mx-auto max-w-md px-6">
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
        >
          ← Back to home
        </Link>

        <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-bold tracking-tight">Get started</h1>
          <p className="mt-1 text-sm text-slate-600">
            Pick the option that describes you.
          </p>

          {searchParams.error && (
            <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {searchParams.error}
            </div>
          )}

          <SignupForm
            action={signupAction}
            initialRole={
              (searchParams.role as 'realtor' | 'buyer' | 'seller') || null
            }
          />

          <p className="mt-6 text-center text-sm text-slate-600">
            Already have an account?{' '}
            <Link
              href="/login"
              className="font-medium text-blue-600 hover:text-blue-700"
            >
              Sign in
            </Link>
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          By signing up you agree to our{' '}
          <Link href="/terms" className="underline">
            Terms
          </Link>{' '}
          and{' '}
          <Link href="/privacy" className="underline">
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
