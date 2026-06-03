import Link from 'next/link';
import { inviteClientAction } from './actions';

export const metadata = { title: 'Invite client · Realtor Portal' };

export default function NewClientPage({ searchParams }: { searchParams: { error?: string; ok?: string } }) {
  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <Link href="/dashboard/clients" className="text-sm font-semibold text-ink-500 transition hover:text-ink-900">
        ← Back to clients
      </Link>
      <div className="mt-4 text-[11px] font-bold uppercase tracking-wider text-ink-500">
        New client
      </div>
      <h1 className="mt-1.5 text-3xl font-bold tracking-tight text-ink-900">Invite a client</h1>
      <p className="mt-1 text-sm text-ink-600">
        We'll email them a one-tap link to download the app and join your portal.
      </p>

      {searchParams.error && (
        <div className="mt-6 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          {searchParams.error}
        </div>
      )}
      {searchParams.ok && (
        <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          Invitation sent.
        </div>
      )}

      <form action={inviteClientAction} className="mt-8 space-y-4 rounded-2xl border border-ink-200 bg-white p-6 shadow-soft">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="full_name" className="label">Full name</label>
            <input
              id="full_name"
              name="full_name"
              type="text"
              required
              className="input mt-1"
            />
          </div>
          <div>
            <label htmlFor="email" className="label">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              required
              className="input mt-1"
            />
          </div>
        </div>
        <div>
          <label htmlFor="address" className="label">Property address (optional)</label>
          <input
            id="address"
            name="address"
            type="text"
            placeholder="123 Main St, Boston MA 02116"
            className="input mt-1"
          />
        </div>
        <div>
          <label htmlFor="role_in_deal" className="label">They are the…</label>
          <select
            id="role_in_deal"
            name="role_in_deal"
            className="input mt-1"
          >
            <option value="buyer">Buyer</option>
            <option value="seller">Seller</option>
            <option value="both">Both</option>
          </select>
        </div>

        {/* Default OFF — we no longer auto-create a deal when a client is
            invited. A client can have many deals over time. Toggle this on
            when you're inviting them because a specific transaction is
            starting today. */}
        <label className="flex items-start gap-2 rounded-lg border border-ink-200 bg-ink-50 p-3 text-sm">
          <input
            type="checkbox"
            name="start_deal"
            value="1"
            className="mt-0.5 h-4 w-4 accent-ink-900"
          />
          <span>
            <span className="font-medium">Start a deal now too</span>
            <span className="block text-xs text-ink-500">
              On = land directly on a fresh deal workspace. Off = just create
              the client; start the deal later when one materializes.
            </span>
          </span>
        </label>
        <button type="submit" className="btn-primary w-full">
          Send invitation
        </button>
      </form>
    </main>
  );
}
