'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

/**
 * Lightweight web toast.
 *
 * Wrap the app in <ToastProvider> and call `useToast().show(...)` from any
 * client component beneath. Single toast at a time — calling show() while one
 * is up replaces the message. Slides down from the top, auto-dismisses after
 * `duration` ms (default 3500). Click to dismiss early.
 *
 * No external deps — pure React + Tailwind.
 */

export type ToastVariant = 'success' | 'error' | 'info';

export type ToastOptions = {
  variant?: ToastVariant;
  duration?: number;
};

type ToastContextValue = {
  show: (message: string, options?: ToastOptions) => void;
  hide: () => void;
};

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const DEFAULT_DURATION = 3500;

const VARIANT_CLASSES: Record<ToastVariant, string> = {
  success: 'bg-emerald-600 border-emerald-700',
  error: 'bg-red-600 border-red-700',
  info: 'bg-blue-600 border-blue-700',
};

const VARIANT_ICON: Record<ToastVariant, string> = {
  success: '✓',
  error: '!',
  info: 'i',
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState('');
  const [variant, setVariant] = useState<ToastVariant>('info');
  const [animateIn, setAnimateIn] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const hide = useCallback(() => {
    clearTimer();
    setAnimateIn(false);
    // Allow CSS transition to play before unmounting.
    setTimeout(() => setVisible(false), 200);
  }, []);

  const show = useCallback(
    (msg: string, options?: ToastOptions) => {
      clearTimer();
      setMessage(msg);
      setVariant(options?.variant ?? 'info');
      setVisible(true);
      // Defer animateIn so the element mounts off-screen first.
      setTimeout(() => setAnimateIn(true), 10);
      const duration = options?.duration ?? DEFAULT_DURATION;
      timer.current = setTimeout(hide, duration);
    },
    [hide]
  );

  useEffect(() => {
    return () => clearTimer();
  }, []);

  const value = useMemo<ToastContextValue>(() => ({ show, hide }), [show, hide]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {visible && (
        <div
          className="pointer-events-none fixed inset-x-0 top-4 z-[9999] flex justify-center px-4"
          aria-live="polite"
        >
          <button
            type="button"
            onClick={hide}
            className={
              'pointer-events-auto flex max-w-md items-center gap-2 rounded-lg border px-4 py-3 text-sm font-semibold text-white shadow-lg transition-all duration-200 ' +
              VARIANT_CLASSES[variant] +
              (animateIn
                ? ' translate-y-0 opacity-100'
                : ' -translate-y-4 opacity-0')
            }
          >
            <span
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/20 text-xs"
              aria-hidden="true"
            >
              {VARIANT_ICON[variant]}
            </span>
            <span className="text-left">{message}</span>
          </button>
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Don't throw — toasts are nice-to-have. If used outside the provider
    // we no-op so a missing provider doesn't crash a page.
    return {
      show: (msg) => {
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[toast] no provider mounted; message:', msg);
        }
      },
      hide: () => {},
    };
  }
  return ctx;
}
