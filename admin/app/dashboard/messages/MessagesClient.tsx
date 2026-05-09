'use client';

import { useEffect, useRef, useState } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabaseBrowser';

type Thread = {
  searchId: string;
  clientId: string | null;
  clientName: string;
  clientEmail: string | null;
  latest: {
    id: string;
    body: string;
    sender_id: string;
    created_at: string;
  } | null;
  status: string;
};

type Message = {
  id: string;
  search_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

export function MessagesClient({
  firmId,
  currentUserId,
  threads: initialThreads,
}: {
  firmId: string;
  currentUserId: string;
  threads: Thread[];
}) {
  const [threads, setThreads] = useState(initialThreads);
  const [activeId, setActiveId] = useState<string | null>(
    initialThreads[0]?.searchId || null
  );
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = getSupabaseBrowserClient();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load messages when active thread changes
  useEffect(() => {
    if (!activeId) return;
    if (messages[activeId]) return; // Already loaded
    (async () => {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('search_id', activeId)
        .order('created_at', { ascending: true });
      setMessages((prev) => ({ ...prev, [activeId]: (data as Message[]) || [] }));
    })();
  }, [activeId, supabase, messages]);

  // Realtime: subscribe to inserts on messages for any of the firm's threads.
  // Filter is firm_id-scoped so we get every thread in one channel.
  useEffect(() => {
    const channel = supabase
      .channel(`firm-messages:${firmId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `firm_id=eq.${firmId}`,
        },
        (payload) => {
          const msg = payload.new as Message;
          setMessages((prev) => {
            const list = prev[msg.search_id] || [];
            if (list.some((m) => m.id === msg.id)) return prev; // dedupe
            return { ...prev, [msg.search_id]: [...list, msg] };
          });
          // Bump thread to top with new preview
          setThreads((prev) => {
            const idx = prev.findIndex((t) => t.searchId === msg.search_id);
            if (idx === -1) return prev;
            const updated = {
              ...prev[idx],
              latest: {
                id: msg.id,
                body: msg.body,
                sender_id: msg.sender_id,
                created_at: msg.created_at,
              },
            };
            const rest = prev.filter((_, i) => i !== idx);
            return [updated, ...rest];
          });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [firmId, supabase]);

  // Auto-scroll to bottom on new messages in active thread
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [activeId, messages]);

  async function send() {
    if (!draft.trim() || !activeId || sending) return;
    setSending(true);
    setError(null);
    const body = draft.trim();
    setDraft('');
    const { data: inserted, error: e } = await supabase
      .from('messages')
      .insert({
        firm_id: firmId,
        search_id: activeId,
        sender_id: currentUserId,
        body,
      })
      .select('id')
      .single();
    if (e) {
      setError(e.message);
      setDraft(body); // restore
    } else {
      // Fire-and-forget push to the client side
      fetch('/api/notifications/send-push', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          searchId: activeId,
          messageId: inserted?.id,
          kind: 'message',
        }),
      }).catch(() => {});
    }
    setSending(false);
  }

  const active = threads.find((t) => t.searchId === activeId) || null;
  const activeMessages = activeId ? messages[activeId] || [] : [];

  return (
    <div className="grid h-[calc(100vh-12rem)] grid-cols-12 gap-0 overflow-hidden rounded-xl border border-slate-200 bg-white">
      {/* Left: thread list */}
      <aside className="col-span-12 max-h-72 overflow-y-auto border-b border-slate-200 md:col-span-4 md:max-h-none md:border-b-0 md:border-r">
        {threads.map((t) => {
          const isActive = t.searchId === activeId;
          return (
            <button
              key={t.searchId}
              onClick={() => setActiveId(t.searchId)}
              className={
                'block w-full border-b border-slate-100 px-4 py-3 text-left transition hover:bg-slate-50 ' +
                (isActive ? 'bg-slate-100' : '')
              }
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-semibold">
                  {t.clientName}
                </span>
                {t.latest && (
                  <span className="shrink-0 text-xs text-slate-400">
                    {timeAgo(t.latest.created_at)}
                  </span>
                )}
              </div>
              {t.latest ? (
                <div className="mt-0.5 line-clamp-2 text-xs text-slate-600">
                  {t.latest.sender_id === currentUserId ? 'You: ' : ''}
                  {t.latest.body}
                </div>
              ) : (
                <div className="mt-0.5 text-xs italic text-slate-400">
                  No messages yet
                </div>
              )}
            </button>
          );
        })}
      </aside>

      {/* Right: active conversation */}
      <section className="col-span-12 flex flex-col md:col-span-8">
        {!active ? (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
            Select a conversation
          </div>
        ) : (
          <>
            <header className="border-b border-slate-200 bg-white px-5 py-3">
              <div className="font-semibold">{active.clientName}</div>
              {active.clientEmail && (
                <div className="text-xs text-slate-500">
                  {active.clientEmail}
                </div>
              )}
            </header>

            <div
              ref={scrollRef}
              className="flex-1 space-y-2 overflow-y-auto bg-slate-50 px-5 py-4"
            >
              {activeMessages.length === 0 ? (
                <div className="py-8 text-center text-sm text-slate-400">
                  No messages yet. Send the first one below.
                </div>
              ) : (
                activeMessages.map((m) => {
                  const own = m.sender_id === currentUserId;
                  return (
                    <div
                      key={m.id}
                      className={'flex ' + (own ? 'justify-end' : 'justify-start')}
                    >
                      <div
                        className={
                          'max-w-[75%] rounded-2xl px-4 py-2 text-sm ' +
                          (own
                            ? 'rounded-br-sm bg-blue-600 text-white'
                            : 'rounded-bl-sm bg-white text-slate-900 shadow-sm')
                        }
                      >
                        <div className="whitespace-pre-wrap">{m.body}</div>
                        <div
                          className={
                            'mt-1 text-[10px] ' +
                            (own ? 'text-blue-100' : 'text-slate-400')
                          }
                        >
                          {new Date(m.created_at).toLocaleTimeString([], {
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {error && (
              <div className="border-t border-red-200 bg-red-50 px-5 py-2 text-xs text-red-700">
                {error}
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
              className="flex gap-2 border-t border-slate-200 bg-white px-4 py-3"
            >
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Type a message…"
                disabled={sending}
                className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!draft.trim() || sending}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {sending ? 'Sending…' : 'Send'}
              </button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}
