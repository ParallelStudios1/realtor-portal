import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getMe, getSupabaseServerClient } from '@/lib/supabaseSsr';
import { ClientNav } from './ClientNav';
import { logoutAction } from '../login/actions';

export const dynamic = 'force-dynamic';

/**
 * Client-side portal — what buyers/sellers see on the web. Mirrors the mobile
 * (client) tabs: home, houses, messages, documents. Branded with the firm's
 * logo + colors so it feels like the realtor's product, not ours.
 */
export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  if (!me) redirect('/login');
  if (me.role !== 'client') {
    // Belt-and-suspenders — middleware already handles this.
    redirect('/dashboard');
  }

  // Pull firm branding for header
  const supabase = getSupabaseServerClient();
  const { data: firm } = await supabase
    .from('firms')
    .select('name, logo_url, brand_color, accent_color, tagline')
    .eq('id', me.firm_id!)
    .maybeSingle();

  const brand = firm?.brand_color || '#0F172A';
  const accent = firm?.accent_color || '#2563EB';

  return (
    <div className="min-h-screen bg-slate-50">
      <header
        className="relative border-b border-slate-200"
        style={{ backgroundColor: brand }}
      >
        <ClientNav
          firmName={firm?.name || 'Realtor Portal'}
          logoUrl={firm?.logo_url || null}
          tagline={firm?.tagline || null}
          email={me.email || null}
          accentColor={accent}
          logoutAction={logoutAction}
        />
      </header>

      {children}
    </div>
  );
}
