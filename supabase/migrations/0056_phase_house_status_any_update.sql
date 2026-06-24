-- Fire the "deal reached offer_made -> mark agreed house offered" trigger on
-- ANY update, not just an explicit phase-column update. When the phase is
-- auto-advanced by the BEFORE trigger (e.g. on an offer_amount update), an
-- "UPDATE OF phase" trigger would not see the change; AFTER UPDATE does.
drop trigger if exists phase_sets_house_status on public.client_searches;
create trigger phase_sets_house_status
  after update on public.client_searches
  for each row execute function public._house_status_on_phase();
