'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { LocalDateTime } from '@/components/LocalDateTime';
import { useToast } from '@/components/Toast';
import {
  postDealChatMessage,
  type DealChatMessage,
} from '@/app/dashboard/deals/[id]/chatActions';

/**
 * DEAL GROUP CHAT - the shared thread for the whole deal.
 *
 * One thread per deal (search_id) that every party with message access can
 * read and post to. Distinct from the 1:1 client↔realtor DM. Renders sender
 * name, body, and a local-timezone timestamp (via LocalDateTime, mount-gated,
 * so first paint matches the server and we avoid hydration error #425).
 *
 * Posting goes through the `postDealChatMessage` server action, which
 * re-authorizes on the server. After a successful post we append the returned
 * message optimistically and refresh so other surfaces stay in sync.
 *
 * Flat ink, Inter, no gradients/emojis.
 */
export function DealChat({
  searchId,
  me,
  initialMessages,
  canPost,
}: {
  searchId: string;
  me: { userId: string; name: string | null };
  initialMessages: DealChatMessage[];
  canPost: boolean;
}) {
  const [messages, setMessages] = useState<DealChatMessage[]>(initialMessages);
  const [draft, setDraft] = useState('');
  const [pending, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const toast = useToast();

  // Keep local state in sync if the server re-renders with fresh messages
  // (e.g. after router.refresh() following another party's post).
  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  // Auto-scroll to the newest message.
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  function send() {
    const body = draft.trim();
    if (!body || pending) return;
    startTransition(async () => {
      const r = await postDealChatMessage(searchId, body);
      if (!r.ok) {
        toast.show(r.error || 'Could not send.', { variant: 'error' });
        return;
      }
      setMessages((prev) =>
        prev.some((m) => m.id === r.message.id) ? prev : [...prev, r.message]
      );
      setDraft('');
      router.refresh();
    });
  }

  return (
    <section className="surface overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-ink-100 px-5 py-3.5">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-500">
          Deal chat
        </h2>
        <span className="text-[11px] text-ink-400">
          Everyone on this deal
        </span>
      </div>

      <div
        ref={scrollRef}
        className="max-h-96 space-y-3 overflow-y-auto bg-ink-50 px-4 py-4 sm:px-5"
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
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
              {canPost
                ? 'Start the conversation - everyone on this deal can see it.'
                : 'Messages on this deal will appear here.'}
            </p>
          </div>
        ) : (
          messages.map((m) => {
            const own = m.senderIsYou;
            return (
              <div
                key={m.id}
                className={'flex ' + (own ? 'justify-end' : 'justify-start')}
              >
                <div className="max-w-[80%]">
                  <div
                    className={
                      'mb-0.5 flex items-baseline gap-2 px-1 text-[10px] font-bold uppercase tracking-wide ' +
                      (own ? 'justify-end text-ink-400' : 'text-ink-400')
                    }
                  >
                    <span>{own ? 'You' : m.senderName}</span>
                    <span className="font-medium normal-case tracking-normal text-ink-400">
                      <LocalDateTime
                        value={m.created_at}
                        dateOptions={{ month: 'short', day: 'numeric' }}
                        timeOptions={{ hour: 'numeric', minute: '2-digit' }}
                        separator=" · "
                      />
                    </span>
                  </div>
                  <div
                    className={
                      'rounded-2xl px-4 py-2.5 text-sm shadow-soft-xs ' +
                      (own
                        ? 'rounded-br-md bg-ink-900 text-white'
                        : 'rounded-bl-md border border-ink-200 bg-white text-ink-900')
                    }
                  >
                    <div className="whitespace-pre-wrap break-words">
                      {m.body}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {canPost ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="border-t border-ink-200 bg-white px-3 py-3 sm:px-4"
        >
          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Message everyone on this deal…"
              disabled={pending}
              rows={2}
              className="input flex-1 resize-none"
            />
            <button
              type="submit"
              disabled={!draft.trim() || pending}
              className="btn-primary shrink-0"
            >
              {pending ? (
                <span className="inline-flex items-center gap-1.5">
                  <svg
                    aria-hidden
                    viewBox="0 0 24 24"
                    className="h-3.5 w-3.5 animate-spin"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  >
                    <path d="M12 3a9 9 0 1 0 9 9" />
                  </svg>
                  Sending
                </span>
              ) : (
                'Send'
              )}
            </button>
          </div>
          <p className="mt-1.5 px-1 text-[10px] text-ink-400">
            Visible to everyone on this deal. Press {'⌘'}/Ctrl + Enter to
            send.
          </p>
        </form>
      ) : (
        <div className="border-t border-ink-200 bg-white px-5 py-3 text-[11px] text-ink-400">
          You have read-only access to this deal chat.
        </div>
      )}
    </section>
  );
}
