import { redirect } from 'next/navigation';
import { getMe, getSupabaseServerClient } from '@/lib/supabaseSsr';
import { OnboardingForm } from '../../onboarding/form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Branding · Realtor Portal' };

export default async function BrandingPage() {
  const me = await getMe();
  if (!me?.firm_id) redirect('/login');
  // Branding is firm-level — only owners and firm admins can edit it.
  // Realtors / managers / agents see the dashboard normally but can't
  // accidentally change the logo or color palette.
  const isAdmin =
    me.role === 'owner' ||
    me.role === 'firm_admin' ||
    me.role === 'super_admin';
  if (!isAdmin) redirect('/dashboard');

  const supabase = getSupabaseServerClient();
  const { data: firm } = await supabase
    .from('firms')
    .select('name, tagline, brand_color, accent_color, logo_url, contact_email, contact_phone, website_url')
    .eq('id', me.firm_id)
    .single();

  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="text-3xl font-bold tracking-tight">Branding</h1>
      <p className="mt-1 text-sm text-ink-600">How your firm shows up in the client app.</p>

      <div className="mt-8 rounded-xl border border-ink-200 bg-white p-8 shadow-sm">
        <OnboardingForm
          firmId={me.firm_id}
          initial={{
            name: firm?.name || me.firm_name || '',
            tagline: firm?.tagline || '',
            brand_color: firm?.brand_color || '#0F172A',
            accent_color: firm?.accent_color || '#2563EB',
            contact_email: firm?.contact_email || me.email,
            contact_phone: firm?.contact_phone || '',
            website_url: firm?.website_url || '',
            logo_url: firm?.logo_url || null,
          }}
        />
      </div>
    </main>
  );
}
