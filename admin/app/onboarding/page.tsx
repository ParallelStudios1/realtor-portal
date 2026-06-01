import { redirect } from 'next/navigation';
import { getMe } from '@/lib/supabaseSsr';
import { OnboardingForm } from './form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Set up your firm · Realtor Portal' };

export default async function OnboardingPage() {
  const me = await getMe();

  if (!me) redirect('/login');
  if (me.role !== 'firm_admin' && me.role !== 'super_admin') redirect('/dashboard');

  return (
    <main className="min-h-screen bg-ink-50 py-12">
      <div className="mx-auto max-w-2xl px-6">
        <div className="mb-8 flex items-center gap-2 text-sm text-ink-500">
          <span className="rounded-full bg-ink-900 px-2 py-0.5 text-xs font-semibold text-white">
            Step 1 of 1
          </span>
          <span>Make it yours</span>
        </div>

        <div className="rounded-xl border border-ink-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-bold tracking-tight">
            Welcome, {me.full_name?.split(' ')[0]}.
          </h1>
          <p className="mt-1 text-ink-600">
            Let's brand <strong>{me.firm_name}</strong>. This is what your clients will see when they
            open the app.
          </p>

          <OnboardingForm
            firmId={me.firm_id!}
            initial={{
              name: me.firm_name || '',
              tagline: '',
              brand_color: me.firm_brand_color || '#0F172A',
              accent_color: '#2563EB',
              contact_email: me.email,
              contact_phone: '',
              website_url: '',
              logo_url: me.firm_logo_url,
            }}
          />
        </div>
      </div>
    </main>
  );
}
