import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getMe } from '@/lib/supabaseSsr';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { emailEveryoneOnPhaseChange } from '@/lib/dealEmail';
import { notifyDealParticipants } from '@/lib/notify';
import { escapeHtml } from '@/lib/email';
import { phaseLabelFor } from '@/lib/dealKind';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * PHASE UPDATE — Bearer/cookie JSON API for the native mobile app.
 *
 * Mirrors updatePhaseAction's per-phase validation in
 *   admin/app/dashboard/clients/[id]/actions.ts
 *
 * POST /api/deals/[id]/phase  body {
 *   phase, offer_amount?, offer_house_id?, counter_offer_amount?,
 *   closing_date?, closing_amount?, closed_message?
 * }
 *   → { ok:true }  on success
 *   → { ok:false, error } with a clear message otherwise
 *
 * Authorize: firm staff on the deal's host firm ONLY.
 *
 * Per-target-phase validation (only enforced when the phase actually changes):
 *   - offer_made    requires offer_amount > 0 AND offer_house_id (also set it)
 *   - counter_offer requires counter_offer_amount > 0
 *   - closing       requires closing_date AND closing_amount > 0
 *   - closed        requires closing_amount > 0 (fall back to existing)
 *   - under_contract → rejected: mobile uses its own "Go under contract" flow
 *   - searching     → no extra requirements
 */

const STAFF_ROLES = [
  'realtor',
  'firm_admin',
  'super_admin',
  'owner',
  'manager',
  'agent',
];

const VALID_PHASES = [
  'searching',
  'awaiting_offer',
  'offer_made',
  'counter_offer',
  'under_contract',
  'closing',
  'closed',
] as const;
type Phase = (typeof VALID_PHASES)[number];

// Kind-aware milestone copy — a SELLER must never read buyer lines like
// "your offer is in" or "the house is officially yours". No emojis
// (flat-ink voice, and these land in email + SMS).
const PHASE_CELEBRATIONS: Record<string, { buyer: string; seller: string }> = {
  awaiting_offer: {
    buyer:
      'You and your agent have agreed on the home. Next step is preparing and submitting your offer.',
    seller:
      'Your home is live on the market. Your agent is coordinating showings and watching for offers.',
  },
  offer_made: {
    buyer:
      'Offer is in! Your agent has submitted your offer. Fingers crossed.',
    seller:
      'An offer has come in on your home. Your agent will walk you through the terms.',
  },
  counter_offer: {
    buyer: 'Counter-offer phase — your agent is negotiating. Hang tight.',
    seller:
      'Counter-offer phase — your agent is negotiating the terms for you.',
  },
  under_contract: {
    buyer:
      'Congrats — you are under contract! Big step. Your agent will line up inspection and appraisal next.',
    seller:
      "Congrats — you are under contract! The buyer's inspection, appraisal, and financing come next.",
  },
  closing: {
    buyer:
      'You are in the closing phase. Wire instructions and final paperwork are coming.',
    seller:
      'You are in the closing phase. Final paperwork is in motion — almost done.',
  },
  closed: {
    buyer: 'Congrats! The house is officially yours. Welcome home.',
    seller: 'Congrats! Your sale is closed.',
  },
};

function celebrationFor(phase: string, kind: string | null | undefined) {
  const c = PHASE_CELEBRATIONS[phase];
  if (!c) return null;
  return kind === 'seller' ? c.seller : c.buyer;
}

async function resolveCaller(req: Request): Promise<{
  user_id: string;
  firm_id: string | null;
  email: string | null;
  role: string | null;
} | null> {
  const me = await getMe();
  if (me?.user_id) {
    return {
      user_id: me.user_id,
      firm_id: me.firm_id ?? null,
      email: me.email ?? null,
      role: me.role ?? null,
    };
  }
  const authz = req.headers.get('authorization') || '';
  const m = authz.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${m[1]}` } },
      auth: { persistSession: false },
    }
  );
  const { data } = await sb.auth.getUser();
  if (!data.user) return null;
  const service = getSupabaseServiceRoleClient();
  const { data: row } = await service
    .from('users')
    .select('firm_id, role')
    .eq('id', data.user.id)
    .maybeSingle();
  return {
    user_id: data.user.id,
    firm_id: (row as any)?.firm_id ?? null,
    email: data.user.email ?? null,
    role: (row as any)?.role ?? null,
  };
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const me = await resolveCaller(req);
    if (!me?.user_id) {
      return NextResponse.json(
        { ok: false, error: 'Not authenticated.' },
        { status: 401 }
      );
    }

    const json = (await req.json().catch(() => ({}))) as {
      phase?: string;
      offer_amount?: number | null;
      offer_house_id?: string | null;
      counter_offer_amount?: number | null;
      closing_date?: string | null;
      closing_amount?: number | null;
      closed_message?: string | null;
    };

    const phase = json.phase as Phase | undefined;
    if (!phase || !VALID_PHASES.includes(phase)) {
      return NextResponse.json(
        { ok: false, error: 'A valid phase is required.' },
        { status: 400 }
      );
    }

    const service = getSupabaseServiceRoleClient();
    const { data: deal } = await service
      .from('client_searches')
      .select('id, firm_id, client_id, phase, kind, closing_amount')
      .eq('id', params.id)
      .maybeSingle();
    if (!deal) {
      return NextResponse.json(
        { ok: false, error: 'Deal not found.' },
        { status: 404 }
      );
    }
    const d = deal as {
      id: string;
      firm_id: string;
      client_id: string | null;
      phase: string | null;
      closing_amount: number | null;
    };

    // Authorize: firm staff on the deal's host firm ONLY.
    const isStaffSameFirm =
      !!me.firm_id &&
      me.firm_id === d.firm_id &&
      STAFF_ROLES.includes(me.role || '');
    if (!isStaffSameFirm) {
      return NextResponse.json(
        { ok: false, error: 'Only firm staff can change the deal phase.' },
        { status: 403 }
      );
    }

    const previousPhase = d.phase;

    // -- PER-PHASE REQUIRED INFO (only when the phase actually changes) -------
    if (phase !== previousPhase) {
      if (phase === 'under_contract') {
        // Mobile has its own under-contract screen / flow.
        return NextResponse.json({
          ok: false,
          error: 'Use the Go under contract flow.',
        });
      }
      if (phase === 'offer_made') {
        if (json.offer_amount == null || !(Number(json.offer_amount) > 0)) {
          return NextResponse.json({
            ok: false,
            error: 'An offer amount is required to move to Offer made.',
          });
        }
        if (!json.offer_house_id) {
          return NextResponse.json({
            ok: false,
            error: 'Pick which house the offer is on to move to Offer made.',
          });
        }
      }
      if (phase === 'counter_offer') {
        if (
          json.counter_offer_amount == null ||
          !(Number(json.counter_offer_amount) > 0)
        ) {
          return NextResponse.json({
            ok: false,
            error:
              'A counter-offer amount is required to move to Counter offer.',
          });
        }
      }
      if (phase === 'closing') {
        if (!json.closing_date) {
          return NextResponse.json({
            ok: false,
            error: 'A closing date is required to move to Closing.',
          });
        }
        if (
          json.closing_amount == null ||
          !(Number(json.closing_amount) > 0)
        ) {
          return NextResponse.json({
            ok: false,
            error: 'A closing amount is required to move to Closing.',
          });
        }
      }
      if (phase === 'closed') {
        const finalAmount =
          json.closing_amount ?? d.closing_amount ?? null;
        if (finalAmount == null || !(Number(finalAmount) > 0)) {
          return NextResponse.json({
            ok: false,
            error: 'A final closing amount is required to mark the deal Closed.',
          });
        }
      }
    }

    // Build the update payload — include the provided phase-specific fields.
    const updates: Record<string, any> = { phase };
    if (json.offer_amount != null) updates.offer_amount = json.offer_amount;
    if (json.closing_amount != null) updates.closing_amount = json.closing_amount;
    if (json.counter_offer_amount != null)
      updates.counter_offer_amount = json.counter_offer_amount;
    if (json.closing_date) updates.closing_date = json.closing_date;
    if (json.closed_message) updates.closed_message = json.closed_message;
    if (json.offer_house_id) updates.offer_house_id = json.offer_house_id;

    const { error } = await service
      .from('client_searches')
      .update(updates)
      .eq('id', d.id);
    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    // Activity row.
    try {
      await service.from('activities').insert({
        firm_id: d.firm_id,
        search_id: d.id,
        actor_id: me.user_id,
        action: 'phase_change',
        target: phase,
        metadata: {
          offer_amount: json.offer_amount ?? null,
          counter_offer_amount: json.counter_offer_amount ?? null,
          closing_amount: json.closing_amount ?? null,
          closing_date: json.closing_date ?? null,
          closed_message: json.closed_message ?? null,
          offer_house_id: json.offer_house_id ?? null,
        },
      });
    } catch (e: any) {
      console.error('[/api/deals/[id]/phase] activity failed', e?.message || e);
    }

    // Auto-add the closing date as an important_dates row when we get one.
    if (json.closing_date) {
      try {
        await service.from('important_dates').upsert(
          {
            firm_id: d.firm_id,
            search_id: d.id,
            label: 'Closing day',
            date: json.closing_date,
            created_by: me.user_id,
          },
          { onConflict: 'search_id,label' as any, ignoreDuplicates: false }
        );
      } catch (e: any) {
        console.error(
          '[/api/deals/[id]/phase] important_dates upsert failed',
          e?.message || e
        );
      }
    }

    // Auto-celebrate transitions to milestone phases (mirrors updatePhaseAction).
    const celebration = celebrationFor(phase, (d as any).kind);
    if (phase !== previousPhase && celebration) {
      try {
        await service.from('messages').insert({
          firm_id: d.firm_id,
          search_id: d.id,
          sender_id: me.user_id,
          body: celebration,
        });
      } catch (e: any) {
        console.error(
          '[/api/deals/[id]/phase] celebration message failed',
          e?.message || e
        );
      }
      // Push (best effort).
      try {
        const base =
          process.env.SITE_URL || 'https://realtorportal.parallelstudios.co';
        await fetch(base + '/api/notifications/send-push', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ searchId: d.id, kind: 'phase_change' }),
        });
      } catch {}
      // Email every party on the deal.
      try {
        await emailEveryoneOnPhaseChange({
          searchId: d.id,
          newPhase: phase,
        });
      } catch {}
      // SMS milestone announcement.
      try {
        const siteUrl =
          process.env.SITE_URL || 'https://realtorportal.parallelstudios.co';
        const dealUrl = siteUrl + '/deal/' + d.id;
        const phaseLabel = phaseLabelFor(phase, (d as any).kind);
        await notifyDealParticipants({
          searchId: d.id,
          subject: `Deal milestone: ${phaseLabel}`,
          text: celebration + '\n\nOpen the deal: ' + dealUrl,
          html: `<p>${escapeHtml(
            celebration
          )}</p><p><a href="${dealUrl}">Open the deal &rarr;</a></p>`,
          sms_text: celebration + ' — ' + dealUrl,
          excludeUserId: me.user_id,
        });
      } catch (e: any) {
        console.error('[/api/deals/[id]/phase] notify failed', e?.message || e);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[/api/deals/[id]/phase]', err);
    return NextResponse.json(
      { ok: false, error: err?.message || 'Unexpected error' },
      { status: 500 }
    );
  }
}
