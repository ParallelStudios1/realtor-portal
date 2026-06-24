-- Seller-side automation (mirrors the buyer side, customized for listings).

-- A) An offer comes in on a listing -> deal moves to "Offer received".
create or replace function public._seller_phase_on_offer_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.client_searches set phase = 'offer_made'
    where id = new.search_id and _phase_ord(phase) < _phase_ord('offer_made');
  return new;
end;
$$;
drop trigger if exists listing_offer_advances_phase on public.listing_offers;
create trigger listing_offer_advances_phase
  after insert on public.listing_offers
  for each row execute function public._seller_phase_on_offer_insert();

-- B) Offer accepted -> Under contract (+ listing under contract); countered -> Negotiating.
create or replace function public._seller_phase_on_offer_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'accepted' and old.status is distinct from new.status then
    update public.client_searches set phase = 'under_contract'
      where id = new.search_id and _phase_ord(phase) < _phase_ord('under_contract');
    if new.house_id is not null then
      update public.houses set listing_status = 'under_contract' where id = new.house_id;
    end if;
  elsif new.status = 'countered' and old.status is distinct from new.status then
    update public.client_searches set phase = 'counter_offer'
      where id = new.search_id and _phase_ord(phase) < _phase_ord('counter_offer');
  end if;
  return new;
end;
$$;
drop trigger if exists listing_offer_status_advances_phase on public.listing_offers;
create trigger listing_offer_status_advances_phase
  after update on public.listing_offers
  for each row execute function public._seller_phase_on_offer_status();

-- C) Listing status drives the deal phase.
create or replace function public._seller_phase_on_listing_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare target public.deal_phase;
begin
  if new.listing_status is distinct from old.listing_status and new.search_id is not null then
    if new.listing_status = 'active' then target := 'awaiting_offer';
    elsif new.listing_status = 'under_contract' then target := 'under_contract';
    elsif new.listing_status = 'sold' then target := 'closed';
    else target := null;
    end if;
    if target is not null then
      update public.client_searches set phase = target
        where id = new.search_id and kind = 'seller'
          and _phase_ord(phase) < _phase_ord(target);
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists listing_status_advances_phase on public.houses;
create trigger listing_status_advances_phase
  after update on public.houses
  for each row execute function public._seller_phase_on_listing_status();
