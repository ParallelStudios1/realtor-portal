'use client';

import { useState, useTransition } from 'react';
import { useToast } from '@/components/Toast';

/**
 * Visible "Send test text" button — calls /api/debug/test-sms with a
 * phone number the realtor types in, then surfaces the FULL Twilio
 * response (status + sid + error fields) right in a toast so they can
 * see exactly what happened. Lives on Settings + at the top of Deals
 * so it's always one click away when they think SMS is broken.
 */
export function TestSmsButton({ defaultPhone }: { defaultPhone?: string }) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState(defaultPhone || '');
  const [pending, start] = useTransition();
  const [result, setResult] = useState<any>(null);
  const toast = useToast();

  const submit = () => {
    if (!phone.trim()) {
      toast.show('Enter a phone first.', { variant: 'error' });
      return;
    }
    start(async () => {
      try {
        const r = await fetch('/api/debug/test-sms', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ phone: phone.trim() }),
        });
        const json = await r.json();
        setResult(json);
        if (json.ok) {
          toast.show('Test text sent — Twilio sid ' + (json.sid || '—'), {
            variant: 'success',
          });
        } else {
          toast.show('Twilio said: ' + (json.error || 'unknown error'), {
            variant: 'error',
          });
        }
      } catch (e: any) {
        toast.show('Network error: ' + (e?.message || 'unknown'), {
          variant: 'error',
        });
      }
    });
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-secondary text-xs"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="7" y="3" width="10" height="18" rx="2" />
          <path d="M11 18h2" />
        </svg>
        Send a test text
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-ink-200 bg-white p-4 shadow-soft">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-bold">Send a test text</h3>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setResult(null);
          }}
          className="text-xs text-ink-500 hover:text-ink-900"
        >
          Close
        </button>
      </div>
      <p className="mb-3 text-xs text-ink-600">
        We&apos;ll fire a Twilio SMS to this number and show you exactly what
        happened. Use this to confirm SMS works before relying on it for
        invites.
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          className="input flex-1 text-sm"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="(555) 123-4567"
          autoComplete="tel"
        />
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="btn-primary text-xs"
        >
          {pending ? 'Sending…' : 'Send test'}
        </button>
      </div>
      {result && (
        <pre className="mt-3 max-h-64 overflow-auto rounded-md bg-ink-900 p-3 text-[11px] leading-relaxed text-ink-50">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
