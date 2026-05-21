import Link from 'next/link';
import { createBlankDealAction } from './actions';

export const metadata = { title: 'New deal · Realtor Portal' };

/**
 * "Start a new deal" — no client required.
 *
 * Just a name + a buyer/seller flag. The realtor lands on the deal
 * workspace right after and uses Add Party to attach whoever's actually
 * involved: existing client, brand-new client, co-realtor, attorney, etc.
 */
export default function NewDealPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <Link
        href="/dashboard/deals"
        className="text-sm text-ink-500 hover:text-ink-900"
      >
        ← Back to deals
      </Link>
      <h1 className="mt-4 text-3xl font-bold tracking-tight">Start a new deal</h1>
      <p className="mt-1 text-sm text-ink-600">
        Name it. You&apos;ll add the client, co-realtors, attorney, and anyone
        else inside the deal workspace after this.
      </p>

      {searchParams.error && (
        <div className="mt-6 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          {searchParams.error}
        </div>
      )}

      <form
        action={async (fd) => {
          'use server';
          await createBlankDealAction({
            name: (fd.get('name') as string) || '',
            kind: ((fd.get('kind') as string) || 'buyer') as
              | 'buyer'
              | 'seller',
          });
        }}
        className="mt-8 space-y-4 rounded-xl border border-ink-200 bg-white p-6 shadow-soft"
      >
        <div>
          <label htmlFor="deal-name" className="label">
            Deal name
          </label>
          <input
            id="deal-name"
            name="name"
            type="text"
            required
            placeholder="e.g. Westside buyer search, 123 Main St listing"
            className="input mt-1.5"
            autoFocus
          />
          <p className="mt-1 text-[11px] text-ink-500">
            Whatever helps you tell deals apart in your dashboard.
          </p>
        </div>

        <div>
          <label className="label">Deal type</label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-ink-300 bg-white p-3 text-sm hover:bg-ink-50">
              <input
                type="radio"
                name="kind"
                value="buyer"
                defaultChecked
                className="mt-0.5 h-4 w-4 accent-ink-900"
              />
              <span>
                <span className="block font-semibold">Buyer search</span>
                <span className="block text-[11px] text-ink-500">
                  Helping someone find a place.
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-ink-300 bg-white p-3 text-sm hover:bg-ink-50">
              <input
                type="radio"
                name="kind"
                value="seller"
                className="mt-0.5 h-4 w-4 accent-ink-900"
              />
              <span>
                <span className="block font-semibold">Listing</span>
                <span className="block text-[11px] text-ink-500">
                  Selling a specific property.
                </span>
              </span>
            </label>
          </div>
        </div>

        <button type="submit" className="btn-primary w-full" data-loading="true">
          Start deal
        </button>

        <p className="text-[11px] text-ink-500">
          You won&apos;t invite anyone until you choose to. Going to{' '}
          <Link
            href="/dashboard/clients/new"
            className="font-semibold text-blue-600 hover:underline"
          >
            invite a client instead
          </Link>{' '}
          works too — same destination.
        </p>
      </form>
    </main>
  );
}
