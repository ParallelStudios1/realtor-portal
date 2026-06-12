'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { useToast } from '@/components/Toast';
import {
  addFirmContactAction,
  deleteFirmContactAction,
  updateFirmContactAction,
} from './actions';

type FirmContact = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  company: string | null;
  notes: string | null;
};

const ROLE_OPTIONS = [
  'realtor',
  'attorney',
  'lender',
  'inspector',
  'photographer',
  'contractor',
  'assistant',
  'other',
] as const;

/**
 * Top-right "Add contact" button. Mounted in the page header so it sits
 * next to the search bar without re-rendering the contacts list.
 */
export function AddContactButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-primary text-xs"
      >
        <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M10 4v12M4 10h12" strokeLinecap="round" />
        </svg>
        Add contact
      </button>
      {open && (
        <ContactFormModal
          mode="create"
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

/**
 * Each manual firm_contact card has an Edit + Delete control. Both live
 * in a tiny menu so they don't clutter the row.
 */
export function ManualContactControls({ contact }: { contact: FirmContact }) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();

  const onDelete = () => {
    start(async () => {
      const r = await deleteFirmContactAction(contact.id);
      if (!r.ok) {
        toast.show(r.error || 'Failed to delete contact.', { variant: 'error' });
        return;
      }
      toast.show('Contact removed.', { variant: 'success' });
      setConfirming(false);
      router.refresh();
    });
  };

  return (
    <>
      <div className="mt-3 flex items-center gap-2 border-t border-ink-100 pt-2">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-[11px] font-semibold text-ink-600 hover:text-ink-900"
        >
          Edit
        </button>
        <span className="text-ink-300">·</span>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="text-[11px] font-semibold text-red-600 hover:text-red-700"
        >
          Remove
        </button>
      </div>
      {editing && (
        <ContactFormModal
          mode="edit"
          initial={contact}
          onClose={() => setEditing(false)}
        />
      )}
      {confirming &&
        typeof document !== 'undefined' &&
        createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-soft-lg">
            <h3 className="text-base font-bold">Remove this contact?</h3>
            <p className="mt-1 text-sm text-ink-600">
              This only removes them from your firm's address book. Anyone
              on an actual deal won't be affected.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={pending}
                className="btn-secondary text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onDelete}
                disabled={pending}
                className="rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {pending ? 'Removing…' : 'Remove'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

/** Shared create/edit modal. Same form, different submit handler. */
function ContactFormModal({
  mode,
  initial,
  onClose,
}: {
  mode: 'create' | 'edit';
  initial?: FirmContact;
  onClose: () => void;
}) {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    start(async () => {
      const r =
        mode === 'create'
          ? await addFirmContactAction(form)
          : await updateFirmContactAction(initial!.id, form);
      if (!r.ok) {
        toast.show(r.error || 'Failed to save contact.', { variant: 'error' });
        return;
      }
      toast.show(mode === 'create' ? 'Contact added.' : 'Contact updated.', {
        variant: 'success',
      });
      onClose();
      router.refresh();
    });
  };

  // Portal so the fixed overlay can't be trapped by transformed ancestors.
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-900/40 p-4 sm:items-center">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-soft-lg"
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-bold">
            {mode === 'create' ? 'Add a contact' : 'Edit contact'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-ink-500 hover:bg-ink-100"
            aria-label="Close"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <p className="text-xs text-ink-600">
          Anyone you want in your address book — a co-realtor at another firm,
          your lender, an inspector you trust, etc. They won't see the app
          unless you add them to a specific deal.
        </p>

        <div className="mt-4 grid gap-3">
          <Field label="Name">
            <input
              name="name"
              defaultValue={initial?.name ?? ''}
              className="input w-full"
              placeholder="Jane Smith"
              autoFocus={mode === 'create'}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Email">
              <input
                name="email"
                type="email"
                defaultValue={initial?.email ?? ''}
                className="input w-full"
                placeholder="jane@example.com"
              />
            </Field>
            <Field label="Phone">
              <input
                name="phone"
                type="tel"
                defaultValue={initial?.phone ?? ''}
                className="input w-full"
                placeholder="(555) 123-4567"
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Role">
              <select
                name="role"
                defaultValue={initial?.role ?? ''}
                className="input w-full"
              >
                <option value="">—</option>
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r[0].toUpperCase() + r.slice(1)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Company">
              <input
                name="company"
                defaultValue={initial?.company ?? ''}
                className="input w-full"
                placeholder="Acme Realty"
              />
            </Field>
          </div>
          <Field label="Notes">
            <textarea
              name="notes"
              defaultValue={initial?.notes ?? ''}
              rows={3}
              className="input w-full"
              placeholder="Best for waterfront listings. Prefers texts."
            />
          </Field>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="btn-secondary text-xs"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="btn-primary text-xs"
            data-loading={pending ? 'true' : undefined}
          >
            {pending
              ? mode === 'create'
                ? 'Adding…'
                : 'Saving…'
              : mode === 'create'
              ? 'Add contact'
              : 'Save changes'}
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-xs font-semibold text-ink-700">
      {label}
      <div className="mt-1 font-normal">{children}</div>
    </label>
  );
}
