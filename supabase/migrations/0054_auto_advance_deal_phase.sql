-- Auto-advance the deal phase FORWARD when the data that defines a phase is
-- first entered. Only fires when a field newly becomes meaningful and never
-- moves a deal backward. Works on web and mobile (DB level).
create or replace function public._phase_ord(p public.deal_phase)
returns int language sql immutable as $$
  select case p
    when 'searching' then 0
    when 'awaiting_offer' then 1
    when 'offer_made' then 2
    when 'counter_offer' then 3
    when 'under_contract' then 4
    when 'closing' then 5
    when 'closed' then 6
  end;
$$;

create or replace function public._auto_advance_phase()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.offer_house_id is not null and old.offer_house_id is null
     and _phase_ord(new.phase) < _phase_ord('awaiting_offer') then
    new.phase := 'awaiting_offer';
  end if;
  if coalesce(new.offer_amount,0) > 0 and coalesce(old.offer_amount,0) = 0
     and _phase_ord(new.phase) < _phase_ord('offer_made') then
    new.phase := 'offer_made';
  end if;
  if coalesce(new.counter_offer_amount,0) > 0 and coalesce(old.counter_offer_amount,0) = 0
     and _phase_ord(new.phase) < _phase_ord('counter_offer') then
    new.phase := 'counter_offer';
  end if;
  if new.closing_date is not null and coalesce(new.closing_amount,0) > 0
     and (old.closing_date is null or coalesce(old.closing_amount,0) = 0)
     and _phase_ord(new.phase) < _phase_ord('closing') then
    new.phase := 'closing';
  end if;
  return new;
end;
$$;

drop trigger if exists auto_advance_phase on public.client_searches;
create trigger auto_advance_phase
  before update on public.client_searches
  for each row execute function public._auto_advance_phase();
