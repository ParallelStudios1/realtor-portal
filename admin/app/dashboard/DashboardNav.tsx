'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { logoutAction } from '../login/actions';

type Props = {
  firmName: string | null;
  firmLogoUrl: string | null;
  firmBrandColor: string | null;
  email: string | null;
  isFirmAdmin?: boolean;
};

const ITEMS = [
  { href: '/dashboard', label: 'Overview', icon: HomeIcon },
  { href: '/dashboard/deals', label: 'Deals', icon: DealsIcon },
  { href: '/dashboard/analytics', label: 'Analytics', icon: AnalyticsIcon },
  { href: '/dashboard/clients', label: 'Clients', icon: ClientsIcon },
  { href: '/dashboard/contacts', label: 'Contacts', icon: ContactsIcon },
  { href: '/dashboard/inbox', label: 'Inbox', icon: InboxIcon },
  { href: '/dashboard/messages', label: 'Messages', icon: MessagesIcon },
];

const SECONDARY_BASE = [
  { href: '/dashboard/tours', label: 'Tour requests' },
  { href: '/dashboard/branding', label: 'Branding' },
  { href: '/dashboard/billing', label: 'Billing' },
  { href: '/dashboard/settings', label: 'Settings' },
];

// "Firm control" appears in the More menu only for owners / firm_admins.
function buildSecondary(isFirmAdmin?: boolean) {
  if (!isFirmAdmin) return SECONDARY_BASE;
  return [{ href: '/dashboard/firm', label: 'Firm control' }, ...SECONDARY_BASE];
}

export function DashboardNav({
  firmName,
  firmLogoUrl,
  firmBrandColor,
  email,
  isFirmAdmin,
}: Props) {
  const SECONDARY = buildSecondary(isFirmAdmin);
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [inboxCount, setInboxCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const fetchCount = () => {
      fetch('/api/inbox/count?h=24')
        .then((r) => (r.ok ? r.json() : { count: 0 }))
        .then((j) => {
          if (!cancelled) setInboxCount(j?.count || 0);
        })
        .catch(() => {});
    };
    fetchCount();
    const t = setInterval(fetchCount, 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  const isActive = (href: string) =>
    href === '/dashboard'
      ? pathname === '/dashboard'
      : pathname?.startsWith(href);

  // close drawer on route change
  useEffect(() => {
    setOpen(false);
    setMenu(false);
  }, [pathname]);

  return (
    <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
      <Link href="/dashboard" className="flex items-center gap-3 truncate">
        {firmLogoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={firmLogoUrl}
            alt=""
            className="h-9 w-9 shrink-0 rounded-lg object-contain ring-1 ring-ink-200"
          />
        ) : (
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white shadow-soft-sm"
            style={{ backgroundColor: firmBrandColor || '#0F172A' }}
          >
            {(firmName || '?').slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <div className="truncate text-sm font-bold leading-tight text-ink-900">
            {firmName}
          </div>
          <div className="truncate text-[11px] text-ink-500">{email}</div>
        </div>
      </Link>

      {/* Desktop nav */}
      <nav className="hidden items-center gap-0.5 text-sm md:flex">
        {ITEMS.map((it) => {
          const isInbox = it.href === '/dashboard/inbox';
          const badge = isInbox && inboxCount > 0;
          const active = isActive(it.href);
          const Icon = it.icon;
          return (
            <Link
              key={it.href}
              href={it.href}
              className={
                'relative flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition ' +
                (active
                  ? 'text-white shadow-soft-sm'
                  : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900')
              }
              // Active pill picks up the firm's brand color so the
              // realtor's dashboard feels like THEIR brand, not generic
              // black. Falls back to ink-900 when no firm brand is set.
              style={
                active
                  ? { backgroundColor: firmBrandColor || '#0F172A' }
                  : undefined
              }
            >
              <Icon className="h-4 w-4" />
              <span>{it.label}</span>
              {badge && (
                <span
                  className={
                    'ml-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold ' +
                    (active ? 'bg-white text-ink-900' : 'bg-rose-600 text-white')
                  }
                >
                  {inboxCount > 99 ? '99+' : inboxCount}
                </span>
              )}
            </Link>
          );
        })}

        {/* Settings dropdown */}
        <div className="relative ml-1">
          <button
            type="button"
            onClick={() => setMenu((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menu}
            className={
              'flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium transition ' +
              (SECONDARY.some((s) => isActive(s.href))
                ? 'bg-ink-100 text-ink-900'
                : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900')
            }
          >
            <CogIcon className="h-4 w-4" />
            <span className="hidden lg:inline">More</span>
            <svg
              viewBox="0 0 12 12"
              className={'h-3 w-3 transition ' + (menu ? 'rotate-180' : '')}
            >
              <path
                d="M3 4.5L6 7.5L9 4.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
          {menu && (
            <>
              <div
                className="fixed inset-0 z-30"
                aria-hidden
                onClick={() => setMenu(false)}
              />
              <div
                role="menu"
                className="absolute right-0 z-40 mt-1 w-44 origin-top-right animate-fade-in rounded-xl border border-ink-200 bg-white py-1 shadow-soft-lg"
              >
                {SECONDARY.map((s) => (
                  <Link
                    key={s.href}
                    role="menuitem"
                    href={s.href}
                    className={
                      'block px-3 py-2 text-sm transition ' +
                      (isActive(s.href)
                        ? 'bg-ink-50 font-semibold text-ink-900'
                        : 'text-ink-700 hover:bg-ink-50')
                    }
                  >
                    {s.label}
                  </Link>
                ))}
                <div className="my-1 border-t border-ink-100" />
                <form action={logoutAction}>
                  <button
                    className="w-full px-3 py-2 text-left text-sm text-ink-600 hover:bg-ink-50"
                    role="menuitem"
                  >
                    Sign out
                  </button>
                </form>
              </div>
            </>
          )}
        </div>
      </nav>

      {/* Mobile burger */}
      <button
        type="button"
        aria-label="Toggle menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg border border-ink-300 px-3 py-2 text-ink-700 transition hover:bg-ink-50 md:hidden"
      >
        {open ? '✕' : '☰'}
      </button>

      {/* Mobile drawer */}
      {open && (
        <div className="absolute left-0 right-0 top-full z-30 animate-fade-in border-b border-ink-200 bg-white shadow-soft-md md:hidden">
          <div className="mx-auto flex max-w-7xl flex-col px-4 py-2">
            {ITEMS.map((it) => {
              const Icon = it.icon;
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  onClick={() => setOpen(false)}
                  className={
                    'flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm transition ' +
                    (isActive(it.href)
                      ? 'bg-ink-900 font-semibold text-white'
                      : 'text-ink-700 hover:bg-ink-50')
                  }
                >
                  <Icon className="h-4 w-4" />
                  <span>{it.label}</span>
                </Link>
              );
            })}
            <div className="my-1 border-t border-ink-100" />
            {SECONDARY.map((s) => (
              <Link
                key={s.href}
                href={s.href}
                onClick={() => setOpen(false)}
                className={
                  'rounded-lg px-3 py-2.5 text-sm transition ' +
                  (isActive(s.href)
                    ? 'bg-ink-100 font-semibold text-ink-900'
                    : 'text-ink-700 hover:bg-ink-50')
                }
              >
                {s.label}
              </Link>
            ))}
            <form action={logoutAction} className="border-t border-ink-100 pt-2">
              <button className="w-full rounded-lg px-3 py-2.5 text-left text-sm text-ink-600 hover:bg-ink-50">
                Sign out
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/* Icon helpers — inline SVGs so we don't pay for a packaged icon set. */
function HomeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path
        d="M3 10.5L12 3l9 7.5V20a1 1 0 01-1 1h-5v-6h-6v6H4a1 1 0 01-1-1v-9.5z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function DealsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <rect x="3" y="5" width="18" height="14" rx="2" strokeLinejoin="round" />
      <path d="M3 9h18" strokeLinecap="round" />
      <path d="M9 13h2M9 16h6" strokeLinecap="round" />
    </svg>
  );
}
function AnalyticsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path d="M4 20V10" strokeLinecap="round" />
      <path d="M10 20V4" strokeLinecap="round" />
      <path d="M16 20v-7" strokeLinecap="round" />
      <path d="M22 20H2" strokeLinecap="round" />
    </svg>
  );
}
function ClientsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3 2.7-5 6-5s6 2 6 5" strokeLinecap="round" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M16 14c2.4 0 5 1.6 5 4" strokeLinecap="round" />
    </svg>
  );
}
function InboxIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path
        d="M4 13l2-7h12l2 7v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5z"
        strokeLinejoin="round"
      />
      <path d="M4 13h5l1 2h4l1-2h5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function MessagesIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path
        d="M21 12a8 8 0 11-3.1-6.32L21 5l-1 4 1 1a8 8 0 010 2z"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function TourIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 3v4M16 3v4" strokeLinecap="round" />
    </svg>
  );
}
function ContactsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <circle cx="12" cy="11" r="3" />
      <path d="M7 18c.8-2 2.7-3 5-3s4.2 1 5 3" strokeLinecap="round" />
    </svg>
  );
}
function CogIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <circle cx="12" cy="12" r="3" />
      <path
        d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
