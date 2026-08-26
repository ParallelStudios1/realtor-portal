'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';

/**
 * Attorney deal intake, shaped like the file actually arrives.
 *
 * In practice a closing attorney's CLIENT is the realtor: an agent they work
 * with sends the file over, and the agent brings their buyer or seller.
 * So the form leads with the referring realtor, then the realtor's client,
 * then everyone else. Each section can be skipped — some attorneys are
 * engaged directly by a buyer or seller with no agent at all.
 */

type ExtraRow = { id: number; role: string; name: string; email: string };

const EXTRA_ROLES = [
  { value: 'co_realtor', label: "Other side's realtor" },
  { value: 'realtor', label: 'Another realtor' },
  { value: 'buyer', label: 'Buyer' },
  { value: 'seller', label: 'Seller' },
  { value: 'lender', label: 'Lender' },
  { value: 'inspector', label: 'Inspector' },
  { value: 'title_agent', label: 'Title agent' },
  { value: 'other', label: 'Other' },
];

let nextId = 1;

export function NewDealForm({
  action,
}: {
  action: (formData: FormData) => Promise<void> | void;
}) {
  const [kind, setKind] = useState<'buyer' | 'seller'>('buyer');
  const [extras, setExtras] = useState<ExtraRow[]>([]);

  const principal = kind === 'buyer' ? 'Buyer' : 'Seller';

  const addRow = () =>
    setExtras((p) => [...p, { id: nextId++, role: 'lender', name: '', email: '' }]);
  const removeRow = (id: number) =>
    setExtras((p) => p.filter((r) => r.id !== id));
  const update = (id: number, patch: Partial<ExtraRow>) =>
    setExtras((p) => p.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  return (
    <form action={action} className="mt-6 space-y-6">
      {/* ---- The file ---- */}
      <div className="space-y-4">
        <div>
          <label htmlFor="name" className="block text-sm font-medium">
            Deal name
          </label>
          <input
            id="name"
            name="name"
            required
            placeholder="Smith closing — 412 Maple Ave"
            className="input mt-1.5"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="kind" className="block text-sm font-medium">
              Which side is this file?
            </label>
            <select
              id="kind"
              name="kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as 'buyer' | 'seller')}
              className="input mt-1.5"
            >
              <option value="buyer">Buyer side</option>
              <option value="seller">Seller side</option>
            </select>
          </div>
          <div>
            <label htmlFor="phase" className="block text-sm font-medium">
              Starting stage
            </label>
            {/* Same starting point as a realtor-created deal. The guided
                phase transitions in the workspace (with their follow-up
                questions) take it from here — but a file that arrives already
                under contract can start there. */}
            <select
              id="phase"
              name="phase"
              defaultValue="searching"
              className="input mt-1.5"
            >
              <option value="searching">Home search (default)</option>
              <option value="under_contract">Already under contract</option>
              <option value="closing">Already closing</option>
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="address" className="block text-sm font-medium">
            Property address <span className="text-ink-400">(optional)</span>
          </label>
          <input
            id="address"
            name="address"
            placeholder="412 Maple Avenue, Johns Creek, GA"
            className="input mt-1.5"
          />
        </div>
      </div>

      {/* ---- The realtor who sent the file ---- */}
      <fieldset className="rounded-xl border border-ink-200 bg-ink-50/60 p-4">
        <legend className="px-1 text-sm font-semibold">
          The realtor who brought you this file
        </legend>
        <p className="mt-0.5 text-xs text-ink-500">
          Usually your actual client. They get full realtor access to the deal —
          free, no subscription needed. Skip if there's no agent involved.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <input
            name="realtor_name"
            placeholder="Realtor's name"
            className="input"
            aria-label="Realtor name"
          />
          <input
            name="realtor_email"
            type="email"
            placeholder="realtor@brokerage.com"
            className="input"
            aria-label="Realtor email"
          />
        </div>
      </fieldset>

      {/* ---- The realtor's client ---- */}
      <fieldset className="rounded-xl border border-ink-200 bg-ink-50/60 p-4">
        <legend className="px-1 text-sm font-semibold">
          The {principal.toLowerCase()}
        </legend>
        <p className="mt-0.5 text-xs text-ink-500">
          The realtor&apos;s client — they follow the whole deal from their own
          view: dates, documents you share, and messages. Optional.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <input
            name="principal_name"
            placeholder={`${principal}'s name`}
            className="input"
            aria-label={`${principal} name`}
          />
          <input
            name="principal_email"
            type="email"
            placeholder={
              kind === 'buyer' ? 'buyer@example.com' : 'seller@example.com'
            }
            className="input"
            aria-label={`${principal} email`}
          />
        </div>
      </fieldset>

      {/* ---- Everyone else ---- */}
      <fieldset>
        <legend className="text-sm font-semibold">Anyone else</legend>
        <p className="mt-0.5 text-xs text-ink-500">
          The other side&apos;s agent, the lender, title — add them now or from
          the deal later.
        </p>
        <div className="mt-3 space-y-3">
          {extras.map((row) => (
            <div key={row.id} className="flex items-start gap-2">
              <select
                name="party_role"
                value={row.role}
                onChange={(e) => update(row.id, { role: e.target.value })}
                className="input w-44 shrink-0"
                aria-label="Role"
              >
                {EXTRA_ROLES.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <input
                name="party_name"
                value={row.name}
                onChange={(e) => update(row.id, { name: e.target.value })}
                placeholder="Name"
                className="input flex-1"
                aria-label="Name"
              />
              <input
                name="party_email"
                value={row.email}
                onChange={(e) => update(row.id, { email: e.target.value })}
                placeholder="email@example.com"
                type="email"
                className="input flex-1"
                aria-label="Email"
              />
              <button
                type="button"
                onClick={() => removeRow(row.id)}
                aria-label="Remove person"
                className="mt-2 shrink-0 p-1 text-ink-400 hover:text-rose-600"
              >
                <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addRow}
          className="mt-3 text-sm font-semibold text-ink-700 hover:text-ink-900"
        >
          + Add a person
        </button>
      </fieldset>

      <div>
        <label htmlFor="notes" className="block text-sm font-medium">
          Notes <span className="text-ink-400">(optional, visible to you)</span>
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          placeholder="Anything worth remembering about this file."
          className="input mt-1.5"
        />
      </div>

      <Submit />
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      data-loading={pending ? 'true' : undefined}
      className="btn-primary w-full px-4 py-2.5 disabled:cursor-not-allowed"
    >
      {pending ? 'Creating deal & sending invites…' : 'Create deal & send invites →'}
    </button>
  );
}
