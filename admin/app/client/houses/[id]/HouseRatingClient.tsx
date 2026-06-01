'use client';

import { useState } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabaseBrowser';
import { useToast } from '@/components/Toast';
import { humanError } from '@/lib/humanError';

type Existing = { id: string; stars: number; notes: string | null } | null;

// Map a 1-5 stars schema onto a buyer-friendly 4-option UI.
// 1 → Pass, 2/3 → Maybe, 4/5 → Love. We store the 5-pt value so we keep
// signal for power users and don't lose data.
const FACES = [
  { v: 1, text: 'Pass' },
  { v: 2, text: 'Meh' },
  { v: 4, text: 'Maybe' },
  { v: 5, text: 'Love it' },
];

export function HouseRatingClient({
  houseId,
  searchId,
  firmId,
  clientId,
  existing,
}: {
  houseId: string;
  searchId: string;
  firmId: string;
  clientId: string;
  existing: Existing;
}) {
  const [stars, setStars] = useState<number | null>(existing?.stars ?? null);
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const supabase = getSupabaseBrowserClient();
  const toast = useToast();

  async function save(nextStars: number | null = stars, nextNotes = notes) {
    if (nextStars == null) return;
    setSaving(true);
    setError(null);
    const { error: e } = await supabase.from('house_ratings').upsert(
      {
        house_id: houseId,
        search_id: searchId,
        firm_id: firmId,
        client_id: clientId,
        stars: nextStars,
        notes: nextNotes.trim() || null,
      },
      { onConflict: 'client_id,house_id' }
    );
    setSaving(false);
    if (e) {
      const msg = humanError(e);
      setError(msg);
      toast.show(msg, { variant: 'error' });
    } else {
      setSavedAt(Date.now());
      toast.show('Saved.', { variant: 'success' });
    }
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap gap-2">
        {FACES.map((f) => {
          const on = stars === f.v;
          return (
            <button
              key={f.v}
              type="button"
              onClick={() => {
                setStars(f.v);
                save(f.v, notes);
              }}
              className={
                'rounded-md border px-3 py-2 text-xs font-semibold transition ' +
                (on
                  ? 'border-ink-900 bg-ink-100 text-ink-900'
                  : 'border-ink-200 hover:border-ink-300')
              }
            >
              {f.text}
            </button>
          );
        })}
      </div>

      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => save(stars, notes)}
        placeholder="Anything you'd want your agent to know? (optional)"
        rows={3}
        className="mt-3 w-full rounded-md border border-ink-300 px-3 py-2 text-sm focus:border-ink-500 focus:outline-none focus:ring-1 focus:ring-ink-200"
      />

      <div className="mt-2 text-xs text-ink-500">
        {error && <span className="text-red-600">{error}</span>}
        {!error && saving && 'Saving…'}
        {!error && !saving && savedAt && 'Saved'}
      </div>
    </div>
  );
}
