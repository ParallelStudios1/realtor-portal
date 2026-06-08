'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/Toast';
import { setSubphaseAction } from '../../clients/[id]/actions';

/**
 * Inline editor for the deal's free-text subphase / status note. The realtor
 * types a short "where exactly are we" line (e.g. "Inspection scheduled") that
 * shows under the current phase to every party.
 */
export function SubphaseEditor({
  clientId,
  initial,
}: {
  clientId: string;
  initial: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initial || '');
  const [saved, setSaved] = useState(initial || '');
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();

  const save = () => {
    start(async () => {
      const r = await setSubphaseAction(clientId, value);
      if (!r.ok) {
        toast.show(r.error || 'Failed', { variant: 'error' });
        return;
      }
      setSaved(r.subphase || '');
      setValue(r.subphase || '');
      setEditing(false);
      router.refresh();
    });
  };

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <span className="eyebrow">Status</span>
        {saved ? (
          <span className="text-sm font-semibold text-ink-800">{saved}</span>
        ) : (
          <span className="text-sm text-ink-400">No status set</span>
        )}
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs font-semibold text-blue-600 hover:underline"
        >
          {saved ? 'Edit' : '+ Add'}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save();
          if (e.key === 'Escape') setEditing(false);
        }}
        maxLength={120}
        placeholder="e.g. Inspection scheduled for Tuesday"
        className="input max-w-xs flex-1"
      />
      <button
        type="button"
        onClick={save}
        disabled={pending}
        className="btn-primary px-3 py-1.5 text-xs"
      >
        {pending ? 'Saving…' : 'Save'}
      </button>
      <button
        type="button"
        onClick={() => {
          setValue(saved);
          setEditing(false);
        }}
        className="btn-ghost px-2 py-1.5 text-xs"
      >
        Cancel
      </button>
    </div>
  );
}
