-- Removing a firm member detaches them (firm_id=null, role='client'). The old
-- constraint required every non-super-admin to have a firm, which made that
-- removal violate the CHECK and error out ("remove member" failed). Allow a
-- firm-less 'client' too (an orphaned / removed account). Staff roles still
-- require a firm.
alter table public.users
  drop constraint if exists users_firm_required_for_non_super_admin;
alter table public.users
  add constraint users_firm_required_for_non_super_admin
  check (role in ('super_admin','client') or firm_id is not null);
