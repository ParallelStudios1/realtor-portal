'use client';

import { useState, useTransition } from 'react';
import {
  addHouseAction,
  addImportantDateAction,
  linkDocusignAction,
  quickMessageAction,
  sendAlertAction,
  setAttorneyAction,
  updateDealFinancialsAction,
  updatePhaseAction,
} from './actions';
import { useToast } from '@/components/Toast';
import { getSupabaseBrowserClient } from '@/lib/supabaseBrowser';

type Teammate = { id: string; full_name: string | null; email: string | null };

type Action =
  | 'phase'
  | 'house'
  | 'date'
  | 'docusign'
  | 'attorney'
  | 'message'
  | 'alert'
  | 'financials';

const PHASES = [
  { id: 'searching', label: 'Searching' },
  { id: 'offer_made', label: 'Offer made' },
  { id: 'under_contract', label: 'Under contract' },
  { id: 'closing', label: 'Closing' },
  { id: 'closed', label: 'Closed' },
] as const;

const DATE_PRESETS = [
  'Closing day',
  'Appraisal due',
  'Inspection',
  'Earnest money due',
  'Mortgage commitment',
  'Final walkthrough',
  'Open house',
  'Custom',
];

export function ClientDetailActions({
  clientId,
  firmId,
  searchId,
  currentPhase,
  financials,
  teammates,
}: {
  clientId: string;
  firmId: string;
  searchId: string;
  currentPhase: string;
  financials: {
    agreed_price: number | null;
    closing_amount: number | null;
    earnest_money: number | null;
    commission_pct: number | null;
    contract_url: string | null;
    notes: string | null;
  };
  teammates: Teammate[];
}) {
  const [open, setOpen] = useState<Action | null>(null);
  const toast = useToast();

  function close() {
    setOpen(null);
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <ActionButton label="+ Add house" onClick={() => setOpen('house')} />
        <ActionButton label="Update phase" onClick={() => setOpen('phase')} />
        <ActionButton label="+ Important date" onClick={() => setOpen('date')} />
        <ActionButton
          label="$ Financials / Contract"
          onClick={() => setOpen('financials')}
        />
        <ActionButton
          label="+ Document"
          href={`/dashboard/clients/${clientId}/upload`}
        />
        <ActionButton
          label="+ DocuSign envelope"
          onClick={() => setOpen('docusign')}
        />
        <ActionButton label="+ Attorney" onClick={() => setOpen('attorney')} />
        <ActionButton label="Quick message" onClick={() => setOpen('message')} />
        <ActionButton
          label="Send alert"
          onClick={() => setOpen('alert')}
          variant="danger"
        />
        <ActionButton label="Open messages" href="/dashboard/messages" />
        <ActionButton label="View tours" href="/dashboard/tours" />
      </div>

      {open === 'phase' && (
        <PhaseModal
          currentPhase={currentPhase}
          onClose={close}
          onSubmit={async (phase) => {
            const r = await updatePhaseAction(clientId, phase as any);
            if (!r.ok) return toast.show(r.error || 'Failed', { variant: 'error' });
            toast.show('Phase updated.', { variant: 'success' });
            close();
          }}
        />
      )}

      {open === 'house' && (
        <HouseModal
          firmId={firmId}
          onClose={close}
          onSubmit={async (payload) => {
            const r = await addHouseAction(clientId, payload);
            if (!r.ok) return toast.show(r.error || 'Failed', { variant: 'error' });
            toast.show('House added.', { variant: 'success' });
            close();
          }}
        />
      )}

      {open === 'financials' && (
        <FinancialsModal
          initial={financials}
          onClose={close}
          onSubmit={async (payload) => {
            const r = await updateDealFinancialsAction(clientId, payload);
            if (!r.ok) return toast.show(r.error || 'Failed', { variant: 'error' });
            toast.show('Deal updated.', { variant: 'success' });
            close();
          }}
        />
      )}

      {open === 'date' && (
        <DateModal
          onClose={close}
          onSubmit={async (payload) => {
            const r = await addImportantDateAction(clientId, payload);
            if (!r.ok) return toast.show(r.error || 'Failed', { variant: 'error' });
            toast.show('Date saved.', { variant: 'success' });
            close();
          }}
        />
      )}

      {open === 'docusign' && (
        <DocusignModal
          onClose={close}
          onSubmit={async (url) => {
            const r = await linkDocusignAction(clientId, url);
            if (!r.ok) return toast.show(r.error || 'Failed', { variant: 'error' });
            toast.show('DocuSign link saved.', { variant: 'success' });
            close();
          }}
        />
      )}

      {open === 'attorney' && (
        <AttorneyModal
          onClose={close}
          onSubmit={async (payload) => {
            const r = await setAttorneyAction(clientId, payload);
            if (!r.ok) return toast.show(r.error || 'Failed', { variant: 'error' });
            toast.show('Attorney saved.', { variant: 'success' });
            close();
          }}
        />
      )}

      {open === 'message' && (
        <MessageModal
          title="Quick message"
          submitLabel="Send message"
          placeholder="Type a message…"
          onClose={close}
          onSubmit={async (body) => {
            const r = await quickMessageAction(clientId, body);
            if (!r.ok) return toast.show(r.error || 'Failed', { variant: 'error' });
            toast.show('Message sent.', { variant: 'success' });
            close();
          }}
        />
      )}

      {open === 'alert' && (
        <MessageModal
          title="Send alert"
          submitLabel="Send alert"
          placeholder="Urgent update for the client…"
          danger
          onClose={close}
          onSubmit={async (body) => {
            const r = await sendAlertAction(clientId, body);
            if (!r.ok) return toast.show(r.error || 'Failed', { variant: 'error' });
            toast.show('Alert delivered.', { variant: 'success' });
            close();
          }}
        />
      )}
    </>
  );
}

// -- helpers --------------------------------------------------------------

function ActionButton({
  label,
  onClick,
  href,
  variant,
}: {
  label: string;
  onClick?: () => void;
  href?: string;
  variant?: 'danger';
}) {
  const cls =
    'rounded-md border px-3 py-1.5 text-xs font-semibold transition ' +
    (variant === 'danger'
      ? 'border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100'
      : 'border-slate-300 bg-white text-slate-800 hover:border-slate-400 hover:bg-slate-50');
  if (href)
    return (
      <a href={href} className={cls}>
        {label}
      </a>
    );
  return (
    <button type="button" onClick={onClick} className={cls}>
      {label}
    </button>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h3 className="font-semibold">{title}</h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function PhaseModal({
  currentPhase,
  onClose,
  onSubmit,
}: {
  currentPhase: string;
  onClose: () => void;
  onSubmit: (phase: string) => Promise<void>;
}) {
  const [phase, setPhase] = useState(currentPhase);
  const [pending, start] = useTransition();
  return (
    <Modal title="Update deal phase" onClose={onClose}>
      <div className="space-y-2">
        {PHASES.map((p) => (
          <label
            key={p.id}
            className={
              'flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ' +
              (phase === p.id
                ? 'border-blue-600 bg-blue-50'
                : 'border-slate-200 hover:bg-slate-50')
            }
          >
            <input
              type="radio"
              name="phase"
              value={p.id}
              checked={phase === p.id}
              onChange={() => setPhase(p.id)}
            />
            <span>{p.label}</span>
          </label>
        ))}
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={() => start(() => onSubmit(phase))}
        className="mt-4 w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {pending ? 'Saving…' : 'Save phase'}
      </button>
    </Modal>
  );
}

function HouseModal({
  firmId,
  onClose,
  onSubmit,
}: {
  firmId: string;
  onClose: () => void;
  onSubmit: (payload: {
    address: string;
    list_price?: number | null;
    listing_url?: string | null;
    photo_url?: string | null;
    notes?: string | null;
  }) => Promise<void>;
}) {
  const [address, setAddress] = useState('');
  const [listPrice, setListPrice] = useState('');
  const [listingUrl, setListingUrl] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [pending, start] = useTransition();
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const toast = useToast();
  const supabase = getSupabaseBrowserClient();

  async function importFromUrl() {
    if (!listingUrl) return;
    try {
      const r = await fetch('/api/url/preview', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: listingUrl }),
      });
      if (!r.ok) return;
      const j = await r.json();
      if (j.image && !photoUrl) setPhotoUrl(j.image);
      if (j.title && !address) setAddress(j.title);
      if (j.description && !notes) setNotes(j.description);
    } catch {}
  }

  async function uploadPhotoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const path = `${firmId}/houses/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage
        .from('house-photos')
        .upload(path, file, { upsert: false });
      if (upErr) {
        toast.show('Photo upload failed: ' + upErr.message, { variant: 'error' });
        return;
      }
      const { data: pub } = supabase.storage.from('house-photos').getPublicUrl(path);
      if (pub?.publicUrl) setPhotoUrl(pub.publicUrl);
    } finally {
      setUploadingPhoto(false);
    }
  }

  return (
    <Modal title="Add a house" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Address">
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="123 Main St, Atlanta GA"
          />
        </Field>
        <Field label="Listing URL (Zillow, Redfin, etc.)">
          <div className="flex gap-2">
            <input
              className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={listingUrl}
              onChange={(e) => setListingUrl(e.target.value)}
              placeholder="https://www.zillow.com/homedetails/..."
            />
            <button
              type="button"
              onClick={importFromUrl}
              className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold hover:bg-slate-50"
            >
              Import
            </button>
          </div>
        </Field>
        <Field label="List price (USD)">
          <input
            type="number"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={listPrice}
            onChange={(e) => setListPrice(e.target.value)}
          />
        </Field>
        <Field label="Photo">
          <div className="flex items-center gap-3">
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoUrl}
                alt="house"
                className="h-16 w-20 rounded-md object-cover"
              />
            ) : (
              <div className="flex h-16 w-20 items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50 text-[10px] text-slate-400">
                No photo
              </div>
            )}
            <label className="cursor-pointer rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-slate-50">
              {uploadingPhoto ? 'Uploading…' : photoUrl ? 'Replace' : 'Upload'}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={uploadPhotoFile}
                disabled={uploadingPhoto}
              />
            </label>
          </div>
          <input
            type="url"
            className="mt-2 w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs"
            value={photoUrl}
            onChange={(e) => setPhotoUrl(e.target.value)}
            placeholder="…or paste a photo URL"
          />
        </Field>
        <Field label="Notes">
          <textarea
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
      </div>
      <button
        type="button"
        disabled={pending || !address}
        onClick={() =>
          start(() =>
            onSubmit({
              address: address.trim(),
              list_price: listPrice ? Number(listPrice) : null,
              listing_url: listingUrl.trim() || null,
              photo_url: photoUrl.trim() || null,
              notes: notes.trim() || null,
            })
          )
        }
        className="mt-4 w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {pending ? 'Adding…' : 'Add house'}
      </button>
    </Modal>
  );
}

function DateModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (payload: {
    label: string;
    date: string;
    kind?: string;
  }) => Promise<void>;
}) {
  const [preset, setPreset] = useState(DATE_PRESETS[0]);
  const [customLabel, setCustomLabel] = useState('');
  const [date, setDate] = useState('');
  const [pending, start] = useTransition();
  return (
    <Modal title="Add an important date" onClose={onClose}>
      <Field label="Type">
        <select
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          value={preset}
          onChange={(e) => setPreset(e.target.value)}
        >
          {DATE_PRESETS.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </Field>
      {preset === 'Custom' && (
        <Field label="Label">
          <input
            className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={customLabel}
            onChange={(e) => setCustomLabel(e.target.value)}
          />
        </Field>
      )}
      <Field label="Date">
        <input
          type="date"
          className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </Field>
      <button
        type="button"
        disabled={pending || !date || (preset === 'Custom' && !customLabel)}
        onClick={() =>
          start(() =>
            onSubmit({
              label: preset === 'Custom' ? customLabel : preset,
              date,
              kind:
                preset === 'Closing day'
                  ? 'closing'
                  : preset === 'Appraisal due'
                  ? 'appraisal'
                  : preset === 'Inspection'
                  ? 'inspection'
                  : 'custom',
            })
          )
        }
        className="mt-4 w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {pending ? 'Saving…' : 'Save date'}
      </button>
    </Modal>
  );
}

function DocusignModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (url: string) => Promise<void>;
}) {
  const [url, setUrl] = useState('');
  const [pending, start] = useTransition();
  return (
    <Modal title="Link a DocuSign envelope" onClose={onClose}>
      <p className="text-xs text-slate-500">
        Paste the DocuSign envelope URL you sent the client. The button will
        appear at the top of this client's deal so you can jump to it.
      </p>
      <input
        className="mt-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://app.docusign.com/documents/..."
      />
      <button
        type="button"
        disabled={pending || !url}
        onClick={() => start(() => onSubmit(url.trim()))}
        className="mt-4 w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {pending ? 'Saving…' : 'Save envelope'}
      </button>
    </Modal>
  );
}

function AttorneyModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (payload: {
    name: string;
    email?: string;
    phone?: string;
  }) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [pending, start] = useTransition();
  return (
    <Modal title="Add an attorney to this deal" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Name">
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Email">
          <input
            type="email"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Phone">
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </Field>
      </div>
      <button
        type="button"
        disabled={pending || !name}
        onClick={() =>
          start(() =>
            onSubmit({
              name: name.trim(),
              email: email.trim() || undefined,
              phone: phone.trim() || undefined,
            })
          )
        }
        className="mt-4 w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {pending ? 'Saving…' : 'Save attorney'}
      </button>
    </Modal>
  );
}

function MessageModal({
  title,
  submitLabel,
  placeholder,
  danger,
  onClose,
  onSubmit,
}: {
  title: string;
  submitLabel: string;
  placeholder: string;
  danger?: boolean;
  onClose: () => void;
  onSubmit: (body: string) => Promise<void>;
}) {
  const [body, setBody] = useState('');
  const [pending, start] = useTransition();
  return (
    <Modal title={title} onClose={onClose}>
      <textarea
        rows={5}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={placeholder}
      />
      <button
        type="button"
        disabled={pending || !body.trim()}
        onClick={() => start(() => onSubmit(body))}
        className={
          'mt-4 w-full rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ' +
          (danger
            ? 'bg-rose-600 hover:bg-rose-700'
            : 'bg-blue-600 hover:bg-blue-700')
        }
      >
        {pending ? 'Sending…' : submitLabel}
      </button>
    </Modal>
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
    <label className="block text-sm">
      <span className="block text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}

function FinancialsModal({
  initial,
  onClose,
  onSubmit,
}: {
  initial: {
    agreed_price: number | null;
    closing_amount: number | null;
    earnest_money: number | null;
    commission_pct: number | null;
    contract_url: string | null;
    notes: string | null;
  };
  onClose: () => void;
  onSubmit: (payload: {
    agreed_price?: number | null;
    closing_amount?: number | null;
    earnest_money?: number | null;
    commission_pct?: number | null;
    contract_url?: string | null;
    notes?: string | null;
  }) => Promise<void>;
}) {
  const [agreed, setAgreed] = useState(
    initial.agreed_price != null ? String(initial.agreed_price) : ''
  );
  const [closing, setClosing] = useState(
    initial.closing_amount != null ? String(initial.closing_amount) : ''
  );
  const [earnest, setEarnest] = useState(
    initial.earnest_money != null ? String(initial.earnest_money) : ''
  );
  const [commission, setCommission] = useState(
    initial.commission_pct != null ? String(initial.commission_pct) : ''
  );
  const [contractUrl, setContractUrl] = useState(initial.contract_url || '');
  const [notes, setNotes] = useState(initial.notes || '');
  const [pending, start] = useTransition();

  const num = (s: string) => (s.trim() === '' ? null : Number(s));

  return (
    <Modal title="Financials & contract" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Agreed price (USD)">
          <input
            type="number"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={agreed}
            onChange={(e) => setAgreed(e.target.value)}
            placeholder="e.g. 485000"
          />
        </Field>
        <Field label="Closing amount (USD)">
          <input
            type="number"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={closing}
            onChange={(e) => setClosing(e.target.value)}
          />
        </Field>
        <Field label="Earnest money (USD)">
          <input
            type="number"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={earnest}
            onChange={(e) => setEarnest(e.target.value)}
          />
        </Field>
        <Field label="Commission (%)">
          <input
            type="number"
            step="0.01"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={commission}
            onChange={(e) => setCommission(e.target.value)}
            placeholder="e.g. 2.5"
          />
        </Field>
        <Field label="Contract URL (optional)">
          <input
            type="url"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={contractUrl}
            onChange={(e) => setContractUrl(e.target.value)}
            placeholder="Link to signed PDF or DocuSign envelope"
          />
        </Field>
        <Field label="Internal notes">
          <textarea
            rows={3}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything the client shouldn't see — visible only to your firm"
          />
        </Field>
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(() =>
            onSubmit({
              agreed_price: num(agreed),
              closing_amount: num(closing),
              earnest_money: num(earnest),
              commission_pct: num(commission),
              contract_url: contractUrl.trim() || null,
              notes: notes.trim() || null,
            })
          )
        }
        className="mt-4 w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {pending ? 'Saving…' : 'Save deal details'}
      </button>
    </Modal>
  );
}
