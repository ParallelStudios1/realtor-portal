'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

type Props = {
  firmName: string;
  logoUrl: string | null;
  tagline: string | null;
  email: string | null;
  accentColor: string;
  // Server action passed down from layout
  logoutAction: () => Promise<void> | void;
};

const ITEMS = [
  { href: '/client', label: 'Home' },
  { href: '/client/houses', label: 'Houses' },
  { href: '/client/messages', label: 'Messages' },
  { href: '/client/documents', label: 'Documents' },
  { href: '/client/profile', label: 'Profile' },
];

export function ClientNav({
  firmName,
  logoUrl,
  tagline,
  email,
  accentColor,
  logoutAction,
}: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) =>
    href === '/client' ? pathname === '/client' : pathname?.startsWith(href);

  return (
    <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 text-white sm:px-6">
      <Link href="/client" className="flex items-center gap-3 truncate">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt=""
            className="h-9 w-9 shrink-0 rounded-lg bg-white object-contain p-1"
          />
        ) : (
          <div className="h-9 w-9 shrink-0 rounded-lg bg-white/20" />
        )}
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold leading-tight">
            {firmName}
          </div>
          {tagline && (
            <div className="truncate text-xs opacity-80">{tagline}</div>
          )}
        </div>
      </Link>

      {/* Desktop nav */}
      <nav className="hidden items-center gap-1 text-sm md:flex">
        {ITEMS.map((it) => (
          <Link
            key={it.href}
            href={it.href}
            className={
              'rounded-md px-3 py-1.5 transition ' +
              (isActive(it.href)
                ? 'bg-white/15 font-semibold'
                : 'opacity-80 hover:bg-white/10 hover:opacity-100')
            }
          >
            {it.label}
          </Link>
        ))}
        <form action={logoutAction}>
          <button
            type="submit"
            className="ml-2 rounded-md border border-white/30 px-3 py-1.5 text-xs opacity-80 hover:bg-white/10 hover:opacity-100"
          >
            Sign out
          </button>
        </form>
      </nav>

      {/* Mobile burger */}
      <button
        type="button"
        aria-label="Toggle menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="rounded-md border border-white/30 px-3 py-1.5 text-sm md:hidden"
      >
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {open ? (
            <path d="M18 6 6 18M6 6l12 12" />
          ) : (
            <path d="M4 6h16M4 12h16M4 18h16" />
          )}
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-30 border-b border-ink-200 bg-white shadow-md md:hidden">
          <div className="mx-auto flex max-w-6xl flex-col px-4 py-2">
            {ITEMS.map((it) => (
              <Link
                key={it.href}
                href={it.href}
                onClick={() => setOpen(false)}
                className={
                  'rounded-md px-3 py-2.5 text-sm ' +
                  (isActive(it.href)
                    ? 'bg-ink-100 font-semibold text-ink-900'
                    : 'text-ink-700 hover:bg-ink-50')
                }
              >
                {it.label}
              </Link>
            ))}
            <form action={logoutAction} className="border-t border-ink-100 pt-2">
              <button
                type="submit"
                className="w-full rounded-md px-3 py-2.5 text-left text-sm text-ink-600 hover:bg-ink-50"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
