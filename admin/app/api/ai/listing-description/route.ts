import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getMe } from '@/lib/supabaseSsr';

export const runtime = 'nodejs';

/**
 * Resolve the caller from either:
 *   1. Supabase session cookies (web app), or
 *   2. Authorization: Bearer <access_token> header (mobile app).
 * Returns null if neither yields a user.
 */
async function resolveCaller(req: Request): Promise<{ id: string; firm_id: string | null } | null> {
  // Try cookie session first
  const me = await getMe();
  if (me?.id) return { id: me.id, firm_id: me.firm_id };

  const auth = req.headers.get('authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const token = m[1];
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const sb = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data } = await sb.auth.getUser();
  if (!data.user) return null;
  // Look up firm_id for this user
  const { data: row } = await sb
    .from('users')
    .select('firm_id')
    .eq('id', data.user.id)
    .single();
  return { id: data.user.id, firm_id: (row?.firm_id as string) || null };
}

/**
 * POST /api/ai/listing-description
 * Body: { address, price, bedrooms, bathrooms, squareFeet, notes }
 *
 * Returns: { description: string }
 *
 * Calls Anthropic to draft a polished, agent-friendly listing description
 * from structured property inputs. If ANTHROPIC_API_KEY isn't set, falls back
 * to a deterministic template so the feature still works in dev.
 *
 * Always returns JSON — the client's catch path doesn't have to special-case
 * empty bodies.
 */
type Input = {
  address?: string;
  price?: number | string;
  bedrooms?: number | string;
  bathrooms?: number | string;
  squareFeet?: number | string;
  notes?: string;
  tone?: 'warm' | 'professional' | 'punchy';
};

export async function POST(req: Request) {
  try {
    const me = await resolveCaller(req);
    if (!me?.firm_id) {
      return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
    }
    const input = (await req.json().catch(() => ({}))) as Input;
    if (!input.address || !input.address.trim()) {
      return NextResponse.json(
        { error: 'Address is required.' },
        { status: 400 }
      );
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      // No-key fallback so the feature degrades gracefully.
      return NextResponse.json({ description: stubDescription(input) });
    }

    const prompt = buildPrompt(input);
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        system:
          'You are a real estate copywriter helping a buyer-side agent describe a property they\'re showing to a client. Write in second person ("you\'ll love…") when natural, but stay grounded — never invent features that weren\'t in the input. 2-3 short paragraphs. Avoid clichés ("nestled", "stunning"). End with a single concrete suggestion ("Worth a tour this weekend?") that the agent could send to the client.',
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!r.ok) {
      const text = await r.text();
      console.error('[ai/listing-description] Anthropic error:', r.status, text);
      return NextResponse.json(
        { error: `AI service error (${r.status}). Try again in a moment.` },
        { status: 502 }
      );
    }
    const json = (await r.json()) as any;
    const description: string =
      json?.content?.[0]?.text ?? stubDescription(input);
    return NextResponse.json({ description });
  } catch (err: any) {
    console.error('[ai/listing-description] ', err);
    return NextResponse.json(
      { error: err?.message || 'Unexpected error generating description.' },
      { status: 500 }
    );
  }
}

function buildPrompt(input: Input): string {
  const lines: string[] = [];
  lines.push(`Address: ${input.address}`);
  if (input.price) lines.push(`List price: $${input.price}`);
  if (input.bedrooms) lines.push(`Bedrooms: ${input.bedrooms}`);
  if (input.bathrooms) lines.push(`Bathrooms: ${input.bathrooms}`);
  if (input.squareFeet) lines.push(`Square feet: ${input.squareFeet}`);
  if (input.notes) lines.push(`Agent notes: ${input.notes}`);
  const tone = input.tone || 'warm';
  lines.push(`Tone: ${tone}`);
  return `Write a property description for this home using only the facts below. Do not make up neighborhood, schools, or amenities that weren't provided.\n\n${lines.join('\n')}`;
}

function stubDescription(i: Input): string {
  const parts: string[] = [];
  parts.push(`Found one worth a look at ${i.address}.`);
  const specs: string[] = [];
  if (i.bedrooms) specs.push(`${i.bedrooms} bedrooms`);
  if (i.bathrooms) specs.push(`${i.bathrooms} bathrooms`);
  if (i.squareFeet) specs.push(`${i.squareFeet} sq ft`);
  if (specs.length) parts.push(specs.join(', ') + '.');
  if (i.price) parts.push(`Listed at $${i.price}.`);
  if (i.notes) parts.push(i.notes);
  parts.push('Want me to set up a tour?');
  return parts.join(' ');
}
