'use client';

import { useState } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabaseBrowser';

type Existing = { id: string; stars: number; notes: string | null } | null;

// Map a 1-5 stars schema onto a more buyer-friendly 4-face UI.
// 1 → Pass, 2/3 → Maybe, 4/5 → Love. We store the 5-pt value so we keep
// signal for power users and don't lose data.
const FACES = [
  { v: 1, label: '👎', text: 'Pass' },
  { v: 2, label: '😐', text: 'Meh' },
  { v: 4, label: '🙂', text: 'Maybe' },
  { v: 5, label: '😍', text: 'Love it' },
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
    if (e) setError(e.message);
    else setSavedAt(Date.now());
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
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-slate-200 hover:border-slate-300')
              }
            >
              <span className="mr-1 text-base">{f.label}</span>
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
        className="mt-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />

      <div className="mt-2 text-xs text-slate-500">
        {error && <span className="text-red-600">{error}</span>}
        {!error && saving && 'Saving…'}
        {!error && !saving && savedAt && 'Saved ✓'}
      </div>
    </div>
  );
}
