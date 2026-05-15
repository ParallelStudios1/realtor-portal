import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getMe, getSupabaseServerClient } from '@/lib/supabaseSsr';
import { FirmControl } from './FirmControl';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Firm control' };

/**
 * Firm Control — only owners / firm_admins / super_admins land here. The
 * page lists every member of the firm with their role + last-active stat,
 * lets you invite a new realtor / manager / agent, change roles, and remove
 * people. Also shows pending firm_invites so it's clear who hasn't accepted.
 */
export default async function FirmControlPage() {
  const me = (await getMe())!;
  const isAdmin =
    me.role === 'owner' ||
    me.role === 'firm_admin' ||
    me.role === 'super_admin';
  if (!isAdmin) redirect('/dashboard');

  const supabase = getSupabaseServerClient();

  const [{ data: members }, { data: invites }, { data: dealCounts }] =
    await Promise.all([
      supabase
        .from('users')
        .select('id, full_name, email, role, created_at')
        .eq('firm_id', me.firm_id!)
        .neq('role', 'client')
        .order('created_at', { ascending: true }),
      supabase
        .from('firm_invites')
        .select('id, email, full_name, role, created_at, accepted_at')
        .eq('firm_id', me.firm_id!)
        .order('created_at', { ascending: false }),
      supabase
        .from('client_searches')
        .select('realtor_id')
        .eq('firm_id', me.firm_id!),
    ]);

  const deals = (dealCounts as any[] | null) || [];
  const dealCountByRealtor: Record<string, number> = {};
  for (const d of deals) {
    if (d.realtor_id)
      dealCountByRealtor[d.realtor_id] =
        (dealCountByRealtor[d.realtor_id] || 0) + 1;
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link
            href="/dashboard"
            className="text-xs font-semibold text-ink-500 hover:text-ink-700"
          >
            ← Dashboard
          </Link>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">
            Firm control
          </h1>
          <p className="mt-1 text-sm text-ink-600">
            Owners and firm admins manage seats, roles, and deal assignments
            here.
          </p>
        </div>
      </header>

      <FirmControl
        meId={me.user_id}
        meRole={me.role || ''}
        members={(members || []) as any}
        invites={(invites || []) as any}
        dealCountByRealtor={dealCountByRealtor}
      />
    </main>
  );
}
