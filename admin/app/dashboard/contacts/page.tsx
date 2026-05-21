import Link from 'next/link';
import { getMe, getSupabaseServerClient } from '@/lib/supabaseSsr';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Contacts · Realtor Portal' };

/**
 * Contacts — the realtor's address book. Pulls every person they've ever
 * touched in the system (firm members, clients, deal participants by email)
 * and dedupes by email. Lets the realtor quickly hit a phone/email or jump
 * to a related deal. Eliminates the "I had that inspector's email
 * somewhere…" re-typing problem.
 */
type Contact = {
  email: string;
  name: string | null;
  phone: string | null;
  roles: Set<string>;
  dealCount: number;
  source: 'user' | 'participant' | 'attorney';
};

export default async function ContactsPage({
  searchParams,
}: {
  searchParams?: { q?: string; role?: string };
}) {
  const me = (await getMe())!;
  const supabase = getSupabaseServerClient();
  const q = (searchParams?.q || '').trim().toLowerCase();
  const roleFilter = (searchParams?.role || '').trim().toLowerCase();

  const [
    { data: firmUsers },
    { data: participants },
    { data: attorneySearches },
  ] = await Promise.all([
    supabase
      .from('users')
      .select('id, full_name, email, phone_number, role')
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
  ]);

  const map = new Map<string, Contact>();

  const add = (
    email: string | null | undefined,
    name: string | null | undefined,
    phone: string | null | undefined,
    role: string,
    source: Contact['source']
  ) => {
    if (!email) return;
    const key = email.toLowerCase();
    const existing = map.get(key);
    if (existing) {
      if (name && !existing.name) existing.name = name;
      if (phone && !existing.phone) existing.phone = phone;
      existing.roles.add(role);
      existing.dealCount += source === 'user' ? 0 : 1;
    } else {
      map.set(key, {
        email,
        name: name || null,
        phone: phone || null,
        roles: new Set([role]),
        dealCount: source === 'user' ? 0 : 1,
        source,
      });
    }
  };

  for (const u of (firmUsers || []) as any[]) {
    add(u.email, u.full_name, u.phone_number, u.role || 'user', 'user');
  }
  for (const p of (participants || []) as any[]) {
    add(
      p.external_email,
      p.external_name,
      p.external_phone,
      p.role || 'other',
      'participant'
    );
  }
  for (const s of (attorneySearches || []) as any[]) {
    add(s.attorney_email, s.attorney_name, s.attorney_phone, 'attorney', 'attorney');
  }

  const all = Array.from(map.values());
  const filtered = all.filter((c) => {
    if (
      q &&
      !(c.email.toLowerCase().includes(q) ||
        (c.name || '').toLowerCase().includes(q))
    )
      return false;
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
    (a.name || a.email).localeCompare(b.name || b.email)
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
          <h1 className="text-3xl font-bold tracking-tight">Contacts</h1>
          <p className="mt-1 text-sm text-ink-600">
            Every person you&apos;ve worked with — clients, co-realtors, attorneys,
            inspectors, lenders. Auto-built from your past deals.
          </p>
        </div>
        <form className="flex gap-2">
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search name or email…"
            className="input w-64"
          />
          {roleFilter && <input type="hidden" name="role" value={roleFilter} />}
          <button type="submit" className="btn-secondary text-xs">
            Search
          </button>
        </form>
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
        <div className="rounded-2xl border border-dashed border-ink-300 bg-white p-12 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-ink-100 text-2xl">
            📇
          </div>
          <h2 className="mt-4 text-lg font-semibold">No contacts yet</h2>
          <p className="mt-1 text-sm text-ink-600">
            Anyone you invite to a deal — clients, attorneys, inspectors,
            co-realtors — automatically lands here for next time.
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((c) => (
            <li
              key={c.email}
              className="rounded-2xl border border-ink-200 bg-white p-4 shadow-soft transition hover:-translate-y-0.5 hover:shadow-soft-md"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink-100 text-sm font-bold text-ink-700">
                  {initials(c.name || c.email)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-ink-900">
                    {c.name || c.email}
                  </div>
                  <a
                    href={'mailto:' + c.email}
                    className="block truncate text-xs text-blue-600 hover:underline"
                  >
                    {c.email}
                  </a>
                  {c.phone && (
                    <a
                      href={'tel:' + c.phone}
                      className="block text-xs text-blue-600 hover:underline"
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
                  <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                    {c.dealCount} deal{c.dealCount === 1 ? '' : 's'}
                  </span>
                )}
              </div>
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
