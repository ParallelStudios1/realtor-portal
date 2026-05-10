import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getMe } from '@/lib/supabaseSsr';

export const runtime = 'nodejs';

/**
 * POST /api/url/preview
 * Body: { url: string }
 *
 * Returns: { title?: string, image?: string, description?: string, address?: string }
 *
 * Fetches the URL server-side and pulls Open Graph / standard <meta> tags
 * out of the HTML. Used by the mobile add-house screen to auto-fill the
 * photo URL + address when a realtor pastes a Zillow / MLS link.
 *
 * Implementation notes:
 *  - No cheerio / no extra deps. We do regex-based extraction. HTML parsing
 *    via regex is famously fragile, but for og: meta tags (always single
 *    self-closing tags with attributes in a known shape) it's good enough,
 *    and the failure mode is "field comes back undefined" which the client
 *    handles gracefully (it leaves the user's existing input alone).
 *  - Always returns JSON. Errors return a status code and `{ error }`.
 */

type Input = { url?: string };

async function resolveCaller(req: Request): Promise<{ id: string; firm_id: string | null } | null> {
  const me = await getMe();
  if (me?.user_id) return { id: me.user_id, firm_id: me.firm_id };

  const auth = req.headers.get('authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${m[1]}` } }, auth: { persistSession: false } }
  );
  const { data } = await sb.auth.getUser();
  if (!data.user) return null;
  const { data: row } = await sb
    .from('users')
    .select('firm_id')
    .eq('id', data.user.id)
    .single();
  return { id: data.user.id, firm_id: (row?.firm_id as string) || null };
}

export async function POST(req: Request) {
  try {
    const me = await resolveCaller(req);
    if (!me?.firm_id) {
      return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as Input;
    const raw = (body.url || '').trim();
    if (!raw) {
      return NextResponse.json({ error: 'URL is required.' }, { status: 400 });
    }

    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      return NextResponse.json({ error: 'Invalid URL.' }, { status: 400 });
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return NextResponse.json({ error: 'Only http(s) URLs are supported.' }, { status: 400 });
    }

    // Fetch the page. Many listing sites block obvious bots, so we send a
    // browser-ish UA. Don't follow infinite redirects; cap fetch time.
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 8000);
    let res: Response;
    try {
      res = await fetch(parsed.toString(), {
        method: 'GET',
        redirect: 'follow',
        signal: ac.signal,
        headers: {
          'user-agent':
            'Mozilla/5.0 (compatible; RealtorPortalBot/1.0; +https://realtor-portal-ten.vercel.app)',
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'accept-language': 'en-US,en;q=0.9',
        },
      });
    } catch (err: any) {
      clearTimeout(t);
      const aborted = err?.name === 'AbortError';
      return NextResponse.json(
        { error: aborted ? 'Request timed out fetching the URL.' : 'Could not reach that URL.' },
        { status: 502 }
      );
    }
    clearTimeout(t);

    if (!res.ok) {
      return NextResponse.json(
        { error: `Listing site returned HTTP ${res.status}.` },
        { status: 502 }
      );
    }

    const ct = res.headers.get('content-type') || '';
    if (ct && !ct.includes('text/html') && !ct.includes('application/xhtml')) {
      return NextResponse.json(
        { error: 'URL did not return an HTML page.' },
        { status: 415 }
      );
    }

    // Cap how much HTML we'll parse so a hostile page can't OOM us.
    const html = (await res.text()).slice(0, 1_000_000);

    const extracted = extractMeta(html);

    // Resolve a relative og:image against the final URL.
    if (extracted.image) {
      try {
        extracted.image = new URL(extracted.image, parsed.toString()).toString();
      } catch {
        // leave as-is; client will simply not render
      }
    }

    return NextResponse.json({
      title: extracted.title,
      image: extracted.image,
      description: extracted.description,
      address: extracted.address,
    });
  } catch (err: any) {
    console.error('[api/url/preview] ', err);
    return NextResponse.json(
      { error: err?.message || 'Unexpected error fetching URL.' },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// HTML meta extraction (no deps).
// We pull og:title, og:image, og:description, twitter:* fallbacks, plus the
// <title> tag as a last resort. For listing sites we also try a few common
// "address" hints (og:street-address etc.) — not standardized but cheap to try.
// ---------------------------------------------------------------------------

type Extracted = {
  title?: string;
  image?: string;
  description?: string;
  address?: string;
};

function extractMeta(html: string): Extracted {
  // Strip <script> and <style> blocks before regex matching so we don't pick
  // up meta-looking strings inside JSON blobs that happen to live inline.
  const cleaned = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '');

  const meta = (...names: string[]): string | undefined => {
    for (const n of names) {
      const v = matchMeta(cleaned, n);
      if (v) return v;
    }
    return undefined;
  };

  const title =
    meta('og:title', 'twitter:title') ||
    matchTitle(cleaned) ||
    undefined;

  const image = meta(
    'og:image:secure_url',
    'og:image',
    'twitter:image',
    'twitter:image:src'
  );

  const description = meta('og:description', 'twitter:description', 'description');

  // Address hints. Very loose — listing sites vary widely. The client only
  // uses this as a fallback when the user's address field is empty.
  const address =
    meta('og:street-address', 'place:location:street_address') ||
    addressFromTitle(title);

  return {
    title: title ? decodeEntities(title).trim() || undefined : undefined,
    image: image ? decodeEntities(image).trim() || undefined : undefined,
    description: description ? decodeEntities(description).trim() || undefined : undefined,
    address: address ? decodeEntities(address).trim() || undefined : undefined,
  };
}

/**
 * Find a <meta> tag whose name OR property attribute equals `name` and return
 * its content attribute. Tolerates attributes in any order, single or double
 * quotes. Case-insensitive on the attribute name.
 */
function matchMeta(html: string, name: string): string | undefined {
  // Two patterns — content can come before or after name/property.
  const escaped = escapeRegex(name);
  const patterns = [
    new RegExp(
      `<meta\\b[^>]*?(?:name|property)\\s*=\\s*["']${escaped}["'][^>]*?content\\s*=\\s*["']([^"']*)["']`,
      'i'
    ),
    new RegExp(
      `<meta\\b[^>]*?content\\s*=\\s*["']([^"']*)["'][^>]*?(?:name|property)\\s*=\\s*["']${escaped}["']`,
      'i'
    ),
  ];
  for (const re of patterns) {
    const m = re.exec(html);
    if (m && m[1]) return m[1];
  }
  return undefined;
}

function matchTitle(html: string): string | undefined {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return m?.[1]?.replace(/\s+/g, ' ').trim() || undefined;
}

/**
 * Heuristic: if the og:title looks like "123 Main St, Miami FL 33133 | Zillow",
 * pull off the prefix before the pipe / dash.
 */
function addressFromTitle(title?: string): string | undefined {
  if (!title) return undefined;
  // Split on common separators used by listing sites.
  const head = title.split(/\s+[|–\-]\s+/)[0]?.trim();
  if (!head) return undefined;
  // Looks like an address if it starts with digits and contains a comma.
  if (/^\d/.test(head) && head.includes(',')) return head;
  return undefined;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Minimal HTML entity decode — covers the entities we'll actually hit in
 * meta tags (&amp;, &quot;, &#39;, &apos;, &lt;, &gt;, numeric refs).
 */
function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => safeFromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => safeFromCharCode(parseInt(dec, 10)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

function safeFromCharCode(code: number): string {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return '';
  try {
    return String.fromCodePoint(code);
  } catch {
    return '';
  }
}
