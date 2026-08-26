/**
 * Who counts as STAFF — the single app-side answer.
 *
 * This mirrors the database's is_staff_role() exactly (migration 0066):
 * classic staff roles, plus an attorney whose own firm is a law practice.
 * A law-firm attorney runs deals; the staff gates that were written for
 * realtors apply to them one-for-one. An attorney who merely belongs to a
 * BROKERAGE (invited as counsel) is NOT staff — their access stays the
 * scoped participant view.
 *
 * Every action that used to inline
 *   ['realtor','firm_admin','super_admin','owner','manager','agent'].includes(me.role)
 * should call isDealStaff(me) instead, so the two definitions can never
 * drift apart again.
 */

export const CLASSIC_STAFF_ROLES = [
  'realtor',
  'firm_admin',
  'super_admin',
  'owner',
  'manager',
  'agent',
] as const;

export function isDealStaff(
  me: { role?: string | null; firm_type?: string | null } | null | undefined
): boolean {
  if (!me?.role) return false;
  if ((CLASSIC_STAFF_ROLES as readonly string[]).includes(me.role)) return true;
  return me.role === 'attorney' && me.firm_type === 'law_firm';
}
