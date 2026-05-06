import { getMe } from '@/lib/supabaseSsr';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Settings · Realtor Portal' };

export default async function SettingsPage() {
  const me = (await getMe())!;

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="text-3xl font-bold tracking-tight">Settings</h1>

      <section className="mt-8 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold">Account</h2>
        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex justify-between border-b border-slate-100 pb-2">
            <dt className="text-slate-500">Name</dt>
            <dd className="font-medium">{me.full_name}</dd>
          </div>
          <div className="flex justify-between border-b border-slate-100 pb-2">
            <dt className="text-slate-500">Email</dt>
            <dd className="font-medium">{me.email}</dd>
          </div>
          <div className="flex justify-between border-b border-slate-100 pb-2">
            <dt className="text-slate-500">Firm</dt>
            <dd className="font-medium">{me.firm_name}</dd>
          </div>
          <div className="flex justify-between border-b border-slate-100 pb-2">
            <dt className="text-slate-500">Subdomain</dt>
            <dd className="font-mono text-xs">{me.firm_subdomain}.realtorportal.app</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Status</dt>
            <dd className="font-medium capitalize">{me.firm_status}</dd>
          </div>
        </dl>
      </section>

      <section id="mobile" className="mt-8 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold">Mobile app</h2>
        <p className="mt-1 text-sm text-slate-600">
          Download Realtor Portal on iOS or Android. Sign in with the same email and password.
        </p>
        <div className="mt-4 flex gap-3">
          <a
            href="#"
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-400"
          >
            App Store (coming soon)
          </a>
          <a
            href="#"
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-400"
          >
            Google Play (coming soon)
          </a>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Beta testing? Email <a href="mailto:turnerlogan@parallelstudios.co" className="underline">us</a> for an early TestFlight invite.
        </p>
      </section>

      <section className="mt-8 rounded-xl border border-red-200 bg-red-50 p-6">
        <h2 className="text-lg font-semibold text-red-900">Danger zone</h2>
        <p className="mt-1 text-sm text-red-700">
          Need to delete your firm? Email{' '}
          <a href="mailto:turnerlogan@parallelstudios.co" className="underline">
            turnerlogan@parallelstudios.co
          </a>{' '}
          and we'll remove it within 24 hours.
        </p>
      </section>
    </main>
  );
}
