import { NextResponse } from 'next/server';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';

export const runtime = 'nodejs';

/**
 * POST /api/demo/start
 * Body: { role: 'realtor' | 'buyer' | 'seller' }
 *
 * Mints a magic-link sign-in URL for the matching demo user (seeded by
 * supabase/migrations/0008_demo_seed.sql) and returns it. The landing page
 * redirects the browser to that URL, which logs the visitor in as the demo
 * persona and drops them into the dashboard / client portal.
 *
 * Always returns JSON.
 */

const DEMO_EMAILS = {
  realtor: 'demo-realtor@example.com',
  buyer: 'demo-buyer@example.com',
  seller: 'demo-seller@example.com',
} as const;

type DemoRole = keyof typeof DEMO_EMAILS;

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { role?: string };
    const role = (body.role as DemoRole) || 'realtor';

    if (!(role in DEMO_EMAILS)) {
      return NextResponse.json(
        { error: 'role must be realtor, buyer, or seller.' },
        { status: 400 }
      );
    }

    const email = DEMO_EMAILS[role];

    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL ??
      new URL(req.url).origin;

    // Realtors land on /dashboard, clients (buyer/seller) on /client.
    const next = role === 'realtor' ? '/dashboard' : '/client';
    const redirectTo = `${baseUrl}${next}`;

    const service = getSupabaseServiceRoleClient();
    const { data, error } = await service.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo },
    });

    if (error || !data?.properties?.action_link) {
      return NextResponse.json(
        { error: error?.message || 'Could not generate demo link.' },
        { status: 502 }
      );
    }

    return NextResponse.json({ url: data.properties.action_link });
  } catch (err: any) {
    console.error('[demo/start]', err);
    return NextResponse.json(
      { error: err?.message || 'Unexpected error.' },
      { status: 500 }
    );
  }
}
