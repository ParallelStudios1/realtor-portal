'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { useToast } from '@/components/Toast';
import {
  inviteFirmMemberAction,
  changeMemberRoleAction,
  removeMemberAction,
  saveFirmPhaseLabelsAction,
  type FirmRole,
} from './actions';

const PHASES = [
  { id: 'searching', defaultLabel: 'Searching' },
  { id: 'awaiting_offer', defaultLabel: 'Awaiting offer' },
  { id: 'offer_made', defaultLabel: 'Offer made' },
  { id: 'counter_offer', defaultLabel: 'Counter offer' },
  { id: 'under_contract', defaultLabel: 'Under contract' },
  { id: 'closing', defaultLabel: 'Closing' },
  { id: 'closed', defaultLabel: 'Closed' },
];

type Member = {
  id: string;
  full_name: string | null;
  email: string;
  role: FirmRole;
  created_at: string;
};
type Invite = {
  id: string;
  email: string;
  full_name: string | null;
  role: FirmRole;
  created_at: string;
  accepted_at: string | null;
};

const ROLES: { id: FirmRole; label: string; description: string }[] = [
  {
    id: 'owner',
    label: 'Owner',
    description: 'Full control, including billing and removing other admins.',
  },
  {
    id: 'firm_admin',
    label: 'Firm admin',
    description: 'Manage seats, deals, branding — everything except changing owners.',
  },
  {
    id: 'manager',
    label: 'Manager',
    description: 'Invite realtors and assign deals. No billing.',
  },
  {
    id: 'realtor',
    label: 'Realtor',
    description: 'Day-to-day deal work with their own clients.',
  },
  {
    id: 'agent',
    label: 'Agent / Assistant',
    description: 'Unlicensed support — read-only on most things.',
  },
];

const ROLE_COLORS: Record<FirmRole, string> = {
  owner: 'bg-amber-100 text-amber-900 ring-amber-200',
  firm_admin: 'bg-ink-900 text-white ring-ink-900',
  manager: 'bg-blue-100 text-blue-900 ring-blue-200',
  realtor: 'bg-ink-100 text-ink-700 ring-ink-200',
  agent: 'bg-ink-50 text-ink-600 ring-ink-200',
};

export function FirmControl({
  meId,
  meRole,
  members,
  invites,
  dealCountByRealtor,
  phaseLabels,
  phaseMessages,
}: {
  meId: string;
  meRole: string;
  members: Member[];
  invites: Invite[];
  dealCountByRealtor: Record<string, number>;
  phaseLabels: Record<string, string>;
  phaseMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [showInvite, setShowInvite] = useState(false);

  const isOwner = meRole === 'owner' || meRole === 'super_admin';
  const isAdmin = isOwner || meRole === 'firm_admin';

  const pendingInvites = invites.filter((i) => !i.accepted_at);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-5">
        <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-soft">
          <div className="flex items-center justify-between gap-3 border-b border-ink-100 px-5 py-3.5">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-ink-500">
              People ({members.length})
            </h2>
            {isAdmin && (
              <button
                type="button"
                onClick={() => setShowInvite(true)}
                className="btn-primary text-xs px-3 py-1.5"
              >
                + Invite member
              </button>
            )}
          </div>
          {members.length === 0 ? (
            <div className="bg-dotted px-5 py-10 text-center text-sm text-ink-500">
              Just you for now. Invite a teammate to get started.
            </div>
          ) : (
            <ul className="divide-y divide-ink-100">
              {members.map((m) => (
                <MemberRow
                  key={m.id}
                  m={m}
                  isSelf={m.id === meId}
                  canManage={isAdmin}
                  dealCount={dealCountByRealtor[m.id] || 0}
                />
              ))}
            </ul>
          )}
        </section>

        {/* Phase labels editor — only owners/firm admins land on this page,
            so we don't need to gate it further. */}
        <PhaseLabelsCard
          phaseLabels={phaseLabels}
          phaseMessages={phaseMessages}
        />

        {pendingInvites.length > 0 && (
          <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-soft">
            <div className="border-b border-ink-100 px-5 py-3.5">
              <h2 className="text-[11px] font-bold uppercase tracking-wider text-ink-500">
                Pending invites ({pendingInvites.length})
              </h2>
            </div>
            <ul className="divide-y divide-ink-100">
              {pendingInvites.map((i) => (
                <li
                  key={i.id}
                  className="flex items-center justify-between gap-3 px-5 py-3"
                >
                  <div className="min-w-0">
                    <div className="truncate font-semibold">
                      {i.full_name || i.email}
                    </div>
                    <div className="truncate text-xs text-ink-500">
                      {i.email} · invited{' '}
                      {new Date(i.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <RoleBadge role={i.role} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <aside className="space-y-5">
        <section className="rounded-2xl border border-ink-200 bg-white p-5 shadow-soft">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-ink-500">
            Role reference
          </h3>
          <ul className="mt-3 space-y-2.5 text-xs">
            {ROLES.map((r) => (
              <li key={r.id} className="flex items-start gap-2">
                <RoleBadge role={r.id} />
                <span className="text-ink-600">{r.description}</span>
              </li>
            ))}
          </ul>
        </section>
      </aside>

      {showInvite && (
        <InviteModal
          onClose={() => setShowInvite(false)}
          isOwner={isOwner}
          onSubmit={async (payload) => {
            const r = await inviteFirmMemberAction(payload);
            if (!r.ok) {
              toast.show(r.error || 'Failed', { variant: 'error' });
              return false;
            }
            toast.show('Invite sent.', { variant: 'success' });
            router.refresh();
            return true;
          }}
        />
      )}
    </div>
  );
}

function MemberRow({
  m,
  isSelf,
  canManage,
  dealCount,
}: {
  m: Member;
  isSelf: boolean;
  canManage: boolean;
  dealCount: number;
}) {
  const toast = useToast();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const [role, setRole] = useState<FirmRole>(m.role);

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink-100 text-xs font-bold text-ink-700">
          {initials(m.full_name || m.email)}
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">
            {m.full_name || m.email}
            {isSelf && (
              <span className="ml-1.5 rounded bg-ink-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-ink-600">
                you
              </span>
            )}
          </div>
          <div className="truncate text-xs text-ink-500">
            {m.email}
            {(m.role === 'realtor' || m.role === 'manager') && dealCount > 0 && (
              <span> · {dealCount} active deal{dealCount === 1 ? '' : 's'}</span>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {editing ? (
          <>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as FirmRole)}
              className="rounded-md border border-ink-300 bg-white px-2 py-1 text-xs"
              disabled={pending}
            >
              {ROLES.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await changeMemberRoleAction({
                    user_id: m.id,
                    role,
                  });
                  if (!r.ok)
                    return toast.show(r.error || 'Failed', {
                      variant: 'error',
                    });
                  toast.show('Role updated.', { variant: 'success' });
                  setEditing(false);
                  router.refresh();
                })
              }
              className="btn-primary text-xs px-3 py-1"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="btn-ghost text-xs px-2 py-1"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <RoleBadge role={m.role} />
            {canManage && !isSelf && (
              <>
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="text-xs font-semibold text-ink-600 hover:text-ink-900"
                >
                  Change role
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    if (
                      !confirm(
                        `Remove ${m.full_name || m.email} from the firm? They keep their account but lose firm access.`
                      )
                    )
                      return;
                    start(async () => {
                      const r = await removeMemberAction(m.id);
                      if (!r.ok)
                        return toast.show(r.error || 'Failed', {
                          variant: 'error',
                        });
                      toast.show('Removed.', { variant: 'success' });
                      router.refresh();
                    });
                  }}
                  className="text-xs font-semibold text-rose-600 hover:underline"
                >
                  Remove
                </button>
              </>
            )}
          </>
        )}
      </div>
    </li>
  );
}

function RoleBadge({ role }: { role: FirmRole }) {
  return (
    <span
      className={
        'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ring-inset ' +
        ROLE_COLORS[role]
      }
    >
      {role.replace(/_/g, ' ')}
    </span>
  );
}

function InviteModal({
  onClose,
  isOwner,
  onSubmit,
}: {
  onClose: () => void;
  isOwner: boolean;
  onSubmit: (payload: {
    email: string;
    full_name: string;
    role: FirmRole;
  }) => Promise<boolean>;
}) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<FirmRole>('realtor');
  const [pending, start] = useTransition();

  // Non-owners can't create owners.
  const eligibleRoles = isOwner ? ROLES : ROLES.filter((r) => r.id !== 'owner');

  // Portal so the fixed overlay can't be trapped by transformed ancestors.
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/40 p-0 backdrop-blur-sm animate-fade-in sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-white shadow-soft-xl sm:rounded-2xl animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-ink-100 px-5 py-3.5">
          <h3 className="text-base font-bold tracking-tight">Invite member</h3>
          <button
            onClick={onClose}
            className="-mr-1.5 rounded-lg p-1.5 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700"
            aria-label="Close"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-4 w-4" aria-hidden>
              <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
        <div className="space-y-3 p-5">
          <label className="block text-sm">
            <span className="label">Full name</span>
            <input
              className="input mt-1.5"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Smith"
            />
          </label>
          <label className="block text-sm">
            <span className="label">Email</span>
            <input
              type="email"
              className="input mt-1.5"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jane@firm.com"
            />
          </label>
          <label className="block text-sm">
            <span className="label">Role</span>
            <select
              className="input mt-1.5"
              value={role}
              onChange={(e) => setRole(e.target.value as FirmRole)}
            >
              {eligibleRoles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-ink-500">
              {ROLES.find((r) => r.id === role)?.description}
            </p>
          </label>
          <button
            type="button"
            disabled={pending || !email.trim() || !name.trim()}
            onClick={() =>
              start(async () => {
                const ok = await onSubmit({ email, full_name: name, role });
                if (ok) onClose();
              })
            }
            className="btn-primary mt-2 w-full"
          >
            {pending ? 'Sending…' : 'Send invite'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function PhaseLabelsCard({
  phaseLabels,
  phaseMessages,
}: {
  phaseLabels: Record<string, string>;
  phaseMessages: Record<string, string>;
}) {
  const toast = useToast();
  const router = useRouter();
  const [labels, setLabels] = useState<Record<string, string>>(phaseLabels);
  const [messages, setMessages] = useState<Record<string, string>>(
    phaseMessages
  );
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();

  return (
    <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-soft">
      <div className="flex items-center justify-between gap-3 border-b border-ink-100 px-5 py-3.5">
        <div>
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-ink-500">
            Phase labels
          </h2>
          <p className="mt-0.5 text-[11px] text-ink-400">
            Customize what each phase is called for your firm.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className="btn-secondary text-xs"
        >
          {editing ? 'Cancel' : 'Customize'}
        </button>
      </div>
      <div className="px-5 py-4">
        {!editing ? (
          <ul className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {PHASES.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between border-b border-ink-50 py-1"
              >
                <span className="text-[11px] uppercase tracking-wider text-ink-400">
                  {p.defaultLabel}
                </span>
                <span className="font-semibold">
                  {phaseLabels[p.id] || p.defaultLabel}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="space-y-3">
            {PHASES.map((p) => (
              <div key={p.id} className="grid grid-cols-12 items-center gap-2">
                <span className="col-span-3 text-[11px] uppercase tracking-wider text-ink-500">
                  {p.defaultLabel}
                </span>
                <input
                  className="input col-span-4 text-xs"
                  value={labels[p.id] || ''}
                  placeholder={p.defaultLabel}
                  onChange={(e) =>
                    setLabels((l) => ({ ...l, [p.id]: e.target.value }))
                  }
                />
                <input
                  className="input col-span-5 text-xs"
                  value={messages[p.id] || ''}
                  placeholder="Celebration message (optional)"
                  onChange={(e) =>
                    setMessages((m) => ({ ...m, [p.id]: e.target.value }))
                  }
                />
              </div>
            ))}
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await saveFirmPhaseLabelsAction({
                    labels,
                    messages,
                  });
                  if (!r.ok) {
                    toast.show(r.error || 'Failed', { variant: 'error' });
                    return;
                  }
                  toast.show('Phase labels saved.', { variant: 'success' });
                  setEditing(false);
                  router.refresh();
                })
              }
              className="btn-primary text-xs"
            >
              {pending ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function initials(s: string | null | undefined) {
  if (!s) return '?';
  return s
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
