'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';

/**
 * The attorney's deal-intake form. Deliberately close to how a closing file
 * actually starts: which side, what property, who's involved. Party rows are
 * dynamic — most closings need a client + a realtor, some need a lender and
 * the other side's agent too.
 */

type PartyRow = { id: number; role: string; name: string; email: string };

const ROLE_OPTIONS = [
  { value: 'buyer', label: 'Buyer (client)' },
  { value: 'seller', label: 'Seller (client)' },
  { value: 'realtor', label: 'Realtor' },
  { value: 'co_realtor', label: "Other side's realtor" },
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
  const [parties, setParties] = useState<PartyRow[]>([
    { id: nextId++, role: 'buyer', name: '', email: '' },
    { id: nextId++, role: 'realtor', name: '', email: '' },
  ]);

  const addRow = () =>
    setParties((p) => [...p, { id: nextId++, role: 'other', name: '', email: '' }]);
  const removeRow = (id: number) =>
    setParties((p) => p.filter((r) => r.id !== id));
  const update = (id: number, patch: Partial<PartyRow>) =>
    setParties((p) => p.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  return (
    <form action={action} className="mt-6 space-y-5">
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
            Your client is the
          </label>
          <select
            id="kind"
            name="kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as 'buyer' | 'seller')}
            className="input mt-1.5"
          >
            <option value="buyer">Buyer</option>
            <option value="seller">Seller</option>
          </select>
        </div>
        <div>
          <label htmlFor="phase" className="block text-sm font-medium">
            Starting stage
          </label>
          <select
            id="phase"
            name="phase"
            defaultValue="under_contract"
            className="input mt-1.5"
          >
            <option value="searching">Pre-contract</option>
            <option value="under_contract">Under contract</option>
            <option value="closing">Closing</option>
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

      <fieldset>
        <legend className="text-sm font-semibold">People on this deal</legend>
        <p className="mt-0.5 text-xs text-ink-500">
          Each person gets an email invite with their own role-scoped view.
          Leave a row blank to skip it.
        </p>
        <div className="mt-3 space-y-3">
          {parties.map((row) => (
            <div key={row.id} className="flex items-start gap-2">
              <select
                name="party_role"
                value={row.role}
                onChange={(e) => update(row.id, { role: e.target.value })}
                className="input w-44 shrink-0"
                aria-label="Role"
              >
                {ROLE_OPTIONS.map((o) => (
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
          + Add another person
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
