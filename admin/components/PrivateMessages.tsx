'use client';

import { useEffect, useState, useTransition } from 'react';
import {
  getPrivateThread,
  sendPrivateMessage,
  type PrivateParty,
  type PrivateMessage,
} from '@/app/dashboard/deals/[id]/privateActions';

const ROLE_LABEL: Record<string, string> = {
  realtor: 'Realtor',
  co_realtor: 'Co-realtor',
  client: 'Client',
  buyer: 'Buyer',
  seller: 'Seller',
  attorney: 'Attorney',
  inspector: 'Inspector',
  lender: 'Lender',
  appraiser: 'Appraiser',
  title_agent: 'Title agent',
  mortgage_broker: 'Mortgage broker',
  other: 'Party',
};

/**
 * Private 1:1 messaging panel for a deal. Pick a party, see your private thread
 * with them, send a message. Distinct from the deal group chat - only the two
 * of you can read these. Used on the attorney workspace and the universal deal
 * view.
 */
export function PrivateMessages({
  searchId,
  parties,
  accent = '#0F172A',
}: {
  searchId: string;
  parties: PrivateParty[];
  accent?: string;
}) {
  const [activeKey, setActiveKey] = useState<string>(parties[0]?.key || '');
  const [messages, setMessages] = useState<PrivateMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [, startSend] = useTransition();

  const active = parties.find((p) => p.key === activeKey) || null;

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getPrivateThread(searchId, {
      userId: active.userId,
      email: active.email,
    }).then((r) => {
      if (cancelled) return;
      setLoading(false);
      if (r.ok) setMessages(r.messages);
      else setError(r.error);
    });
    return () => {
      cancelled = true;
    };
  }, [activeKey, searchId]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = () => {
    if (!active) return;
    const text = draft.trim();
    if (!text) return;
    setError(null);
    startSend(async () => {
      const r = await sendPrivateMessage(
        searchId,
        { userId: active.userId, email: active.email },
        text
      );
      if (r.ok) {
        setMessages((m) => [...m, r.message]);
        setDraft('');
      } else {
        setError(r.error);
      }
    });
  };

  if (parties.length === 0) {
    return (
      <p className="text-sm text-ink-500">
        No other parties to message privately yet.
      </p>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
      {/* Party list */}
      <div className="space-y-1.5">
        {parties.map((p) => {
          const isActive = p.key === activeKey;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => setActiveKey(p.key)}
              className={
                'flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left transition ' +
                (isActive
                  ? 'border-ink-900 bg-ink-900 text-white'
                  : 'border-ink-200 bg-white hover:border-ink-300')
              }
            >
              <span
                className={
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ' +
                  (isActive ? 'bg-white/20 text-white' : 'bg-ink-100 text-ink-700')
                }
              >
                {(p.name || '?').slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">
                  {p.name}
                </span>
                <span
                  className={
                    'block text-[10px] font-medium uppercase tracking-wide ' +
                    (isActive ? 'text-white/70' : 'text-ink-400')
                  }
                >
                  {ROLE_LABEL[p.role] || p.role}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Thread */}
      <div className="flex min-h-[280px] flex-col rounded-xl border border-ink-200 bg-ink-50/40">
        <div className="flex-1 space-y-2 overflow-y-auto p-3" style={{ maxHeight: 360 }}>
          {loading ? (
            <p className="py-8 text-center text-sm text-ink-400">Loading…</p>
          ) : messages.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-400">
              No private messages with {active?.name || 'this party'} yet. Say
              hello - only the two of you can see this.
            </p>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                className={'flex ' + (m.fromMe ? 'justify-end' : 'justify-start')}
              >
                <div
                  className={
                    'max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ' +
                    (m.fromMe
                      ? 'text-white'
                      : 'border border-ink-200 bg-white text-ink-900')
                  }
                  style={m.fromMe ? { backgroundColor: accent } : undefined}
                >
                  <div className="whitespace-pre-wrap break-words">{m.body}</div>
                  <div
                    className={
                      'mt-0.5 text-[10px] ' +
                      (m.fromMe ? 'text-white/70' : 'text-ink-400')
                    }
                  >
                    {new Date(m.created_at).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {error && (
          <p className="px-3 pb-1 text-xs text-rose-600">{error}</p>
        )}

        <div className="flex items-end gap-2 border-t border-ink-200 p-2.5">
          <textarea
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={`Message ${active?.name || ''} privately…`}
            className="max-h-32 flex-1 resize-none rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm focus:border-ink-400 focus:outline-none"
          />
          <button
            type="button"
            onClick={send}
            disabled={!draft.trim()}
            className="shrink-0 rounded-lg px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-50"
            style={{ backgroundColor: accent }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
