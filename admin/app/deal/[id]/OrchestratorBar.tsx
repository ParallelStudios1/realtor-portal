'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Controls shown only to the orchestrating attorney on an attorney-led deal:
 * move the phase, and add another person.
 *
 * Add-person posts to /api/participants/add from the browser (cookies ride
 * along), which reuses the entire existing invite pipeline — branded
 * /invite/<token> landing, email, activity row — rather than a second one.
 */

const PHASES: { value: string; label: string }[] = [
  { value: 'searching', label: 'Pre-contract' },
  { value: 'awaiting_offer', label: 'Awaiting offer' },
  { value: 'offer_made', label: 'Offer made' },
  { value: 'counter_offer', label: 'Counter offer' },
  { value: 'under_contract', label: 'Under contract' },
  { value: 'closing', label: 'Closing' },
  { value: 'closed', label: 'Closed' },
];

const ADD_ROLES = [
  { value: 'realtor', label: 'Realtor' },
  { value: 'co_realtor', label: "Other side's realtor" },
  { value: 'buyer', label: 'Buyer' },
  { value: 'seller', label: 'Seller' },
  { value: 'lender', label: 'Lender' },
  { value: 'inspector', label: 'Inspector' },
  { value: 'title_agent', label: 'Title agent' },
  { value: 'other', label: 'Other' },
];

export function OrchestratorBar({
  dealId,
  currentPhase,
  phaseAction,
  brand,
}: {
  dealId: string;
  currentPhase: string;
  phaseAction: (formData: FormData) => Promise<void>;
  brand: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [addRole, setAddRole] = useState('realtor');
  const [addName, setAddName] = useState('');
  const [addEmail, setAddEmail] = useState('');
  const [addBusy, setAddBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const changePhase = (phase: string) => {
    const fd = new FormData();
    fd.set('deal_id', dealId);
    fd.set('phase', phase);
    startTransition(async () => {
      await phaseAction(fd);
      router.refresh();
    });
  };

  const addPerson = async () => {
    setMsg(null);
    if (!addEmail.trim()) {
      setMsg('An email is required.');
      return;
    }
    setAddBusy(true);
    try {
      const res = await fetch('/api/participants/add', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          search_id: dealId,
          role: addRole,
          name: addName.trim() || undefined,
          email: addEmail.trim(),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        setMsg(json?.error || `Could not add (HTTP ${res.status}).`);
      } else {
        setMsg('Invited — they’ll get an email.');
        setAddName('');
        setAddEmail('');
        router.refresh();
      }
    } catch {
      setMsg('Network error — try again.');
    } finally {
      setAddBusy(false);
    }
  };

  return (
    <div
      className="mt-4 rounded-2xl border bg-white px-4 py-3 shadow-soft"
      style={{ borderColor: brand + '55' }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-ink-500">
            You run this deal
          </span>
          <select
            value={currentPhase}
            disabled={pending}
            onChange={(e) => changePhase(e.target.value)}
            className="input !mt-0 w-44 py-1.5 text-sm"
            aria-label="Deal phase"
          >
            {PHASES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          {pending && <span className="text-xs text-ink-400">Saving…</span>}
        </div>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="text-sm font-semibold"
          style={{ color: brand }}
        >
          {adding ? 'Close' : '+ Add a person'}
        </button>
      </div>

      {adding && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-ink-100 pt-3">
          <select
            value={addRole}
            onChange={(e) => setAddRole(e.target.value)}
            className="input !mt-0 w-44 py-1.5 text-sm"
            aria-label="Role"
          >
            {ADD_ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <input
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            placeholder="Name"
            className="input !mt-0 w-40 py-1.5 text-sm"
            aria-label="Name"
          />
          <input
            value={addEmail}
            onChange={(e) => setAddEmail(e.target.value)}
            placeholder="email@example.com"
            type="email"
            className="input !mt-0 flex-1 py-1.5 text-sm"
            aria-label="Email"
          />
          <button
            type="button"
            onClick={addPerson}
            disabled={addBusy}
            className="btn-primary px-3 py-1.5 text-sm disabled:opacity-60"
          >
            {addBusy ? 'Inviting…' : 'Invite'}
          </button>
          {msg && <span className="w-full text-xs text-ink-600">{msg}</span>}
        </div>
      )}
    </div>
  );
}
