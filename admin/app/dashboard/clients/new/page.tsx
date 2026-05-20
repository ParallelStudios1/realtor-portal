import Link from 'next/link';
import { inviteClientAction } from './actions';

export const metadata = { title: 'Invite client · Realtor Portal' };

export default function NewClientPage({ searchParams }: { searchParams: { error?: string; ok?: string } }) {
  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <Link href="/dashboard/clients" className="text-sm text-slate-500 hover:text-slate-700">
        ← Back to clients
      </Link>
      <h1 className="mt-4 text-3xl font-bold tracking-tight">Invite a client</h1>
      <p className="mt-1 text-sm text-slate-600">
        We'll email them a one-tap link to download the app and join your portal.
      </p>

      {searchParams.error && (
        <div className="mt-6 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {searchParams.error}
        </div>
      )}
      {searchParams.ok && (
        <div className="mt-6 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          Invitation sent.
        </div>
      )}

      <form action={inviteClientAction} className="mt-8 space-y-4 rounded-xl border border-slate-200 bg-white p-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="full_name" className="block text-sm font-medium">Full name</label>
            <input
              id="full_name"
              name="full_name"
              type="text"
              required
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
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
        </div>
        <div>
          <label htmlFor="address" className="block text-sm font-medium">Property address (optional)</label>
          <input
            id="address"
            name="address"
            type="text"
            placeholder="123 Main St, Boston MA 02116"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label htmlFor="role_in_deal" className="block text-sm font-medium">They are the…</label>
          <select
            id="role_in_deal"
            name="role_in_deal"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
        <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
          <input
            type="checkbox"
            name="start_deal"
            value="1"
            className="mt-0.5 h-4 w-4 accent-slate-900"
          />
          <span>
            <span className="font-medium">Start a deal now too</span>
            <span className="block text-xs text-slate-500">
              On = land directly on a fresh deal workspace. Off = just create
              the client; start the deal later when one materializes.
            </span>
          </span>
        </label>
        <button
          type="submit"
          className="w-full rounded-md bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700"
        >
          Send invitation
        </button>
      </form>
    </main>
  );
}
