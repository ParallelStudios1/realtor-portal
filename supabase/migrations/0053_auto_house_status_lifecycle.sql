-- Auto-advance a house's status as the deal progresses, on BOTH platforms
-- (it's at the DB level, so web and mobile both get it for free).

create or replace function public._house_status_on_tour_request()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.house_id is not null then
    update public.houses set status = 'tour_requested'
    where id = new.house_id and status = 'interested';
  end if;
  return new;
end;
$$;
drop trigger if exists tour_request_sets_house_status on public.tour_requests;
create trigger tour_request_sets_house_status
  after insert on public.tour_requests
  for each row execute function public._house_status_on_tour_request();

create or replace function public._house_status_on_tour_confirm()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'confirmed' and (old.status is distinct from new.status)
     and new.house_id is not null then
    update public.houses set status = 'toured'
    where id = new.house_id and status in ('interested','tour_requested');
  end if;
  return new;
end;
$$;
drop trigger if exists tour_confirm_sets_house_status on public.tour_requests;
create trigger tour_confirm_sets_house_status
  after update of status on public.tour_requests
  for each row execute function public._house_status_on_tour_confirm();

create or replace function public._house_status_on_phase()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.phase = 'offer_made' and (old.phase is distinct from new.phase)
     and new.offer_house_id is not null then
    update public.houses set status = 'offered' where id = new.offer_house_id;
  end if;
  return new;
end;
$$;
drop trigger if exists phase_sets_house_status on public.client_searches;
create trigger phase_sets_house_status
  after update of phase on public.client_searches
  for each row execute function public._house_status_on_phase();
