'use client';

import { useEffect, useRef, useState } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabaseBrowser';
import { useToast } from '@/components/Toast';
import { humanError } from '@/lib/humanError';

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
  phase: string;
};

type Message = {
  id: string;
  search_id: string;
  sender_id: string;
  recipient_user_id?: string | null;
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
  const toast = useToast();
  // Stable ref so the long-lived realtime closure can read current threads.
  const threadsRef = useRef(initialThreads);
  useEffect(() => {
    threadsRef.current = threads;
  }, [threads]);

  // Load messages when active thread changes
  useEffect(() => {
    if (!activeId) return;
    if (messages[activeId]) return; // Already loaded
    const clientId = threads.find((t) => t.searchId === activeId)?.clientId || null;
    (async () => {
      // PRIVATE 1:1 with the client only (recipient set + the client involved),
      // distinct from the all-parties group Deal chat.
      let q = supabase
        .from('messages')
        .select('*')
        .eq('search_id', activeId)
        .not('recipient_user_id', 'is', null)
        .order('created_at', { ascending: true });
      if (clientId)
        q = q.or(`sender_id.eq.${clientId},recipient_user_id.eq.${clientId}`);
      const { data } = await q;
      setMessages((prev) => ({ ...prev, [activeId]: (data as Message[]) || [] }));
    })();
  }, [activeId, supabase, messages, threads]);

  // Realtime: subscribe to inserts on messages for any of the firm's threads.
  // Filter is firm_id-scoped so we get every thread in one channel.
  useEffect(() => {
    let cancelled = false;
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
          // Direct-messages hub: ignore group Deal-chat posts (recipient null)
          // AND private threads with other parties - only realtor↔client DMs
          // belong here.
          if (!(msg as any).recipient_user_id) return;
          const tClient = threadsRef.current.find(
            (t) => t.searchId === msg.search_id
          )?.clientId;
          if (
            tClient &&
            msg.sender_id !== tClient &&
            (msg as any).recipient_user_id !== tClient
          )
            return;
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
      .subscribe(async (status) => {
        // Catch-up fetch: close the race window between SSR thread snapshot
        // and realtime subscription. Pull any messages that arrived between
        // the latest preview we know about and now, then merge by id.
        if (status !== 'SUBSCRIBED' || cancelled) return;
        // DIRECT messages only - without the recipient filter this catch-up
        // merged group Deal-chat posts into the private threads.
        const { data, error: fetchErr } = await supabase
          .from('messages')
          .select('id, search_id, sender_id, recipient_user_id, body, created_at')
          .eq('firm_id', firmId)
          .not('recipient_user_id', 'is', null)
          .order('created_at', { ascending: true });
        if (cancelled || fetchErr || !data) return;
        const rows = data as Message[];

        // Group rows by search_id, keeping only the realtor↔client thread
        // (drop private threads with other parties, e.g. attorneys).
        const clientBySearch = new Map(
          threadsRef.current.map((t) => [t.searchId, t.clientId])
        );
        const bySearch = new Map<string, Message[]>();
        for (const m of rows) {
          const cid = clientBySearch.get(m.search_id);
          if (cid && m.sender_id !== cid && m.recipient_user_id !== cid) continue;
          const arr = bySearch.get(m.search_id) || [];
          arr.push(m);
          bySearch.set(m.search_id, arr);
        }

        // Merge into per-thread message cache without dupes (only for threads
        // we've already opened - closed threads will load fresh on click).
        setMessages((prev) => {
          const next = { ...prev };
          for (const [sid, incoming] of bySearch.entries()) {
            const existing = next[sid];
            if (!existing) continue; // not yet opened
            const seen = new Set(existing.map((m) => m.id));
            const merged = [...existing];
            for (const m of incoming) {
              if (!seen.has(m.id)) {
                merged.push(m);
                seen.add(m.id);
              }
            }
            merged.sort((a, b) => a.created_at.localeCompare(b.created_at));
            next[sid] = merged;
          }
          return next;
        });

        // Refresh thread previews + re-sort if any thread got a newer message
        setThreads((prev) => {
          let changed = false;
          const updated = prev.map((t) => {
            const incoming = bySearch.get(t.searchId);
            if (!incoming || incoming.length === 0) return t;
            const newest = incoming[incoming.length - 1];
            if (t.latest && newest.created_at <= t.latest.created_at) return t;
            changed = true;
            return {
              ...t,
              latest: {
                id: newest.id,
                body: newest.body,
                sender_id: newest.sender_id,
                created_at: newest.created_at,
              },
            };
          });
          if (!changed) return prev;
          // Re-sort threads by latest activity, newest first
          updated.sort((a, b) => {
            const at = a.latest?.created_at || '';
            const bt = b.latest?.created_at || '';
            return bt.localeCompare(at);
          });
          return updated;
        });
      });
    return () => {
      cancelled = true;
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
    // Private 1:1 with the client (recipient-scoped) - NOT the group Deal chat.
    const activeClientId =
      threads.find((t) => t.searchId === activeId)?.clientId || null;
    const { data: inserted, error: e } = await supabase
      .from('messages')
      .insert({
        firm_id: firmId,
        search_id: activeId,
        sender_id: currentUserId,
        recipient_user_id: activeClientId,
        body,
      })
      .select('*')
      .single();
    if (e) {
      const msg = humanError(e);
      setError(msg);
      toast.show(msg, { variant: 'error' });
      setDraft(body); // restore
    } else if (inserted) {
      // Optimistically inject the message so the sender sees it immediately
      // without relying on the realtime channel. The realtime listener
      // dedupes by id when the broadcast arrives.
      const full = inserted as unknown as Message;
      setMessages((prev) => {
        const list = prev[activeId] || [];
        if (list.some((m) => m.id === full.id)) return prev;
        return { ...prev, [activeId]: [...list, full] };
      });
      setThreads((prev) => {
        const idx = prev.findIndex((t) => t.searchId === activeId);
        if (idx === -1) return prev;
        const updated = {
          ...prev[idx],
          latest: {
            id: full.id,
            body: full.body,
            sender_id: full.sender_id,
            created_at: full.created_at,
          },
        };
        const rest = prev.filter((_, i) => i !== idx);
        return [updated, ...rest];
      });
      // Fire-and-forget push to the client side
      fetch('/api/notifications/send-push', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          searchId: activeId,
          messageId: full.id,
          kind: 'message',
        }),
      }).catch(() => {});
    }
    setSending(false);
  }

  const active = threads.find((t) => t.searchId === activeId) || null;
  const activeLoading = !!activeId && messages[activeId] === undefined;
  const activeMessages = activeId ? messages[activeId] || [] : [];

  return (
    <div className="grid h-[calc(100vh-12rem)] grid-cols-12 gap-0 overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-soft-sm">
      {/* Left: thread list */}
      <aside className="col-span-12 max-h-72 overflow-y-auto border-b border-ink-200 md:col-span-4 md:max-h-none md:border-b-0 md:border-r">
        {threads.map((t) => {
          const isActive = t.searchId === activeId;
          const initials = (t.clientName || '?')
            .split(' ')
            .map((w) => w[0])
            .slice(0, 2)
            .join('')
            .toUpperCase();
          return (
            <button
              key={t.searchId}
              onClick={() => setActiveId(t.searchId)}
              aria-current={isActive ? 'true' : undefined}
              className={
                'flex w-full items-center gap-3 border-b border-ink-100 px-4 py-3 text-left transition hover:bg-ink-50 ' +
                (isActive ? 'bg-ink-50 shadow-[inset_3px_0_0_0_#0f172a]' : '')
              }
            >
              <span
                className={
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ' +
                  (isActive
                    ? 'bg-ink-900 text-white'
                    : 'bg-ink-100 text-ink-700')
                }
              >
                {initials}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-ink-900">
                    {t.clientName}
                  </span>
                  {t.latest && (
                    <span className="shrink-0 text-[11px] text-ink-400">
                      {timeAgo(t.latest.created_at)}
                    </span>
                  )}
                </span>
                {t.latest ? (
                  <span className="mt-0.5 block truncate text-xs text-ink-500">
                    {t.latest.sender_id === currentUserId ? 'You: ' : ''}
                    {t.latest.body}
                  </span>
                ) : (
                  <span className="mt-0.5 block text-xs italic text-ink-400">
                    No messages yet
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </aside>

      {/* Right: active conversation */}
      <section className="col-span-12 flex flex-col md:col-span-8">
        {!active ? (
          <div className="flex flex-1 items-center justify-center text-sm text-ink-500">
            Select a conversation
          </div>
        ) : (
          <>
            <header className="flex items-center justify-between gap-3 border-b border-ink-200 bg-white px-5 py-3">
              <div className="min-w-0">
                <div className="truncate font-semibold text-ink-900">
                  {active.clientName}
                </div>
                {active.clientEmail && (
                  <div className="truncate text-xs text-ink-500">
                    {active.clientEmail}
                  </div>
                )}
              </div>
              <span className="shrink-0 rounded-full bg-ink-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-ink-600">
                Private · 1:1
              </span>
            </header>

            <div
              ref={scrollRef}
              className="flex-1 space-y-2 overflow-y-auto bg-ink-50 px-5 py-4"
            >
              {activeLoading ? (
                <div className="flex items-center justify-center py-10">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-ink-200 border-t-ink-900" />
                </div>
              ) : activeMessages.length === 0 ? (
                <div className="py-8 text-center text-sm text-ink-400">
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
                          'max-w-[75%] rounded-2xl px-4 py-2.5 text-sm shadow-soft-xs ' +
                          (own
                            ? 'rounded-br-md bg-ink-900 text-white'
                            : 'rounded-bl-md border border-ink-200 bg-white text-ink-900')
                        }
                      >
                        <div className="whitespace-pre-wrap break-words">{m.body}</div>
                        <div
                          className={
                            'mt-1 text-[10px] ' +
                            (own ? 'text-white/60' : 'text-ink-400')
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
              className="flex gap-2 border-t border-ink-200 bg-white px-4 py-3"
            >
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Type a message…"
                disabled={sending}
                className="input flex-1"
              />
              <button
                type="submit"
                disabled={!draft.trim() || sending}
                className="btn-primary shrink-0"
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
