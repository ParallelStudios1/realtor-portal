import Image from 'next/image';
import Link from 'next/link';
import { startSignupAction } from './actions';
import { StartAnalytics, TrackedStoreLink } from './StartAnalytics';

export const metadata = {
  title: 'Get started · Realtor Portal',
  description:
    'Create your free Realtor Portal account in 30 seconds, then get the app.',
};
export const dynamic = 'force-dynamic';

/**
 * The ad landing page. One job: turn a tap on an Instagram/TikTok ad into an
 * ACCOUNT, then hand them to the app store. Signup comes first because a
 * store hand-off inside an in-app browser is where we were losing everyone -
 * an account we hold onto survives a botched redirect; an anonymous visitor
 * doesn't.
 *
 * Design constraints, learned the hard way in this codebase:
 *  - It must work inside Instagram's webview: no popups, no OAuth, no custom
 *    schemes; the store hand-off is a plain anchor to /get (server-side 302).
 *  - Three fields max. Firm name is derived server-side.
 *  - ?done=1 success state pushes to the store and explains the same
 *    credentials work in the app.
 */
export default function StartPage({
  searchParams,
}: {
  searchParams: {
    done?: string;
    r?: string;
    error?: string;
    role?: string;
    email?: string;
    name?: string;
  };
}) {
  if (searchParams.done === '1') {
    const home = searchParams.r === 'attorney' ? '/attorney' : '/onboarding';
    return (
      <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center px-6 py-10">
        <StartAnalytics step="done" />
        <div className="text-center">
          <Image
            src="/logo.png"
            alt="Realtor Portal"
            width={56}
            height={56}
            className="mx-auto rounded-xl"
          />
          <h1 className="mt-5 text-3xl font-bold tracking-tight text-ink-900">
            You&apos;re in.
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-600">
            Your account is ready. Grab the app - everything runs from your
            phone.
          </p>
        </div>

        <TrackedStoreLink />

        <p className="mt-3 text-center text-xs text-ink-500">
          Sign in to the app with the same email and password you just used.
        </p>

        <Link
          href={home}
          className="mt-6 text-center text-sm font-semibold text-ink-600 underline-offset-2 hover:underline"
        >
          Or continue in the browser →
        </Link>
      </main>
    );
  }

  const role = searchParams.role === 'attorney' ? 'attorney' : 'realtor';

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center px-6 py-10">
      <StartAnalytics step="view" />
      <div className="text-center">
        <Image
          src="/logo.png"
          alt="Realtor Portal"
          width={48}
          height={48}
          className="mx-auto rounded-xl"
        />
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-ink-900">
          Every deal. One place.
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-600">
          Deadlines, documents, and clients in a branded portal your clients
          will actually use. Free 14-day trial - no card needed.
        </p>
      </div>

      {searchParams.error && (
        <div className="mt-5 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          {searchParams.error}
        </div>
      )}

      <form action={startSignupAction} className="mt-6 space-y-3">
        {/* Who they are - realtors are the ad audience, attorneys welcome. */}
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ['realtor', "I'm a Realtor"],
              ['attorney', "I'm an Attorney"],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className="flex cursor-pointer items-center justify-center rounded-xl border-2 border-ink-200 bg-white px-3 py-3 text-sm font-semibold text-ink-700 transition has-[:checked]:border-ink-900 has-[:checked]:bg-ink-900 has-[:checked]:text-white"
            >
              <input
                type="radio"
                name="role"
                value={value}
                defaultChecked={role === value}
                className="sr-only"
              />
              {label}
            </label>
          ))}
        </div>

        <input
          name="full_name"
          type="text"
          required
          autoComplete="name"
          placeholder="Full name"
          defaultValue={searchParams.name || ''}
          className="input w-full"
        />
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          placeholder="Email"
          defaultValue={searchParams.email || ''}
          className="input w-full"
        />
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="Password (8+ characters)"
          className="input w-full"
        />

        <button type="submit" className="btn-primary w-full py-3.5 text-base">
          Create my free account
        </button>
      </form>

      <p className="mt-4 text-center text-xs text-ink-500">
        Already have an account?{' '}
        <Link href="/login" className="font-semibold underline-offset-2 hover:underline">
          Sign in
        </Link>
      </p>
    </main>
  );
}
