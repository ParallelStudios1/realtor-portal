'use client';

import { useEffect, useRef, useState } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabaseBrowser';
import { useToast } from '@/components/Toast';
import { humanError } from '@/lib/humanError';

type Message = {
  id: string;
  search_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

export function ClientMessagesClient({
  searchId,
  firmId,
  currentUserId,
  realtorName,
  initialMessages,
}: {
  searchId: string;
  firmId: string;
  currentUserId: string;
  realtorName: string;
  initialMessages: Message[];
}) {
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
          .select('id, search_id, sender_id, body, created_at')
          .eq('search_id', searchId)
          .order('created_at', { ascending: true });
        if (cancelled || fetchErr || !data) return;
        setMessages((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          const merged = [...prev];
          for (const m of data as Message[]) {
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
        body,
      })
      .select('id')
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
    <div className="flex h-[calc(100vh-12rem)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
      <header className="border-b border-slate-200 bg-white px-5 py-3">
        <div className="text-sm font-semibold">{realtorName}</div>
        <div className="text-xs text-slate-500">Your agent</div>
      </header>

      <div
        ref={scrollRef}
        className="flex-1 space-y-2 overflow-y-auto bg-slate-50 px-4 py-4 sm:px-5"
      >
        {messages.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-400">
            No messages yet. Say hi 👋
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
                    'max-w-[80%] rounded-2xl px-4 py-2 text-sm ' +
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
        className="flex gap-2 border-t border-slate-200 bg-white px-3 py-3 sm:px-4"
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
    </div>
  );
}
