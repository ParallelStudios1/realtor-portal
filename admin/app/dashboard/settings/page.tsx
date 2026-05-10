import { getMe, getSupabaseServerClient } from '@/lib/supabaseSsr';
import { SettingsForm } from './SettingsForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Settings · Realtor Portal' };

export default async function SettingsPage() {
  const me = (await getMe())!;
  const supabase = getSupabaseServerClient();

  const isFirmAdmin = me.role === 'firm_admin' || me.role === 'super_admin';

  let firmRow: {
    id: string;
    name: string;
    tagline: string | null;
    brand_color: string | null;
    accent_color: string | null;
    contact_email: string | null;
    contact_phone: string | null;
  } | null = null;

  if (me.firm_id) {
    const { data } = await supabase
      .from('firms')
      .select('id, name, tagline, brand_color, accent_color, contact_email, contact_phone')
      .eq('id', me.firm_id)
      .maybeSingle();
    if (data) firmRow = data;
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
      <p className="mt-1 text-sm text-slate-600">
        Manage your profile, account security, and firm details.
      </p>

      <div className="mt-8">
        <SettingsForm
          fullName={me.full_name ?? ''}
          email={me.email ?? ''}
          isFirmAdmin={isFirmAdmin}
          firm={
            firmRow
              ? {
                  id: firmRow.id,
                  name: firmRow.name ?? '',
                  tagline: firmRow.tagline ?? '',
                  brand_color: firmRow.brand_color ?? '#0F172A',
                  accent_color: firmRow.accent_color ?? '#2563EB',
                  contact_email: firmRow.contact_email ?? '',
                  contact_phone: firmRow.contact_phone ?? '',
                }
              : null
          }
        />
      </div>

      <section id="mobile" className="mt-8 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold">Mobile app</h2>
        <p className="mt-1 text-sm text-slate-600">
          Download Realtor Portal on iOS or Android. Sign in with the same email and password.
        </p>
        <div className="mt-4 flex gap-3">
          <a
            href="#"
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-400"
          >
            App Store (coming soon)
          </a>
          <a
            href="#"
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-400"
          >
            Google Play (coming soon)
          </a>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Beta testing? Email <a href="mailto:turnerlogan@parallelstudios.co" className="underline">us</a> for an early TestFlight invite.
        </p>
      </section>

      <section className="mt-8 rounded-xl border border-red-200 bg-red-50 p-6">
        <h2 className="text-lg font-semibold text-red-900">Danger zone</h2>
        <p className="mt-1 text-sm text-red-700">
          Need to delete your firm? Email{' '}
          <a href="mailto:turnerlogan@parallelstudios.co" className="underline">
            turnerlogan@parallelstudios.co
          </a>{' '}
          and we'll remove it within 24 hours.
        </p>
      </section>
    </main>
  );
}
