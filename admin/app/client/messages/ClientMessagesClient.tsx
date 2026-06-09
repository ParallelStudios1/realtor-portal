'use client';

import { useEffect, useRef, useState } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabaseBrowser';
import { useToast } from '@/components/Toast';
import { humanError } from '@/lib/humanError';

type Message = {
  id: string;
  search_id: string;
  sender_id: string;
  recipient_user_id?: string | null;
  body: string;
  created_at: string;
};

export function ClientMessagesClient({
  searchId,
  firmId,
  currentUserId,
  realtorId,
  realtorName,
  initialMessages,
}: {
  searchId: string;
  firmId: string;
  currentUserId: string;
  realtorId: string | null;
  realtorName: string;
  initialMessages: Message[];
}) {
  // This is the PRIVATE 1:1 thread with the agent (recipient-scoped), distinct
  // from the all-parties Deal chat (which is recipient-null / group).
  const involvesAgent = (m: Message) =>
    !!m.recipient_user_id &&
    (m.sender_id === realtorId || m.recipient_user_id === realtorId);
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = getSupabaseBrowserClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const toast = useToast();

  // Realtime: any new INSERT for this search → append
  useEffect(() => {
    let cancelled = false;
    const channel = supabase
      .channel(`client-messages:${searchId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `search_id=eq.${searchId}`,
        },
        (payload) => {
          const msg = payload.new as Message;
          if (!involvesAgent(msg)) return; // ignore group + other-party DMs
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
        }
      )
      .subscribe(async (status) => {
        // Catch-up fetch: close the race window between SSR snapshot and
        // realtime subscription. Any messages inserted between T0 (server
        // fetch) and now would otherwise be silently missed until refresh.
        if (status !== 'SUBSCRIBED' || cancelled) return;
        const { data, error: fetchErr } = await supabase
          .from('messages')
          .select('id, search_id, sender_id, recipient_user_id, body, created_at')
          .eq('search_id', searchId)
          .not('recipient_user_id', 'is', null)
          .order('created_at', { ascending: true });
        if (cancelled || fetchErr || !data) return;
        setMessages((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          const merged = [...prev];
          for (const m of (data as Message[]).filter(involvesAgent)) {
            if (!seen.has(m.id)) {
              merged.push(m);
              seen.add(m.id);
            }
          }
          // Keep chronological order in case realtime races inserted out-of-order
          merged.sort((a, b) => a.created_at.localeCompare(b.created_at));
          return merged;
        });
      });
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [searchId, supabase]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  async function send() {
    if (!draft.trim() || sending) return;
    setSending(true);
    setError(null);
    const body = draft.trim();
    setDraft('');
    const { data: inserted, error: e } = await supabase
      .from('messages')
      .insert({
        firm_id: firmId,
        search_id: searchId,
        sender_id: currentUserId,
        recipient_user_id: realtorId, // private 1:1 with the agent
        body,
      })
      .select('id, recipient_user_id')
      .single();
    if (e) {
      const msg = humanError(e);
      setError(msg);
      toast.show(msg, { variant: 'error' });
      setDraft(body);
    } else {
      // Notify the realtor side via push
      fetch('/api/notifications/send-push', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          searchId,
          messageId: inserted?.id,
          kind: 'message',
        }),
      }).catch(() => {});
    }
    setSending(false);
  }

  return (
    <div className="flex h-[calc(100vh-12rem)] flex-col overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-soft-md">
      <header className="flex items-center gap-3 border-b border-ink-200 bg-white px-5 py-3.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink-900 text-sm font-bold text-white">
          {(realtorName || '?').slice(0, 1).toUpperCase()}
        </div>
        <div>
          <div className="text-sm font-semibold">{realtorName}</div>
          <div className="flex items-center gap-1.5 text-xs text-ink-500">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Your agent
          </div>
        </div>
      </header>

      <div
        ref={scrollRef}
        className="flex-1 space-y-2 overflow-y-auto bg-ink-50 px-4 py-4 sm:px-5"
      >
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-ink-100 text-ink-400">
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <p className="mt-3 text-sm font-medium text-ink-600">
              No messages yet
            </p>
            <p className="mt-0.5 text-xs text-ink-400">
              Say hello to your agent to get started.
            </p>
          </div>
        ) : (
          messages.map((m) => {
            const own = m.sender_id === currentUserId;
            return (
              <div
                key={m.id}
                className={'flex ' + (own ? 'justify-end' : 'justify-start')}
              >
                <div
                  className={
                    'max-w-[80%] rounded-2xl px-4 py-2.5 text-sm shadow-soft-xs ' +
                    (own
                      ? 'rounded-br-md bg-ink-900 text-white'
                      : 'rounded-bl-md border border-ink-200 bg-white text-ink-900')
                  }
                >
                  <div className="whitespace-pre-wrap">{m.body}</div>
                  <div
                    className={
                      'mt-1 text-[10px] ' +
                      (own ? 'text-ink-100' : 'text-ink-400')
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
        className="flex gap-2 border-t border-ink-200 bg-white px-3 py-3 sm:px-4"
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
    </div>
  );
}
