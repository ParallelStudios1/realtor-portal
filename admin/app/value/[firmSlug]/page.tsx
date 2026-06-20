import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { ValueClient } from './ValueClient';

export const dynamic = 'force-dynamic';

/**
 * Public-facing AVM seller-lead landing page.
 *
 * URL shape: /value/[firmSlug]   (no auth required - middleware exempts it)
 *
 * The page resolves the firm by slug, pulls its branding (name, brand color,
 * logo) and hands it off to the client component for the 3-step flow:
 *   1. address entry → /api/value/estimate
 *   2. range reveal (with blurred CTA over a "see your full report" overlay)
 *   3. lead capture → /api/value/lead  (creates a firm_contact + notify)
 *
 * If the slug doesn't match a firm, we 404. We do NOT leak any firm-internal
 * data; only the public branding fields are passed to the client.
 */

type Props = { params: { firmSlug: string } };

async function loadFirm(slug: string) {
  const service = getSupabaseServiceRoleClient();
  const { data, error } = await service
    .from('firms')
    .select('id, name, slug, brand_color, logo_url')
    .eq('slug', slug)
    .maybeSingle();
  if (error || !data) return null;
  return data as {
    id: string;
    name: string;
    slug: string;
    brand_color: string | null;
    logo_url: string | null;
  };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const firm = await loadFirm(params.firmSlug);
  if (!firm) return { title: 'Home value report' };
  return {
    title: `What's your home worth? - ${firm.name}`,
    description: `Get a free estimate of your home's value from ${firm.name}. Enter your address for an instant range based on recent comparable sales.`,
  };
}

export default async function ValueLandingPage({ params }: Props) {
  const firm = await loadFirm(params.firmSlug);
  if (!firm) notFound();

  return (
    <ValueClient
      firmId={firm.id}
      firmName={firm.name}
      firmBrandColor={firm.brand_color || '#0F172A'}
      firmLogoUrl={firm.logo_url}
    />
  );
}
