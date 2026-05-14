'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { logoutAction } from '../login/actions';

type Props = {
  firmName: string | null;
  firmLogoUrl: string | null;
  firmBrandColor: string | null;
  email: string | null;
};

const ITEMS = [
  { href: '/dashboard', label: 'Overview' },
  { href: '/dashboard/clients', label: 'Clients' },
  { href: '/dashboard/inbox', label: 'Inbox' },
  { href: '/dashboard/messages', label: 'Messages' },
  { href: '/dashboard/tours', label: 'Tours' },
  { href: '/dashboard/branding', label: 'Branding' },
  { href: '/dashboard/billing', label: 'Billing' },
  { href: '/dashboard/settings', label: 'Settings' },
];

export function DashboardNav({
  firmName,
  firmLogoUrl,
  firmBrandColor,
  email,
}: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) =>
    href === '/dashboard'
      ? pathname === '/dashboard'
      : pathname?.startsWith(href);

  return (
    <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
      <Link href="/dashboard" className="flex items-center gap-3 truncate">
        {firmLogoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={firmLogoUrl}
            alt=""
            className="h-8 w-8 shrink-0 rounded object-contain"
          />
        ) : (
          <div
            className="h-8 w-8 shrink-0 rounded"
            style={{ backgroundColor: firmBrandColor || '#0F172A' }}
          />
        )}
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold leading-tight">
            {firmName}
          </div>
          <div className="truncate text-xs text-slate-500">{email}</div>
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
                ? 'bg-slate-100 font-semibold text-slate-900'
                : 'hover:bg-slate-100')
            }
          >
            {it.label}
          </Link>
        ))}
        <form action={logoutAction}>
          <button className="ml-2 rounded-md border border-slate-300 px-3 py-1.5 text-slate-600 hover:bg-slate-50">
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
        className="rounded-md border border-slate-300 px-3 py-1.5 text-slate-700 md:hidden"
      >
        {open ? '✕' : '☰'}
      </button>

      {/* Mobile drawer */}
      {open && (
        <div className="absolute left-0 right-0 top-full z-30 border-b border-slate-200 bg-white shadow-md md:hidden">
          <div className="mx-auto flex max-w-6xl flex-col px-4 py-2">
            {ITEMS.map((it) => (
              <Link
                key={it.href}
                href={it.href}
                onClick={() => setOpen(false)}
                className={
                  'rounded-md px-3 py-2.5 text-sm ' +
                  (isActive(it.href)
                    ? 'bg-slate-100 font-semibold text-slate-900'
                    : 'text-slate-700 hover:bg-slate-50')
                }
              >
                {it.label}
              </Link>
            ))}
            <form action={logoutAction} className="border-t border-slate-100 pt-2">
              <button className="w-full rounded-md px-3 py-2.5 text-left text-sm text-slate-600 hover:bg-slate-50">
                Sign out
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
