import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getMe, getSupabaseServerClient } from '@/lib/supabaseSsr';
import { AddContactButton, ManualContactControls } from './ContactsClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Contacts · Realtor Portal' };

/**
 * Contacts — the realtor's address book. Pulls every person they've ever
 * touched in the system (firm members, clients, deal participants, attorneys)
 * AND any manually-added firm_contacts (external co-realtors, lenders,
 * inspectors that aren't on a deal yet). Dedupes by email.
 */
type Contact = {
  // dedup key — lowercased email when present, else a synthetic key
  // ("manual:<id>" for manual contacts with no email).
  key: string;
  email: string | null;
  name: string | null;
  phone: string | null;
  company: string | null;
  notes: string | null;
  roles: Set<string>;
  dealCount: number;
  // Whichever source we saw first — purely informational.
  source: 'user' | 'participant' | 'attorney' | 'manual';
  // Populated when this contact was added by hand via the Add Contact
  // modal. Gives us an id to attach edit/remove controls to.
  manualId?: string;
};

export default async function ContactsPage({
  searchParams,
}: {
  searchParams?: { q?: string; role?: string };
}) {
  const me = await getMe();
  if (!me) {
    redirect('/login');
  }
  const supabase = getSupabaseServerClient();
  const q = (searchParams?.q || '').trim().toLowerCase();
  const roleFilter = (searchParams?.role || '').trim().toLowerCase();

  const [
    { data: firmUsers },
    { data: participants },
    { data: attorneySearches },
    { data: manualContacts },
  ] = await Promise.all([
    supabase
      .from('users')
      .select('id, full_name, email, phone, role')
      .eq('firm_id', me.firm_id!),
    supabase
      .from('deal_participants')
      .select('external_name, external_email, external_phone, role, search_id')
      .eq('firm_id', me.firm_id!)
      .not('external_email', 'is', null),
    supabase
      .from('client_searches')
      .select('attorney_name, attorney_email, attorney_phone, id')
      .eq('firm_id', me.firm_id!)
      .not('attorney_email', 'is', null),
    supabase
      .from('firm_contacts')
      .select('id, name, email, phone, role, company, notes')
      .eq('firm_id', me.firm_id!)
      .order('created_at', { ascending: false }),
  ]);

  const map = new Map<string, Contact>();

  const upsert = (
    next: Omit<Contact, 'roles' | 'dealCount'> & {
      role: string;
      incrementDeal: boolean;
    }
  ) => {
    const existing = map.get(next.key);
    if (existing) {
      if (next.name && !existing.name) existing.name = next.name;
      if (next.phone && !existing.phone) existing.phone = next.phone;
      if (next.email && !existing.email) existing.email = next.email;
      if (next.company && !existing.company) existing.company = next.company;
      if (next.notes && !existing.notes) existing.notes = next.notes;
      existing.roles.add(next.role);
      if (next.incrementDeal) existing.dealCount += 1;
      // Manual id wins so the edit/remove controls always show on a card
      // that came from firm_contacts.
      if (next.manualId && !existing.manualId) {
        existing.manualId = next.manualId;
        existing.source = 'manual';
      }
    } else {
      map.set(next.key, {
        key: next.key,
        email: next.email,
        name: next.name,
        phone: next.phone,
        company: next.company,
        notes: next.notes,
        roles: new Set([next.role]),
        dealCount: next.incrementDeal ? 1 : 0,
        source: next.source,
        manualId: next.manualId,
      });
    }
  };

  for (const u of (firmUsers || []) as any[]) {
    if (!u.email) continue;
    upsert({
      key: ('email:' + u.email).toLowerCase(),
      email: u.email,
      name: u.full_name,
      phone: u.phone,
      company: null,
      notes: null,
      role: u.role || 'user',
      source: 'user',
      incrementDeal: false,
    });
  }
  for (const p of (participants || []) as any[]) {
    if (!p.external_email) continue;
    upsert({
      key: ('email:' + p.external_email).toLowerCase(),
      email: p.external_email,
      name: p.external_name,
      phone: p.external_phone,
      company: null,
      notes: null,
      role: p.role || 'other',
      source: 'participant',
      incrementDeal: true,
    });
  }
  for (const s of (attorneySearches || []) as any[]) {
    if (!s.attorney_email) continue;
    upsert({
      key: ('email:' + s.attorney_email).toLowerCase(),
      email: s.attorney_email,
      name: s.attorney_name,
      phone: s.attorney_phone,
      company: null,
      notes: null,
      role: 'attorney',
      source: 'attorney',
      incrementDeal: true,
    });
  }
  for (const c of (manualContacts || []) as any[]) {
    // Manual contacts without an email get a synthetic key based on their
    // row id so the dedup map still treats them as unique.
    const key = c.email
      ? 'email:' + c.email.toLowerCase()
      : 'manual:' + c.id;
    upsert({
      key,
      email: c.email,
      name: c.name,
      phone: c.phone,
      company: c.company,
      notes: c.notes,
      role: c.role || 'contact',
      source: 'manual',
      incrementDeal: false,
      manualId: c.id,
    });
  }

  const all = Array.from(map.values());
  const filtered = all.filter((c) => {
    if (q) {
      const hay = [c.email, c.name, c.company, c.notes, c.phone]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (roleFilter) {
      let has = false;
      for (const r of c.roles)
        if (r.toLowerCase().includes(roleFilter)) {
          has = true;
          break;
        }
      if (!has) return false;
    }
    return true;
  });
  filtered.sort((a, b) =>
    (a.name || a.email || '').localeCompare(b.name || b.email || '')
  );

  // Compute role facets for the chip bar.
  const roleCounts = new Map<string, number>();
  for (const c of all) {
    for (const r of c.roles) {
      roleCounts.set(r, (roleCounts.get(r) || 0) + 1);
    }
  }
  const roleEntries = Array.from(roleCounts.entries()).sort(
    (a, b) => b[1] - a[1]
  );

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-ink-500">
            Address book
          </div>
          <h1 className="mt-1.5 text-3xl font-bold tracking-tight text-ink-900">Contacts</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-600">
            Every person you&apos;ve worked with — clients, co-realtors,
            attorneys, inspectors, lenders. Auto-built from your past deals,
            plus anyone you add by hand.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form className="flex gap-2">
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Search name, email, company…"
              className="input w-64"
            />
            {roleFilter && (
              <input type="hidden" name="role" value={roleFilter} />
            )}
            <button type="submit" className="btn-secondary text-xs">
              Search
            </button>
          </form>
          <AddContactButton />
        </div>
      </header>

      {/* Role chips */}
      <div className="mb-4 flex flex-wrap gap-2">
        <Link
          href={'/dashboard/contacts' + (q ? '?q=' + encodeURIComponent(q) : '')}
          className={
            'rounded-full px-3 py-1.5 text-xs font-semibold ' +
            (!roleFilter
              ? 'bg-ink-900 text-white'
              : 'bg-ink-100 text-ink-700 hover:bg-ink-200')
          }
        >
          All <span className="ml-1 opacity-70">{all.length}</span>
        </Link>
        {roleEntries.map(([r, n]) => (
          <Link
            key={r}
            href={
              '/dashboard/contacts?role=' +
              encodeURIComponent(r) +
              (q ? '&q=' + encodeURIComponent(q) : '')
            }
            className={
              'rounded-full px-3 py-1.5 text-xs font-semibold capitalize ' +
              (roleFilter === r
                ? 'bg-ink-900 text-white'
                : 'bg-ink-100 text-ink-700 hover:bg-ink-200')
            }
          >
            {r.replace(/_/g, ' ')}{' '}
            <span className="ml-1 opacity-70">{n}</span>
          </Link>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-dotted rounded-2xl border border-dashed border-ink-300 bg-white p-14 text-center shadow-soft-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-ink-900 text-white shadow-soft-sm">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-7 w-7" aria-hidden>
              <rect x="4" y="3" width="16" height="18" rx="2" />
              <circle cx="12" cy="11" r="3" />
              <path d="M7 18c.8-2 2.7-3 5-3s4.2 1 5 3" strokeLinecap="round" />
            </svg>
          </div>
          <h2 className="mt-4 text-base font-semibold text-ink-900">No contacts yet</h2>
          <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-ink-600">
            Anyone you invite to a deal automatically lands here. You can also
            add someone manually — a co-realtor at another firm, your usual
            lender, an inspector — without putting them on a deal first.
          </p>
          <div className="mt-6 flex justify-center">
            <AddContactButton />
          </div>
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((c) => (
            <li
              key={c.key}
              className="rounded-2xl border border-ink-200 bg-white p-4 shadow-soft-sm transition hover:-translate-y-0.5 hover:border-ink-300 hover:shadow-soft-md"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink-100 text-sm font-bold text-ink-700">
                  {initials(c.name || c.email || '?')}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-ink-900">
                    {c.name || c.email || 'Unnamed contact'}
                  </div>
                  {c.company && (
                    <div className="truncate text-xs text-ink-600">
                      {c.company}
                    </div>
                  )}
                  {c.email && (
                    <a
                      href={'mailto:' + c.email}
                      className="block truncate text-xs font-medium text-ink-600 transition hover:text-ink-900 hover:underline"
                    >
                      {c.email}
                    </a>
                  )}
                  {c.phone && (
                    <a
                      href={'tel:' + c.phone}
                      className="block text-xs font-medium text-ink-600 transition hover:text-ink-900 hover:underline"
                    >
                      {c.phone}
                    </a>
                  )}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {Array.from(c.roles).map((r) => (
                  <span
                    key={r}
                    className="rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-700"
                  >
                    {r.replace(/_/g, ' ')}
                  </span>
                ))}
                {c.dealCount > 0 && (
                  <span className="rounded-full bg-ink-900 px-2 py-0.5 text-[10px] font-semibold text-white">
                    {c.dealCount} deal{c.dealCount === 1 ? '' : 's'}
                  </span>
                )}
                {c.manualId && c.dealCount === 0 && (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                    Added manually
                  </span>
                )}
              </div>
              {c.notes && (
                <p className="mt-2 line-clamp-3 text-xs text-ink-600">
                  {c.notes}
                </p>
              )}
              {c.manualId && (
                <ManualContactControls
                  contact={{
                    id: c.manualId,
                    name: c.name,
                    email: c.email,
                    phone: c.phone,
                    role: pickKnownRole(c.roles),
                    company: c.company,
                    notes: c.notes,
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function initials(s: string) {
  return s.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

/**
 * The card's roles set can contain anything (e.g. 'firm_admin', 'buyer',
 * etc) but the Edit modal only knows about a fixed role enum. Pick the
 * first one that matches a known option so the dropdown opens on the
 * right value when the user clicks Edit.
 */
const KNOWN_ROLES = new Set([
  'realtor',
  'attorney',
  'lender',
  'inspector',
  'photographer',
  'contractor',
  'assistant',
  'other',
]);
function pickKnownRole(roles: Set<string>): string | null {
  for (const r of roles) {
    if (KNOWN_ROLES.has(r)) return r;
  }
  return null;
}
