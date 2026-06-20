import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getMe } from '@/lib/supabaseSsr';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';

/**
 * POST /api/ai/contract-extract
 * Body: { searchId: string, documentId: string }
 *
 * Feature 4B - staged AI contract-date extraction.
 *
 * Pulls the document's PDF from the private 'client-docs' bucket, hands it to
 * Claude as a native base64 PDF document block, and asks for STRICT JSON of
 * proposed dates / parties / contingencies. The model output is staged into a
 * `contract_extractions` row with status='proposed'.
 *
 * CRITICAL: this route writes ONLY to contract_extractions. It NEVER touches
 * important_dates - nothing reaches the deal timeline until a human confirms
 * via confirmExtractionAction. This is the "mandatory human confirm" gate.
 *
 * No-key fallback: if ANTHROPIC_API_KEY is unset, we still insert an empty
 * proposal (with a "manual entry" note) and return it, so the review UI opens
 * and the agent can key dates in by hand.
 *
 * Always returns JSON.
 */

type Body = { searchId?: string; documentId?: string };

type ProposedDate = {
  label: string;
  date: string; // ISO yyyy-mm-dd
  confidence: number; // 0..1
  source_snippet: string;
};
type ProposedParty = { role: string; name: string; email: string };
type Contingency = { type: string; deadline: string; notes: string };

type Extracted = {
  dates: ProposedDate[];
  parties: ProposedParty[];
  contingencies: Contingency[];
};

/**
 * Resolve the caller from either Supabase session cookies (web) or an
 * Authorization: Bearer <access_token> header (mobile). Returns null if
 * neither yields a user.
 */
async function resolveCaller(
  req: Request
): Promise<{ id: string; firm_id: string | null; email: string | null; role: string | null } | null> {
  const me = await getMe();
  if (me?.user_id) return { id: me.user_id, firm_id: me.firm_id, email: me.email, role: me.role };

  const auth = req.headers.get('authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
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
  const { data: row } = await sb
    .from('users')
    .select('firm_id, role, email')
    .eq('id', data.user.id)
    .single();
  return {
    id: data.user.id,
    firm_id: (row?.firm_id as string) || null,
    email: (row?.email as string) || data.user.email || null,
    role: (row?.role as string) || null,
  };
}

const SYSTEM_PROMPT = `You extract structured facts from a real-estate purchase contract PDF.

Return ONLY a single JSON object - no prose, no markdown fences - with exactly this shape:
{
  "dates": [{ "label": string, "date": string, "confidence": number, "source_snippet": string }],
  "parties": [{ "role": string, "name": string, "email": string }],
  "contingencies": [{ "type": string, "deadline": string, "notes": string }]
}

Rules:
- "date" MUST be ISO format "YYYY-MM-DD". If you cannot resolve a full calendar date, omit that entry rather than guessing.
- "confidence" is your 0.0-1.0 certainty that the label and date are correct.
- "source_snippet" is a short verbatim quote (<= 160 chars) from the contract showing where the date came from.
- "label" is a human title like "Closing date", "Inspection deadline", "Financing contingency", "Earnest money due".
- For "parties": role is e.g. "buyer", "seller", "buyer_agent", "seller_agent", "title", "lender". Use "" for unknown email.
- For "contingencies": "deadline" is ISO "YYYY-MM-DD" when stated, else "".
- If the document has no dates/parties/contingencies, return empty arrays. Never invent data.`;

function sanitize(raw: any): Extracted {
  const out: Extracted = { dates: [], parties: [], contingencies: [] };
  if (!raw || typeof raw !== 'object') return out;

  const isISODate = (s: any) =>
    typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.trim());

  if (Array.isArray(raw.dates)) {
    for (const d of raw.dates) {
      if (!d || typeof d !== 'object') continue;
      if (!isISODate(d.date)) continue;
      const conf = Number(d.confidence);
      out.dates.push({
        label: String(d.label ?? '').slice(0, 200) || 'Untitled date',
        date: String(d.date).trim(),
        confidence: Number.isFinite(conf) ? Math.max(0, Math.min(1, conf)) : 0.5,
        source_snippet: String(d.source_snippet ?? '').slice(0, 400),
      });
    }
  }
  if (Array.isArray(raw.parties)) {
    for (const p of raw.parties) {
      if (!p || typeof p !== 'object') continue;
      out.parties.push({
        role: String(p.role ?? '').slice(0, 80),
        name: String(p.name ?? '').slice(0, 200),
        email: String(p.email ?? '').slice(0, 200),
      });
    }
  }
  if (Array.isArray(raw.contingencies)) {
    for (const c of raw.contingencies) {
      if (!c || typeof c !== 'object') continue;
      out.contingencies.push({
        type: String(c.type ?? '').slice(0, 120),
        deadline: isISODate(c.deadline) ? String(c.deadline).trim() : '',
        notes: String(c.notes ?? '').slice(0, 400),
      });
    }
  }
  return out;
}

/** Best-effort: pull the first JSON object out of a model text response. */
function parseModelJson(text: string): any {
  const trimmed = (text || '').trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // tolerate ```json fences or surrounding prose
    const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) {
      try {
        return JSON.parse(fence[1].trim());
      } catch {
        /* fall through */
      }
    }
    const first = trimmed.indexOf('{');
    const last = trimmed.lastIndexOf('}');
    if (first >= 0 && last > first) {
      try {
        return JSON.parse(trimmed.slice(first, last + 1));
      } catch {
        /* fall through */
      }
    }
  }
  return null;
}

export async function POST(req: Request) {
  try {
    const me = await resolveCaller(req);
    if (!me?.id || !me.firm_id) {
      return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    const searchId = body.searchId?.trim();
    const documentId = body.documentId?.trim();
    if (!searchId || !documentId) {
      return NextResponse.json(
        { error: 'searchId and documentId are required.' },
        { status: 400 }
      );
    }

    const service = getSupabaseServiceRoleClient();

    // Load the document and firm-scope it to the caller.
    const { data: doc, error: docErr } = await service
      .from('documents')
      .select('id, firm_id, search_id, name, storage_path')
      .eq('id', documentId)
      .maybeSingle();
    if (docErr || !doc) {
      return NextResponse.json({ error: 'Document not found.' }, { status: 404 });
    }
    if ((doc as any).firm_id !== me.firm_id && me.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
    }
    if ((doc as any).search_id !== searchId) {
      return NextResponse.json(
        { error: 'Document does not belong to this deal.' },
        { status: 400 }
      );
    }

    const firmId = (doc as any).firm_id as string;
    const storagePath = (doc as any).storage_path as string;
    const docName = (doc as any).name as string;

    const apiKey = process.env.ANTHROPIC_API_KEY;

    // ---- No-key fallback: stage an empty proposal for manual entry. ----
    if (!apiKey) {
      const empty: Extracted = { dates: [], parties: [], contingencies: [] };
      const { data: inserted, error: insErr } = await service
        .from('contract_extractions')
        .insert({
          firm_id: firmId,
          search_id: searchId,
          document_id: documentId,
          status: 'proposed',
          raw: { note: 'manual entry - AI extraction unavailable (no API key)' },
          proposed_dates: empty.dates,
          proposed_parties: empty.parties,
          contingencies: empty.contingencies,
          created_by: me.id,
        })
        .select(
          'id, firm_id, search_id, document_id, status, raw, proposed_dates, proposed_parties, contingencies, created_at'
        )
        .single();
      if (insErr || !inserted) {
        return NextResponse.json(
          { error: insErr?.message || 'Could not stage extraction.' },
          { status: 502 }
        );
      }
      return NextResponse.json({
        extraction: inserted,
        fallback: true,
        message: 'AI extraction is unavailable. Enter contract dates manually.',
      });
    }

    // ---- Fetch the PDF bytes via a short-lived service-role signed URL. ----
    const { data: signed, error: signErr } = await service.storage
      .from('client-docs')
      .createSignedUrl(storagePath, 300);
    if (signErr || !signed?.signedUrl) {
      return NextResponse.json(
        { error: signErr?.message || 'Could not read the document file.' },
        { status: 502 }
      );
    }
    const fileResp = await fetch(signed.signedUrl);
    if (!fileResp.ok) {
      return NextResponse.json(
        { error: `Could not download the document (${fileResp.status}).` },
        { status: 502 }
      );
    }
    const buf = Buffer.from(await fileResp.arrayBuffer());
    const base64 = buf.toString('base64');

    // ---- Send the PDF to Claude as a native document content block. ----
    const aiResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'document',
                source: {
                  type: 'base64',
                  media_type: 'application/pdf',
                  data: base64,
                },
              },
              {
                type: 'text',
                text: `This is the real-estate contract document "${docName}". Extract all important dates, parties, and contingencies and return the strict JSON object described in the system prompt. Return JSON only.`,
              },
            ],
          },
        ],
      }),
    });

    if (!aiResp.ok) {
      const text = await aiResp.text();
      console.error('[ai/contract-extract] Anthropic error:', aiResp.status, text);
      return NextResponse.json(
        { error: `AI service error (${aiResp.status}). Try again in a moment.` },
        { status: 502 }
      );
    }

    const aiJson = (await aiResp.json()) as any;
    const modelText: string =
      (Array.isArray(aiJson?.content)
        ? aiJson.content
            .filter((b: any) => b?.type === 'text')
            .map((b: any) => b.text)
            .join('\n')
        : '') || '';
    const parsed = parseModelJson(modelText);
    const extracted = sanitize(parsed);

    const { data: inserted, error: insErr } = await service
      .from('contract_extractions')
      .insert({
        firm_id: firmId,
        search_id: searchId,
        document_id: documentId,
        status: 'proposed',
        raw: { model: 'claude-haiku-4-5', text: modelText, parsed: parsed ?? null },
        proposed_dates: extracted.dates,
        proposed_parties: extracted.parties,
        contingencies: extracted.contingencies,
        created_by: me.id,
      })
      .select(
        'id, firm_id, search_id, document_id, status, raw, proposed_dates, proposed_parties, contingencies, created_at'
      )
      .single();
    if (insErr || !inserted) {
      return NextResponse.json(
        { error: insErr?.message || 'Could not stage extraction.' },
        { status: 502 }
      );
    }

    await logAudit({
      firmId,
      searchId,
      actor: { userId: me.id, email: me.email, role: me.role },
      action: 'extraction.proposed',
      entityType: 'contract_extraction',
      entityId: (inserted as any).id,
      summary: `AI proposed ${extracted.dates.length} date(s) from "${docName}"`,
      metadata: {
        document_id: documentId,
        date_count: extracted.dates.length,
        party_count: extracted.parties.length,
        contingency_count: extracted.contingencies.length,
      },
    });

    return NextResponse.json({ extraction: inserted, fallback: false });
  } catch (err: any) {
    console.error('[ai/contract-extract] ', err);
    return NextResponse.json(
      { error: err?.message || 'Unexpected error extracting contract dates.' },
      { status: 500 }
    );
  }
}
