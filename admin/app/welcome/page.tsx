import Link from 'next/link';

export const metadata = { title: 'Welcome · Realtor Portal' };

export default function WelcomePage() {
  return (
    <main className="min-h-screen bg-slate-50 py-12">
      <div className="mx-auto max-w-md px-6 text-center">
        <div className="mx-auto h-16 w-16 rounded-2xl bg-blue-600" />
        <h1 className="mt-6 text-3xl font-bold tracking-tight">You're in.</h1>
        <p className="mt-2 text-slate-600">
          Your realtor invited you to track your deal in real time. Download the app to get started.
        </p>

        <div className="mt-8 space-y-3">
          <a
            href="https://apps.apple.com/"
            className="block rounded-md bg-slate-900 px-6 py-3 text-base font-semibold text-white hover:bg-slate-700"
          >
            Get on the App Store
          </a>
          <a
            href="https://play.google.com/"
            className="block rounded-md border border-slate-300 bg-white px-6 py-3 text-base font-semibold text-slate-700 hover:border-slate-400"
          >
            Get on Google Play
          </a>
        </div>

        <p className="mt-8 text-xs text-slate-500">
          Already have the app?{' '}
          <Link href="/login" className="text-blue-600 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
