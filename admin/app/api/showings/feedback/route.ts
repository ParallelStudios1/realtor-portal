import { NextResponse } from 'next/server';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { verifyFeedbackToken } from '@/lib/feedbackTokens';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/showings/feedback  - PUBLIC, no auth/cookies.
 *
 * Body: {
 *   token: string,            // HMAC token bound to (showingId, email)
 *   showingId: string,
 *   email: string,            // the attendee's email (token is scoped to it)
 *   name?: string,
 *   stars: 1..5,
 *   interest: not_interested | maybe | interested | offer_likely,
 *   price_opinion?: overpriced | about_right | underpriced,
 *   liked?: string,
 *   concerns?: string,
 *   share_with_seller?: boolean
 * }
 *
 * Auth model: the token IS the credential. We re-derive HMAC(showingId+':'+email)
 * and reject on mismatch - so a visitor can only submit feedback for the exact
 * showing + email the realtor minted a link for. We then service-role upsert
 * into showing_feedback on (showing_id, author_email) so re-submitting edits
 * the existing row instead of erroring on the unique constraint.
 *
 * Always returns JSON.
 */

const INTERESTS = ['not_interested', 'maybe', 'interested', 'offer_likely'];
const PRICE_OPINIONS = ['overpriced', 'about_right', 'underpriced'];

type Body = {
  token?: string;
  showingId?: string;
  email?: string;
  name?: string;
  stars?: number | string;
  interest?: string;
  price_opinion?: string;
  liked?: string;
  concerns?: string;
  share_with_seller?: boolean;
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Invalid JSON body.' },
      { status: 400 }
    );
  }

  const token = (body.token || '').trim();
  const showingId = (body.showingId || '').trim();
  const email = (body.email || '').trim().toLowerCase();

  if (!token || !showingId || !email) {
    return NextResponse.json(
      { ok: false, error: 'Missing token, showing, or email.' },
      { status: 400 }
    );
  }

  if (!verifyFeedbackToken(showingId, email, token)) {
    return NextResponse.json(
      { ok: false, error: 'This feedback link is invalid or has expired.' },
      { status: 403 }
    );
  }

  // Validate the rating + enums.
  const stars = Number(body.stars);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
    return NextResponse.json(
      { ok: false, error: 'Please pick a star rating from 1 to 5.' },
      { status: 400 }
    );
  }

  const interest = (body.interest || '').trim();
  if (!INTERESTS.includes(interest)) {
    return NextResponse.json(
      { ok: false, error: 'Please choose how interested you are.' },
      { status: 400 }
    );
  }

  const priceOpinion = (body.price_opinion || '').trim();
  if (priceOpinion && !PRICE_OPINIONS.includes(priceOpinion)) {
    return NextResponse.json(
      { ok: false, error: 'Invalid price opinion.' },
      { status: 400 }
    );
  }

  const service = getSupabaseServiceRoleClient();

  // Resolve the showing so we can stamp firm_id / search_id / house_id onto the
  // feedback row (the unique key is showing + email; the rest is denormalized
  // context for the digest queries).
  const { data: showing, error: showingErr } = await service
    .from('showings')
    .select('id, firm_id, search_id, house_id')
    .eq('id', showingId)
    .maybeSingle();
  if (showingErr || !showing) {
    return NextResponse.json(
      { ok: false, error: 'That showing could not be found.' },
      { status: 404 }
    );
  }

  const name = (body.name || '').trim() || null;
  const liked = (body.liked || '').trim() || null;
  const concerns = (body.concerns || '').trim() || null;
  const shareWithSeller =
    body.share_with_seller === undefined ? true : Boolean(body.share_with_seller);

  const { error: upsertErr } = await service.from('showing_feedback').upsert(
    {
      firm_id: (showing as any).firm_id,
      showing_id: (showing as any).id,
      search_id: (showing as any).search_id,
      house_id: (showing as any).house_id,
      author_name: name,
      author_email: email,
      stars,
      interest,
      price_opinion: priceOpinion || null,
      liked,
      concerns,
      share_with_seller: shareWithSeller,
    },
    { onConflict: 'showing_id,author_email' }
  );

  if (upsertErr) {
    return NextResponse.json(
      { ok: false, error: 'We could not save your feedback. Please try again.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
