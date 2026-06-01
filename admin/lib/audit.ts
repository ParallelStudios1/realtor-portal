import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';

/**
 * Central, append-only audit logging.
 *
 * Every compliance-relevant mutation should call logAudit() right after the
 * mutation succeeds. Writes go through the service-role client because the
 * audit_log table (migration 0035) has RLS that blocks non-service-role
 * inserts and a trigger that blocks UPDATE/DELETE — so the trail is
 * append-only and tamper-evident in practice.
 *
 * logAudit never throws: audit failures must not break the primary action.
 */
export type AuditActor = {
  userId?: string | null;
  email?: string | null;
  role?: string | null;
};

export async function logAudit(params: {
  firmId?: string | null;
  searchId?: string | null;
  actor?: AuditActor | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  summary?: string | null;
  metadata?: Record<string, any>;
  ip?: string | null;
}): Promise<void> {
  try {
    const service = getSupabaseServiceRoleClient();
    await service.from('audit_log').insert({
      firm_id: params.firmId ?? null,
      search_id: params.searchId ?? null,
      actor_user_id: params.actor?.userId ?? null,
      actor_email: params.actor?.email ?? null,
      actor_role: params.actor?.role ?? null,
      action: params.action,
      entity_type: params.entityType ?? null,
      entity_id: params.entityId ?? null,
      summary: params.summary ?? null,
      metadata: params.metadata ?? {},
      ip: params.ip ?? null,
    });
  } catch (err) {
    console.error('[logAudit] failed', err);
  }
}
