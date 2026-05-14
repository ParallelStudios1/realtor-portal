'use client';

import { useState } from 'react';

/**
 * Drop-in button that visually acknowledges a click within the same frame:
 * spinner + disabled while its onClick runs. Solves the "is anything
 * happening?" problem that caused duplicate submissions.
 *
 * Minimum 200ms pending state so even instant actions show a flash of
 * feedback — eliminates "did I click that?" doubt.
 */
export function PendingButton({
  onClick,
  children,
  variant = 'primary',
  className = '',
  type = 'button',
  disabled,
  pendingLabel,
}: {
  onClick?: () => any | Promise<any>;
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  className?: string;
  type?: 'button' | 'submit';
  disabled?: boolean;
  pendingLabel?: string;
}) {
  const [pending, setPending] = useState(false);

  const base =
    'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60';
  const tone =
    variant === 'primary'
      ? 'bg-slate-900 text-white hover:bg-slate-700'
      : variant === 'danger'
      ? 'bg-rose-600 text-white hover:bg-rose-700'
      : variant === 'ghost'
      ? 'bg-transparent text-slate-700 hover:bg-slate-100'
      : 'bg-white text-slate-900 ring-1 ring-slate-300 hover:bg-slate-50';

  async function handle() {
    if (!onClick || pending) return;
    setPending(true);
    const startedAt = Date.now();
    try {
      await Promise.resolve(onClick());
    } finally {
      const elapsed = Date.now() - startedAt;
      if (elapsed < 200) {
        setTimeout(() => setPending(false), 200 - elapsed);
      } else {
        setPending(false);
      }
    }
  }

  return (
    <button
      type={type}
      disabled={disabled || pending}
      onClick={handle}
      className={base + ' ' + tone + ' ' + className}
      aria-busy={pending}
    >
      {pending && <Spinner />}
      <span>{pending && pendingLabel ? pendingLabel : children}</span>
    </button>
  );
}

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      aria-hidden
    >
      <path d="M22 12a10 10 0 1 1-10-10" strokeLinecap="round" />
    </svg>
  );
}
