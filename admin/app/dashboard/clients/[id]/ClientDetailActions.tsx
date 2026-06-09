'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import {
  addHouseAction,
  addImportantDateAction,
  addParticipantAction,
  createNewDealAction,
  goUnderContractAction,
  linkDocusignAction,
  massAddPartiesAction,
  massInviteAction,
  quickMessageAction,
  removeParticipantAction,
  sendPrivatePartyMessageAction,
  updateParticipantAction,
  searchFirmPeopleAction,
  sendAlertAction,
  setAttorneyAction,
  updateDealFinancialsAction,
  updatePhaseAction,
  type PartyRole,
} from './actions';
import { useToast } from '@/components/Toast';
import { getSupabaseBrowserClient } from '@/lib/supabaseBrowser';
import { defaultPartyPermissions } from '@/lib/partyPermissions';

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
  | 'under_contract'
  | 'new_deal';

const PHASES = [
  { id: 'searching', label: 'Searching' },
  { id: 'awaiting_offer', label: 'Awaiting offer' },
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
  searchId,
  currentPhase,
  dealKind,
  financials,
  teammates,
  houses,
}: {
  clientId: string;
  firmId: string;
  searchId: string;
  currentPhase: string;
  // The host deal's own side ('buyer' | 'seller' | 'both'). Used to default
  // the co-realtor "Represents" selector to the OPPOSITE side.
  dealKind?: string | null;
  financials: {
    agreed_price: number | null;
    closing_amount: number | null;
    earnest_money: number | null;
    commission_pct: number | null;
    contract_url: string | null;
    notes: string | null;
  };
  teammates: Teammate[];
  // The deal's houses — used by the under-contract "which house?" picker and
  // the convergence capture. Optional so legacy callers keep working.
  houses?: Array<{ id: string; address: string }>;
}) {
  const [open, setOpen] = useState<Action | null>(null);
  const toast = useToast();
  const router = useRouter();

  function close() {
    setOpen(null);
  }

  // Let other parts of the workspace (e.g. the seller-deal "Add your listing"
  // prompt) open the Add house modal by dispatching a window event.
  useEffect(() => {
    const handler = () => setOpen('house');
    window.addEventListener('rp:open-add-house', handler);
    return () => window.removeEventListener('rp:open-add-house', handler);
  }, []);
  // After a server action mutates, revalidatePath flushes the cache but the
  // visible client tree doesn't re-render unless we tell it to. Call this
  // after every successful mutation so the new participant / house / date /
  // doc / phase shows up immediately.
  function done(msg: string) {
    toast.show(msg, { variant: 'success' });
    close();
    router.refresh();
  }

  return (
    <>
      <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white p-5 shadow-soft sm:p-6">
        <div className="mb-5 flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink-900 text-white">
            <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" />
            </svg>
          </span>
          <div>
            <h2 className="text-base font-bold tracking-tight text-ink-900">
              Deal actions
            </h2>
            <p className="mt-0.5 text-xs text-ink-500">
              Everything you can do for this deal, grouped by what it affects.
            </p>
          </div>
        </div>

        <div className="space-y-6">
          <ActionGroup
            label="Deal Control"
            hint="Phase, financials, dates, and contract"
          >
            <ActionCard
              tone="indigo"
              icon={<IconFlag />}
              title="Update phase"
              subtitle={phaseLabel(currentPhase)}
              onClick={() => setOpen('phase')}
            />
            <ActionCard
              tone="rose"
              icon={<IconSparkle />}
              title="Go under contract"
              subtitle="Dates + contract + email all"
              onClick={() => setOpen('under_contract')}
            />
            <ActionCard
              tone="amber"
              icon={<IconDollar />}
              title="Financials"
              subtitle="Price, earnest, commission"
              onClick={() => setOpen('financials')}
            />
            <ActionCard
              tone="emerald"
              icon={<IconCalendar />}
              title="Important date"
              subtitle="Closing, appraisal, etc."
              onClick={() => setOpen('date')}
            />
            <ActionCard
              tone="indigo"
              icon={<IconPlus />}
              title="New deal"
              subtitle="Another deal with this client"
              onClick={() => setOpen('new_deal')}
            />
          </ActionGroup>

          <ActionGroup
            label="Property"
            hint="Houses and tour scheduling"
          >
            <ActionCard
              tone="blue"
              icon={<IconHouse />}
              title="Add house"
              subtitle="Photo or Zillow link"
              onClick={() => setOpen('house')}
            />
            <ActionCard
              tone="slate"
              icon={<IconRoute />}
              title="Tour requests"
              subtitle="Pending tours"
              href="/dashboard/tours"
            />
          </ActionGroup>

          <ActionGroup
            label="People"
            hint="Co-realtors, attorneys, inspectors, lenders"
          >
            <ActionCard
              tone="emerald"
              icon={<IconUsers />}
              title="+ Party"
              subtitle="Anyone on the deal"
              onClick={() => setOpen('participant')}
            />
            <ActionCard
              tone="sky"
              icon={<IconMail />}
              title="Mass invite"
              subtitle="Paste many emails at once"
              onClick={() => setOpen('mass_invite')}
            />
            {/* Attorney removed: attorneys are now added via "+ Party" with
                role=attorney. That path sends them their own magic-link
                signup that routes them to the attorney dashboard, so a
                separate "Add attorney" button is redundant. */}
          </ActionGroup>

          <ActionGroup
            label="Documents & Signatures"
            hint="Contracts, disclosures, DocuSign"
          >
            <ActionCard
              tone="violet"
              icon={<IconDocument />}
              title="Upload document"
              subtitle="Drag & drop, PDFs"
              href={`/dashboard/deals/${searchId}/upload`}
            />
            <ActionCard
              tone="orange"
              icon={<IconSignature />}
              title="DocuSign link"
              subtitle="Paste signing URL"
              onClick={() => setOpen('docusign')}
            />
          </ActionGroup>

          <ActionGroup
            label="Communication"
            hint="Messages and alerts to the client"
          >
            <ActionCard
              tone="sky"
              icon={<IconMessage />}
              title="Quick message"
              subtitle="Send to client thread"
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
          </ActionGroup>
        </div>
      </section>

      {open === 'phase' && (
        <PhaseModal
          currentPhase={currentPhase}
          houses={houses}
          currentClosingAmount={financials.closing_amount}
          onUnderContract={() => setOpen('under_contract')}
          onClose={close}
          onSubmit={async (phase, extras) => {
            const r = await updatePhaseAction(clientId, phase as any, extras as any);
            if (!r.ok) return toast.show(r.error || 'Failed', { variant: 'error' });
            done('Phase updated — everyone on the deal was emailed.');
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
            done('House added.');
          }}
        />
      )}

      {open === 'date' && (
        <DateModal
          onClose={close}
          onSubmit={async (payload) => {
            const r = await addImportantDateAction(clientId, payload);
            if (!r.ok) return toast.show(r.error || 'Failed', { variant: 'error' });
            done('Date saved.');
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
            done('Deal updated.');
          }}
        />
      )}

      {open === 'docusign' && (
        <DocusignModal
          onClose={close}
          onSubmit={async (url) => {
            const r = await linkDocusignAction(clientId, url);
            if (!r.ok) return toast.show(r.error || 'Failed', { variant: 'error' });
            done('DocuSign link saved.');
          }}
        />
      )}

      {/* Attorney modal removed — attorneys are now added through the
          Add Party flow with role='attorney'. That path sends them a
          magic-link signup that routes to /welcome/attorney. */}

      {open === 'message' && (
        <MessageModal
          title="Send a message"
          submitLabel="Send"
          placeholder="Type a message…"
          onClose={close}
          onSubmit={async (body) => {
            const r = await quickMessageAction(clientId, body);
            if (!r.ok) return toast.show(r.error || 'Failed', { variant: 'error' });
            done('Message sent.');
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
            done('Alert delivered.');
          }}
        />
      )}

      {open === 'participant' && (
        <ParticipantModal
          clientId={clientId}
          dealKind={dealKind}
          houses={houses}
          onClose={close}
          onSubmit={async (payload) => {
            const r = await addParticipantAction(clientId, payload);
            if (!r.ok) return toast.show(r.error || 'Failed', { variant: 'error' });
            // Broadcast the new row so ParticipantList patches itself
            // immediately. Realtime + router.refresh() are still wired up
            // as belt-and-suspenders, but this is the source of truth.
            if ((r as any).participant) {
              window.dispatchEvent(
                new CustomEvent('rp:participant:added', {
                  detail: (r as any).participant,
                })
              );
            }
            // Truthful toast — tells the realtor exactly which channel went
            // out (so they don't believe an email was sent when it wasn't)
            // AND prompts them to add a phone if NOTHING went out.
            const n = (r as any).notify || {};
            const sent: string[] = [];
            const failed: string[] = [];
            if (n.sms?.ok) sent.push('Text sent');
            else if (n.sms?.error) failed.push('Text: ' + n.sms.error);
            if (n.email?.ok) sent.push('Email sent');
            else if (n.email?.error) failed.push('Email: ' + n.email.error);

            // If we had no channel to send via, say so explicitly.
            // (e.g. realtor entered only a name, no phone, no email — the
            // participant is added but they won't hear about it yet.)
            const hadContact = Boolean(payload.email || payload.phone);
            const anySent = sent.length > 0;
            if (!hadContact) {
              // Row was already dispatched above; just toast + close.
              toast.show(
                'Party added — but no phone or email, so no invite was sent. Tap Edit to add one.',
                { variant: 'info' as any }
              );
              close();
              router.refresh();
              return;
            }
            const inviteUrl: string | null = (r as any).invite_url || null;
            if (!anySent && inviteUrl) {
              // Email + SMS didn't go through but we have a magic link
              // ready. Copy it to the clipboard and tell the realtor to
              // paste it into iMessage / WhatsApp / their own email so
              // the recipient still gets it. Works zero-setup.
              try {
                await navigator.clipboard.writeText(inviteUrl);
                toast.show(
                  'Party added. Invite link copied to your clipboard — paste it into a text or email to send it.',
                  { variant: 'success' }
                );
              } catch {
                toast.show(
                  'Party added. Couldn’t auto-copy the invite link — open the Edit pane to grab it.',
                  { variant: 'info' as any }
                );
              }
              close();
              router.refresh();
              return;
            }
            if (!anySent) {
              toast.show(
                'Party added, but invite did not send: ' + failed.join(', '),
                { variant: 'error' }
              );
            } else {
              done('Party added to deal — ' + sent.join(' · ') + '.');
            }
          }}
        />
      )}

      {open === 'mass_invite' && (
        <MassInviteModal
          onClose={close}
          onSubmitRows={async (rows) => {
            const r = await massAddPartiesAction(clientId, { rows });
            if (!r.ok) return toast.show(r.error || 'Failed', { variant: 'error' });
            done(
              'Added ' +
                (r as any).added +
                ' parties' +
                ((r as any).failed
                  ? ' (' + (r as any).failed + ' failed)'
                  : '') +
                '.'
            );
          }}
        />
      )}

      {open === 'new_deal' && (
        <NewDealModal
          onClose={close}
          onSubmit={async (payload) => {
            const r = await createNewDealAction(clientId, payload);
            if (!r.ok)
              return toast.show(r.error || 'Failed', { variant: 'error' });
            // Jump to the new deal workspace directly.
            if ((r as any).dealId) {
              toast.show('New deal started.', { variant: 'success' });
              close();
              router.push('/dashboard/deals/' + (r as any).dealId);
              return;
            }
            done('New deal started.');
          }}
        />
      )}

      {open === 'under_contract' && (
        <UnderContractModal
          houses={houses}
          dealKind={dealKind}
          onClose={close}
          onSubmit={async (payload) => {
            const r = await goUnderContractAction(clientId, payload);
            if (!r.ok) return toast.show(r.error || 'Failed', { variant: 'error' });
            done('Under contract — every party was notified.');
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

// Flat-ink design: action tiles share ONE calm, neutral look instead of a
// rainbow of per-tile colors. Emphasis comes from a single accent tone (the
// primary/destructive "Go under contract") — everything else is monochrome
// ink, which reads as clean and professional rather than busy.
const ACCENT_TONES: ReadonlySet<Tone> = new Set(['rose']);

function ActionGroup({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-ink-500">
          {label}
        </h3>
        {hint && <span className="text-[11px] text-ink-400">{hint}</span>}
      </div>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {children}
      </div>
    </div>
  );
}

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
  const accent = ACCENT_TONES.has(tone);
  const cls =
    'group relative flex items-center gap-3 rounded-xl border bg-white px-3.5 py-3 text-left transition active:scale-[0.99] ' +
    (accent
      ? 'border-ink-900 hover:bg-ink-50'
      : 'border-ink-200 hover:border-ink-300 hover:bg-ink-50/60');
  const inner = (
    <>
      <span
        className={
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition ' +
          (accent
            ? 'bg-ink-900 text-white'
            : 'bg-ink-100 text-ink-700 group-hover:bg-ink-900 group-hover:text-white')
        }
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-ink-900">
          {title}
        </div>
        <div className="line-clamp-1 text-[11px] text-ink-500">{subtitle}</div>
      </div>
      <svg
        aria-hidden
        viewBox="0 0 16 16"
        className="h-4 w-4 shrink-0 text-ink-300 transition group-hover:translate-x-0.5 group-hover:text-ink-500"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M6 3l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
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
    awaiting_offer: 'Awaiting offer',
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
function IconPlus() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
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
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/40 p-0 backdrop-blur-sm animate-fade-in sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-white shadow-soft-xl sm:rounded-2xl animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-ink-100 px-5 py-3.5">
          <h3 className="text-base font-bold tracking-tight text-ink-900">
            {title}
          </h3>
          <button
            onClick={onClose}
            className="-mr-1.5 rounded-lg p-1.5 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700"
            aria-label="Close"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
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
        'mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-soft-sm transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ' +
        (variant === 'danger'
          ? 'bg-rose-600 hover:bg-rose-700'
          : 'bg-ink-900 hover:bg-ink-700')
      }
    >
      {pending && <Spinner />}
      <span>{pending ? 'Working…' : children}</span>
    </button>
  );
}

/** Reusable inline spinner that matches the button text color. */
function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={'animate-spin h-4 w-4 ' + (className || '')}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" strokeOpacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" strokeLinecap="round" />
    </svg>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block text-sm">
      <span className="block text-xs font-semibold uppercase tracking-wide text-ink-500">{label}</span>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1 text-[11px] text-ink-400">{hint}</p>}
    </label>
  );
}

const inputCls =
  'w-full rounded-lg border border-ink-300 bg-white px-3 py-2 text-sm shadow-soft-xs transition placeholder:text-ink-400 focus:border-ink-900 focus:outline-none focus:ring-2 focus:ring-ink-900/10';

// -- Specific modals ------------------------------------------------------

function PhaseModal({
  currentPhase,
  houses,
  currentClosingAmount,
  onUnderContract,
  onClose,
  onSubmit,
}: {
  currentPhase: string;
  houses?: Array<{ id: string; address: string }>;
  currentClosingAmount?: number | null;
  onUnderContract: () => void;
  onClose: () => void;
  onSubmit: (
    phase: string,
    extras?: {
      offer_amount?: number | null;
      counter_offer_amount?: number | null;
      closing_amount?: number | null;
      closing_date?: string | null;
      closed_message?: string | null;
      offer_house_id?: string | null;
    }
  ) => Promise<void>;
}) {
  const houseList = houses || [];
  const [phase, setPhase] = useState(currentPhase);
  // Phase-specific extras. We only read out the field(s) relevant to the
  // chosen phase when we submit — keeping them all in state lets the user
  // freely toggle between phases without losing typed values.
  const [offer, setOffer] = useState('');
  const [offerHouseId, setOfferHouseId] = useState<string>(
    houseList.length === 1 ? houseList[0].id : ''
  );
  const [counter, setCounter] = useState('');
  const [closingDate, setClosingDate] = useState('');
  const [closingAmount, setClosingAmount] = useState('');
  const [closedMsg, setClosedMsg] = useState('');
  const [pending, start] = useTransition();

  const changed = phase !== currentPhase;
  const isUnderContract = phase === 'under_contract';

  function buildExtras() {
    if (phase === 'offer_made')
      return {
        offer_amount: offer ? Number(offer) : null,
        offer_house_id: offerHouseId || null,
      };
    if (phase === 'counter_offer')
      return { counter_offer_amount: counter ? Number(counter) : null };
    if (phase === 'closing')
      return {
        closing_date: closingDate || null,
        closing_amount: closingAmount ? Number(closingAmount) : null,
      };
    if (phase === 'closed')
      return {
        closing_amount: closingAmount ? Number(closingAmount) : null,
        closed_message: closedMsg.trim() || null,
      };
    return undefined;
  }

  // Mirror the server-side required-info rules so we disable the button (and
  // show inline guidance) before the round-trip. `searching` needs nothing.
  let blocked = false;
  if (changed) {
    if (phase === 'offer_made') blocked = !offer || !offerHouseId;
    else if (phase === 'counter_offer') blocked = !counter;
    else if (phase === 'closing') blocked = !closingDate || !closingAmount;
    else if (phase === 'closed')
      blocked =
        !closingAmount && (currentClosingAmount == null || currentClosingAmount <= 0);
  }

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
                  ? 'border-ink-900 bg-ink-50 ring-1 ring-ink-900'
                  : 'border-ink-200 hover:bg-ink-50')
              }
            >
              <input
                type="radio"
                name="phase"
                className="accent-ink-900"
                value={p.id}
                checked={selected}
                onChange={() => setPhase(p.id)}
              />
              <span className="font-medium text-ink-800">{p.label}</span>
              {p.id === currentPhase && (
                <span className="ml-auto text-[10px] font-bold uppercase tracking-wide text-ink-400">
                  Current
                </span>
              )}
            </label>
          );
        })}
      </div>

      {/* Phase-specific REQUIRED fields. Each target phase surfaces exactly the
          info that phase needs; the server re-validates before writing. */}
      {phase === 'offer_made' && changed && (
        <div className="mt-4 space-y-3 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
          <Field
            label="Offer amount (USD) — required"
            hint="Goes on the deal record and into the update everyone receives."
          >
            <input
              type="number"
              className={inputCls}
              value={offer}
              onChange={(e) => setOffer(e.target.value)}
              placeholder="425000"
              autoFocus
            />
          </Field>
          <Field
            label="Which house is the offer on? — required"
            hint={
              houseList.length === 0
                ? 'Add a house to this deal first, then move to Offer made.'
                : 'This becomes the deal’s agreed home.'
            }
          >
            <select
              className={inputCls}
              value={offerHouseId}
              onChange={(e) => setOfferHouseId(e.target.value)}
            >
              <option value="">Select a house…</option>
              {houseList.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.address}
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}
      {phase === 'counter_offer' && changed && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
          <Field label="Counter offer amount (USD) — required">
            <input
              type="number"
              className={inputCls}
              value={counter}
              onChange={(e) => setCounter(e.target.value)}
              placeholder="430000"
              autoFocus
            />
          </Field>
        </div>
      )}
      {isUnderContract && changed && (
        <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50/60 p-3 text-xs">
          <p className="text-[11px] text-blue-900">
            Under contract is handled by the full{' '}
            <strong>Go under contract</strong> flow — it captures the house, key
            dates (binding, earnest, due diligence, closing), the contract, and
            the seller side, then emails everyone.
          </p>
          <button
            type="button"
            onClick={onUnderContract}
            className="mt-3 inline-flex w-full items-center justify-center rounded-lg bg-ink-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ink-700"
          >
            Open “Go under contract”
          </button>
        </div>
      )}
      {phase === 'closing' && changed && (
        <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg border border-blue-200 bg-blue-50/60 p-3">
          <Field
            label="Closing date — required"
            hint="Added as an Important Date for the deal."
          >
            <input
              type="date"
              className={inputCls}
              value={closingDate}
              onChange={(e) => setClosingDate(e.target.value)}
              autoFocus
            />
          </Field>
          <Field label="Closing amount (USD) — required">
            <input
              type="number"
              className={inputCls}
              value={closingAmount}
              onChange={(e) => setClosingAmount(e.target.value)}
              placeholder="485000"
            />
          </Field>
        </div>
      )}
      {phase === 'closed' && changed && (
        <div className="mt-4 space-y-3 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
          <Field
            label="Final closing amount (USD) — required"
            hint={
              currentClosingAmount != null && currentClosingAmount > 0
                ? 'Leave blank to keep the amount already on the deal.'
                : 'The final sale price the deal closed at.'
            }
          >
            <input
              type="number"
              className={inputCls}
              value={closingAmount}
              onChange={(e) => setClosingAmount(e.target.value)}
              placeholder={
                currentClosingAmount != null && currentClosingAmount > 0
                  ? String(currentClosingAmount)
                  : '485000'
              }
            />
          </Field>
          <Field
            label="Closing wrap-up message (optional)"
            hint="Sent to everyone on the deal — client, co-realtor, attorney, lender, etc."
          >
            <textarea
              rows={4}
              className={inputCls}
              value={closedMsg}
              onChange={(e) => setClosedMsg(e.target.value)}
              placeholder="Congrats again on closing 123 Main St! It's been a pleasure…"
            />
          </Field>
        </div>
      )}

      {!isUnderContract && (
        <PrimaryButton
          pending={pending}
          disabled={blocked}
          onClick={() => start(() => onSubmit(phase, buildExtras() as any))}
        >
          {phase === currentPhase ? 'Already on this phase' : 'Save phase'}
        </PrimaryButton>
      )}
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
    bedrooms?: number | null;
    bathrooms?: number | null;
    square_feet?: number | null;
  }) => Promise<void>;
}) {
  const [address, setAddress] = useState('');
  const [listPrice, setListPrice] = useState('');
  const [listingUrl, setListingUrl] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [bedrooms, setBedrooms] = useState('');
  const [bathrooms, setBathrooms] = useState('');
  const [sqft, setSqft] = useState('');
  const [pending, start] = useTransition();
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const toast = useToast();
  const supabase = getSupabaseBrowserClient();

  async function generateAIDescription() {
    if (!address.trim()) {
      toast.show('Add an address first.', { variant: 'error' });
      return;
    }
    setAiBusy(true);
    try {
      const r = await fetch('/api/ai/listing-description', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          address,
          price: listPrice || undefined,
          bedrooms: bedrooms || undefined,
          bathrooms: bathrooms || undefined,
          squareFeet: sqft || undefined,
          notes,
          tone: 'warm',
        }),
      });
      const j = await r.json();
      if (!r.ok || !j.description) {
        toast.show(j.error || 'Could not generate description.', {
          variant: 'error',
        });
        return;
      }
      setNotes(j.description);
      toast.show('Description drafted.', { variant: 'success' });
    } catch {
      toast.show('AI service unavailable.', { variant: 'error' });
    } finally {
      setAiBusy(false);
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
        <Field label="Listing URL" hint="Optional — paste the Zillow, Redfin, or Realtor.com link for this property">
          <input
            className={inputCls}
            value={listingUrl}
            onChange={(e) => setListingUrl(e.target.value)}
            placeholder="https://www.zillow.com/homedetails/…"
          />
        </Field>
        <Field label="Photo">
          <div className="flex items-center gap-3">
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoUrl}
                alt="house"
                className="h-16 w-20 rounded-lg object-cover ring-1 ring-ink-200"
              />
            ) : (
              <div className="flex h-16 w-20 items-center justify-center rounded-lg border border-dashed border-ink-300 bg-ink-50 text-[10px] text-ink-400">
                No photo
              </div>
            )}
            <label className="cursor-pointer rounded-lg border border-ink-300 bg-white px-3 py-1.5 text-xs font-semibold shadow-sm transition hover:bg-ink-50">
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
        <div className="grid grid-cols-3 gap-2">
          <Field label="Beds">
            <input
              type="number"
              className={inputCls}
              value={bedrooms}
              onChange={(e) => setBedrooms(e.target.value)}
              placeholder="3"
            />
          </Field>
          <Field label="Baths">
            <input
              type="number"
              step="0.5"
              className={inputCls}
              value={bathrooms}
              onChange={(e) => setBathrooms(e.target.value)}
              placeholder="2"
            />
          </Field>
          <Field label="Sq ft">
            <input
              type="number"
              className={inputCls}
              value={sqft}
              onChange={(e) => setSqft(e.target.value)}
              placeholder="1850"
            />
          </Field>
        </div>
        <Field label="List price (USD)">
          <input
            type="number"
            className={inputCls}
            value={listPrice}
            onChange={(e) => setListPrice(e.target.value)}
          />
        </Field>
        <Field
          label="Notes / description"
          hint="Tap the sparkle to let AI draft something you can send to the client."
        >
          <div className="relative">
            <textarea
              className={inputCls + ' pr-12'}
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Why is this a fit, what to flag, etc."
            />
            <button
              type="button"
              onClick={generateAIDescription}
              disabled={aiBusy || !address.trim()}
              title={
                !address.trim()
                  ? 'Add an address first'
                  : 'Draft a description'
              }
              className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-ink-900 text-white shadow-soft-sm transition hover:bg-ink-700 disabled:opacity-50"
              aria-label="Draft a description"
            >
              {aiBusy ? (
                <span className="block h-3 w-3 animate-spin rounded-full border-2 border-white/70 border-t-white" />
              ) : (
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                  <path d="M11 3l1.5 4.5L17 9l-4.5 1.5L11 15l-1.5-4.5L5 9l4.5-1.5L11 3zm7 9l.9 2.7 2.7.9-2.7.9L18 19l-.9-2.7-2.7-.9 2.7-.9L18 12z" />
                </svg>
              )}
            </button>
          </div>
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
              bedrooms: bedrooms ? Number(bedrooms) : null,
              bathrooms: bathrooms ? Number(bathrooms) : null,
              square_feet: sqft ? Number(sqft) : null,
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
    event_time?: string | null;
    location?: string | null;
    things_to_bring?: string | null;
  }) => Promise<void>;
}) {
  const [preset, setPreset] = useState(DATE_PRESETS[0]);
  const [customLabel, setCustomLabel] = useState('');
  const [date, setDate] = useState('');
  const [eventTime, setEventTime] = useState('');
  const [location, setLocation] = useState('');
  const [bring, setBring] = useState('');
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
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <input
              type="date"
              className={inputCls}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <Field
            label="Time (optional)"
            hint="If you set a time, it shows up in everyone's calendar export."
          >
            <input
              type="time"
              className={inputCls}
              value={eventTime}
              onChange={(e) => setEventTime(e.target.value)}
            />
          </Field>
        </div>
        <Field
          label="Location (optional)"
          hint="Address, room number, Zoom link — anything participants need to find the event."
        >
          <input
            className={inputCls}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="123 Main St, Title Co., or https://zoom.us/…"
          />
        </Field>
        <Field
          label="Things to bring (optional)"
          hint="Especially useful for closing day."
        >
          <textarea
            className={inputCls}
            rows={2}
            value={bring}
            onChange={(e) => setBring(e.target.value)}
            placeholder="Driver's license, certified funds, contract copy…"
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
              event_time: eventTime || null,
              location: location.trim() || null,
              things_to_bring: bring.trim() || null,
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
    name?: string;
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
        <Field label="Email — required" hint="How they get access to the deal.">
          <input
            type="email"
            className={inputCls}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Phone (optional)">
          <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
      </div>
      <PrimaryButton
        pending={pending}
        disabled={!email.trim()}
        onClick={() =>
          start(() =>
            onSubmit({
              name: name.trim() || undefined,
              email: email.trim(),
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
  { id: 'co_realtor', label: 'Co-realtor', helper: 'Another agent — your firm or a cross-firm co-op agent' },
  { id: 'attorney', label: 'Attorney', helper: 'Closing / real-estate counsel' },
  { id: 'inspector', label: 'Inspector', helper: 'Property inspector' },
  { id: 'lender', label: 'Lender', helper: 'Mortgage lender' },
  { id: 'mortgage_broker', label: 'Mortgage broker', helper: 'Loan broker' },
  { id: 'appraiser', label: 'Appraiser', helper: 'Home appraiser' },
  { id: 'title_agent', label: 'Title agent', helper: 'Title insurance / escrow' },
  { id: 'other', label: 'Other', helper: 'Anyone else on the deal' },
];

function ParticipantModal({
  clientId,
  dealKind,
  houses,
  onClose,
  onSubmit,
}: {
  clientId: string;
  dealKind?: string | null;
  houses?: Array<{ id: string; address: string }>;
  onClose: () => void;
  onSubmit: (payload: {
    role: PartyRole;
    name?: string;
    email?: string;
    phone?: string;
    represents?: 'buyer' | 'seller';
    house_id?: string | null;
    can_view_documents?: boolean;
    can_view_financials?: boolean;
    can_view_messages?: boolean;
    can_view_dates?: boolean;
  }) => Promise<void>;
}) {
  const [houseId, setHouseId] = useState<string>('');
  const [tab, setTab] = useState<'existing' | 'new'>('existing');
  const [role, setRole] = useState<PartyRole>('buyer');
  // SMART DEFAULT for the co-realtor "Represents" side. A cross-firm co-op
  // agent usually represents the OPPOSITE side from the host firm: if our
  // deal is a buyer search, the added co-realtor is seller-side, and vice
  // versa. For a 'both'/unknown deal we leave it unselected.
  const defaultRepresents: '' | 'buyer' | 'seller' =
    dealKind === 'buyer' ? 'seller' : dealKind === 'seller' ? 'buyer' : '';
  const [represents, setRepresents] = useState<'' | 'buyer' | 'seller'>(
    defaultRepresents
  );
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  // Visibility checkboxes — seeded from the role-based defaults for the initial
  // role ('buyer'). Changing the Role <select> resets these to that role's
  // defaults (the realtor can then override any individual checkbox before
  // submitting).
  const initialPerms = defaultPartyPermissions('buyer');
  const [docs, setDocs] = useState(initialPerms.can_view_documents);
  const [fin, setFin] = useState(initialPerms.can_view_financials);
  const [msgs, setMsgs] = useState(initialPerms.can_view_messages);
  const [dates, setDates] = useState(initialPerms.can_view_dates);
  const [pending, start] = useTransition();

  // Apply role-based default visibility whenever the role changes. Simplest
  // correct behavior: reset all four checkboxes to the new role's defaults.
  // The realtor can still toggle individual boxes afterward.
  function changeRole(next: PartyRole) {
    setRole(next);
    const p = defaultPartyPermissions(next);
    setDocs(p.can_view_documents);
    setFin(p.can_view_financials);
    setMsgs(p.can_view_messages);
    setDates(p.can_view_dates);
  }
  const [people, setPeople] = useState<{
    users: Array<{ id: string; full_name: string | null; email: string; role: string }>;
    externals: Array<{
      email: string;
      name: string | null;
      phone: string | null;
      role: string;
      company: string | null;
      source: 'contact' | 'past_deal';
    }>;
  }>({ users: [], externals: [] });
  const [filter, setFilter] = useState('');

  // Lazy-load the firm people on first mount.
  useEffect(() => {
    let cancelled = false;
    searchFirmPeopleAction(clientId).then((r) => {
      if (cancelled || !r.ok) return;
      setPeople({ users: r.users, externals: r.externals });
    });
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  const q = filter.trim().toLowerCase();
  const filteredUsers = people.users.filter(
    (u) =>
      !q ||
      (u.full_name || '').toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q)
  );
  const filteredExternals = people.externals.filter(
    (e) =>
      !q ||
      (e.name || '').toLowerCase().includes(q) ||
      e.email.toLowerCase().includes(q) ||
      (e.company || '').toLowerCase().includes(q)
  );
  const filteredContacts = filteredExternals.filter(
    (e) => e.source === 'contact'
  );
  const filteredPastDeals = filteredExternals.filter(
    (e) => e.source === 'past_deal'
  );

  return (
    <Modal title="Add a party to this deal" onClose={onClose}>
      <div className="mb-3 flex gap-1 rounded-lg bg-ink-100 p-1">
        <button
          type="button"
          onClick={() => setTab('existing')}
          className={
            'flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition ' +
            (tab === 'existing'
              ? 'bg-white text-ink-900 shadow-soft-sm'
              : 'text-ink-600 hover:text-ink-900')
          }
        >
          Pick from your people
        </button>
        <button
          type="button"
          onClick={() => setTab('new')}
          className={
            'flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition ' +
            (tab === 'new'
              ? 'bg-white text-ink-900 shadow-soft-sm'
              : 'text-ink-600 hover:text-ink-900')
          }
        >
          Add someone new
        </button>
      </div>

      {tab === 'existing' ? (
        <div className="space-y-3">
          <Field label="Role">
            <select
              className={inputCls}
              value={role}
              onChange={(e) => changeRole(e.target.value as PartyRole)}
            >
              {PARTY_ROLES.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </Field>
          {role === 'co_realtor' && (
            <Field
              label="Represents"
              hint="Which side of the deal this co-realtor is on. Cross-firm co-op agents usually represent the opposite side from you."
            >
              <select
                className={inputCls}
                value={represents}
                onChange={(e) =>
                  setRepresents(e.target.value as '' | 'buyer' | 'seller')
                }
              >
                <option value="">Select a side…</option>
                <option value="buyer">Buyer&apos;s side</option>
                <option value="seller">Seller&apos;s side</option>
              </select>
            </Field>
          )}
          <Field label="Search clients / staff / past parties">
            <input
              className={inputCls}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Type a name or email…"
              autoFocus
            />
          </Field>
          <div className="max-h-72 overflow-y-auto rounded-lg border border-ink-200 bg-ink-50/50">
            {filteredUsers.length === 0 && filteredExternals.length === 0 ? (
              <p className="p-4 text-center text-xs italic text-ink-500">
                No people found. Switch to "Add someone new" to invite by email.
              </p>
            ) : (
              <>
                {filteredUsers.length > 0 && (
                  <div className="border-b border-ink-200 bg-ink-100/60 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-500">
                    People in your firm
                  </div>
                )}
                {filteredUsers.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      start(() =>
                        onSubmit({
                          role,
                          name: u.full_name || undefined,
                          email: u.email,
                          represents:
                            role === 'co_realtor' && represents
                              ? represents
                              : undefined,
                          can_view_documents: docs,
                          can_view_financials: fin,
                          can_view_messages: msgs,
                          can_view_dates: dates,
                        })
                      )
                    }
                    className="flex w-full items-center justify-between gap-3 border-b border-ink-100 bg-white px-3 py-2 text-left transition hover:bg-ink-50"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">
                        {u.full_name || u.email}
                      </div>
                      <div className="truncate text-[11px] text-ink-500">
                        {u.email} · {u.role}
                      </div>
                    </div>
                    <span className="rounded-full bg-ink-900 px-2 py-1 text-[10px] font-bold uppercase text-white">
                      Add
                    </span>
                  </button>
                ))}
                {filteredContacts.length > 0 && (
                  <div className="border-b border-ink-200 bg-ink-100/60 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-500">
                    From your contacts
                  </div>
                )}
                {filteredContacts.map((e) => (
                  <button
                    key={'c:' + e.email}
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      start(() =>
                        onSubmit({
                          role,
                          name: e.name || undefined,
                          email: e.email,
                          phone: e.phone || undefined,
                          represents:
                            role === 'co_realtor' && represents
                              ? represents
                              : undefined,
                          can_view_documents: docs,
                          can_view_financials: fin,
                          can_view_messages: msgs,
                          can_view_dates: dates,
                        })
                      )
                    }
                    className="flex w-full items-center justify-between gap-3 border-b border-ink-100 bg-white px-3 py-2 text-left transition hover:bg-ink-50"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">
                        {e.name || e.email}
                      </div>
                      <div className="truncate text-[11px] text-ink-500">
                        {e.email}
                        {e.company ? ' · ' + e.company : ''}
                        {' · contact (' + (e.role || 'other') + ')'}
                      </div>
                    </div>
                    <span className="rounded-full bg-ink-900 px-2 py-1 text-[10px] font-bold uppercase text-white">
                      Add
                    </span>
                  </button>
                ))}
                {filteredPastDeals.length > 0 && (
                  <div className="border-b border-ink-200 bg-ink-100/60 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-500">
                    Used on past deals
                  </div>
                )}
                {filteredPastDeals.map((e) => (
                  <button
                    key={'p:' + e.email}
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      start(() =>
                        onSubmit({
                          role,
                          name: e.name || undefined,
                          email: e.email,
                          phone: e.phone || undefined,
                          represents:
                            role === 'co_realtor' && represents
                              ? represents
                              : undefined,
                          can_view_documents: docs,
                          can_view_financials: fin,
                          can_view_messages: msgs,
                          can_view_dates: dates,
                        })
                      )
                    }
                    className="flex w-full items-center justify-between gap-3 border-b border-ink-100 bg-white px-3 py-2 text-left transition hover:bg-ink-50"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">
                        {e.name || e.email}
                      </div>
                      <div className="truncate text-[11px] text-ink-500">
                        {e.email} · previously {e.role}
                      </div>
                    </div>
                    <span className="rounded-full bg-ink-900 px-2 py-1 text-[10px] font-bold uppercase text-white">
                      Add
                    </span>
                  </button>
                ))}
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
        <Field label="Role">
          <select
            className={inputCls}
            value={role}
            onChange={(e) => changeRole(e.target.value as PartyRole)}
          >
            {PARTY_ROLES.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-ink-400">
            {PARTY_ROLES.find((r) => r.id === role)?.helper}
          </p>
        </Field>
        {role === 'co_realtor' && (
          <Field
            label="Represents"
            hint="Which side of the deal this co-realtor is on. Cross-firm co-op agents usually represent the opposite side from you."
          >
            <select
              className={inputCls}
              value={represents}
              onChange={(e) =>
                setRepresents(e.target.value as '' | 'buyer' | 'seller')
              }
            >
              <option value="">Select a side…</option>
              <option value="buyer">Buyer&apos;s side</option>
              <option value="seller">Seller&apos;s side</option>
            </select>
          </Field>
        )}
        <Field label="Name">
          <input
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full name"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Email — required" hint="How they get access to the deal.">
            <input
              type="email"
              className={inputCls}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
            />
          </Field>
          <Field
            label="Phone (optional)"
            hint="If given, we'll text them transactional deal updates."
          >
            <input
              type="tel"
              className={inputCls}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(555) 123-4567"
            />
          </Field>
        </div>
        {phone.trim() && (
          <p className="-mt-1 text-[11px] leading-snug text-ink-500">
            By adding a mobile number you confirm this person agreed to receive
            transactional texts about this deal. Msg &amp; data rates may apply;
            reply STOP to opt out. See our{' '}
            <a
              href="/privacy#sms"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2"
            >
              SMS terms
            </a>
            .
          </p>
        )}

        {(role === 'seller' ||
          role === 'buyer' ||
          role === 'co_realtor') &&
          (houses?.length || 0) > 0 && (
            <Field
              label="Which house is this for? (optional)"
              hint="Scopes a seller, buyer, or co-realtor to one property — their dashboard shows exactly that home."
            >
              <select
                className={inputCls}
                value={houseId}
                onChange={(e) => setHouseId(e.target.value)}
              >
                <option value="">All houses on this deal</option>
                {houses!.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.address}
                  </option>
                ))}
              </select>
            </Field>
          )}

        <fieldset className="rounded-lg border border-ink-200 p-3">
          <legend className="px-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
            What this party can see
          </legend>
          <div className="space-y-1.5">
            <CheckRow label="Important dates" checked={dates} onChange={setDates} />
            <CheckRow label="Documents" checked={docs} onChange={setDocs} />
            <CheckRow label="Financials" checked={fin} onChange={setFin} />
            <CheckRow label="Messages" checked={msgs} onChange={setMsgs} />
          </div>
        </fieldset>
        <PrimaryButton
          pending={pending}
          disabled={!email.trim()}
          onClick={() =>
            start(() =>
              onSubmit({
                role,
                name: name.trim() || undefined,
                email: email.trim() || undefined,
                phone: phone.trim() || undefined,
                represents:
                  role === 'co_realtor' && represents ? represents : undefined,
                house_id: houseId || undefined,
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
        </div>
      )}

      {tab === 'existing' && (
        <fieldset className="mt-3 rounded-lg border border-ink-200 p-3">
          <legend className="px-2 text-[10px] font-bold uppercase tracking-wider text-ink-500">
            What this party can see
          </legend>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            <CheckRow label="Important dates" checked={dates} onChange={setDates} />
            <CheckRow label="Documents" checked={docs} onChange={setDocs} />
            <CheckRow label="Financials" checked={fin} onChange={setFin} />
            <CheckRow label="Messages" checked={msgs} onChange={setMsgs} />
          </div>
        </fieldset>
      )}
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
    <label className="flex cursor-pointer items-center gap-2.5 rounded px-1 py-1 text-sm hover:bg-ink-50">
      <input
        type="checkbox"
        className="h-4 w-4 accent-ink-900"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

type ParticipantRow = {
  id: string;
  role: string;
  represents?: 'buyer' | 'seller' | null;
  external_name: string | null;
  external_email: string | null;
  external_phone: string | null;
  can_view_documents: boolean;
  can_view_financials: boolean;
  can_view_messages: boolean;
  can_view_dates: boolean;
  search_id?: string;
};

export function ParticipantList({
  clientId,
  participants,
  searchId,
}: {
  clientId: string;
  participants: ParticipantRow[];
  searchId?: string;
}) {
  const toast = useToast();
  const router = useRouter();
  const [removing, start] = useTransition();
  // When set, the Edit Party modal is shown for this participant.
  const [editing, setEditing] = useState<ParticipantRow | null>(null);
  // When set, the private DM thread modal is shown for this participant.
  const [messaging, setMessaging] = useState<ParticipantRow | null>(null);
  // Local mirror so we don't have to wait for router.refresh() to roundtrip.
  // Seeded from the server prop, then kept in sync with realtime INSERT /
  // DELETE events on deal_participants. Whichever side ships data first wins.
  const [live, setLive] = useState<ParticipantRow[]>(participants);

  // ADDITIVE merge of the server prop. We never REMOVE a row from `live`
  // by this path — only an explicit Remove click does that. This matters
  // because Next.js can serve stale `participants` during a router.refresh
  // race, and we don't want a just-added row to flash on then disappear.
  //
  // Order: start from local `cur` (keeps any locally-added rows), then
  // overlay the server prop so server-side field updates (role, visibility
  // flags after Edit) win where ids match.
  useEffect(() => {
    setLive((cur) => {
      const byId = new Map<string, ParticipantRow>();
      for (const p of cur) byId.set(p.id, p);
      for (const p of participants) byId.set(p.id, p);
      return Array.from(byId.values());
    });
  }, [participants]);

  /**
   * Pull the latest deal_participants for this search directly from
   * Supabase via the browser client. RLS makes sure we only see rows
   * we're allowed to. Used as the source-of-truth refresh whenever the
   * modal triggers an add — bypasses any Next.js caching by going straight
   * to the database.
   */
  async function refetchParticipants() {
    if (!searchId) return;
    const sb = getSupabaseBrowserClient();
    const { data, error } = await sb
      .from('deal_participants')
      .select(
        'id, role, represents, external_name, external_email, external_phone, can_view_documents, can_view_financials, can_view_messages, can_view_dates'
      )
      .eq('search_id', searchId)
      .order('role');
    if (error || !data) return;
    // Additive merge — same rules as the prop-effect. NEVER drop rows
    // locally; only the Remove button can do that. This prevents a brief
    // appear-then-vanish if the fresh fetch arrives before RLS has caught
    // up to the just-inserted row (rare but I've watched it happen).
    setLive((cur) => {
      const byId = new Map<string, ParticipantRow>();
      for (const p of cur) byId.set(p.id, p);
      for (const p of data as any[]) byId.set(p.id, p);
      return Array.from(byId.values());
    });
  }

  // Realtime subscription. Listens to inserts/updates/deletes for this
  // deal's participants and patches `live` directly. Means a new party
  // shows up the moment the server INSERT commits — no caching games.
  useEffect(() => {
    if (!searchId) return;
    const sb = getSupabaseBrowserClient();
    const channel = sb
      .channel('deal-participants:' + searchId)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'deal_participants',
          filter: 'search_id=eq.' + searchId,
        },
        (payload) => {
          setLive((cur) => {
            const next = payload.new as ParticipantRow;
            if (cur.some((p) => p.id === next.id)) return cur;
            return [...cur, next];
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'deal_participants',
          filter: 'search_id=eq.' + searchId,
        },
        (payload) => {
          const gone = (payload.old as any)?.id as string | undefined;
          if (!gone) return;
          setLive((cur) => cur.filter((p) => p.id !== gone));
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'deal_participants',
          filter: 'search_id=eq.' + searchId,
        },
        (payload) => {
          const updated = payload.new as ParticipantRow;
          setLive((cur) =>
            cur.map((p) => (p.id === updated.id ? { ...p, ...updated } : p))
          );
        }
      )
      .subscribe();
    return () => {
      sb.removeChannel(channel);
    };
  }, [searchId]);

  // Window-event hook for instant local updates from the Add Party modal
  // running on the same page. Realtime is great when the change comes from
  // a DIFFERENT browser session, but for the user adding parties themselves
  // the round-trip through Supabase Realtime is slow + can be lost. We have
  // the row in hand the moment the server action returns — patch directly,
  // then re-fetch from the DB as ground truth.
  useEffect(() => {
    const onAdded = (e: Event) => {
      const detail = (e as CustomEvent).detail as ParticipantRow | undefined;
      if (detail && detail.id) {
        setLive((cur) => {
          if (cur.some((p) => p.id === detail.id)) return cur;
          return [...cur, detail];
        });
      }
      // Always re-pull from the DB after the event so the UI catches up
      // even when the action's return shape changes or the event detail
      // is missing fields. Direct browser → Supabase, no Next cache.
      void refetchParticipants();
    };
    window.addEventListener('rp:participant:added', onAdded);
    return () => window.removeEventListener('rp:participant:added', onAdded);
  }, []);

  if (live.length === 0) {
    return (
      <p className="mt-3 text-xs italic text-ink-500">
        No extra parties. Use &ldquo;+ Party&rdquo; above to add a buyer&apos;s spouse,
        attorney, inspector, lender, etc.
      </p>
    );
  }
  return (
    <ul className="mt-3 space-y-2">
      {live.map((p) => (
        <li
          key={p.id}
          className="rounded-lg border border-ink-200 bg-white p-3"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-700">
                  {p.role.replace(/_/g, ' ')}
                  {p.represents ? ' · represents ' + p.represents : ''}
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
              <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-ink-500">
                {p.can_view_dates && <Chip>Dates</Chip>}
                {p.can_view_documents && <Chip>Docs</Chip>}
                {p.can_view_financials && <Chip>Financials</Chip>}
                {p.can_view_messages && <Chip>Messages</Chip>}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setMessaging(p)}
                className="rounded p-1 text-ink-400 transition hover:bg-ink-100 hover:text-blue-600"
                aria-label="Send private message"
                title="Send a private message just to this party"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              </button>
              <button
                type="button"
                onClick={() => setEditing(p)}
                className="rounded p-1 text-ink-400 transition hover:bg-ink-100 hover:text-ink-900"
                aria-label="Edit participant"
                title="Edit role and what they can see"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="m18.5 2.5 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
              <button
                type="button"
                disabled={removing}
                onClick={() =>
                  start(async () => {
                    const r = await removeParticipantAction(clientId, p.id);
                    if (!r.ok)
                      return toast.show(r.error || 'Failed', { variant: 'error' });
                    toast.show('Removed.', { variant: 'success' });
                    setLive((cur) => cur.filter((x) => x.id !== p.id));
                    router.refresh();
                  })
                }
                className="rounded p-1 text-ink-400 transition hover:bg-ink-100 hover:text-rose-600"
                aria-label="Remove participant"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>
          </div>
        </li>
      ))}
      {messaging && (
        <PrivatePartyMessageModal
          clientId={clientId}
          participant={messaging}
          onClose={() => setMessaging(null)}
        />
      )}
      {editing && (
        <EditPartyModal
          participant={editing}
          onClose={() => setEditing(null)}
          onSave={async (patch) => {
            const r = await updateParticipantAction(clientId, editing.id, patch);
            if (!r.ok) {
              toast.show(r.error || 'Failed', { variant: 'error' });
              return;
            }
            if ((r as any).participant) {
              // Local-state update so the row reflects the new
              // role/visibility immediately, without waiting for refresh.
              setLive((cur) =>
                cur.map((x) =>
                  x.id === (r as any).participant.id
                    ? { ...x, ...(r as any).participant }
                    : x
                )
              );
            }
            toast.show('Updated.', { variant: 'success' });
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </ul>
  );
}

/**
 * Inline Edit Party modal. Lets the realtor change role + visibility
 * flags + correct the name/email/phone after the fact. Submitted patch
 * only includes fields the realtor changed, so the server action can
 * NULL-out keys safely with an explicit empty string.
 */
function EditPartyModal({
  participant,
  onClose,
  onSave,
}: {
  participant: ParticipantRow;
  onClose: () => void;
  onSave: (patch: {
    role?: PartyRole;
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    can_view_documents?: boolean;
    can_view_financials?: boolean;
    can_view_messages?: boolean;
    can_view_dates?: boolean;
  }) => Promise<void>;
}) {
  const [role, setRole] = useState<PartyRole>(participant.role as PartyRole);
  const [name, setName] = useState(participant.external_name || '');
  const [email, setEmail] = useState(participant.external_email || '');
  const [phone, setPhone] = useState(participant.external_phone || '');
  const [docs, setDocs] = useState(participant.can_view_documents);
  const [fin, setFin] = useState(participant.can_view_financials);
  const [msgs, setMsgs] = useState(participant.can_view_messages);
  const [dates, setDates] = useState(participant.can_view_dates);
  const [pending, start] = useTransition();
  return (
    <Modal title="Edit party" onClose={onClose}>
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
        </Field>
        <Field label="Name">
          <input
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Email — required">
            <input
              type="email"
              className={inputCls}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
            />
          </Field>
          <Field label="Phone (optional)">
            <input
              type="tel"
              className={inputCls}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </Field>
        </div>
        <fieldset className="rounded-lg border border-ink-200 p-3">
          <legend className="px-2 text-[10px] font-bold uppercase tracking-wider text-ink-500">
            What this party can see
          </legend>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            <CheckRow label="Important dates" checked={dates} onChange={setDates} />
            <CheckRow label="Documents" checked={docs} onChange={setDocs} />
            <CheckRow label="Financials" checked={fin} onChange={setFin} />
            <CheckRow label="Messages" checked={msgs} onChange={setMsgs} />
          </div>
        </fieldset>
        <PrimaryButton
          pending={pending}
          disabled={!email.trim()}
          onClick={() =>
            start(() =>
              onSave({
                role,
                name: name.trim() || null,
                email: email.trim() || null,
                phone: phone.trim() || null,
                can_view_documents: docs,
                can_view_financials: fin,
                can_view_messages: msgs,
                can_view_dates: dates,
              })
            )
          }
        >
          Save changes
        </PrimaryButton>
      </div>
    </Modal>
  );
}

/**
 * Private 1:1 DM thread between the realtor and a specific deal party.
 * Shows the running thread between the caller and this party on this
 * deal (RLS scope sender_id=auth.uid() OR recipient_user_id/email match),
 * lets the realtor send another. Notifications fire via SMS + email.
 */
function PrivatePartyMessageModal({
  clientId,
  participant,
  onClose,
}: {
  clientId: string;
  participant: ParticipantRow;
  onClose: () => void;
}) {
  const toast = useToast();
  const router = useRouter();
  const [body, setBody] = useState('');
  const [pending, start] = useTransition();
  const [thread, setThread] = useState<
    Array<{ id: string; body: string; sender_id: string; created_at: string }>
  >([]);
  const me = useMe(); // best-effort current user id (just to label rows)

  // Pull the prior DM thread from Supabase via the browser client. RLS
  // (migration 0029) ensures only sender + recipient see the rows.
  useEffect(() => {
    let cancelled = false;
    const sb = getSupabaseBrowserClient();
    (async () => {
      const { data } = await sb
        .from('messages')
        .select('id, body, sender_id, created_at, recipient_user_id, recipient_email')
        .or(
          [
            participant.external_email
              ? 'recipient_email.eq.' + participant.external_email
              : null,
            // Fallback to user_id when the participant has signed up.
            (participant as any).user_id
              ? 'recipient_user_id.eq.' + (participant as any).user_id
              : null,
          ]
            .filter(Boolean)
            .join(',')
        )
        .order('created_at', { ascending: true })
        .limit(50);
      if (!cancelled && data) setThread(data as any);
    })();
    return () => {
      cancelled = true;
    };
  }, [participant.id, participant.external_email]);

  const displayName =
    participant.external_name ||
    participant.external_email ||
    participant.external_phone ||
    'this party';
  return (
    <Modal title={`Message ${displayName}`} onClose={onClose}>
      <p className="mb-3 text-xs text-ink-500">
        Private — only you and {displayName} can see this thread. We&apos;ll
        also text + email them so they actually catch the message.
      </p>
      <div className="mb-3 max-h-56 overflow-y-auto rounded-lg border border-ink-200 bg-ink-50/40 p-2">
        {thread.length === 0 ? (
          <p className="px-2 py-3 text-center text-xs italic text-ink-500">
            No messages yet. Start the conversation.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {thread.map((m) => {
              const mine = me?.userId && m.sender_id === me.userId;
              return (
                <li
                  key={m.id}
                  className={
                    'rounded px-2 py-1.5 text-xs ' +
                    (mine
                      ? 'ml-6 bg-ink-900 text-white'
                      : 'mr-6 bg-white text-ink-900 border border-ink-200')
                  }
                >
                  <p className="whitespace-pre-wrap">{m.body}</p>
                  <p
                    className={
                      'mt-1 text-[10px] ' +
                      (mine ? 'text-white/70' : 'text-ink-500')
                    }
                  >
                    {new Date(m.created_at).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <textarea
        className={inputCls + ' min-h-[80px]'}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Type your message…"
      />
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="btn-secondary text-xs">
          Close
        </button>
        <PrimaryButton
          pending={pending}
          disabled={!body.trim()}
          onClick={() =>
            start(async () => {
              const r = await sendPrivatePartyMessageAction(
                clientId,
                participant.id,
                body.trim()
              );
              if (!r.ok) {
                toast.show(r.error || 'Failed', { variant: 'error' });
                return;
              }
              toast.show('Sent — they were texted + emailed.', {
                variant: 'success',
              });
              // Append optimistically to the thread.
              setThread((cur) => [
                ...cur,
                {
                  id: (r as any).messageId || 'tmp',
                  body: body.trim(),
                  sender_id: me?.userId || '',
                  created_at: new Date().toISOString(),
                },
              ]);
              setBody('');
              router.refresh();
            })
          }
        >
          Send
        </PrimaryButton>
      </div>
    </Modal>
  );
}

/** Tiny "who am I" hook just for the thread bubble alignment. */
function useMe(): { userId: string } | null {
  const [me, setMe] = useState<{ userId: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    const sb = getSupabaseBrowserClient();
    (async () => {
      const {
        data: { user },
      } = await sb.auth.getUser();
      if (!cancelled && user) setMe({ userId: user.id });
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return me;
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded bg-ink-100 px-1.5 py-0.5 font-semibold uppercase tracking-wide">
      {children}
    </span>
  );
}

function NewDealModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (p: { kind: 'buyer' | 'seller'; name?: string }) => Promise<void>;
}) {
  const [kind, setKind] = useState<'buyer' | 'seller'>('buyer');
  const [name, setName] = useState('');
  const [pending, start] = useTransition();
  return (
    <Modal title="Start another deal" onClose={onClose}>
      <p className="mb-3 text-xs text-ink-500">
        Use this when the same client has multiple deals — e.g. a buyer who's
        also selling, or a return client a year later.
      </p>
      <Field label="Type">
        <div className="grid grid-cols-2 gap-2">
          {(['buyer', 'seller'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={
                'rounded-lg border px-3 py-2 text-sm font-semibold transition ' +
                (kind === k
                  ? 'border-ink-900 bg-ink-900 text-white'
                  : 'border-ink-200 bg-white text-ink-700 hover:bg-ink-50')
              }
            >
              {k === 'buyer' ? 'Buyer deal' : 'Listing'}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Name (optional)" hint="e.g. '2nd home — Marietta'. Defaults to the client name.">
        <input
          className={inputCls}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <PrimaryButton
        pending={pending}
        onClick={() => start(() => onSubmit({ kind, name: name.trim() || undefined }))}
      >
        Start deal
      </PrimaryButton>
    </Modal>
  );
}

function UnderContractModal({
  onClose,
  onSubmit,
  houses,
  dealKind,
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
    offer_house_id?: string | null;
    seller_name?: string | null;
    seller_email?: string | null;
    seller_realtor_name?: string | null;
    seller_realtor_email?: string | null;
    seller_realtor_firm?: string | null;
  }) => Promise<void>;
  houses?: Array<{ id: string; address: string }>;
  dealKind?: string | null;
}) {
  const [binding, setBinding] = useState('');
  const [earnest, setEarnest] = useState('');
  const [earnestAmt, setEarnestAmt] = useState('');
  const [diligence, setDiligence] = useState('');
  const [closing, setClosing] = useState('');
  const [contract, setContract] = useState('');
  const [msg, setMsg] = useState('');
  // Convergence capture (buyer deals): which house, and who's on the other side.
  const houseList = houses || [];
  const isBuyer = dealKind !== 'seller';
  const [houseId, setHouseId] = useState<string>(
    houseList.length === 1 ? houseList[0].id : ''
  );
  const [sellerName, setSellerName] = useState('');
  const [sellerEmail, setSellerEmail] = useState('');
  const [agentName, setAgentName] = useState('');
  const [agentEmail, setAgentEmail] = useState('');
  const [agentFirm, setAgentFirm] = useState('');
  const [pending, start] = useTransition();
  // Only show the "who's selling this house?" capture for buyer deals that
  // actually have candidate houses to choose from.
  const showCapture = isBuyer && houseList.length > 0;
  return (
    <Modal title="Going under contract" onClose={onClose}>
      <p className="mb-3 text-xs text-ink-500">
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

        {/* Convergence capture — buyer deals only. Optional / skippable. */}
        {showCapture && (
          <div className="rounded-lg border border-ink-200 bg-ink-50/60 p-3">
            <Field
              label="Which house?"
              hint="Pick the property you're going under contract on — it gets marked under contract."
            >
              <select
                className={inputCls}
                value={houseId}
                onChange={(e) => setHouseId(e.target.value)}
              >
                <option value="">(choose later)</option>
                {houseList.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.address}
                  </option>
                ))}
              </select>
            </Field>
            {houseId && (
              <div className="mt-3 space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">
                  Who's selling this house? (optional)
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Listing agent name">
                    <input
                      className={inputCls}
                      value={agentName}
                      onChange={(e) => setAgentName(e.target.value)}
                      placeholder="Jane Agent"
                    />
                  </Field>
                  <Field label="Listing agent email">
                    <input
                      type="email"
                      className={inputCls}
                      value={agentEmail}
                      onChange={(e) => setAgentEmail(e.target.value)}
                      placeholder="jane@firm.com"
                    />
                  </Field>
                  <Field label="Listing agent firm">
                    <input
                      className={inputCls}
                      value={agentFirm}
                      onChange={(e) => setAgentFirm(e.target.value)}
                      placeholder="Acme Realty"
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Seller name">
                    <input
                      className={inputCls}
                      value={sellerName}
                      onChange={(e) => setSellerName(e.target.value)}
                      placeholder="Sam Seller"
                    />
                  </Field>
                  <Field label="Seller email">
                    <input
                      type="email"
                      className={inputCls}
                      value={sellerEmail}
                      onChange={(e) => setSellerEmail(e.target.value)}
                      placeholder="sam@email.com"
                    />
                  </Field>
                </div>
                <p className="text-[11px] text-ink-400">
                  We'll invite the listing agent (and seller, if given) to this
                  one property only — they never see the buyer's other houses.
                </p>
              </div>
            )}
          </div>
        )}

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
              offer_house_id: showCapture && houseId ? houseId : null,
              seller_name:
                showCapture && houseId ? sellerName.trim() || null : null,
              seller_email:
                showCapture && houseId ? sellerEmail.trim() || null : null,
              seller_realtor_name:
                showCapture && houseId ? agentName.trim() || null : null,
              seller_realtor_email:
                showCapture && houseId ? agentEmail.trim() || null : null,
              seller_realtor_firm:
                showCapture && houseId ? agentFirm.trim() || null : null,
            })
          )
        }
      >
        Move to Under Contract & notify everyone
      </PrimaryButton>
    </Modal>
  );
}

type MassRow = { id: string; email: string; name: string; role: PartyRole };

function MassInviteModal({
  onClose,
  onSubmitRows,
}: {
  onClose: () => void;
  onSubmitRows: (
    rows: Array<{ role: PartyRole; email: string; name?: string }>
  ) => Promise<void>;
}) {
  const [rows, setRows] = useState<MassRow[]>([
    { id: crypto.randomUUID(), email: '', name: '', role: 'buyer' },
  ]);
  const [pending, start] = useTransition();

  function addRow() {
    setRows((r) => [
      ...r,
      { id: crypto.randomUUID(), email: '', name: '', role: 'buyer' },
    ]);
  }
  function removeRow(id: string) {
    setRows((r) => (r.length === 1 ? r : r.filter((x) => x.id !== id)));
  }
  function update(id: string, patch: Partial<MassRow>) {
    setRows((r) => r.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }

  // Bulk paste — if someone pastes a list of emails into ANY email field,
  // explode it into multiple rows so they don't have to add+paste each.
  function handlePaste(id: string, text: string) {
    const found = text
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));
    if (found.length <= 1) return false;
    setRows((r) => {
      const target = r.find((x) => x.id === id);
      const role = target?.role || 'buyer';
      const rest = r.filter((x) => x.id !== id || x.email.trim() !== '');
      const additions = found.map((email) => ({
        id: crypto.randomUUID(),
        email,
        name: '',
        role,
      }));
      return [...rest.filter((x) => x.id !== id), ...additions];
    });
    return true;
  }

  const valid = rows.filter(
    (r) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email) || r.name.trim()
  );

  return (
    <Modal title="Add many parties at once" onClose={onClose}>
      <p className="mb-3 text-xs text-ink-500">
        One row per person. Each can have its own role. Paste a list of emails
        into any email field and we'll expand it for you.
      </p>
      <div className="max-h-[60vh] space-y-2 overflow-y-auto">
        {rows.map((r) => (
          <div
            key={r.id}
            className="grid grid-cols-12 items-center gap-1.5 rounded-lg border border-ink-200 bg-white p-2"
          >
            <input
              className={inputCls + ' col-span-5 text-xs'}
              placeholder="email@example.com"
              value={r.email}
              onChange={(e) => update(r.id, { email: e.target.value })}
              onPaste={(e) => {
                const text = e.clipboardData.getData('text');
                if (handlePaste(r.id, text)) e.preventDefault();
              }}
            />
            <input
              className={inputCls + ' col-span-4 text-xs'}
              placeholder="Name (optional)"
              value={r.name}
              onChange={(e) => update(r.id, { name: e.target.value })}
            />
            <select
              className={inputCls + ' col-span-2 text-xs px-2'}
              value={r.role}
              onChange={(e) =>
                update(r.id, { role: e.target.value as PartyRole })
              }
            >
              {PARTY_ROLES.map((pr) => (
                <option key={pr.id} value={pr.id}>
                  {pr.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => removeRow(r.id)}
              disabled={rows.length === 1}
              className="col-span-1 inline-flex items-center justify-center rounded p-1 text-ink-400 transition hover:bg-ink-100 hover:text-rose-600 disabled:opacity-30"
              aria-label="Remove row"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-3.5 w-3.5" aria-hidden>
                <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={addRow}
        className="mt-3 w-full rounded-lg border border-dashed border-ink-300 px-3 py-2 text-xs font-semibold text-ink-600 transition hover:border-ink-500 hover:bg-ink-50"
      >
        + Add another row
      </button>
      <PrimaryButton
        pending={pending}
        disabled={valid.length === 0}
        onClick={() =>
          start(() =>
            onSubmitRows(
              valid.map((r) => ({
                role: r.role,
                email: r.email.trim() || undefined as any,
                name: r.name.trim() || undefined,
              }))
            )
          )
        }
      >
        Add {valid.length || 0} {valid.length === 1 ? 'party' : 'parties'}
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
