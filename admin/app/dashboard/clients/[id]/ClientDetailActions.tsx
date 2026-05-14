'use client';

import { useState, useTransition } from 'react';
import {
  addHouseAction,
  addImportantDateAction,
  addParticipantAction,
  goUnderContractAction,
  linkDocusignAction,
  massInviteAction,
  quickMessageAction,
  removeParticipantAction,
  sendAlertAction,
  setAttorneyAction,
  updateDealFinancialsAction,
  updatePhaseAction,
  type PartyRole,
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
  | 'financials'
  | 'participant'
  | 'mass_invite'
  | 'under_contract';

const PHASES = [
  { id: 'searching', label: 'Searching' },
  { id: 'offer_made', label: 'Offer made' },
  { id: 'counter_offer', label: 'Counter offer' },
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
      <section className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50/50 p-5 shadow-sm">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
            Quick actions
          </h2>
          <span className="text-xs text-slate-400">
            Everything you can do for this deal
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          <ActionCard
            tone="blue"
            icon={<IconHouse />}
            title="Add house"
            subtitle="With photo or Zillow link"
            onClick={() => setOpen('house')}
          />
          <ActionCard
            tone="indigo"
            icon={<IconFlag />}
            title="Update phase"
            subtitle={phaseLabel(currentPhase)}
            onClick={() => setOpen('phase')}
          />
          <ActionCard
            tone="emerald"
            icon={<IconCalendar />}
            title="Important date"
            subtitle="Closing, appraisal, etc."
            onClick={() => setOpen('date')}
          />
          <ActionCard
            tone="amber"
            icon={<IconDollar />}
            title="Financials"
            subtitle="Price, earnest, commission"
            onClick={() => setOpen('financials')}
          />
          <ActionCard
            tone="violet"
            icon={<IconDocument />}
            title="Upload document"
            subtitle="PDFs, disclosures"
            href={`/dashboard/clients/${clientId}/upload`}
          />
          <ActionCard
            tone="orange"
            icon={<IconSignature />}
            title="DocuSign envelope"
            subtitle="Paste signing link"
            onClick={() => setOpen('docusign')}
          />
          <ActionCard
            tone="slate"
            icon={<IconBriefcase />}
            title="Attorney"
            subtitle="Add to this deal"
            onClick={() => setOpen('attorney')}
          />
          <ActionCard
            tone="emerald"
            icon={<IconUsers />}
            title="+ Party"
            subtitle="Buyer / seller / co-realtor / etc."
            onClick={() => setOpen('participant')}
          />
          <ActionCard
            tone="sky"
            icon={<IconMail />}
            title="Mass invite"
            subtitle="Paste many emails at once"
            onClick={() => setOpen('mass_invite')}
          />
          <ActionCard
            tone="rose"
            icon={<IconSparkle />}
            title="Go under contract"
            subtitle="Dates + contract + email all"
            onClick={() => setOpen('under_contract')}
          />
          <ActionCard
            tone="sky"
            icon={<IconMessage />}
            title="Quick message"
            subtitle="Send to your client"
            onClick={() => setOpen('message')}
          />
          <ActionCard
            tone="rose"
            icon={<IconAlert />}
            title="Send alert"
            subtitle="Urgent — pushes notification"
            onClick={() => setOpen('alert')}
          />
          <ActionCard
            tone="slate"
            icon={<IconInbox />}
            title="All messages"
            subtitle="Open thread list"
            href="/dashboard/messages"
          />
          <ActionCard
            tone="slate"
            icon={<IconRoute />}
            title="Tour requests"
            subtitle="Pending tours"
            href="/dashboard/tours"
          />
        </div>
      </section>

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
          title="Send a message"
          submitLabel="Send"
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
          title="Send an alert"
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

      {open === 'participant' && (
        <ParticipantModal
          onClose={close}
          onSubmit={async (payload) => {
            const r = await addParticipantAction(clientId, payload);
            if (!r.ok) return toast.show(r.error || 'Failed', { variant: 'error' });
            toast.show('Party added to deal.', { variant: 'success' });
            close();
          }}
        />
      )}

      {open === 'mass_invite' && (
        <MassInviteModal
          onClose={close}
          onSubmit={async (payload) => {
            const r = await massInviteAction(clientId, payload);
            if (!r.ok) return toast.show(r.error || 'Failed', { variant: 'error' });
            toast.show(
              'Invited ' + (r as any).added + ' people.',
              { variant: 'success' }
            );
            close();
          }}
        />
      )}

      {open === 'under_contract' && (
        <UnderContractModal
          onClose={close}
          onSubmit={async (payload) => {
            const r = await goUnderContractAction(clientId, payload);
            if (!r.ok) return toast.show(r.error || 'Failed', { variant: 'error' });
            toast.show('Under contract — every party was notified.', {
              variant: 'success',
            });
            close();
          }}
        />
      )}
    </>
  );
}

// -- Action card -----------------------------------------------------------

type Tone =
  | 'blue'
  | 'indigo'
  | 'emerald'
  | 'amber'
  | 'violet'
  | 'orange'
  | 'slate'
  | 'sky'
  | 'rose';

const TONE_STYLES: Record<
  Tone,
  { bg: string; ring: string; icon: string; iconBg: string }
> = {
  blue: {
    bg: 'hover:bg-blue-50',
    ring: 'hover:ring-blue-200',
    icon: 'text-blue-600',
    iconBg: 'bg-blue-100',
  },
  indigo: {
    bg: 'hover:bg-indigo-50',
    ring: 'hover:ring-indigo-200',
    icon: 'text-indigo-600',
    iconBg: 'bg-indigo-100',
  },
  emerald: {
    bg: 'hover:bg-emerald-50',
    ring: 'hover:ring-emerald-200',
    icon: 'text-emerald-600',
    iconBg: 'bg-emerald-100',
  },
  amber: {
    bg: 'hover:bg-amber-50',
    ring: 'hover:ring-amber-200',
    icon: 'text-amber-700',
    iconBg: 'bg-amber-100',
  },
  violet: {
    bg: 'hover:bg-violet-50',
    ring: 'hover:ring-violet-200',
    icon: 'text-violet-600',
    iconBg: 'bg-violet-100',
  },
  orange: {
    bg: 'hover:bg-orange-50',
    ring: 'hover:ring-orange-200',
    icon: 'text-orange-600',
    iconBg: 'bg-orange-100',
  },
  slate: {
    bg: 'hover:bg-slate-100',
    ring: 'hover:ring-slate-300',
    icon: 'text-slate-700',
    iconBg: 'bg-slate-200',
  },
  sky: {
    bg: 'hover:bg-sky-50',
    ring: 'hover:ring-sky-200',
    icon: 'text-sky-600',
    iconBg: 'bg-sky-100',
  },
  rose: {
    bg: 'hover:bg-rose-50',
    ring: 'hover:ring-rose-300',
    icon: 'text-rose-600',
    iconBg: 'bg-rose-100',
  },
};

function ActionCard({
  tone,
  icon,
  title,
  subtitle,
  onClick,
  href,
}: {
  tone: Tone;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onClick?: () => void;
  href?: string;
}) {
  const t = TONE_STYLES[tone];
  const cls =
    'group flex flex-col items-start gap-2 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm ring-1 ring-transparent transition ' +
    t.bg +
    ' ' +
    t.ring;
  const inner = (
    <>
      <span
        className={
          'flex h-9 w-9 items-center justify-center rounded-lg ' +
          t.iconBg +
          ' ' +
          t.icon
        }
      >
        {icon}
      </span>
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-slate-900">
          {title}
        </div>
        <div className="line-clamp-1 text-xs text-slate-500">{subtitle}</div>
      </div>
    </>
  );
  if (href)
    return (
      <a href={href} className={cls}>
        {inner}
      </a>
    );
  return (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}

function phaseLabel(p: string) {
  const map: Record<string, string> = {
    searching: 'Searching',
    offer_made: 'Offer made',
    under_contract: 'Under contract',
    closing: 'Closing',
    closed: 'Closed',
  };
  return 'Currently: ' + (map[p] || p);
}

// -- icons (inline svg, no extra dependency) -------------------------------

function IconHouse() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11l9-8 9 8" />
      <path d="M5 10v10h14V10" />
      <path d="M9 21v-6h6v6" />
    </svg>
  );
}
function IconFlag() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 22V4h13l-2 4 2 4H4" />
    </svg>
  );
}
function IconCalendar() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18" />
    </svg>
  );
}
function IconDollar() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v20" />
      <path d="M17 6.5C17 4.6 14.8 3 12 3S7 4.6 7 6.5 9.2 10 12 10s5 1.6 5 3.5S14.8 17 12 17s-5-1.6-5-3.5" />
    </svg>
  );
}
function IconDocument() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}
function IconSignature() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 17c4 1 9-5 13-1 2 2 5 0 5 0" />
      <path d="M3 21h18" />
    </svg>
  );
}
function IconBriefcase() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}
function IconMessage() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11a9 9 0 1 1-3.5-7L21 3v8z" />
      <path d="M8 11h.01M12 11h.01M16 11h.01" />
    </svg>
  );
}
function IconAlert() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}
function IconInbox() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z" />
    </svg>
  );
}
function IconMail() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}
function IconSparkle() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" />
    </svg>
  );
}
function IconUsers() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
function IconRoute() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="19" r="3" />
      <path d="M9 19h8.5a3.5 3.5 0 0 0 0-7H6.5a3.5 3.5 0 0 1 0-7H15" />
      <circle cx="18" cy="5" r="3" />
    </svg>
  );
}

// -- Modal shell ----------------------------------------------------------

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
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <button
            onClick={onClose}
            className="-mr-1.5 rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function PrimaryButton({
  pending,
  disabled,
  onClick,
  children,
  variant,
}: {
  pending: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  variant?: 'danger';
}) {
  return (
    <button
      type="button"
      disabled={pending || disabled}
      onClick={onClick}
      className={
        'mt-5 inline-flex w-full items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50 ' +
        (variant === 'danger'
          ? 'bg-rose-600 hover:bg-rose-700'
          : 'bg-slate-900 hover:bg-slate-700')
      }
    >
      {pending ? 'Saving…' : children}
    </button>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block text-sm">
      <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1 text-[11px] text-slate-400">{hint}</p>}
    </label>
  );
}

const inputCls =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm transition focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10';

// -- Specific modals ------------------------------------------------------

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
        {PHASES.map((p) => {
          const selected = phase === p.id;
          return (
            <label
              key={p.id}
              className={
                'flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition ' +
                (selected
                  ? 'border-slate-900 bg-slate-50 ring-1 ring-slate-900'
                  : 'border-slate-200 hover:bg-slate-50')
              }
            >
              <input
                type="radio"
                name="phase"
                className="accent-slate-900"
                value={p.id}
                checked={selected}
                onChange={() => setPhase(p.id)}
              />
              <span className="font-medium text-slate-800">{p.label}</span>
              {p.id === currentPhase && (
                <span className="ml-auto text-[10px] font-bold uppercase tracking-wide text-slate-400">Current</span>
              )}
            </label>
          );
        })}
      </div>
      <PrimaryButton pending={pending} onClick={() => start(() => onSubmit(phase))}>
        Save phase
      </PrimaryButton>
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
  const [importing, setImporting] = useState(false);
  const toast = useToast();
  const supabase = getSupabaseBrowserClient();

  async function importFromUrl() {
    if (!listingUrl) return;
    setImporting(true);
    try {
      const r = await fetch('/api/url/preview', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: listingUrl }),
      });
      if (!r.ok) {
        toast.show('Could not read that listing.', { variant: 'error' });
        return;
      }
      const j = await r.json();
      if (j.image && !photoUrl) setPhotoUrl(j.image);
      if (j.title && !address) setAddress(j.title);
      if (j.description && !notes) setNotes(j.description);
      toast.show('Imported.', { variant: 'success' });
    } finally {
      setImporting(false);
    }
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
      <div className="space-y-4">
        <Field label="Address">
          <input
            className={inputCls}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="123 Main St, Atlanta GA"
          />
        </Field>
        <Field label="Listing URL" hint="Zillow, Redfin, Realtor.com — we'll auto-pull title, photo, and description">
          <div className="flex gap-2">
            <input
              className={inputCls + ' flex-1'}
              value={listingUrl}
              onChange={(e) => setListingUrl(e.target.value)}
              placeholder="https://www.zillow.com/homedetails/…"
            />
            <button
              type="button"
              onClick={importFromUrl}
              disabled={importing || !listingUrl}
              className="rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white shadow-sm disabled:opacity-50"
            >
              {importing ? '…' : 'Import'}
            </button>
          </div>
        </Field>
        <Field label="Photo">
          <div className="flex items-center gap-3">
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoUrl}
                alt="house"
                className="h-16 w-20 rounded-lg object-cover ring-1 ring-slate-200"
              />
            ) : (
              <div className="flex h-16 w-20 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-[10px] text-slate-400">
                No photo
              </div>
            )}
            <label className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold shadow-sm transition hover:bg-slate-50">
              {uploadingPhoto ? 'Uploading…' : photoUrl ? 'Replace photo' : 'Upload photo'}
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
            className={inputCls + ' mt-2 text-xs'}
            value={photoUrl}
            onChange={(e) => setPhotoUrl(e.target.value)}
            placeholder="…or paste a photo URL"
          />
        </Field>
        <Field label="List price (USD)">
          <input
            type="number"
            className={inputCls}
            value={listPrice}
            onChange={(e) => setListPrice(e.target.value)}
          />
        </Field>
        <Field label="Notes">
          <textarea
            className={inputCls}
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Why is this a fit, what to flag, etc."
          />
        </Field>
      </div>
      <PrimaryButton
        pending={pending}
        disabled={!address}
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
      >
        Add house
      </PrimaryButton>
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
      <div className="space-y-3">
        <Field label="Type">
          <select
            className={inputCls}
            value={preset}
            onChange={(e) => setPreset(e.target.value)}
          >
            {DATE_PRESETS.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </Field>
        {preset === 'Custom' && (
          <Field label="Custom label">
            <input
              className={inputCls}
              value={customLabel}
              onChange={(e) => setCustomLabel(e.target.value)}
              placeholder="e.g. HOA approval deadline"
            />
          </Field>
        )}
        <Field label="Date">
          <input
            type="date"
            className={inputCls}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
      </div>
      <PrimaryButton
        pending={pending}
        disabled={!date || (preset === 'Custom' && !customLabel)}
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
      >
        Save date
      </PrimaryButton>
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
      <Field label="Envelope URL" hint="Paste from DocuSign — the link will appear at the top of this client's deal">
        <input
          className={inputCls}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://app.docusign.com/documents/…"
        />
      </Field>
      <PrimaryButton
        pending={pending}
        disabled={!url}
        onClick={() => start(() => onSubmit(url.trim()))}
      >
        Save envelope
      </PrimaryButton>
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
    <Modal title="Add attorney" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Name">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Email">
          <input
            type="email"
            className={inputCls}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Phone">
          <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
      </div>
      <PrimaryButton
        pending={pending}
        disabled={!name}
        onClick={() =>
          start(() =>
            onSubmit({
              name: name.trim(),
              email: email.trim() || undefined,
              phone: phone.trim() || undefined,
            })
          )
        }
      >
        Save attorney
      </PrimaryButton>
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
      <Field label={danger ? 'Alert message' : 'Message'}>
        <textarea
          rows={5}
          className={inputCls}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={placeholder}
        />
      </Field>
      <PrimaryButton
        pending={pending}
        disabled={!body.trim()}
        variant={danger ? 'danger' : undefined}
        onClick={() => start(() => onSubmit(body))}
      >
        {submitLabel}
      </PrimaryButton>
    </Modal>
  );
}

const PARTY_ROLES: { id: PartyRole; label: string; helper: string }[] = [
  { id: 'buyer', label: 'Buyer', helper: 'Second buyer (spouse, partner, co-purchaser)' },
  { id: 'seller', label: 'Seller', helper: 'For listing-side deals' },
  { id: 'co_realtor', label: 'Co-realtor', helper: 'Another agent on your firm' },
  { id: 'attorney', label: 'Attorney', helper: 'Closing / real-estate counsel' },
  { id: 'inspector', label: 'Inspector', helper: 'Property inspector' },
  { id: 'lender', label: 'Lender', helper: 'Mortgage lender' },
  { id: 'mortgage_broker', label: 'Mortgage broker', helper: 'Loan broker' },
  { id: 'appraiser', label: 'Appraiser', helper: 'Home appraiser' },
  { id: 'title_agent', label: 'Title agent', helper: 'Title insurance / escrow' },
  { id: 'other', label: 'Other', helper: 'Anyone else on the deal' },
];

function ParticipantModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (payload: {
    role: PartyRole;
    name?: string;
    email?: string;
    phone?: string;
    can_view_documents?: boolean;
    can_view_financials?: boolean;
    can_view_messages?: boolean;
    can_view_dates?: boolean;
  }) => Promise<void>;
}) {
  const [role, setRole] = useState<PartyRole>('buyer');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [docs, setDocs] = useState(true);
  const [fin, setFin] = useState(false);
  const [msgs, setMsgs] = useState(false);
  const [dates, setDates] = useState(true);
  const [pending, start] = useTransition();

  return (
    <Modal title="Add a party to this deal" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Role">
          <select
            className={inputCls}
            value={role}
            onChange={(e) => setRole(e.target.value as PartyRole)}
          >
            {PARTY_ROLES.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-slate-400">
            {PARTY_ROLES.find((r) => r.id === role)?.helper}
          </p>
        </Field>
        <Field label="Name">
          <input
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full name"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Email" hint="Used to grant deal access if they sign in">
            <input
              type="email"
              className={inputCls}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="Phone">
            <input
              className={inputCls}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </Field>
        </div>

        <fieldset className="rounded-lg border border-slate-200 p-3">
          <legend className="px-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            What this party can see
          </legend>
          <div className="space-y-1.5">
            <CheckRow label="Important dates" checked={dates} onChange={setDates} />
            <CheckRow label="Documents" checked={docs} onChange={setDocs} />
            <CheckRow label="Financials" checked={fin} onChange={setFin} />
            <CheckRow label="Messages" checked={msgs} onChange={setMsgs} />
          </div>
        </fieldset>
      </div>
      <PrimaryButton
        pending={pending}
        disabled={!name && !email}
        onClick={() =>
          start(() =>
            onSubmit({
              role,
              name: name.trim() || undefined,
              email: email.trim() || undefined,
              phone: phone.trim() || undefined,
              can_view_documents: docs,
              can_view_financials: fin,
              can_view_messages: msgs,
              can_view_dates: dates,
            })
          )
        }
      >
        Add party
      </PrimaryButton>
    </Modal>
  );
}

function CheckRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 rounded px-1 py-1 text-sm hover:bg-slate-50">
      <input
        type="checkbox"
        className="h-4 w-4 accent-slate-900"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

export function ParticipantList({
  clientId,
  participants,
}: {
  clientId: string;
  participants: Array<{
    id: string;
    role: string;
    external_name: string | null;
    external_email: string | null;
    external_phone: string | null;
    can_view_documents: boolean;
    can_view_financials: boolean;
    can_view_messages: boolean;
    can_view_dates: boolean;
  }>;
}) {
  const toast = useToast();
  const [removing, start] = useTransition();
  if (participants.length === 0) {
    return (
      <p className="mt-3 text-xs italic text-slate-500">
        No extra parties. Use "+ Party" above to add a buyer's spouse,
        attorney, inspector, lender, etc.
      </p>
    );
  }
  return (
    <ul className="mt-3 space-y-2">
      {participants.map((p) => (
        <li
          key={p.id}
          className="rounded-lg border border-slate-200 bg-white p-3"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700">
                  {p.role.replace(/_/g, ' ')}
                </span>
                <span className="truncate text-sm font-semibold">
                  {p.external_name || p.external_email || '—'}
                </span>
              </div>
              {p.external_email && (
                <a
                  href={'mailto:' + p.external_email}
                  className="block text-xs text-blue-600 hover:underline"
                >
                  {p.external_email}
                </a>
              )}
              {p.external_phone && (
                <a
                  href={'tel:' + p.external_phone}
                  className="block text-xs text-blue-600 hover:underline"
                >
                  {p.external_phone}
                </a>
              )}
              <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-slate-500">
                {p.can_view_dates && <Chip>Dates</Chip>}
                {p.can_view_documents && <Chip>Docs</Chip>}
                {p.can_view_financials && <Chip>Financials</Chip>}
                {p.can_view_messages && <Chip>Messages</Chip>}
              </div>
            </div>
            <button
              type="button"
              disabled={removing}
              onClick={() =>
                start(async () => {
                  const r = await removeParticipantAction(clientId, p.id);
                  if (!r.ok)
                    return toast.show(r.error || 'Failed', { variant: 'error' });
                  toast.show('Removed.', { variant: 'success' });
                })
              }
              className="rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-rose-600"
              aria-label="Remove participant"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold uppercase tracking-wide">
      {children}
    </span>
  );
}

function UnderContractModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (p: {
    binding_date?: string | null;
    earnest_money_due?: string | null;
    earnest_money_amount?: number | null;
    due_diligence_end?: string | null;
    closing_date?: string | null;
    contract_url?: string | null;
    message?: string;
  }) => Promise<void>;
}) {
  const [binding, setBinding] = useState('');
  const [earnest, setEarnest] = useState('');
  const [earnestAmt, setEarnestAmt] = useState('');
  const [diligence, setDiligence] = useState('');
  const [closing, setClosing] = useState('');
  const [contract, setContract] = useState('');
  const [msg, setMsg] = useState('');
  const [pending, start] = useTransition();
  return (
    <Modal title="Going under contract" onClose={onClose}>
      <p className="mb-3 text-xs text-slate-500">
        We'll save these dates, store the contract, move the phase, and email
        every party on the deal automatically.
      </p>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Binding agreement">
            <input type="date" className={inputCls} value={binding} onChange={(e) => setBinding(e.target.value)} />
          </Field>
          <Field label="Earnest money due">
            <input type="date" className={inputCls} value={earnest} onChange={(e) => setEarnest(e.target.value)} />
          </Field>
          <Field label="Earnest amount (USD)">
            <input type="number" className={inputCls} value={earnestAmt} onChange={(e) => setEarnestAmt(e.target.value)} placeholder="5000" />
          </Field>
          <Field label="Due diligence ends">
            <input type="date" className={inputCls} value={diligence} onChange={(e) => setDiligence(e.target.value)} />
          </Field>
          <Field label="Closing day">
            <input type="date" className={inputCls} value={closing} onChange={(e) => setClosing(e.target.value)} />
          </Field>
        </div>
        <Field label="Contract URL (PDF link or DocuSign)" hint="Anyone on the deal can click through to it from their email.">
          <input type="url" className={inputCls} value={contract} onChange={(e) => setContract(e.target.value)} />
        </Field>
        <Field label="Note to everyone (optional)">
          <textarea rows={3} className={inputCls} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="A line that appears in the email to all parties." />
        </Field>
      </div>
      <PrimaryButton
        pending={pending}
        onClick={() =>
          start(() =>
            onSubmit({
              binding_date: binding || null,
              earnest_money_due: earnest || null,
              earnest_money_amount: earnestAmt ? Number(earnestAmt) : null,
              due_diligence_end: diligence || null,
              closing_date: closing || null,
              contract_url: contract.trim() || null,
              message: msg.trim() || undefined,
            })
          )
        }
      >
        Move to Under Contract & notify everyone
      </PrimaryButton>
    </Modal>
  );
}

function MassInviteModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (p: { emails: string; role: PartyRole }) => Promise<void>;
}) {
  const [emails, setEmails] = useState('');
  const [role, setRole] = useState<PartyRole>('buyer');
  const [pending, start] = useTransition();
  return (
    <Modal title="Mass invite to this deal" onClose={onClose}>
      <Field label="Role for everyone">
        <select className={inputCls} value={role} onChange={(e) => setRole(e.target.value as PartyRole)}>
          {PARTY_ROLES.map((r) => (
            <option key={r.id} value={r.id}>{r.label}</option>
          ))}
        </select>
      </Field>
      <Field label="Emails" hint="One per line — or paste comma/space-separated. We dedupe + validate.">
        <textarea
          rows={6}
          className={inputCls}
          value={emails}
          onChange={(e) => setEmails(e.target.value)}
          placeholder={'alice@example.com\nbob@example.com\ncharlie@example.com'}
        />
      </Field>
      <PrimaryButton
        pending={pending}
        disabled={!emails.trim()}
        onClick={() => start(() => onSubmit({ emails, role }))}
      >
        Invite everyone
      </PrimaryButton>
    </Modal>
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
  const [agreed, setAgreed] = useState(initial.agreed_price != null ? String(initial.agreed_price) : '');
  const [closing, setClosing] = useState(initial.closing_amount != null ? String(initial.closing_amount) : '');
  const [earnest, setEarnest] = useState(initial.earnest_money != null ? String(initial.earnest_money) : '');
  const [commission, setCommission] = useState(initial.commission_pct != null ? String(initial.commission_pct) : '');
  const [contractUrl, setContractUrl] = useState(initial.contract_url || '');
  const [notes, setNotes] = useState(initial.notes || '');
  const [pending, start] = useTransition();
  const num = (s: string) => (s.trim() === '' ? null : Number(s));

  return (
    <Modal title="Financials & contract" onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Agreed price">
            <input type="number" className={inputCls} value={agreed} onChange={(e) => setAgreed(e.target.value)} placeholder="485000" />
          </Field>
          <Field label="Closing">
            <input type="number" className={inputCls} value={closing} onChange={(e) => setClosing(e.target.value)} />
          </Field>
          <Field label="Earnest money">
            <input type="number" className={inputCls} value={earnest} onChange={(e) => setEarnest(e.target.value)} />
          </Field>
          <Field label="Commission %">
            <input type="number" step="0.01" className={inputCls} value={commission} onChange={(e) => setCommission(e.target.value)} placeholder="2.5" />
          </Field>
        </div>
        <Field label="Contract URL" hint="Link to signed PDF or DocuSign envelope">
          <input type="url" className={inputCls} value={contractUrl} onChange={(e) => setContractUrl(e.target.value)} />
        </Field>
        <Field label="Internal notes" hint="Visible only to your firm — clients can't see this">
          <textarea rows={3} className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
      <PrimaryButton
        pending={pending}
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
      >
        Save deal details
      </PrimaryButton>
    </Modal>
  );
}
